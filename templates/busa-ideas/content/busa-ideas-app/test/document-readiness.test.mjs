import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, documentReadiness, handoffReadiness, normalizeGaps } from "../app/js/ideas-model.js";

const idea = { record_id: "idea-spec", title: "Reviewed product", stage: "prd",
  one_liner: "Route requests", who: "Operators", problem: "Lost requests", why_now: "Growing volume" };
const prd = { record_id: "prd-spec", idea_id: idea.record_id, kind: "prd", status: "已完善", body: "# Scope\nReviewed requirements.", gaps: [] };
const snapshot = (documents = [prd], extra = {}) => buildSnapshot({ ideas: [idea], documents, ...extra });

test("reaching PRD without a document never finalizes an idea", () => {
  const row = snapshot([]).ideas[0];
  assert.equal(row.advance.reason, "last_stage");
  assert.equal(row.advance.canAdvance, false);
  assert.equal(row.attention, "needs_document");
  assert.equal(row.handoff.ready, false);
  assert.ok(row.handoff.reasons.includes("missing_document"));
});

test("the reported draft with five gaps remains a draft in both model and clarity", () => {
  const draft = { ...prd, status: "草稿", gaps: ["audience", "scope", "recovery", "permissions", "acceptance"] };
  const row = snapshot([draft]).ideas[0];
  assert.equal(row.attention, "needs_document");
  assert.deepEqual(row.handoff.reasons, ["draft_status", "document_gaps"]);
  assert.equal(documentReadiness(row.documents.prd).ready, false);
  assert.ok(row.clarity < snapshot().ideas[0].clarity);
});

test("an inconsistent completed status with gaps never passes the document check", () => {
  const row = snapshot([{ ...prd, gaps: '["Missing validation"]' }]).ideas[0];
  assert.equal(row.handoff.ready, false);
  assert.deepEqual(row.documents.prd.gaps, ["Missing validation"]);
  assert.equal(documentReadiness(row.documents.prd).ready, false);
});

test("a blank body cannot pass with completed status and zero gaps", () => {
  assert.deepEqual(documentReadiness({ ...prd, body: " \n\t", gaps: "[]" }), { ready: false, reasons: ["empty_body"] });
  assert.equal(snapshot([{ ...prd, body: "" }]).ideas[0].handoff.ready, false);
});

test("gaps normalization omits whitespace but preserves unsupported and malformed values", () => {
  for (const value of ["{}", "null", "false", '""', '{"broken":', '["broken"', '[null]', '[false]', '[{}]']) {
    assert.ok(normalizeGaps(value).length, `must not erase ${value}`);
    assert.equal(documentReadiness({ ...prd, gaps: value }).ready, false);
  }
  assert.deepEqual(normalizeGaps('[" ", "\\n", "scope"]'), ["scope"]);
  assert.deepEqual(normalizeGaps("scope，permissions\nacceptance"), ["scope", "permissions", "acceptance"]);
  assert.deepEqual(normalizeGaps("[]"), []);
});

test("all required Idea information must be present before handoff", () => {
  for (const field of ["one_liner", "who", "problem", "why_now"]) {
    const row = snapshot([prd], { ideas: [{ ...idea, [field]: "  " }] }).ideas[0];
    assert.equal(row.handoff.ready, false);
    assert.ok(row.handoff.missingFields.includes(field));
  }
});

test("an unanswered question from any rung blocks handoff but another Idea does not", () => {
  for (const stage of ["idea", "brd", "mrd", "prd"]) {
    const question = { record_id: `q-${stage}`, idea_id: idea.record_id, stage, question: "Still unresolved?" };
    const row = snapshot([prd], { questions: [question] }).ideas[0];
    assert.equal(row.handoff.ready, false);
    assert.equal(row.attention, "needs_answer");
    assert.equal(snapshot([prd], { questions: [{ ...question, idea_id: "other" }] }).ideas[0].handoff.ready, true);
  }
});

test("the fully recorded PRD requests explicit human handoff confirmation", () => {
  const row = snapshot().ideas[0];
  assert.equal(row.handoff.ready, true);
  assert.deepEqual(row.handoff.reasons, []);
  assert.equal(row.attention, "ready_for_handoff");
  assert.equal(row.advance.canAdvance, false);
});

test("a ready current rung remains separate from document finalization", () => {
  const row = snapshot([], { ideas: [{ ...idea, stage: "mrd" }] }).ideas[0];
  assert.equal(row.advance.canAdvance, true);
  assert.equal(row.attention, "ready_for_agent");
  assert.equal(row.handoff.ready, false);
});

test("a truncated documents or questions page can never prove handoff readiness", () => {
  for (const completeness of [{ documents: false }, { questions: false }]) {
    for (const documents of [[], [prd]]) {
      const row = snapshot(documents, { completeness }).ideas[0];
      assert.equal(row.handoff.ready, false);
      assert.ok(row.handoff.reasons.includes("incomplete_reads"));
    }
  }
});

test("conflicting duplicate PRDs require reconciliation instead of choosing one as final", () => {
  assert.equal(handoffReadiness(idea, [], [prd, { ...prd, record_id: "second", status: "草稿" }]).ready, false);
  assert.ok(snapshot([prd, { ...prd, record_id: "second" }]).ideas[0].handoff.reasons.includes("duplicate_prd"));
});

