export const appConfig = {
  appId: "busa-office-finance",
  appName: "Office Finance",
  appTitle: {
    en: "Office Finance",
    "zh-CN": "财务管理",
  },
  deployment: "cloud",
  binding: "runtime",
  readOnly: true,
  schemaVersion: 1,
  folder: {
    slug: "busa-office-finance",
    name: "Office Finance / 财务管理",
    description:
      "Expense evidence, invoice requests, monthly actuals and filing deadlines in one review desk. / 集中复核报销依据、开票申请、月度实际报告和申报期限。",
  },
  airApp: {
    slug: "busa-office-finance-app",
    resourceKey: "busa-office-finance-app",
    name: "Office Finance / 财务管理",
  },
  bases: [
    {
      key: "expenses",
      resourceKey: "expenses",
      slug: "busa-office-finance-expenses",
      name: "Expenses & reimbursements / 费用与报销",
      nameI18n: {
        en: "Expenses & reimbursements",
        "zh-CN": "费用与报销",
      },
      description:
        "Review pending and blocked expense claims, list missing evidence and duplicates before suggesting approval. / 复核待审核和已阻塞的报销申请；在提出审批建议前，列出缺失凭证与重复申请。",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Review missing expense evidence",
            "zh-CN": "检查报销缺失凭证",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nReview pending and blocked expense claims, list missing evidence and duplicates before suggesting approval.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n复核待审核和已阻塞的报销申请；在提出审批建议前，列出缺失凭证与重复申请。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare an expense claim",
            "zh-CN": "准备报销申请",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nPrepare an expense claim from the receipts I provide, preserve original currency, and propose it for review.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n根据我提供的收据准备报销申请，保留原始币种，并提交供审核的变更申请。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title / 事项",
          nameI18n: {
            en: "Title",
            "zh-CN": "事项",
          },
          type: "text",
          required: true,
          position: 0,
          options: {},
        },
        {
          slug: "entity",
          name: "Entity / 主体",
          nameI18n: {
            en: "Entity",
            "zh-CN": "主体",
          },
          type: "text",
          required: false,
          position: 1,
          options: {},
        },
        {
          slug: "owner",
          name: "Owner / 负责人",
          nameI18n: {
            en: "Owner",
            "zh-CN": "负责人",
          },
          type: "text",
          required: false,
          position: 2,
          options: {},
        },
        {
          slug: "status",
          name: "Status / 状态",
          nameI18n: {
            en: "Status",
            "zh-CN": "状态",
          },
          type: "select",
          required: false,
          position: 3,
          options: {
            choices: [
              {
                id: "draft",
                name: "Draft / 草稿",
              },
              {
                id: "pending",
                name: "Pending review / 待审核",
              },
              {
                id: "approved",
                name: "Approved / 已批准",
              },
              {
                id: "paid",
                name: "Paid / 已付款",
              },
              {
                id: "blocked",
                name: "Blocked / 已阻塞",
              },
            ],
          },
        },
        {
          slug: "amount",
          name: "Amount / 金额",
          nameI18n: {
            en: "Amount",
            "zh-CN": "金额",
          },
          type: "number",
          required: false,
          position: 4,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency / 币种",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "due",
          name: "Due date / 到期日",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "evidence",
          name: "Evidence reference / 凭证引用",
          nameI18n: {
            en: "Evidence reference",
            "zh-CN": "凭证引用",
          },
          type: "text",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "approval",
          name: "Approval reference / 审批依据",
          nameI18n: {
            en: "Approval reference",
            "zh-CN": "审批依据",
          },
          type: "text",
          required: false,
          position: 8,
          options: {},
        },
        {
          slug: "paidAt",
          name: "Paid date / 付款日期",
          nameI18n: {
            en: "Paid date",
            "zh-CN": "付款日期",
          },
          type: "date",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes / 备注",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 10,
          options: {},
        },
        {
          slug: "receipt",
          name: "Payment receipt reference / 付款回单引用",
          nameI18n: {
            en: "Payment receipt reference",
            "zh-CN": "付款回单引用",
          },
          type: "text",
          required: false,
          position: 11,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Expenses & reimbursements / 费用与报销",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "amount",
              "currency",
              "due",
              "evidence",
              "approval",
              "paidAt",
              "notes",
            ],
            sorts: [
              {
                fieldSlug: "title",
                direction: "asc",
              },
            ],
          },
        },
        {
          slug: "attention",
          name: "Needs review / 待复核",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "pending",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "owner", "status", "amount", "currency", "due"],
    },
    {
      key: "invoices",
      resourceKey: "invoices",
      slug: "busa-office-finance-invoices",
      name: "Invoice requests / 开票申请",
      nameI18n: {
        en: "Invoice requests",
        "zh-CN": "开票申请",
      },
      description:
        "Check invoice requests against supplied customer and contract details; flag missing tax information without inventing it. / 根据已提供的客户和合同资料核对开票申请；标记缺失的税务信息，不编造信息。",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Check invoice requests",
            "zh-CN": "检查开票申请",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nCheck invoice requests against supplied customer and contract details; flag missing tax information without inventing it.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n根据已提供的客户和合同资料核对开票申请；标记缺失的税务信息，不编造信息。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare an issuance request",
            "zh-CN": "准备开票资料",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nPrepare an invoice issuance request with customer, amount, currency and contract evidence, then propose it for review.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n准备包含客户、金额、币种和合同依据的开票申请，并提交供审核的变更申请。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title / 事项",
          nameI18n: {
            en: "Title",
            "zh-CN": "事项",
          },
          type: "text",
          required: true,
          position: 0,
          options: {},
        },
        {
          slug: "entity",
          name: "Entity / 主体",
          nameI18n: {
            en: "Entity",
            "zh-CN": "主体",
          },
          type: "text",
          required: false,
          position: 1,
          options: {},
        },
        {
          slug: "owner",
          name: "Owner / 负责人",
          nameI18n: {
            en: "Owner",
            "zh-CN": "负责人",
          },
          type: "text",
          required: false,
          position: 2,
          options: {},
        },
        {
          slug: "status",
          name: "Status / 状态",
          nameI18n: {
            en: "Status",
            "zh-CN": "状态",
          },
          type: "select",
          required: false,
          position: 3,
          options: {
            choices: [
              {
                id: "draft",
                name: "Draft / 草稿",
              },
              {
                id: "pending",
                name: "Pending review / 待审核",
              },
              {
                id: "approved",
                name: "Approved / 已批准",
              },
              {
                id: "issued",
                name: "Issued / 已开票",
              },
              {
                id: "blocked",
                name: "Blocked / 已阻塞",
              },
            ],
          },
        },
        {
          slug: "amount",
          name: "Amount / 金额",
          nameI18n: {
            en: "Amount",
            "zh-CN": "金额",
          },
          type: "number",
          required: false,
          position: 4,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency / 币种",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "due",
          name: "Due date / 到期日",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "evidence",
          name: "Evidence reference / 凭证引用",
          nameI18n: {
            en: "Evidence reference",
            "zh-CN": "凭证引用",
          },
          type: "text",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "approval",
          name: "Approval reference / 审批依据",
          nameI18n: {
            en: "Approval reference",
            "zh-CN": "审批依据",
          },
          type: "text",
          required: false,
          position: 8,
          options: {},
        },
        {
          slug: "invoice",
          name: "Invoice reference / 发票引用",
          nameI18n: {
            en: "Invoice reference",
            "zh-CN": "发票引用",
          },
          type: "text",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes / 备注",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 10,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Invoice requests / 开票申请",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "amount",
              "currency",
              "due",
              "evidence",
              "approval",
              "invoice",
              "notes",
            ],
            sorts: [
              {
                fieldSlug: "title",
                direction: "asc",
              },
            ],
          },
        },
        {
          slug: "attention",
          name: "Needs review / 待复核",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "pending",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "owner", "status", "amount", "currency", "due"],
    },
    {
      key: "reports",
      resourceKey: "reports",
      slug: "busa-office-finance-reports",
      name: "Monthly actual reports / 月度实际报告",
      nameI18n: {
        en: "Monthly actual reports",
        "zh-CN": "月度实际报告",
      },
      description:
        "Compare monthly actual reports against their evidence, identify incomplete sources and explain variances without presenting this as an audited statement. / 将月度实际报告与原始依据核对，找出不完整的资料并解释差异，不将报告描述为经审计的报表。",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Review the monthly actuals",
            "zh-CN": "复核月度实际数据",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nCompare monthly actual reports against their evidence, identify incomplete sources and explain variances without presenting this as an audited statement.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n将月度实际报告与原始依据核对，找出不完整的资料并解释差异，不将报告描述为经审计的报表。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare monthly review notes",
            "zh-CN": "准备月度复核记录",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nPrepare monthly review notes using the actual figures and source references I provide, propose a draft report, and leave acceptance to the named reviewer.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n使用我提供的实际数据和资料引用准备月度复核记录，提出报告草稿，并由指定复核人确认接受。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title / 事项",
          nameI18n: {
            en: "Title",
            "zh-CN": "事项",
          },
          type: "text",
          required: true,
          position: 0,
          options: {},
        },
        {
          slug: "entity",
          name: "Entity / 主体",
          nameI18n: {
            en: "Entity",
            "zh-CN": "主体",
          },
          type: "text",
          required: false,
          position: 1,
          options: {},
        },
        {
          slug: "owner",
          name: "Owner / 负责人",
          nameI18n: {
            en: "Owner",
            "zh-CN": "负责人",
          },
          type: "text",
          required: false,
          position: 2,
          options: {},
        },
        {
          slug: "status",
          name: "Status / 状态",
          nameI18n: {
            en: "Status",
            "zh-CN": "状态",
          },
          type: "select",
          required: false,
          position: 3,
          options: {
            choices: [
              {
                id: "draft",
                name: "Draft / 草稿",
              },
              {
                id: "review",
                name: "In review / 待复核",
              },
              {
                id: "accepted",
                name: "Accepted / 已接受",
              },
              {
                id: "blocked",
                name: "Blocked / 已阻塞",
              },
            ],
          },
        },
        {
          slug: "period",
          name: "Period / 期间",
          nameI18n: {
            en: "Period",
            "zh-CN": "期间",
          },
          type: "text",
          required: false,
          position: 4,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency / 币种",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "revenue",
          name: "Revenue actual / 实际收入",
          nameI18n: {
            en: "Revenue actual",
            "zh-CN": "实际收入",
          },
          type: "number",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "cost",
          name: "Cost actual / 实际成本",
          nameI18n: {
            en: "Cost actual",
            "zh-CN": "实际成本",
          },
          type: "number",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "due",
          name: "Due date / 到期日",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 8,
          options: {},
        },
        {
          slug: "reviewer",
          name: "Reviewer / 复核人",
          nameI18n: {
            en: "Reviewer",
            "zh-CN": "复核人",
          },
          type: "text",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "evidence",
          name: "Evidence reference / 凭证引用",
          nameI18n: {
            en: "Evidence reference",
            "zh-CN": "凭证引用",
          },
          type: "text",
          required: false,
          position: 10,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes / 备注",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 11,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Monthly actual reports / 月度实际报告",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "period",
              "currency",
              "revenue",
              "cost",
              "due",
              "reviewer",
              "evidence",
              "notes",
            ],
            sorts: [
              {
                fieldSlug: "title",
                direction: "asc",
              },
            ],
          },
        },
        {
          slug: "attention",
          name: "Needs review / 待复核",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "review",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "period", "revenue", "cost", "status"],
    },
    {
      key: "filings",
      resourceKey: "filings",
      slug: "busa-office-finance-filings",
      name: "Filing calendar / 申报日历",
      nameI18n: {
        en: "Filing calendar",
        "zh-CN": "申报日历",
      },
      description:
        "List planned and unfiled deadlines, owners and missing evidence. Treat dates as operator-entered reminders, not legal advice. / 列出已计划和未完成申报事项的截止日期、负责人及缺失依据；日期仅作为操作人员录入的提醒，不构成法律建议。",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "List upcoming filing deadlines",
            "zh-CN": "列出申报截止事项",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nList planned and unfiled deadlines, owners and missing evidence. Treat dates as operator-entered reminders, not legal advice.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n列出已计划和未完成申报事项的截止日期、负责人及缺失依据；日期仅作为操作人员录入的提醒，不构成法律建议。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare a filing checklist",
            "zh-CN": "准备申报材料清单",
          },
          body: {
            en: "Read the `busa-office-finance` skill in this folder first.\n\n{target}\n\nPrepare a filing checklist for the period I name using supplied authority notices and source documents. Propose checklist changes; do not submit any filing.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-finance` Skill 并遵守其流程。\n\n{target}\n\n根据已提供的官方通知和原始文件，为我指定的期间准备申报材料清单；提出清单变更申请，不提交任何申报。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title / 事项",
          nameI18n: {
            en: "Title",
            "zh-CN": "事项",
          },
          type: "text",
          required: true,
          position: 0,
          options: {},
        },
        {
          slug: "entity",
          name: "Entity / 主体",
          nameI18n: {
            en: "Entity",
            "zh-CN": "主体",
          },
          type: "text",
          required: false,
          position: 1,
          options: {},
        },
        {
          slug: "owner",
          name: "Owner / 负责人",
          nameI18n: {
            en: "Owner",
            "zh-CN": "负责人",
          },
          type: "text",
          required: false,
          position: 2,
          options: {},
        },
        {
          slug: "status",
          name: "Status / 状态",
          nameI18n: {
            en: "Status",
            "zh-CN": "状态",
          },
          type: "select",
          required: false,
          position: 3,
          options: {
            choices: [
              {
                id: "planned",
                name: "Planned / 已计划",
              },
              {
                id: "preparing",
                name: "Preparing / 准备中",
              },
              {
                id: "review",
                name: "In review / 待复核",
              },
              {
                id: "filed",
                name: "Filed / 已申报",
              },
              {
                id: "blocked",
                name: "Blocked / 已阻塞",
              },
            ],
          },
        },
        {
          slug: "period",
          name: "Period / 期间",
          nameI18n: {
            en: "Period",
            "zh-CN": "期间",
          },
          type: "text",
          required: false,
          position: 4,
          options: {},
        },
        {
          slug: "due",
          name: "Due date / 到期日",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "evidence",
          name: "Evidence reference / 凭证引用",
          nameI18n: {
            en: "Evidence reference",
            "zh-CN": "凭证引用",
          },
          type: "text",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "reviewer",
          name: "Reviewer / 复核人",
          nameI18n: {
            en: "Reviewer",
            "zh-CN": "复核人",
          },
          type: "text",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes / 备注",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 8,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Filing calendar / 申报日历",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "period",
              "due",
              "evidence",
              "reviewer",
              "notes",
            ],
            sorts: [
              {
                fieldSlug: "title",
                direction: "asc",
              },
            ],
          },
        },
        {
          slug: "attention",
          name: "Needs review / 待复核",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "preparing",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "owner", "status", "period", "due"],
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
    fields: [],
    rationale:
      "No integrations or external credentials are required; the installed records are the operational state.",
  },
};
