import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  applyContractDecision,
  baseContractFields,
  buildConfigSummary,
  buildSnapshot,
  normalizeContractRow,
} from "../portfolio-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const BROWSED_KEYS = ["contracts"];

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

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

const initialCursors = new Map();

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

async function readPageRows(key) {
  const page = await readPage(key);
  initialCursors.set(key, page.nextCursor);
  return page.rows;
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({
      baseId: base(key).baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

// Every contract a human can flag/annotate already exists (contracts enter
// Busabase through an external portfolio-sync process — the app itself never
// creates a contract record), so decideContract only ever updates an
// existing record. bases.createChangeRequest stays declared in permissions
// for parity with the rest of this migration batch, but this provider never
// calls it.
async function updateContractRecord(existing, contract, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(baseContractFields(contract)),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
  });
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

async function loadContractRecord(contractId) {
  const existing = await findRecord("contracts", "contract-id", contractId);
  if (!existing) throw new Error(`Unknown contract id: ${contractId}`);
  const current = normalizeContractRow(
    normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
  );
  return { existing, current };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    initialCursors.clear();
    const recordCountsPromise = Promise.all(BROWSED_KEYS.map((key) => countRecords(key)));
    // The Settings row only tunes thresholds and labels. A denied or failed
    // read of it must not blank the whole dashboard: fall back to the default
    // risk policy and say so in Help & Settings.
    let settingsError = "";
    const [contractRows, settingsRows] = await Promise.all([
      readPageRows("contracts"),
      readPageRows("settings").catch((error) => {
        settingsError = error instanceof Error ? error.message : String(error);
        return [];
      }),
    ]);
    const configRow = findSettingsRow(settingsRows, "config");
    const config_summary = buildConfigSummary(parsePayload(configRow?.payload));
    const contracts = contractRows.map(normalizeContractRow);
    const snapshot = buildSnapshot({ contracts, configSummary: config_summary });
    const recordCounts = await recordCountsPromise;
    return {
      app: "busa-portfolio-health",
      demo: false,
      data_provider: "busabase",
      pagination: Object.fromEntries(BROWSED_KEYS.map((key) => [key, initialCursors.get(key) || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, recordCounts[index]])),
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      settings_error: settingsError,
      lock: null,
      config_summary,
      snapshot,
    };
  },

  // Human "flag for review" / "clear flag" / note action, written directly
  // onto the contract's own Busabase record. Ported from the retired
  // LocalFileProvider's setDecision() method (the default local-file data
  // provider) — no separate decisions.json bucket in the Busabase-only shape.
  async decideContract(contractId, patch = {}) {
    if (!contractId) throw new Error("contractId is required");
    await ensureResources();
    const { existing, current } = await loadContractRecord(contractId);
    const now = new Date().toISOString();
    const next = applyContractDecision(current, patch, now);
    const result = await updateContractRecord(existing, next, `Update review decision for ${contractId}`);
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // A contract named by the URL (`?peek=` / `/<id>`) that is not on a loaded
  // page is read on its own — never by loading more pages to find it.
  async getContract(contractId) {
    if (!contractId) return null;
    await ensureResources();
    if (!allowedReads.has("records.get")) return null;
    const existing = await findRecord("contracts", "contract-id", contractId);
    if (!existing) return null;
    return normalizeContractRow({
      ...normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
      __recordId: existing.id,
      __headCommitId: existing.headCommitId || existing.headCommit?.id,
    });
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    return { ...page, rows: key === "contracts" ? page.rows.map(normalizeContractRow) : page.rows };
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
