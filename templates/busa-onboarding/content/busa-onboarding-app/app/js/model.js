// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the onboarding score, its parts, statuses, attention — is computed here so
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


// ── The onboarding rule ────────────────────────────────────────────────────
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

/** The five parts of a new hire's score, each 0–20, with the reading behind it. */
export function scoreParts(hire) {
  const f = hire.fields;
  const access = num(f['access-pct']), paperwork = num(f['paperwork-pct']), training = num(f['training-pct']);
  const missed = num(f['checkins-missed']), pulse = num(f.pulse);
  return [
    { key: 'access', reading: access, points: band(access, [[(v) => v >= 100, 20], [(v) => v >= 90, 12], [(v) => v >= 75, 6]]) },
    { key: 'paperwork', reading: paperwork, points: band(paperwork, [[(v) => v >= 100, 20], [(v) => v >= 90, 12], [(v) => v >= 75, 6]]) },
    { key: 'training', reading: training, points: band(training, [[(v) => v >= 95, 20], [(v) => v >= 80, 12], [(v) => v >= 60, 6]]) },
    { key: 'checkins', reading: missed, points: band(missed, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
    { key: 'pulse', reading: pulse, points: band(pulse, [[(v) => v >= 4.5, 20], [(v) => v >= 4, 12], [(v) => v >= 3, 6]]) },
  ];
}

export const hireScore = (hire) => scoreParts(hire).reduce((sum, part) => sum + part.points, 0);

/** The status: 70 and up is on track, 50 to 69 is watch, under 50 is at risk. */
export function statusFor(score) {
  if (score == null) return null;
  if (score >= 70) return 'on-track';
  if (score >= 50) return 'watch';
  return 'at-risk';
}

/** The part that costs the new hire the most points (ties: the first listed). */
export const weakestPart = (hire) => scoreParts(hire).reduce((worst, part) => (part.points < worst.points ? part : worst));

/** Days from today to the start date: positive before day one, negative after. */
export const daysToStart = (hire, today) => (hire.fields['start-date'] ? daysBetween(today, hire.fields['start-date']) : null);
/** Which day of onboarding today is: the start date is day 1. Null before it. */
export const dayNumber = (hire, today) => {
  const left = daysToStart(hire, today);
  return left == null || left > 0 ? null : 1 - left;
};
export const startsWithin = (hire, today, days) => {
  const left = daysToStart(hire, today);
  return left != null && left >= 0 && left <= days;
};
/** Starting soon with an account or a laptop still missing. */
export const notReady = (hire, today, days) => startsWithin(hire, today, days) && num(hire.fields['access-pct']) !== 100;

export const isOpenAction = (action) => ['open', 'in-progress'].includes(action.fields.status);
export const isOverdueAction = (action, today) => isOpenAction(action) && Boolean(action.fields['due-date']) && action.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: new hires at risk
 * (earliest start first), anyone starting inside the window who is not ready,
 * actions past their date, then a review left in draft.
 */
export function attentionItems(records, today, windowDays) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'hires' && row.fields.status === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, date: row.fields['start-date'] });
    else if (row.baseKey === 'hires' && notReady(row, today, windowDays)) items.push({ record: row, reason: 'not-ready', rank: 1, date: row.fields['start-date'] });
    if (row.baseKey === 'actions' && isOverdueAction(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, date: row.fields['due-date'] });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, date: row.fields['period-end'] });
  }
  return items.sort((a, b) => a.rank - b.rank || String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

const RANK = { 'at-risk': 0, watch: 1, 'on-track': 2 };
/** Worst first, then lowest score, then earliest start. */
export const byConcern = (a, b) => (RANK[a.fields.status] ?? 3) - (RANK[b.fields.status] ?? 3)
  || (num(a.fields.score) ?? 101) - (num(b.fields.score) ?? 101)
  || String(a.fields['start-date'] || '9999').localeCompare(String(b.fields['start-date'] || '9999'));

/** The numbers on the overview band. */
export function overviewMetrics(records, today, windowDays) {
  const hires = records.filter((row) => row.baseKey === 'hires');
  const of = (status) => hires.filter((row) => row.fields.status === status);
  const starting = hires.filter((row) => startsWithin(row, today, windowDays));
  return {
    total: hires.length,
    onTrack: of('on-track').length,
    watch: of('watch').length,
    atRisk: of('at-risk').length,
    starting: starting.length,
    notReady: starting.filter((row) => notReady(row, today, windowDays)).length,
  };
}

/** The new hire a row belongs to: itself, or the new hire it links to. */
export function hireOf(records, row) {
  if (row.baseKey === 'hires') return row;
  return relationIds(row.fields.hire).map((id) => records.find((item) => item.id === id)).find(Boolean) || null;
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
