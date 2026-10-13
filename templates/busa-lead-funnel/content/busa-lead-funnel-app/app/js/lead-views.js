import {
  actionLabel,
  allLeads,
  categoryLabel,
  countsExact,
  dataset,
  datasetTotal,
  dateTime,
  detailUrl,
  els,
  escapeHtml,
  factorLabel,
  isPartial,
  leadById,
  money,
  pageCount,
  recordUrl,
  riskClass,
  STAGES,
  scoreClass,
  sourceLabel,
  stageCount,
  stageLabel,
  stageUrl,
  state,
  storesText,
  t,
  tierLabel,
  totalCount,
} from "../app.js";
import { computeFunnelSummary } from "./lead-funnel-model.js?v=0.1.0";

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");
const fill = (template, values) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

export const stageBadge = (stage) =>
  `<span class="stage-badge stage-${escapeHtml(STAGES.includes(stage) ? stage : "other")}">${escapeHtml(stageLabel(stage))}</span>`;
const scoreChip = (score) => `<span class="score-chip ${scoreClass(score)}">${Number(score || 0)}</span>`;
const categoryBadge = (category) =>
  `<span class="badge ${riskClass(category)}">${escapeHtml(categoryLabel(category))}</span>`;

const matchesQuery = (lead, query) =>
  !query ||
  [lead.brand_name, lead.city, categoryLabel(lead.category), sourceLabel(lead.lead_source)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar and nav do not already show. The two rates come
// from exact records.count totals; the strong-lead count needs each lead's
// derived score, so it covers the loaded page and says so when that is partial.
function metricsBand() {
  const total = totalCount();
  const loaded = allLeads();
  const strong = loaded.filter(
    (lead) => ["new", "data_verified", "scored"].includes(lead.stage) && Number(lead.score) >= 75,
  ).length;
  const scope = isPartial("") ? ` ${fill(t("loadedScope"), { n: loaded.length })}` : "";
  const exact = countsExact() || !isPartial("");
  return [
    [t("overallConversion"), exact ? pct(stageCount("term_sheet_ready"), total) : "—"],
    [t("rejectionRate"), exact ? pct(stageCount("rejected"), total) : "—"],
    [`${t("strongLeads")}${scope}`, String(strong)],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function funnelPanel() {
  const loaded = allLeads();
  const total = totalCount();
  // "Reached this stage or further" needs each lead's stage history, which no
  // server count can answer — computed over the loaded page, labelled if partial.
  const reach = computeFunnelSummary(loaded).by_stage;
  return `
    <div class="card overview-panel">
      <div class="panel-head"><h2>${t("funnel")}</h2><p>${t("funnelHint")}</p></div>
      <div class="funnel-track">
        ${STAGES.map((stage) => {
          const count = stageCount(stage);
          const reached = reach.find((item) => item.stage === stage)?.conversion_from_new_pct ?? 0;
          const bar = stage === "rejected" ? (total ? (count / total) * 100 : 0) : reached;
          return `
          <a class="funnel-step" data-stage="${stage}" href="${stageUrl(stage)}">
            <span class="funnel-step-label">${escapeHtml(stageLabel(stage))}</span>
            <span class="funnel-step-row">
              <strong class="funnel-step-count">${count}</strong>
              <span class="funnel-step-pct">${stage === "rejected" ? pct(count, total) : `${reached}%`}</span>
            </span>
            <span class="funnel-step-bar"><span style="width:${Math.min(100, Math.max(0, bar))}%"></span></span>
          </a>`;
        }).join("")}
      </div>
      ${isPartial("") ? `<p class="panel-note">${escapeHtml(fill(t("reachedLoaded"), { n: loaded.length }))}</p>` : ""}
    </div>
  `;
}

function triagePanel() {
  const rows = allLeads()
    .filter((lead) => ["new", "data_verified", "scored"].includes(lead.stage))
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 6);
  return `
    <div class="card overview-panel">
      <div class="panel-head"><h2>${t("topToTriage")}</h2></div>
      ${
        rows
          .map(
            (lead) => `
        <a class="triage-row" href="${recordUrl(lead.id, "leads")}">
          <span class="triage-name"><strong>${escapeHtml(lead.brand_name)}</strong><small>${escapeHtml(actionLabel(lead.suggested_action))}</small></span>
          ${stageBadge(lead.stage)}
          ${scoreChip(lead.score)}
        </a>`,
          )
          .join("") || `<div class="empty-inline">${t("noneToTriage")}</div>`
      }
    </div>
  `;
}

export function renderOverview() {
  const fund = state.settings?.config_summary?.fund_profile?.display_name;
  document.getElementById("overviewSummary").textContent = [
    fill(t("overviewSummary"), { total: totalCount() }),
    fund,
    state.settings?.demo ? t("demoData") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  document.getElementById("overviewBody").innerHTML = `<section class="overview-grid">${funnelPanel()}${triagePanel()}</section>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const rowOpen = (lead) =>
  `<tr data-id="${escapeHtml(lead.id)}"${lead.id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

function leadsTable(items) {
  const head = [
    [t("brandName")],
    [t("stageColumn")],
    [t("score"), "ws-col-num ws-split-keep score-col"],
    [t("nextAction")],
    [t("category")],
    [t("city")],
    [t("storeCount"), "ws-col-num"],
    [t("revenuePerMonth"), "ws-col-num"],
  ];
  return `
    <table class="ws-table leads-table">
      <thead><tr>${head.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${items
          .map(
            (lead) => `${rowOpen(lead)}
          ${cell(`<span class="strong">${escapeHtml(lead.brand_name)}</span>`, lead.brand_name)}
          ${cell(stageBadge(lead.stage))}
          ${cell(scoreChip(lead.score), "", "ws-col-num ws-split-keep score-col")}
          ${cell(escapeHtml(actionLabel(lead.suggested_action)), actionLabel(lead.suggested_action))}
          ${cell(categoryBadge(lead.category))}
          ${cell(escapeHtml(lead.city), lead.city)}
          ${cell(String(lead.store_count), "", "ws-col-num")}
          ${cell(money(lead.est_monthly_revenue), "", "ws-col-num")}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function leadCard(lead) {
  const selected = lead.id === state.route.selectedId ? " selected" : "";
  return `
    <a class="lead-card${selected}" href="${recordUrl(lead.id, "board")}" data-card-id="${escapeHtml(lead.id)}">
      <span class="lead-card-head">
        <strong>${escapeHtml(lead.brand_name)}</strong>
        ${scoreChip(lead.score)}
      </span>
      <span class="lead-card-meta">
        ${categoryBadge(lead.category)}
        <span>${escapeHtml(lead.city)}</span>
      </span>
      <span class="lead-card-meta">
        <span>${storesText(lead.store_count)}</span>
        <span>${money(lead.est_monthly_revenue)}${t("perMonth")}</span>
      </span>
    </a>
  `;
}

function boardView(query) {
  const loaded = allLeads();
  return `
    <div class="board">
      ${STAGES.map((stage) => {
        const leads = loaded.filter((lead) => lead.stage === stage && matchesQuery(lead, query));
        const onPage = loaded.filter((lead) => lead.stage === stage).length;
        const exact = stageCount(stage);
        const missing = query ? 0 : Math.max(0, exact - onPage);
        return `
        <section class="board-column" aria-label="${escapeHtml(stageLabel(stage))}">
          <header class="board-column-head">
            <a href="${stageUrl(stage)}">${escapeHtml(stageLabel(stage))}</a>
            <span>${query ? leads.length : exact}</span>
          </header>
          <div class="board-cards">
            ${leads.map(leadCard).join("") || `<div class="empty-inline">${query ? t("noMatches") : t("empty")}</div>`}
            ${missing ? `<a class="board-more" href="${stageUrl(stage)}">${escapeHtml(fill(t("moreNotLoaded"), { n: missing }))} · ${t("openInLeads")}</a>` : ""}
          </div>
        </section>`;
      }).join("")}
    </div>
  `;
}

// Prev / Next only: each click is one request for a neighbouring page with a
// cursor already in hand; the page total comes from records.count.
function pagerControl(stage) {
  const set = dataset(stage);
  if (!set) return "";
  const current = set.page;
  const hasNext = Boolean(set.cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(stage);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${stage}:${current - 1}" ${set.loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${total == null ? `${current}` : fill(t("pageOf"), { current, total: Math.max(total, current) })}</span>
      <button type="button" class="button" data-goto-page="${stage}:${current + 1}" ${set.loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function stageFilters() {
  const options = ["", ...STAGES];
  const label = (stage) => (stage ? stageLabel(stage) : t("all"));
  const count = (stage) => (stage ? stageCount(stage) : totalCount());
  els.stageFilters.innerHTML = options
    .map(
      (stage) =>
        `<button type="button" class="segment ${state.route.stage === stage ? "active" : ""}" data-stage="${stage}">${escapeHtml(label(stage))} <b>${count(stage)}</b></button>`,
    )
    .join("");
  els.stageSelect.innerHTML = options
    .map(
      (stage) =>
        `<option value="${stage}"${state.route.stage === stage ? " selected" : ""}>${escapeHtml(label(stage))} (${count(stage)})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view, query: rawQuery, stage } = state.route;
  const query = rawQuery.trim().toLowerCase();
  els.viewTitle.textContent = view === "board" ? t("board") : t("leadsNav");
  els.viewTitle.title = view === "board" ? t("boardHint") : t("leadsHint");
  const onLeads = view === "leads";
  els.stageFilters.hidden = !onLeads;
  els.stageSelect.hidden = !onLeads;
  if (onLeads) stageFilters();

  if (view === "board") {
    const shown = allLeads().filter((lead) => matchesQuery(lead, query)).length;
    els.viewCount.textContent = `${shown}${isPartial("") ? "+" : ""}`;
    els.listPanel.innerHTML = boardView(query);
  } else {
    const set = dataset(stage);
    const rows = (set?.rows || []).filter((lead) => (!stage || lead.stage === stage) && matchesQuery(lead, query));
    els.viewCount.textContent = query ? `${rows.length}${isPartial(stage) ? "+" : ""}` : String(datasetTotal(stage) ?? rows.length);
    let body;
    if (!set || (set.loading && !set.rows.length)) body = `<div class="empty-inline list-pad">${t("loading")}</div>`;
    else if (set.error) body = emptyState(set.error);
    else if (!rows.length) body = emptyState(query ? t("noMatches") : t("empty"));
    else body = leadsTable(rows);
    els.listPanel.innerHTML = `${body}${pagerControl(stage)}`;
  }
  // A failed page turn has no detail to show its message in.
  if (state.notice && !state.route.selectedId) {
    els.listPanel.insertAdjacentHTML("afterbegin", `<div class="notice-banner list-notice" role="status">${escapeHtml(state.notice)}</div>`);
  }
  renderDetail();
}

// ── Detail (one markup for drawer and full page) ───────────────────────────
function renderDetail() {
  const { selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    return;
  }
  const lead = leadById(selectedId);
  if (!lead) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = leadDetail(lead);
}

function factorRationale(factor) {
  if (factor.factor === "category_risk" && factor.tier) {
    return fill(t("categoryRiskRationale"), { category: categoryLabel(factor.category), tier: tierLabel(factor.tier) });
  }
  return factor.rationale;
}

function scoreBreakdown(lead) {
  return `
    <div class="score-breakdown">
      ${(lead.score_breakdown || [])
        .map(
          (factor) => `
        <div class="score-factor-row">
          <div class="row-head">
            <span>${escapeHtml(factorLabel(factor.factor))}</span>
            <span class="num">${factor.contribution} / ${factor.weight}</span>
          </div>
          <div class="score-factor-bar"><span style="width:${Math.round((factor.contribution / factor.weight) * 100)}%"></span></div>
          <div class="row-rationale">${escapeHtml(factorRationale(factor))}</div>
        </div>`,
        )
        .join("")}
    </div>
  `;
}

function stageActions(lead) {
  const nextStages = STAGES.filter((stage) => stage !== lead.stage && stage !== "rejected");
  return `
    <div class="stage-actions">
      ${nextStages
        .map(
          (stage) =>
            `<button type="button" class="button${stage === "term_sheet_ready" ? " primary" : ""}" data-move="${stage}" data-lead="${escapeHtml(lead.id)}">${t("moveTo")} ${escapeHtml(stageLabel(stage))}</button>`,
        )
        .join("")}
      ${lead.stage !== "rejected" ? `<button type="button" class="button danger" data-toggle-reject="1">${t("reject")}</button>` : ""}
    </div>
    <form class="reject-form" id="rejectForm" data-lead="${escapeHtml(lead.id)}" hidden>
      <label for="rejectReason">${t("rejectReason")}</label>
      <textarea id="rejectReason" required></textarea>
      <div class="stage-actions">
        <button type="submit" class="button danger">${t("rejectConfirm")}</button>
        <button type="button" class="button" data-toggle-reject="0">${t("cancel")}</button>
      </div>
    </form>
  `;
}

function notesSection(lead) {
  const rows = (lead.notes || [])
    .map(
      (note) => `
      <div class="note-row">
        <div>${escapeHtml(note.text)}</div>
        <div class="note-meta">${escapeHtml(note.author)} · ${dateTime(note.created_at)}</div>
      </div>`,
    )
    .join("");
  return `
    <section class="detail-section">
      <h3>${t("notes")}</h3>
      <div class="notes-list">${rows || `<div class="empty-inline">${t("empty")}</div>`}</div>
      <form class="note-form" id="noteForm" data-lead="${escapeHtml(lead.id)}">
        <textarea id="noteText" placeholder="${escapeHtml(t("noteText"))}" aria-label="${escapeHtml(t("addNote"))}" required></textarea>
        <div><button type="submit" class="button">${t("save")}</button></div>
      </form>
    </section>
  `;
}

function historySection(lead) {
  const rows = (lead.stage_history || [])
    .map(
      (change) =>
        `<div>${change.from ? `${escapeHtml(stageLabel(change.from))} → ` : ""}${escapeHtml(stageLabel(change.to))} · ${dateTime(change.at)}${change.reason ? ` — ${escapeHtml(change.reason)}` : ""}</div>`,
    )
    .join("");
  return `<section class="detail-section"><h3>${t("stageHistory")}</h3><div class="stage-history">${rows || `<div class="empty-inline">—</div>`}</div></section>`;
}

function leadDetail(lead) {
  const notice = state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : "";
  return `
    <header class="detail-head">
      <h2>${escapeHtml(lead.brand_name)}</h2>
      <p class="detail-sub">${stageBadge(lead.stage)}<span>${escapeHtml([categoryLabel(lead.category), lead.city].filter(Boolean).join(" · "))}</span></p>
    </header>
    ${notice}
    <section class="lead-detail">
      <div class="detail-main">
        <div class="score-summary">
          <span class="score-big ${scoreClass(lead.score)}">${Number(lead.score || 0)}<small>/100</small></span>
          <span><small class="muted">${t("suggestedAction")}</small><strong>${escapeHtml(actionLabel(lead.suggested_action))}</strong></span>
        </div>
        <section class="detail-section">
          <h3>${t("scoreBreakdown")}</h3>
          ${scoreBreakdown(lead)}
        </section>
        ${notesSection(lead)}
      </div>
      <aside class="detail-side">
        <dl>
          <dt>${t("monthlyRevenue")}</dt><dd class="num-left">${money(lead.est_monthly_revenue)}</dd>
          <dt>${t("storeCount")}</dt><dd class="num-left">${lead.store_count}</dd>
          <dt>${t("category")}</dt><dd>${categoryBadge(lead.category)}</dd>
          <dt>${t("city")}</dt><dd>${escapeHtml(lead.city)}</dd>
          <dt>${t("leadSource")}</dt><dd>${escapeHtml(sourceLabel(lead.lead_source))}</dd>
          <dt>${t("dataVerifiable")}</dt><dd>${lead.data_verifiable ? t("yes") : t("no")}</dd>
          ${lead.rejection_reason ? `<dt>${t("rejectionReason")}</dt><dd>${escapeHtml(lead.rejection_reason)}</dd>` : ""}
        </dl>
        ${stageActions(lead)}
        ${historySection(lead)}
      </aside>
    </section>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
let lastSettingsHtml = "";
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const fund = summary.fund_profile || {};
  const criteria = summary.scoring_criteria || {};
  const list = (items) => (items || []).map(categoryLabel).map(escapeHtml).join(", ");
  const body = document.getElementById("settingsBody");
  // Re-render only when the content changed, so the accent picker that
  // accent-theme.js mounts into `section.settings` is not torn down each render.
  const html = `
    <section class="settings">
      <p class="settings-note">${t("localFilesOnly")}</p>
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          ${summary.config_path ? `<dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path)}</dd>` : ""}
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("fundProfile")}</h2>
        <dl>
          <dt>${t("fundName")}</dt><dd>${escapeHtml(fund.display_name || "—")}</dd>
          <dt>${t("product")}</dt><dd>${escapeHtml(fund.product || "—")}</dd>
          <dt>${t("targetCheckSize")}</dt><dd>${escapeHtml(fund.target_check_size || "—")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("scoringCriteria")}</h2>
        <dl>
          <dt>${t("idealStoreBand")}</dt><dd>${criteria.ideal_store_count_min ?? "—"}–${criteria.ideal_store_count_max ?? "—"}</dd>
          <dt>${t("idealRevenueBand")}</dt><dd>${money(criteria.ideal_monthly_revenue_min)} – ${money(criteria.ideal_monthly_revenue_max)}</dd>
          <dt>${t("lowRiskCategories")}</dt><dd>${list(criteria.low_risk_categories)}</dd>
          <dt>${t("mediumRiskCategories")}</dt><dd>${list(criteria.medium_risk_categories)}</dd>
          <dt>${t("higherRiskCategories")}</dt><dd>${list(criteria.higher_risk_categories)}</dd>
        </dl>
      </section>
    </section>
  `;
  if (lastSettingsHtml !== html || !body.firstElementChild) {
    body.innerHTML = html;
    lastSettingsHtml = html;
  }
}
