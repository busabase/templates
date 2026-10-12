const finished = new Set([
  "closed",
  "completed",
  "accepted",
  "hired",
  "rejected",
  "withdrawn",
  "declined",
  "verified",
  "recorded",
]);
const needsReview = new Set([
  "needs_review",
  "offer_review",
  "blocked",
  "feedback_missing",
  "unverified",
]);
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    ? value
    : null;
}
export function attentionReason(record, today) {
  const f = record.fields;
  if (f.status === "unverified" || f.status === "feedback_missing")
    return "incomplete";
  if (needsReview.has(f.status)) return "review";
  const d = validDate(f.due);
  const operationalDate =
    record.baseKey !== "settlements" && record.baseKey !== "updates";
  return operationalDate && isActive(record) && d && d < today
    ? "overdue"
    : null;
}
export function isActive(record) {
  if (record.baseKey === "deadlines")
    return !["completed", "closed"].includes(record.fields.status);
  return !finished.has(record.fields.status);
}
export function caseTimeline(records, caseCode) {
  if (typeof caseCode !== "string" || !caseCode.trim()) return [];
  return records
    .filter((r) => r.baseKey === "updates" && r.fields.case === caseCode)
    .sort((a, b) => {
      const x = validDate(a.fields.due),
        y = validDate(b.fields.due);
      return x && y ? y.localeCompare(x) : x ? -1 : y ? 1 : 0;
    });
}
export function verifiedAmounts(records) {
  const result = {};
  for (const r of records) {
    const f = r.fields;
    if (
      r.baseKey !== "settlements" ||
      f.status !== "verified" ||
      !["cost", "recovery"].includes(f.kind) ||
      typeof f.amount !== "number" ||
      !Number.isFinite(f.amount) ||
      f.amount < 0 ||
      !/^[A-Z]{3}$/.test(f.currency || "")
    )
      continue;
    const g = (result[f.currency] ||= { recovery: 0, cost: 0 });
    g[f.kind] += f.amount;
  }
  return result;
}
export function hiringTransition(
  from,
  to,
  {
    feedbackComplete = false,
    budgetApproved = false,
    acceptanceRecorded = false,
  } = {},
) {
  const allowed = {
    screening: ["interview", "on_hold", "rejected", "withdrawn"],
    interview: ["offer_review", "on_hold", "rejected", "withdrawn"],
    offer_review: ["offered", "on_hold", "rejected", "withdrawn"],
    offered: ["hired", "withdrawn"],
    on_hold: ["screening", "interview", "withdrawn"],
  };
  return (
    Boolean(allowed[from]?.includes(to)) &&
    (to !== "offered" || (feedbackComplete && budgetApproved)) &&
    (to !== "hired" || acceptanceRecorded)
  );
}
export function mergePage(existing, incoming) {
  const map = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return [...map.values()];
}
// Overview metrics. Each is an exact server-side `records.count` scoped by
// `valueFilters` (always exact, a single SQL count), never a tally of the
// loaded page. The demo provider evaluates the same filters over its seed rows.
export const metricQueries = [
  {
    key: "activeCases",
    baseKey: "cases",
    valueFilters: [{ fieldSlug: "status", operator: "ne", value: "closed" }],
  },
  {
    key: "deadlinesToVerify",
    baseKey: "deadlines",
    valueFilters: [
      {
        any: [
          { fieldSlug: "status", operator: "eq", value: "unverified" },
          { fieldSlug: "status", operator: "eq", value: "needs_review" },
        ],
      },
    ],
  },
  {
    key: "entriesToVerify",
    baseKey: "settlements",
    valueFilters: [{ fieldSlug: "status", operator: "ne", value: "verified" }],
  },
];
const compare = (actual, { operator, value }) => {
  switch (operator) {
    case "eq":
      return actual === value;
    case "ne":
      return actual !== value;
    case "gt":
      return actual != null && actual > value;
    case "gte":
      return actual != null && actual >= value;
    case "lt":
      return actual != null && actual < value;
    case "lte":
      return actual != null && actual <= value;
    default:
      return false;
  }
};
export function matchesValueFilters(fields, valueFilters) {
  return valueFilters.every((node) =>
    node.any
      ? node.any.some((c) => compare(fields[c.fieldSlug], c))
      : compare(fields[node.fieldSlug], node),
  );
}
