import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { NORMALIZERS, decideFix } from "../shelf-model.js?v=0.1.0";

// Runtime binding: Bases are resolved by the resourceKey stamped at install
// time (inspectProvisionedResources), never by a pinned id and never by
// listing the workspace for a matching name.
const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const BROWSED_KEYS = ["questions", "observations", "competitors", "fixes"];

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

const toRow = (key, record) =>
  NORMALIZERS[key]({
    ...(record.headCommit?.payload || record.headCommit?.fields || record.fields || {}),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  });

const errorText = (error) => (error instanceof Error ? error.message : String(error));

// One bounded page per call (the Base's readLimit, ≤ 50). Callers never loop
// on nextCursor; the UI fetches the next page only on an explicit Load more.
async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => toRow(key, record));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

// Exact server-side total for the "x of y loaded" labels; null hides it.
async function countRecords(key) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId });
    return total;
  } catch {
    return null;
  }
}

export const busabaseProvider = {
  kind: "busabase",

  // One bounded page per Base. A read that fails for one Base (denied, gone)
  // is reported for that Base only — it must not blank the whole app.
  async getState() {
    await ensureResources();
    const settle = (promise) => promise.then((value) => ({ value }), (error) => ({ error: errorText(error) }));
    const [pages, totals, settingsPage] = await Promise.all([
      Promise.all(BROWSED_KEYS.map((key) => settle(readPage(key)))),
      Promise.all(BROWSED_KEYS.map((key) => countRecords(key))),
      settle(readPage("settings")),
    ]);
    const errors = Object.fromEntries(
      [...BROWSED_KEYS.map((key, index) => [key, pages[index].error]), ["settings", settingsPage.error]].filter(
        ([, error]) => error,
      ),
    );
    // Nothing readable at all is an app-level failure, not five empty lists.
    if (Object.keys(errors).length === BROWSED_KEYS.length + 1) throw new Error(errors[BROWSED_KEYS[0]]);
    return {
      demo: false,
      data_provider: "busabase",
      rows: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, pages[index].value?.rows || []])),
      cursors: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, pages[index].value?.nextCursor || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, totals[index]])),
      errors,
      settings: settingsPage.value?.rows[0] || null,
      loaded_at: new Date().toISOString(),
    };
  },

  // A record named by the URL but not on the loaded page: one records.get by
  // id, checked to belong to this Base — never a scan through pages for it.
  async getRecord(key, recordId) {
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const declared = base(key);
    const record = await runtimeClient.records.get({ recordId });
    if (!record || (record.baseId && record.baseId !== declared.baseId)) return null;
    return toRow(key, record);
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  // The app's only write: a person's decision on one fix. It updates `status`
  // and `decision-note` on that fix's own record through a ChangeRequest,
  // based on the commit the person was looking at. autoMerge is omitted: the
  // workspace's permissions decide whether it lands now or waits for review,
  // and the caller reports whichever happened.
  async decideFix(fix, action, note) {
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    const fields = decideFix(fix, action, note);
    await ensureResources();
    const result = await runtimeClient.records.changeRequest({
      recordId: fix.id,
      operation: "update",
      fields,
      message: `Listing fix decision: ${action} — ${fix.title}`,
      author: appConfig.appId,
      ...(fix.head_commit_id ? { baseCommitId: fix.head_commit_id } : {}),
    });
    if (result?.materialized === true) return { outcome: "merged", changeRequestId: "" };
    return { outcome: result?.status === "merged" ? "merged" : "pending", changeRequestId: result?.id || "" };
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
