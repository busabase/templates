// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the health score, its parts, lights, attention — is computed here so
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

// ── The health rule ────────────────────────────────────────────────────────
// Written once here and once in SKILL.md, in the same words, so the score an
// agent writes and the score this app shows can be checked against each other.

const num = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value));

/** A signal with no reading scores half: unknown is neither good nor bad. */
const UNKNOWN = 10;
const band = (value, steps) => {
  if (value == null) return UNKNOWN;
  for (const [ok, points] of steps) if (ok(value)) return points;
  return 0;
};

/** The five parts of an account's score, each 0–20, with the reading behind it. */
export function healthParts(account) {
  const f = account.fields;
  const licensed = num(f['seats-licensed']), active = num(f['seats-active']), prior = num(f['seats-active-prior']);
  const usage = licensed && active != null ? active / licensed : null;
  const trend = prior && active != null ? active / prior - 1 : null;
  const tickets = num(f['urgent-tickets']), nps = num(f.nps), overdue = num(f['days-overdue']);
  return [
    { key: 'usage', reading: usage, points: band(usage, [[(v) => v >= 0.7, 20], [(v) => v >= 0.5, 12], [(v) => v >= 0.3, 6]]) },
    { key: 'trend', reading: trend, points: band(trend, [[(v) => v >= 0, 20], [(v) => v >= -0.1, 12], [(v) => v >= -0.25, 6]]) },
    { key: 'support', reading: tickets, points: band(tickets, [[(v) => v <= 0, 20], [(v) => v <= 1, 12], [(v) => v <= 2, 6]]) },
    { key: 'sentiment', reading: nps, points: band(nps, [[(v) => v >= 9, 20], [(v) => v >= 7, 12], [(v) => v >= 5, 6]]) },
    { key: 'billing', reading: overdue, points: band(overdue, [[(v) => v <= 0, 20], [(v) => v <= 15, 12], [(v) => v <= 45, 6]]) },
  ];
}

export const healthScore = (account) => healthParts(account).reduce((sum, part) => sum + part.points, 0);

/** The light: 70 and up is healthy, 50 to 69 is watch, under 50 is at risk. */
export function healthFor(score) {
  if (score == null) return null;
  if (score >= 70) return 'healthy';
  if (score >= 50) return 'watch';
  return 'at-risk';
}

/** The part that costs the account the most points (ties: the first listed). */
export const weakestPart = (account) => healthParts(account).reduce((worst, part) => (part.points < worst.points ? part : worst));

export const daysToRenewal = (account, today) => (account.fields['renewal-date'] ? daysBetween(today, account.fields['renewal-date']) : null);
export const renewsWithin = (account, today, days) => {
  const left = daysToRenewal(account, today);
  return left != null && left >= 0 && left <= days;
};

export const isOpenPlay = (play) => ['open', 'in-progress'].includes(play.fields.status);
export const isOverduePlay = (play, today) => isOpenPlay(play) && Boolean(play.fields['due-date']) && play.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: accounts at risk (soonest
 * renewal first), watch accounts renewing inside the window, save plays past
 * their date, then a review left in draft.
 */
export function attentionItems(records, today, windowDays) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'accounts' && row.fields.health === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, date: row.fields['renewal-date'] });
    if (row.baseKey === 'accounts' && row.fields.health === 'watch' && renewsWithin(row, today, windowDays)) items.push({ record: row, reason: 'renewal', rank: 1, date: row.fields['renewal-date'] });
    if (row.baseKey === 'plays' && isOverduePlay(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, date: row.fields['due-date'] });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, date: row.fields['period-end'] });
  }
  return items.sort((a, b) => a.rank - b.rank || String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

const RANK = { 'at-risk': 0, watch: 1, healthy: 2 };
/** Worst first, then lowest score, then most revenue. */
export const byConcern = (a, b) => (RANK[a.fields.health] ?? 3) - (RANK[b.fields.health] ?? 3)
  || (num(a.fields['health-score']) ?? 101) - (num(b.fields['health-score']) ?? 101)
  || (num(b.fields.arr) ?? 0) - (num(a.fields.arr) ?? 0);

/** The numbers on the overview band. */
export function overviewMetrics(records, today, windowDays) {
  const accounts = records.filter((row) => row.baseKey === 'accounts');
  const arr = (rows) => rows.reduce((sum, row) => sum + (num(row.fields.arr) || 0), 0);
  const of = (health) => accounts.filter((row) => row.fields.health === health);
  const renewing = accounts.filter((row) => renewsWithin(row, today, windowDays));
  return {
    total: accounts.length,
    totalArr: arr(accounts),
    arrAtRisk: arr(of('at-risk')),
    healthy: of('healthy').length,
    watch: of('watch').length,
    atRisk: of('at-risk').length,
    renewing: renewing.length,
    renewingArr: arr(renewing),
  };
}

/** The account a row belongs to: itself, or the account it links to. */
export function accountOf(records, row) {
  if (row.baseKey === 'accounts') return row;
  return relationIds(row.fields.account).map((id) => records.find((item) => item.id === id)).find(Boolean) || null;
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
