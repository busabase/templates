export const appConfig = {
  appId: "busa-office-recruiting",
  appName: "Recruiting Desk",
  appNameZh: "招聘管理",
  description:
    "Hiring positions, candidate pipelines, interviews, and reviewed offers.",
  descriptionZh: "职位需求、候选人进度、面试反馈与录用复核",
  deployment: "cloud",
  binding: "runtime",
  readOnly: true,
  schemaVersion: 1,
  brand: {
    accent: "#276b55",
  },
  folder: {
    name: "Recruiting Desk",
    slug: "busa-office-recruiting",
    description:
      "Hiring positions, candidate pipelines, interviews, and reviewed offers.",
    agentPrompts: [
      {
        key: "review-0",
        label: {
          en: "Review applicants whose next step is overdue and prepare a hiring follow-up pl",
          "zh-CN": "梳理下一步逾期的候选人，拟定招聘跟进计划",
        },
        intent: "read-only",
        body: {
          en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nReview applicants whose next step is overdue and prepare a hiring follow-up plan. Cite source records, label missing evidence and keep changes reviewable.",
          "zh-CN":
            "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n梳理下一步逾期的候选人，拟定招聘跟进计划。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
        },
      },
      {
        key: "review-1",
        label: {
          en: "Check interview feedback and draft offer proposals for human review",
          "zh-CN": "核对面试反馈，为需要录用的候选人准备人工复核草案",
        },
        intent: "read-only",
        body: {
          en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nCheck interview feedback and draft offer proposals for human review. Cite source records, label missing evidence and keep changes reviewable.",
          "zh-CN":
            "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n核对面试反馈，为需要录用的候选人准备人工复核草案。引用来源记录，标明缺失证据，所有变更通过变更申请提交。",
        },
      },
    ],
  },
  airApp: {
    name: "Recruiting Desk",
    slug: "busa-office-recruiting-app",
    resourceKey: "busa-office-recruiting-app",
  },
  bases: [
    {
      key: "positions",
      name: "Positions",
      labelZh: "招聘职位",
      description: "Approved hiring requirements and vacancy ownership",
      descriptionZh: "已批准的招聘要求及空缺职位负责人",
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
          name: "Position code",
          labelZh: "职位编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "department",
          name: "Department",
          labelZh: "部门",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Hiring owner",
          labelZh: "招聘负责人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "headcount",
          name: "Approved headcount",
          labelZh: "已批准人数",
          type: "number",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Status",
          labelZh: "状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Target start",
          labelZh: "目标到岗日",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Requirements",
          labelZh: "任职要求",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-recruiting-positions",
      readLimit: 50,
      agentPrompts: [
        {
          key: "positions-0",
          label: {
            en: "Review open position capacity",
            "zh-CN": "核查开放职位的招聘名额",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nReview open position capacity. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n核查开放职位的招聘名额。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
        {
          key: "positions-1",
          label: {
            en: "Draft a role requirement update",
            "zh-CN": "拟定岗位要求更新草案",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nDraft a role requirement update. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n拟定岗位要求更新草案。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Positions working table",
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
          slug: "busa-office-recruiting-positions-working",
        },
      ],
    },
    {
      key: "applicants",
      name: "Applicants",
      labelZh: "候选人",
      description: "Candidate stage, next action and role assessment evidence",
      descriptionZh: "候选人阶段、下一步行动及岗位评估证据",
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
          name: "Candidate code",
          labelZh: "候选人编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "position",
          name: "Position code",
          labelZh: "职位编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Recruiter",
          labelZh: "招聘专员",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Hiring stage",
          labelZh: "招聘阶段",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Next step date",
          labelZh: "下一步日期",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "next",
          name: "Next step",
          labelZh: "下一步",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Evidence and notes",
          labelZh: "证据与备注",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-recruiting-applicants",
      readLimit: 50,
      agentPrompts: [
        {
          key: "applicants-0",
          label: {
            en: "Review candidates needing follow-up",
            "zh-CN": "核查需要跟进的候选人",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nReview candidates needing follow-up. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n核查需要跟进的候选人。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
        {
          key: "applicants-1",
          label: {
            en: "Propose a candidate stage change",
            "zh-CN": "拟定候选人阶段变更草案",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nPropose a candidate stage change. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n拟定候选人阶段变更草案。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Applicants working table",
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
          slug: "busa-office-recruiting-applicants-working",
        },
      ],
    },
    {
      key: "interviews",
      name: "Interviews",
      labelZh: "面试安排",
      description: "Interview scheduling and structured feedback evidence",
      descriptionZh: "面试安排及结构化反馈证据",
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
          name: "Interview code",
          labelZh: "面试编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "candidate",
          name: "Candidate code",
          labelZh: "候选人编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Interviewer",
          labelZh: "面试官",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "status",
          name: "Feedback state",
          labelZh: "反馈状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Interview date",
          labelZh: "面试日期",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Structured feedback",
          labelZh: "结构化反馈",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-recruiting-interviews",
      readLimit: 50,
      agentPrompts: [
        {
          key: "interviews-0",
          label: {
            en: "Find interviews missing feedback",
            "zh-CN": "查找缺少反馈的面试",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nFind interviews missing feedback. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n查找缺少反馈的面试。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
        {
          key: "interviews-1",
          label: {
            en: "Draft evidence-based interview notes",
            "zh-CN": "依据证据拟定面试记录草案",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nDraft evidence-based interview notes. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n依据证据拟定面试记录草案。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Interviews working table",
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
          slug: "busa-office-recruiting-interviews-working",
        },
      ],
    },
    {
      key: "offers",
      name: "Offer review",
      labelZh: "录用复核",
      description:
        "Compensation proposals, review status and acceptance evidence",
      descriptionZh: "薪酬草案、复核状态及候选人接受凭证",
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
          name: "Offer code",
          labelZh: "录用编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "candidate",
          name: "Candidate code",
          labelZh: "候选人编号",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "owner",
          name: "Approver",
          labelZh: "复核人",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "amount",
          name: "Monthly salary",
          labelZh: "月薪",
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
          name: "Review state",
          labelZh: "复核状态",
          type: "text",
          required: false,
          options: {},
        },
        {
          slug: "due",
          name: "Decision due",
          labelZh: "复核期限",
          type: "date",
          required: false,
          options: {},
        },
        {
          slug: "notes",
          name: "Conditions",
          labelZh: "录用条件",
          type: "longtext",
          required: false,
          options: {},
        },
      ],
      slug: "busa-office-recruiting-offers",
      readLimit: 50,
      agentPrompts: [
        {
          key: "offers-0",
          label: {
            en: "Audit offers awaiting approval",
            "zh-CN": "审查待批准的录用草案",
          },
          intent: "read-only",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nAudit offers awaiting approval. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n审查待批准的录用草案。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
        {
          key: "offers-1",
          label: {
            en: "Draft an offer review checklist",
            "zh-CN": "拟定录用复核清单",
          },
          intent: "change",
          body: {
            en: "Read the busa-office-recruiting skill in this folder and follow its workflow.\n\n{target}\n\nDraft an offer review checklist. Cite source records, label missing evidence and keep changes reviewable.",
            "zh-CN":
              "先阅读本目录的 busa-office-recruiting Skill，遵守其工作流程。\n\n{target}\n\n拟定录用复核清单。引用来源记录，标明缺失证据，保留可供复核的变更草案。",
          },
        },
      ],
      views: [
        {
          key: "working",
          name: "Offer review working table",
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
          slug: "busa-office-recruiting-offers-working",
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
    primary: "applicants",
  },
  limits: {
    pendingChangeRequests: 20,
  },
};
