import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_REVIEW_STATUSES, questionReview, submitOrdinaryQuestion } from "../app/js/question-review.js";
import { inboxFromDashboard, inboxFromHostedFrame } from "../app/js/review-link.js";

const existing = { id: "rec-question", headCommitId: "commit-open", headCommit: { payload: {
  "record-id": "q-followup", status: "open", answer: "", "idea-id": "idea", question: "Who has tried this?",
} } };
const request = (id, status = "in_review", answer = "Two pilot customers", action = "answer") => ({
  id, status, operations: [{ targetRecordId: existing.id, headCommit: { payload: { answer, status: action === "skip" ? "skipped" : "answered" } } }],
});

function harness({ immediate = false } = {}) {
  const requests = [];
  const accepted = new Map();
  const calls = [];
  let lostResponse = false;
  let hiddenReviews = false;
  const client = { bases: { async createBulkUpdateChangeRequest(input) {
    calls.push(input);
    // Simulate the API's unique-key guarantee, including requests that raced
    // before either client saw the first submission in the review list.
    if (!accepted.has(input.idempotencyKey)) {
      const value = request(`cr-${accepted.size + 1}`, immediate ? "merged" : "in_review",
        input.updates[0].fields.answer, input.updates[0].fields.status === "skipped" ? "skip" : "answer");
      accepted.set(input.idempotencyKey, value);
      requests.unshift(value);
    }
    if (lostResponse) { lostResponse = false; throw new Error("Connection reset after server accepted write"); }
    return accepted.get(input.idempotencyKey);
  } } };
  const options = { client, declared: { baseId: "base-questions" }, existing, questionId: "q-followup",
    action: "answer", answer: "Two pilot customers", now: "2026-10-24T00:00:00Z", submittedBy: "busa-ideas",
    readReviews: async (statuses) => hiddenReviews ? [] : requests.filter((item) => statuses.includes(item.status)),
  };
  return { requests, accepted, calls, options, loseResponse() { lostResponse = true; }, hideReviews() { hiddenReviews = true; } };
}

test("ordinary answer keeps one review across refresh/retry and preserves the exact draft", async () => {
  const h = harness();
  const first = await submitOrdinaryQuestion(h.options);
  assert.equal(first.pending, true);
  const afterRefresh = await submitOrdinaryQuestion({ ...h.options });
  assert.equal(afterRefresh.change_request_id, first.change_request_id);
  assert.equal(h.accepted.size, 1);
  assert.equal(h.calls.length, 1);
  const review = questionReview(h.requests, "q-followup", existing.id)[0];
  assert.equal(review.answer, h.options.answer);
  assert.equal(existing.headCommit.payload.status, "open", "a pending answer does not alter the canonical row");
  assert.ok(!Object.hasOwn(h.calls[0], "autoMerge"));
  assert.equal(h.calls[0].updates[0].baseCommitId, existing.headCommitId);
});

test("an empty skipped answer is pending and blocks an answer or a second different action", async () => {
  const h = harness();
  const options = { ...h.options, action: "skip", answer: "" };
  const first = await submitOrdinaryQuestion(options);
  assert.equal(first.pending, true);
  assert.equal(questionReview(h.requests, "q-followup", existing.id)[0].action, "skip");
  await submitOrdinaryQuestion(options);
  await assert.rejects(submitOrdinaryQuestion(h.options), /different answer or skip/);
  assert.equal(h.accepted.size, 1);
});

test("a different pending answer and a conflict are protected from overwrite", async () => {
  const h = harness();
  h.requests.push(request("cr-other", "conflict", "Different draft"));
  await assert.rejects(submitOrdinaryQuestion(h.options), /different answer or skip/);
  const same = await submitOrdinaryQuestion({ ...h.options, answer: "Different draft" });
  assert.equal(same.change_request_id, "cr-other");
  assert.equal(h.calls.length, 0);
});

