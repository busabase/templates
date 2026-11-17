// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the session score, its parts, statuses, attention — is computed here so
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



// ── The live-session rule ──────────────────────────────────────────────────
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

/** The five parts of a session's score, each 0–20, with the reading behind it. */
export function scoreParts(session) {
  const f = session.fields;
  const stock = num(f['stock-pct']), prep = num(f['prep-pct']), gmv = num(f['gmv-pct']);
  const conversion = num(f['conversion-pct']), refund = num(f['refund-pct']);
  return [
    { key: 'stock', reading: stock, points: band(stock, [[(v) => v >= 100, 20], [(v) => v >= 90, 12], [(v) => v >= 75, 6]]) },
    { key: 'prep', reading: prep, points: band(prep, [[(v) => v >= 100, 20], [(v) => v >= 90, 12], [(v) => v >= 75, 6]]) },
    { key: 'gmv', reading: gmv, points: band(gmv, [[(v) => v >= 100, 20], [(v) => v >= 85, 12], [(v) => v >= 70, 6]]) },
    { key: 'conversion', reading: conversion, points: band(conversion, [[(v) => v >= 4, 20], [(v) => v >= 3, 12], [(v) => v >= 2, 6]]) },
    { key: 'refund', reading: refund, points: band(refund, [[(v) => v <= 5, 20], [(v) => v <= 8, 12], [(v) => v <= 12, 6]]) },
  ];
}

export const sessionScore = (session) => scoreParts(session).reduce((sum, part) => sum + part.points, 0);

/** The status: 70 and up is on track, 50 to 69 is watch, under 50 is at risk. */
export function statusFor(score) {
  if (score == null) return null;
  if (score >= 70) return 'on-track';
  if (score >= 50) return 'watch';
  return 'at-risk';
}

/** The part that costs the session the most points (ties: the first listed). */
export const weakestPart = (session) => scoreParts(session).reduce((worst, part) => (part.points < worst.points ? part : worst));

/** Days from today to the live date: positive before it airs, negative after. */
export const daysToLive = (session, today) => (session.fields['live-date'] ? daysBetween(today, session.fields['live-date']) : null);
export const livesWithin = (session, today, days) => {
  const left = daysToLive(session, today);
  return left != null && left >= 0 && left <= days;
};
/** Going live soon with stock for the planned units still not in the warehouse. */
export const notReady = (session, today, days) => livesWithin(session, today, days) && num(session.fields['stock-pct']) !== 100;

export const isOpenAction = (action) => ['open', 'in-progress'].includes(action.fields.status);
export const isOverdueAction = (action, today) => isOpenAction(action) && Boolean(action.fields['due-date']) && action.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: sessions at risk (soonest
 * live date first for upcoming ones, then the most recent that aired), any
 * session going live inside the window that is not ready, actions past their
 * date, then a review left in draft.
 */
export function attentionItems(records, today, windowDays) {
  const items = [];
  const nearness = (row) => Math.abs(daysToLive(row, today) ?? 9999);
  for (const row of records) {
    if (row.baseKey === 'sessions' && row.fields.status === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, order: nearness(row) });
    else if (row.baseKey === 'sessions' && notReady(row, today, windowDays)) items.push({ record: row, reason: 'not-ready', rank: 1, order: nearness(row) });
    if (row.baseKey === 'actions' && isOverdueAction(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, order: daysBetween(row.fields['due-date'], today) * -1 });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, order: 0 });
  }
  return items.sort((a, b) => a.rank - b.rank || a.order - b.order);
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

const RANK = { 'at-risk': 0, watch: 1, 'on-track': 2 };
/** Worst first, then lowest score, then the live date nearest today. */
export const byConcern = (a, b) => (RANK[a.fields.status] ?? 3) - (RANK[b.fields.status] ?? 3)
  || (num(a.fields.score) ?? 101) - (num(b.fields.score) ?? 101)
  || String(b.fields['live-date'] || '').localeCompare(String(a.fields['live-date'] || ''));

/** Sessions that aired between `from` and `to`, both inclusive. */
export const airedBetween = (records, from, to) => records.filter((row) => row.baseKey === 'sessions' && row.fields['live-date'] && row.fields['live-date'] >= from && row.fields['live-date'] <= to);
const sum = (rows, slug) => rows.reduce((total, row) => total + (num(row.fields[slug]) ?? 0), 0);
/** GMV and target over aired sessions that have a GMV reading. */
export function gmvTotals(rows) {
  const settled = rows.filter((row) => num(row.fields.gmv) != null);
  return { gmv: sum(settled, 'gmv'), target: sum(settled, 'target-gmv') };
}

/** The numbers on the overview band. */
export function overviewMetrics(records, today, windowDays, gmvDays = 30) {
  const sessions = records.filter((row) => row.baseKey === 'sessions');
  const of = (status) => sessions.filter((row) => row.fields.status === status);
  const upcoming = sessions.filter((row) => livesWithin(row, today, windowDays));
  const { gmv, target } = gmvTotals(airedBetween(records, recentSince(today, gmvDays), today));
  return {
    total: sessions.length,
    onTrack: of('on-track').length,
    watch: of('watch').length,
    atRisk: of('at-risk').length,
    upcoming: upcoming.length,
    notReady: upcoming.filter((row) => notReady(row, today, windowDays)).length,
    gmv,
    target,
  };
}

/** The session a row belongs to: itself, or the session it links to. */
export function sessionOf(records, row) {
  if (row.baseKey === 'sessions') return row;
  return relationIds(row.fields.session).map((id) => records.find((item) => item.id === id)).find(Boolean) || null;
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
