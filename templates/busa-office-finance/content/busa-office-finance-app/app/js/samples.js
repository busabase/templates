export const samples = {
  expenses: [
    {
      key: "expenses-1",
      fields: {
        title: "September team travel / 九月团队差旅",
        entity: "Lumen Studio",
        owner: "Lin Chen",
        status: "pending",
        amount: 1860,
        currency: "CNY",
        due: "2026-10-03",
        evidence:
          "Travel receipts TR-009 (synthetic) / 差旅收据 TR-009（虚构）",
        approval: "",
        paidAt: "",
        notes:
          "Hotel invoice is missing. Hold until receipt is supplied. / 缺少酒店发票，补齐凭证前暂缓处理。",
      },
    },
    {
      key: "expenses-2",
      fields: {
        title: "Office network renewal / 办公网络续费",
        entity: "Lumen Studio",
        owner: "Maya Zhou",
        status: "approved",
        amount: 720,
        currency: "CNY",
        due: "2026-10-05",
        evidence: "Invoice INV-102 (synthetic) / 发票 INV-102（虚构）",
        approval: "Finance review FR-019 (synthetic) / 财务审核 FR-019（虚构）",
        paidAt: "",
        notes:
          "Approved for reimbursement; payment has not been confirmed. / 已批准报销，尚未确认付款。",
      },
    },
    {
      key: "expenses-3",
      fields: {
        title: "August stationery / 八月办公文具",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "paid",
        amount: 385,
        currency: "CNY",
        due: "2026-09-20",
        evidence: "Invoice INV-088 (synthetic) / 发票 INV-088（虚构）",
        approval: "Finance review FR-011 (synthetic) / 财务审核 FR-011（虚构）",
        paidAt: "2026-09-21",
        receipt: "SYN-RC-088",
        notes:
          "Payment receipt RC-088 verified (synthetic). / 已核对付款回单 RC-088（虚构）。",
      },
    },
    {
      key: "expenses-4",
      fields: {
        title: "Client workshop supplies / 客户工作坊用品",
        entity: "Lumen Studio",
        owner: "Lin Chen",
        status: "blocked",
        amount: 1240,
        currency: "CNY",
        due: "2026-10-01",
        evidence: "Receipt WS-023 (synthetic) / 收据 WS-023（虚构）",
        approval: "",
        paidAt: "",
        notes:
          "Receipt total 1,240 differs from requested invoice total 1,420. / 收据合计 1,240，与申请的发票金额 1,420 不一致。",
      },
    },
  ],
  invoices: [
    {
      key: "invoices-1",
      fields: {
        title: "Workshop invoice request / 工作坊开票申请",
        entity: "Lumen Studio",
        owner: "Maya Zhou",
        status: "pending",
        amount: 16800,
        currency: "CNY",
        due: "2026-10-02",
        evidence: "Contract CT-204 (synthetic) / 合同 CT-204（虚构）",
        approval: "",
        invoice: "",
        notes:
          "Customer tax details are awaiting confirmation. / 客户税务信息尚待确认。",
      },
    },
    {
      key: "invoices-2",
      fields: {
        title: "Design retainer - September / 九月设计顾问服务费",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "approved",
        amount: 24000,
        currency: "CNY",
        due: "2026-10-03",
        evidence: "Contract CT-201 (synthetic) / 合同 CT-201（虚构）",
        approval:
          "Issuance review IR-014 (synthetic) / 开票审核 IR-014（虚构）",
        invoice: "",
        notes:
          "Approved, but invoice has not been issued. / 已批准，但尚未开具发票。",
      },
    },
    {
      key: "invoices-3",
      fields: {
        title: "Support service - August / 八月支持服务",
        entity: "Lumen Studio",
        owner: "Maya Zhou",
        status: "issued",
        amount: 9600,
        currency: "CNY",
        due: "2026-09-22",
        evidence: "Contract CT-197 (synthetic) / 合同 CT-197（虚构）",
        approval:
          "Issuance review IR-012 (synthetic) / 开票审核 IR-012（虚构）",
        invoice: "SYN-INV-197",
        notes:
          "Synthetic invoice registered; collection is tracked separately. / 已登记虚构发票；收款情况单独跟踪。",
      },
    },
  ],
  reports: [
    {
      key: "reports-1",
      fields: {
        title: "September operating actuals / 九月经营实际数据",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "review",
        period: "2026-09",
        currency: "CNY",
        revenue: 108000,
        cost: 76400,
        due: "2026-10-08",
        reviewer: "Maya Zhou",
        evidence:
          "September close pack SEP-26 (synthetic) / 九月结账资料 SEP-26（虚构）",
        notes:
          "One vendor invoice remains outstanding. Figures are provisional. / 仍缺少一张供应商发票，数据为暂定值。",
      },
    },
    {
      key: "reports-2",
      fields: {
        title: "August operating actuals / 八月经营实际数据",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "accepted",
        period: "2026-08",
        currency: "CNY",
        revenue: 98000,
        cost: 70300,
        due: "2026-09-08",
        reviewer: "Maya Zhou",
        evidence:
          "August close pack AUG-26 (synthetic) / 八月结账资料 AUG-26（虚构）",
        notes:
          "Reviewer acceptance recorded on 2026-09-09; not an audited statement. / 已记录复核人于 2026-09-09 接受报告；并非经审计的报表。",
      },
    },
    {
      key: "reports-3",
      fields: {
        title: "October close preparation / 十月结账准备",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "draft",
        period: "2026-10",
        currency: "CNY",
        revenue: 0,
        cost: 0,
        due: "2026-11-08",
        reviewer: "Maya Zhou",
        evidence: "",
        notes:
          "No actuals entered yet. Zero means unpopulated, not zero activity. / 尚未录入实际数据。零表示尚未填报，不表示没有业务活动。",
      },
    },
  ],
  filings: [
    {
      key: "filings-1",
      fields: {
        title: "September periodic filing / 九月定期申报",
        entity: "Lumen Studio",
        owner: "Maya Zhou",
        status: "preparing",
        period: "2026-09",
        due: "2026-10-15",
        evidence:
          "Operator reminder CAL-015 (synthetic) / 操作人员提醒 CAL-015（虚构）",
        reviewer: "Kai Wu",
        notes:
          "Illustrative operator-set deadline; confirm against current authority notice. / 操作人员设定的示例截止日期，须按当前官方通知核实。",
      },
    },
    {
      key: "filings-2",
      fields: {
        title: "Quarterly filing evidence review / 季度申报凭证复核",
        entity: "Lumen Studio",
        owner: "Kai Wu",
        status: "review",
        period: "2026-Q3",
        due: "2026-10-12",
        evidence:
          "Draft checklist Q3-26 (synthetic) / 材料清单草稿 Q3-26（虚构）",
        reviewer: "Maya Zhou",
        notes:
          "Review source documents before submission outside this app. / 在应用外提交申报前，核对原始资料。",
      },
    },
    {
      key: "filings-3",
      fields: {
        title: "August filing receipt / 八月申报回执",
        entity: "Lumen Studio",
        owner: "Maya Zhou",
        status: "filed",
        period: "2026-08",
        due: "2026-09-15",
        evidence: "SYN-FILING-0826",
        reviewer: "Kai Wu",
        notes:
          "Synthetic acknowledgment recorded; no real filing occurred. / 已记录虚构回执，未进行真实申报。",
      },
    },
  ],
};
