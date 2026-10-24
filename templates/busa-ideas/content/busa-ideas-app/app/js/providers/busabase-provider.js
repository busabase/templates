import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
  detectAirAppRuntime,
} from "../../vendor/busabase-airapp.js";
import { reviewInboxUrl } from "../review-link.js";
import { OPEN_REVIEW_STATUSES, questionReview, submitOrdinaryQuestion } from "../question-review.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.2.1";
import {
  buildSnapshot,
  parseRequiredQuestionId,
  requiredQuestionId,
  REQUIRED_QUESTION_TEXT,
  REQUIRED_TO_LEAVE,
} from "../ideas-model.js?v=0.2.1";

const runtime = await detectAirAppRuntime();

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
const ANSWER_ACTIONS = new Set(["answer", "skip", "park", "advance"]);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
const pendingAnswers = new Set();
const submittedQuestionAnswers = new Map();

export function pendingRequiredFieldUpgrade(requests, baseId, fieldSlug) {
  return requests.find((request) =>
    request.baseId === baseId &&
    request.sourceMeta?.subject === "base_field" &&
    request.sourceMeta?.fieldSlug === fieldSlug &&
    request.operations?.some((operation) =>
      operation.operation === "base_add_field" && operation.headCommit?.payload?.slug === fieldSlug,
    ),
  );
}

export function requiredFieldUpgradeError(request, otherRepairs = []) {
  const remaining = otherRepairs.length
    ? ` Other resource upgrades remain: ${otherRepairs.map((item) => item.resourceKey).join(", ")}.`
    : "";
  return request.status === "rejected"
    ? `SETUP_REJECTED: Field upgrade ${request.id} was rejected. Review its reason in the Inbox before retrying setup.${remaining}`
    : `SETUP_PENDING: Existing field upgrade ${request.id} awaits Space admin approval.${remaining}`;
}

async function guardPendingRequiredFieldUpgrade(resources) {
  const questionBase = resources.bases.find((entry) => entry.key === "questions");
  if (!questionBase || !resources.repairs.some((repair) => repair.resourceKey === "questions")) return;
  const detail = await runtimeClient.bases.get({ baseId: questionBase.baseId });
  if (detail.fields?.some((field) => field.slug === "target-field")) return;
  if (!allowedReads.has("changeRequests.list")) throw new Error("PROCEDURE_DENIED: changeRequests.list");
  const result = await runtimeClient.changeRequests.list({
    affectsNodeId: questionBase.nodeId,
    status: ["in_review", "changes_requested", "approved", "rejected"],
    limit: 20,
  });
  const existing = pendingRequiredFieldUpgrade(result.changeRequests, questionBase.baseId, "target-field");
  if (existing) {
    const others = resources.repairs.filter((repair) => repair.resourceKey !== "questions");
    throw new Error(requiredFieldUpgradeError(existing, others));
  }
  if (result.nextCursor) {
    throw new Error("SETUP_PENDING: More than 20 recent changes affect Questions; check the Inbox before retrying setup.");
  }
}

async function pendingChanges(key, strict = true) {
  if (!allowedReads.has("changeRequests.list")) throw new Error("PROCEDURE_DENIED: changeRequests.list");
  const result = await runtimeClient.changeRequests.list({
    affectsNodeId: base(key).nodeId,
    status: OPEN_REVIEW_STATUSES,
    limit: 20,
  });
  if (strict && result.nextCursor) {
    throw new Error("More than 20 pending changes affect this Base. Review its Inbox before submitting another answer.");
  }
  return result.changeRequests.flatMap((request) => request.operations || []);
}

async function readQuestionReviews(status, strict = true) {
  if (!allowedReads.has("changeRequests.list")) throw new Error("PROCEDURE_DENIED: changeRequests.list");
  const result = await runtimeClient.changeRequests.list({ affectsNodeId: base("questions").nodeId, status, limit: 20 });
  if (strict && result.nextCursor) {
    throw new Error("More than 20 Question changes match this review check. Open the Workspace Inbox before submitting again.");
  }
  return result;
}

