import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { buildSnapshot, statusForAction } from "../campaigns-model.js?v=0.1.0";
import { appConfig } from "../config.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

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
let currentPageContext = {};

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
  const snapshotKey = key.replaceAll("-", "_");
  currentPageContext = { ...currentPageContext, [snapshotKey]: rows };
  const snapshot = buildSnapshot(currentPageContext);
  return snapshot[snapshotKey] || rows;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const { response } = await sdkRecords().upsert({
    baseId: declared.baseId,
    fieldSlug: idFieldSlug,
    valueText: idValue,
    fields: toBusabaseFields(fields),
    message,
  });
  return response;
}

async function readSettingsRows() {
  const rows = await readFirstPage("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

// Side reads (segment names, the suppression list, the profile row) must not
// take the send queue down with them: a denied or failed read is reported for
// that one surface and the rest of the desk still renders.
async function readSide(read, fallback, key, readErrors) {
  try {
    return await read();
  } catch (error) {
    readErrors[key] = error instanceof Error ? error.message : String(error);
    return fallback;
  }
}

// Exact per-status totals for the review queue — one cheap records.count per
// status (text equals stays a SQL COUNT), so the attention block and the
// status filter do not depend on which page of sends is loaded.
const SEND_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
async function countSendStatuses() {
  const entries = await Promise.all(
    SEND_STATUSES.map(async (status) => [
      status,
      await countRecords("sends", [{ fieldSlug: "status", operator: "equals", value: status }]),
    ]),
  );
  return entries.some(([, value]) => value == null) ? null : Object.fromEntries(entries);
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
    const readErrors = {};
    const [segments, sends, suppressionRows, settings, statusCounts] = await Promise.all([
      readSide(() => readFirstPage("segments"), [], "segments", readErrors),
      readFirstPage("sends"),
      readSide(() => readFirstPage("suppression"), [], "suppression", readErrors),
      readSide(() => readSettingsRows(), new Map(), "settings", readErrors),
      countSendStatuses(),
    ]);
    currentPageContext = { segments, sends, suppression: suppressionRows };
    const snapshot = buildSnapshot(currentPageContext);
    const profileRow = settings.get("busa-campaigns-profile") || {};
    const lockRow = settings.get("busa-campaigns-lock") || {};
    const profile = parsePayload(profileRow.payload);
    if (profile.list_health) snapshot.list_health = { ...snapshot.list_health, ...profile.list_health };
    return withPagination({
      app: "busa-campaigns",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(profileRow.record_id), config_version: "1" },
      config_summary: {
        config_path: "busabase:base/busa-campaigns-settings",
        is_example: false,
        operator: profile.operator || {},
        brand: profile.brand || {},
        esp: profile.esp || {},
        from_identities: profile.from_identities || [],
        segments: snapshot.segments.map((segment) => ({
          segment_id: segment.segment_id,
          name: segment.name,
          description: segment.description,
        })),
        sending_policy: profile.sending_policy || {},
        style_tone: profile.style_tone || "",
      },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      decisions: {},
      read_errors: readErrors,
      status_counts: statusCounts,
      suppression: { updated_at: new Date().toISOString(), entries: suppressionRows },
      snapshot,
    });
  },

  async applyDecision(sendId, payload = {}) {
    const action = String(payload.action || "");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const existing = await findRecord("sends", "send-id", sendId);
    if (!existing) throw new Error("not_found");
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...current,
      send_id: sendId,
      status: statusForAction(action),
      decision_note: String(payload.comment || ""),
      decided_at: now,
      ...(payload.body !== undefined ? { body: String(payload.body) } : {}),
      ...(payload.chosen_variant !== undefined ? { chosen_variant: String(payload.chosen_variant) } : {}),
    };
    const result = await upsert("sends", "send-id", sendId, fields, `Decision on send ${sendId}: ${action}`);
    return { ok: true, pending: isAirAppWriteQueued(result), change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "" };
  },

  // A record named by the URL but not on the loaded page: one records.get by
  // its business id, never a walk through pages to find it.
  async getRecord(key, id) {
    await ensureResources();
    const idSlug = key === "suppression" ? "entry-id" : "send-id";
    const record = await findRecord(key, idSlug, id);
    if (!record) return null;
    const row = {
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
      __headCommitId: record.headCommitId || record.headCommit?.id,
    };
    if (key !== "sends") return row;
    return buildSnapshot({ ...currentPageContext, sends: [row] }).sends[0] || null;
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
