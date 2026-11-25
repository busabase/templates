// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the project score, its parts, statuses, attention — is computed here so
// the demo provider, the live provider and the tests all agree on one meaning.

const DAY = 86400000;

export const isoDay = (date) => new Date(date).toISOString().slice(0, 10);
export const addDays = (iso, days) => isoDay(Date.parse(`${iso}T00:00:00Z`) + days * DAY);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The API returns a record's values in `headCommit.payload`. */
export function normalizeRecord(record, baseKey) {
  return { id: record.id, baseKey, fields: record.headCommit?.payload || record.fields || {} };
}

/** A relation comes back as an array of record ids, even when single. */
export function relationIds(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(relationIds);
  if (typeof value === 'object') return typeof value.id === 'string' ? [value.id] : [];
  return [String(value)];
}
export const links = (record, slug, id) => relationIds(record.fields[slug]).includes(id);

/** `{ daysAgo: n }` in a source's filter becomes a date relative to today. */
export function resolveFilters(filters = [], today) {
  const resolve = (entry) => entry.any
    ? { any: entry.any.map(resolve) }
    : { ...entry, value: entry.value && typeof entry.value === 'object' && 'daysAgo' in entry.value ? addDays(today, -entry.value.daysAgo) : entry.value };
  return filters.map(resolve);
}

// The demo provider answers a source's query the way the server does.
const compare = (value, { operator, value: expected }) => {
  if (value == null || value === '') return operator === 'ne';
  switch (operator) {
    case 'eq': return value === expected;
    case 'ne': return value !== expected;
    case 'gt': return value > expected;
    case 'gte': return value >= expected;
    case 'lt': return value < expected;
    case 'lte': return value <= expected;
    default: return false;
  }
};
export const matchesFilters = (record, filters = []) => filters.every((entry) => entry.any
  ? entry.any.some((option) => compare(record.fields[option.fieldSlug], option))
  : compare(record.fields[entry.fieldSlug], entry));
export function sortRecords(rows, sort) {
  if (!sort) return rows;
  const sign = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a.fields[sort.fieldSlug], right = b.fields[sort.fieldSlug];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return left < right ? -sign : left > right ? sign : 0;
  });
}

export function mergeById(current, next) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of next) rows.set(row.id, row);
  return [...rows.values()];
}

/** Rows of `baseKey` whose `slug` relation points at `id`. */
export const linkedFrom = (records, baseKey, slug, id) => records.filter((row) => row.baseKey === baseKey && links(row, slug, id));



// ── The project rule ───────────────────────────────────────────────────────
// Written once here and once in SKILL.md, in the same words, so the score an
// agent writes and the score this app shows can be checked against each other.

const num = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value));

/** A measure with no reading scores half: unknown is neither good nor bad. */
const UNKNOWN = 10;
const band = (value, steps) => {
  if (value == null) return UNKNOWN;
  for (const [ok, points] of steps) if (ok(value)) return points;
  return 0;
};