test("parked ideas retain parked attention even with a complete PRD", () => {
  const row = snapshot([prd], { ideas: [{ ...idea, status: "已搁置" }] }).ideas[0];
  assert.equal(row.attention, "parked");
  assert.equal(row.handoff.ready, false);
});

const { applyRecheckedIdea, recheckIdea } = await import("../app/js/recheck-idea.js");

test("a late detail response cannot replace a different selection or refreshed snapshot", async () => {
  for (const invalidation of ["navigation", "refresh"]) {
    let finish;
    let selection = "idea-spec";
    let generation = 1;
    const changes = [];
    const task = recheckIdea({
      load: () => new Promise((resolve) => { finish = resolve; }),
      isCurrent: () => selection === "idea-spec" && generation === 1,
      apply: (value) => changes.push(value),
    });
    if (invalidation === "navigation") selection = "another-idea";
    else generation = 2;
    finish({ idea });
    assert.equal(await task, false);
    assert.deepEqual(changes, []);
  }
});

test("an explicit recheck applies a current result, and a failed read remains retryable", async () => {
  const changes = [];
  await assert.rejects(recheckIdea({ load: async () => { throw new Error("Offline"); }, isCurrent: () => true,
    apply: (value) => changes.push(value) }), /Offline/);
  assert.deepEqual(changes, []);
  assert.equal(await recheckIdea({ load: async () => ({ idea }), isCurrent: () => true,
    apply: (value) => changes.push(value) }), true);
  assert.equal(changes[0].idea.record_id, idea.record_id);
});

const { projectQuestionReviews } = await import("../app/js/providers/busabase-provider.js");

test("scoped review projection retains a half-merged required pair alongside an ordinary pending answer", () => {
  const rawIdea = { ...idea, stage: "brd", why_now: "", __recordId: "rec-canonical-idea" };
  const required = { record_id: "required-why", __recordId: "rec-required", idea_id: idea.record_id, stage: "brd",
    target_field: "why_now", question: "Why now?", answer: "New opportunity", status: "answered" };
  const ordinary = { record_id: "followup", __recordId: "rec-followup", idea_id: idea.record_id,
    stage: "brd", question: "Which operator?", answer: "", status: "open" };
  const pendingIdea = [{ targetRecordId: rawIdea.__recordId, headCommit: { payload: { "why-now": required.answer } } }];
  const questionRequests = [{ id: "cr-followup", status: "in_review", operations: [
    { targetRecordId: ordinary.__recordId, headCommit: { payload: { answer: "Support team", status: "answered" } } },
  ] }];
  const project = (questionRows, pendingQuestionRequests, ideaOperations) => projectQuestionReviews({
    ideasRows: [rawIdea], questionRows, snapshot: buildSnapshot({ ideas: [rawIdea], questions: questionRows }),
    reviewQuestions: [], rejectedAnswers: new Map(), questionRequests: pendingQuestionRequests,
    rejectedRequests: [], pendingQuestionOperations: pendingQuestionRequests.flatMap((request) => request.operations),
    pendingIdeaOperations: ideaOperations,
  });
  const pending = project([required, ordinary], questionRequests, pendingIdea);
  assert.deepEqual(new Set(pending.pendingAnswers), new Set([required.record_id, ordinary.record_id]));
  assert.equal(pending.pendingDrafts[required.record_id], required.answer);
  assert.equal(pending.pendingDrafts[ordinary.record_id], "Support team");
  assert.equal(pending.questionReviews[ordinary.record_id].requestId, "cr-followup");
  // When the ordinary request merges, its card clears while the required
  // Idea half remains pending. The exact raw Idea id is essential here.
  const refreshed = project([required, { ...ordinary, answer: "Support team", status: "answered" }], [], pendingIdea);
  assert.deepEqual(refreshed.pendingAnswers, [required.record_id]);
  assert.equal(refreshed.questionReviews[ordinary.record_id], undefined);
});


test("a selected Idea recheck refreshes loaded sidebar counters and preserves the workspace total", () => {
  const snapshot = {
    ideas: [
      { record_id: "selected", attention: "ready_for_agent" },
      { record_id: "other-waiting", attention: "needs_answer" },
      { record_id: "other-parked", attention: "parked" },
    ],
    counts: { total: 128, needsAnswer: 1, readyForAgent: 1, parked: 1 },
    completeness: { questions: false },
  };
  const completeness = snapshot.completeness;
  applyRecheckedIdea(snapshot, { record_id: "selected", attention: "needs_answer" });
  assert.deepEqual(snapshot.counts, { total: 128, needsAnswer: 2, readyForAgent: 0, parked: 1 });
  assert.equal(snapshot.completeness, completeness);
  assert.equal(snapshot.ideas[1].record_id, "other-waiting");
  applyRecheckedIdea(snapshot, { record_id: "selected", attention: "ready_for_handoff" });
  assert.deepEqual(snapshot.counts, { total: 128, needsAnswer: 1, readyForAgent: 0, parked: 1 });
});
