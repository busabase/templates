import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { buildSnapshot, statusForAction } from "../expo-leads-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const DECISION_ACTIONS = new Set(["approve", "request_changes", "block"]);

// A deployed AirApp is served through the ambient Busabase session; a
// standalone local preview runs on loopback outside that host. A human
// decision made from a standalone local preview (the trusted operator's own
// machine) merges immediately; a decision made from the deployed AirApp
// creates a pending ChangeRequest for the trusted process to merge. Only a
// standalone run may merge its own writes — a deployed AirApp is inside the
// Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

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
// not a bigger readLimit.
async function readPage(key) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({ baseId: declared.baseId, limit: declared.readLimit });
  const records = Array.isArray(result) ? result : result.records || [];
  return records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
}

async function readSettingsRow() {
  const rows = await readPage("settings");
  return rows.find((row) => row.record_id === "config") || rows[0] || {};
}

async function upsertFollowupDecision(followupRecordId, headCommitId, fields, message) {
  if (!allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const autoMerge = isStandaloneLocalRuntime();
  return runtimeClient.records.changeRequest({
    recordId: followupRecordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: appConfig.appId,
    baseCommitId: headCommitId,
    autoMerge,
  });
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [batches, leads, followups, settings] = await Promise.all([
      readPage("batches"),
      readPage("leads"),
      readPage("followups"),
      readSettingsRow(),
    ]);
    const snapshot = buildSnapshot({ batches, leads, followups, settings });
    return {
      app: "busa-expo-leads",
      data_provider: "busabase",
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
    await upsertFollowupDecision(followupId, headCommitId, fields, `Decision on follow-up ${followupId}: ${action}`);
    return { updated_at: now, followup_id: followupId, action };
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
