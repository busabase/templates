// Pure domain logic for busa-expo-leads: turn normalized Busabase records
// (one array per Base, snake_case field keys) into the snapshot shape the UI
// renders, and turn a human verdict into the record write the provider needs
// to make. No SDK/DOM coupling — every function here is a plain data
// transform, unit-tested directly in test/expo-leads-model.test.mjs.
//
// The SLA bucket is never stored on a lead record: it is always derived from
// `met_at` compared against the two thresholds on the live Settings row, the
// same way busa-support derives its ticket `sla_state` from a timestamp plus
// thresholds rather than persisting it — so the board is always correct
// relative to "now", regardless of when the browser session loaded it.

export const DEFAULT_THRESHOLDS = { sla24Hours: 24, sla72Hours: 72 };
export const SLA_BUCKETS = ["green", "amber", "red"];
export const DECISION_ACTIONS = ["approve", "request_changes", "block"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "needs_review",
  block: "needs_review",
};

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

// Relation field values come back from Busabase as either a bare record-id
// string or an array of record-id strings depending on how they were last
// written (options.multiple only governs the *editor* UI, not the storage
// shape) — never assume one shape, always read defensively.
function firstRelationId(value) {
  return asArray(value)[0] || "";
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== "string") return value && typeof value === "object" ? value : fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeBatchRow(row = {}) {
  return {
    batch_id: row.__recordId || row.batch_id || "",
    name: row.name || "",
    location: row.location || "",
    start_date: row.start_date || "",
    end_date: row.end_date || "",
    notes: row.notes || "",
  };
}

export function normalizeLeadRow(row = {}) {
  return {
    lead_id: row.__recordId || row.lead_id || "",
    __headCommitId: row.__headCommitId,
    name: row.name || "",
    company: row.company || "",
    country: row.country || "",
    language: row.language || "other",
    batch_id: firstRelationId(row.batch),
    card_photo: row.card_photo ?? null,
    product_interest: row.product_interest || "",
    contact_channel: row.contact_channel || "email",
    contact_handle: row.contact_handle || "",
    met_at: row.met_at || "",
    stage: row.stage || "new",
  };
}