test("concurrent identical submissions and an ambiguous timeout use the server key", async () => {
  const h = harness();
  h.hideReviews();
  await Promise.all([submitOrdinaryQuestion(h.options), submitOrdinaryQuestion(h.options)]);
  assert.equal(h.accepted.size, 1);
  assert.equal(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
  const retry = harness();
  retry.hideReviews();
  retry.loseResponse();
  await assert.rejects(submitOrdinaryQuestion(retry.options), /Connection reset/);
  await submitOrdinaryQuestion(retry.options);
  assert.equal(retry.accepted.size, 1);
});

test("rejected or closed attempts may be retried without reusing their terminal request", async () => {
  for (const terminal of ["rejected", "abandoned"]) {
    const h = harness();
    await submitOrdinaryQuestion(h.options);
    h.requests[0].status = terminal;
    const second = await submitOrdinaryQuestion(h.options);
    assert.equal(h.accepted.size, 2);
    assert.equal(second.change_request_id, "cr-2");
    assert.notEqual(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
  }
});

test("insufficient review visibility fails closed, before creating a write", async () => {
  const h = harness();
  await assert.rejects(submitOrdinaryQuestion({ ...h.options,
    readReviews: async () => { throw new Error("More than 20 Question changes match this review check"); },
  }), /More than 20/);
  assert.equal(h.calls.length, 0);
});

test("write-access result is immediately saved and a canonical repeat is a no-op", async () => {
  const h = harness({ immediate: true });
  assert.equal((await submitOrdinaryQuestion(h.options)).pending, false);
  const canonical = { ...existing, headCommit: { payload: { status: "answered", answer: h.options.answer } } };
  const result = await submitOrdinaryQuestion({ ...h.options, existing: canonical });
  assert.equal(result.pending, false);
  assert.equal(h.calls.length, 1);
  await assert.rejects(submitOrdinaryQuestion({ ...h.options, existing: canonical, answer: "Replacement" }), /already been answered/);
});

test("matching is exact by record or business id, unrelated updates are ignored", () => {
  assert.equal(questionReview([request("one")], "same-text-but-other-id", "another-record").length, 0);
  const byId = { id: "business", status: "in_review", operations: [{ headCommit: { payload: { "record-id": "q-followup", answer: "draft" } } }] };
  assert.equal(questionReview([byId], "q-followup")[0].answer, "draft");
  assert.equal(questionReview([{ ...byId, operations: [{ targetRecordId: existing.id, headCommit: { payload: { question: "Rephrased" } } }] }], "q-followup", existing.id).length, 0);
  assert.ok(OPEN_REVIEW_STATUSES.includes("conflict"));
});

test("review links use the actual Cloud, workspace subdomain, or OSS dashboard", () => {
  assert.equal(inboxFromDashboard("https://busabase.com/dashboard/org1/airapp/busa-ideas"), "https://busabase.com/dashboard/org1/inbox");
  assert.equal(inboxFromDashboard("https://team.busabase.com/dashboard/airapp/busa-ideas"), "https://team.busabase.com/dashboard/inbox");
  assert.equal(inboxFromDashboard("http://localhost:15576/dashboard/local/airapp/busa-ideas"), "http://localhost:15576/dashboard/local/inbox");
  assert.equal(inboxFromDashboard("javascript:alert(1)"), "");
  assert.equal(inboxFromDashboard("https://preview.example/app/"), "");
});

test("changes requested remains an active review, reuses its request and refuses a replacement", async () => {
  const h = harness();
  h.requests.push(request("cr-revise-existing", "changes_requested"));
  const result = await submitOrdinaryQuestion(h.options);
  assert.equal(result.pending, true);
  assert.equal(result.change_request_id, "cr-revise-existing");
  await assert.rejects(submitOrdinaryQuestion({ ...h.options, answer: "Revised answer" }), /different answer or skip/);
  await assert.rejects(submitOrdinaryQuestion({ ...h.options, action: "skip", answer: "" }), /different answer or skip/);
  assert.equal(h.calls.length, 0, "revision must remain on the existing review, not create a second one");
  assert.equal(questionReview(h.requests, "q-followup", existing.id)[0].reviewStatus, "changes_requested");
});


test("hosted Nodepod resolves its real parent dashboard when frame referrer is empty or only an origin", () => {
  for (const referrer of ["", "http://127.0.0.1:15577/"]) {
    assert.equal(inboxFromHostedFrame({ parentUrl: "http://127.0.0.1:15577/dashboard/local/airapp/busa-ideas-app",
      referrer, locationUrl: "http://127.0.0.1:15577/" }), "http://127.0.0.1:15577/dashboard/local/inbox");
  }
  assert.equal(inboxFromHostedFrame({ parentUrl: "https://team.busabase.com/dashboard/airapp/busa-ideas-app",
    referrer: "https://team.busabase.com/", locationUrl: "https://team.busabase.com/" }), "https://team.busabase.com/dashboard/inbox");
  assert.equal(inboxFromHostedFrame({ referrer: "https://busabase.com/", locationUrl: "https://preview.example/" }), "");
});
