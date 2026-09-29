export const appConfig = {
  appId: "busa-office-legal",
  appName: "Legal Case Desk",
  appNameZh: "法务管理",
  description:
    "Case progress, preservation deadlines, settlement evidence, and legal follow-up.",
  descriptionZh: "案件进度、保全期限、回款成本与法务待办",
  deployment: "cloud",
  binding: "runtime",
  readOnly: true,
  schemaVersion: 1,
  brand: {
    accent: "#735a87",
  },
  folder: {
    name: "Legal Case Desk",
    slug: "busa-office-legal",
    description:
      "Case progress, preservation deadlines, settlement evidence, and legal follow-up.",
    agentPrompts: [
      {
        key: "review-0",
        label: {
          en: "Review active cases and preservation deadlines and identify missing legal evid",
          "zh-CN": "核查在办案件与保全期限，列出缺少法律证据的事项",
        },
        intent: "read-only",
        body: {
          en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nReview active cases and preservation deadlines and identify missing legal evidence. Cite source records, label missing evidence and keep changes reviewable.",
          "zh-CN":
            "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查在办案件与保全期限，列出缺少法律证据的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
        },
      },
      {
        key: "review-1",
        label: {
          en: "Reconcile case recovery and legal costs by currency, then prepare a review sum",
          "zh-CN": "按币种核对案件回款及法务成本，拟定人工复核摘要",
        },
        intent: "read-only",
        body: {
          en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nReconcile case recovery and legal costs by currency, then prepare a review summary. Cite source records, label missing evidence and keep changes reviewable.",
          "zh-CN":
            "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按币种核对案件回款及法务成本，拟定人工复核摘要。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
        },
      },
    ],
  },
  airApp: {
    name: "Legal Case Desk",
    slug: "busa-office-legal-app",
    resourceKey: "busa-office-legal-app",
  },
  bases: [
    {
      key: "cases",
      name: "Cases",
      labelZh: "法务案件",
      description: "Disputes, case owners, stages and next legal actions",
      fields: [
        {
          slug: "name",
          name: "Name",
          labelZh: "名称",
          type: "text",
          required: true,
          options: {},
        },
        {
          slug: "code",
          name: "Case code",
          labelZh: "案件编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "counterparty",
          name: "Counterparty",
          labelZh: "对方主体",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Case owner",
          labelZh: "案件负责人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Case stage",
          labelZh: "案件阶段",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Next hearing",
          labelZh: "下次庭审",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "next",
          name: "Next action",
          labelZh: "下一步",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Dispute summary",
          labelZh: "争议摘要",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-legal-cases",
      readLimit: 50,
      agentPrompts: [
        {
          key: "cases-0",
          label: {
            en: "Summarize active case next steps",
            "zh-CN": "核查法务案件中需要关注的事项",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nSummarize active case next steps. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查法务案件中需要关注的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
        {
          key: "cases-1",
          label: {
            en: "Draft a factual case update",
            "zh-CN": "按工作流程拟定法务案件变更",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nDraft a factual case update. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按工作流程拟定法务案件变更。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Cases working table",
          type: "table",
          config: {
            visibleFieldSlugs: ["name", "owner", "status", "due"],
            sorts: [
              {
                fieldSlug: "due",
                direction: "asc",
              },
            ],
          },
          slug: "busa-office-legal-cases-working",
        },
      ],
    },
    {
      key: "deadlines",
      name: "Preservation & deadlines",
      labelZh: "保全与期限",
      description: "Preservation and legal due dates with source authority",
      fields: [
        {
          slug: "name",
          name: "Name",
          labelZh: "名称",
          type: "text",
          required: true,
          options: {},
        },
        {
          slug: "code",
          name: "Deadline code",
          labelZh: "期限编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "case",
          name: "Case code",
          labelZh: "案件编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Responsible counsel",
          labelZh: "负责律师",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Verification state",
          labelZh: "核验状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Verified due date",
          labelZh: "已核验期限",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "source",
          name: "Deadline authority",
          labelZh: "期限依据",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Preservation notes",
          labelZh: "保全备注",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-legal-deadlines",
      readLimit: 50,
      agentPrompts: [
        {
          key: "deadlines-0",
          label: {
            en: "Review upcoming preservation expiries",
            "zh-CN": "核查保全与期限中需要关注的事项",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nReview upcoming preservation expiries. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查保全与期限中需要关注的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
        {
          key: "deadlines-1",
          label: {
            en: "Verify a deadline against source evidence",
            "zh-CN": "按工作流程拟定保全与期限变更",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nVerify a deadline against source evidence. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按工作流程拟定保全与期限变更。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Preservation & deadlines working table",
          type: "table",
          config: {
            visibleFieldSlugs: ["name", "owner", "status", "due"],
            sorts: [
              {
                fieldSlug: "due",
                direction: "asc",
              },
            ],
          },
          slug: "busa-office-legal-deadlines-working",
        },
      ],
    },
    {
      key: "settlements",
      name: "Recoveries & costs",
      labelZh: "回款与成本",
      description:
        "Case recoveries and costs with currency and verification evidence",
      fields: [
        {
          slug: "name",
          name: "Name",
          labelZh: "名称",
          type: "text",
          required: true,
          options: {},
        },
        {
          slug: "code",
          name: "Entry code",
          labelZh: "流水编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "case",
          name: "Case code",
          labelZh: "案件编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Finance reviewer",
          labelZh: "财务复核人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "kind",
          name: "Entry type",
          labelZh: "流水类别",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "amount",
          name: "Amount",
          labelZh: "金额",
          type: "number",
          required: false,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency",
          labelZh: "币种",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Evidence state",
          labelZh: "凭证状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Posting date",
          labelZh: "记账日期",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "source",
          name: "Evidence reference",
          labelZh: "凭证编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Reconciliation notes",
          labelZh: "对账说明",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-legal-settlements",
      readLimit: 50,
      agentPrompts: [
        {
          key: "settlements-0",
          label: {
            en: "Reconcile verified recoveries and costs",
            "zh-CN": "核查回款与成本中需要关注的事项",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nReconcile verified recoveries and costs. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查回款与成本中需要关注的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
        {
          key: "settlements-1",
          label: {
            en: "Draft a missing-evidence checklist",
            "zh-CN": "按工作流程拟定回款与成本变更",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nDraft a missing-evidence checklist. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按工作流程拟定回款与成本变更。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Recoveries & costs working table",
          type: "table",
          config: {
            visibleFieldSlugs: ["name", "owner", "status", "due"],
            sorts: [
              {
                fieldSlug: "due",
                direction: "asc",
              },
            ],
          },
          slug: "busa-office-legal-settlements-working",
        },
      ],
    },
    {
      key: "updates",
      name: "Case timeline",
      labelZh: "案件进展",
      description: "Chronological factual case progress with source references",
      fields: [
        {
          slug: "name",
          name: "Name",
          labelZh: "名称",
          type: "text",
          required: true,
          options: {},
        },
        {
          slug: "code",
          name: "Update code",
          labelZh: "进展编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "case",
          name: "Case code",
          labelZh: "案件编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Author",
          labelZh: "记录人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Evidence state",
          labelZh: "证据状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Occurred on",
          labelZh: "发生日期",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "source",
          name: "Source reference",
          labelZh: "来源编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Factual update",
          labelZh: "事实记录",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-legal-updates",
      readLimit: 50,
      agentPrompts: [
        {
          key: "updates-0",
          label: {
            en: "Build a chronological case summary",
            "zh-CN": "核查案件进展中需要关注的事项",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nBuild a chronological case summary. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查案件进展中需要关注的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
        {
          key: "updates-1",
          label: {
            en: "Draft a sourced case progress entry",
            "zh-CN": "按工作流程拟定案件进展变更",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nDraft a sourced case progress entry. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按工作流程拟定案件进展变更。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Case timeline working table",
          type: "table",
          config: {
            visibleFieldSlugs: ["name", "owner", "status", "due"],
            sorts: [
              {
                fieldSlug: "due",
                direction: "asc",
              },
            ],
          },
          slug: "busa-office-legal-updates-working",
        },
      ],
    },
    {
      key: "tasks",
      name: "Legal follow-up",
      labelZh: "法务待办",
      description: "Accountable counsel and business owner follow-up actions",
      fields: [
        {
          slug: "name",
          name: "Name",
          labelZh: "名称",
          type: "text",
          required: true,
          options: {},
        },
        {
          slug: "code",
          name: "Task code",
          labelZh: "待办编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "case",
          name: "Case code",
          labelZh: "案件编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Responsible owner",
          labelZh: "负责人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Task state",
          labelZh: "待办状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Action due",
          labelZh: "行动期限",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "next",
          name: "Required action",
          labelZh: "所需行动",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Review context",
          labelZh: "复核背景",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-legal-tasks",
      readLimit: 50,
      agentPrompts: [
        {
          key: "tasks-0",
          label: {
            en: "Prioritize overdue legal follow-up",
            "zh-CN": "核查法务待办中需要关注的事项",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nPrioritize overdue legal follow-up. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n核查法务待办中需要关注的事项。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
        {
          key: "tasks-1",
          label: {
            en: "Prepare a reviewable next-action proposal",
            "zh-CN": "按工作流程拟定法务待办变更",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-legal skill in this folder and follow its workflow.\n\n{target}\n\nPrepare a reviewable next-action proposal. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-legal Skill，遵守其工作流程。\n\n{target}\n\n按工作流程拟定法务待办变更。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Legal follow-up working table",
          type: "table",
          config: {
            visibleFieldSlugs: ["name", "owner", "status", "due"],
            sorts: [
              {
                fieldSlug: "due",
                direction: "asc",
              },
            ],
          },
          slug: "busa-office-legal-tasks-working",
        },
      ],
    },
  ],
  permissions: {
    readProcedures: [
      "nodes.list",
      "nodes.get",
      "bases.get",
      "records.list",
      "records.count",
    ],
    writeProcedures: [],
  },
  onboarding: {
    version: 1,
    steps: [],
    rationale:
      "Installed resources and seed records are ready; no external integration is required.",
  },
  ui: {
    primary: "cases",
  },
  limits: {
    pendingChangeRequests: 20,
  },
};
