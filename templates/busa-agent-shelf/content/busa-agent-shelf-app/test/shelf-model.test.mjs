import assert from "node:assert/strict";
import test from "node:test";
import { demoRows } from "../app/js/providers/demo-data.js";
import {
  attentionList,
  checkDates,
  choiceIds,
  decideFix,
  filterObservations,
  freshness,
  isUnsourced,
  normalizeFix,
  normalizeObservation,
  normalizeQuestion,
  normalizeSettings,
  positionGrid,
  rankCompetitors,
  relationId,
  reviewQueue,
  shareOfShelf,
} from "../app/js/shelf-model.js";

const q = (id, fields = {}) =>
  normalizeQuestion({ __recordId: id, question: `Q ${id}`, priority: "medium", status: "tracking", ...fields });
const o = (id, question, agent, day, position, fields = {}) =>
  normalizeObservation({
    __recordId: id,
    title: id,
    question,
    agent,
    "checked-on": day,
    "our-position": position,
    ...fields,
  });
const f = (id, fields = {}) =>
  normalizeFix({
    __recordId: id,
    title: `Fix ${id}`,
    product: "SKU",
    "proposed-value": "x",
    source: "Spec sheet",
    risk: "low",
    status: "proposed",
    ...fields,
  });

test("normalizers coerce the API's value shapes", () => {
  assert.equal(relationId("recabc"), "recabc");
  assert.equal(relationId(["recabc"]), "recabc");
  assert.equal(relationId({ id: "recabc", name: "x" }), "recabc");
  assert.deepEqual(choiceIds('["chatgpt","gemini"]'), ["chatgpt", "gemini"]);
  assert.deepEqual(choiceIds([{ id: "chatgpt" }]), ["chatgpt"]);
  const row = o("r1", ["recq"], { id: "gemini", name: "Gemini" }, "2026-09-24T00:00:00.000Z", "2");
  assert.equal(row.question, "recq");
  assert.equal(row.agent, "gemini");
  assert.equal(row.checked_on, "2026-09-24");
  assert.equal(row.our_position, 2);
  assert.equal(normalizeObservation({}).our_position, 0);
  assert.equal(normalizeSettings(null), null);
});

test("share of shelf: latest date, share of tracked questions shown, delta vs previous", () => {
  const questions = [q("q1"), q("q2"), q("q3", { status: "paused" })];
  const observations = [
    o("a", "q1", "chatgpt", "2026-09-24", 2),
    o("b", "q2", "chatgpt", "2026-09-24", 0),
    o("c", "q3", "chatgpt", "2026-09-24", 1), // paused: excluded
    o("d", "q1", "chatgpt", "2026-09-17", 0),
    o("e", "q2", "chatgpt", "2026-09-17", 0),
    o("f", "q1", "gemini", "2026-09-24", 1),
  ];
  const result = shareOfShelf({ questions, observations, settings: { agents: ["chatgpt", "gemini", "perplexity"] } });
  assert.equal(result.latest, "2026-09-24");
  assert.equal(result.previous, "2026-09-17");
  const [chatgpt, gemini, perplexity] = result.agents;
  assert.deepEqual([chatgpt.shown, chatgpt.total, chatgpt.share, chatgpt.previous_share, chatgpt.delta], [1, 2, 0.5, 0, 0.5]);
  assert.equal(gemini.share, 1);
  assert.equal(gemini.delta, null, "no previous check for gemini → no delta");
  assert.equal(perplexity.share, null, "configured but not checked → null, not 0");
});

test("share of shelf counts an answer whose question is not loaded", () => {
  const result = shareOfShelf({ questions: [], observations: [o("a", "recunloaded", "chatgpt", "2026-09-24", 3)] });
  assert.equal(result.agents[0].share, 1);
});

test("share of shelf matches the canonical demo dataset", () => {
  const questions = demoRows.questions.map(normalizeQuestion);
  const observations = demoRows.observations.map(normalizeObservation);
  const settings = normalizeSettings(demoRows.settings[0]);
  const result = shareOfShelf({ questions, observations, settings });
  const byAgent = Object.fromEntries(result.agents.map((item) => [item.agent, item]));
  assert.equal(result.latest, "2026-09-24");
  assert.equal(result.previous, "2026-09-17");
  assert.deepEqual(Object.keys(byAgent), ["chatgpt", "gemini", "meta-muse", "amazon-rufus"]);
  assert.equal(byAgent.chatgpt.share, 0.6);
  assert.ok(Math.abs(byAgent.chatgpt.delta - 0.2) < 1e-9);
  assert.equal(byAgent.gemini.share, 0.8);
  assert.ok(Math.abs(byAgent.gemini.delta - 0.4) < 1e-9);
  assert.equal(byAgent["meta-muse"].share, 0.8);
  assert.ok(Math.abs(byAgent["meta-muse"].delta - 0.6) < 1e-9);
  assert.equal(byAgent["amazon-rufus"].share, 0.8);
});

test("position grid shows each agent's latest position per question", () => {
  const questions = [q("low", { priority: "low" }), q("high", { priority: "high" })];
  const observations = [
    o("a", "high", "chatgpt", "2026-09-17", 3),
    o("b", "high", "chatgpt", "2026-09-24", 0),
    o("c", "low", "gemini", "2026-09-24", 1),
    o("d", "recmissing", "gemini", "2026-09-24", 2),
  ];
  const grid = positionGrid({ questions, observations });
  assert.deepEqual(grid.agents, ["chatgpt", "gemini"]);
  assert.deepEqual(
    grid.rows.map((row) => row.question.id),
    ["high", "low", "recmissing"],
    "high priority first, unloaded question last",
  );
  assert.equal(grid.rows[0].cells[0].position, 0, "latest (0) wins over the earlier #3");
  assert.equal(grid.rows[0].cells[1].position, null, "not checked");
  assert.equal(grid.rows[2].loaded, false);
});

