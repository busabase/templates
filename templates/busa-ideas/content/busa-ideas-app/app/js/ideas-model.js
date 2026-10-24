// Pure domain logic for busa-ideas: turn normalized Busabase records (one array
// per Base, snake_case field keys) into the snapshot the UI renders.
//
// The ladder gate lives here rather than in a view, because "can this idea
// advance?" is the one rule the whole product exists to enforce, and it has to
// give the same answer to the UI, the tests, and the Agent.

export const STAGES = ["idea", "brd", "mrd", "prd"];
export const DOC_KINDS = ["brd", "mrd", "prd"];
export const QUESTION_STATUS = ["open", "answered", "skipped"];

// What must be answered before an idea may climb off a rung. Keyed by the rung
// being left, so REQUIRED_TO_LEAVE.idea is what it takes to earn a BRD.
export const REQUIRED_TO_LEAVE = {
  idea: ["one_liner", "who"],
  brd: ["problem", "why_now"],
  mrd: [],
  prd: [],
};

export const REQUIRED_QUESTION_TEXT = {
  one_liner: "请用一句话说清楚这个想法要做什么？",
  who: "这个想法首先是为谁解决问题？",
  problem: "他们现在遇到的具体问题是什么？",
  why_now: "为什么现在是做这件事的合适时机？",
};

export function requiredQuestionId(ideaId, field) {
  return `required:${encodeURIComponent(ideaId)}:${field}`;
}

export function parseRequiredQuestionId(id) {
  const match = /^required:([^:]+):([a-z_]+)$/.exec(id);
  if (!match || !Object.hasOwn(REQUIRED_QUESTION_TEXT, match[2])) return null;
  try {
    return { ideaId: decodeURIComponent(match[1]), field: match[2] };
  } catch {
    return null;
  }
}

const STATUS_PARKED = "已搁置";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

// Gaps are blocking omissions. Invalid legacy text must remain visible rather
// than becoming an empty list and accidentally passing the handoff check.
export function normalizeGaps(value) {
  if (value === null || value === undefined) return [];
  let entries = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : [value.trim()];
    }
    catch { entries = value.split(/[,，\n]/); }
  }
  if (!Array.isArray(entries)) entries = [entries];
  return entries
    .map((entry) => typeof entry === "string" ? entry.trim() : JSON.stringify(entry))
    .filter(Boolean);
}

// This checks declared, canonical data, not the semantic quality of the prose.
// The Agent/operator still owns the professional-document review protocol.
export function documentReadiness(document) {
  if (!document) return { ready: false, reasons: ["missing_document"] };
  const reasons = [];
  if (isBlank(document.body)) reasons.push("empty_body");
  if (document.status !== "已完善") reasons.push("draft_status");
  if (normalizeGaps(document.gaps).length) reasons.push("document_gaps");
  return { ready: reasons.length === 0, reasons };
}

