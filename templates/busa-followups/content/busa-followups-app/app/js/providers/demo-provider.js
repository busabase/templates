// Deterministic, explicitly-labeled, read-only demo data.
import { buildSnapshot, normalizeFollowupRow } from "../followups-model.js?v=0.1.0";

const TODAY = "2026-09-02";

const FOLLOWUPS = [
  {
    record_id: "fu-1",
    meeting: "周三产品评审",
    person: "阿明",
    action: "把演示环境的账号权限改成只读",
    due: "2026-09-01",
    status: "pending",
    created_at: "2026-08-27T09:00:00.000Z",
  },
  {
    record_id: "fu-2",
    meeting: "周三产品评审",
    person: "小雨",
    action: "把客户提的报价疑问回复清楚",
    due: TODAY,
    status: "pending",
    created_at: "2026-08-27T09:05:00.000Z",
  },
  {
    record_id: "fu-3",
    meeting: "周一晨会",
    person: "老张",
    action: "确认交付延期的新日期",
    due: "2026-09-10",
    status: "pending",
    created_at: "2026-09-01T01:30:00.000Z",
  },
  {
    record_id: "fu-4",
    meeting: "周一晨会",
    person: "阿明",
    action: "上周那个客户的合同已经补签",
    due: "2026-08-28",
    status: "done",
    created_at: "2026-08-25T01:30:00.000Z",
  },
  {
    record_id: "fu-5",
    meeting: "客户周会 · 远航物流",
    person: "王经理",
    action: "发一版新的实施排期，标出第二阶段的上线日",
    due: "2026-08-31",
    status: "pending",
    created_at: "2026-08-28T06:00:00.000Z",
  },
  {
    record_id: "fu-6",
    meeting: "周一晨会",
    person: "Lina",
    action: "确认下周培训的会议室和人数",
    due: "",
    status: "pending",
    created_at: "2026-09-01T01:40:00.000Z",
  },
  {
    record_id: "fu-7",
    meeting: "季度复盘",
    person: "陈总",
    action: "把复盘里提到的三个改进项整理成一页纸发给他",
    due: "2026-09-04",
    status: "pending",
    created_at: "2026-08-29T08:00:00.000Z",
  },
  {
    record_id: "fu-8",
    meeting: "客户周会 · 远航物流",
    person: "小雨",
    action: "约对方财务开一次对账会",
    due: "2026-09-08",
    status: "pending",
    created_at: "2026-08-28T06:10:00.000Z",
  },
  {
    record_id: "fu-9",
    meeting: "季度复盘",
    person: "老张",
    action: "补上上季度遗漏的两张发票",
    due: "2026-08-30",
    status: "done",
    created_at: "2026-08-29T08:10:00.000Z",
  },
  {
    record_id: "fu-10",
    meeting: "周三产品评审",
    person: "Kevin",
    action: "试用版到期提醒的文案再改一版，语气别太硬",
    due: TODAY,
    status: "pending",
    created_at: "2026-08-27T09:10:00.000Z",
  },
];

export const demoProvider = {
  kind: "demo",
  async getState() {
    const snapshot = buildSnapshot({ followups: FOLLOWUPS }, TODAY);
    snapshot.totals = {
      total: FOLLOWUPS.length,
      done: FOLLOWUPS.filter((row) => row.status === "done").length,
    };
    return {
      app: "busa-followups",
      demo: true,
      data_provider: "demo",
      lock: null,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      pagination: { followups: null },
      snapshot,
    };
  },
  async fetchPage() {
    return { rows: [], nextCursor: null };
  },
  async getRecord(_key, recordId) {
    const row = FOLLOWUPS.find((item) => item.record_id === recordId);
    return row ? normalizeFollowupRow(row) : null;
  },
  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
