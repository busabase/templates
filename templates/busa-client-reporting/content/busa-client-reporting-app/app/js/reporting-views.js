import {
  DETAIL_MODES,
  detailUrl,
  els,
  escapeHtml,
  formatChange,
  formatDate,
  formatNumber,
  isPartial,
  lockBanner,
  recordById,
  reportUrl,
  reports,
  state,
  statusLabel,
  t,
  viewRows,
} from "../app.js";
import { buildClientReport } from "./reporting-model.js?v=0.1.0";

// Rendering rule for this whole file: the Overview and Reports pages are the
// agency's own desk; the Client Report page (renderReportPage) is the
// client-facing surface and is fed ONLY by buildClientReport(), which never
// copies internal fields (notes, owner, risks & blockers). Nothing in
// renderReportPage reads snapshot rows directly.

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const plus = () => (isPartial() ? "+" : "");
const badge = (value) => `<span class="badge">${escapeHtml(statusLabel(value))}</span>`;
const multiline = (text) =>
  String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

// ── Overview: client picker/list with per-client rollups ─────────────────
function metricsBand() {
  const counts = state.snapshot?.counts || {};
  return [
    [t("client"), `${counts.active_clients ?? 0}${plus()}`],
    [t("activeProjects"), `${(state.snapshot?.projects || []).filter((row) => row.status === "in-progress").length}${plus()}`],
    [t("atRisk"), `${counts.projects_at_risk ?? 0}${plus()}`],
    [t("awaitingClient"), `${counts.deliverables_awaiting_client ?? 0}${plus()}`],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const snapshot = state.snapshot;
  const totalClients = snapshot?.totals?.clients;
  document.getElementById("overviewSummary").textContent = t("overviewSummary")
    .replace("{clients}", totalClients ?? `${snapshot.clients.length}${plus()}`)
    .replace("{projects}", `${snapshot.projects.length}${plus()}`);
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const rollups = snapshot.rollups || [];
  const scope = isPartial() ? `<p class="muted">${t("loadedScope").replace("{n}", snapshot.clients.length)}</p>` : "";
  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}
    ${
      rollups.length
        ? `<section class="overview-grid">${rollups
            .map(
              ({ client, active_projects, projects_at_risk, deliverables_awaiting_client, latest_report_status }) => `
          <div class="card overview-panel client-card">
            <h2>${escapeHtml(client.client_name)}</h2>
            <p class="muted">${escapeHtml(statusLabel(client.industry))} · ${badge(client.status)} ${client.reporting_cadence ? `<span class="muted">${escapeHtml(statusLabel(client.reporting_cadence))}</span>` : ""}</p>
            <dl class="rollup-list">
              <div><dt>${t("activeProjects")}</dt><dd>${active_projects}${projects_at_risk ? ` <span class="badge danger">${projects_at_risk} ${escapeHtml(t("atRisk"))}</span>` : ""}</dd></div>
              <div><dt>${t("awaitingClient")}</dt><dd>${deliverables_awaiting_client}</dd></div>
              <div><dt>${t("latestReport")}</dt><dd>${latest_report_status ? badge(latest_report_status) : "—"}</dd></div>
            </dl>
            <a class="button" href="${reportUrl(client.__recordId)}">${t("openReportPage")}</a>
          </div>`,
            )
            .join("")}</section>`
        : emptyState(t("noClients"), t("noClientsDetail"))
    }
    ${scope}
  `;
}

// ── Client Report page: the client-facing surface ─────────────────────────
// Fed exclusively by buildClientReport() — internal fields are absent from
// its return value by construction, so they cannot render here.
export function renderReportPage() {
  const snapshot = state.snapshot;
  const clients = snapshot.clients || [];
  const selectedId = state.route.client && clients.some((row) => row.__recordId === state.route.client)
    ? state.route.client
    : clients.find((row) => row.status === "active")?.__recordId || clients[0]?.__recordId || "";

  els.clientPicker.innerHTML = clients
    .map((row) => `<option value="${escapeHtml(row.__recordId)}" ${row.__recordId === selectedId ? "selected" : ""}>${escapeHtml(row.client_name)}</option>`)
    .join("");

  const periods = [...new Set((snapshot.reports || []).filter((row) => row.client === selectedId).map((row) => row.period))].sort().reverse();
  const period = state.route.period && periods.includes(state.route.period) ? state.route.period : periods[0] || "";
  els.periodPicker.innerHTML = periods.length
    ? periods.map((value) => `<option value="${escapeHtml(value)}" ${value === period ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")
    : `<option value="">—</option>`;

  if (!selectedId) {
    els.reportBody.innerHTML = emptyState(t("noClients"), t("noClientsDetail"));
    return;
  }
  const page = buildClientReport(snapshot, selectedId, period);
  if (!page) {
    els.reportBody.innerHTML = emptyState(t("noClients"), t("noClientsDetail"));
    return;
  }
  if (!page.report) {
    els.reportBody.innerHTML = `
      <div class="card report-head"><h2>${escapeHtml(page.client.client_name)}</h2></div>
      ${emptyState(t("noReportForClient"), t("noReportForClientDetail"))}`;
    return;
  }

  const kpiCards = page.kpis.length
    ? `<div class="kpi-grid">${page.kpis
        .map(
          (kpi) => `
        <div class="card kpi-card">
          <span class="kpi-label">${escapeHtml(kpi.metric_label)}</span>
          <strong class="kpi-value">${escapeHtml(formatNumber(kpi.value))}${kpi.unit ? ` <small>${escapeHtml(kpi.unit)}</small>` : ""}</strong>
          <span class="kpi-change">${t("vsPrevious")}: ${escapeHtml(formatChange(kpi.change.vs_previous))}</span>
          <span class="kpi-change">${t("vsTarget")}: ${escapeHtml(formatChange(kpi.change.vs_target))}${kpi.change.target_progress != null ? ` · ${escapeHtml(Math.round(kpi.change.target_progress * 100))}% ${t("ofTarget")}` : ""}</span>
          ${kpi.source ? `<span class="muted">${escapeHtml(kpi.source)}</span>` : ""}
        </div>`,
        )
        .join("")}</div>`
    : "";

  const deliverableGroups = Object.entries(page.deliverables_by_status)
    .map(
      ([status, items]) => `
      <div class="report-group">
        <h3>${badge(status)}</h3>
        ${items
          .map(
            (item) => `<div class="due-row"><span><strong>${escapeHtml(item.deliverable)}</strong><small>${escapeHtml(item.project_name)}</small></span><span class="due-meta">${item.delivered_date ? `${t("delivered")} ${escapeHtml(formatDate(item.delivered_date))}` : item.due_date ? `${t("due")} ${escapeHtml(formatDate(item.due_date))}` : ""}${item.link ? ` · <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">↗</a>` : ""}</span></div>`,
          )
          .join("")}
      </div>`,
    )
    .join("");

  const timeline = page.milestones.length
    ? `<ol class="timeline">${page.milestones
        .map(
          (item) => `<li class="timeline-item is-${escapeHtml(item.status)}"><span class="timeline-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.milestone)}</strong> ${badge(item.status)}<small>${escapeHtml(item.project_name)}${item.completed_date ? ` · ${t("completed")} ${escapeHtml(formatDate(item.completed_date))}` : item.due_date ? ` · ${t("due")} ${escapeHtml(formatDate(item.due_date))}` : ""}</small>${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}</div></li>`,
        )
        .join("")}</ol>`
    : "";

  els.reportBody.innerHTML = `
    ${lockBanner()}
    <div class="card report-head">
      <h2>${escapeHtml(page.report.report_title)}</h2>
      <p class="muted">${escapeHtml(page.client.client_name)} · ${escapeHtml(page.report.period)} · ${badge(page.report.status)}</p>
    </div>
    ${page.report.executive_summary ? `<section class="card report-section"><h2>${t("executiveSummary")}</h2>${multiline(page.report.executive_summary)}</section>` : ""}
    ${page.report.highlights ? `<section class="card report-section"><h2>${t("highlights")}</h2>${multiline(page.report.highlights)}</section>` : ""}
    ${kpiCards ? `<section class="report-section"><h2>${t("kpis")}</h2>${kpiCards}</section>` : ""}
    ${page.projects.length ? `<section class="card report-section"><h2>${t("projects")}</h2>${page.projects.map((row) => `<div class="due-row"><span><strong>${escapeHtml(row.project_name)}</strong><small>${escapeHtml(row.summary)}</small></span><span class="due-meta">${badge(row.status)}</span></div>`).join("")}</section>` : ""}
    ${deliverableGroups ? `<section class="card report-section"><h2>${t("deliverables")}</h2>${deliverableGroups}</section>` : ""}
    ${timeline ? `<section class="card report-section"><h2>${t("milestones")}</h2>${timeline}</section>` : ""}
    ${page.next_steps ? `<section class="card report-section"><h2>${t("nextSteps")}</h2>${multiline(page.next_steps)}</section>` : ""}
  `;
}

// ── Reports list/detail (operator desk) ───────────────────────────────────
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

function reportsTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("title")], [t("client")], [t("period")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const clientName = state.snapshot?.clientById?.get(item.client)?.client_name || "";
            const selected = item.__recordId === state.route.selectedId ? ` class="ws-selected"` : "";
            return `<tr data-id="${escapeHtml(item.__recordId)}"${selected}>
              ${cell(`<span class="strong">${escapeHtml(item.report_title)}</span>`, item.report_title)}
              ${cell(escapeHtml(clientName), clientName)}
              ${cell(escapeHtml(item.period), item.period)}
              ${cell(badge(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function loadMoreControl() {
  if (!state.pagination?.reports) return "";
  return `
    <div class="load-more">
      <button type="button" class="button" data-load-more="reports" ${state.loadingMore ? "disabled" : ""}>${state.loadingMore ? t("loading") : t("loadMore")}</button>
      <span class="muted">${t("loadedScope").replace("{n}", reports().length)}</span>
    </div>
  `;
}

export function renderRecordView() {
  els.viewTitle.textContent = t("reportsTitle");
  els.viewTitle.title = t("reportsHint");
  const items = viewRows("reports");
  els.viewCount.textContent = `${items.length}${plus()}`;
  const banners = `${lockBanner()}${state.notice ? `<div class="notice-banner">${escapeHtml(state.notice)}</div>` : ""}`;
  els.viewNotice.hidden = !banners;
  els.viewNotice.innerHTML = banners;
  const empty = state.route.query ? emptyState(t("noMatches")) : emptyState(t("noReports"), t("noReportsDetail"));
  els.listPanel.innerHTML = `${items.length ? reportsTable(items) : empty}${loadMoreControl()}`;
  renderDetail();
}

function renderDetail() {
  const { selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, "reports");
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES.reports === "split" ? `<div class="ws-detail-empty">${t("selectClient")}</div>` : "";
    return;
  }
  const item = recordById(selectedId);
  if (!item) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("reportMissing"), t("reportMissingDetail"));
    return;
  }
  const clientName = state.snapshot?.clientById?.get(item.client)?.client_name || "";
  const projectName = state.snapshot?.projectById?.get(item.project)?.project_name || "";
  // Operator detail: client-visible narrative first. Risks & Blockers are
  // shown here ONLY, under an explicit internal heading — this drawer is the
  // agency's desk, never the client page (see renderReportPage).
  els.detailBody.innerHTML = `
    <article class="fu-detail">
      <header class="detail-head">
        <h2>${escapeHtml(item.report_title)}</h2>
        ${badge(item.status)}
      </header>
      <dl class="detail-fields">
        <dt>${t("client")}</dt><dd>${clientName ? escapeHtml(clientName) : "—"}</dd>
        ${projectName ? `<dt>${t("projects")}</dt><dd>${escapeHtml(projectName)}</dd>` : ""}
        <dt>${t("period")}</dt><dd>${escapeHtml(item.period)}</dd>
        ${item.shared_link_note ? `<dt>${t("sharedNote")}</dt><dd>${escapeHtml(item.shared_link_note)}</dd>` : ""}
      </dl>
      ${item.executive_summary ? `<h3>${t("executiveSummary")}</h3>${multiline(item.executive_summary)}` : ""}
      ${item.highlights ? `<h3>${t("highlights")}</h3>${multiline(item.highlights)}` : ""}
      ${item.next_steps ? `<h3>${t("nextSteps")}</h3>${multiline(item.next_steps)}` : ""}
      ${item.risks_blockers ? `<h3>Internal — ${t("atRisk")}</h3><p>${escapeHtml(item.risks_blockers)}</p>` : ""}
      <p><a class="button" href="${reportUrl(item.client, item.period)}">${t("openReportPage")}</a></p>
    </article>
  `;
}
