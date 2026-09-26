// Pure domain model for Busa Agent Orders. No DOM, no network, no provider:
// every function takes plain rows and returns plain values, so the same code
// serves the Busabase provider, the demo provider and the tests.
//
// Row shape: a provider hands over `{ ...fields, __recordId, __headCommitId }`
// where `fields` are keyed by the Base field slug (kebab-case), exactly as the
// records API returns them. The normalize* functions below are the ONLY place
// raw values are coerced, and they run on every page (first or Nth).

export const AGENT_ORDER = ["meta-muse", "chatgpt", "gemini", "perplexity", "other"];
export const PROPOSAL_STATUSES = ["proposed", "changes-requested", "approved", "applied", "blocked"];
export const DECIDABLE_PROPOSALS = new Set(["proposed", "changes-requested"]);
export const PROPOSAL_DECISIONS = {
  approve: "approved",
  "request-changes": "changes-requested",
  block: "blocked",
};
const PROPOSAL_NOTE_REQUIRED = new Set(["request-changes", "block"]);
export const EXCEPTION_STATUSES = ["open", "resolved", "accepted"];
export const EXCEPTION_DECISIONS = { resolve: "resolved", accept: "accepted" };
export const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

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

export const numberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** A checkbox may arrive as a boolean, "true"/"false", or 1/0. */
const bool = (value) => value === true || value === 1 || value === "true" || value === "1";

// ── row normalizers (one per Base) ──────────────────────────────────────────

const identity = (row) => ({ id: text(row.__recordId), head_commit_id: text(row.__headCommitId) });

export const normalizeOrder = (row = {}) => ({
  ...identity(row),
  order_no: text(row["order-no"]),
  agent: choiceId(row.agent),
  store: choiceId(row.store),
  sku: text(row.sku).trim(),
  quantity: numberOrNull(row.quantity) ?? 0,
  paid_price: numberOrNull(row["paid-price"]),
  listed_price: numberOrNull(row["listed-price"]),
  currency: text(row.currency).trim(),
  ordered_on: dayOf(row["ordered-on"]),
  status: choiceId(row.status),
});

export const normalizeGuardrail = (row = {}) => ({
  ...identity(row),
  sku: text(row.sku).trim(),
  floor_price: numberOrNull(row["floor-price"]),
  ceiling_price: numberOrNull(row["ceiling-price"]),
  max_change_pct: numberOrNull(row["max-change-pct"]),
  same_price_everywhere: bool(row["same-price-everywhere"]),
  owner: text(row.owner),
});

export const normalizeProposal = (row = {}) => ({
  ...identity(row),
  title: text(row.title),
  sku: text(row.sku).trim(),
  channels: text(row.channels),
  current_price: numberOrNull(row["current-price"]),
  proposed_price: numberOrNull(row["proposed-price"]),
  reason: text(row.reason),
  source: text(row.source),
  breaches: text(row.breaches).trim(),
  status: choiceId(row.status),
  decision_note: text(row["decision-note"]),
  applied_on: dayOf(row["applied-on"]),
});

export const normalizeException = (row = {}) => ({
  ...identity(row),
  title: text(row.title),
  order: relationId(row.order),
  type: choiceId(row.type),
  sku: text(row.sku).trim(),
  detected_on: dayOf(row["detected-on"]),
  impact: numberOrNull(row.impact),
  status: choiceId(row.status),
  resolution: text(row.resolution),
});

export const normalizeSettings = (row) =>
  row
    ? {
        ...identity(row),
        store_name: text(row["store-name"]),
        agent_channels: choiceIds(row["agent-channels"]),
        currency: text(row.currency).trim(),
        review_policy: text(row["review-policy"]),
      }
    : null;

export const NORMALIZERS = {
  orders: normalizeOrder,
  guardrails: normalizeGuardrail,
  proposals: normalizeProposal,
  exceptions: normalizeException,
  settings: normalizeSettings,
};

// ── helpers ─────────────────────────────────────────────────────────────────

