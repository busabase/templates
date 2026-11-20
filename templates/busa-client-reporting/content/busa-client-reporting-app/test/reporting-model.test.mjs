import assert from "node:assert/strict";
import test from "node:test";
import { buildClientReport, buildSnapshot, INTERNAL_FIELDS, metricChange } from "../app/js/reporting-model.js";

// ── Metric change calculation (computed, never stored) ───────────────────
test("metricChange computes change vs previous and vs target as fractions", () => {
  const change = metricChange({ value: 110, previous_value: 100, target: 120 });
  assert.equal(change.vs_previous, 0.1);
  assert.ok(Math.abs(change.vs_target - -0.0833333333) < 1e-9);
  assert.ok(Math.abs(change.target_progress - 110 / 120) < 1e-12);
});

test("metricChange handles declines and negative-free zero guards", () => {
  assert.equal(metricChange({ value: 90, previous_value: 100, target: null }).vs_previous, -0.1);
  assert.equal(metricChange({ value: 50, previous_value: 0, target: 0 }).vs_previous, null);
  assert.equal(metricChange({ value: 50, previous_value: 0, target: 0 }).vs_target, null);
  assert.equal(metricChange({ value: 50 }).vs_previous, null);
  assert.equal(metricChange({ value: null, previous_value: 10, target: 20 }).vs_previous, null);
});

test("metricChange works on the demo-shaped KPI (sessions)", () => {
  const change = metricChange({ value: 48200, previous_value: 44100, target: 50000 });
  assert.ok(Math.abs(change.vs_previous - 4100 / 44100) < 1e-12);
  assert.ok(Math.abs(change.target_progress - 0.964) < 1e-12);
});

// ── Snapshot rollups ──────────────────────────────────────────────────────
const RAW = {
  clients: [
    { __recordId: "c1", client_name: "Client One", status: "active", reporting_cadence: "monthly", notes: "SECRET-CLIENT-NOTE" },
    { __recordId: "c2", client_name: "Client Two", status: "paused", notes: "" },
  ],
  projects: [
    { __recordId: "p1", project_name: "P1", client: "c1", status: "in-progress", owner: "SECRET-OWNER", summary: "Public summary" },
    { __recordId: "p2", project_name: "P2", client: "c1", status: "at-risk", owner: "SECRET-OWNER" },
  ],
  deliverables: [
    { __recordId: "d1", deliverable: "D1", project: "p1", client: "c1", status: "sent-to-client", notes: "SECRET-DELIVERABLE-NOTE" },
    { __recordId: "d2", deliverable: "D2", project: "p1", client: "c1", status: "approved", notes: "" },
  ],
  metrics: [
    { __recordId: "m1", metric_label: "Sessions — October", client: "c1", metric: "sessions", period: "2026-10", value: 110, previous_value: 100, target: 120, unit: "count", notes: "SECRET-METRIC-NOTE" },
  ],
  milestones: [
    { __recordId: "ms1", milestone: "Launch", project: "p1", client: "c1", status: "done", due_date: "2026-10-10", completed_date: "2026-10-09", notes: "Visible milestone note" },
  ],
  reports: [
    { __recordId: "r1", report_title: "Client One — October", client: "c1", period: "2026-10", status: "shared", executive_summary: "Good month.", highlights: "Up.", risks_blockers: "SECRET-RISKS", next_steps: "Keep going.", shared_link_note: "Emailed 2026-11-04" },
    { __recordId: "r2", report_title: "Client One — November draft", client: "c1", period: "2026-11", status: "draft", executive_summary: "SECRET-DRAFT", risks_blockers: "SECRET-RISKS-2", next_steps: "Draft steps" },
  ],
};

test("buildSnapshot rollups count active projects and deliverables awaiting the client", () => {
  const snapshot = buildSnapshot(RAW);
  const rollup = snapshot.rollups.find((row) => row.client.__recordId === "c1");
  assert.equal(rollup.active_projects, 2);
  assert.equal(rollup.projects_at_risk, 1);
  assert.equal(rollup.deliverables_awaiting_client, 1);
  assert.equal(rollup.latest_report_status, "draft"); // newest period first
  assert.equal(snapshot.counts.reports_shared, 1);
});

// ── Client page: internal-field exclusion ─────────────────────────────────
test("INTERNAL_FIELDS names every internal field the bases carry", () => {
  assert.deepEqual(INTERNAL_FIELDS.clients, ["notes"]);
  assert.deepEqual(INTERNAL_FIELDS.projects, ["owner"]);
  assert.deepEqual(INTERNAL_FIELDS.deliverables, ["notes"]);
  assert.deepEqual(INTERNAL_FIELDS.metrics, ["notes"]);
  assert.deepEqual(INTERNAL_FIELDS.reports, ["risks_blockers"]);
});

test("buildClientReport excludes every internal field and secret value", () => {
  const snapshot = buildSnapshot(RAW);
  const page = buildClientReport(snapshot, "c1", "2026-10");
  assert.ok(page);
  const serialized = JSON.stringify(page);
  for (const secret of ["SECRET-CLIENT-NOTE", "SECRET-OWNER", "SECRET-DELIVERABLE-NOTE", "SECRET-METRIC-NOTE", "SECRET-RISKS", "SECRET-DRAFT"]) {
    assert.ok(!serialized.includes(secret), `client page leaked ${secret}`);
  }
  for (const field of ["notes", "owner", "risks_blockers", "risksBlockers"]) {
    assert.ok(!(field in page.report), `report carries ${field}`);
    assert.ok(!(field in page.client), `client carries ${field}`);
  }
  assert.equal(page.report.executive_summary, "Good month.");
  assert.equal(page.kpis[0].change.vs_previous, 0.1);
  // Milestone notes are client-visible by design (not in INTERNAL_FIELDS).
  assert.equal(page.milestones[0].notes, "Visible milestone note");
});

test("buildClientReport never surfaces a Draft report as the client page", () => {
  const snapshot = buildSnapshot(RAW);
  const page = buildClientReport(snapshot, "c1", "2026-11");
  assert.equal(page.report, null);
});

test("buildClientReport returns null for an unknown client", () => {
  const snapshot = buildSnapshot(RAW);
  assert.equal(buildClientReport(snapshot, "nope"), null);
});