export function pendingQuestionAnswer(operations, questionId, existingRecordId) {
  return operations.find((operation) => {
    const fields = operation.headCommit?.payload || {};
    return Object.hasOwn(fields, "answer") &&
      (fields["record-id"] === questionId || (existingRecordId && operation.targetRecordId === existingRecordId));
  })?.headCommit?.payload?.answer;
}

export function pendingIdeaAnswer(operations, ideaRecordId, field) {
  return operations.find(
    (operation) => operation.targetRecordId === ideaRecordId &&
      Object.hasOwn(operation.headCommit?.payload || {}, field.replaceAll("_", "-")),
  )?.headCommit?.payload?.[field.replaceAll("_", "-")];
}

export function reviewBlockingQuestions(ideas, questions, pendingOperations, rejectedRequests) {
  const canonicalIds = new Set(questions.map((question) => question.record_id));
  const rejectedAnswers = new Map();
  const rejectedMapped = [];
  for (const operation of rejectedRequests.flatMap((request) => request.operations || [])) {
    const fields = operation.headCommit?.payload || {};
    const required = parseRequiredQuestionId(fields["record-id"]);
    const id = fields["record-id"];
    const ideaId = fields["idea-id"] || required?.ideaId;
    const field = fields["target-field"] || required?.field;
    if (!id || !ideaId || !field || !Object.hasOwn(REQUIRED_QUESTION_TEXT, field)) continue;
    if (!rejectedAnswers.has(id)) rejectedAnswers.set(id, String(fields.answer || ""));
    rejectedMapped.push({ id, ideaId, field, stage: fields.stage, answer: String(fields.answer || "") });
  }
  const pendingQuestions = pendingOperations
    .map((operation) => operation.headCommit?.payload || {})
    .filter((fields) => fields["record-id"] && fields["idea-id"] && fields["target-field"] && fields.answer)
    .filter((fields) => !canonicalIds.has(fields["record-id"]))
    .map((fields) => ({
      record_id: fields["record-id"], idea_id: fields["idea-id"], stage: fields.stage,
      question: fields.question, target_field: fields["target-field"], answer: "", status: "open",
    }));
  const pendingIds = new Set(pendingQuestions.map((question) => question.record_id));
  const recoveryQuestions = ideas.flatMap((idea) =>
    (REQUIRED_TO_LEAVE[idea.stage || "idea"] || []).flatMap((field) => {
      const rejected = rejectedMapped.find((item) =>
        item.ideaId === idea.record_id && item.field === field && (!item.stage || item.stage === idea.stage),
      );
      const id = rejected?.id || requiredQuestionId(idea.record_id, field);
      const rejectedAnswer = rejected?.answer;
      if (!rejectedAnswer || idea[field] !== rejectedAnswer || canonicalIds.has(id) || pendingIds.has(id)) return [];
      return [{ record_id: id, idea_id: idea.record_id, stage: idea.stage,
        question: REQUIRED_QUESTION_TEXT[field], target_field: field, answer: "", status: "open", recovery: true }];
    }),
  );
  return { questions: [...pendingQuestions, ...recoveryQuestions], rejectedAnswers };
}

export function rejectedQuestionMapping(requests, questionId, ideaId, targetField) {
  const operation = requests.flatMap((request) => request.operations || []).find((item) => {
    const fields = item.headCommit?.payload || {};
    return fields["record-id"] === questionId && fields["idea-id"] === ideaId &&
      fields["target-field"] === targetField;
  });
  return operation ? { ideaId, field: targetField } : null;
}

async function readRejectedQuestionRequests(strict = true) {
  if (!allowedReads.has("changeRequests.list")) throw new Error("PROCEDURE_DENIED: changeRequests.list");
  const result = await runtimeClient.changeRequests.list({
    affectsNodeId: base("questions").nodeId,
    status: ["rejected"],
    limit: 20,
  });
  if (strict && result.nextCursor) {
    throw new Error("More than 20 rejected Question changes exist. Review the Inbox before advancing this idea.");
  }
  return result.changeRequests;
}

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
    await guardPendingRequiredFieldUpgrade(resources);
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

