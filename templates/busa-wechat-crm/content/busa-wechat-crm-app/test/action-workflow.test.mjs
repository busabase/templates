import assert from "node:assert/strict";
import test from "node:test";
import {
  actionMatchesFilter,
  buildOutcomeWorklog,
  buildWaitAction,
  isTerminalAction,
  outcomeStatus,
} from "../app/js/action-workflow.js";

const action = {
  id: "action-1",
  fields: { title: "给 Lina 发试用邀请", goal: ["goal-1"], person: ["person-1"] },
};

test("action filters separate active and terminal states", () => {
  assert.equal(actionMatchesFilter({ fields: { status: "needs-review" } }, "review"), true);
  assert.equal(actionMatchesFilter({ fields: { status: "done" } }, "review"), false);
  assert.equal(actionMatchesFilter({ fields: { status: "done" } }, "closed"), true);
  assert.equal(isTerminalAction("done"), true);
  assert.equal(isTerminalAction("awaiting-result"), false);
});

test("an observed outcome creates a linked worklog payload", () => {
  const fields = buildOutcomeWorklog({
    action,
    outcome: "已发送介绍，对方说周五前回复。",
    operationKey: "op-1",
    now: "2026-08-26T08:00:00.000Z",
  });
  assert.deepEqual(fields.goal, ["goal-1"]);
  assert.deepEqual(fields.person, ["person-1"]);
  assert.deepEqual(fields.action, ["action-1"]);
  assert.equal(fields.status, "pending-agent");
  assert.equal(fields["operation-key"], "op-1");
});

test("waiting for a reply stays open and creates a traceable child action", () => {
  assert.equal(outcomeStatus("sent-awaiting-reply"), "awaiting-result");
  assert.equal(outcomeStatus("positive-reply"), "done");
  const fields = buildWaitAction({
    action,
    operationKey: "op-1",
    dueAt: "2026-08-29T08:00:00.000Z",
  });
  assert.deepEqual(fields["parent-action"], ["action-1"]);
  assert.equal(fields.status, "snoozed");
  assert.equal(fields["action-type"], "wait");
});
