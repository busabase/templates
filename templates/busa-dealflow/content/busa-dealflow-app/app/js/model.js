// Pure functions over loaded records: no DOM, no network. Everything a screen
// derives — the week, projects seen, findings, follow-ups, a project's
// timeline — is computed here so the demo provider, the live provider and the
// tests all agree on one meaning.

const DAY = 86400000;
const CLOSED_FOLLOWUP = new Set(['done', 'dropped']);
const PHASE_ORDER = ['pre', 'during', 'post'];

export const isoDay = (date) => new Date(date).toISOString().slice(0, 10);
/** Today in the viewer's own time zone — "this week" must not flip at UTC midnight. */
export const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
// screens see the same rows in both modes.
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

// ── The week ───────────────────────────────────────────────────────────────
/** Monday of the ISO week that contains `iso`. */
export function weekStart(iso) {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((weekday + 6) % 7));
}
/** `{ from, to, label }` for the week containing `iso`, shifted by `offset` weeks. */
export function weekRange(iso, offset = 0) {
  const from = addDays(weekStart(iso), offset * 7);
  const to = addDays(from, 6);
  return { from, to, label: isoWeekLabel(from) };
}
/** `2026-W45` for any day in that ISO week. */
export function isoWeekLabel(iso) {
  const thursday = addDays(weekStart(iso), 3);
  const year = thursday.slice(0, 4);
  const firstThursday = addDays(weekStart(`${year}-01-04`), 3);
  return `${year}-W${String(daysBetween(firstThursday, thursday) / 7 + 1).padStart(2, '0')}`;
}
/** Parse `2026-W45` back to the Monday of that week, or null. */
export function weekFromLabel(label) {
  const match = /^(\d{4})-W(\d{2})$/.exec(label || '');
  if (!match) return null;
  const monday = addDays(weekStart(`${match[1]}-01-04`), (Number(match[2]) - 1) * 7);
  return isoWeekLabel(monday) === label ? monday : null;
}
const inRange = (iso, { from, to }) => Boolean(iso) && iso >= from && iso <= to;

// ── Domain rules ───────────────────────────────────────────────────────────
export const isOpenFollowup = (row) => !CLOSED_FOLLOWUP.has(row.fields.status);
export const isOverdue = (row, today) => isOpenFollowup(row) && Boolean(row.fields['due-on']) && row.fields['due-on'] < today;

export const meetingsIn = (records, range) => records
  .filter((row) => row.baseKey === 'meetings' && inRange(row.fields['held-on'], range))
  .sort((a, b) => String(b.fields['held-on']).localeCompare(String(a.fields['held-on'])));

/** Split a markdown bullet list into its lines, without the bullet marks. */
export const bulletLines = (text) => String(text || '').split('\n').map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()).filter(Boolean);

/** People named on a meeting: who recorded it first, then attendees on our side. */
const people = (meeting) => [meeting.fields['recorded-by'], ...String(meeting.fields.attendees || '').split(/[；;]/)[0].split(/[、,，]|及/)]
  .map((name) => String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim()).filter(Boolean);

/**
 * "Which projects did the team see this week": every project with at least one
 * meeting or filed document in the range, most recent first.
 */
export function projectsSeen(records, range) {
  const byDeal = new Map();
  for (const meeting of meetingsIn(records, range)) {
    for (const dealId of relationIds(meeting.fields.deal)) {
      const entry = byDeal.get(dealId) || { dealId, meetings: [], people: new Set() };
      entry.meetings.push(meeting);
      for (const name of people(meeting)) entry.people.add(name);
      byDeal.set(dealId, entry);
    }
  }
  return [...byDeal.values()].map((entry) => ({ ...entry, people: [...entry.people], latest: entry.meetings[0] }));
}

/** Key findings from the range's meetings, one line each, newest first. */
export function findingsIn(records, range) {
  return meetingsIn(records, range).flatMap((meeting) => bulletLines(meeting.fields.highlights).map((text) => ({ meeting, text })));
}

/**
 * Follow-ups a person has to act on soon: overdue first (oldest first), then
 * due within `soonDays`, then undated open ones are left out — they are not
 * urgent by any measure the team agreed on.
 */
export function followupsDue(records, today, soonDays) {
  const horizon = addDays(today, soonDays);
  return records
    .filter((row) => row.baseKey === 'followups' && isOpenFollowup(row) && row.fields['due-on'] && row.fields['due-on'] <= horizon)
    .map((row) => ({ record: row, overdue: isOverdue(row, today) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.record.fields['due-on']).localeCompare(String(b.record.fields['due-on'])));
}

/** The numbers on the overview band, for one week. */
export function weekMetrics(records, range, today, soonDays) {
  const due = followupsDue(records, today, soonDays);
  return {
    projects: projectsSeen(records, range).length,
    meetings: meetingsIn(records, range).length,
    findings: findingsIn(records, range).length,
    due: due.length,
    overdue: due.filter((item) => item.overdue).length,
  };
}

/** A project's meetings in date order, grouped pre → during → post. */
export function dealTimeline(records, dealId) {
  const meetings = linkedFrom(records, 'meetings', 'deal', dealId)
    .sort((a, b) => String(a.fields['held-on']).localeCompare(String(b.fields['held-on'])));
  return PHASE_ORDER.map((phase) => ({ phase, meetings: meetings.filter((row) => row.fields.phase === phase) }))
    .concat([{ phase: 'other', meetings: meetings.filter((row) => !PHASE_ORDER.includes(row.fields.phase)) }])
    .filter((group) => group.meetings.length);
}

/**
 * The address to put in the agent prompt. Busabase Cloud also serves spaces on
 * `<space>.busabase.com`; the CLI is documented against the root host, so any
 * busabase.com origin becomes https://busabase.com. A private deployment keeps
 * its own origin (and the person can still edit the field).
 */
export function defaultServerAddress(origin) {
  try {
    const url = new URL(origin);
    return /(^|\.)busabase\.com$/i.test(url.host) ? 'https://busabase.com' : url.origin;
  } catch { return 'https://busabase.com'; }
}

/** True when the loaded projects are the template's invented sample. */
export const hasSyntheticData = (records) => records.some((row) => row.baseKey === 'deals' && /合成|synthetic/i.test(String(row.fields.source || '')));

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
