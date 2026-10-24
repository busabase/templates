import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot } from "../followups-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const FOLLOWUP_ACTIONS = new Set(["create", "done"]);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

// The viewer's calendar day, not UTC's: "due today" must flip at local
// midnight, and `toISOString()` alone would flip at 08:00 in UTC+8.
const localTodayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

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
    const names = resources.missing.map((base) => base.name).join("、");
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

// One page per call, cursor returned to the caller -- never several pages in
// one function call. getState() reads page 1; every further page is a visible
// "Load more" click in the UI (app.js#loadMore), one request each. Totals the
// Overview shows come from records.count, never from draining pages.
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

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({
      baseId: declared.baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

async function findRecord(key, idFieldSlug, idValue) {
  if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");
  const { response } = await sdkRecords().upsert({
    baseId: declared.baseId,
    fieldSlug: idFieldSlug,
    valueText: idValue,
    fields: toBusabaseFields(fields),
    message,
  });
  return response;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const { rows, nextCursor } = await readPage("followups");
    const todayIso = localTodayIso();
    const snapshot = buildSnapshot({ followups: rows }, todayIso);
    // Exact totals for the Overview band. Either may be denied or fail on its
    // own; that hides its number ("—"), it never fails the page.
    const [total, done] = await Promise.all([
      countRecords("followups"),
      countRecords("followups", [{ fieldSlug: "status", operator: "equals", value: "done" }]),
    ]);
    snapshot.totals = { total, done };
    return {
      app: "busa-followups",
      data_provider: "busabase",
      pagination: { followups: nextCursor },
      lock: null,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  },

  // The next page after `cursor`: one request, called once per Load more click.
  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  // A record named by the URL that is not on a loaded page — read on its own
  // by its business id, never by loading more pages to find it.
  async getRecord(key, recordId) {
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const record = await findRecord(key, "record-id", recordId);
    if (!record) return null;
    return {
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
    };
  },

  async applyDecision(payload = {}) {
    const action = String(payload.action || "");
    if (!FOLLOWUP_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const now = new Date().toISOString();

    if (action === "create") {
      const recordId = String(payload.record_id || `fu-${Date.now()}`);
      const result = await upsert(
        "followups",
        "record-id",
        recordId,
        {
          record_id: recordId,
          meeting: String(payload.meeting || ""),
          person: String(payload.person || ""),
          action: String(payload.action_text || ""),
          due: String(payload.due || ""),
          status: "pending",
          created_at: now,
        },
        `Created followup ${recordId}`,
      );
      return {
        updated_at: now,
        pending: isAirAppWriteQueued(result),
        change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
      };
    }

    const recordId = String(payload.record_id || "");
    if (!recordId) throw new Error("record_id is required");
    const result = await upsert(
      "followups",
      "record-id",
      recordId,
      { record_id: recordId, status: "done" },
      `Marked ${recordId} done`,
    );
    return {
      updated_at: now,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
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
