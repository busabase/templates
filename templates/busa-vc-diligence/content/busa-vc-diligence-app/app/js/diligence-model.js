// The cockpit's read model: pure functions from provider records to the
// overview, the target list, the findings wall and one target's detail.
// No I/O, no environment branching — app.js feeds it records and a clock,
// and renders what comes back.
//
// Every field slug and enum id below mirrors `content/<base>/base.json`,
// the package's single field declaration. The package's consistency script
// (scripts/check-diligence-consistency.mjs) fails if a slug or enum id used
// here is not declared there. English labels are exactly the choice names
// declared in base.json — installed names are plain English.

export const LABELS = {
  en: {
    stage: {
      sourced: "Sourced",
      screening: "Screening",
      diligence: "Diligence",
      ic: "IC",
      "term-sheet": "Term Sheet",
      closed: "Closed",
      passed: "Passed",
    },
    workstream: {
      "corporate-cap-table": "Corporate & Cap Table",
      team: "Team",
      market: "Market",
      "product-tech": "Product & Tech",
      "business-traction": "Business & Traction",
      financials: "Financials",
      legal: "Legal",
      terms: "Terms",
    },
    criticality: { critical: "Critical", standard: "Standard" },
    requestStatus: {
      requested: "Requested",
      received: "Received",
      reviewed: "Reviewed",
      blocked: "Blocked",
      waived: "Waived",
    },
    evidenceType: {
      filing: "Regulatory filing",
      "financial-statement": "Financial statement",
      report: "Press / research report",
      "company-statement": "Company statement",
      "company-document": "Company document",
      "interview-note": "Interview note",
      dataset: "Third-party dataset",
      other: "Other",
    },
    verification: { unverified: "Unverified", verified: "Verified", contradicted: "Contradicted" },
    severity: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
    findingStatus: {
      open: "Open",
      mitigated: "Mitigated",
      accepted: "Accepted",
      "deal-breaker": "Deal-breaker",
    },
    interviewType: {
      management: "Management / founder",
      customer: "Customer reference",
      expert: "Industry expert",
      "former-employee": "Former employee",
      coinvestor: "Co-investor / syndicate",
      other: "Other",
    },
    consistency: {
      consistent: "Consistent with evidence",
      partly: "Partly consistent",
      contradicts: "Contradicts evidence",
      untested: "Not yet tested",
    },
    credibility: { high: "High", medium: "Medium", low: "Low" },
  },
};

export const labelsFor = (locale) => LABELS[locale] ?? LABELS.en;

