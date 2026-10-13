import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, NORMALIZE_ROW_BY_KEY } from "../money-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const BROWSED_KEYS = ["accounts", "transactions", "invoices"];
// invoice-matches is not browsed on its own, but its cursor tells the UI
// whether a missing match means "unmatched" or merely "not on the loaded page".
const CURSOR_KEYS = [...BROWSED_KEYS, "invoice-matches"];
// The business-id field each Base is addressed by in the URL.
const ID_FIELD_SLUG = {
  accounts: "account-id",
  transactions: "transaction-id",
  invoices: "invoice-id",
  "invoice-matches": "match-id",
};

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

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

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  return { rows: records.map(recordToRow), nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

function recordToRow(record) {
  return {
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  };
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

async function readSettingsRows() {
  const rows = await readPageRows("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    initialCursors.clear();
    const recordCountsPromise = Promise.all(BROWSED_KEYS.map((key) => countRecords(key)));
    // Side reads (matches, settings) degrade on their own: a denied or failed
    // read there must not blank the ledger. The UI reports what is missing.
    const sideErrors = {};
    const side = (key, promise, fallback) =>
      promise.catch((error) => {
        sideErrors[key] = error instanceof Error ? error.message : String(error);
        return fallback;
      });
    const [accounts, transactions, invoices, invoiceMatches, settings] = await Promise.all([
      readPageRows("accounts"),
      readPageRows("transactions"),
      readPageRows("invoices"),
      side("invoice-matches", readPageRows("invoice-matches"), []),
      side("settings", readSettingsRows(), new Map()),
    ]);
    const snapshot = buildSnapshot({ accounts, transactions, invoices, invoiceMatches });
    const configRow = settings.get("busa-money-accounts") || {};
    const lockRow = settings.get("busa-money-lock") || {};
    const configuredAccounts = parsePayload(configRow.payload).accounts || [];
    const recordCounts = await recordCountsPromise;
    return {
      app: "busa-money",
      demo: false,
      data_provider: "busabase",
      pagination: Object.fromEntries(CURSOR_KEYS.map((key) => [key, initialCursors.get(key) || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, recordCounts[index]])),
      onboarding: { completed: Boolean(configRow.record_id), config_version: "1" },
      config_summary: {
        config_path: "busabase:base/busa-money-settings",
        is_example: false,
        accounts: configuredAccounts,
      },
      side_errors: sideErrors,
      locked: Boolean(lockRow.locked),
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      snapshot,
    };
  },

  // One more page for Load more — exactly one request per click.
  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
  },

  // A record named by the URL (or a match for one) that is not on the loaded
  // page: one records.get by exact field value, never "load pages until found".
  async getRecord(key, value, fieldSlug = ID_FIELD_SLUG[key]) {
    if (!allowedReads.has("records.get") || !fieldSlug || !value) return null;
    await ensureResources();
    let record;
    try {
      record = await runtimeClient.records.get({ baseId: base(key).baseId, fieldSlug, valueText: String(value) });
    } catch (error) {
      if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
      throw error;
    }
    if (!record) return null;
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    const row = recordToRow(record);
    return normalize ? normalize(row) : row;
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
