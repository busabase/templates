export const seedRecords = {
  positions: [
    {
      key: "positions-1",
      fields: {
        name: "Customer Success Specialist / 客户成功专员",
        code: "JOB-101",
        department: "Customer operations / 客户运营",
        owner: "Riley Chen",
        headcount: 2,
        status: "open",
        due: "2026-10-15",
        notes:
          "Own onboarding reviews and customer support; interview against a documented role rubric. / 负责客户启用复核与客户支持；面试须依据书面岗位评分标准。",
      },
    },
    {
      key: "positions-2",
      fields: {
        name: "Finance Analyst / 财务分析师",
        code: "JOB-102",
        department: "Finance / 财务",
        owner: "Morgan Yu",
        headcount: 1,
        status: "open",
        due: "2026-10-30",
        notes:
          "Monthly close, reconciliation, and evidence-led variance analysis. / 月度结账、对账及依据证据开展差异分析。",
      },
    },
    {
      key: "positions-3",
      fields: {
        name: "Product Designer / 产品设计师",
        code: "JOB-103",
        department: "Product / 产品",
        owner: "Alex Lin",
        headcount: 1,
        status: "paused",
        due: "2026-11-15",
        notes:
          "Hiring held pending headcount review; do not contact applicants until approved. / 招聘暂停，等待编制复核；获批准前不得联系候选人。",
      },
    },
    {
      key: "positions-4",
      fields: {
        name: "Operations Coordinator / 运营协调专员",
        code: "JOB-104",
        department: "Operations / 运营",
        owner: "Alex Lin",
        headcount: 1,
        status: "closed",
        due: "2026-09-20",
        notes:
          "Approved position filled after accepted offer and hiring review. / 在录用通知已被接受且录用复核完成后，已批准职位完成招聘。",
      },
    },
  ],
  applicants: [
    {
      key: "applicants-1",
      fields: {
        name: "Jamie Park",
        code: "CAN-101",
        position: "JOB-101",
        owner: "Taylor Wu",
        status: "interview",
        due: "2026-09-28",
        next: "Collect second interview feedback / 收集第二轮面试反馈",
        notes:
          "Work sample completed; panel feedback is missing. Do not advance stage without evidence. / 工作样本已完成，但缺少面试组反馈；没有证据不得推进阶段。",
      },
    },
    {
      key: "applicants-2",
      fields: {
        name: "Robin Zhao",
        code: "CAN-102",
        position: "JOB-102",
        owner: "Taylor Wu",
        status: "offer_review",
        due: "2026-10-01",
        next: "Review compensation proposal / 复核薪酬草案",
        notes:
          "Two structured interviews complete. Compensation awaiting budget owner review. / 两轮结构化面试已完成；薪酬等待预算负责人复核。",
      },
    },
    {
      key: "applicants-3",
      fields: {
        name: "Casey Sun",
        code: "CAN-103",
        position: "JOB-101",
        owner: "Taylor Wu",
        status: "screening",
        due: "2026-10-02",
        next: "Schedule introductory interview / 安排初次面试",
        notes:
          "Application received through the role intake. Keep contact details private. / 已通过职位申请入口收到申请；联系信息须保密。",
      },
    },
    {
      key: "applicants-4",
      fields: {
        name: "Sam Li",
        code: "CAN-104",
        position: "JOB-103",
        owner: "Taylor Wu",
        status: "on_hold",
        due: "2026-10-06",
        next: "Check whether headcount hold is lifted / 核查编制暂停是否解除",
        notes:
          "Position paused; candidate informed. No outreach without approval. / 职位已暂停，候选人已被告知；未经批准不得主动联系。",
      },
    },
    {
      key: "applicants-5",
      fields: {
        name: "Avery Tan",
        code: "CAN-105",
        position: "JOB-104",
        owner: "Taylor Wu",
        status: "hired",
        due: "2026-09-20",
        next: "Handoff approved onboarding record / 移交已批准的入职记录",
        notes:
          "Acceptance evidence and hiring approval recorded. Keep hiring and payroll data separate. / 已记录接受凭证及录用批准；招聘与薪酬数据分开管理。",
      },
    },
  ],
  interviews: [
    {
      key: "interviews-1",
      fields: {
        name: "Jamie · Customer scenario panel / 客户情景面试",
        code: "INT-101",
        candidate: "CAN-101",
        owner: "Riley Chen",
        status: "feedback_missing",
        due: "2026-09-27",
        notes:
          "Rubric: problem framing, escalation judgment, written follow-up. Feedback must cite observed evidence. / 评分维度：问题界定、升级判断、书面跟进；反馈必须引用观察证据。",
      },
    },
    {
      key: "interviews-2",
      fields: {
        name: "Robin · Reconciliation exercise / 对账练习",
        code: "INT-102",
        candidate: "CAN-102",
        owner: "Morgan Yu",
        status: "completed",
        due: "2026-09-26",
        notes:
          "Reconciliation exercise passed; differences were identified and source evidence linked. / 对账练习通过；已识别差异并关联来源证据。",
      },
    },
    {
      key: "interviews-3",
      fields: {
        name: "Casey · Introductory interview / 初次面试",
        code: "INT-103",
        candidate: "CAN-103",
        owner: "Riley Chen",
        status: "scheduled",
        due: "2026-10-02",
        notes:
          "Availability confirmed; calendar invitation is a separate human action. / 已确认可用时间；发送日历邀请属于单独的人工行动。",
      },
    },
  ],
  offers: [
    {
      key: "offers-1",
      fields: {
        name: "Robin · Finance Analyst offer / 财务分析师录用草案",
        code: "OFF-101",
        candidate: "CAN-102",
        owner: "Morgan Yu",
        amount: 18000,
        currency: "CNY",
        status: "needs_review",
        due: "2026-10-01",
        notes:
          "Draft only. Budget approval and candidate acceptance are not yet recorded. / 仅为草案，尚未记录预算批准及候选人接受凭证。",
      },
    },
    {
      key: "offers-2",
      fields: {
        name: "Jamie · Potential offer / 拟议录用草案",
        code: "OFF-102",
        candidate: "CAN-101",
        owner: "Riley Chen",
        amount: 14500,
        currency: "CNY",
        status: "blocked",
        due: "2026-10-03",
        notes:
          "Blocked until panel feedback and approved headcount evidence are complete. / 面试组反馈及已批准编制证据齐全之前不得推进。",
      },
    },
    {
      key: "offers-3",
      fields: {
        name: "Avery · Accepted prior offer / 已接受的历史录用通知",
        code: "OFF-103",
        candidate: "CAN-105",
        owner: "Alex Lin",
        amount: 3600,
        currency: "USD",
        status: "accepted",
        due: "2026-09-20",
        notes:
          "Acceptance evidence received. Onboarding is handled by the HR workspace; retain minimal hiring record. / 已收到接受凭证；人事工作区负责入职，仅保留最少必要的招聘记录。",
      },
    },
  ],
};