export const WORKSTREAM_ORDER = [
  "corporate-cap-table",
  "team",
  "market",
  "product-tech",
  "business-traction",
  "financials",
  "legal",
  "terms",
];

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const ACTIVE_STAGES = new Set(["screening", "diligence", "ic"]);
const ANSWERED = new Set(["received", "reviewed", "waived"]);
const OUTSTANDING = new Set(["requested", "blocked"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export const asId = (value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first == null) return null;
  return typeof first === "object" ? (first.id ?? null) : first;
};

const parseTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const startOfLocalDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function buildDiligenceView(records, now = new Date()) {
  const byBase = (key) => records.filter((r) => r.baseKey === key);
  const targets = byBase("targets");
  const requests = byBase("diligence-requests");
  const evidence = byBase("evidence");
  const findings = byBase("findings");
  const interviews = byBase("interviews");

  const targetById = new Map(targets.map((r) => [r.id, r]));
  const evidenceById = new Map(evidence.map((r) => [r.id, r]));
  const forTarget = (rows, record) => rows.filter((r) => asId(r.fields?.target) === record.id);
  const todayStart = startOfLocalDay(now);

  const isOverdue = (r) => {
    const due = parseTime(r.fields?.["due-date"]);
    return OUTSTANDING.has(r.fields?.status) && due != null && due < todayStart;
  };

  // Per-target rollup: workstream progress, findings, claims, next actions.
  const targetViews = targets.map((target) => {
    const tRequests = forTarget(requests, target);
    const tEvidence = forTarget(evidence, target);
    const tFindings = forTarget(findings, target);
    const tInterviews = forTarget(interviews, target);

    const byWorkstream = WORKSTREAM_ORDER.map((ws) => {
      const rows = tRequests.filter((r) => r.fields?.workstream === ws);
      const answered = rows.filter((r) => ANSWERED.has(r.fields?.status)).length;
      const reviewed = rows.filter((r) => r.fields?.status === "reviewed").length;
      return {
        id: ws,
        total: rows.length,
        answered,
        reviewed,
        blocked: rows.filter((r) => r.fields?.status === "blocked").length,
        pct: rows.length ? Math.round((answered / rows.length) * 100) : null,
      };
    }).filter((w) => w.total > 0);

    const openFindings = tFindings
      .filter((f) => f.fields?.status === "open")
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.fields?.severity] ?? 4) - (SEVERITY_RANK[b.fields?.severity] ?? 4) ||
          (parseTime(a.fields?.["resolve-by"]) ?? Infinity) - (parseTime(b.fields?.["resolve-by"]) ?? Infinity),
      );
    const severityCounts = {};
    for (const f of openFindings) {
      const sev = f.fields?.severity ?? "low";
      severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
    }

    const nextActions = [
      ...tRequests
        .filter((r) => r.fields?.status === "blocked" || isOverdue(r))
        .map((r) => ({
          kind: r.fields?.status === "blocked" ? "blocked" : "overdue",
          title: r.fields?.title ?? "",
          meta: r.fields?.workstream ?? "",
          due: r.fields?.["due-date"] ?? null,
        })),
      ...openFindings
        .filter((f) => (SEVERITY_RANK[f.fields?.severity] ?? 4) <= 1)
        .map((f) => ({
          kind: "finding",
          title: f.fields?.title ?? "",
          meta: f.fields?.severity ?? "",
          due: f.fields?.["resolve-by"] ?? null,
        })),
    ];

    const totalRequests = tRequests.length;
    const answeredRequests = tRequests.filter((r) => ANSWERED.has(r.fields?.status)).length;
    return {
      target,
      id: target.id,
      name: target.fields?.name ?? "",
      stage: target.fields?.stage ?? "sourced",
      round: target.fields?.round ?? "",
      sector: target.fields?.sector ?? "",
      thesis: target.fields?.thesis ?? "",
      requests: tRequests,
      byWorkstream,
      progressPct: totalRequests ? Math.round((answeredRequests / totalRequests) * 100) : null,
      openFindings,
      severityCounts,
      evidence: tEvidence,
      interviews: tInterviews,
      nextActions,
      unverifiedCount: tEvidence.filter((e) => e.fields?.verification !== "verified").length,
    };
  });

  // Findings wall: every open finding, worst first, across the desk.
  const findingsWall = findings
    .filter((f) => f.fields?.status === "open")
    .map((f) => ({
      finding: f,
      title: f.fields?.title ?? "",
      severity: f.fields?.severity ?? "low",
      targetName: targetById.get(asId(f.fields?.target))?.fields?.name ?? "",
      evidenceTitle: evidenceById.get(asId(f.fields?.evidence))?.fields?.title ?? null,
      resolveBy: f.fields?.["resolve-by"] ?? null,
    }))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) ||
        (parseTime(a.resolveBy) ?? Infinity) - (parseTime(b.resolveBy) ?? Infinity),
    );

  const overdueRequests = requests
    .filter(isOverdue)
    .map((r) => ({
      request: r,
      title: r.fields?.title ?? "",
      targetName: targetById.get(asId(r.fields?.target))?.fields?.name ?? "",
      workstream: r.fields?.workstream ?? "",
      status: r.fields?.status ?? "",
      due: r.fields?.["due-date"] ?? null,
      overdueDays: Math.floor((todayStart - parseTime(r.fields?.["due-date"])) / DAY_MS),
    }))
    .sort((a, b) => parseTime(a.due) - parseTime(b.due));

  const blockedRequests = requests
    .filter((r) => r.fields?.status === "blocked")
    .map((r) => ({
      request: r,
      title: r.fields?.title ?? "",
      targetName: targetById.get(asId(r.fields?.target))?.fields?.name ?? "",
      workstream: r.fields?.workstream ?? "",
    }));

  return {
    metrics: {
      inDiligence: targets.filter((t) => ACTIVE_STAGES.has(t.fields?.stage)).length,
      openCritical: findings.filter(
        (f) => f.fields?.status === "open" && f.fields?.severity === "critical",
      ).length,
      openHigh: findings.filter(
        (f) => f.fields?.status === "open" && f.fields?.severity === "high",
      ).length,
      overdue: overdueRequests.length,
      blocked: blockedRequests.length,
    },
    targets: targetViews,
    findingsWall,
    overdueRequests,
    blockedRequests,
  };
}

// The copyable desk summary, in the shape the desk's own brief prompt uses:
// where the pipeline stands, what is flagged, what is stuck, what is still
// unverified. Plain text, one fact per line — every word comes from
// `t` (messages.js) and `labels`.
export function buildReportText(view, now, t, labels) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const lines = [
    `Busa VC Diligence — ${t.reportHeading} ${date}`,
    t.reportPipeline(view.metrics.inDiligence, view.metrics.openCritical, view.metrics.openHigh),
    t.reportStuck(view.metrics.overdue, view.metrics.blocked),
    ...view.targets
      .filter((tv) => ACTIVE_STAGES.has(tv.stage))
      .map(
        (tv) =>
          `  - ${tv.name} (${labels.stage[tv.stage] ?? tv.stage}) — ${t.reportProgress(tv.progressPct, tv.openFindings.length, tv.unverifiedCount)}`,
      ),
    t.reportWall(view.findingsWall.length),
    ...view.findingsWall
      .slice(0, 5)
      .map((f) => `  - [${labels.severity[f.severity] ?? f.severity}] ${f.title}${f.targetName ? ` (${f.targetName})` : ""}`),
  ];
  return lines.join("\n");
}