export function normalizeFollowupRow(row = {}) {
  return {
    followup_id: row.__recordId || row.followup_id || "",
    __headCommitId: row.__headCommitId,
    lead_id: firstRelationId(row.lead),
    language: row.language || "",
    draft_text: row.draft_text || "",
    channel: row.channel || "email",
    status: row.status || "needs_review",
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export const NORMALIZE_ROW_BY_KEY = {
  batches: normalizeBatchRow,
  leads: normalizeLeadRow,
  followups: normalizeFollowupRow,
};

// Reads the two SLA thresholds off the live Settings row, falling back to the
// documented defaults (24h / 72h) when the row is missing or a value wasn't set.
export function thresholdsFromSettings(settings = {}) {
  return {
    sla24Hours: Number(settings.sla_24h_hours || DEFAULT_THRESHOLDS.sla24Hours),
    sla72Hours: Number(settings.sla_72h_hours || DEFAULT_THRESHOLDS.sla72Hours),
  };
}

// green: met less than sla24Hours ago. amber: met from sla24Hours up to and
// including sla72Hours ago. red: met more than sla72Hours ago (or met_at is
// missing/unparseable — an unknown meeting time is treated as the most
// urgent case, never silently hidden as "on time").
export function slaStateFor(metAtIso, thresholds = DEFAULT_THRESHOLDS, nowIso = new Date().toISOString()) {
  const met = Date.parse(metAtIso || "");
  const now = Date.parse(nowIso) || Date.now();
  if (!Number.isFinite(met)) return "red";
  const hoursSince = (now - met) / 3_600_000;
  if (hoursSince < thresholds.sla24Hours) return "green";
  if (hoursSince <= thresholds.sla72Hours) return "amber";
  return "red";
}

// A lead is done needing an SLA countdown once its latest follow-up has
// already gone out, or once it has moved to a closing stage — qualified
// (won) or lost. Everything else still needs a decision, so it stays on the
// board no matter how old `met_at` is (an ancient lead simply sits in "red").
function isSlaExcluded(lead) {
  return lead.latest_followup_status === "sent" || lead.stage === "qualified" || lead.stage === "lost";
}

// Groups `leads` (each already carrying `latest_followup_status` from the
// join buildSnapshot performs) into the three SLA buckets. Every included
// lead is annotated with its own `sla_state` so the caller never has to
// recompute it. Signature takes plain leads + thresholds + now — no
// followups parameter — because the exclusion facts it needs
// (`latest_followup_status`, `stage`) are expected to already be on the lead.
export function bucketLeads(leads = [], thresholds = DEFAULT_THRESHOLDS, now = new Date().toISOString()) {
  const buckets = { green: [], amber: [], red: [] };
  for (const lead of leads) {
    if (isSlaExcluded(lead)) continue;
    const sla_state = slaStateFor(lead.met_at, thresholds, now);
    buckets[sla_state].push({ ...lead, sla_state });
  }
  return buckets;
}

// Picks the most recently created follow-up for a lead (there can be more
// than one over the life of a lead — a request_changes round trip drafts a
// fresh one) so `latest_followup_status`/`latest_followup_id` reflect the
// current state of the conversation, not the first draft ever written.
function latestFollowupFor(followups) {
  if (!followups.length) return null;
  return [...followups].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

// Assembles the full UI-ready snapshot: normalizes every row, joins each
// lead to its batch name and its latest follow-up, computes every lead's SLA
// state, and buckets the leads that still need a countdown. Mirrors the
// shape of every sibling template's own buildSnapshot({ ...raw }) -> snapshot.
export function buildSnapshot({ leads = [], followups = [], batches = [], settings = {}, now = new Date().toISOString() } = {}) {
  const normalizedBatches = batches.map(normalizeBatchRow);
  const normalizedFollowups = followups.map(normalizeFollowupRow);
  const normalizedLeads = leads.map(normalizeLeadRow);

  const batchById = new Map(normalizedBatches.map((batch) => [batch.batch_id, batch]));
  const followupsByLead = new Map();
  for (const followup of normalizedFollowups) {
    if (!followup.lead_id) continue;
    if (!followupsByLead.has(followup.lead_id)) followupsByLead.set(followup.lead_id, []);
    followupsByLead.get(followup.lead_id).push(followup);
  }

  const joinedLeads = normalizedLeads.map((lead) => {
    const related = followupsByLead.get(lead.lead_id) || [];
    const latest = latestFollowupFor(related);
    return {
      ...lead,
      batch_name: batchById.get(lead.batch_id)?.name || "",
      latest_followup_id: latest?.followup_id || "",
      latest_followup_status: latest?.status || "",
      sla_state: slaStateFor(lead.met_at, thresholdsFromSettings(settings), now),
    };
  });

  const buckets = bucketLeads(joinedLeads, thresholdsFromSettings(settings), now);
  const metrics = {
    lead_count: joinedLeads.length,
    batch_count: normalizedBatches.length,
    followups_needs_review: normalizedFollowups.filter((item) => item.status === "needs_review").length,
    sla_green_count: buckets.green.length,
    sla_amber_count: buckets.amber.length,
    sla_red_count: buckets.red.length,
  };

  return {
    schema_version: "1",
    generated_at: now,
    source: "busabase",
    thresholds: thresholdsFromSettings(settings),
    metrics,
    batches: normalizedBatches,
    leads: joinedLeads,
    followups: normalizedFollowups,
    sla_buckets: buckets,
    warnings: [],
  };
}

// Maps a human verdict on a follow-up to the status it writes. Mirrors
// busa-crm's/busa-audit's statusForAction: approve moves the follow-up
// forward (a human still has to actually send it before it becomes "sent");
// request_changes and block both send it back to needs_review with the
// decision recorded, since there is no separate "blocked" workflow status
// for this Base (see content/followups/base.json's `status` choices).
export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}

// Sanitized settings summary for #/settings — env var NAMES only, never the
// secret values they point at (there is no slot for a value in this Base at
// all; see content/settings/base.json).
export function buildConfigSummary(settingsRow = {}) {
  const thresholds = thresholdsFromSettings(settingsRow);
  return {
    thresholds,
    reply_templates: parseJsonObject(settingsRow.reply_templates, {}),
    whatsapp_account_env: settingsRow.whatsapp_account_env || "",
    email_account_env: settingsRow.email_account_env || "",
  };
}
