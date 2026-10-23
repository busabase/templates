import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  STAGES,
  applyNote,
  applyStageMove,
  baseLeadFields,
  buildConfigSummary,
  buildSnapshot,
  normalizeLeadRow,
} from "../lead-funnel-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

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
let currentCriteria = {};

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

// `filters` are pushed down as a best-effort superset; the app narrows the
// rows again on the client, so an unhonoured filter can only over-fetch.
async function readPage(key, cursor, filters) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
    ...(filters?.length ? { filters } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
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

const stageFilter = (stage) => (stage ? [{ fieldSlug: "stage", operator: "equals", value: stage }] : undefined);

// Exact per-stage counts: one records.count per stage (a fixed five, cheap
// text-equals COUNTs) instead of tallying whichever page happens to be loaded.
// `stage` is a text field, so records.groupBy (select/checkbox only) cannot
// bucket it. A denied or failed count is `null` — the UI then labels its
// numbers as covering the loaded page only.
async function countStages() {
  const [total, ...perStage] = await Promise.all([
    countRecords("leads"),
    ...STAGES.map((stage) => countRecords("leads", stageFilter(stage))),
  ]);
  const by_stage = Object.fromEntries(STAGES.map((stage, index) => [stage, perStage[index]]));
  return { total, by_stage: perStage.every((value) => value != null) ? by_stage : null };
}

function normalizePageRows(key, rows) {
  if (key !== "leads") return rows;
  return buildSnapshot({ leads: rows.map(normalizeLeadRow), criteria: currentCriteria }).leads;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

// A person's write from this app leaves `autoMerge` unset, so Busabase decides
// from that person's own permission: with write access the change lands now;
// without it the same change becomes a ChangeRequest for someone who has it.
// The response says which happened (`materialized: false` is the queued one),
// and the caller reports it rather than assuming either.
const isQueued = (result) => result?.materialized === false || result?.status === "in_review";

// Every lead a human can act on already exists (leads enter the pipeline
// through Busabase directly, e.g. an upstream sourcing process — the app
// itself never creates a lead record), so moveStage/addNote only ever
// update an existing record. bases.createChangeRequest stays declared in
// permissions for parity with the rest of this migration batch, but this
// provider never calls it.
async function updateLeadRecord(existing, lead, message) {
  if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
  const result = await runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: toBusabaseFields(baseLeadFields(lead)),
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
  });
  // A queued ChangeRequest leaves the board unchanged until someone with write
  // access approves it — the UI says so instead of looking like nothing happened.
  return { lead, pending: isQueued(result), change_request_id: isQueued(result) ? result?.id || "" : "" };
}

function findSettingsRow(rows = [], kind = "") {
  return rows.find((row) => row.kind === kind) || null;
}

function withPagination(data) {
  return {
    ...data,
    pagination: { ...initialPageCursors },
    totals: { ...initialTotalCounts },
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    for (const key of Object.keys(initialPageCursors)) delete initialPageCursors[key];
    for (const key of Object.keys(initialTotalCounts)) delete initialTotalCounts[key];
    await ensureResources();
    // The settings row only tunes scoring; a denied or failed settings read
    // falls back to the default criteria instead of failing the whole board.
    const [leadRows, settingsRows, counts] = await Promise.all([
      readFirstPage("leads"),
      readFirstPage("settings").catch(() => []),
      countStages(),
    ]);
    const configRow = findSettingsRow(settingsRows, "config");
    const config_summary = buildConfigSummary(parsePayload(configRow?.payload));
    currentCriteria = config_summary.scoring_criteria;
    const leads = leadRows.map(normalizeLeadRow);
    const snapshot = buildSnapshot({ leads, criteria: config_summary.scoring_criteria });
    return withPagination({
      app: "busa-lead-funnel",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(configRow), config_version: "1" },
      lock: null,
      config_summary,
      leads: snapshot.leads,
      summary: snapshot.summary,
      counts,
    });
  },

  // One lead by its business id (records.get), for a drawer/page URL naming a
  // lead that is not on the loaded page.
  async getRecord(key, id) {
    if (key !== "leads" || !id) return null;
    await ensureResources();
    if (!allowedReads.has("records.get")) return null;
    const existing = await findRecord("leads", "lead-id", id);
    if (!existing) return null;
    const row = {
      ...normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
      __recordId: existing.id,
      __headCommitId: existing.headCommitId || existing.headCommit?.id,
    };
    return normalizePageRows("leads", [row])[0] || null;
  },

  // Direct kanban write: move a lead's stage (or reject it with a required
  // reason), written straight onto the lead's own Busabase record. Ported
  // from LocalFileProvider.moveStage() — no separate decisions/handoff-log
  // bucket in the Busabase-only shape.
  async moveStage(id, stage, reason = "") {
    if (!id) throw new Error("id is required");
    if (!STAGES.includes(stage)) throw new Error(`stage must be one of ${STAGES.join("|")}`);
    if (stage === "rejected" && !reason) throw new Error("reason is required to move a lead to rejected");
    await ensureResources();
    const existing = await findRecord("leads", "lead-id", id);
    if (!existing) throw new Error(`Unknown lead id: ${id}`);
    const current = normalizeLeadRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = applyStageMove(current, stage, reason);
    return updateLeadRecord(existing, next, `Move ${id} to ${stage}`);
  },

  // Direct kanban write: append a note. Ported from LocalFileProvider.addNote().
  async addNote(id, text, author = "operator") {
    if (!id) throw new Error("id is required");
    if (!text || !String(text).trim()) throw new Error("text is required");
    await ensureResources();
    const existing = await findRecord("leads", "lead-id", id);
    if (!existing) throw new Error(`Unknown lead id: ${id}`);
    const current = normalizeLeadRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const next = applyNote(current, String(text).trim(), author);
    return updateLeadRecord(existing, next, `Add note to ${id}`);
  },

  // One page per user action (Prev/Next or picking a stage filter).
  async fetchPage(key, cursor, { stage = "" } = {}) {
    await ensureResources();
    const page = await readPage(key, cursor, key === "leads" ? stageFilter(stage) : undefined);
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
