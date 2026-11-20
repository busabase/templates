// Pure domain logic for busa-client-reporting.
//
// Two rules live here and nowhere else:
//  1. KPI change is COMPUTED, never stored. `metricChange()` derives the
//     change versus the previous value and versus the target from the raw
//     numbers on the metrics row; no Base field holds a percentage.
//  2. The client report page is built by `buildClientReport()`, which copies
//     ONLY client-visible fields. Internal fields — clients.notes,
//     projects.owner, deliverables.notes, metrics.notes and
//     reports.risks_blockers — are stripped by construction: the builder
//     never reads them, so they cannot leak onto the client-facing surface
//     by accident. The model test asserts this exclusion.

// ── Internal fields: the boundary, named once ─────────────────────────────
// Keys are the app-side (snake_case) field names, per Base key.
export const INTERNAL_FIELDS = {
  clients: ["notes"],
  projects: ["owner"],
  deliverables: ["notes"],
  metrics: ["notes"],
  milestones: [],
  reports: ["risks_blockers"],
};

const refOf = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.length ? refOf(value[0]) : "";
  if (typeof value === "object") return String(value.id || value.recordId || value.record_id || "");
  return String(value);
};

const numOrNull = (value) => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function normalizeClientRow(row) {
  return {
    __recordId: row.__recordId || "",
    client_name: row.client_name || "",
    primary_contact: row.primary_contact || "",
    contact_email: row.contact_email || "",
    industry: row.industry || "",
    status: row.status || "",
    reporting_cadence: row.reporting_cadence || "",
    // Internal: kept on the operator-side row, stripped for the client page.
    notes: row.notes || "",
  };
}

export function normalizeProjectRow(row) {
  return {
    __recordId: row.__recordId || "",
    project_name: row.project_name || "",
    client: refOf(row.client),
    service_type: row.service_type || "",
    status: row.status || "",
    // Internal.
    owner: row.owner || "",
    start_date: row.start_date || "",
    due_date: row.due_date || "",
    summary: row.summary || "",
  };
}

export function normalizeDeliverableRow(row) {
  return {
    __recordId: row.__recordId || "",
    deliverable: row.deliverable || "",
    project: refOf(row.project),
    client: refOf(row.client),
    status: row.status || "",
    due_date: row.due_date || "",
    delivered_date: row.delivered_date || "",
    link: row.link || "",
    // Internal.
    notes: row.notes || "",
  };
}

export function normalizeMetricRow(row) {
  return {
    __recordId: row.__recordId || "",
    metric_label: row.metric_label || "",
    client: refOf(row.client),
    project: refOf(row.project),
    metric: row.metric || "",
    period: row.period || "",
    value: numOrNull(row.value),
    previous_value: numOrNull(row.previous_value),
    target: numOrNull(row.target),
    unit: row.unit || "",
    source: row.source || "",
    // Internal.
    notes: row.notes || "",
  };
}

export function normalizeMilestoneRow(row) {
  return {
    __recordId: row.__recordId || "",
    milestone: row.milestone || "",
    project: refOf(row.project),
    client: refOf(row.client),
    due_date: row.due_date || "",
    completed_date: row.completed_date || "",
    status: row.status || "",
    notes: row.notes || "",
  };
}

export function normalizeReportRow(row) {
  return {
    __recordId: row.__recordId || "",
    report_title: row.report_title || "",
    client: refOf(row.client),
    project: refOf(row.project),
    period: row.period || "",
    status: row.status || "",
    executive_summary: row.executive_summary || "",
    highlights: row.highlights || "",
    // Internal: never rendered on the client report page.
    risks_blockers: row.risks_blockers || "",
    next_steps: row.next_steps || "",
    shared_link_note: row.shared_link_note || "",
  };
}

export const NORMALIZE_ROW_BY_KEY = {
  clients: normalizeClientRow,
  projects: normalizeProjectRow,
  deliverables: normalizeDeliverableRow,
  metrics: normalizeMetricRow,
  milestones: normalizeMilestoneRow,
  reports: normalizeReportRow,
};

// ── KPI change: computed, never stored ────────────────────────────────────
// Returns fractions (0.12 means +12%); null when the comparison is undefined
// (no previous/target, or a zero previous value, where a % would mislead).
export function metricChange(metric) {
  const value = numOrNull(metric?.value);
  const previous = numOrNull(metric?.previous_value);
  const target = numOrNull(metric?.target);
  return {
    vs_previous: value != null && previous != null && previous !== 0 ? (value - previous) / Math.abs(previous) : null,
    vs_target: value != null && target != null && target !== 0 ? (value - target) / Math.abs(target) : null,
    target_progress: value != null && target != null && target !== 0 ? value / target : null,
  };
}

export function withChange(metric) {
  return { ...metric, change: metricChange(metric) };
}

