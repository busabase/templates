export const appConfig = {
  appId: "busa-office-cashier",
  appName: "Cashier Desk",
  appTitle: {
    en: "Cashier Desk",
    "zh-CN": "出纳管理",
  },
  deployment: "cloud",
  binding: "runtime",
  readOnly: true,
  schemaVersion: 1,
  folder: {
    slug: "busa-office-cashier",
    name: "Cashier Desk",
    description:
      "Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money.",
  },
  airApp: {
    slug: "busa-office-cashier-app",
    resourceKey: "busa-office-cashier-app",
    name: "Cashier Desk",
  },
  bases: [
    {
      key: "accounts",
      resourceKey: "accounts",
      slug: "busa-office-cashier-accounts",
      name: "Bank accounts",
      nameI18n: {
        en: "Bank accounts",
        "zh-CN": "银行账户",
      },
      description:
        "List active bank accounts and their last checked date; flag stale balances and restricted accounts without treating book balances as live bank data.",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Check bank account freshness",
            "zh-CN": "检查账户核查时效",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nList active bank accounts and their last checked date; flag stale balances and restricted accounts without treating book balances as live bank data.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n检查账户核查时效。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Register a bank account",
            "zh-CN": "登记银行账户",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nPrepare an account register entry with entity, currency and masked account suffix only; do not include banking credentials or full account numbers.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n登记银行账户。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title",
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
          name: "Entity",
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
          name: "Owner",
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
          name: "Status",
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
                id: "active",
                name: "active",
              },
              {
                id: "restricted",
                name: "restricted",
              },
              {
                id: "closed",
                name: "closed",
              },
            ],
          },
        },
        {
          slug: "bank",
          name: "Bank",
          nameI18n: {
            en: "Bank",
            "zh-CN": "银行",
          },
          type: "text",
          required: false,
          position: 4,
          options: {},
        },
        {
          slug: "accountHint",
          name: "Account suffix",
          nameI18n: {
            en: "Account suffix",
            "zh-CN": "账户尾号",
          },
          type: "text",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "balance",
          name: "Book balance",
          nameI18n: {
            en: "Book balance",
            "zh-CN": "账面余额",
          },
          type: "number",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "checkedAt",
          name: "Checked at",
          nameI18n: {
            en: "Checked at",
            "zh-CN": "核查时间",
          },
          type: "date",
          required: false,
          position: 8,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 9,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Bank accounts",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "bank",
              "accountHint",
              "currency",
              "balance",
              "checkedAt",
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
          name: "Needs review",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "restricted",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "owner", "status", "currency", "balance", "checkedAt"],
    },
    {
      key: "checks",
      resourceKey: "checks",
      slug: "busa-office-cashier-checks",
      name: "Daily balance checks",
      nameI18n: {
        en: "Daily balance checks",
        "zh-CN": "每日余额走查",
      },
      description:
        "Compare each daily check with its book balance and bank evidence; list discrepancies and stale checks without inventing adjustments.",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Review balance differences",
            "zh-CN": "检查银行与账面差异",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nCompare each daily check with its book balance and bank evidence; list discrepancies and stale checks without inventing adjustments.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n检查银行与账面差异。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare a daily check",
            "zh-CN": "准备每日走查",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nPrepare a daily balance check from a statement or verified balance supplied by me, link the account, and propose any exception with its source reference.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n准备每日走查。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title",
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
          name: "Entity",
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
          name: "Owner",
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
          name: "Status",
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
                id: "pending",
                name: "pending",
              },
              {
                id: "matched",
                name: "matched",
              },
              {
                id: "exception",
                name: "exception",
              },
            ],
          },
        },
        {
          slug: "account",
          name: "Bank account",
          nameI18n: {
            en: "Bank account",
            "zh-CN": "银行账户",
          },
          type: "relation",
          required: false,
          position: 4,
          options: {
            targetBaseSlug: "busa-office-cashier-accounts",
          },
        },
        {
          slug: "currency",
          name: "Currency",
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
          slug: "balance",
          name: "Book balance",
          nameI18n: {
            en: "Book balance",
            "zh-CN": "账面余额",
          },
          type: "number",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "bankBalance",
          name: "Bank balance",
          nameI18n: {
            en: "Bank balance",
            "zh-CN": "银行余额",
          },
          type: "number",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "checkedAt",
          name: "Checked at",
          nameI18n: {
            en: "Checked at",
            "zh-CN": "核查时间",
          },
          type: "date",
          required: false,
          position: 8,
          options: {},
        },
        {
          slug: "evidence",
          name: "Evidence reference",
          nameI18n: {
            en: "Evidence reference",
            "zh-CN": "凭证引用",
          },
          type: "text",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "reason",
          name: "Attention reason",
          nameI18n: {
            en: "Attention reason",
            "zh-CN": "需关注原因",
          },
          type: "longtext",
          required: false,
          position: 10,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes",
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
          name: "Daily balance checks",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "account",
              "currency",
              "balance",
              "bankBalance",
              "checkedAt",
              "evidence",
              "reason",
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
          name: "Needs review",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "matched",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "checkedAt", "balance", "bankBalance", "status"],
    },
    {
      key: "payments",
      resourceKey: "payments",
      slug: "busa-office-cashier-payments",
      name: "Payment requests",
      nameI18n: {
        en: "Payment requests",
        "zh-CN": "付款申请",
      },
      description:
        "Review pending, approved and blocked payments, separating approval from actual payment and flagging missing invoice or bank receipt references.",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Review payments awaiting evidence",
            "zh-CN": "检查付款依据",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nReview pending, approved and blocked payments, separating approval from actual payment and flagging missing invoice or bank receipt references.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n检查付款依据。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Prepare a payment request",
            "zh-CN": "准备付款申请",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nPrepare a payment request from supplied invoice and approval evidence, link the bank account and propose the record. Never execute or authorize a bank transfer.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n准备付款申请。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title",
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
          name: "Entity",
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
          name: "Owner",
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
          name: "Status",
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
                name: "draft",
              },
              {
                id: "pending",
                name: "pending",
              },
              {
                id: "approved",
                name: "approved",
              },
              {
                id: "paid",
                name: "paid",
              },
              {
                id: "blocked",
                name: "blocked",
              },
            ],
          },
        },
        {
          slug: "account",
          name: "Bank account",
          nameI18n: {
            en: "Bank account",
            "zh-CN": "银行账户",
          },
          type: "relation",
          required: false,
          position: 4,
          options: {
            targetBaseSlug: "busa-office-cashier-accounts",
          },
        },
        {
          slug: "amount",
          name: "Amount",
          nameI18n: {
            en: "Amount",
            "zh-CN": "金额",
          },
          type: "number",
          required: false,
          position: 5,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "due",
          name: "Due date",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "approval",
          name: "Approval reference",
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
          slug: "receipt",
          name: "Receipt reference",
          nameI18n: {
            en: "Receipt reference",
            "zh-CN": "回单引用",
          },
          type: "text",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "paidAt",
          name: "Paid date",
          nameI18n: {
            en: "Paid date",
            "zh-CN": "付款日期",
          },
          type: "date",
          required: false,
          position: 10,
          options: {},
        },
        {
          slug: "invoice",
          name: "Invoice reference",
          nameI18n: {
            en: "Invoice reference",
            "zh-CN": "发票引用",
          },
          type: "text",
          required: false,
          position: 11,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 12,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Payment requests",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "account",
              "amount",
              "currency",
              "due",
              "approval",
              "receipt",
              "paidAt",
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
          name: "Needs review",
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
      key: "ledger",
      resourceKey: "ledger",
      slug: "busa-office-cashier-ledger",
      name: "Cash ledger",
      nameI18n: {
        en: "Cash ledger",
        "zh-CN": "收付流水",
      },
      description:
        "List unmatched and exception cash movements with bank receipt and invoice evidence; distinguish a paid request from a reconciled ledger entry.",
      readLimit: 50,
      agentPrompts: [
        {
          key: "scenario-0",
          label: {
            en: "Review unreconciled cash movements",
            "zh-CN": "检查未对账流水",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nList unmatched and exception cash movements with bank receipt and invoice evidence; distinguish a paid request from a reconciled ledger entry.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n检查未对账流水。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "read-only",
        },
        {
          key: "scenario-1",
          label: {
            en: "Propose a ledger match",
            "zh-CN": "准备流水匹配建议",
          },
          body: {
            en: "Read the `busa-office-cashier` skill in this folder first.\n\n{target}\n\nCompare the ledger entry I name to a supplied bank receipt and payment request. Propose a reconciliation only when amount, currency and source evidence agree.",
            "zh-CN":
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n准备流水匹配建议。核对原始依据与状态；修改须通过变更申请，不执行付款、开票或申报。",
          },
          intent: "change",
        },
      ],
      fields: [
        {
          slug: "title",
          name: "Title",
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
          name: "Entity",
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
          name: "Owner",
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
          name: "Status",
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
                id: "unmatched",
                name: "unmatched",
              },
              {
                id: "reconciled",
                name: "reconciled",
              },
              {
                id: "exception",
                name: "exception",
              },
            ],
          },
        },
        {
          slug: "account",
          name: "Bank account",
          nameI18n: {
            en: "Bank account",
            "zh-CN": "银行账户",
          },
          type: "relation",
          required: false,
          position: 4,
          options: {
            targetBaseSlug: "busa-office-cashier-accounts",
          },
        },
        {
          slug: "payment",
          name: "Payment request",
          nameI18n: {
            en: "Payment request",
            "zh-CN": "付款申请",
          },
          type: "relation",
          required: false,
          position: 5,
          options: {
            targetBaseSlug: "busa-office-cashier-payments",
          },
        },
        {
          slug: "amount",
          name: "Amount",
          nameI18n: {
            en: "Amount",
            "zh-CN": "金额",
          },
          type: "number",
          required: false,
          position: 6,
          options: {},
        },
        {
          slug: "currency",
          name: "Currency",
          nameI18n: {
            en: "Currency",
            "zh-CN": "币种",
          },
          type: "text",
          required: false,
          position: 7,
          options: {},
        },
        {
          slug: "direction",
          name: "Direction",
          nameI18n: {
            en: "Direction",
            "zh-CN": "收付方向",
          },
          type: "select",
          required: false,
          position: 8,
          options: {
            choices: [
              {
                id: "in",
                name: "in",
              },
              {
                id: "out",
                name: "out",
              },
            ],
          },
        },
        {
          slug: "due",
          name: "Due date",
          nameI18n: {
            en: "Due date",
            "zh-CN": "到期日",
          },
          type: "date",
          required: false,
          position: 9,
          options: {},
        },
        {
          slug: "receipt",
          name: "Receipt reference",
          nameI18n: {
            en: "Receipt reference",
            "zh-CN": "回单引用",
          },
          type: "text",
          required: false,
          position: 10,
          options: {},
        },
        {
          slug: "invoice",
          name: "Invoice reference",
          nameI18n: {
            en: "Invoice reference",
            "zh-CN": "发票引用",
          },
          type: "text",
          required: false,
          position: 11,
          options: {},
        },
        {
          slug: "reason",
          name: "Attention reason",
          nameI18n: {
            en: "Attention reason",
            "zh-CN": "需关注原因",
          },
          type: "longtext",
          required: false,
          position: 12,
          options: {},
        },
        {
          slug: "notes",
          name: "Notes",
          nameI18n: {
            en: "Notes",
            "zh-CN": "备注",
          },
          type: "longtext",
          required: false,
          position: 13,
          options: {},
        },
      ],
      views: [
        {
          slug: "register",
          name: "Cash ledger",
          type: "table",
          position: 0,
          config: {
            visibleFieldSlugs: [
              "title",
              "entity",
              "owner",
              "status",
              "account",
              "payment",
              "amount",
              "currency",
              "direction",
              "due",
              "receipt",
              "invoice",
              "reason",
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
          name: "Needs review",
          type: "table",
          position: 1,
          config: {
            visibleFieldSlugs: ["title", "owner", "status", "notes"],
            filters: [
              {
                fieldSlug: "status",
                operator: "equals",
                value: "reconciled",
              },
            ],
          },
        },
      ],
      primaryField: "title",
      columns: ["title", "owner", "status", "amount", "currency", "due"],
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