// Record reads and writes go through the SDK's helpers, bound to this app's client.
// A person's write leaves `autoMerge` unset, so Busabase decides from their own
// permission: it lands now with write access and becomes a ChangeRequest without
// it. The response says which happened; `isAirAppWriteQueued` reads it.
const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });

// One page per call, cursor returned to the caller -- never several pages in
// one function call. A capped loop here (however high the cap) still hides a
// multi-page scan behind a single loading state instead of fetching a page
// per user action; the cap only bounds how bad that gets, it doesn't fix the
// shape. ideas and questions surface the returned nextCursor through a
// numbered pager in the UI (see app.js#goToPage). documents and settings are
// read once on boot: documents are looked up by idea rather than browsed as
// their own list (at most three per idea), and settings is a handful of rows.
// If either genuinely outgrows one page in practice, it needs the same pager
// treatment ideas/questions already got, not a bigger cap.
async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
}

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({
      baseId: declared.baseId,
      ...(filters ? { filters } : {}),
    });
    return total;
  } catch {
    return null;
  }
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const { response } = await sdkRecords().upsert({
    baseId: declared.baseId,
    fieldSlug: idFieldSlug,
    valueText: idValue,
    fields: toBusabaseFields(fields),
    message,
  });
  return response;
}

async function readSettingsRows() {
  const { rows } = await readPage("settings");
  return new Map(rows.map((row) => [row.record_id || row.kind, row]));
}

