import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import {
  approvalToFields,
  buildContract,
  buildState,
  contractToFields,
  normalizeApprovalRow,
  normalizeContractRow,
  normalizeObligationRow,
  obligationToFields,
} from "../clm-model.js?v=0.1.0";
import { appConfig } from "../config.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

// Record reads and writes go through the SDK's helpers, bound to this app's client.
// A person's write leaves `autoMerge` unset, so Busabase decides from their own
// permission: it lands now with write access and becomes a ChangeRequest without
// it. The response says which happened; `isAirAppWriteQueued` reads it.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
}

const initialPageCursors = {};
const initialTotalCounts = {};

async function readFirstPage(key) {
  const [{ rows, nextCursor }, total] = await Promise.all([readPage(key), countRecords(key)]);
  initialPageCursors[key] = nextCursor;
  initialTotalCounts[key] = total;
  return rows;
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({ baseId: declared.baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

function normalizePageRows(key, rows) {
  const normalizers = {
    contracts: normalizeContractRow,
    obligations: normalizeObligationRow,
    approvals: normalizeApprovalRow,
  };
  const normalize = normalizers[key];
  return normalize ? rows.map(normalize) : rows;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

async function createRecord(key, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
  const declared = base(key);
  return runtimeClient.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: appConfig.appId,
  });
}

async function updateRecord(existing, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
  });
}

async function readContracts() {
  const rows = await readFirstPage("contracts");
  return rows.map(normalizeContractRow);
}

async function readObligations() {
  const rows = await readFirstPage("obligations");
  return rows.map(normalizeObligationRow);
}

async function readApprovals() {
  const rows = await readFirstPage("approvals");
  return rows.map(normalizeApprovalRow);
}

function withPagination(data) {
  return {
    ...data,
    pagination: { ...initialPageCursors },
    totals: { ...initialTotalCounts },
  };
}

// Sidebar attention numbers as exact server-side counts (records.count with
// provably-exact text filters), so they do not shrink to whatever happens to
// be on the first loaded page. Each value is null when the count is denied or
// fails; the UI then falls back to the loaded rows and marks them partial.
const eq = (fieldSlug, value) => ({ fieldSlug, operator: "equals", value });
const present = (fieldSlug) => ({ fieldSlug, operator: "not_empty" });
const absent = (fieldSlug) => ({ fieldSlug, operator: "is_empty" });
const sum = (...values) => (values.some((value) => value == null) ? null : values.reduce((a, b) => a + b, 0));

async function readAttentionCounts() {
  const [approvals, atRisk, blocked, withNotice, renewalOnly, highRisk] = await Promise.all([
    countRecords("approvals", [eq("status", "needs_review")]),
    countRecords("obligations", [eq("status", "at_risk")]),
    countRecords("obligations", [eq("status", "blocked")]),
    countRecords("contracts", [present("notice-deadline")]),
    countRecords("contracts", [present("renewal-date"), absent("notice-deadline")]),
    countRecords("contracts", [eq("risk", "high")]),
  ]);
  return {
    approvals,
    risks: sum(atRisk, blocked),
    renewals: sum(withNotice, renewalOnly),
    high_risk: highRisk,
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    for (const key of Object.keys(initialPageCursors)) delete initialPageCursors[key];
    for (const key of Object.keys(initialTotalCounts)) delete initialTotalCounts[key];
    await ensureResources();
    const [contracts, obligations, approvals, attention] = await Promise.all([
      readContracts(),
      readObligations(),
      readApprovals(),
      readAttentionCounts(),
    ]);
    return withPagination({
      ...buildState(contracts, obligations, approvals, {
        app: "busa-clm",
        demo: false,
        profile: { company: "", boundary: "Local handoff only" },
      }),
      attention,
      data_provider: "busabase",
      onboarding: { completed: contracts.length > 0 || obligations.length > 0, config_version: "1" },
    });
  },

  // Direct create: the operator saves a new contract straight into Busabase --
  // this is a direct-manipulation control panel, not a review/approval
  // queue. Ported from the retired local app's implicit "populate the local
  // app snapshot" workflow (there was never a create UI in the retired
  // local app -- this is the CRUD counterpart the Busabase-only shape adds).
  async createContract(input) {
    await ensureResources();
    const contract = buildContract(input);
    const result = await createRecord(
      "contracts",
      contractToFields(contract),
      `Create contract ${contract.name || contract.id}`,
    );
    return {
      ...contract,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // Direct update: edit an existing contract's fields.
  async updateContract(id, input) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("contracts", "contract-id", id);
    if (!existing) throw new Error(`Unknown contract id: ${id}`);
    const current = normalizeContractRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = buildContract({ ...current, ...input, id, created_at: current.created_at });
    const result = await updateRecord(existing, contractToFields(next), `Update contract ${next.name || next.id}`);
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // Direct write: mark (or reopen) an obligation straight onto its own
  // Busabase record -- no separate handoff-log bucket. Ported from the
  // retired app's obligation status field, which the retired local app only
  // ever set through demo/seed data (there was no obligation-status write
  // path in the retired Hono API).
  async markObligationDone(id, done = true) {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("obligations", "obligation-id", id);
    if (!existing) throw new Error(`Unknown obligation id: ${id}`);
    const current = normalizeObligationRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = { ...current, status: done ? "done" : "open", updated_at: new Date().toISOString() };
    const result = await updateRecord(
      existing,
      obligationToFields(next),
      `${done ? "Complete" : "Reopen"} obligation ${next.title || next.id}`,
    );
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // Direct write: acknowledge a contract's renewal/notice deadline straight
  // onto the contract's own record (notice_acknowledged_at). New field --
  // the retired local app had no renewal-acknowledgement write path at all.
  async acknowledgeRenewal(contractId) {
    if (!contractId) throw new Error("contractId is required");
    await ensureResources();
    const existing = await findRecord("contracts", "contract-id", contractId);
    if (!existing) throw new Error(`Unknown contract id: ${contractId}`);
    const current = normalizeContractRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = { ...current, notice_acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const result = await updateRecord(
      existing,
      contractToFields(next),
      `Acknowledge renewal notice for ${next.name || next.id}`,
    );
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // Direct write: record the operator's approval decision straight onto the
  // approval's own Busabase record -- replaces the retired local app's
  // separate app/.data/decisions.json handoff bucket (readDecisions/
  // saveDecision in the retired app/server/store.ts) with a direct field
  // write, matching kelly-revshare-simulator's saveDecision() precedent.
  async saveApprovalDecision(id, action, note = "") {
    if (!id) throw new Error("id is required");
    await ensureResources();
    const existing = await findRecord("approvals", "approval-id", id);
    if (!existing) throw new Error(`Unknown approval id: ${id}`);
    const current = normalizeApprovalRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const status = { approve: "approved", changes: "changes_requested", block: "blocked" }[action] || action;
    const next = {
      ...current,
      status,
      decision_note: note || "",
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = await updateRecord(existing, approvalToFields(next), `Record decision for ${next.title || next.id}`);
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // A record named by the URL but not on the loaded page: read that one record
  // (records.get by its business id) instead of paging until it turns up.
  async getRecord(key, id) {
    if (!id || !allowedReads.has("records.get")) return null;
    await ensureResources();
    const idField = { contracts: "contract-id", obligations: "obligation-id", approvals: "approval-id" }[key];
    if (!idField) return null;
    const existing = await findRecord(key, idField, id);
    if (!existing) return null;
    const [row] = normalizePageRows(key, [
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    ]);
    return row || null;
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    return { ...page, rows: normalizePageRows(key, page.rows) };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
