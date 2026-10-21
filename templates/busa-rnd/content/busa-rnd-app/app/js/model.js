// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — attention, metrics, relations, progress — is computed here so the
// demo provider, the live provider and the tests all agree on one meaning.

const DAY = 86400000;
const CLOSED_TASK = new Set(['done', 'canceled']);
const LIVE_PROJECT = new Set(['planned', 'in-progress', 'paused']);

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

// The demo provider answers a source's query the way the server does, so the
// screens see the same rows in both modes. Comparisons follow valueFilters:
// strings compare lexically (ISO dates sort correctly), a missing value
// matches only `ne`.
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

// ── Domain rules ───────────────────────────────────────────────────────────
export const isOpenTask = (task) => !CLOSED_TASK.has(task.fields.status);
export const isOverdue = (task, today) => isOpenTask(task) && Boolean(task.fields['due-date']) && task.fields['due-date'] < today;
export const isLiveProject = (project) => LIVE_PROJECT.has(project.fields.status);
export const isRiskyProject = (project) => isLiveProject(project) && ['at-risk', 'off-track'].includes(project.fields.health);

/**
 * What is waiting on a person, most decisive first. Each rule is one thing a
 * human — not an agent — has to do: accept a delivery, finalise a report,
 * decide about a slipping project, or chase an overdue task.
 */
export function attentionItems(records, today) {
  const items = [];
  for (const row of records) {
    if (row.baseKey === 'deliveries' && row.fields.status === 'ready') items.push({ record: row, reason: 'acceptance', rank: 0, date: row.fields['submitted-on'] });
    if (row.baseKey === 'reports' && row.fields.status === 'draft') items.push({ record: row, reason: 'finalise', rank: 1, date: row.fields['period-end'] });
    if (row.baseKey === 'projects' && isRiskyProject(row)) items.push({ record: row, reason: row.fields.health, rank: row.fields.health === 'off-track' ? 2 : 3, date: row.fields['target-date'] });
    if (row.baseKey === 'tasks' && isOverdue(row, today)) items.push({ record: row, reason: 'overdue', rank: 4, date: row.fields['due-date'] });
  }
  return items.sort((a, b) => a.rank - b.rank || String(a.date || '').localeCompare(String(b.date || '')));
}
export const waitingDays = (item, today) => (item.date ? Math.max(0, daysBetween(item.date, today)) : null);

/** The window "recent" means: today and the `days - 1` days before it. */
export const recentSince = (today, days) => addDays(today, -(days - 1));

/** Three numbers the sidebar and nav do not already show. */
export function overviewMetrics(records, today, days) {
  const since = recentSince(today, days);
  return {
    merged: records.filter((row) => row.baseKey === 'changelog' && (row.fields['merged-on'] || '') >= since).length,
    accepted: records.filter((row) => row.baseKey === 'deliveries' && row.fields.status === 'accepted' && (row.fields['decided-on'] || '') >= since).length,
    backlog: records.filter((row) => row.baseKey === 'tasks' && row.fields.status === 'backlog').length,
  };
}

/** One row of the overview's product table. */
export function productSummary(records, productId, today, days) {
  const since = recentSince(today, days);
  const mine = (row) => links(row, 'product', productId);
  const tasks = records.filter((row) => row.baseKey === 'tasks' && mine(row));
  return {
    projects: records.filter((row) => row.baseKey === 'projects' && mine(row) && isLiveProject(row)),
    inProgress: tasks.filter((row) => row.fields.status === 'in-progress').length,
    inReview: tasks.filter((row) => row.fields.status === 'in-review').length,
    overdue: tasks.filter((row) => isOverdue(row, today)).length,
    merged: records.filter((row) => row.baseKey === 'changelog' && mine(row) && (row.fields['merged-on'] || '') >= since).length,
    awaiting: records.filter((row) => row.baseKey === 'deliveries' && mine(row) && row.fields.status === 'ready').length,
  };
}

/** Done / total over the LOADED tasks of a project (canceled excluded). */
export function projectProgress(records, projectId) {
  const tasks = records.filter((row) => row.baseKey === 'tasks' && links(row, 'project', projectId) && row.fields.status !== 'canceled');
  return { done: tasks.filter((row) => row.fields.status === 'done').length, total: tasks.length };
}

/** Rows of `baseKey` whose `slug` relation points at `id`. */
export const linkedFrom = (records, baseKey, slug, id) => records.filter((row) => row.baseKey === baseKey && links(row, slug, id));

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