test("attention list: high-priority not shown, proposed, open high-risk, unsourced", () => {
  const questions = [q("h1", { priority: "high" }), q("h2", { priority: "high" }), q("m1")];
  const observations = [
    o("a", "h1", "chatgpt", "2026-09-24", 0, { "picked-instead": "Tidewell" }),
    o("b", "h1", "gemini", "2026-09-24", 0),
    o("c", "h2", "chatgpt", "2026-09-24", 2),
    o("d", "m1", "chatgpt", "2026-09-24", 0),
    o("e", "h2", "chatgpt", "2026-09-17", 0),
  ];
  const fixes = [
    f("p", {}),
    f("hr", { risk: "high", status: "changes-requested" }),
    f("hr-done", { risk: "high", status: "applied" }),
    f("none", { source: "(none)", status: "blocked" }),
    f("empty", { source: "  ", status: "approved" }),
    f("quiet", { status: "approved" }),
  ];
  const result = attentionList({ questions, observations, fixes });
  assert.deepEqual(
    result.missing.map((item) => item.question.id),
    ["h1"],
  );
  assert.equal(result.missing[0].picked_instead, "Tidewell");
  const reasons = Object.fromEntries(result.fixes.map((item) => [item.fix.id, item.reasons]));
  assert.deepEqual(reasons.p, ["proposed"]);
  assert.deepEqual(reasons.hr, ["high-risk"]);
  assert.equal(reasons["hr-done"], undefined, "an applied high-risk fix no longer needs attention");
  assert.deepEqual(reasons.none, ["unsourced"]);
  assert.deepEqual(reasons.empty, ["unsourced"]);
  assert.equal(reasons.quiet, undefined);
  assert.deepEqual(result.counts, { missing: 1, proposed: 1, highRisk: 1, unsourced: 2 });
});

test("attention ignores high-priority questions not checked on the latest date", () => {
  const result = attentionList({
    questions: [q("h1", { priority: "high" })],
    observations: [o("a", "other", "chatgpt", "2026-09-24", 1), o("b", "h1", "chatgpt", "2026-09-17", 0)],
  });
  assert.equal(result.missing.length, 0);
});

test("unsourced detection", () => {
  assert.equal(isUnsourced(f("a", { source: "" })), true);
  assert.equal(isUnsourced(f("a", { source: "(None)" })), true);
  assert.equal(isUnsourced(f("a", { source: "Supplier sheet" })), false);
});

test("decideFix writes only status and decision-note", () => {
  assert.deepEqual(decideFix(f("a"), "approve", ""), { status: "approved", "decision-note": "" });
  assert.deepEqual(decideFix(f("a", { status: "changes-requested" }), "block", " not sourced "), {
    status: "blocked",
    "decision-note": "not sourced",
  });
  assert.deepEqual(decideFix(f("a"), "request-changes", "cite page"), {
    status: "changes-requested",
    "decision-note": "cite page",
  });
  assert.throws(() => decideFix(f("a"), "request-changes", "  "), /NOTE_REQUIRED/);
  assert.throws(() => decideFix(f("a"), "block"), /NOTE_REQUIRED/);
  assert.throws(() => decideFix(f("a", { status: "applied" }), "approve"), /only proposed/);
  assert.throws(() => decideFix(f("a"), "merge"), /Unsupported/);
});

test("review queue, answer filters and competitor ranking", () => {
  const queue = reviewQueue([
    f("x", { status: "applied" }),
    f("y", { status: "proposed", risk: "low" }),
    f("z", { status: "proposed", risk: "high" }),
  ]);
  assert.deepEqual(
    queue.map((fix) => fix.id),
    ["z", "y", "x"],
  );
  const observations = [
    o("a", "q1", "chatgpt", "2026-09-17", 0, { "reason-given": "warranty listed" }),
    o("b", "q1", "gemini", "2026-09-24", 1),
    o("c", "q2", "chatgpt", "2026-09-24", 0),
  ];
  assert.deepEqual(
    filterObservations(observations, { agent: "chatgpt" }).map((row) => row.id),
    ["c", "a"],
  );
  assert.deepEqual(
    filterObservations(observations, { question: "q1", query: "WARRANTY" }).map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(checkDates(observations), ["2026-09-24", "2026-09-17"]);
  const ranked = rankCompetitors(demoRows.competitors.map((row) => ({ ...row, product: row.product, times_picked: row["times-picked"] })));
  assert.equal(ranked[0].product, "Brightline Roamer 21");
});

test("freshness follows the configured cadence", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  assert.deepEqual(freshness({ latest: "2026-09-24", cadence: "weekly", now }), { stale: true, days: 11, limit: 7 });
  assert.equal(freshness({ latest: "2026-09-24", cadence: "biweekly", now }).stale, false);
  assert.equal(freshness({ latest: "", now }).stale, false);
});

test("demo rows use API shapes: bare record ids and relations as record ids", () => {
  const ids = new Set(demoRows.questions.map((row) => row.__recordId));
  for (const row of demoRows.observations) {
    assert.match(row.__recordId, /^rec_demo_[a-z0-9]{12}$/);
    assert.ok(ids.has(row.question), `${row.title} relation resolves to a loaded question id`);
  }
});