// ── Snapshot: normalized rows + per-client rollups for the Overview ──────
export function buildSnapshot({ clients = [], projects = [], deliverables = [], metrics = [], milestones = [], reports = [] } = {}) {
  const clientRows = (Array.isArray(clients) ? clients : []).map(normalizeClientRow);
  const projectRows = (Array.isArray(projects) ? projects : []).map(normalizeProjectRow);
  const deliverableRows = (Array.isArray(deliverables) ? deliverables : []).map(normalizeDeliverableRow);
  const metricRows = (Array.isArray(metrics) ? metrics : []).map(normalizeMetricRow).map(withChange);
  const milestoneRows = (Array.isArray(milestones) ? milestones : [])
    .map(normalizeMilestoneRow)
    .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  const reportRows = (Array.isArray(reports) ? reports : [])
    .map(normalizeReportRow)
    .sort((a, b) => String(b.period).localeCompare(String(a.period)));

  const clientById = new Map(clientRows.map((row) => [row.__recordId, row]));
  const projectById = new Map(projectRows.map((row) => [row.__recordId, row]));

  // A child row's client: its own client relation when set, else its
  // project's client (deliverables/milestones may carry only the project).
  const clientRefOf = (row) => row.client || projectById.get(row.project)?.client || "";

  const rollups = clientRows.map((client) => {
    const id = client.__recordId;
    const clientProjects = projectRows.filter((row) => row.client === id);
    const clientDeliverables = deliverableRows.filter((row) => clientRefOf(row) === id);
    const clientReports = reportRows.filter((row) => row.client === id);
    return {
      client,
      active_projects: clientProjects.filter((row) => row.status === "in-progress" || row.status === "at-risk").length,
      projects_at_risk: clientProjects.filter((row) => row.status === "at-risk").length,
      deliverables_awaiting_client: clientDeliverables.filter(
        (row) => row.status === "sent-to-client" || row.status === "revision-requested",
      ).length,
      deliverables_open: clientDeliverables.filter(
        (row) => row.status === "planned" || row.status === "in-progress" || row.status === "in-review",
      ).length,
      latest_report: clientReports[0] || null,
      latest_report_status: clientReports[0]?.status || "",
    };
  });

  return {
    clients: clientRows,
    projects: projectRows,
    deliverables: deliverableRows,
    metrics: metricRows,
    milestones: milestoneRows,
    reports: reportRows,
    clientById,
    projectById,
    clientRefOf,
    rollups,
    counts: {
      clients: clientRows.length,
      active_clients: clientRows.filter((row) => row.status === "active").length,
      projects: projectRows.length,
      projects_at_risk: projectRows.filter((row) => row.status === "at-risk").length,
      deliverables_awaiting_client: deliverableRows.filter(
        (row) => row.status === "sent-to-client" || row.status === "revision-requested",
      ).length,
      reports_ready: reportRows.filter((row) => row.status === "ready-to-share").length,
      reports_shared: reportRows.filter((row) => row.status === "shared").length,
    },
  };
}

// ── The client report page ────────────────────────────────────────────────
// Builds the client-facing surface for one client (and one period, when
// given) from a snapshot. ONLY client-visible fields are copied — see the
// header. Draft and In Review reports are not client surfaces: the page uses
// the latest Ready to Share or Shared report for the period.
export function buildClientReport(snapshot, clientId, period = "") {
  const client = (snapshot?.clients || []).find((row) => row.__recordId === clientId);
  if (!client) return null;
  const id = client.__recordId;
  const clientRefOf = snapshot.clientRefOf || ((row) => row.client || "");

  const reports = (snapshot.reports || []).filter(
    (row) => row.client === id && (row.status === "ready-to-share" || row.status === "shared") && (!period || row.period === period),
  );
  const report = reports[0] || null;
  const effectivePeriod = period || report?.period || "";

  const kpis = (snapshot.metrics || [])
    .filter((row) => row.client === id && (!effectivePeriod || row.period === effectivePeriod))
    .map((row) => ({
      metric_label: row.metric_label,
      metric: row.metric,
      period: row.period,
      value: row.value,
      previous_value: row.previous_value,
      target: row.target,
      unit: row.unit,
      source: row.source,
      change: row.change || metricChange(row),
    }));

  const deliverables = (snapshot.deliverables || [])
    .filter((row) => clientRefOf(row) === id)
    .map((row) => ({
      deliverable: row.deliverable,
      project_name: snapshot.projectById?.get(row.project)?.project_name || "",
      status: row.status,
      due_date: row.due_date,
      delivered_date: row.delivered_date,
      link: row.link,
    }));

  const byStatus = {};
  for (const row of deliverables) byStatus[row.status] = [...(byStatus[row.status] || []), row];

  const milestones = (snapshot.milestones || [])
    .filter((row) => clientRefOf(row) === id)
    .map((row) => ({
      milestone: row.milestone,
      project_name: snapshot.projectById?.get(row.project)?.project_name || "",
      status: row.status,
      due_date: row.due_date,
      completed_date: row.completed_date,
      notes: row.notes,
    }));

  const projects = (snapshot.projects || [])
    .filter((row) => row.client === id)
    .map((row) => ({
      project_name: row.project_name,
      service_type: row.service_type,
      status: row.status,
      start_date: row.start_date,
      due_date: row.due_date,
      summary: row.summary,
    }));

  return {
    // Client-visible identity only: no notes, no internal contact bookkeeping
    // beyond the name the client knows itself by.
    client: { client_name: client.client_name, industry: client.industry, reporting_cadence: client.reporting_cadence },
    period: effectivePeriod,
    report: report
      ? {
          report_title: report.report_title,
          period: report.period,
          status: report.status,
          executive_summary: report.executive_summary,
          highlights: report.highlights,
          next_steps: report.next_steps,
        }
      : null,
    projects,
    kpis,
    deliverables,
    deliverables_by_status: byStatus,
    milestones,
    next_steps: report?.next_steps || "",
  };
}