export function handoffReadiness(idea, questions = [], documents = [], completeness = {}) {
  const prds = asArray(documents).filter((doc) => doc.idea_id === idea.record_id && doc.kind === "prd");
  const document = prds[0] || null;
  const missingFields = Object.keys(REQUIRED_QUESTION_TEXT).filter((field) => isBlank(idea[field]));
  const openQuestions = asArray(questions).filter((q) => q.idea_id === idea.record_id && q.status === "open");
  const reasons = [...documentReadiness(document).reasons];
  if (prds.length > 1) reasons.push("duplicate_prd");
  if (missingFields.length) reasons.push("missing_fields");
  if (openQuestions.length) reasons.push("open_questions");
  if (completeness.documents === false || completeness.questions === false) reasons.push("incomplete_reads");
  if (idea.stage !== "prd") reasons.push("not_at_prd");
  if (idea.status === STATUS_PARKED) reasons.push("parked");
  return { ready: reasons.length === 0, reasons, missingFields, openQuestions, document };
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBlank(value) {
  return !String(value ?? "").trim();
}

// One normalizer per Base, each exported so a later page appended to an
// already-normalized snapshot runs the exact same coercion the first page did.
// A second hand-copied normalizer diverges the moment either side gains a field.
export function normalizeIdeaRow(row) {
  return {
    record_id: row.record_id || "",
    title: row.title || "",
    one_liner: row.one_liner || "",
    problem: row.problem || "",
    who: row.who || "",
    why_now: row.why_now || "",
    stage: STAGES.includes(row.stage) ? row.stage : "idea",
    status: row.status || "",
    clarity: toNumber(row.clarity, 0),
    open_questions: toNumber(row.open_questions, 0),
    source: row.source || "",
    tags: parseJsonList(row.tags),
    agent_next_action: row.agent_next_action || "",
    notes: row.notes || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export function normalizeDocumentRow(row) {
  return {
    record_id: row.record_id || "",
    idea_id: row.idea_id || "",
    kind: DOC_KINDS.includes(row.kind) ? row.kind : "brd",
    title: row.title || "",
    body: row.body || "",
    status: row.status || "",
    version: toNumber(row.version, 1),
    gaps: normalizeGaps(row.gaps),
    updated_at: row.updated_at || "",
  };
}

export function normalizeQuestionRow(row) {
  const answer = row.answer || "";
  const declared = row.status || "";
  return {
    record_id: row.record_id || "",
    idea_id: row.idea_id || "",
    stage: STAGES.includes(row.stage) ? row.stage : "idea",
    question: row.question || "",
    why_asking: row.why_asking || "",
    target_field: row.target_field || "",
    recovery: Boolean(row.recovery),
    answer,
    // A row is only "answered" when it actually carries an answer. Trusting a
    // stale status field would let an emptied answer still gate-pass.
    status: declared === "skipped" ? "skipped" : answer.trim() ? "answered" : "open",
    position: toNumber(row.position, 0),
    asked_at: row.asked_at || "",
    answered_at: row.answered_at || "",
  };
}

export function questionsForIdea(idea, questions = []) {
  const mine = asArray(questions).filter((question) => question.idea_id === idea.record_id);
  const missing = missingForStage(idea, idea.stage);
  const required = missing.map((field, index) => {
    const existing = mine.find((question) => question.target_field === field && question.stage === idea.stage);
    return {
      ...(existing || {}),
      record_id: existing?.record_id || requiredQuestionId(idea.record_id, field),
      idea_id: idea.record_id,
      stage: idea.stage,
      question: existing?.question || REQUIRED_QUESTION_TEXT[field],
      target_field: field,
      answer: existing?.answer || "",
      status: "open",
      position: existing?.position ?? index - missing.length,
      generated: !existing,
    };
  });
  return [...required, ...mine.filter((question) => !missing.includes(question.target_field))].sort(
    (a, b) => a.position - b.position,
  );
}

export const NORMALIZE_ROW_BY_KEY = {
  ideas: normalizeIdeaRow,
  documents: normalizeDocumentRow,
  questions: normalizeQuestionRow,
};

// Which required fields for leaving `stage` are still blank on this idea.
export function missingForStage(idea, stage) {
  return asArray(REQUIRED_TO_LEAVE[stage]).filter((field) => isBlank(idea?.[field]));
}

export function nextStage(stage) {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index >= STAGES.length - 1) return null;
  return STAGES[index + 1];
}

// The gate. An idea advances only when its own required fields are filled AND
// no question on the current rung is still open. Parked ideas never advance.
export function advanceCheck(idea, questions = []) {
  const target = nextStage(idea.stage);
  if (idea.status === STATUS_PARKED) {
    return { canAdvance: false, target: null, missingFields: [], openQuestions: [], reason: "parked" };
  }
  if (!target) {
    return { canAdvance: false, target: null, missingFields: [], openQuestions: [], reason: "last_stage" };
  }
  const missingFields = missingForStage(idea, idea.stage);
  const openQuestions = asArray(questions).filter(
    (q) => q.idea_id === idea.record_id && q.stage === idea.stage && q.status === "open",
  );
  const canAdvance = missingFields.length === 0 && openQuestions.length === 0;
  return {
    canAdvance,
    target,
    missingFields,
    openQuestions,
    reason: canAdvance ? "ready" : missingFields.length ? "missing_fields" : "open_questions",
  };
}

// Clarity is derived, never trusted from the row: a stored score would drift
// the moment an answer is edited. 0-100 across ladder progress, required
// fields, and answered questions.
export function clarityFor(idea, questions = [], documents = []) {
  const stageScore = (STAGES.indexOf(idea.stage) / (STAGES.length - 1)) * 40;
  const required = ["one_liner", "who", "problem", "why_now"];
  const filled = required.filter((field) => !isBlank(idea[field])).length;
  const fieldScore = (filled / required.length) * 30;
  const mine = asArray(questions).filter((q) => q.idea_id === idea.record_id);
  const answered = mine.filter((q) => q.status !== "open").length;
  const questionScore = mine.length ? (answered / mine.length) * 20 : 0;
  const settled = DOC_KINDS.filter((kind) => documentReadiness(
    asArray(documents).find((doc) => doc.idea_id === idea.record_id && doc.kind === kind),
  ).ready).length;
  const docScore = Math.min(settled / DOC_KINDS.length, 1) * 10;
  return Math.round(stageScore + fieldScore + questionScore + docScore);
}

// Task language for the human attention panel, per the UI contract: say what
// the operator can do, not what state a row is in.
export function attentionFor(idea, questions = [], documents = [], completeness = {}) {
  if (idea.status === STATUS_PARKED) return "parked";
  const open = asArray(questions).filter((q) => q.idea_id === idea.record_id && q.status === "open");
  if (open.length) return "needs_answer";
  const check = advanceCheck(idea, questions);
  if (check.reason === "missing_fields") return "needs_answer";
  if (check.canAdvance) return "ready_for_agent";
  return handoffReadiness(idea, questions, documents, completeness).ready ? "ready_for_handoff" : "needs_document";
}

export function buildSnapshot({ ideas = [], documents = [], questions = [], completeness = {} } = {}) {
  const normalizedDocuments = asArray(documents).map(normalizeDocumentRow);
  const normalizedQuestions = asArray(questions).map(normalizeQuestionRow);
  const normalizedIdeas = asArray(ideas).map(normalizeIdeaRow);

  const enriched = normalizedIdeas.map((idea) => {
    const mineQuestions = questionsForIdea(idea, normalizedQuestions);
    const mineDocuments = normalizedDocuments.filter((doc) => doc.idea_id === idea.record_id);
    const byKind = {};
    for (const kind of DOC_KINDS) {
      byKind[kind] = mineDocuments.find((doc) => doc.kind === kind) || null;
    }
    const check = advanceCheck(idea, mineQuestions);
    return {
      ...idea,
      clarity: clarityFor(idea, normalizedQuestions, normalizedDocuments),
      open_questions: mineQuestions.filter((q) => q.status === "open").length,
      questions: mineQuestions,
      documents: byKind,
      advance: check,
      handoff: handoffReadiness(idea, mineQuestions, mineDocuments, completeness),
      attention: attentionFor(idea, mineQuestions, mineDocuments, completeness),
    };
  });

  return {
    completeness,
    ideas: enriched,
    documents: normalizedDocuments,
    questions: normalizedQuestions,
    counts: {
      total: enriched.length,
      needsAnswer: enriched.filter((i) => i.attention === "needs_answer").length,
      readyForAgent: enriched.filter((i) => i.attention === "ready_for_agent").length,
      parked: enriched.filter((i) => i.attention === "parked").length,
    },
  };
}
