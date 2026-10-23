import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
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
} from "../newsroom-model.js?v=0.1.0";

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

async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
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

// Exact, server-side status totals for the sidebar and the Overview band.
// `status` is a text field, so this is records.count with an equals filter
// (records.groupBy is not in the pinned SDK, and it rejects text fields
// anyway). A null anywhere means "unknown": the UI then falls back to the
// loaded rows and marks the number as partial instead of inventing a total.
const statusFilter = (status) => [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }];
const sumOrNull = (values) => (values.some((value) => value == null) ? null : values.reduce((a, b) => a + b, 0));

async function statusTotals() {
  const kinds = ["signals", "actions", "drafts"];
  const statuses = ["needs_review", "approved", "blocked", "changes_requested"];
  const pairs = kinds.flatMap((key) => statuses.map((status) => [key, status]));
  const [counts, sourcesNeedConfig] = await Promise.all([
    Promise.all(pairs.map(([key, status]) => countRecords(key, statusFilter(status)))),
    countRecords("sources", statusFilter("needs_config")),
  ]);
  const at = (key, status) => counts[pairs.findIndex(([k, s]) => k === key && s === status)];
  return {
    needs_review: sumOrNull(kinds.map((key) => at(key, "needs_review"))),
    approved: sumOrNull(kinds.map((key) => at(key, "approved"))),
    blocked: sumOrNull(kinds.flatMap((key) => [at(key, "blocked"), at(key, "changes_requested")])),
    actions_approved: at("actions", "approved"),
    drafts_needs_review: at("drafts", "needs_review"),
    sources_needs_config: sourcesNeedConfig,
  };
}

async function findRecord(key, idFieldSlug, idValue) {
  if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");
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

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const existing = await findRecord(key, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: appConfig.appId,
    });
  }
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
  });
}

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
const NORMALIZE = { signals: normalizeSignal, actions: normalizeAction, drafts: normalizeDraft, sources: normalizeSource };
const ID_FIELD = { signals: "signal-id", actions: "action-id", drafts: "draft-id", sources: "source-id" };

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [signalsPage, actionsPage, draftsPage, sourcesPage, meta, signalCount, actionCount, draftCount, sourceCount, counts] =
      await Promise.all([
        readPage("signals"),
        readPage("actions"),
        readPage("drafts"),
        readPage("sources"),
        readBatchMeta(),
        countRecords("signals"),
        countRecords("actions"),
        countRecords("drafts"),
        countRecords("sources"),
        statusTotals(),
      ]);
    const batch = buildSnapshot({
      signals: signalsPage.rows,
      actions: actionsPage.rows,
      drafts: draftsPage.rows,
      sources: sourcesPage.rows,
      meta,
    });
    return {
      app: "busa-ai-newsroom",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: Boolean(meta.batch_id), config_version: "1" },
      lock: null,
      batch,
      totals: { signals: signalCount, actions: actionCount, drafts: draftCount, sources: sourceCount },
      counts,
      pagination: {
        signals: signalsPage.nextCursor,
        actions: actionsPage.nextCursor,
        drafts: draftsPage.nextCursor,
        sources: sourcesPage.nextCursor,
      },
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    const page = await readPage(key, cursor);
    return { ...page, rows: page.rows.map(NORMALIZE[key]) };
  },

  // A record named by the URL (a shared `?peek=` or `/<id>` link) that is not
  // on the loaded page: read just that record by its business id instead of
  // paging forward until it turns up.
  async getRecord(key, id) {
    await ensureResources();
    const existing = await findRecord(key, ID_FIELD[key], id);
    if (!existing) return null;
    return NORMALIZE[key]({
      ...normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields),
      __recordId: existing.id,
      __headCommitId: existing.headCommitId || existing.headCommit?.id,
    });
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
      pending: isQueued(result),
      change_request_id: isQueued(result) ? result?.id || "" : "",
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
