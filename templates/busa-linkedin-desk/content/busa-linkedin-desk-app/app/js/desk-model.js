// The desk's read model: pure functions from provider records to the five
// console sections. No I/O, no environment branching — app.js feeds it
// records and a clock, and renders what comes back.
//
// Every field slug and enum id below mirrors `content/<base>/base.json`,
// the package's single field declaration. `scripts/check-desk-consistency.mjs`
// (template root) fails if a slug or enum id used here is not declared there.

export const STALE_DAYS = 7; // the desk's standing rule: a thread quiet longer than this needs a nudge

// Enum labels per locale. The English values are exactly the choice
// names declared in `content/<base>/base.json` (installed names are
// plain English); the zh-CN values are the choices' Chinese names. The
// consistency script asserts the two never drift, so the console calls a
// choice by the same words the installed Base shows.
export const LABELS = {
  en: {
    intent: {
      interested: "Interested",
      objection: "Objection",
      referral: "Referral",
      "not-now": "Not now",
      "wrong-person": "Wrong person",
      rejected: "Rejected",
      question: "Question",
      other: "Other",
    },
    experienceType: {
      script: "What works",
      objection: "Objection handling",
      "triage-rule": "Triage rule",
      cadence: "Cadence",
      forbidden: "Red line",
    },
    actionType: {
      "follow-up": "Follow-up",
      escalate: "Escalate",
      meeting: "Meeting",
      "send-material": "Send material",
      "update-crm": "Update CRM field",
      "new-deal": "New deal",
      other: "Other",
    },
  },
  "zh-CN": {
    intent: {
      interested: "有意向",
      objection: "异议",
      referral: "转介",
      "not-now": "现在不要",
      "wrong-person": "找错人",
      rejected: "拒绝",
      question: "咨询",
      other: "其它",
    },
    experienceType: {
      script: "有效话术",
      objection: "异议处理",
      "triage-rule": "分诊规则",
      cadence: "节奏经验",
      forbidden: "禁区教训",
    },
    actionType: {
      "follow-up": "跟进",
      escalate: "升级人工",
      meeting: "约会议",
      "send-material": "发送资料",
      "update-crm": "更新 CRM 字段",
      "new-deal": "新建商机",
      other: "其它",
    },
  },
};

export const labelsFor = (locale) => LABELS[locale] ?? LABELS.en;

