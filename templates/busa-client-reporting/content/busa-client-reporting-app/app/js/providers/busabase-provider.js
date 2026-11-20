import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, NORMALIZE_ROW_BY_KEY } from "../reporting-model.js?v=0.1.0";

// READ-ONLY provider (v1): this app never writes. It reads one bounded page
// per Base for the first paint, exposes each Base's nextCursor for an
// explicit Load More, and counts totals with records.count. There is no
// applyDecision here on purpose — edits happen in the Bases themselves or
// through the skill, never from the client-facing report desk. Production
// never falls back to demo data: a failed read surfaces as an error.

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);

const BASE_KEYS = ["clients", "projects", "deliverables", "metrics", "milestones", "reports"];

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
// Rows loaded so far, per Base — Load More appends page by page.
const loadedRows = Object.fromEntries(BASE_KEYS.map((key) => [key, []]));

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

// Record reads go through the SDK's helpers, bound to this app's client.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

// One page per call, cursor returned to the caller — never several pages in
// one function call. getState() reads page 1 of each Base; every further
// page is a visible "Load more" click in the UI, one request each.
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

async function countRecords(key) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({ baseId: declared.baseId });
    return total;
  } catch {
    return null;
  }
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const pages = await Promise.all(BASE_KEYS.map((key) => readPage(key)));
    const totalsList = await Promise.all(BASE_KEYS.map((key) => countRecords(key)));
    const raw = {};
    const pagination = {};
    const totals = {};
    BASE_KEYS.forEach((key, index) => {
      loadedRows[key] = pages[index].rows;
      raw[key] = pages[index].rows;
      pagination[key] = pages[index].nextCursor;
      totals[key] = totalsList[index];
    });
    return {
      app: "busa-client-reporting",
      data_provider: "busabase",
      pagination,
      totals,
      lock: null,
      snapshot: buildSnapshot(raw),
    };
  },

  // The next page of one Base after `cursor`: one request, called once per
  // Load More click. Returns the rebuilt snapshot over everything loaded.
  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    const seen = new Set((loadedRows[key] || []).map((row) => row.__recordId));
    loadedRows[key] = [...(loadedRows[key] || []), ...page.rows.filter((row) => !seen.has(row.__recordId))];
    const raw = Object.fromEntries(BASE_KEYS.map((k) => [k, loadedRows[k] || []]));
    return { rows: page.rows.map((row) => (normalize ? normalize(row) : row)), nextCursor: page.nextCursor, snapshot: buildSnapshot(raw) };
  },

  // A record named by the URL that is not on a loaded page — read on its own
  // by its primary text field, never by loading more pages to find it.
  async getRecord(key, recordId) {
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const loaded = (loadedRows[key] || []).find((row) => row.__recordId === recordId);
    if (loaded) return loaded;
    const primarySlug = { reports: "report-title", clients: "client-name", projects: "project-name" }[key];
    if (!primarySlug) return null;
    const declared = base(key);
    const record = await sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: primarySlug, valueText: recordId });
    if (!record) return null;
    return {
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
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
