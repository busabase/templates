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
  normalizeCheckRow,
  normalizePlanRow,
  statusForVerdict,
} from "../lesson-model.js?v=0.1.0";

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

async function readSettingsRow() {
  const rows = await readFirstPage("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

// Teachers, Checks and Settings only decorate the plan library. A read that
// is denied or fails there becomes a warning on the page instead of failing
// the whole app; Plans is the one read the app cannot work without.
const sideReadWarnings = [];
async function sideRead(label, read, fallback) {
  try {
    return await read();
  } catch (error) {
    sideReadWarnings.push({
      id: `read-${label.toLowerCase()}`,
      severity: "warning",
      message: `Could not read ${label}; that part of the page is empty.`,
      detail: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

// Exact numbers for the sidebar and the overview band: records.count with an
// exact text-equals filter, never a tally of whatever page is loaded. Each
// figure is null when its count is unavailable, and the UI shows "—".
const equals = (fieldSlug, value) => [{ fieldSlug, operator: "equals", value }];
async function exactCounts() {
  const [needsReview, inRevision, approved, done, pass, warn, fail] = await Promise.all([
    countRecords("plans", equals("status", "needs_review")),
    countRecords("plans", equals("status", "changes_requested")),
    countRecords("plans", equals("status", "approved")),
    countRecords("plans", equals("status", "done")),
    countRecords("checks", equals("result", "pass")),
    countRecords("checks", equals("result", "warn")),
    countRecords("checks", equals("result", "fail")),
  ]);
  const known = (...values) => values.every((value) => typeof value === "number");
  return {
    plans: initialTotalCounts.plans ?? null,
    plans_needs_review: needsReview,
    plans_changes_requested: inRevision,
    plans_approved: known(approved, done) ? approved + done : null,
    checks_fail: fail,
    checks_pass_rate: known(pass, warn, fail) ? Math.round((pass / Math.max(1, pass + warn + fail)) * 100) : null,
  };
}

// Only known field slugs are ever written back for a decision — never spread
// a raw row (it also carries __recordId/__headCommitId bookkeeping keys that
// must not be sent as Busabase fields).
function basePlanFields(row) {
  return {
    plan_id: row.plan_id,
    ref: row.ref,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    unit: row.unit || "",
    teacher_id: row.teacher_id || "",
    source: row.source || "agent_draft",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    class_length_minutes: row.class_length_minutes,
    duration_minutes: row.duration_minutes,
    objectives: row.objectives || "",
    key_points: row.key_points || "",
    difficulties: row.difficulties || "",
    materials: row.materials || "",
    curriculum_refs: row.curriculum_refs || "",
    board_plan: row.board_plan || "",
    homework: row.homework || "",
    reflection: row.reflection || "",
    safety_notes: row.safety_notes || "",
    stages: row.stages || "",
    notes: row.notes || "",
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "",
    feedback_draft: row.feedback_draft || "",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
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
    sideReadWarnings.length = 0;
    await ensureResources();
    const [teachers, plans, checks, settings] = await Promise.all([
      sideRead("Teachers", () => readFirstPage("teachers"), []),
      readFirstPage("plans"),
      sideRead("Checks", () => readFirstPage("checks"), []),
      sideRead("Settings", readSettingsRow, {}),
    ]);
    currentPageContext = { teachers, plans, checks, settings };
    const snapshot = buildSnapshot(currentPageContext);
    snapshot.warnings = [...(snapshot.warnings || []), ...sideReadWarnings];
    const config_summary = buildConfigSummary({ settings });
    const counts = await exactCounts();
    return withPagination({
      counts,
      app: "busa-lesson",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: plans.length > 0, config_version: "1" },
      lock: null,
      config_summary,
      snapshot,
    });
  },

  // Human verdict on a plan, written directly onto the plan record. Ported
  // from the retired local-file DataProvider's applyDecision(): every
  // action (including "revise") maps through
  // statusForVerdict()'s table and is recorded literally as decision_action
  // — this simplifies away the retired local-file provider's "revise
  // preserves the prior real verdict" special case (matching busa-audit's
  // decideAnomaly), since Busabase reads are always live and there is no
  // staleness left to paper over.
  async decidePlan({ plan_id, action, note = "", draft } = {}) {
    if (!plan_id || typeof plan_id !== "string") throw new Error("plan_id is required");
    if (!action || !DECISION_ACTIONS.has(action)) {
      throw new Error(`action must be one of: ${[...DECISION_ACTIONS].join(", ")}`);
    }
    await ensureResources();
    const existing = await findRecord("plans", "plan-id", plan_id);
    if (!existing) throw new Error(`Unknown plan: ${plan_id}`);
    const current = normalizeFields(existing.headCommit?.payload || existing.headCommit?.fields || existing.fields);
    const now = new Date().toISOString();
    const fields = {
      ...basePlanFields(current),
      plan_id,
      status: statusForVerdict(action, current.status || "needs_review"),
      feedback_draft: typeof draft === "string" ? draft : current.feedback_draft || "",
      decision_action: action,
      decision_note: String(note || ""),
      decided_at: now,
      updated_at: now,
    };
    const result = await upsert("plans", "plan-id", plan_id, fields, `Decision on plan ${plan_id}: ${action}`);
    const pending = isAirAppWriteQueued(result);
    return { ok: true, pending, change_request_id: pending ? result?.id || "" : "" };
  },

  // A record named by the URL but not on the loaded page: one records.get by
  // its business id, instead of paging until it turns up.
  async getRecord(view, id) {
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const [key, slug, normalize] =
      view === "checks" ? ["checks", "check-id", normalizeCheckRow] : ["plans", "plan-id", normalizePlanRow];
    const record = await findRecord(key, slug, id);
    if (!record) return null;
    return normalize(normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields));
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