const URGENCY_RANK = { high: 0, medium: 1, low: 2 };
const OPEN_ACTION_STATUSES = new Set(["open", "in-progress"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const asId = (value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first == null) return null;
  return typeof first === "object" ? (first.id ?? null) : first;
};

const parseTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const sameLocalDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfLocalDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function formatWait(ms) {
  if (ms == null || ms < 0) return "—";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function buildDeskView(records, now = new Date()) {
  const byBase = (key) => records.filter((r) => r.baseKey === key);
  const contacts = byBase("contacts");
  const messages = byBase("messages");
  const replies = byBase("replies");
  const actions = byBase("actions");
  const experience = byBase("experience");

  const contactById = new Map(contacts.map((r) => [r.id, r]));
  const messageById = new Map(messages.map((r) => [r.id, r]));
  const replyById = new Map(replies.map((r) => [r.id, r]));
  const actionById = new Map(actions.map((r) => [r.id, r]));
  const contactName = (record) => {
    const id = record ? asId(record.fields?.contact) : null;
    return id ? (contactById.get(id)?.fields?.name ?? null) : null;
  };

  // 1) Approval queue: reply drafts a human has not decided on yet.
  const approvals = replies
    .filter((r) => r.fields?.["approval-status"] === "pending")
    .map((reply) => {
      const message = messageById.get(asId(reply.fields?.message)) ?? null;
      const since = parseTime(message?.fields?.["sent-at"]) ?? parseTime(reply.createdAt);
      return {
        reply,
        message,
        contactName: contactName(reply) ?? contactName(message),
        urgency: message?.fields?.urgency ?? null,
        waitingMs: since == null ? null : now.getTime() - since,
        draft: reply.fields?.draft ?? "",
        title: reply.fields?.title ?? "",
      };
    })
    .sort(
      (a, b) =>
        (URGENCY_RANK[a.urgency] ?? 3) - (URGENCY_RANK[b.urgency] ?? 3) ||
        (b.waitingMs ?? 0) - (a.waitingMs ?? 0),
    );

  // 2) Today's triage: what arrived today, what it was about, what is unjudged.
  const todaysInbound = messages.filter((r) => {
    const t = parseTime(r.fields?.["sent-at"]);
    return r.fields?.direction === "in" && t != null && sameLocalDay(new Date(t), now);
  });
  const intentCounts = {};
  for (const r of todaysInbound) {
    const intent = r.fields?.intent ?? "other";
    intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;
  }
  const awaitingTriage = messages.filter((r) => r.fields?.status === "pending-triage").length;

  // 3a) Actions that are due: overdue first, then due today.
  const todayStart = startOfLocalDay(now);
  const dueActions = actions
    .filter((r) => OPEN_ACTION_STATUSES.has(r.fields?.status))
    .map((action) => ({ action, due: parseTime(action.fields?.["due-date"]) }))
    .filter(({ due }) => due != null && due < todayStart + DAY_MS)
    .sort((a, b) => a.due - b.due)
    .map(({ action, due }) => ({
      action,
      overdue: due < todayStart,
      title: action.fields?.title ?? "",
      type: action.fields?.type ?? "other",
    }));

  // 3b) Stalled threads: the newest message in a thread is older than the
  // desk's quiet threshold and the thread was never marked no-action.
  const latestByThread = new Map();
  for (const r of messages) {
    const thread = r.fields?.["thread-id"];
    const t = parseTime(r.fields?.["sent-at"]);
    if (!thread || t == null) continue;
    if (!latestByThread.has(thread) || t > latestByThread.get(thread).time) {
      latestByThread.set(thread, { record: r, time: t });
    }
  }
  const stalled = [...latestByThread.values()]
    .filter(({ record, time }) => now.getTime() - time > STALE_DAYS * DAY_MS && record.fields?.status !== "no-action")
    .sort((a, b) => a.time - b.time)
    .map(({ record, time }) => ({
      message: record,
      contactName: contactName(record),
      quietDays: Math.floor((now.getTime() - time) / DAY_MS),
      direction: record.fields?.direction ?? null,
      title: record.fields?.title ?? "",
    }));

  // 4) Candidate experience: lessons distilled from approval notes, awaiting
  // the weekly review's verdict.
  const candidates = experience
    .filter((r) => r.fields?.status === "candidate")
    .map((row) => ({
      row,
      title: row.fields?.title ?? "",
      type: row.fields?.type ?? "script",
      quote: row.fields?.["approval-quote"] ?? "",
      sourceTitle:
        replyById.get(asId(row.fields?.["source-reply"]))?.fields?.title ??
        actionById.get(asId(row.fields?.["source-action"]))?.fields?.title ??
        null,
    }));

  return {
    approvals,
    today: { newInbound: todaysInbound.length, intentCounts, awaitingTriage },
    dueActions,
    stalled,
    candidates,
  };
}

// The copyable daily report, in the shape the desk's own daily-report prompt
// and the companion article use: what arrived, what waits on a human, what
// is stuck, what was learned. Plain text, one fact per line, in the active
// locale — every word comes from `t` (messages.js) and `labels`.
export function buildReportText(view, now, t, labels) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const intents = Object.entries(view.today.intentCounts)
    .map(([intent, n]) => `${labels.intent[intent] ?? intent} ${n}`)
    .join(" · ");
  const lines = [
    `Busa LinkedIn Desk — ${t.reportHeading} ${date}`,
    t.reportNew(view.today.newInbound, intents, view.today.awaitingTriage),
    t.reportApprovals(view.approvals.length),
    ...view.approvals.slice(0, 5).map(
      (a) => `  - ${a.title}${a.contactName ? ` (${a.contactName})` : ""} — ${t.reportWaiting(formatWait(a.waitingMs))}`,
    ),
    t.reportDue(view.dueActions.length),
    ...view.dueActions.slice(0, 5).map((d) => `  - ${d.title}${d.overdue ? t.reportOverdueSuffix : t.reportDueTodaySuffix}`),
    t.reportQuiet(STALE_DAYS, view.stalled.length),
    ...view.stalled.slice(0, 5).map(
      (s) => `  - ${s.title}${s.contactName ? ` (${s.contactName})` : ""} — ${t.quietDays(s.quietDays)}`,
    ),
    t.reportCandidates(view.candidates.length),
  ];
  return lines.join("\n");
}
