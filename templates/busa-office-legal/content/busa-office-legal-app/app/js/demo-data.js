export const seedRecords = {
  cases: [
    {
      key: "cases-1",
      fields: {
        name: "Northstar equipment delivery dispute",
        code: "CASE-101",
        counterparty: "Northstar Equipment Ltd.",
        owner: "Jordan Mei",
        status: "litigation",
        due: "2026-10-08",
        next: "Confirm evidence filing receipt",
        notes:
          "Fictional delivery dispute. Signed delivery record is pending verification; no prediction of legal outcome.",
      },
    },
    {
      key: "cases-2",
      fields: {
        name: "Seabrook receivables recovery",
        code: "CASE-102",
        counterparty: "Seabrook Studio Ltd.",
        owner: "Jordan Mei",
        status: "settlement",
        due: "2026-10-05",
        next: "Review installment settlement draft",
        notes:
          "Settlement draft contains three installments. Counsel and business owner approval required.",
      },
    },
    {
      key: "cases-3",
      fields: {
        name: "Pinegate service scope dispute",
        code: "CASE-103",
        counterparty: "Pinegate Services Ltd.",
        owner: "Cameron Han",
        status: "investigation",
        due: "2026-10-12",
        next: "Compile statement of work evidence",
        notes:
          "Contract performance evidence is incomplete. Record facts separately from counsel opinions.",
      },
    },
    {
      key: "cases-4",
      fields: {
        name: "Lakewell resolved dispute",
        code: "CASE-104",
        counterparty: "Lakewell Supply Ltd.",
        owner: "Cameron Han",
        status: "closed",
        due: "2026-09-15",
        next: "Archive approved closure evidence",
        notes:
          "Closure approved after recovered funds and court documents were reconciled.",
      },
    },
  ],
  deadlines: [
    {
      key: "deadlines-1",
      fields: {
        name: "Northstar preservation renewal",
        code: "DDL-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-10-02",
        source: "Fictional preservation order PO-101",
        notes:
          "Counsel must confirm order date, service evidence, timezone and renewal filing requirements.",
      },
    },
    {
      key: "deadlines-2",
      fields: {
        name: "Seabrook installment evidence",
        code: "DDL-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "overdue",
        due: "2026-09-28",
        source: "Fictional signed settlement draft v2",
        notes:
          "Bank receipt not reconciled. Never mark deadline complete from a planned transfer.",
      },
    },
    {
      key: "deadlines-3",
      fields: {
        name: "Pinegate evidence filing",
        code: "DDL-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "unverified",
        due: null,
        source: "Source notice not yet received",
        notes:
          "No date is inferred. Request the notice and counsel verification before setting a deadline.",
      },
    },
  ],
  settlements: [
    {
      key: "settlements-1",
      fields: {
        name: "Seabrook first installment",
        code: "PAY-101",
        case: "CASE-102",
        owner: "Morgan Yu",
        kind: "recovery",
        amount: 58000,
        currency: "CNY",
        status: "verified",
        due: "2026-09-25",
        source: "Fictional bank receipt RC-101",
        notes:
          "Received and reconciled against the approved settlement schedule.",
      },
    },
    {
      key: "settlements-2",
      fields: {
        name: "Northstar counsel retainer",
        code: "PAY-102",
        case: "CASE-101",
        owner: "Morgan Yu",
        kind: "cost",
        amount: 12000,
        currency: "CNY",
        status: "verified",
        due: "2026-09-24",
        source: "Fictional invoice INV-101",
        notes:
          "Invoice and payment evidence reviewed. Retainer is a cost, not a recovery.",
      },
    },
    {
      key: "settlements-3",
      fields: {
        name: "Pinegate document translation",
        code: "PAY-103",
        case: "CASE-103",
        owner: "Morgan Yu",
        kind: "cost",
        amount: 850,
        currency: "USD",
        status: "needs_review",
        due: "2026-09-29",
        source: "Fictional quote QT-101",
        notes: "Quote only; not paid, exclude from realized totals.",
      },
    },
  ],
  updates: [
    {
      key: "updates-1",
      fields: {
        name: "Northstar evidence package received",
        code: "UPD-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "verified",
        due: "2026-09-26",
        source: "Fictional evidence pack EP-101",
        notes:
          "12 delivery exhibits received; one signature requires verification.",
      },
    },
    {
      key: "updates-2",
      fields: {
        name: "Seabrook settlement draft revised",
        code: "UPD-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-09-28",
        source: "Fictional settlement v2",
        notes:
          "Draft changed installment timing. Approval is not inferred from negotiation.",
      },
    },
    {
      key: "updates-3",
      fields: {
        name: "Pinegate service records requested",
        code: "UPD-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "recorded",
        due: "2026-09-29",
        source: "Fictional request NOTE-103",
        notes:
          "Business owner asked to supply delivery logs and statement of work.",
      },
    },
  ],
  tasks: [
    {
      key: "tasks-1",
      fields: {
        name: "Confirm preservation renewal filing",
        code: "TASK-101",
        case: "CASE-101",
        owner: "Jordan Mei",
        status: "needs_review",
        due: "2026-10-01",
        next: "Counsel checks source order and filing receipt",
        notes:
          "External filing must be authorized and performed by qualified counsel.",
      },
    },
    {
      key: "tasks-2",
      fields: {
        name: "Verify settlement authority",
        code: "TASK-102",
        case: "CASE-102",
        owner: "Jordan Mei",
        status: "blocked",
        due: "2026-09-30",
        next: "Obtain business owner signature authority",
        notes:
          "No signature, payment, concession, or acceptance until authority is confirmed.",
      },
    },
    {
      key: "tasks-3",
      fields: {
        name: "Collect scope evidence",
        code: "TASK-103",
        case: "CASE-103",
        owner: "Cameron Han",
        status: "open",
        due: "2026-10-04",
        next: "Request signed scope and delivery records",
        notes:
          "Use minimal access. Do not expose privileged material to unapproved readers.",
      },
    },
  ],
};
