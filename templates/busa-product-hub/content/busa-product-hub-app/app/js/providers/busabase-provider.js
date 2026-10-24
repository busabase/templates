import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  buildConfigSummary,
  buildSnapshot,
  normalizeCertificateRow,
  normalizeChannelRow,
  normalizeInventoryRow,
  normalizeProductRow,
  normalizeReviewRow,
  reviewToFields,
  statusForVerdict,
} from "../product-hub-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const BROWSED_KEYS = ["products", "channels", "inventory", "review", "certificates"];

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

async function readSettingsRow() {
  const rows = await readPageRows("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    initialCursors.clear();
    const recordCountsPromise = Promise.all(BROWSED_KEYS.map((key) => countRecords(key)));
    // Products are the page; every other Base is a side read. One that is
    // denied or fails leaves its own view empty with a warning instead of
    // failing the whole app.
    const sideFailures = [];
    const side = (key, read, fallback) =>
      read().catch((error) => {
        sideFailures.push({ key, message: error instanceof Error ? error.message : String(error) });
        return fallback;
      });
    const [products, channels, inventory, reviewItems, certificates, settings] = await Promise.all([
      readPageRows("products"),
      side("channels", () => readPageRows("channels"), []),
      side("inventory", () => readPageRows("inventory"), []),
      side("review", () => readPageRows("review"), []),
      side("certificates", () => readPageRows("certificates"), []),
      side("settings", () => readSettingsRow(), {}),
    ]);
    const snapshot = buildSnapshot({ products, channels, inventory, reviewItems, certificates, settings });
    snapshot.warnings = [
      ...(snapshot.warnings || []),
      ...sideFailures.map((failure) => ({
        id: `read-${failure.key}`,
        severity: "warning",
        base: failure.key,
        message: `Could not read ${failure.key}`,
        detail: failure.message,
      })),
    ];
    const recordCounts = await recordCountsPromise;
    return {
      app: "busa-product-hub",
      demo: false,
      data_provider: "busabase",
      pagination: Object.fromEntries(BROWSED_KEYS.map((key) => [key, initialCursors.get(key) || null])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key, index) => [key, recordCounts[index]])),
      onboarding: { completed: products.length > 0, config_version: "1" },
      lock: null,
      config_summary: buildConfigSummary({ settings }),
      snapshot,
    };
  },

  // Human verdict on a review item, written directly onto the item's own
  // Busabase record -- replaces the retired app/server/store.ts's separate
  // app/.data/decisions.json handoff bucket (readDecisions/applyDecision)
  // with a direct field write, matching the busa-legal-contracts/busa-crm
  // precedent. Only the three actions the retired review queue actually
  // exposed as buttons are supported (see product-hub-model.js's DECISION_ACTIONS
  // comment for why "revise" was dropped).
  async decideReview(itemId, action, note = "") {
    if (!itemId) throw new Error("itemId is required");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const existing = await findRecord("review", "item-id", itemId);
    if (!existing) throw new Error(`Unknown review item: ${itemId}`);
    const current = normalizeReviewRow(
      normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
    );
    const now = new Date().toISOString();
    const next = {
      ...current,
      status: statusForVerdict(action, current.status),
      decision_note: String(note || ""),
      decided_at: now,
      updated_at: now,
    };
    const result = await updateRecord(
      existing,
      reviewToFields(next),
      `Decision on review item ${itemId}: ${action}`,
    );
    return {
      ...next,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  // One record named by the URL that is not on the loaded page: read it on
  // its own (records.get by business id) instead of paging until it shows up.
  // Certificates have no business id; theirs is the record id itself.
  async getRecord(key, id) {
    if (!id) return null;
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const idField = { products: "product-id", channels: "channel-id", inventory: "inventory-id", review: "item-id" }[key];
    let record = null;
    if (idField) record = await findRecord(key, idField, id);
    else if (key === "certificates") {
      try {
        record = await runtimeClient.records.get({ recordId: id });
      } catch (error) {
        if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
        throw error;
      }
    }
    if (!record) return null;
    const row = {
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
      __headCommitId: record.headCommitId || record.headCommit?.id,
    };
    const normalize = {
      products: normalizeProductRow,
      channels: normalizeChannelRow,
      inventory: normalizeInventoryRow,
      review: normalizeReviewRow,
      certificates: normalizeCertificateRow,
    }[key];
    return normalize ? normalize(row) : row;
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = {
      products: normalizeProductRow,
      channels: normalizeChannelRow,
      inventory: normalizeInventoryRow,
      review: normalizeReviewRow,
      certificates: normalizeCertificateRow,
    }[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
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
