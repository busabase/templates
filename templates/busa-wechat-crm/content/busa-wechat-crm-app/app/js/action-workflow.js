export const ACTION_FILTERS = [
  { key: "review", label: "待判断", statuses: ["needs-review", "changes-requested"] },
  { key: "ready", label: "准备执行", statuses: ["approved"] },
  { key: "waiting", label: "等待结果", statuses: ["awaiting-result", "snoozed"] },
  { key: "closed", label: "已结束", statuses: ["done", "blocked", "dismissed"] },
  { key: "all", label: "全部", statuses: null },
];

export const isTerminalAction = (status) => ["done", "blocked", "dismissed"].includes(status);

export const actionMatchesFilter = (record, filterKey) => {
  const filter = ACTION_FILTERS.find((item) => item.key === filterKey) || ACTION_FILTERS[0];
  return !filter.statuses || filter.statuses.includes(record.fields?.status);
};

export const outcomeStatus = (outcomeType) => (outcomeType === "sent-awaiting-reply" ? "awaiting-result" : "done");

const relation = (value) => (Array.isArray(value) ? value : value ? [value] : []);

export function buildOutcomeWorklog({ action, outcome, operationKey, now }) {
  return {
    title: `执行结果：${action.fields?.title || action.id}`,
    goal: relation(action.fields?.goal),
    person: relation(action.fields?.person),
    action: [action.id],
    "entry-type": "outcome",
    outcome,
    "tasks-created": `pending:incremental-analysis:${operationKey}`,
    status: "pending-agent",
    "operation-key": operationKey,
    "created-at": now,
  };
}

export function buildWaitAction({ action, operationKey, dueAt }) {
  return {
    title: `等待回复：${action.fields?.title || action.id}`,
    goal: relation(action.fields?.goal),
    person: relation(action.fields?.person),
    "action-type": "wait",
    status: "snoozed",
    rationale: "已执行原行动，等待对方回复或下一次检查。",
    priority: action.fields?.priority || "medium",
    "parent-action": [action.id],
    "operation-key": operationKey,
    "due-at": dueAt,
  };
}
