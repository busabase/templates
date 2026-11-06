// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — progress, expected progress, lights, attention — is computed here so
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

// ── The OKR rules ──────────────────────────────────────────────────────────
// Written once here and once in SKILL.md, in the same words, so the light an
// agent writes and the light this app shows can be checked against each other.

/** Share of the quarter gone on `today`, 0–1. */
export function expectedProgress(quarter, today) {
  const total = daysBetween(quarter.start, quarter.end) + 1;
  const gone = daysBetween(quarter.start, today);
  return Math.min(1, Math.max(0, gone / total));
}

const num = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value));

/**
 * How far a key result has come from its start toward its target, 0–1
 * (negative when it moved the wrong way). Works for "lower is better" results
 * too: (start − current) / (start − target) is the same formula.
 */
export function krProgress(kr) {
  const start = num(kr.fields['start-value']), target = num(kr.fields['target-value']), current = num(kr.fields['current-value']);
  if (start == null || target == null || current == null || start === target) return null;
  return (current - start) / (target - start);
}

/** The light: behind the quarter by 30 points or more is at risk, by 15 or more is watch. */
export function statusFor(progress, expected) {
  if (progress == null) return null;
  const gap = expected - progress;
  if (gap >= 0.3) return 'at-risk';
  if (gap >= 0.15) return 'watch';
  return 'on-track';
}

const RANK = { 'at-risk': 2, watch: 1, 'on-track': 0 };
export const worstStatus = (statuses) => statuses.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] || null;

/** An objective's key results, including those of team objectives that support it. */
export function objectiveKeyResults(records, objectiveId) {
  const direct = linkedFrom(records, 'key-results', 'objective', objectiveId);
  const children = linkedFrom(records, 'objectives', 'parent', objectiveId);
  return [...direct, ...children.flatMap((child) => linkedFrom(records, 'key-results', 'objective', child.id))];
}

/** Average progress of a set of key results, each clamped to 0–1. */
export function averageProgress(krs) {
  const values = krs.map(krProgress).filter((value) => value != null).map((value) => Math.min(1, Math.max(0, value)));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export const isOpenAction = (action) => ['open', 'in-progress'].includes(action.fields.status);
export const isOverdueAction = (action, today) => isOpenAction(action) && Boolean(action.fields['due-date']) && action.fields['due-date'] < today;

/**
 * What a person should look at, most serious first: key results at risk, then
 * on watch, then actions past their date, then a review left in draft.
 */
export function attentionItems(records, today) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'key-results' && row.fields.status === 'at-risk') items.push({ record: row, reason: 'at-risk', rank: 0, date: row.fields['updated-on'] });
    if (row.baseKey === 'key-results' && row.fields.status === 'watch') items.push({ record: row, reason: 'watch', rank: 1, date: row.fields['updated-on'] });
    if (row.baseKey === 'actions' && isOverdueAction(row, today)) items.push({ record: row, reason: 'overdue', rank: 2, date: row.fields['due-date'] });
    if (row.baseKey === 'reviews' && row.fields.status === 'draft') items.push({ record: row, reason: 'draft', rank: 3, date: row.fields['period-end'] });
  }
  return items.sort((a, b) => a.rank - b.rank || String(a.date || '').localeCompare(String(b.date || '')));
}

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

/** The numbers on the overview band. */
export function overviewMetrics(records, today, days, quarter) {
  const krs = records.filter((row) => row.baseKey === 'key-results');
  const count = (status) => krs.filter((row) => row.fields.status === status).length;
  return {
    progress: averageProgress(krs),
    expected: expectedProgress(quarter, today),
    total: krs.length,
    onTrack: count('on-track'),
    watch: count('watch'),
    atRisk: count('at-risk'),
    updatedRecently: records.filter((row) => row.baseKey === 'check-ins' && (row.fields['checked-on'] || '') >= recentSince(today, days)).length,
  };
}

/** The team a row belongs to: its own field, or its key result's. */
export function teamOf(records, row) {
  if (row.fields.team) return row.fields.team;
  const kr = relationIds(row.fields['key-result']).map((id) => records.find((item) => item.id === id)).find(Boolean);
  return kr?.fields.team || '';
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
