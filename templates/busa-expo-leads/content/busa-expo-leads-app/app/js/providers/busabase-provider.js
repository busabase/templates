import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, NORMALIZE_ROW_BY_KEY, statusForAction } from "../expo-leads-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block"]);

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

// One page per call -- every Base here (batches, leads, followups, settings)
// is read exactly once on boot; none of them grows into a multi-page browse
// list the way a contact/deal table might, so there is no pager to wire up.
// If leads genuinely outgrows one page in practice, it needs the same
// cursor-cached pager treatment other Busa templates give a browsed list --
// not a bigger readLimit. Until then `hasMore` records that a Base holds more
// rows than were read, so the UI can say "50+" instead of presenting the
// loaded page as the whole table.
const hasMore = new Map();

const recordToRow = (record) => ({
  ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
  __recordId: record.id,
  __headCommitId: record.headCommitId || record.headCommit?.id,
});

// Record reads and writes go through the SDK's helpers, bound to this app's client.
// A person's write leaves `autoMerge` unset, so Busabase decides from their own
// permission: it lands now with write access and becomes a ChangeRequest without
// it. The response says which happened; `isAirAppWriteQueued` reads it.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

async function readPage(key) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
  });
  hasMore.set(key, Boolean(page.nextCursor));
  return page.records.map(recordToRow);
}

// A real, exact server-side total (records.count). Returns null -- never a
// fabricated number -- when the procedure is denied or fails, so a denied side
// read leaves the loaded-page figure in place instead of failing the page.
async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({
      baseId: base(key).baseId,
      ...(filters ? { filters } : {}),
    });
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

async function readSettingsRow() {
  const rows = await readPage("settings");
  return rows.find((row) => row.record_id === "config") || rows[0] || {};
}

async function upsertFollowupDecision(followupRecordId, headCommitId, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  return runtimeClient.records.changeRequest({
    recordId: followupRecordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: headCommitId,
  });
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [batches, leads, followups, settings, leadTotal, reviewTotal] = await Promise.all([
      readPage("batches"),
      readPage("leads"),
      readPage("followups"),
      readSettingsRow(),
      countRecords("leads"),
      countRecords("followups", [{ fieldSlug: "status", fieldType: "select", operator: "equals", value: "needs_review" }]),
    ]);
    const snapshot = buildSnapshot({ batches, leads, followups, settings });
    // lead_count / followups_needs_review were page lengths; overwrite them
    // with the real totals when records.count answered.
    if (leadTotal !== null) snapshot.metrics.lead_count = leadTotal;
    if (reviewTotal !== null) snapshot.metrics.followups_needs_review = reviewTotal;
    return {
      app: "busa-expo-leads",
      data_provider: "busabase",
      partial: { leads: Boolean(hasMore.get("leads")), followups: Boolean(hasMore.get("followups")) },
      onboarding: { completed: Boolean(settings.record_id), config_version: "1" },
      lock: null,
      config_summary: {
        thresholds: snapshot.thresholds,
        reply_templates: (() => {
          try {
            return JSON.parse(settings.reply_templates || "{}");
          } catch {
            return {};
          }
        })(),
        whatsapp_account_env: settings.whatsapp_account_env || "",
        email_account_env: settings.email_account_env || "",
      },
      snapshot,
    };
  },

  // One record named by the URL (a shared link, a refresh) that is not on the
  // loaded page: a single records.get by its record id, never a scan for it.
  async getRecord(key, recordId) {
    if (!allowedReads.has("records.get") || !NORMALIZE_ROW_BY_KEY[key] || !recordId) return null;
    await ensureResources();
    const record = await runtimeClient.records.get({ recordId });
    if (!record || (record.baseId && record.baseId !== base(key).baseId)) return null;
    return NORMALIZE_ROW_BY_KEY[key](recordToRow(record));
  },

  async applyDecision(payload = {}) {
    const followupId = String(payload.followup_id || "");
    const action = String(payload.action || "");
    if (!followupId) throw new Error("followup_id is required");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    await ensureResources();
    const nextStatus = statusForAction(action);
    const now = new Date().toISOString();
    const headCommitId = String(payload.head_commit_id || "");
    const fields = {
      status: nextStatus,
      decision_action: action,
      decision_comment: String(payload.comment || ""),
      decided_at: now,
      updated_at: now,
      ...(payload.draft !== undefined ? { draft_text: String(payload.draft) } : {}),
    };
    const result = await upsertFollowupDecision(
      followupId,
      headCommitId,
      fields,
      `Decision on follow-up ${followupId}: ${action}`,
    );
    return {
      updated_at: now,
      followup_id: followupId,
      action,
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
