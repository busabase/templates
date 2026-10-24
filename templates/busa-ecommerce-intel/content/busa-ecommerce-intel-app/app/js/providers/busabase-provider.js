import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_KINDS,
  DRAFT_ACTIONS,
  REVIEW_ACTIONS,
  buildSnapshot,
  normalizeAction,
  normalizeDraft,
  normalizeSignal,
  normalizeSource,
  parseBatchMeta,
  statusForAction,
} from "../ecommerce-model.js?v=0.1.0";

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

// A side read (sources, batch metadata) that is denied or fails must not take
// the whole cockpit down with it: the review queue is still usable without it.
async function optional(promise, fallback, warnings, label) {
  try {
    return await promise;
  } catch (error) {
    warnings.push({ severity: "warning", message: label, detail: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

const ID_FIELD_SLUG = { signals: "signal-id", actions: "action-id", drafts: "draft-id", sources: "source-id" };
const NORMALIZE_BY_KEY = {
  signals: normalizeSignal,
  actions: normalizeAction,
  drafts: normalizeDraft,
  sources: normalizeSource,
};

async function readBatchMeta() {
  const { rows } = await readPage("settings");
  const row = rows.find((item) => item.kind === "batch");
  return parseBatchMeta(row?.payload || "");
}

async function requireRecord(key, idFieldSlug, id, label) {
  const existing = await findRecord(key, idFieldSlug, id);
  if (!existing) throw new Error(`Unknown ${label}: ${id}`);
  return {
    existing,
    current: normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
  };
}

// signals/actions/drafts enter Busabase only through the agent's own
// browsing-and-writing workflow (see SKILL.md) — the AirApp never creates
// new signal/action/draft rows, it only reads them and writes a human
// verdict directly onto the item's own record. This mirrors the
// review-queue pattern used across this batch of conversions (busa-radar,
// busa-picks): the decision is a direct field write, not a separate
// decisions.json-equivalent bucket.
export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const warnings = [];
    const [
      signalsPage,
      actionsPage,
      draftsPage,
      sourcesPage,
      meta,
      signalCount,
      actionCount,
      draftCount,
      approvedDraftCount,
      unconfiguredSourceCount,
    ] = await Promise.all([
      readPage("signals"),
      readPage("actions"),
      readPage("drafts"),
      optional(readPage("sources"), { rows: [], nextCursor: null }, warnings, "Sources could not be read"),
      optional(readBatchMeta(), parseBatchMeta(""), warnings, "Batch metadata could not be read"),
      countRecords("signals"),
      countRecords("actions"),
      countRecords("drafts"),
      // Exact overview figures: text `equals` filters stay a cheap SQL COUNT.
      countRecords("drafts", [{ fieldSlug: "status", operator: "equals", value: "approved" }]),
      countRecords("sources", [{ fieldSlug: "status", operator: "equals", value: "needs_config" }]),
    ]);
    const batch = buildSnapshot({
      signals: signalsPage.rows,
      actions: actionsPage.rows,
      drafts: draftsPage.rows,
      sources: sourcesPage.rows,
      meta,
    });
    return {
      app: "busa-ecommerce-intel",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(meta.batch_id), config_version: "1" },
      lock: null,
      batch,
      warnings,
      totals: { signals: signalCount, actions: actionCount, drafts: draftCount },
      counts: { approved_drafts: approvedDraftCount, unconfigured_sources: unconfiguredSourceCount },
      pagination: {
        signals: signalsPage.nextCursor,
        actions: actionsPage.nextCursor,
        drafts: draftsPage.nextCursor,
        sources: sourcesPage.nextCursor,
      },
    };
  },

  // A record named by the URL that is not on the loaded page: read it on its
  // own by business id instead of paging forward until it turns up.
  async getRecord(key, id) {
    await ensureResources();
    const record = await findRecord(key, ID_FIELD_SLUG[key], id);
    if (!record) return null;
    const row = {
      ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
      __recordId: record.id,
      __headCommitId: record.headCommitId || record.headCommit?.id,
    };
    return NORMALIZE_BY_KEY[key](row);
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    const normalize = NORMALIZE_BY_KEY[key];
    return { ...page, rows: normalize ? page.rows.map(normalize) : page.rows };
  },

  // Human verdict on a signal/action/draft (approve/request_changes/block,
  // plus revise for a draft's edited body) — written directly onto the item
  // record. Ported from the retired local-file store's saveDecision():
  // statusForAction() maps the verb to the item's `status`.
  async saveDecision({ kind = "", id = "", action = "", comment = "", edited_body = "" } = {}) {
    if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
    if (!id) return { ok: false, status: 400, error: "Missing item id" };
    const allowed = kind === "draft" ? DRAFT_ACTIONS : REVIEW_ACTIONS;
    if (!allowed.includes(action)) return { ok: false, status: 400, error: `Unknown action for ${kind}: ${action}` };
    await ensureResources();
    const now = new Date().toISOString();

    let result;
    try {
      if (kind === "signal") {
        const { current } = await requireRecord("signals", "signal-id", id, "signal");
        result = await upsert(
          "signals",
          "signal-id",
          id,
          {
            ...current,
            signal_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on signal ${id}: ${action}`,
        );
      } else if (kind === "action") {
        const { current } = await requireRecord("actions", "action-id", id, "action");
        result = await upsert(
          "actions",
          "action-id",
          id,
          {
            ...current,
            action_id: id,
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on action ${id}: ${action}`,
        );
      } else if (kind === "draft") {
        const { current } = await requireRecord("drafts", "draft-id", id, "draft");
        result = await upsert(
          "drafts",
          "draft-id",
          id,
          {
            ...current,
            draft_id: id,
            edited_body: action === "revise" ? edited_body : current.edited_body || "",
            status: statusForAction(action),
            decision_verdict: action,
            decision_comment: comment,
            decided_at: now,
          },
          `Decision on draft ${id}: ${action}`,
        );
      }
    } catch (error) {
      return { ok: false, status: 400, error: error instanceof Error ? error.message : String(error) };
    }
    return {
      ok: true,
      decision: { id, kind, action, comment, decided_at: now },
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
