// Pure domain model for Busa Agent Shelf. No DOM, no network, no provider:
// every function takes plain rows and returns plain values, so the same code
// serves the Busabase provider, the demo provider and the tests.
//
// Row shape: a provider hands over `{ ...fields, __recordId, __headCommitId }`
// where `fields` are keyed by the Base field slug (kebab-case), exactly as the
// records API returns them. The normalize* functions below are the ONLY place
// raw values are coerced, and they run on every page (first or Nth).

export const AGENT_ORDER = ["chatgpt", "gemini", "meta-muse", "amazon-rufus", "perplexity", "other"];
export const FIX_STATUSES = ["proposed", "changes-requested", "approved", "applied", "blocked"];
export const DECIDABLE_STATUSES = new Set(["proposed", "changes-requested"]);
export const DECISIONS = {
  approve: "approved",
  "request-changes": "changes-requested",
  block: "blocked",
};
const NOTE_REQUIRED = new Set(["request-changes", "block"]);
const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 31 };

// ── value coercion ──────────────────────────────────────────────────────────

const text = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

/** A select value may arrive as the choice id or as `{ id, name }`. */
export const choiceId = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return choiceId(value[0]);
  if (typeof value === "object") return text(value.id);
  return text(value);
};

/** A multiselect may arrive as an array, a JSON-encoded array, or one id. */
export const choiceIds = (value) => {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.map(choiceId).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      return choiceIds(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [choiceId(value)].filter(Boolean);
};

/** A relation arrives as the target record id (bare string, or a one-item list). */
export const relationId = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return relationId(value[0]);
  if (typeof value === "object") return text(value.id || value.recordId);
  return text(value);
};

