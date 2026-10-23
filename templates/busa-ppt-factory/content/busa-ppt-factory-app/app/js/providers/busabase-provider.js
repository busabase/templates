import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISION_ACTIONS,
  baseDeckFields,
  baseSlideFields,
  buildSnapshot,
  normalizeDeckRow,
  normalizeExportRow,
  normalizeProjectRow,
  normalizeSlideRow,
  normalizeStyleRow,
  statusFromDecision,
} from "../ppt-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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
    const { total } = await runtimeClient.records.count({ baseId: base(key).baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

const countStatus = (key, status) =>
  countRecords(key, [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }]);

async function countReviewRecords(status) {
  const filters = [
    { fieldSlug: "review-summary", fieldType: "longtext", operator: "not_empty" },
    ...(status ? [{ fieldSlug: "status", fieldType: "text", operator: "equals", value: status }] : []),
  ];
  const counts = await Promise.all(["decks", "slide-cards"].map((key) => countRecords(key, filters)));
  return counts.some((value) => value === null) ? null : counts[0] + counts[1];
}

// A supporting Base the screen can live without (style kits, QA evidence,
// exports, settings): a denied or failed read leaves it empty instead of
// failing the whole app.
async function readOptionalPage(key) {
  try {
    return await readPage(key);
  } catch {
    return { rows: [], nextCursor: null, failed: true };
  }
}

// Business-id field per route, for opening a record named by the URL that is
// not on the loaded page (one records.get, never another page).
const RECORD_LOOKUP = {
  projects: { key: "projects", field: "project-id", normalize: normalizeProjectRow },
  decks: { key: "decks", field: "deck-id", normalize: normalizeDeckRow },
  slides: { key: "slide-cards", field: "slide-id", normalize: normalizeSlideRow },
  style: { key: "style-systems", field: "style-system-id", normalize: normalizeStyleRow },
  exports: { key: "exports", field: "export-id", normalize: normalizeExportRow },
};

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

async function readSettingsRow() {
  const { rows } = await readOptionalPage("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// A person's write from this app leaves `autoMerge` unset, so Busabase decides
// from that person's own permission: with write access the change lands now;
// without it the same change becomes a ChangeRequest for someone who has it.
// The response says which happened (`materialized: false` is the queued one),
// and the caller reports it rather than assuming either.
const isQueued = (result) => result?.materialized === false || result?.status === "in_review";

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const keys = ["projects", "decks", "slide-cards", "style-systems", "qa-checks", "exports"];
    const [
      projects,
      decks,
      slideCards,
      styleSystems,
      qaChecks,
      exportsList,
      settings,
      counts,
      slidesNeedsReview,
      slidesChangesRequested,
      decksApproved,
      decksGenerated,
      reviewTotal,
      reviewNeeds,
      reviewChanges,
      reviewApproved,
      qaOpen,
    ] = await Promise.all([
      readPage("projects"),
      readPage("decks"),
      readPage("slide-cards"),
      readOptionalPage("style-systems"),
      readOptionalPage("qa-checks"),
      readOptionalPage("exports"),
      readSettingsRow(),
      Promise.all(keys.map((key) => countRecords(key))),
      countStatus("slide-cards", "needs_review"),
      countStatus("slide-cards", "changes_requested"),
      countStatus("decks", "approved"),
      countStatus("decks", "generated"),
      countReviewRecords(),
      countReviewRecords("needs_review"),
      countReviewRecords("changes_requested"),
      countReviewRecords("approved"),
      Promise.all(
        ["warn", "fail", "manual"].map((result) =>
          countRecords("qa-checks", [{ fieldSlug: "result", fieldType: "text", operator: "equals", value: result }]),
        ),
      ),
    ]);
    const snapshot = buildSnapshot({
      projects: projects.rows,
      decks: decks.rows,
      slideCards: slideCards.rows,
      styleSystems: styleSystems.rows,
      qaChecks: qaChecks.rows,
      exportsList: exportsList.rows,
      settings,
    });
    if (counts[0] !== null) snapshot.metrics.project_count = counts[0];
    if (counts[1] !== null) snapshot.metrics.deck_count = counts[1];
    if (counts[2] !== null) snapshot.metrics.slide_count = counts[2];
    if (slidesNeedsReview !== null && slidesChangesRequested !== null)
      snapshot.metrics.slides_needs_review = slidesNeedsReview + slidesChangesRequested;
    if (decksGenerated !== null) snapshot.metrics.decks_generated = decksGenerated;
    if (!qaOpen.includes(null)) snapshot.metrics.qa_warnings = qaOpen[0] + qaOpen[1] + qaOpen[2];
    return {
      app: appConfig.appId,
      demo: false,
      data_provider: "busabase",
      onboarding: {
        completed: (counts[0] ?? projects.rows.length) > 0 || (counts[1] ?? decks.rows.length) > 0,
        config_version: "1",
      },
      lock: null,
      config_summary: {
        config_path: "busabase",
        is_example: false,
        default_brand_id: snapshot.brand_profiles[0]?.client_id || "",
        brand_profiles: snapshot.brand_profiles,
        style_systems: snapshot.style_systems,
        export: snapshot.style_systems.length
          ? {
              out_dir: settings.export_out_dir || "exports",
              render_dir: settings.export_render_dir || "exports/rendered",
              pptx_template: settings.export_pptx_template || "",
              require_render_qa: String(settings.export_require_render_qa || "true") === "true",
            }
          : {},
      },
      snapshot,
      pagination: Object.fromEntries(
        [
          ["projects", projects],
          ["decks", decks],
          ["slide-cards", slideCards],
          ["style-systems", styleSystems],
          ["qa-checks", qaChecks],
          ["exports", exportsList],
        ].map(([key, page]) => [key, page.nextCursor]),
      ),
      totalCount: Object.fromEntries(keys.map((key, index) => [key, counts[index]])),
      reviewTotal,
      workflowCount: {
        needsReview: reviewNeeds !== null && reviewChanges !== null ? reviewNeeds + reviewChanges : null,
        approved: reviewApproved,
        ready: decksApproved !== null && decksGenerated !== null ? decksApproved + decksGenerated : null,
      },
    };
  },

  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  // One record named by the URL (`#/decks/<id>`, `?peek=<id>`) that is not on
  // the loaded page. Returns the normalized row, or null when it is gone.
  async getRecord(view, id) {
    const lookup = RECORD_LOOKUP[view];
    if (!lookup || !id) return null;
    await ensureResources();
    const record = await findRecord(lookup.key, lookup.field, id);
    if (!record) return null;
    return lookup.normalize(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
  },

  // Human verdict on a slide card or deck, written directly onto its own
  // record. Ported in spirit from the retired local-file DataProvider's
  // applyDecision(): every action maps through statusFromDecision()'s table
  // and is recorded literally as decision_action — this drops the retired
  // local-file provider's separate decisions.json bucket and agent_tasks
  // queue, since Busabase reads are always live.
  async decideItem({ targetType, id, action, comment = "", draft } = {}) {
    if (targetType !== "deck" && targetType !== "slide") throw new Error("targetType must be 'deck' or 'slide'");
    if (!id || typeof id !== "string") throw new Error("id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const baseKey = targetType === "deck" ? "decks" : "slide-cards";
    const idFieldSlug = targetType === "deck" ? "deck-id" : "slide-id";
    const existing = await findRecord(baseKey, idFieldSlug, id);
    if (!existing) throw new Error(`Unknown ${targetType}: ${id}`);
    const currentRaw = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const nextStatus = statusFromDecision(action);
    let result;
    if (targetType === "deck") {
      const current = normalizeDeckRow(currentRaw);
      const nextFields = baseDeckFields({
        ...current,
        deck_id: id,
        status: nextStatus || current.status,
        review_draft_note: typeof draft === "string" ? draft : current.review_draft_note,
        decision_action: action,
        decision_note: String(comment || ""),
        decided_at: now,
        updated_at: now,
      });
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      result = await runtimeClient.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields: toBusabaseFields(nextFields),
        message: `Decision on deck ${id}: ${action}`,
        author: appConfig.appId,
        baseCommitId: existing.headCommitId,
      });
    } else {
      const current = normalizeSlideRow(currentRaw);
      const nextFields = baseSlideFields({
        ...current,
        slide_id: id,
        status: nextStatus || current.status,
        review_draft_note: typeof draft === "string" ? draft : current.review_draft_note,
        decision_action: action,
        decision_note: String(comment || ""),
        decided_at: now,
        updated_at: now,
      });
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      result = await runtimeClient.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields: toBusabaseFields(nextFields),
        message: `Decision on slide card ${id}: ${action}`,
        author: appConfig.appId,
        baseCommitId: existing.headCommitId,
      });
    }
    return {
      ok: true,
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
