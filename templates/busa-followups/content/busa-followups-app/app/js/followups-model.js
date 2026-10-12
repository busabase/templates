// Pure domain logic for busa-followups. One feature only, per its PRD's own
// non-goals: record a followup, see today's list, mark it done.

function isBlank(value) {
  return !String(value ?? "").trim();
}

export function normalizeFollowupRow(row) {
  return {
    record_id: row.record_id || "",
    meeting: row.meeting || "",
    person: row.person || "",
    action: row.action || "",
    due: row.due || "",
    status: row.status === "done" ? "done" : "pending",
    created_at: row.created_at || "",
  };
}

export const NORMALIZE_ROW_BY_KEY = { followups: normalizeFollowupRow };

// "Today" per the PRD's acceptance criteria: pending items whose due date is
// today or already past. No calendar sync, no scheduled notification -- the
// PRD explicitly defers both; this is the "open it and see" version.
export function isDueToday(row, todayIso) {
  if (row.status === "done") return false;
  if (isBlank(row.due)) return true; // no date set: always due
  return row.due <= todayIso;
}

// Past its date and still pending. A subset of "today" (an item without a
// date is due today but never overdue).
export function isOverdue(row, todayIso) {
  return row.status !== "done" && !isBlank(row.due) && row.due < todayIso;
}

// Pending before done; within each, earliest due first, undated pending items
// at the top of the pending group (they are always due), undated done last.
export function compareFollowups(a, b) {
  if (a.status !== b.status) return a.status === "done" ? 1 : -1;
  const dueA = a.due || (a.status === "done" ? "\uffff" : "");
  const dueB = b.due || (b.status === "done" ? "\uffff" : "");
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return String(a.person).localeCompare(String(b.person));
}

export function buildSnapshot({ followups = [] }, todayIso) {
  const normalized = (Array.isArray(followups) ? followups : []).map(normalizeFollowupRow).sort(compareFollowups);
  const today = normalized.filter((row) => isDueToday(row, todayIso));
  const overdue = normalized.filter((row) => isOverdue(row, todayIso));
  const upcoming = normalized.filter((row) => row.status === "pending" && !isDueToday(row, todayIso));
  const done = normalized.filter((row) => row.status === "done");
  return {
    today_iso: todayIso,
    followups: normalized,
    today,
    overdue,
    upcoming,
    done,
    counts: { today: today.length, overdue: overdue.length, upcoming: upcoming.length, done: done.length },
  };
}