const byAgentOrder = (a, b) => {
  const ia = AGENT_ORDER.indexOf(a);
  const ib = AGENT_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

const addDays = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Money is summed in cents so 0.1 + 0.2 style drift never reaches the screen. */
const cents = (value) => Math.round((value || 0) * 100);

export const orderRevenue = (order) => (order.paid_price == null ? 0 : cents(order.paid_price) * order.quantity) / 100;

/** Guardrails by SKU. If two rows share a SKU the first loaded one wins. */
export const guardrailIndex = (guardrails = []) => {
  const index = new Map();
  for (const row of guardrails) if (row.sku && !index.has(row.sku)) index.set(row.sku, row);
  return index;
};

// ── agent-channel totals ────────────────────────────────────────────────────

/**
 * The two 7-day windows, anchored on the latest `ordered-on` in the data (not
 * the wall clock, so a week-old import still reads as "this week"):
 * current = [latest - 6, latest], previous = [latest - 13, latest - 7].
 */
export const orderWindows = (orders = []) => {
  const latest = orders.map((row) => row.ordered_on).filter(Boolean).sort().at(-1) || "";
  if (!latest) return { latest: "", current: null, previous: null };
  return {
    latest,
    current: { from: addDays(latest, -(WINDOW_DAYS - 1)), to: latest },
    previous: { from: addDays(latest, -(2 * WINDOW_DAYS - 1)), to: addDays(latest, -WINDOW_DAYS) },
  };
};

const inWindow = (day, window) => Boolean(window && day && day >= window.from && day <= window.to);

const emptyTotals = () => ({ orders: 0, units: 0, revenue: 0 });
const addOrder = (totals, order) => {
  totals.orders += 1;
  totals.units += order.quantity;
  totals.revenue = (cents(totals.revenue) + cents(orderRevenue(order))) / 100;
};

const pctChange = (now, before) => (before > 0 ? (now - before) / before : null);

/**
 * Orders, units and revenue (quantity × unit price paid) per agent for the
 * latest 7 days of data versus the 7 days before. Agents come from Settings,
 * plus any agent seen in the loaded orders so an order is never dropped.
 */
export const agentTotals = ({ orders = [], settings = null } = {}) => {
  const windows = orderWindows(orders);
  const configured = settings?.agent_channels?.length ? settings.agent_channels : [];
  const seen = [...new Set(orders.map((row) => row.agent).filter(Boolean))];
  const agents = [...configured, ...seen.filter((agent) => !configured.includes(agent)).sort(byAgentOrder)];
  const current = new Map(agents.map((agent) => [agent, emptyTotals()]));
  const previous = new Map(agents.map((agent) => [agent, emptyTotals()]));
  const all = { current: emptyTotals(), previous: emptyTotals() };
  for (const order of orders) {
    if (!order.agent) continue;
    if (inWindow(order.ordered_on, windows.current)) {
      addOrder(current.get(order.agent), order);
      addOrder(all.current, order);
    } else if (inWindow(order.ordered_on, windows.previous)) {
      addOrder(previous.get(order.agent), order);
      addOrder(all.previous, order);
    }
  }
  const rows = agents.map((agent) => {
    const now = current.get(agent);
    const before = previous.get(agent);
    return {
      agent,
      current: now,
      previous: before,
      delta: {
        orders: now.orders - before.orders,
        revenue: (cents(now.revenue) - cents(before.revenue)) / 100,
        revenue_pct: pctChange(now.revenue, before.revenue),
      },
      share: all.current.revenue > 0 ? now.revenue / all.current.revenue : 0,
    };
  });
  return { ...windows, agents: rows, total: all };
};

// ── price checks on orders ──────────────────────────────────────────────────

/** Paid below the price listed at order time (a missing listed price never flags). */
export const isPaidBelowListed = (order) =>
  order.paid_price != null && order.listed_price != null && order.paid_price < order.listed_price;

/** Paid below the SKU's guardrail floor (no guardrail loaded → not flagged). */
export const isBelowFloor = (order, guardrails) => {
  const guardrail = guardrails instanceof Map ? guardrails.get(order.sku) : guardrailIndex(guardrails).get(order.sku);
  return Boolean(guardrail && guardrail.floor_price != null && order.paid_price != null && order.paid_price < guardrail.floor_price);
};

/** Per-order price flags, with the shortfall per unit against the listed price. */
export const orderFlags = (order, guardrails) => ({
  below_listed: isPaidBelowListed(order),
  below_floor: isBelowFloor(order, guardrails),
  shortfall: isPaidBelowListed(order) ? (cents(order.listed_price - order.paid_price) * order.quantity) / 100 : 0,
});

// ── guardrail evaluation of a proposal ──────────────────────────────────────

/** Proposed change as a percentage of the current price (null when not computable). */
export const changePct = (proposal) => {
  const { current_price: current, proposed_price: proposed } = proposal;
  if (current == null || proposed == null || current === 0) return null;
  return ((proposed - current) / current) * 100;
};

// Which guardrail kinds the agent's own `breaches` text mentions. Floor,
// ceiling and step are recomputed from the guardrail and compared; the
// same-price rule is noted only, because deciding it needs the other channels'
// live prices, which this app does not have.
const MENTIONS = {
  floor: /\bfloor\b|最低价|底价/i,
  ceiling: /\bceiling\b|最高价|上限/i,
  step: /\bstep\b|单次|步长/i,
  "same-price": /\bchannel\b|same price|everywhere|渠道|同价/i,
};
const COMPUTED_KINDS = ["floor", "ceiling", "step"];

export const statedBreachKinds = (breaches = "") =>
  Object.entries(MENTIONS)
    .filter(([, pattern]) => pattern.test(breaches))
    .map(([kind]) => kind);

/**
 * Evaluate one proposal against its SKU's guardrail.
 * - `computed`: floor/ceiling/step breaches worked out here, each with the limit.
 * - `stated`: the agent's own `breaches` text, and the kinds it mentions.
 * - `mismatch`: the floor/ceiling/step kinds the two disagree on (the
 *   same-price rule is excluded; it is only ever stated).
 * `guardrail: null` means no guardrail row for the SKU is loaded, so nothing
 * could be computed — never read that as "within guardrails".
 */
export const evaluateProposal = (proposal, guardrails) => {
  const guardrail = (guardrails instanceof Map ? guardrails : guardrailIndex(guardrails)).get(proposal.sku) || null;
  const pct = changePct(proposal);
  const stated = statedBreachKinds(proposal.breaches);
  const computed = [];
  if (guardrail && proposal.proposed_price != null) {
    if (guardrail.floor_price != null && proposal.proposed_price < guardrail.floor_price) {
      computed.push({ kind: "floor", limit: guardrail.floor_price, value: proposal.proposed_price });
    }
    if (guardrail.ceiling_price != null && proposal.proposed_price > guardrail.ceiling_price) {
      computed.push({ kind: "ceiling", limit: guardrail.ceiling_price, value: proposal.proposed_price });
    }
    if (guardrail.max_change_pct != null && pct != null && Math.abs(pct) > guardrail.max_change_pct + 1e-9) {
      computed.push({ kind: "step", limit: guardrail.max_change_pct, value: pct });
    }
  }
  const computedKinds = computed.map((item) => item.kind);
  const mismatch = guardrail
    ? COMPUTED_KINDS.filter((kind) => computedKinds.includes(kind) !== stated.includes(kind))
    : [];
  return {
    guardrail,
    change_pct: pct,
    computed,
    stated: { text: proposal.breaches, kinds: stated },
    same_price_rule: Boolean(guardrail?.same_price_everywhere),
    same_price_noted: stated.includes("same-price"),
    mismatch,
    breaches: computed.length > 0 || proposal.breaches !== "",
  };
};

// ── attention ───────────────────────────────────────────────────────────────

/**
 * What needs a person, from loaded rows:
 * - proposals still `proposed` that breach a guardrail (computed, or stated by the agent);
 * - open exceptions, with their total impact;
 * - orders paid below the listed price that no loaded exception points at.
 */
export const attentionList = ({ orders = [], guardrails = [], proposals = [], exceptions = [] } = {}) => {
  const index = guardrailIndex(guardrails);
  const breaching = proposals
    .filter((proposal) => proposal.status === "proposed")
    .map((proposal) => ({ proposal, check: evaluateProposal(proposal, index) }))
    .filter((item) => item.check.breaches);
  const open = exceptions.filter((row) => row.status === "open");
  const impact = open.reduce((sum, row) => sum + cents(row.impact), 0) / 100;
  const covered = new Set(exceptions.map((row) => row.order).filter(Boolean));
  const uncovered = orders
    .filter((order) => isPaidBelowListed(order) && !covered.has(order.id))
    .sort((a, b) => b.ordered_on.localeCompare(a.ordered_on));
  return {
    breaching,
    open,
    impact,
    uncovered,
    counts: { breaching: breaching.length, open: open.length, uncovered: uncovered.length },
    count: breaching.length + open.length + uncovered.length,
  };
};

// ── lists ───────────────────────────────────────────────────────────────────

/** Review queue order: decidable first (proposed, then changes-requested), breaching first within each. */
export const reviewQueue = (proposals = [], guardrails = []) => {
  const index = guardrailIndex(guardrails);
  const rank = Object.fromEntries(PROPOSAL_STATUSES.map((status, i) => [status, i]));
  return [...proposals].sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      Number(evaluateProposal(b, index).breaches) - Number(evaluateProposal(a, index).breaches) ||
      a.title.localeCompare(b.title),
  );
};