function parsePayload(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function configSummary(operatorPayload, channelsPayload) {
  const channels = Array.isArray(channelsPayload.channels) ? channelsPayload.channels : [];
  return {
    config_path: "busabase:base/busa-ideas-settings",
    is_example: false,
    operator: {
      name: operatorPayload.name || "",
      role: operatorPayload.role || "",
      company: operatorPayload.company || "",
      timezone: operatorPayload.timezone || "",
    },
    pipeline_stages: Array.isArray(operatorPayload.pipeline_stages) ? operatorPayload.pipeline_stages : undefined,
    base_currency: operatorPayload.base_currency || "USD",
    style_tone: operatorPayload.style_tone || "",
    channels: channels.map((channel) => ({
      channel_id: channel.channel_id || "",
      type: channel.type || "",
      display_name: channel.display_name || channel.channel_id || "",
      handoff_skill: channel.handoff_skill || "",
      secrets_ready: Boolean(channel.vault_ref),
    })),
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [ideasPage, documentsPage, questionsPage, settings, ideaCount] = await Promise.all([
      readPage("ideas"),
      readPage("documents"),
      readPage("questions"),
      readSettingsRows(),
      countRecords("ideas"),
    ]);
    const [questionReviews, pendingIdeaOperations] = await Promise.all([
      readQuestionReviews(OPEN_REVIEW_STATUSES, false),
      pendingChanges("ideas", false),
    ]);
    const pendingQuestionOperations = questionReviews.changeRequests.flatMap((request) => request.operations || []);
    const rejectedQuestions = await readRejectedQuestionRequests(false);
    const { questions: reviewQuestions, rejectedAnswers } = reviewBlockingQuestions(
      ideasPage.rows,
      questionsPage.rows,
      pendingQuestionOperations,
      rejectedQuestions,
    );
    const snapshot = buildSnapshot({
      ideas: ideasPage.rows,
      documents: documentsPage.rows,
      questions: [...questionsPage.rows, ...reviewQuestions],
    });
    pendingAnswers.clear();
    const ideaRecordIds = new Map(ideasPage.rows.map((row) => [row.record_id, row.__recordId]));
    const pendingDrafts = {};
    const ordinaryReviews = {};
    for (const question of questionsPage.rows.filter((item) => !item.target_field)) {
      const reviews = questionReview(questionReviews.changeRequests, question.record_id, question.__recordId);
      if (!reviews.length) {
        const rejected = questionReview(rejectedQuestions, question.record_id, question.__recordId)[0];
        if (rejected && !["answered", "skipped"].includes(question.status)) {
          ordinaryReviews[question.record_id] = rejected;
          pendingDrafts[question.record_id] = rejected.answer;
        }
        continue;
      }
      ordinaryReviews[question.record_id] = reviews[0];
      pendingAnswers.add(question.record_id);
      pendingDrafts[question.record_id] = reviews[0].answer;
    }
    for (const question of reviewQuestions.filter((item) => item.recovery)) {
      pendingDrafts[question.record_id] = rejectedAnswers.get(question.record_id);
    }
    for (const idea of snapshot.ideas) {
      for (const question of idea.questions.filter((item) => item.target_field)) {
        const questionAnswer = pendingQuestionAnswer(pendingQuestionOperations, question.record_id);
        const ideaAnswer = pendingIdeaAnswer(pendingIdeaOperations, ideaRecordIds.get(idea.record_id), question.target_field);
        if (questionAnswer || ideaAnswer) pendingDrafts[question.record_id] = questionAnswer || ideaAnswer;
        if (questionAnswer && (ideaAnswer === questionAnswer || idea[question.target_field] === questionAnswer)) {
          pendingAnswers.add(question.record_id);
        }
        if (ideaAnswer && question.answer === ideaAnswer) pendingAnswers.add(question.record_id);
      }
    }
    // buildSnapshot only ever sees the first loaded page, so counts.total
    // undercounts once there is more than one page. Overwrite with the real
    // total from records.count; a null (permission denied, or the call failed)
    // falls back to what is loaded rather than showing nothing.
    if (ideaCount !== null) snapshot.counts.total = ideaCount;
    const operatorRow = settings.get("busa-ideas-operator") || {};
    const lockRow = settings.get("busa-ideas-lock") || {};
    const operatorPayload = parsePayload(operatorRow.payload);
    const summary = configSummary(operatorPayload, {});
    return {
      app: "busa-ideas",
      data_provider: "busabase",
      onboarding: { completed: Boolean(operatorRow.record_id), config_version: "1" },
      lock: lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null,
      config_summary: summary,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
      pendingAnswers: [...pendingAnswers],
      pendingDrafts,
      questionReviews: ordinaryReviews,
      reviewReadIncomplete: Boolean(questionReviews.nextCursor),
      reviewInboxUrl: await reviewInboxUrl({ hosted: runtime.hosted }),
      // Seeds app.js's page-cursor cache: the cursor needed to fetch page 2 of
      // each Base that has its own browsed list view (page 1 was just fetched
      // above). Settings is read once; see the comment on readPage.
      pagination: { ideas: ideasPage.nextCursor, questions: questionsPage.nextCursor },
    };
  },

  // Fetches exactly one page for a paginated Base and returns it for the
  // caller to display -- this function never loops or fetches more than one
  // page itself, so a mistaken call site can't silently reintroduce the
  // eager multi-page shape this replaced.
  async fetchPage(key, cursor) {
    await ensureResources();
    return readPage(key, cursor);
  },

  async readLock() {
    const settings = await readSettingsRows();
    const lockRow = settings.get("busa-ideas-lock") || {};
    return lockRow.locked ? { locked: true, message: lockRow.message || "", owner: lockRow.owner || "" } : null;
  },

  // The operator's only write from the UI: answering (or skipping) a
  // consultant question, parking an idea, or advancing a rung. Advancing is
  // gated on the model's own advanceCheck rather than the caller's say-so, so
  // the ladder cannot be skipped by a crafted request.
  async applyDecision(payload = {}) {
    const action = String(payload.action || "");
    if (!ANSWER_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
    const lock = await this.readLock();
    if (lock) throw new Error(lock.message || "Agent lock is active; the vault is read-only right now.");
    await ensureResources();
    const now = new Date().toISOString();

    if (action === "answer" || action === "skip") {
      const questionId = String(payload.question_id || "");
      if (!questionId) throw new Error("question_id is required");
      const answer = action === "answer" ? String(payload.answer || "") : "";
      if (action === "answer" && !answer.trim()) throw new Error("An answer cannot be empty");
      const required = parseRequiredQuestionId(questionId);
      const existingQuestion = await findRecord("questions", "record-id", questionId);
      const questionFields = normalizeFields(
        existingQuestion?.headCommit?.payload || existingQuestion?.headCommit?.fields || existingQuestion?.fields,
      );
      const recovered = !existingQuestion && !required && payload.idea_id && payload.target_field
        ? rejectedQuestionMapping(
          await readRejectedQuestionRequests(), questionId, String(payload.idea_id), String(payload.target_field),
        )
        : null;
      const targetField = questionFields.target_field || required?.field || recovered?.field || "";
      if (targetField) {
        if (action === "skip") throw new Error("A required field question cannot be skipped");
        const ideaId = questionFields.idea_id || required?.ideaId || recovered?.ideaId;
        if (!ideaId || (required && ideaId !== required.ideaId)) throw new Error("Invalid required question mapping");
        const ideaRecord = await findRecord("ideas", "record-id", ideaId);
        if (!ideaRecord) throw new Error(`Unknown idea: ${ideaId}`);
        const ideaFields = normalizeFields(
          ideaRecord.headCommit?.payload || ideaRecord.headCommit?.fields || ideaRecord.fields,
        );
        const stage = ideaFields.stage || "idea";
        if (!REQUIRED_TO_LEAVE[stage]?.includes(targetField)) {
          throw new Error("This required field is no longer on the current stage; refresh the idea");
        }
        if (existingQuestion && questionFields.target_field !== targetField) {
          throw new Error("Existing question has no required field mapping");
        }
        const [questionOperations, ideaOperations] = await Promise.all([
          pendingChanges("questions"),
          pendingChanges("ideas"),
        ]);
        const pendingQuestion = pendingQuestionAnswer(questionOperations, questionId, existingQuestion?.id);
        const pendingIdea = pendingIdeaAnswer(ideaOperations, ideaRecord.id, targetField);
        const canonicalIdeaAnswer = String(ideaFields[targetField] || "");
        const canonicalQuestionAnswer = String(questionFields.answer || "");
        if (canonicalIdeaAnswer && canonicalIdeaAnswer !== answer) {
          throw new Error("The Idea field has a different answer; refresh the idea before editing it");
        }
        if (canonicalQuestionAnswer && canonicalQuestionAnswer !== answer) {
          throw new Error("The Question has a different answer; refresh the idea before editing it");
        }
        if (canonicalIdeaAnswer === answer && canonicalQuestionAnswer === answer) {
          return { updated_at: now, pending: false, change_request_id: "" };
        }
        if ((pendingQuestion && pendingQuestion !== answer) || (pendingIdea && pendingIdea !== answer)) {
          throw new Error("A different answer for this required field is awaiting review; check the Inbox before resubmitting");
        }
        const submittedAnswer = submittedQuestionAnswers.get(questionId);
        if (submittedAnswer && submittedAnswer !== answer) {
          throw new Error("This question already has a submitted answer awaiting review; refresh after review");
        }
        if ((pendingQuestion === answer || canonicalQuestionAnswer === answer) &&
          (pendingIdea === answer || canonicalIdeaAnswer === answer)) {
          pendingAnswers.add(questionId);
          return { updated_at: now, pending: true, change_request_id: "" };
        }
        let questionResult;
        let ideaResult;
        if (!pendingQuestion && !submittedAnswer && canonicalQuestionAnswer !== answer) {
          questionResult = await upsert(
            "questions",
            "record-id",
            questionId,
            {
              record_id: questionId,
              idea_id: ideaId,
              stage,
              question: questionFields.question || REQUIRED_QUESTION_TEXT[targetField],
              target_field: targetField,
              answer,
              status: "answered",
              answered_at: now,
            },
            `Answered required question ${questionId}`,
          );
          submittedQuestionAnswers.set(questionId, answer);
        }
        try {
          if (pendingIdea !== answer && canonicalIdeaAnswer !== answer) {
            ideaResult = await upsert(
              "ideas",
              "record-id",
              ideaId,
              { record_id: ideaId, [targetField]: answer, updated_at: now },
              `Synced ${targetField} from question ${questionId}`,
            );
          }
        } catch (error) {
          throw new Error(`Question answer was submitted, but the Idea update failed: ${String(error?.message || error)}`);
        }
        // Pending if either write was queued just now, or if an earlier
        // ChangeRequest for the same answer is still waiting for approval.
        const queued = [questionResult, ideaResult].find(isAirAppWriteQueued);
        const pending = Boolean(queued || pendingQuestion || pendingIdea);
        if (pending) pendingAnswers.add(questionId);
        return { updated_at: now, pending, change_request_id: queued?.id || "" };
      }
      if (!existingQuestion) throw new Error(`Unknown question: ${questionId}`);
      if (!allowedWrites.has("bases.createBulkUpdateChangeRequest")) {
        throw new Error("PROCEDURE_DENIED: bases.createBulkUpdateChangeRequest");
      }
      return submitOrdinaryQuestion({
        client: runtimeClient, declared: base("questions"), existing: existingQuestion,
        questionId, action, answer, now, submittedBy: appConfig.appId,
        readReviews: async (status) => (await readQuestionReviews(status)).changeRequests,
      });
    }

    const ideaId = String(payload.idea_id || "");
    if (!ideaId) throw new Error("idea_id is required");

    if (action === "park") {
      const result = await upsert(
        "ideas",
        "record-id",
        ideaId,
        { record_id: ideaId, status: "已搁置", notes: String(payload.comment || ""), updated_at: now },
        `Parked idea ${ideaId}`,
      );
      return {
        updated_at: now,
        pending: isAirAppWriteQueued(result),
        change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
      };
    }

    // Re-read review state as well as canonical rows before every advance.
    const [ideasPage, questionsPage, pendingQuestionOperations, rejectedQuestions] = await Promise.all([
      readPage("ideas"),
      readPage("questions"),
      pendingChanges("questions"),
      readRejectedQuestionRequests(),
    ]);
    const reviewQuestions = reviewBlockingQuestions(
      ideasPage.rows, questionsPage.rows, pendingQuestionOperations, rejectedQuestions,
    ).questions;
    const snapshot = buildSnapshot({
      ideas: ideasPage.rows,
      questions: [...questionsPage.rows, ...reviewQuestions],
    });
    const idea = snapshot.ideas.find((row) => row.record_id === ideaId);
    if (!idea) throw new Error(`Unknown idea: ${ideaId}`);
    if (!idea.advance.canAdvance) {
      const blocked = idea.advance.missingFields.length
        ? `missing ${idea.advance.missingFields.join(", ")}`
        : `${idea.advance.openQuestions.length} unanswered question(s)`;
      throw new Error(`This idea cannot advance yet: ${blocked}`);
    }
    const result = await upsert(
      "ideas",
      "record-id",
      ideaId,
      { record_id: ideaId, stage: idea.advance.target, updated_at: now },
      `Advanced idea ${ideaId} to ${idea.advance.target}`,
    );
    return {
      updated_at: now,
      stage: idea.advance.target,
      pending: isAirAppWriteQueued(result),
      change_request_id: isAirAppWriteQueued(result) ? result?.id || "" : "",
    };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    runtimeClient = client;
    try {
      const resources = await inspectProvisionedResources(client, appConfig);
      await guardPendingRequiredFieldUpgrade(resources);
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
