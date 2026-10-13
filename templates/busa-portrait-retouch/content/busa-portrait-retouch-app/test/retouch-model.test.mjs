import assert from "node:assert/strict";
import test from "node:test";

import {
  candidateFields,
  candidateFromRow,
  demoSnapshot,
  flaggedChecks,
  metrics,
  onboardingFromRows,
  STATUSES,
  statusForDecision,
} from "../app/js/retouch-model.js";

test("decision lifecycle has one unambiguous next state", () => {
  assert.equal(statusForDecision("approve"), "approved");
  assert.equal(statusForDecision("request_changes"), "changes_requested");
  assert.equal(statusForDecision("block"), "blocked");
  assert.equal(statusForDecision("unknown"), "needs_review");
});

test("runtime onboarding remains distinct and validates the materialized config", () => {
  assert.equal(onboardingFromRows([]).state, "not_started");
  const complete = onboardingFromRows([
    {
      record_id: "config",
      onboarding_version: 1,
      completed_at: "2026-08-11T00:00:00.000Z",
      default_preset: "natural",
      default_strength: 35,
      metadata_policy: "strip",
      external_upload_policy: "explicit-only",
      overwrite_policy: "explicit-only",
    },
  ]);
  assert.equal(complete.state, "complete");
  assert.equal(complete.settings.default_strength, 35);
});

test("candidate rows round-trip JSON checks", () => {
  const fields = candidateFields({ candidate_id: "c1", job_id: "j1", checks: { identity: "pass" }, strength: 32 });
  assert.equal(typeof fields.checks, "string");
  const candidate = candidateFromRow(fields);
  assert.equal(candidate.candidate_id, "c1");
  assert.equal(candidate.strength, 32);
  assert.equal(candidate.checks.identity, "pass");
});

test("demo snapshot is deterministic and includes image assets", () => {
  const snapshot = demoSnapshot();
  assert.equal(snapshot.candidates.length, 8);
  assert.equal(snapshot.metrics.total, 8);
  // Every view has something to show in the demo.
  for (const status of STATUSES) assert.ok(snapshot.metrics[status] > 0, status);
  assert.match(snapshot.candidates[0].source_url, /portrait-source\.jpg$/);
  assert.deepEqual(metrics([]), { total: 0, needs_review: 0, approved: 0, done: 0, blocked: 0, changes_requested: 0 });
});

test("checks read both the CLI keys and the legacy skin_* keys", () => {
  const legacy = candidateFromRow({ checks: '{"skin_texture":"pass","identity":"pass","skin_tone":"review"}' });
  assert.deepEqual(legacy.checks, { texture: "pass", identity: "pass", tone: "review" });
  assert.equal(flaggedChecks(legacy), 1);
  assert.equal(flaggedChecks(candidateFromRow({ checks: "" })), 0);
});

test("a deliberate strength of 0 survives the row round-trip", () => {
  assert.equal(candidateFromRow({ strength: 0 }).strength, 0);
  assert.equal(candidateFromRow({ strength: "" }).strength, 35);
});