/** Dates are compared as YYYY-MM-DD; anything unparseable becomes "". */
export const dayOf = (value) => {
  const raw = text(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const numberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// ── row normalizers (one per Base) ──────────────────────────────────────────

const identity = (row) => ({ id: text(row.__recordId), head_commit_id: text(row.__headCommitId) });

export const normalizeQuestion = (row = {}) => ({
  ...identity(row),
  question: text(row.question),
  market: choiceId(row.market),
  category: text(row.category),
  intent: choiceId(row.intent),
  priority: choiceId(row.priority),
  target_products: text(row["target-products"]),
  status: choiceId(row.status),
  notes: text(row.notes),
});

export const normalizeObservation = (row = {}) => ({
  ...identity(row),
  title: text(row.title),
  question: relationId(row.question),
  agent: choiceId(row.agent),
  checked_on: dayOf(row["checked-on"]),
  our_position: numberOrNull(row["our-position"]) ?? 0,
  our_product: text(row["our-product"]),
  picked_instead: text(row["picked-instead"]),
  reason_given: text(row["reason-given"]),
  answer_excerpt: text(row["answer-excerpt"]),
  evidence_url: text(row["evidence-url"]),
});

export const normalizeCompetitor = (row = {}) => ({
  ...identity(row),
  product: text(row.product),
  brand: text(row.brand),
  url: text(row.url),
  price: numberOrNull(row.price),
  times_picked: numberOrNull(row["times-picked"]) ?? 0,
  what_they_have: text(row["what-they-have"]),
});

export const normalizeFix = (row = {}) => ({
  ...identity(row),
  title: text(row.title),
  question: relationId(row.question),
  product: text(row.product),
  gap_type: choiceId(row["gap-type"]),
  field_name: text(row["field-name"]),
  current_value: text(row["current-value"]),
  proposed_value: text(row["proposed-value"]),
  source: text(row.source),
  evidence: text(row.evidence),
  risk: choiceId(row.risk),
  status: choiceId(row.status),
  decision_note: text(row["decision-note"]),
  applied_on: dayOf(row["applied-on"]),
});

export const normalizeSettings = (row) =>
  row
    ? {
        ...identity(row),
        brand: text(row.brand),
        agents: choiceIds(row.agents),
        cadence: choiceId(row.cadence),
        review_policy: text(row["review-policy"]),
      }
    : null;

export const NORMALIZERS = {
  questions: normalizeQuestion,
  observations: normalizeObservation,
  competitors: normalizeCompetitor,
  fixes: normalizeFix,
  settings: normalizeSettings,
};

// ── derived views ───────────────────────────────────────────────────────────

const byAgentOrder = (a, b) => {
  const ia = AGENT_ORDER.indexOf(a);
  const ib = AGENT_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

/** Check dates present in the loaded answers, newest first. */
export const checkDates = (observations) =>
  [...new Set(observations.map((row) => row.checked_on).filter(Boolean))].sort().reverse();

/**
 * Agents to show: the Settings list when there is one, plus any agent that
 * appears in the loaded answers (so an answer is never silently dropped).
 */
export const agentsInScope = (settings, observations) => {
  const configured = settings?.agents?.length ? settings.agents : [];
  const seen = observations.map((row) => row.agent).filter(Boolean);
  const extra = [...new Set(seen)].filter((agent) => !configured.includes(agent)).sort(byAgentOrder);
  return configured.length ? [...configured, ...extra] : extra;
};

/**
 * A question counts toward share of shelf unless it is known to be paused.
 * A question that is referenced but not loaded yet still counts: the answer
 * row proves it was asked.
 */
const countsTowardShare = (questionsById, questionId) => questionsById.get(questionId)?.status !== "paused";

const shareOn = (observations, questionsById, agent, day) => {
  const shownByQuestion = new Map();
  for (const row of observations) {
    if (row.agent !== agent || row.checked_on !== day || !row.question) continue;
    if (!countsTowardShare(questionsById, row.question)) continue;
    shownByQuestion.set(row.question, shownByQuestion.get(row.question) || row.our_position > 0);
  }
  const total = shownByQuestion.size;
  if (!total) return null;
  const shown = [...shownByQuestion.values()].filter(Boolean).length;
  return { shown, total, share: shown / total };
};

/**
 * Share of shelf per agent for the latest check date: the share of tracked
 * questions where our position is > 0, and the change against the previous
 * check date. `null` means the agent was not checked on that date.
 */
export const shareOfShelf = ({ questions = [], observations = [], settings = null } = {}) => {
  const [latest = "", previous = ""] = checkDates(observations);
  const questionsById = new Map(questions.map((row) => [row.id, row]));
  const agents = agentsInScope(settings, observations).map((agent) => {
    const now = latest ? shareOn(observations, questionsById, agent, latest) : null;
    const before = previous ? shareOn(observations, questionsById, agent, previous) : null;
    return {
      agent,
      shown: now?.shown ?? 0,
      total: now?.total ?? 0,
      share: now ? now.share : null,
      previous_share: before ? before.share : null,
      delta: now && before ? now.share - before.share : null,
    };
  });
  return { latest, previous, agents };
};

/**
 * Question × agent grid: the latest position each agent gave each question.
 * Rows are the loaded questions (tracking first, by priority), plus any
 * question an answer references that is not loaded yet (flagged `loaded:false`).
 */
export const positionGrid = ({ questions = [], observations = [], settings = null } = {}) => {
  const agents = agentsInScope(settings, observations);
  const latestCell = new Map();
  for (const row of observations) {
    if (!row.question || !row.agent) continue;
    const key = `${row.question}\u0000${row.agent}`;
    const current = latestCell.get(key);
    if (!current || row.checked_on > current.checked_on) latestCell.set(key, row);
  }
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const ordered = [...questions].sort(
    (a, b) =>
      (a.status === "paused") - (b.status === "paused") ||
      (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) ||
      a.question.localeCompare(b.question),
  );
  const known = new Set(questions.map((row) => row.id));
  const unloaded = [...new Set(observations.map((row) => row.question))].filter((id) => id && !known.has(id));
  const rows = [
    ...ordered.map((question) => ({ question, loaded: true })),
    ...unloaded.map((id) => ({ question: { id }, loaded: false })),
  ].map(({ question, loaded }) => ({
    question,
    loaded,
    cells: agents.map((agent) => {
      const hit = latestCell.get(`${question.id}\u0000${agent}`);
      return hit
        ? { agent, position: hit.our_position, checked_on: hit.checked_on, observation_id: hit.id }
        : { agent, position: null, checked_on: "", observation_id: "" };
    }),
  }));
  return { agents, rows };
};

const UNSOURCED = new Set(["", "(none)", "none", "n/a", "-", "—", "(empty)"]);
export const isUnsourced = (fix) => UNSOURCED.has(fix.source.trim().toLowerCase());
const OPEN_STATUSES = new Set(["proposed", "changes-requested", "approved"]);

/**
 * What needs a person, from loaded rows:
 * - high-priority tracked questions that no agent showed us for in the latest
 *   check (only questions that were actually checked on that date);
 * - fixes waiting for a decision (status `proposed`);
 * - high-risk fixes that are still open (not applied or blocked);
 * - fixes whose new value has no source (empty or "(none)"), at any status —
 *   an unsourced value is worth seeing even once it has been decided.
 * A fix appears once, with every reason that applies.
 */
export const attentionList = ({ questions = [], observations = [], fixes = [] } = {}) => {
  const [latest = ""] = checkDates(observations);
  const missing = [];
  if (latest) {
    for (const question of questions) {
      if (question.priority !== "high" || question.status !== "tracking") continue;
      const checked = observations.filter((row) => row.question === question.id && row.checked_on === latest);
      if (!checked.length || checked.some((row) => row.our_position > 0)) continue;
      const pickedInstead = checked.map((row) => row.picked_instead).find(Boolean) || "";
      missing.push({ question, checked_on: latest, agents: checked.map((row) => row.agent), picked_instead: pickedInstead });
    }
  }
  const fixItems = [];
  for (const fix of fixes) {
    const reasons = [];
    if (fix.status === "proposed") reasons.push("proposed");
    if (fix.risk === "high" && OPEN_STATUSES.has(fix.status)) reasons.push("high-risk");
    if (isUnsourced(fix)) reasons.push("unsourced");
    if (reasons.length) fixItems.push({ fix, reasons });
  }
  const weight = (item) =>
    (item.reasons.includes("unsourced") ? 0 : 1) + (item.reasons.includes("high-risk") ? 0 : 2) + (item.reasons.includes("proposed") ? 0 : 4);
  fixItems.sort((a, b) => weight(a) - weight(b) || a.fix.title.localeCompare(b.fix.title));
  return {
    missing,
    fixes: fixItems,
    count: missing.length + fixItems.length,
    counts: {
      missing: missing.length,
      proposed: fixItems.filter((item) => item.reasons.includes("proposed")).length,
      highRisk: fixItems.filter((item) => item.reasons.includes("high-risk")).length,
      unsourced: fixItems.filter((item) => item.reasons.includes("unsourced")).length,
    },
  };
};

/** Review queue order: decidable first (proposed, then changes-requested), then the rest. */
export const reviewQueue = (fixes = []) => {
  const rank = Object.fromEntries(FIX_STATUSES.map((status, index) => [status, index]));
  const riskRank = { high: 0, medium: 1, low: 2 };
  return [...fixes].sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      (riskRank[a.risk] ?? 3) - (riskRank[b.risk] ?? 3) ||
      a.title.localeCompare(b.title),
  );
};

/** Filters loaded answers only; never a server query. */
export const filterObservations = (observations = [], { agent = "", question = "", query = "" } = {}) => {
  const needle = query.trim().toLowerCase();
  return observations
    .filter((row) => (!agent || row.agent === agent) && (!question || row.question === question))
    .filter(
      (row) =>
        !needle ||
        [row.title, row.picked_instead, row.reason_given, row.answer_excerpt, row.our_product]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => b.checked_on.localeCompare(a.checked_on) || byAgentOrder(a.agent, b.agent));
};

export const rankCompetitors = (competitors = []) =>
  [...competitors].sort((a, b) => b.times_picked - a.times_picked || a.product.localeCompare(b.product));

/**
 * The change a decision makes: `status` and `decision-note`, nothing else.
 * Throws for an unknown action, an already-decided fix, or a missing note
 * where one is required.
 */
export const decideFix = (fix, action, note = "") => {
  const status = DECISIONS[action];
  if (!status) throw new Error(`Unsupported decision: ${action}`);
  if (!DECIDABLE_STATUSES.has(fix?.status)) throw new Error(`Fix is ${fix?.status || "unknown"}; only proposed or changes-requested fixes can be decided`);
  const trimmed = String(note || "").trim();
  if (NOTE_REQUIRED.has(action) && !trimmed) throw new Error("NOTE_REQUIRED");
  return { status, "decision-note": trimmed };
};

/**
 * Freshness: the latest check is stale once it is older than the configured
 * cadence (weekly when unset). `now` is injected so tests stay deterministic.
 */
export const freshness = ({ latest = "", cadence = "", now = new Date() } = {}) => {
  if (!latest) return { stale: false, days: null, limit: CADENCE_DAYS[cadence] || 7 };
  const limit = CADENCE_DAYS[cadence] || 7;
  const days = Math.floor((Date.parse(dayOf(now.toISOString())) - Date.parse(latest)) / 86_400_000);
  return { stale: days > limit, days, limit };
};