/** Filters loaded orders only; never a server query. Newest first. */
export const filterOrders = (orders = [], { agent = "", status = "", flagged = false } = {}, guardrails = []) => {
  const index = guardrailIndex(guardrails);
  return orders
    .filter((row) => (!agent || row.agent === agent) && (!status || row.status === status))
    .filter((row) => !flagged || isPaidBelowListed(row) || isBelowFloor(row, index))
    .sort((a, b) => b.ordered_on.localeCompare(a.ordered_on) || b.order_no.localeCompare(a.order_no));
};

/** Open exceptions first, newest first. */
export const exceptionQueue = (exceptions = []) => {
  const rank = Object.fromEntries(EXCEPTION_STATUSES.map((status, i) => [status, i]));
  return [...exceptions].sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.detected_on.localeCompare(a.detected_on) || a.title.localeCompare(b.title),
  );
};

// ── decisions ───────────────────────────────────────────────────────────────

/**
 * The change a proposal decision makes: `status` and `decision-note`, nothing
 * else. Throws for an unknown action, an already-decided proposal, or a
 * missing note where one is required.
 */
export const decideProposal = (proposal, action, note = "") => {
  const status = PROPOSAL_DECISIONS[action];
  if (!status) throw new Error(`Unsupported decision: ${action}`);
  if (!DECIDABLE_PROPOSALS.has(proposal?.status)) {
    throw new Error(`Proposal is ${proposal?.status || "unknown"}; only proposed or changes-requested proposals can be decided`);
  }
  const trimmed = String(note || "").trim();
  if (PROPOSAL_NOTE_REQUIRED.has(action) && !trimmed) throw new Error("NOTE_REQUIRED");
  return { status, "decision-note": trimmed };
};

/**
 * The change closing an exception makes: `status` and `resolution`, nothing
 * else. Only an open exception can be closed, and the resolution is required.
 */
export const resolveException = (exception, action, note = "") => {
  const status = EXCEPTION_DECISIONS[action];
  if (!status) throw new Error(`Unsupported decision: ${action}`);
  if (exception?.status !== "open") throw new Error(`Exception is ${exception?.status || "unknown"}; only open exceptions can be closed`);
  const trimmed = String(note || "").trim();
  if (!trimmed) throw new Error("NOTE_REQUIRED");
  return { status, resolution: trimmed };
};

/** Route a decision to the right rule by Base key. */
export const decisionFields = (key, row, action, note) => {
  if (key === "proposals") return decideProposal(row, action, note);
  if (key === "exceptions") return resolveException(row, action, note);
  throw new Error(`No decisions on ${key}`);
};
