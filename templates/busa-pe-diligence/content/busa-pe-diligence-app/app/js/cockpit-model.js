// The cockpit's read model: turns flat record lists (from either provider)
// into the shapes the four screens render. Pure functions of (records, now)
// so the demo provider and the Busabase provider produce identical views.

export const LABELS = {
  stage: {
    sourced: "Sourced", screening: "Screening", diligence: "Diligence", ic: "IC",
    signing: "Signing", closed: "Closed", passed: "Passed",
  },
  dealType: {
    "majority-buyout": "Majority buyout", "minority-growth": "Minority growth",
    "take-private": "Take-private", "carve-out": "Carve-out", other: "Other",
  },
  workstream: {
    corporate: "Corporate", "financial-qoe": "Financial / QoE", tax: "Tax",
    "legal-compliance": "Legal & Compliance", commercial: "Commercial",
    operations: "Operations", "hr-org": "HR & Org", "tech-it": "Tech & IT", esg: "ESG",
  },
  requestStatus: {
    requested: "Requested", received: "Received", reviewed: "Reviewed",
    blocked: "Blocked", waived: "Waived",
  },
  severity: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
  findingStatus: {
    open: "Open", mitigated: "Mitigated", accepted: "Accepted", "deal-breaker": "Deal-breaker",
  },
  verification: { unverified: "Unverified", verified: "Verified", contradicted: "Contradicted" },
  consistency: {
    consistent: "Consistent with evidence", partly: "Partly consistent",
    contradicted: "Contradicted by evidence", untested: "Not yet tested",
  },
};

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

// Field values arrive as primitives from the demo provider and as raw record
// fields from the SDK; unwrap a { value } envelope if one is present.
const field = (record, slug) => {
  const value = record?.fields?.[slug];
  return value && typeof value === "object" && "value" in value ? value.value : value;
};

// Relation values may be a single id, an array of ids, or an array of
// objects carrying the id — normalise to an array of id strings.
const relIds = (record, slug) => {
  const value = field(record, slug);
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => (typeof item === "object" ? item.id ?? item.recordId ?? item.value : item))
    .filter((item) => typeof item === "string" && item.length > 0);
};

const byBase = (records, key) => records.filter((record) => record.baseKey === key);

const todayString = (now) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export function buildCockpit(records, now = new Date()) {
  const today = todayString(now);
  const targets = byBase(records, "targets").map((record) => ({
    id: record.id,
    name: field(record, "name") || "(unnamed target)",
    ticker: field(record, "ticker"),
    sector: field(record, "sector"),
    geography: field(record, "geography"),
    stage: field(record, "stage"),
    dealType: field(record, "deal-type"),
    stake: field(record, "ownership-stake-percent"),
    enterpriseValue: field(record, "enterprise-value-usd-m"),
    snapshot: field(record, "financial-snapshot"),
    dealSource: field(record, "deal-source"),
    dealLead: field(record, "deal-lead"),
    icDate: field(record, "target-ic-date"),
    nextAction: field(record, "next-action"),
    about: field(record, "about"),
  }));
  const targetName = new Map(targets.map((target) => [target.id, target.name]));

  const requests = byBase(records, "diligence-requests").map((record) => ({
    id: record.id,
    title: field(record, "title") || "(untitled request)",
    targetId: relIds(record, "target")[0] ?? null,
    workstream: field(record, "workstream"),
    criticality: field(record, "criticality"),
    status: field(record, "status"),
    requestedFrom: field(record, "requested-from"),
    advisorOwner: field(record, "advisor-owner"),
    internalOwner: field(record, "internal-owner"),
    dueDate: field(record, "due-date"),
    receivedDate: field(record, "received-date"),
    notes: field(record, "notes"),
  }));

  const evidence = byBase(records, "evidence").map((record) => ({
    id: record.id,
    title: field(record, "title") || "(untitled evidence)",
    targetId: relIds(record, "target")[0] ?? null,
    type: field(record, "evidence-type"),
    source: field(record, "source"),
    verification: field(record, "verification"),
    summary: field(record, "summary"),
  }));
  const evidenceTitle = new Map(evidence.map((item) => [item.id, item.title]));

  const findings = byBase(records, "findings")
    .map((record) => ({
      id: record.id,
      title: field(record, "title") || "(untitled finding)",
      targetId: relIds(record, "target")[0] ?? null,
      targetName: targetName.get(relIds(record, "target")[0]) ?? "",
      evidenceTitles: relIds(record, "evidence").map((id) => evidenceTitle.get(id)).filter(Boolean),
      severity: field(record, "severity"),
      category: field(record, "category"),
      status: field(record, "status"),
      claim: field(record, "claim"),
      whatEvidenceShows: field(record, "what-evidence-shows"),
      impact: field(record, "impact"),
      owner: field(record, "owner"),
      resolveBy: field(record, "resolve-by"),
    }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));

  const interviews = byBase(records, "interviews").map((record) => ({
    id: record.id,
    title: field(record, "title") || "(untitled interview)",
    targetId: relIds(record, "target")[0] ?? null,
    type: field(record, "interview-type"),
    date: field(record, "date"),
    keyClaims: field(record, "key-claims"),
    consistency: field(record, "consistency"),
  }));

  const outstanding = requests.filter((r) => r.status === "requested" || r.status === "blocked");
  const overdue = outstanding
    .filter((r) => r.dueDate && r.dueDate < today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // Per-target, per-workstream progress: reviewed / total requests.
  const progressFor = (targetId) => {
    const mine = requests.filter((r) => r.targetId === targetId);
    const streams = [...new Set(mine.map((r) => r.workstream).filter(Boolean))].map((stream) => {
      const rows = mine.filter((r) => r.workstream === stream);
      const reviewed = rows.filter((r) => r.status === "reviewed").length;
      return {
        workstream: stream,
        label: LABELS.workstream[stream] ?? stream,
        total: rows.length,
        reviewed,
        pct: rows.length ? Math.round((reviewed / rows.length) * 100) : 0,
      };
    });
    return { streams, total: mine.length, reviewed: mine.filter((r) => r.status === "reviewed").length };
  };

  return {
    targets,
    requests,
    evidence,
    findings,
    interviews,
    overdue,
    openFindings: findings.filter((f) => f.status === "open"),
    inDiligence: targets
      .filter((target) => target.stage === "diligence")
      .map((target) => ({ target, progress: progressFor(target.id) })),
    progressFor,
    findingsFor: (targetId) => findings.filter((f) => f.targetId === targetId),
    evidenceFor: (targetId) => evidence.filter((e) => e.targetId === targetId),
    interviewsFor: (targetId) => interviews.filter((i) => i.targetId === targetId),
    outstandingFor: (targetId) => outstanding.filter((r) => r.targetId === targetId),
  };
}
