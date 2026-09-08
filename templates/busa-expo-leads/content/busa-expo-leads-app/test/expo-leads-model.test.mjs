import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_THRESHOLDS,
  bucketLeads,
  buildConfigSummary,
  buildSnapshot,
  normalizeFollowupRow,
  normalizeLeadRow,
  slaStateFor,
  statusForAction,
  thresholdsFromSettings,
} from "../app/js/expo-leads-model.js";

const NOW = "2026-09-08T12:00:00.000Z";

test("slaStateFor: green when met less than 24h ago", () => {
  assert.equal(slaStateFor("2026-09-08T00:01:00.000Z", DEFAULT_THRESHOLDS, NOW), "green");
});

test("slaStateFor: exactly at the 24h boundary is amber, not green", () => {
  assert.equal(slaStateFor("2026-09-07T12:00:00.000Z", DEFAULT_THRESHOLDS, NOW), "amber");
});

test("slaStateFor: amber inside the 24-72h window", () => {
  assert.equal(slaStateFor("2026-09-06T18:00:00.000Z", DEFAULT_THRESHOLDS, NOW), "amber");
});

test("slaStateFor: exactly at the 72h boundary is still amber, not red", () => {
  assert.equal(slaStateFor("2026-09-05T12:00:00.000Z", DEFAULT_THRESHOLDS, NOW), "amber");
});

test("slaStateFor: red just past the 72h boundary", () => {
  assert.equal(slaStateFor("2026-09-05T11:59:00.000Z", DEFAULT_THRESHOLDS, NOW), "red");
});

test("slaStateFor: red long after 72h", () => {
  assert.equal(slaStateFor("2026-08-01T00:00:00.000Z", DEFAULT_THRESHOLDS, NOW), "red");
});

test("slaStateFor: missing or unparseable met_at is treated as red (most urgent), never hidden", () => {
  assert.equal(slaStateFor("", DEFAULT_THRESHOLDS, NOW), "red");
  assert.equal(slaStateFor(undefined, DEFAULT_THRESHOLDS, NOW), "red");
  assert.equal(slaStateFor("not-a-date", DEFAULT_THRESHOLDS, NOW), "red");
});

test("slaStateFor: respects custom thresholds from the Settings row", () => {
  const thresholds = { sla24Hours: 12, sla72Hours: 48 };
  // 6h ago: under the 12h threshold -> green.
  assert.equal(slaStateFor("2026-09-08T06:00:00.000Z", thresholds, NOW), "green");
  // 18h ago: between 12h and 48h -> amber.
  assert.equal(slaStateFor("2026-09-07T18:00:00.000Z", thresholds, NOW), "amber");
  // 60h ago: past the 48h threshold -> red.
  assert.equal(slaStateFor("2026-09-06T00:00:00.000Z", thresholds, NOW), "red");
});

test("thresholdsFromSettings: falls back to 24/72 when the Settings row is empty or partial", () => {
  assert.deepEqual(thresholdsFromSettings({}), { sla24Hours: 24, sla72Hours: 72 });
  assert.deepEqual(thresholdsFromSettings({ sla_24h_hours: 12 }), { sla24Hours: 12, sla72Hours: 72 });
  assert.deepEqual(thresholdsFromSettings({ sla_24h_hours: "18", sla_72h_hours: "60" }), {
    sla24Hours: 18,
    sla72Hours: 60,
  });
});

test("bucketLeads: groups leads into green/amber/red and tags each with sla_state", () => {
  const leads = [
    { lead_id: "l-1", met_at: "2026-09-08T06:00:00.000Z", stage: "new" }, // 6h ago -> green
    { lead_id: "l-2", met_at: "2026-09-07T00:00:00.000Z", stage: "contacted" }, // 36h ago -> amber
    { lead_id: "l-3", met_at: "2026-09-01T00:00:00.000Z", stage: "contacted" }, // way over 72h -> red
  ];
  const buckets = bucketLeads(leads, DEFAULT_THRESHOLDS, NOW);
  assert.deepEqual(
    buckets.green.map((item) => item.lead_id),
    ["l-1"],
  );
  assert.deepEqual(
    buckets.amber.map((item) => item.lead_id),
    ["l-2"],
  );
  assert.deepEqual(
    buckets.red.map((item) => item.lead_id),
    ["l-3"],
  );
  assert.equal(buckets.green[0].sla_state, "green");
  assert.equal(buckets.amber[0].sla_state, "amber");
  assert.equal(buckets.red[0].sla_state, "red");
});

test("bucketLeads: excludes a lead whose latest follow-up is already sent, however old met_at is", () => {
  const leads = [{ lead_id: "l-old", met_at: "2026-08-01T00:00:00.000Z", stage: "contacted", latest_followup_status: "sent" }];
  const buckets = bucketLeads(leads, DEFAULT_THRESHOLDS, NOW);
  assert.equal(buckets.green.length, 0);
  assert.equal(buckets.amber.length, 0);
  assert.equal(buckets.red.length, 0);
});

test("bucketLeads: excludes a lead whose stage is qualified", () => {
  const leads = [{ lead_id: "l-won", met_at: "2026-08-01T00:00:00.000Z", stage: "qualified" }];
  const buckets = bucketLeads(leads, DEFAULT_THRESHOLDS, NOW);
  assert.equal(buckets.green.length + buckets.amber.length + buckets.red.length, 0);
});

