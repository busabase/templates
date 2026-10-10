import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../app/js/config.js";
import {
  advanceCheck,
  attentionFor,
  buildSnapshot,
  clarityFor,
  missingForStage,
  nextStage,
  normalizeQuestionRow,
  parseRequiredQuestionId,
  questionsForIdea,
  requiredQuestionId,
} from "../app/js/ideas-model.js";
import {
  pendingIdeaAnswer,
  pendingQuestionAnswer,
  pendingRequiredFieldUpgrade,
  rejectedQuestionMapping,
  reviewBlockingQuestions,
  requiredFieldUpgradeError,
} from "../app/js/providers/busabase-provider.js";

const demoProviderModule = "../app/js/providers/demo-provider.js";
const { demoSnapshot } = await import(demoProviderModule);

test("every Base read stays within the Busabase records.list limit", () => {
  for (const base of appConfig.bases) {
    assert.ok(
      Number.isInteger(base.readLimit) && base.readLimit >= 1 && base.readLimit <= 100,
      `${base.key}: ${base.readLimit}`,
    );
  }
});

test("demo snapshots load deterministic workflow scenes", () => {
  const overview = demoSnapshot("overview");
  assert.equal(overview.ideas.length, 4);
  assert.equal(overview.counts.parked, 1);

  const ready = demoSnapshot("ready");
  assert.deepEqual(
    ready.ideas.map((idea) => idea.record_id),
    ["idea-email"],
  );
  assert.equal(ready.ideas[0].documents.prd.status, "已完善");

  const needsAnswer = demoSnapshot("needs-answer");
  assert.ok(needsAnswer.counts.needsAnswer > 0);
});

