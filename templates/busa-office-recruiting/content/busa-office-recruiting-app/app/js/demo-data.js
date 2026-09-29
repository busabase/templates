export const seedRecords = {
  positions: [
    {
      key: "positions-1",
      fields: {
        name: "Customer Success Specialist",
        code: "JOB-101",
        department: "Customer operations",
        owner: "Riley Chen",
        headcount: 2,
        status: "open",
        due: "2026-10-15",
        notes:
          "Own onboarding reviews and customer support; interview against a documented role rubric.",
      },
    },
    {
      key: "positions-2",
      fields: {
        name: "Finance Analyst",
        code: "JOB-102",
        department: "Finance",
        owner: "Morgan Yu",
        headcount: 1,
        status: "open",
        due: "2026-10-30",
        notes:
          "Monthly close, reconciliation, and evidence-led variance analysis.",
      },
    },
    {
      key: "positions-3",
      fields: {
        name: "Product Designer",
        code: "JOB-103",
        department: "Product",
        owner: "Alex Lin",
        headcount: 1,
        status: "paused",
        due: "2026-11-15",
        notes:
          "Hiring held pending headcount review; do not contact applicants until approved.",
      },
    },
    {
      key: "positions-4",
      fields: {
        name: "Operations Coordinator",
        code: "JOB-104",
        department: "Operations",
        owner: "Alex Lin",
        headcount: 1,
        status: "closed",
        due: "2026-09-20",
        notes:
          "Approved position filled after accepted offer and hiring review.",
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
        next: "Collect second interview feedback",
        notes:
          "Work sample completed; panel feedback is missing. Do not advance stage without evidence.",
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
        next: "Review compensation proposal",
        notes:
          "Two structured interviews complete. Compensation awaiting budget owner review.",
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
        next: "Schedule introductory interview",
        notes:
          "Application received through the role intake. Keep contact details private.",
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
        next: "Check whether headcount hold is lifted",
        notes:
          "Position paused; candidate informed. No outreach without approval.",
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
        next: "Handoff approved onboarding record",
        notes:
          "Acceptance evidence and hiring approval recorded. Keep hiring and payroll data separate.",
      },
    },
  ],
  interviews: [
    {
      key: "interviews-1",
      fields: {
        name: "Jamie · Customer scenario panel",
        code: "INT-101",
        candidate: "CAN-101",
        owner: "Riley Chen",
        status: "feedback_missing",
        due: "2026-09-27",
        notes:
          "Rubric: problem framing, escalation judgment, written follow-up. Feedback must cite observed evidence.",
      },
    },
    {
      key: "interviews-2",
      fields: {
        name: "Robin · Reconciliation exercise",
        code: "INT-102",
        candidate: "CAN-102",
        owner: "Morgan Yu",
        status: "completed",
        due: "2026-09-26",
        notes:
          "Reconciliation exercise passed; differences were identified and source evidence linked.",
      },
    },
    {
      key: "interviews-3",
      fields: {
        name: "Casey · Introductory interview",
        code: "INT-103",
        candidate: "CAN-103",
        owner: "Riley Chen",
        status: "scheduled",
        due: "2026-10-02",
        notes:
          "Availability confirmed; calendar invitation is a separate human action.",
      },
    },
  ],
  offers: [
    {
      key: "offers-1",
      fields: {
        name: "Robin · Finance Analyst offer",
        code: "OFF-101",
        candidate: "CAN-102",
        owner: "Morgan Yu",
        amount: 18000,
        currency: "CNY",
        status: "needs_review",
        due: "2026-10-01",
        notes:
          "Draft only. Budget approval and candidate acceptance are not yet recorded.",
      },
    },
    {
      key: "offers-2",
      fields: {
        name: "Jamie · Potential offer",
        code: "OFF-102",
        candidate: "CAN-101",
        owner: "Riley Chen",
        amount: 14500,
        currency: "CNY",
        status: "blocked",
        due: "2026-10-03",
        notes:
          "Blocked until panel feedback and approved headcount evidence are complete.",
      },
    },
    {
      key: "offers-3",
      fields: {
        name: "Avery · Accepted prior offer",
        code: "OFF-103",
        candidate: "CAN-105",
        owner: "Alex Lin",
        amount: 3600,
        currency: "USD",
        status: "accepted",
        due: "2026-09-20",
        notes:
          "Acceptance evidence received. Onboarding is handled by the HR workspace; retain minimal hiring record.",
      },
    },
  ],
};
