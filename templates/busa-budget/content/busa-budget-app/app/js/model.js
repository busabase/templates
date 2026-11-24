// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the department score, its parts, statuses, attention — is computed here so
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



// ── The department rule ───────────────────────────────────────────────────────
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

/** The five parts of a department's score, each 0–20, with the reading behind it. */
export function scoreParts(department) {
  const f = department.fields;
  const spend = num(f['ytd-variance-pct']), forecast = num(f['forecast-variance-pct']), headcount = num(f['headcount-gap']);
  const purchasing = num(f['unbudgeted-pos']), renewals = num(f['renewals-undecided']);
  return [
    { key: 'spend', reading: spend, points: band(spend, [[(v) => v <= 0, 20], [(v) => v <= 3, 12], [(v) => v <= 6, 6]]) },
    { key: 'forecast', reading: forecast, points: band(forecast, [[(v) => v <= 0, 20], [(v) => v <= 2, 12], [(v) => v <= 5, 6]]) },
    { key: 'headcount', reading: headcount, points: band(headcount, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
    { key: 'purchasing', reading: purchasing, points: band(purchasing, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
    { key: 'renewals', reading: renewals, points: band(renewals, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
  ];
}

export const departmentScore = (department) => scoreParts(department).reduce((sum, part) => sum + part.points, 0);

/** The status: 70 and up is on track, 50 to 69 is watch, under 50 is at risk. */
export function statusFor(score) {
  if (score == null) return null;
  if (score >= 70) return 'on-track';
  if (score >= 50) return 'watch';
  return 'at-risk';
}

/** The part that costs the department the most points (ties: the first listed). */
export const weakestPart = (department) => scoreParts(department).reduce((worst, part) => (part.points < worst.points ? part : worst));

/** Days since the full-year forecast was last refreshed; null when it never was. */
export const daysSinceForecast = (department, today) => (department.fields['forecast-on'] ? daysBetween(department.fields['forecast-on'], today) : null);
/** No forecast refresh inside the window, or never. */
export const forecastStale = (department, today, days) => {
  const since = daysSinceForecast(department, today);
  return since == null || since > days;
};

export const isOpenAction = (action) => ['open', 'in-progress'].includes(action.fields.status);
export const isOverdueAction = (action, today) => isOpenAction(action) && Boolean(action.fields['due-date']) && action.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: departments at risk (lowest
 * score first), any department whose forecast is stale (longest first),
 * actions past their date, then a review left in draft.
 */
export function attentionItems(records, today, windowDays) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'departments' && row.fields.status === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, order: num(row.fields.score) ?? 0 });
    else if (row.baseKey === 'departments' && forecastStale(row, today, windowDays)) items.push({ record: row, reason: 'forecast-stale', rank: 1, order: -(daysSinceForecast(row, today) ?? 9999) });
    if (row.baseKey === 'actions' && isOverdueAction(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, order: -daysBetween(row.fields['due-date'], today) });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, order: 0 });
  }
  return items.sort((a, b) => a.rank - b.rank || a.order - b.order);
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

const RANK = { 'at-risk': 0, watch: 1, 'on-track': 2 };
/** Worst first, then lowest score, then the largest budget. */
export const byConcern = (a, b) => (RANK[a.fields.status] ?? 3) - (RANK[b.fields.status] ?? 3)
  || (num(a.fields.score) ?? 101) - (num(b.fields.score) ?? 101)
  || (num(b.fields['annual-budget']) ?? 0) - (num(a.fields['annual-budget']) ?? 0);

const sum = (rows, slug) => rows.reduce((total, row) => total + (num(row.fields[slug]) ?? 0), 0);

/** The numbers on the overview band. */
export function overviewMetrics(records, today, windowDays) {
  const departments = records.filter((row) => row.baseKey === 'departments');
  const of = (status) => departments.filter((row) => row.fields.status === status);
  return {
    total: departments.length,
    onTrack: of('on-track').length,
    watch: of('watch').length,
    atRisk: of('at-risk').length,
    forecastStale: departments.filter((row) => forecastStale(row, today, windowDays)).length,
    value: sum(departments, 'annual-budget'),
    // Projected overrun: the full-year forecast above budget, summed over the
    // departments that are over. A department under budget does not offset one over.
    overrun: departments.reduce((total, row) => total + Math.max(0, (num(row.fields.forecast) ?? 0) - (num(row.fields['annual-budget']) ?? 0)), 0),
    committed: sum(departments, 'committed'),
  };
}

/** The department a row belongs to: itself, or the department it links to. */
export function departmentOf(records, row) {
  if (row.baseKey === 'departments') return row;
  return relationIds(row.fields.department).map((id) => records.find((item) => item.id === id)).find(Boolean) || null;
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
