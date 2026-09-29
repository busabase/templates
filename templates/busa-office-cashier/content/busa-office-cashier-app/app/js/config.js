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
    name: "Cashier Desk / 出纳管理",
    description:
      "Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money. / 管理银行走查、付款依据、收付流水和对账异常，不执行资金转账。",
  },
  airApp: {
    slug: "busa-office-cashier-app",
    resourceKey: "busa-office-cashier-app",
    name: "Cashier Desk / 出纳管理",
  },
  bases: [
    {
      key: "accounts",
      resourceKey: "accounts",
      slug: "busa-office-cashier-accounts",
      name: "Bank accounts / 银行账户",
      nameI18n: {
        en: "Bank accounts",
        "zh-CN": "银行账户",
      },
      description:
        "List active bank accounts and their last checked date; flag stale balances and restricted accounts without treating book balances as live bank data. / 列出正常银行账户及最近核查时间，标记过期余额和受限账户；不将账面余额视为银行实时数据。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n列出正常银行账户及最近核查时间，标记过期余额和受限账户；不将账面余额视为银行实时数据。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n准备包含主体、币种和脱敏账户尾号的账户登记记录；不包含银行登录凭据或完整账号。",
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
                id: "active",
                name: "Active / 正常",
              },
              {
                id: "restricted",
                name: "Restricted / 受限",
              },
              {
                id: "closed",
                name: "Closed / 已关闭",
              },
            ],
          },
        },
        {
          slug: "bank",
          name: "Bank / 银行",
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
          name: "Account suffix / 账户尾号",
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
          name: "Currency / 币种",
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
          name: "Book balance / 账面余额",
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
          name: "Checked at / 核查时间",
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
          name: "Notes / 备注",
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
          name: "Bank accounts / 银行账户",
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
          name: "Needs review / 待复核",
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
      name: "Daily balance checks / 每日余额走查",
      nameI18n: {
        en: "Daily balance checks",
        "zh-CN": "每日余额走查",
      },
      description:
        "Compare each daily check with its book balance and bank evidence; list discrepancies and stale checks without inventing adjustments. / 将每日走查记录与账面余额及银行依据核对，列出差异和过期核查；不编造调整记录。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n将每日走查记录与账面余额及银行依据核对，列出差异和过期核查；不编造调整记录。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n根据我提供的银行对账单或已核实余额准备每日走查，关联账户，并为存在差异的事项附上来源引用后提出变更申请。",
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
                id: "pending",
                name: "Pending review / 待审核",
              },
              {
                id: "matched",
                name: "Matched / 已匹配",
              },
              {
                id: "exception",
                name: "Exception / 存在差异",
              },
            ],
          },
        },
        {
          slug: "account",
          name: "Bank account / 银行账户",
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
          slug: "balance",
          name: "Book balance / 账面余额",
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
          name: "Bank balance / 银行余额",
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
          name: "Checked at / 核查时间",
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
          name: "Evidence reference / 凭证引用",
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
          name: "Attention reason / 需关注原因",
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
          name: "Daily balance checks / 每日余额走查",
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
          name: "Needs review / 待复核",
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
      name: "Payment requests / 付款申请",
      nameI18n: {
        en: "Payment requests",
        "zh-CN": "付款申请",
      },
      description:
        "Review pending, approved and blocked payments, separating approval from actual payment and flagging missing invoice or bank receipt references. / 复核待审核、已批准和已阻塞的付款申请，区分审批与实际付款，并标记缺失的发票或银行回单引用。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n复核待审核、已批准和已阻塞的付款申请，区分审批与实际付款，并标记缺失的发票或银行回单引用。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n根据提供的发票和审批依据准备付款申请，关联银行账户并提出记录变更申请；不执行或授权银行转账。",
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
          slug: "account",
          name: "Bank account / 银行账户",
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
          name: "Amount / 金额",
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
          name: "Currency / 币种",
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
          name: "Due date / 到期日",
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
          slug: "receipt",
          name: "Receipt reference / 回单引用",
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
          name: "Paid date / 付款日期",
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
          name: "Invoice reference / 发票引用",
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
          name: "Notes / 备注",
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
          name: "Payment requests / 付款申请",
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
      key: "ledger",
      resourceKey: "ledger",
      slug: "busa-office-cashier-ledger",
      name: "Cash ledger / 收付流水",
      nameI18n: {
        en: "Cash ledger",
        "zh-CN": "收付流水",
      },
      description:
        "List unmatched and exception cash movements with bank receipt and invoice evidence; distinguish a paid request from a reconciled ledger entry. / 列出未匹配及存在差异的收付流水及其银行回单、发票依据；区分已付款申请与已对账流水。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n列出未匹配及存在差异的收付流水及其银行回单、发票依据；区分已付款申请与已对账流水。",
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
              "先阅读本文件夹的 `busa-office-cashier` Skill 并遵守其流程。\n\n{target}\n\n将我指定的流水与提供的银行回单和付款申请核对；只有金额、币种和原始依据一致时，才提出对账变更申请。",
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
                id: "unmatched",
                name: "Unmatched / 未匹配",
              },
              {
                id: "reconciled",
                name: "Reconciled / 已对账",
              },
              {
                id: "exception",
                name: "Exception / 存在差异",
              },
            ],
          },
        },
        {
          slug: "account",
          name: "Bank account / 银行账户",
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
          name: "Payment request / 付款申请",
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
          name: "Amount / 金额",
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
          name: "Currency / 币种",
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
          name: "Direction / 收付方向",
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
                name: "Incoming / 收入",
              },
              {
                id: "out",
                name: "Outgoing / 支出",
              },
            ],
          },
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
          position: 9,
          options: {},
        },
        {
          slug: "receipt",
          name: "Receipt reference / 回单引用",
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
          name: "Invoice reference / 发票引用",
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
          name: "Attention reason / 需关注原因",
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
          name: "Notes / 备注",
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
          name: "Cash ledger / 收付流水",
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
          name: "Needs review / 待复核",
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