test("completed demo documents are decision-grade and visually structured", () => {
  const overview = demoSnapshot("overview");
  const email = overview.ideas.find((idea) => idea.record_id === "idea-email");
  assert.deepEqual(
    Object.values(email.documents)
      .filter(Boolean)
      .map((document) => document.kind)
      .sort(),
    ["brd", "mrd", "prd"],
  );

  for (const idea of overview.ideas) {
    const answeredQuestionIds = new Set(
      idea.questions.filter((question) => question.status === "answered").map((question) => question.record_id),
    );
    const completedDocuments = Object.values(idea.documents).filter((document) => document?.status === "已完善");
    for (const document of completedDocuments) {
      assert.match(document.body, /^#\s+.+/m, `${document.kind} should start with a document title`);
      assert.match(document.body, /^>\s+.+/m, `${document.kind} should start with a decision summary`);
      assert.match(document.body, /\|\s*---\s*\|/, `${document.kind} should include a decision table`);
      assert.match(document.body, /```mermaid\n/, `${document.kind} should include a meaningful diagram`);
      const provenance = [...document.body.matchAll(/\[Q:([^\]]+)\]/g)].map((match) => match[1]);
      assert.ok(provenance.length > 0, `${document.kind} should cite answered consultant questions`);
      for (const questionId of provenance) {
        assert.ok(
          answeredQuestionIds.has(questionId),
          `${document.kind} cites unanswered or missing question ${questionId}`,
        );
      }

      const requiredByKind = {
        brd: [
          /业务目标|business objective/i,
          /成功标准|success metric/i,
          /风险|risk/i,
          /非目标|不做|non-goal|out of scope/i,
        ],
        mrd: [/ICP|target market/i, /替代|竞品|alternative|competitor/i, /定价|pricing/i, /验证|validation/i],
        prd: [
          /用户故事|user stor/i,
          /功能需求|functional requirement/i,
          /失败|恢复|error|recovery/i,
          /非目标|non-goal|out of scope/i,
          /验收|acceptance/i,
        ],
      };
      for (const pattern of requiredByKind[document.kind]) {
        assert.match(document.body, pattern, `${document.kind} is missing a document-specific decision section`);
      }
    }
  }
});

const vagueIdea = {
  record_id: "idea-1",
  title: "帮人做点什么",
  stage: "idea",
};

const sharpIdea = {
  record_id: "idea-2",
  title: "外贸邮件审批台",
  one_liner: "帮外贸老板在一个界面里批准今天该回的邮件",
  who: "有自己邮箱的小型外贸公司老板",
  problem: "邮件太多，重要的和不重要的混在一起，回复慢丢单",
  why_now: "AI 现在能读懂邮件语义了",
  stage: "brd",
};

test("nextStage walks the ladder and stops at prd", () => {
  assert.equal(nextStage("idea"), "brd");
  assert.equal(nextStage("brd"), "mrd");
  assert.equal(nextStage("mrd"), "prd");
  assert.equal(nextStage("prd"), null);
});

test("a vague idea cannot leave the idea rung", () => {
  const check = advanceCheck(vagueIdea, []);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "missing_fields");
  assert.deepEqual(check.missingFields, ["one_liner", "who"]);
});

test("missing required fields appear as stable answerable questions", () => {
  const snapshot = buildSnapshot({ ideas: [vagueIdea] });
  const questions = snapshot.ideas[0].questions;
  assert.deepEqual(questions.map((question) => question.target_field), ["one_liner", "who"]);
  assert.ok(questions.every((question) => question.status === "open" && question.generated));
  assert.equal(snapshot.ideas[0].open_questions, 2);
  assert.deepEqual(parseRequiredQuestionId(requiredQuestionId("idea:one", "why_now")), {
    ideaId: "idea:one",
    field: "why_now",
  });
  assert.equal(parseRequiredQuestionId("required:idea-1:unsupported"), null);
});

test("a mapped question is reused while an unrelated older question stays separate", () => {
  const idea = { ...sharpIdea, why_now: "" };
  const mapped = normalizeQuestionRow({ record_id: "q-why", idea_id: idea.record_id, stage: "brd",
    question: "为什么现在？", target_field: "why_now", answer: "已有回答但 Idea 未同步" });
  const unrelated = normalizeQuestionRow({ record_id: "q-old", idea_id: idea.record_id, stage: "brd",
    question: "为什么现在？" });
  const questions = questionsForIdea(idea, [mapped, unrelated]);
  assert.equal(questions.length, 2);
  assert.equal(questions.find((q) => q.target_field === "why_now").record_id, "q-why");
  assert.equal(questions.find((q) => q.target_field === "why_now").status, "open");
  assert.equal(questions.find((q) => q.record_id === "q-old").target_field, "");
});

test("six answered BRD follow-ups do not hide the missing why-now entry", () => {
  const idea = { ...sharpIdea, why_now: "" };
  const questions = Array.from({ length: 6 }, (_, index) => ({ record_id: `q-${index}`, idea_id: idea.record_id,
    stage: "brd", question: `追问 ${index}`, answer: `回答 ${index}`, status: "answered" }));
  const actual = buildSnapshot({ ideas: [idea], questions }).ideas[0];
  assert.equal(actual.questions.length, 7);
  assert.deepEqual(actual.questions.filter((question) => question.status === "open").map((question) => question.target_field), ["why_now"]);
  assert.deepEqual(actual.advance.missingFields, ["why_now"]);
});

test("why-now demo reproduces six answered follow-ups and one required question", () => {
  const idea = demoSnapshot("why-now").ideas[0];
  assert.equal(idea.stage, "brd");
  assert.equal(idea.questions.filter((question) => question.status === "answered").length, 6);
  assert.deepEqual(idea.questions.filter((question) => question.status === "open").map((question) => question.target_field), ["why_now"]);
});

test("a rejected mapped Question blocks advancement after the Idea field merges", () => {
  const recovery = { record_id: requiredQuestionId(sharpIdea.record_id, "why_now"), idea_id: sharpIdea.record_id,
    stage: "brd", target_field: "why_now", question: "为什么现在？", recovery: true };
  const actual = buildSnapshot({ ideas: [sharpIdea], questions: [recovery] }).ideas[0];
  assert.equal(actual.advance.canAdvance, false);
  assert.equal(actual.advance.reason, "open_questions");
  assert.equal(actual.questions[0].recovery, true);
});

test("advance gate stays blocked when Idea merges before its required Question", () => {
  const questionId = requiredQuestionId(sharpIdea.record_id, "why_now");
  const payload = { "record-id": questionId, "idea-id": sharpIdea.record_id,
    "target-field": "why_now", stage: "brd", question: "为什么现在？", answer: sharpIdea.why_now };
  const pending = [{ headCommit: { payload } }];
  const rejected = [{ operations: [{ headCommit: { payload } }] }];
  for (const [pendingOperations, rejectedRequests] of [[pending, []], [[], rejected]]) {
    const review = reviewBlockingQuestions([sharpIdea], [], pendingOperations, rejectedRequests);
    const snapshot = buildSnapshot({ ideas: [sharpIdea], questions: review.questions });
    assert.equal(snapshot.ideas[0].advance.canAdvance, false);
    assert.equal(snapshot.ideas[0].advance.reason, "open_questions");
    assert.equal(review.questions.length, 1);
  }
});

test("a rejected mapped Question with an older ID also blocks advancement", () => {
  const rejected = [{ operations: [{ headCommit: { payload: {
    "record-id": "q-existing", "idea-id": sharpIdea.record_id, "target-field": "why_now",
    stage: "brd", answer: sharpIdea.why_now,
  } } }] }];
  const review = reviewBlockingQuestions([sharpIdea], [], [], rejected);
  assert.equal(review.questions[0].record_id, "q-existing");
  assert.equal(buildSnapshot({ ideas: [sharpIdea], questions: review.questions }).ideas[0].advance.canAdvance, false);
  assert.deepEqual(rejectedQuestionMapping(rejected, "q-existing", sharpIdea.record_id, "why_now"), {
    ideaId: sharpIdea.record_id, field: "why_now",
  });
  assert.equal(rejectedQuestionMapping(rejected, "q-existing", "another-idea", "why_now"), null);
});

test("pending ChangeRequests match the exact required Question and Idea field", () => {
  const operations = [
    { targetRecordId: null, headCommit: { payload: { "record-id": "required:idea-2:why_now", answer: "现在能做" } } },
    { targetRecordId: "rec-idea-2", headCommit: { payload: { "why-now": "现在能做" } } },
    { targetRecordId: "rec-other", headCommit: { payload: { "why-now": "别人的回答" } } },
  ];
  assert.equal(pendingQuestionAnswer(operations, "required:idea-2:why_now"), "现在能做");
  assert.equal(pendingQuestionAnswer(operations, "required:idea-3:why_now"), undefined);
  assert.equal(pendingIdeaAnswer(operations, "rec-idea-2", "why_now"), "现在能做");
  assert.equal(pendingIdeaAnswer(operations, "rec-idea-2", "problem"), undefined);
});

test("only an exact Questions field upgrade blocks a repeated schema request", () => {
  const fieldOperation = [{ operation: "base_add_field", headCommit: { payload: { slug: "target-field" } } }];
  const requests = [
    { id: "other-base", baseId: "bas-ideas", sourceMeta: { subject: "base_field", fieldSlug: "target-field" }, operations: fieldOperation },
    { id: "other-field", baseId: "bas-questions", sourceMeta: { subject: "base_field", fieldSlug: "notes" }, operations: fieldOperation },
    { id: "matching", baseId: "bas-questions", sourceMeta: { subject: "base_field", fieldSlug: "target-field" }, operations: fieldOperation },
  ];
  assert.equal(pendingRequiredFieldUpgrade(requests, "bas-questions", "target-field")?.id, "matching");
  assert.equal(pendingRequiredFieldUpgrade(requests.slice(0, 2), "bas-questions", "target-field"), undefined);
  const rejected = { ...requests[2], id: "rejected", status: "rejected" };
  assert.equal(pendingRequiredFieldUpgrade([rejected, ...requests], "bas-questions", "target-field")?.status, "rejected");
  assert.match(requiredFieldUpgradeError(rejected, [{ resourceKey: "ideas" }]), /SETUP_REJECTED:.*Inbox.*ideas/);
  assert.match(requiredFieldUpgradeError({ ...requests[2], status: "in_review" }), /SETUP_PENDING:/);
});

test("filling the required fields opens the gate", () => {
  const idea = { ...vagueIdea, one_liner: "一句话", who: "某类人" };
  assert.deepEqual(missingForStage(idea, "idea"), []);
  assert.equal(advanceCheck(idea, []).canAdvance, true);
});

test("an open question blocks advancement even when fields are filled", () => {
  const questions = [{ idea_id: "idea-2", stage: "brd", status: "open", question: "谁已经试过？" }];
  const check = advanceCheck(sharpIdea, questions);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "open_questions");
  assert.equal(check.openQuestions.length, 1);
});

test("a question on another rung does not block this one", () => {
  const questions = [{ idea_id: "idea-2", stage: "mrd", status: "open", question: "定价？" }];
  assert.equal(advanceCheck(sharpIdea, questions).canAdvance, true);
});

test("a parked idea never advances", () => {
  const parked = { ...sharpIdea, status: "已搁置" };
  const check = advanceCheck(parked, []);
  assert.equal(check.canAdvance, false);
  assert.equal(check.reason, "parked");
  assert.equal(attentionFor(parked, []), "parked");
});

test("an emptied answer reopens the question regardless of stored status", () => {
  const row = normalizeQuestionRow({ idea_id: "i", question: "q", answer: "  ", status: "answered" });
  assert.equal(row.status, "open");
});

test("a skipped question stays skipped and does not block", () => {
  const row = normalizeQuestionRow({ idea_id: "idea-2", stage: "brd", question: "q", status: "skipped" });
  assert.equal(row.status, "skipped");
  assert.equal(advanceCheck(sharpIdea, [row]).canAdvance, true);
});

test("clarity rises as the ladder is climbed", () => {
  const vague = clarityFor(vagueIdea, [], []);
  const sharp = clarityFor(sharpIdea, [], []);
  assert.ok(sharp > vague, `expected ${sharp} > ${vague}`);
  assert.ok(vague >= 0 && sharp <= 100);
});

test("buildSnapshot derives counts, attention, and per-kind documents", () => {
  const snapshot = buildSnapshot({
    ideas: [vagueIdea, sharpIdea],
    documents: [{ record_id: "d1", idea_id: "idea-2", kind: "brd", status: "已完善", body: "..." }],
    questions: [{ record_id: "q1", idea_id: "idea-1", stage: "idea", question: "给谁用？", position: 1 }],
  });

  assert.equal(snapshot.counts.total, 2);
  assert.equal(snapshot.counts.needsAnswer, 1);
  assert.equal(snapshot.counts.readyForAgent, 1);

  const vague = snapshot.ideas.find((i) => i.record_id === "idea-1");
  assert.equal(vague.attention, "needs_answer");
  assert.equal(vague.open_questions, 3);

  const sharp = snapshot.ideas.find((i) => i.record_id === "idea-2");
  assert.equal(sharp.documents.brd.status, "已完善");
  assert.equal(sharp.documents.mrd, null);
  assert.equal(sharp.attention, "ready_for_agent");
});

test("derived clarity overrides a stale stored score", () => {
  const snapshot = buildSnapshot({ ideas: [{ ...vagueIdea, clarity: 99 }] });
  assert.notEqual(snapshot.ideas[0].clarity, 99);
});
