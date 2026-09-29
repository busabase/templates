export const seedRecords = {
  cases: [
    {
      key: "cases-1",
      fields: {
        name: "Northstar equipment delivery dispute / 设备交付争议",
        code: "CASE-101",
        counterparty: "Northstar Equipment Ltd.",
        owner: "Jordan Mei",
        status: "litigation",
        due: "2026-10-08",
        next: "Confirm evidence filing receipt / 核查证据提交回执",
        notes:
          "Fictional delivery dispute. Signed delivery record is pending verification; no prediction of legal outcome. / 虚构的交付争议；已签交付记录待核验，不预测法律结果。",
      },
    },
    {
      key: "cases-2",
      fields: {
        name: "Seabrook receivables recovery / 应收款追偿",
        code: "CASE-102",
        counterparty: "Seabrook Studio Ltd.",
        owner: "Jordan Mei",
        status: "settlement",
        due: "2026-10-05",
        next: "Review installment settlement draft / 复核分期和解草案",
        notes:
          "Settlement draft contains three installments. Counsel and business owner approval required. / 和解草案包含三期付款，须经律师及业务负责人批准。",
      },
    },
    {
      key: "cases-3",
      fields: {
        name: "Pinegate service scope dispute / 服务范围争议",
        code: "CASE-103",
        counterparty: "Pinegate Services Ltd.",
        owner: "Cameron Han",
        status: "investigation",
        due: "2026-10-12",
        next: "Compile statement of work evidence / 整理工作说明书证据",
        notes:
          "Contract performance evidence is incomplete. Record facts separately from counsel opinions. / 合同履行证据不完整；事实与律师意见须分开记录。",
      },
    },
    {
      key: "cases-4",
      fields: {
        name: "Lakewell resolved dispute / 已解决的争议",
        code: "CASE-104",
        counterparty: "Lakewell Supply Ltd.",
        owner: "Cameron Han",
        status: "closed",
        due: "2026-09-15",
        next: "Archive approved closure evidence / 归档已批准的结案证据",
        notes:
          "Closure approved after recovered funds and court documents were reconciled. / 回款及法院文件核对完成后，结案获得批准。",
      },
    },
  ],
  deadlines: [
    {
      key: "deadlines-1",
      fields: {
        name: "Northstar preservation renewal / 保全续期",
        code: "DDL-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-10-02",
        source: "Fictional preservation order PO-101 / 虚构保全裁定 PO-101",
        notes:
          "Counsel must confirm order date, service evidence, timezone and renewal filing requirements. / 律师须核查裁定日期、送达证据、时区及续期申请要求。",
      },
    },
    {
      key: "deadlines-2",
      fields: {
        name: "Seabrook installment evidence / 分期付款凭证",
        code: "DDL-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "overdue",
        due: "2026-09-28",
        source: "Fictional signed settlement draft v2 / 虚构已签和解草案第 2 版",
        notes:
          "Bank receipt not reconciled. Never mark deadline complete from a planned transfer. / 银行回单尚未核对；不得依据计划转账将期限标为完成。",
      },
    },
    {
      key: "deadlines-3",
      fields: {
        name: "Pinegate evidence filing / 证据提交",
        code: "DDL-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "unverified",
        due: null,
        source: "Source notice not yet received / 尚未收到来源通知",
        notes:
          "No date is inferred. Request the notice and counsel verification before setting a deadline. / 不推断日期；设定期限前须取得通知并由律师核验。",
      },
    },
  ],
  settlements: [
    {
      key: "settlements-1",
      fields: {
        name: "Seabrook first installment / 第一期回款",
        code: "PAY-101",
        case: "CASE-102",
        owner: "Morgan Yu",
        kind: "recovery",
        amount: 58000,
        currency: "CNY",
        status: "verified",
        due: "2026-09-25",
        source: "Fictional bank receipt RC-101 / 虚构银行回单 RC-101",
        notes:
          "Received and reconciled against the approved settlement schedule. / 款项已收到，并与已批准的和解付款计划核对。",
      },
    },
    {
      key: "settlements-2",
      fields: {
        name: "Northstar counsel retainer / 律师预付费用",
        code: "PAY-102",
        case: "CASE-101",
        owner: "Morgan Yu",
        kind: "cost",
        amount: 12000,
        currency: "CNY",
        status: "verified",
        due: "2026-09-24",
        source: "Fictional invoice INV-101 / 虚构发票 INV-101",
        notes:
          "Invoice and payment evidence reviewed. Retainer is a cost, not a recovery. / 发票及付款凭证已经复核；律师预付费用属于成本，不是回款。",
      },
    },
    {
      key: "settlements-3",
      fields: {
        name: "Pinegate document translation / 文件翻译",
        code: "PAY-103",
        case: "CASE-103",
        owner: "Morgan Yu",
        kind: "cost",
        amount: 850,
        currency: "USD",
        status: "needs_review",
        due: "2026-09-29",
        source: "Fictional quote QT-101 / 虚构报价 QT-101",
        notes: "Quote only; not paid, exclude from realized totals. / 仅为报价，尚未付款，不计入已实现金额。",
      },
    },
  ],
  updates: [
    {
      key: "updates-1",
      fields: {
        name: "Northstar evidence package received / 已收到证据包",
        code: "UPD-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "verified",
        due: "2026-09-26",
        source: "Fictional evidence pack EP-101 / 虚构证据包 EP-101",
        notes:
          "12 delivery exhibits received; one signature requires verification. / 已收到 12 份交付证据，其中一处签名需要核验。",
      },
    },
    {
      key: "updates-2",
      fields: {
        name: "Seabrook settlement draft revised / 和解草案已修订",
        code: "UPD-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-09-28",
        source: "Fictional settlement v2 / 虚构和解草案第 2 版",
        notes:
          "Draft changed installment timing. Approval is not inferred from negotiation. / 草案调整了分期时间；不得将协商推断为批准。",
      },
    },
    {
      key: "updates-3",
      fields: {
        name: "Pinegate service records requested / 已请求服务记录",
        code: "UPD-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "recorded",
        due: "2026-09-29",
        source: "Fictional request NOTE-103 / 虚构请求 NOTE-103",
        notes:
          "Business owner asked to supply delivery logs and statement of work. / 已要求业务负责人提供交付日志及工作说明书。",
      },
    },
  ],
  tasks: [
    {
      key: "tasks-1",
      fields: {
        name: "Confirm preservation renewal filing / 核查保全续期申请",
        code: "TASK-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-10-01",
        next: "Counsel checks source order and filing receipt / 律师核查来源裁定及申请回执",
        notes:
          "External filing must be authorized and performed by qualified counsel. / 对外提交必须获得授权，并由具备资格的律师执行。",
      },
    },
    {
      key: "tasks-2",
      fields: {
        name: "Verify settlement authority / 核验和解权限",
        code: "TASK-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "blocked",
        due: "2026-09-30",
        next: "Obtain business owner signature authority / 取得业务负责人签署授权",
        notes:
          "No signature, payment, concession, or acceptance until authority is confirmed. / 权限核验完成前，不得签署、付款、让步或接受和解。",
      },
    },
    {
      key: "tasks-3",
      fields: {
        name: "Collect scope evidence / 收集服务范围证据",
        code: "TASK-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "open",
        due: "2026-10-04",
        next: "Request signed scope and delivery records / 请求已签范围文件及交付记录",
        notes:
          "Use minimal access. Do not expose privileged material to unapproved readers. / 采用最小访问权限；不得向未经批准的读者披露受保密特权保护的材料。",
      },
    },
  ],
};