/** The five parts of a project's score, each 0–20, with the reading behind it. */
export function scoreParts(project) {
  const f = project.fields;
  const budget = num(f['burn-gap']), schedule = num(f['slip-days']), billing = num(f['wip-days']);
  const scope = num(f['unsigned-changes']), client = num(f['client-pulse']);
  return [
    { key: 'budget', reading: budget, points: band(budget, [[(v) => v <= 0, 20], [(v) => v <= 5, 12], [(v) => v <= 10, 6]]) },
    { key: 'schedule', reading: schedule, points: band(schedule, [[(v) => v <= 0, 20], [(v) => v <= 5, 12], [(v) => v <= 10, 6]]) },
    { key: 'billing', reading: billing, points: band(billing, [[(v) => v <= 30, 20], [(v) => v <= 45, 12], [(v) => v <= 60, 6]]) },
    { key: 'scope', reading: scope, points: band(scope, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
    { key: 'client', reading: client, points: band(client, [[(v) => v >= 4.5, 20], [(v) => v >= 4, 12], [(v) => v >= 3.5, 6]]) },
  ];
}

export const projectScore = (project) => scoreParts(project).reduce((sum, part) => sum + part.points, 0);

/** The status: 70 and up is on track, 50 to 69 is watch, under 50 is at risk. */
export function statusFor(score) {
  if (score == null) return null;
  if (score >= 70) return 'on-track';
  if (score >= 50) return 'watch';
  return 'at-risk';
}

/** The part that costs the project the most points (ties: the first listed). */
export const weakestPart = (project) => scoreParts(project).reduce((worst, part) => (part.points < worst.points ? part : worst));

/** Days since the last client check-in; null when there never was one. */
export const daysSinceCheckin = (project, today) => (project.fields['checked-in-on'] ? daysBetween(project.fields['checked-in-on'], today) : null);
/** No client check-in inside the window, or never. */
export const checkinOverdue = (project, today, days) => {
  const since = daysSinceCheckin(project, today);
  return since == null || since > days;
};

export const isOpenAction = (action) => ['open', 'in-progress'].includes(action.fields.status);
export const isOverdueAction = (action, today) => isOpenAction(action) && Boolean(action.fields['due-date']) && action.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: projects at risk (lowest
 * score first), any client we have not checked in with (longest first),
 * actions past their date, then a review left in draft.
 */
export function attentionItems(records, today, windowDays) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'projects' && row.fields.status === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, order: num(row.fields.score) ?? 0 });
    else if (row.baseKey === 'projects' && checkinOverdue(row, today, windowDays)) items.push({ record: row, reason: 'checkin-overdue', rank: 1, order: -(daysSinceCheckin(row, today) ?? 9999) });
    if (row.baseKey === 'actions' && isOverdueAction(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, order: -daysBetween(row.fields['due-date'], today) });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, order: 0 });
  }
  return items.sort((a, b) => a.rank - b.rank || a.order - b.order);
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

const RANK = { 'at-risk': 0, watch: 1, 'on-track': 2 };
/** Worst first, then lowest score, then the largest contract. */
export const byConcern = (a, b) => (RANK[a.fields.status] ?? 3) - (RANK[b.fields.status] ?? 3)
  || (num(a.fields.score) ?? 101) - (num(b.fields.score) ?? 101)
  || (num(b.fields['contract-value']) ?? 0) - (num(a.fields['contract-value']) ?? 0);

const sum = (rows, slug) => rows.reduce((total, row) => total + (num(row.fields[slug]) ?? 0), 0);

/** The numbers on the overview band. */
export function overviewMetrics(records, today, windowDays) {
  const projects = records.filter((row) => row.baseKey === 'projects');
  const of = (status) => projects.filter((row) => row.fields.status === status);
  return {
    total: projects.length,
    onTrack: of('on-track').length,
    watch: of('watch').length,
    atRisk: of('at-risk').length,
    checkinOverdue: projects.filter((row) => checkinOverdue(row, today, windowDays)).length,
    value: sum(projects, 'contract-value'),
    valueAtRisk: sum(of('at-risk'), 'contract-value'),
    unbilled: sum(projects, 'unbilled'),
  };
}

/** The project a row belongs to: itself, or the project it links to. */
export function projectOf(records, row) {
  if (row.baseKey === 'projects') return row;
  return relationIds(row.fields.project).map((id) => records.find((item) => item.id === id)).find(Boolean) || null;
}


// A Busabase id is a three-letter prefix plus 15 base-36 characters with at
// least one digit. Matching "prefix + any long word" instead would blank out
// ordinary words such as "reconciliation".
export const RESOURCE_ID = /\b(?:rec|bse|bsf|nod|cmt|crq)(?=[a-z0-9]{0,14}\d)[a-z0-9]{15}\b/g;

/** The last line of defense for display: never a raw resource id, never an object. */
export function safeDisplay(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return '-';
  return String(value).replace(RESOURCE_ID, '-');
}