test("bucketLeads: excludes a lead whose stage is lost", () => {
  const leads = [{ lead_id: "l-lost", met_at: "2026-08-01T00:00:00.000Z", stage: "lost" }];
  const buckets = bucketLeads(leads, DEFAULT_THRESHOLDS, NOW);
  assert.equal(buckets.green.length + buckets.amber.length + buckets.red.length, 0);
});

test("bucketLeads: a lead still needs_review or with no follow-up yet stays on the board even if old", () => {
  const leads = [
    { lead_id: "l-needs", met_at: "2026-08-01T00:00:00.000Z", stage: "new", latest_followup_status: "needs_review" },
    { lead_id: "l-none", met_at: "2026-08-01T00:00:00.000Z", stage: "new", latest_followup_status: "" },
  ];
  const buckets = bucketLeads(leads, DEFAULT_THRESHOLDS, NOW);
  assert.deepEqual(
    buckets.red.map((item) => item.lead_id).sort(),
    ["l-needs", "l-none"],
  );
});

test("normalizeLeadRow: reads a relation field defensively whether it arrives as a string or an array", () => {
  assert.equal(normalizeLeadRow({ batch: "batch-1" }).batch_id, "batch-1");
  assert.equal(normalizeLeadRow({ batch: ["batch-1"] }).batch_id, "batch-1");
  assert.equal(normalizeLeadRow({ batch: [] }).batch_id, "");
  assert.equal(normalizeLeadRow({}).batch_id, "");
});

test("normalizeFollowupRow: defaults status to needs_review and reads the lead relation defensively", () => {
  const row = normalizeFollowupRow({ lead: ["lead-9"] });
  assert.equal(row.lead_id, "lead-9");
  assert.equal(row.status, "needs_review");
});

test("statusForAction maps every decision verdict this Base's status choices actually support", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "needs_review");
  assert.equal(statusForAction("block"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});

test("buildSnapshot joins batch name and latest follow-up status onto each lead, and buckets by SLA", () => {
  const snapshot = buildSnapshot({
    batches: [{ __recordId: "b-1", name: "Global Sources HK" }],
    leads: [
      {
        __recordId: "lead-1",
        name: "Ana Torres",
        batch: ["b-1"],
        met_at: "2026-09-08T06:00:00.000Z",
        stage: "new",
      },
    ],
    followups: [
      {
        __recordId: "fu-1",
        lead: ["lead-1"],
        status: "needs_review",
        created_at: "2026-09-08T06:30:00.000Z",
      },
    ],
    settings: { sla_24h_hours: 24, sla_72h_hours: 72 },
    now: NOW,
  });
  assert.equal(snapshot.leads[0].batch_name, "Global Sources HK");
  assert.equal(snapshot.leads[0].latest_followup_id, "fu-1");
  assert.equal(snapshot.leads[0].latest_followup_status, "needs_review");
  assert.equal(snapshot.leads[0].sla_state, "green");
  assert.equal(snapshot.metrics.lead_count, 1);
  assert.equal(snapshot.metrics.sla_green_count, 1);
  assert.equal(snapshot.metrics.followups_needs_review, 1);
  assert.deepEqual(
    snapshot.sla_buckets.green.map((item) => item.lead_id),
    ["lead-1"],
  );
});

test("buildSnapshot picks the most recently created follow-up as the lead's latest", () => {
  const snapshot = buildSnapshot({
    leads: [{ __recordId: "lead-1", met_at: "2026-09-08T06:00:00.000Z", stage: "contacted" }],
    followups: [
      { __recordId: "fu-old", lead: "lead-1", status: "needs_review", created_at: "2026-09-01T00:00:00.000Z" },
      { __recordId: "fu-new", lead: "lead-1", status: "sent", created_at: "2026-09-08T00:00:00.000Z" },
    ],
    now: NOW,
  });
  assert.equal(snapshot.leads[0].latest_followup_id, "fu-new");
  assert.equal(snapshot.leads[0].latest_followup_status, "sent");
  // Excluded from every SLA bucket because its latest follow-up already sent.
  assert.equal(
    snapshot.sla_buckets.green.length + snapshot.sla_buckets.amber.length + snapshot.sla_buckets.red.length,
    0,
  );
});

test("buildConfigSummary parses the JSON-encoded reply templates and never leaks a secret value", () => {
  const summary = buildConfigSummary({
    sla_24h_hours: 24,
    sla_72h_hours: 72,
    reply_templates: JSON.stringify({ en: "Hi {name}, great meeting you at the show." }),
    whatsapp_account_env: "EXPO_WHATSAPP_TOKEN",
    email_account_env: "EXPO_EMAIL_SMTP",
  });
  assert.deepEqual(summary.thresholds, { sla24Hours: 24, sla72Hours: 72 });
  assert.equal(summary.reply_templates.en, "Hi {name}, great meeting you at the show.");
  assert.equal(summary.whatsapp_account_env, "EXPO_WHATSAPP_TOKEN");
  assert.equal(summary.email_account_env, "EXPO_EMAIL_SMTP");
  assert.equal(JSON.stringify(summary).includes("token"), false);
});

test("buildConfigSummary tolerates a missing or malformed Settings row", () => {
  const summary = buildConfigSummary();
  assert.deepEqual(summary.thresholds, { sla24Hours: 24, sla72Hours: 72 });
  assert.deepEqual(summary.reply_templates, {});
  const malformed = buildConfigSummary({ reply_templates: "{not json" });
  assert.deepEqual(malformed.reply_templates, {});
});
