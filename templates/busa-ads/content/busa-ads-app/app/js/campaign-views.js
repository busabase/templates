import {
  acosBadge,
  adjTypeBadge,
  adjustmentById,
  adjustments,
  ageOf,
  anomalies,
  anomalyById,
  baseFor,
  budgetBar,
  campaignById,
  campaignName,
  campaigns,
  date,
  dateTime,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredAdjustments,
  filteredAnomalies,
  filteredCampaigns,
  isPartial,
  loadState,
  lockBanner,
  metrics,
  modeFor,
  money,
  notice,
  pageCount,
  platformBadge,
  platformDot,
  platforms,
  recordById,
  recordUrl,
  render,
  state,
  statusBadge,
  syncLog,
  t,
  trendArrow,
  typeBadge,
  viewLabel,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const emptyInline = (text = t("empty")) => `<div class="empty-inline">${escapeHtml(text)}</div>`;

// ── Charts ─────────────────────────────────────────────────────────────────
function dailyTotals() {
  const byDate = new Map();
  for (const campaign of campaigns()) {
    for (const day of campaign.daily || []) {
      const entry = byDate.get(day.date) || { date: day.date, spend: 0, revenue: 0 };
      entry.spend += Number(day.spend || 0);
      entry.revenue += Number(day.revenue || 0);
      byDate.set(day.date, entry);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

function spendRevenueChart() {
  const days = dailyTotals();
  if (!days.length) return emptyInline();
  const width = 720;
  const height = 190;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(...days.map((day) => Math.max(day.spend, day.revenue)), 1);
  const slot = (width - padX * 2) / days.length;
  const barW = Math.max(4, Math.min(14, slot * 0.32));
  const yFor = (value) => padTop + (1 - value / max) * (height - padTop - padBottom);
  const bars = days
    .map((day, index) => {
      const x = padX + index * slot + slot / 2;
      const spendY = yFor(day.spend);
      const revenueY = yFor(day.revenue);
      const label =
        index % 2 === 0
          ? `<text class="axis-label" x="${x}" y="${height - 6}" text-anchor="middle">${escapeHtml(date(day.date))}</text>`
          : "";
      return `
      <rect class="bar-spend" x="${(x - barW - 1).toFixed(1)}" y="${spendY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - spendY).toFixed(1)}" rx="1.5"><title>${escapeHtml(day.date)} · ${t("spend")} ${escapeHtml(money(day.spend))}</title></rect>
      <rect class="bar-revenue" x="${(x + 1).toFixed(1)}" y="${revenueY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - revenueY).toFixed(1)}" rx="1.5"><title>${escapeHtml(day.date)} · ${t("revenue")} ${escapeHtml(money(day.revenue))}</title></rect>
      ${label}
    `;
    })
    .join("");
  return `
    <svg class="barchart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("spendVsRevenue")}" preserveAspectRatio="none">${bars}</svg>
    <div class="chart-legend">
      <span><i class="swatch-spend"></i>${t("spend")}</span>
      <span><i class="swatch-revenue"></i>${t("revenue")}</span>
    </div>
  `;
}

function campaignChart(campaign) {
  const days = [...(campaign.daily || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (!days.length) return emptyInline();
  const width = 720;
  const height = 190;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const maxSpend = Math.max(...days.map((day) => Number(day.spend || 0)), 1);
  const roasValues = days.map((day) => (Number(day.spend) > 0 ? Number(day.revenue || 0) / Number(day.spend) : 0));
  const maxRoas = Math.max(...roasValues, 1);
  const slot = (width - padX * 2) / days.length;
  const barW = Math.max(6, Math.min(22, slot * 0.5));
  const ySpend = (value) => padTop + (1 - value / maxSpend) * (height - padTop - padBottom);
  const yRoas = (value) => padTop + (1 - value / maxRoas) * (height - padTop - padBottom);
  const bars = days
    .map((day, index) => {
      const x = padX + index * slot + (slot - barW) / 2;
      const y = ySpend(Number(day.spend || 0));
      const label =
        index % 2 === 0
          ? `<text class="axis-label" x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeHtml(date(day.date))}</text>`
          : "";
      return `<rect class="bar-spend" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - y).toFixed(1)}" rx="2"><title>${escapeHtml(day.date)} · ${t("spend")} ${escapeHtml(money(day.spend))} · ROAS ${roasValues[index].toFixed(2)}</title></rect>${label}`;
    })
    .join("");
  const line = roasValues
    .map((value, index) => {
      const x = padX + index * slot + slot / 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${yRoas(value).toFixed(1)}`;
    })
    .join(" ");
  return `
    <svg class="linechart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("dailySeries")}" preserveAspectRatio="none">
      ${bars}
      <path class="roas-line" d="${line}"></path>
    </svg>
    <div class="chart-legend">
      <span><i class="swatch-spend"></i>${t("spend")}</span>
      <span><i class="swatch-roas"></i>${t("roas")}</span>
    </div>
  `;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries review, open
// alerts and budget-at-risk). They are summed from the loaded campaigns and
// say so when more campaigns exist than are loaded.
function metricsBand() {
  const m = metrics();
  const acos = Number(m.blended_acos_pct || 0);
  const target = Number(m.acos_target_pct || 0);
  const scope = isPartial("campaigns") ? ` · ${t("loadedRows").replace("{n}", campaigns().length)}` : "";
  const cells = [
    [`${t("spendMtd")}${scope}`, money(m.spend_mtd), `${t("lastMonth")} ${money(m.spend_last_month)}`, ""],
    [
      `${t("blendedRoas")}${scope}`,
      Number(m.blended_roas || 0).toFixed(2),
      `${t("spend")} ${money(m.spend_14d)} · ${t("revenue")} ${money(m.revenue_14d)}`,
      "",
    ],
    [
      `${t("blendedAcos")} · ${t("acosTarget")} ${target.toFixed(0)}%${scope}`,
      `${acos.toFixed(1)}%`,
      "",
      target && acos > target ? "over-target" : "on-target",
    ],
  ];
  return cells
    .map(
      ([label, value, title, cls]) =>
        `<div${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(label)}</span><strong${cls ? ` class="${cls}"` : ""}>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

function platformCards() {
  if (!platforms().length) return "";
  return `
    <div class="platform-grid">
      ${platforms()
        .map(
          (platform) => `
        <div class="card platform-card">
          <div class="row between">
            <strong>${platformDot(platform.status)}${escapeHtml(platform.name)}</strong>
            ${platformBadge(platform.platform_id)}
          </div>
          <div class="platform-nums">
            <span>${t("spend")} <b>${money(platform.spend_14d, platform.currency)}</b></span>
            <span>ROAS <b>${Number(platform.roas || 0).toFixed(2)}</b></span>
            <span>ACOS <b>${Number(platform.acos_pct || 0).toFixed(1)}%</b></span>
          </div>
          <div class="muted">${platform.campaign_count || 0} ${t("campaigns").toLowerCase()} · ${t("lastSync")} ${dateTime(platform.last_sync_at)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function worstOffenders() {
  const rows = [];
  for (const campaign of campaigns()) {
    for (const target of campaign.targets || []) {
      if (Number(target.conversions || 0) === 0 && Number(target.spend_14d || 0) >= 25) {
        rows.push({ campaign, target });
      }
    }
  }
  rows.sort((a, b) => Number(b.target.spend_14d) - Number(a.target.spend_14d));
  if (!rows.length) return emptyInline();
  return rows
    .slice(0, 6)
    .map(
      ({ campaign, target }) => `
    <a class="attention-row" href="${detailUrl(campaign.campaign_id, "campaigns")}">
      <span><strong>${escapeHtml(target.text)}</strong><small>${escapeHtml(campaign.name)} · ${escapeHtml(String(target.clicks || 0))} ${t("clicks").toLowerCase()}</small></span>
      <span class="badges">${platformBadge(campaign.platform)}<span class="acos-badge crit">${escapeHtml(money(target.spend_14d))} · ${t("zeroOrders")}</span></span>
    </a>
  `,
    )
    .join("");
}

export function renderOverview() {
  const m = metrics();
  const generated =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("empty");
  document.getElementById("overviewSummary").textContent = [
    t("activeOf")
      .replace("{active}", m.campaigns_active || 0)
      .replace("{total}", state.totals?.campaigns ?? m.campaigns_total ?? 0),
    `${Number(m.conversions_14d || 0)} ${t("conversions14d").toLowerCase()}`,
    generated,
  ].join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const needsDecision = adjustments().filter((item) => item.status === "needs_review");
  const critical = anomalies().filter((item) => item.state === "open" && item.severity === "critical");
  const budgetRisk = campaigns().filter(
    (item) => item.status === "active" && Number(item.budget_spent_today_pct || 0) >= 85,
  );
  document.getElementById("overviewBody").innerHTML = `
    ${notice()}
    ${warnings()}
    ${platformCards()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        ${needsDecision
          .map(
            (item) => `
          <a class="attention-row" href="${recordUrl(item.adjustment_id, "adjustments")}">
            <span><strong>${t("adjustmentRef")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></span>
            <span class="badges">${adjTypeBadge(item.type)}</span>
          </a>
        `,
          )
          .join("")}
        ${critical
          .map(
            (item) => `
          <a class="attention-row" href="${recordUrl(item.anomaly_id, "alerts")}">
            <span><strong>${escapeHtml(campaignName(item.campaign_id))}</strong><small>${escapeHtml(item.evidence)}</small></span>
            <span class="badges">${typeBadge(item.type)}${statusBadge(item.severity)}</span>
          </a>
        `,
          )
          .join("")}
        ${budgetRisk
          .map(
            (item) => `
          <a class="attention-row" href="${detailUrl(item.campaign_id, "campaigns")}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${t("dailyBudget")} ${money(item.daily_budget, item.currency)} · ${Number(item.budget_spent_today_pct || 0)}% ${t("spentToday")}</small></span>
            <span class="badges">${platformBadge(item.platform)}</span>
          </a>
        `,
          )
          .join("")}
        ${!needsDecision.length && !critical.length && !budgetRisk.length ? emptyInline() : ""}
      </div>
      <div class="card overview-panel">
        <h2>${t("worstOffenders")}</h2>
        ${worstOffenders()}
      </div>
      <div class="card overview-panel wide">
        <h2>${t("spendVsRevenue")}</h2>
        ${spendRevenueChart()}
      </div>
      <div class="card overview-panel wide">
        <h2>${t("syncActivity")}</h2>
        ${
          syncLog()
            .slice(0, 6)
            .map(
              (entry) => `
          <div class="sync-row">
            <span class="sync-meta"><small>${dateTime(entry.at)}</small><span class="badge">${escapeHtml(enumLabel(entry.kind, "kind"))}</span>${entry.platform ? platformBadge(entry.platform) : ""}</span>
            <span class="sync-message">${escapeHtml(entry.message)}</span>
          </div>
        `,
            )
            .join("") || emptyInline()
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { campaigns: "campaignsHint", alerts: "alertsHint", adjustments: "adjustmentsHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function campaignsTable(items) {
  return `
    <table class="ws-table ads-table campaigns-table">
      ${tableHead([
        [t("campaign")],
        [t("platform")],
        [t("product")],
        [t("status")],
        [t("dailyBudget")],
        [t("spend7d"), "num"],
        [t("roas7d"), "num"],
        [t("acos7d")],
        [t("trend")],
      ])}
      <tbody>
        ${items
          .map((campaign) => {
            const product = [campaign.product, campaign.sku].filter(Boolean).join(" · ");
            const spent = Number(campaign.budget_spent_today_pct || 0);
            return `${rowOpen(campaign.campaign_id)}
              ${cell(`<span class="strong">${escapeHtml(campaign.name)}</span>`, campaign.name)}
              ${cell(platformBadge(campaign.platform))}
              ${cell(escapeHtml(product), product)}
              ${cell(statusBadge(campaign.status))}
              ${cell(
                `<span class="budget-cell">${money(campaign.daily_budget, campaign.currency)}${budgetBar(spent)}<span class="muted">${spent}%</span></span>`,
                `${spent}% ${t("spentToday")}`,
              )}
              ${cell(money(campaign.totals_7d?.spend, campaign.currency), "", "num")}
              ${cell(Number(campaign.totals_7d?.roas || 0).toFixed(2), "", "num")}
              ${cell(acosBadge(campaign.totals_7d?.acos_pct, campaign.acos_target_pct))}
              ${cell(trendArrow(campaign.trend))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function adjustmentChip(adjustmentId) {
  const adjustment = adjustmentById(adjustmentId);
  if (!adjustment) return `<span class="muted">${t("notLoaded")}</span>`;
  return `<a class="badge action-link" href="${recordUrl(adjustmentId, "adjustments")}">#${adjustment.ref} · ${escapeHtml(enumLabel(adjustment.status))}</a>`;
}

function alertsTable(items) {
  return `
    <table class="ws-table ads-table alerts-table">
      ${tableHead([
        [t("evidence")],
        [t("severity")],
        [t("type")],
        [t("campaign")],
        [t("platform")],
        [t("age"), "num"],
        [t("state")],
        [t("adjustment")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const campaign = campaignById(item.campaign_id);
            return `${rowOpen(item.anomaly_id)}
              ${cell(`<span class="strong">${escapeHtml(item.evidence)}</span>`, item.evidence)}
              ${cell(statusBadge(item.severity))}
              ${cell(typeBadge(item.type))}
              ${cell(
                campaign
                  ? `<a href="${detailUrl(campaign.campaign_id, "campaigns")}">${escapeHtml(campaign.name)}</a>`
                  : item.campaign_id
                    ? `<span class="muted">${t("notLoaded")}</span>`
                    : "",
                campaign?.name || "",
              )}
              ${cell(platformBadge(item.platform))}
              ${cell(ageOf(item.first_seen_at || item.detected_at), "", "num")}
              ${cell(statusBadge(item.state))}
              ${cell(item.adjustment_id ? adjustmentChip(item.adjustment_id) : `<span class="muted">—</span>`)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function adjustmentsTable(items) {
  return `
    <table class="ws-table ads-table adjustments-table">
      ${tableHead([[t("adjustment")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const label = `#${item.ref} · ${item.title}`;
            return `${rowOpen(item.adjustment_id)}
              ${cell(`<span class="strong">${escapeHtml(label)}</span>`, label)}
              ${cell(statusBadge(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count when available.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null
      ? `${current}`
      : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <nav class="pager" aria-label="${t("pagination")}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${summary}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

export function renderRecordView() {
  const { view } = state.route;
  const key = baseFor(view);
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items =
    view === "campaigns" ? filteredCampaigns() : view === "alerts" ? filteredAnomalies() : filteredAdjustments();
  els.viewCount.textContent = `${items.length}${isPartial(key) ? "+" : ""}`;
  const table =
    view === "campaigns" ? campaignsTable(items) : view === "alerts" ? alertsTable(items) : adjustmentsTable(items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = modeFor(view) === "split" ? emptyState(t("selectAdjustment")) : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const extra = state.extra[baseFor(view)];
    const pending = extra?.has(selectedId) && extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? emptyInline(t("loading"))
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "campaigns" ? campaignDetail(item) : view === "alerts" ? anomalyDetail(item) : adjustmentDetail(item);
}

// ── Detail: campaign (page) ────────────────────────────────────────────────
function targetsTable(campaign) {
  const rows = campaign.targets || [];
  if (!rows.length) return emptyInline();
  return `
    <div class="table-wrap">
      <table class="inset-table">
        <thead>
          <tr>
            <th>${t("term")}</th><th>${t("type")}</th><th>${t("state")}</th><th class="num">${t("spend")} 14d</th><th class="num">${t("clicks")}</th><th class="num">${t("conversions")}</th><th class="num">${t("revenue")}</th><th class="num">${t("cpc")}</th><th class="num">${t("acos")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (target) => `
            <tr>
              <td title="${escapeHtml(target.text)}"><strong>${escapeHtml(target.text)}</strong>${target.match_type ? ` <span class="muted">${escapeHtml(target.match_type)}</span>` : ""}</td>
              <td><span class="badge">${escapeHtml(enumLabel(target.type, "targettype"))}</span></td>
              <td>${statusBadge(target.state)}</td>
              <td class="num">${money(target.spend_14d, campaign.currency)}</td>
              <td class="num">${Number(target.clicks || 0)}</td>
              <td class="num ${Number(target.conversions || 0) === 0 ? "negative" : ""}">${Number(target.conversions || 0)}</td>
              <td class="num">${money(target.revenue, campaign.currency)}</td>
              <td class="num">${money(target.cpc, campaign.currency)}</td>
              <td class="num">${Number(target.revenue) > 0 ? `${Number(target.acos_pct || 0).toFixed(1)}%` : t("notAvailable")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adjustmentCard(item) {
  return `
    <a class="action-card" href="${recordUrl(item.adjustment_id, "adjustments")}">
      <div class="action-card-head">
        <span class="action-ref">${t("adjustmentRef")} #${item.ref}</span>
        ${adjTypeBadge(item.type)}
        ${statusBadge(item.status)}
      </div>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="value-line"><b>${escapeHtml(item.current_value)}</b> → <b>${escapeHtml(item.proposed_value)}</b></span>
      ${item.decision?.note ? `<span class="action-note">“${escapeHtml(item.decision.note)}”</span>` : ""}
    </a>
  `;
}

function campaignDetail(campaign) {
  const linkedAnomalies = anomalies().filter((item) => item.campaign_id === campaign.campaign_id);
  const linkedAdjustments = adjustments().filter(
    (item) => item.campaign_id === campaign.campaign_id || item.target?.id === campaign.campaign_id,
  );
  const totals = campaign.totals_7d || {};
  return `
    <header class="detail-head">
      <h2>${escapeHtml(campaign.name)}</h2>
      <p class="detail-badges">${platformBadge(campaign.platform)}${statusBadge(campaign.status)}</p>
    </header>
    ${warnings((item) => !item.campaign_id || item.campaign_id === campaign.campaign_id)}
    <section class="detail">
      <div class="detail-main">
        <div class="card panel">
          <h3>${t("dailySeries")}</h3>
          ${campaignChart(campaign)}
        </div>
        <div class="card panel">
          <h3>${t("topTargets")}</h3>
          ${targetsTable(campaign)}
        </div>
        ${
          linkedAnomalies.length
            ? `
          <div class="card panel">
            <h3>${t("linkedAnomalies")}</h3>
            ${linkedAnomalies
              .map(
                (item) => `
              <a class="attention-row" href="${recordUrl(item.anomaly_id, "alerts")}">
                <span><strong>${escapeHtml(enumLabel(item.type, "type"))}</strong><small>${escapeHtml(item.evidence)}</small></span>
                <span class="badges">${statusBadge(item.severity)}${statusBadge(item.state)}</span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          linkedAdjustments.length
            ? `
          <div class="card panel">
            <h3>${t("adjustmentHistory")}</h3>
            <div class="action-list">
              ${linkedAdjustments.map((item) => adjustmentCard(item)).join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
      <aside class="card detail-side">
        <dl>
          <dt>${t("spend7d")}</dt><dd class="num-dd">${money(totals.spend, campaign.currency)}</dd>
          <dt>${t("revenue")}</dt><dd class="num-dd">${money(totals.revenue, campaign.currency)}</dd>
          <dt>${t("roas7d")}</dt><dd class="num-dd">${Number(totals.roas || 0).toFixed(2)}</dd>
          <dt>${t("acos7d")}</dt><dd>${acosBadge(totals.acos_pct, campaign.acos_target_pct)}</dd>
          <dt>${t("conversions")}</dt><dd class="num-dd">${Number(totals.conversions || 0)}</dd>
          <dt>${t("clicks")}</dt><dd class="num-dd">${Number(totals.clicks || 0)} · ${t("cpc")} ${money(totals.cpc, campaign.currency)}</dd>
          <dt>${t("impressions")}</dt><dd class="num-dd">${Number(totals.impressions || 0).toLocaleString()}</dd>
        </dl>
        <dl>
          <dt>${t("product")}</dt><dd>${escapeHtml(campaign.product || t("notAvailable"))}</dd>
          ${campaign.sku ? `<dt>${t("sku")}</dt><dd class="mono">${escapeHtml(campaign.sku)}</dd>` : ""}
          <dt>${t("dailyBudget")}</dt><dd>${money(campaign.daily_budget, campaign.currency)}</dd>
          <dt>${t("spentToday")}</dt><dd>${Number(campaign.budget_spent_today_pct || 0)}%${budgetBar(campaign.budget_spent_today_pct)}</dd>
          <dt>${t("acosTarget")}</dt><dd>${Number(campaign.acos_target_pct || 0).toFixed(0)}%</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(campaign.currency || "USD")}</dd>
          <dt>${t("lastSync")}</dt><dd>${dateTime(campaign.last_sync_at)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

// ── Detail: anomaly (drawer) ───────────────────────────────────────────────
// A target id names a row inside the campaign's targets; show its text, never
// the id.
function targetText(campaign, targetId) {
  if (!targetId || !campaign) return "";
  return (campaign.targets || []).find((item) => item.target_id === targetId)?.text || "";
}

function campaignLink(campaignId) {
  const campaign = campaignById(campaignId);
  if (campaign) return `<a href="${detailUrl(campaign.campaign_id, "campaigns")}">${escapeHtml(campaign.name)}</a>`;
  return campaignId ? `<span class="muted">${t("notLoaded")}</span>` : "";
}

function anomalyDetail(item) {
  const campaign = campaignById(item.campaign_id);
  const target = targetText(campaign, item.target_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(enumLabel(item.type, "type"))}</h2>
    </header>
    <div class="detail-stack">
      <p class="guidance">${escapeHtml(item.evidence)}</p>
      <dl>
        <dt>${t("severity")}</dt><dd>${statusBadge(item.severity)}</dd>
        <dt>${t("state")}</dt><dd>${statusBadge(item.state)}</dd>
        <dt>${t("campaign")}</dt><dd>${campaignLink(item.campaign_id)}</dd>
        <dt>${t("platform")}</dt><dd>${platformBadge(item.platform)}</dd>
        ${target ? `<dt>${t("target")}</dt><dd>${escapeHtml(target)}</dd>` : ""}
        <dt>${t("age")}</dt><dd>${ageOf(item.first_seen_at || item.detected_at)}</dd>
        <dt>${t("firstSeen")}</dt><dd>${dateTime(item.first_seen_at)}</dd>
        <dt>${t("detectedAt")}</dt><dd>${dateTime(item.detected_at)}</dd>
        <dt>${t("adjustment")}</dt><dd>${item.adjustment_id ? adjustmentChip(item.adjustment_id) : "—"}</dd>
      </dl>
    </div>
  `;
}

// ── Detail: adjustment (split) ─────────────────────────────────────────────
// The proposed target: what kind of thing it is and its human name. A budget
// shift's id is the campaign the budget leaves.
function targetRows(adjustment) {
  const target = adjustment.target || {};
  if (target.kind === "budget") {
    return `<dt>${t("fromCampaign")}</dt><dd>${campaignLink(target.id)}</dd>`;
  }
  if (!target.text) return "";
  return `<dt>${t("target")}</dt><dd>${escapeHtml(target.text)}${target.kind ? ` <span class="badge">${escapeHtml(enumLabel(target.kind, "targetkind"))}</span>` : ""}</dd>`;
}

// What the agent executed, as labelled values. Campaign references resolve to
// names; other ids are internal to the ad platform and stay off screen.
const EXECUTION_LABELS = {
  term: "term",
  scope: "scope",
  match: "match",
  text: "target",
  ad_group: "adGroup",
  current: "current",
  new: "proposed",
};

function executionTargetRows(target = {}) {
  return Object.entries(target)
    .map(([key, value]) => {
      if (value == null || value === "") return "";
      if (key === "platform") return `<dt>${t("platform")}</dt><dd>${platformBadge(value)}</dd>`;
      if (key === "campaign_id") return `<dt>${t("campaign")}</dt><dd>${campaignLink(value)}</dd>`;
      if (key === "from_campaign_id") return `<dt>${t("fromCampaign")}</dt><dd>${campaignLink(value)}</dd>`;
      if (key === "to_campaign_id") return `<dt>${t("toCampaign")}</dt><dd>${campaignLink(value)}</dd>`;
      if (/(^|_)id$/.test(key) || typeof value === "object") return "";
      return `<dt>${escapeHtml(EXECUTION_LABELS[key] ? t(EXECUTION_LABELS[key]) : key.replaceAll("_", " "))}</dt><dd>${escapeHtml(String(value))}</dd>`;
    })
    .join("");
}

function decisionLabel(verdict) {
  return enumLabel(verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested");
}

function adjustmentDetail(adjustment) {
  const locked = Boolean(state.settings?.lock);
  const anomaly = adjustment.anomaly_id ? anomalyById(adjustment.anomaly_id) : null;
  const disabled = locked ? "disabled" : "";
  return `
    <article class="adjustment-detail" data-adjustment="${escapeHtml(adjustment.adjustment_id)}">
      <header class="detail-head">
        <h2>${t("adjustmentRef")} #${adjustment.ref} · ${escapeHtml(adjustment.title)}</h2>
        <p class="detail-badges">${adjTypeBadge(adjustment.type)}${statusBadge(adjustment.status)}${platformBadge(adjustment.platform)}</p>
      </header>
      ${notice()}
      ${lockBanner()}
      <section class="detail">
        <div class="detail-main">
          <div class="card panel">
            <h3>${t("reason")}</h3>
            <p class="guidance">${escapeHtml(adjustment.reason)}</p>
            <div class="value-shift">
              <span><span>${t("current")}</span><strong>${escapeHtml(adjustment.current_value)}</strong></span>
              <span class="arrow" aria-hidden="true">→</span>
              <span><span>${t("proposed")}</span><strong>${escapeHtml(adjustment.proposed_value)}</strong></span>
            </div>
            ${adjustment.expected_impact ? `<div class="impact"><strong>${t("expectedImpact")}</strong> · ${escapeHtml(adjustment.expected_impact)}</div>` : ""}
          </div>
          <div class="card panel">
            <h3>${t("evidence")}</h3>
            <ul class="evidence-list">
              ${(adjustment.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
            </ul>
          </div>
          <div class="card panel">
            <label class="panel-label" for="adjustment-note">${t("note")}</label>
            <textarea id="adjustment-note" rows="3" placeholder="${t("notePlaceholder")}" ${disabled}>${escapeHtml(adjustment.note || "")}</textarea>
            <div class="decision-actions">
              <button type="button" class="primary" data-verdict="approve" ${disabled} title="${t("approve")}">${t("approve")}</button>
              <button type="button" data-verdict="request_changes" ${disabled} title="${t("requestChanges")}">${t("requestChanges")}</button>
              <button type="button" class="danger" data-verdict="block" ${disabled} title="${t("block")}">${t("block")}</button>
              <button type="button" data-verdict="note" ${disabled} title="${t("saveNote")}">${t("saveNote")}</button>
            </div>
          </div>
          ${
            adjustment.execution
              ? `
            <div class="card panel">
              <h3>${t("execution")}</h3>
              <dl>
                <dt>${t("status")}</dt><dd>${statusBadge(adjustment.execution.status)}</dd>
                <dt>${t("operation")}</dt><dd>${escapeHtml(enumLabel(adjustment.execution.operation, "operation"))}</dd>
                ${executionTargetRows(adjustment.execution.target)}
                <dt>${t("executedAt")}</dt><dd>${dateTime(adjustment.execution.executed_at)}</dd>
              </dl>
              ${adjustment.execution.detail ? `<p class="guidance muted">${escapeHtml(adjustment.execution.detail)}</p>` : ""}
            </div>
          `
              : ""
          }
        </div>
        <aside class="card detail-side">
          <dl>
            <dt>${t("campaign")}</dt><dd>${campaignLink(adjustment.campaign_id)}</dd>
            ${targetRows(adjustment)}
            ${
              adjustment.decision
                ? `<dt>${t("decision")}</dt><dd>${escapeHtml(decisionLabel(adjustment.decision.verdict))}</dd>
                   <dt>${t("decidedAt")}</dt><dd>${dateTime(adjustment.decision.decided_at)}</dd>`
                : ""
            }
            ${
              anomaly
                ? `<dt>${t("linkedAnomalies")}</dt><dd><a href="${recordUrl(anomaly.anomaly_id, "alerts")}">${escapeHtml(enumLabel(anomaly.type, "type"))}</a><small class="muted side-note">${escapeHtml(anomaly.evidence)}</small></dd>`
                : ""
            }
          </dl>
        </aside>
      </section>
    </article>
  `;
}

export async function submitDecision(adjustmentId, verdict) {
  const note = els.detailBody.querySelector("#adjustment-note")?.value || "";
  if (state.settings?.demo) {
    const adjustment = adjustmentById(adjustmentId);
    if (adjustment) {
      if (verdict !== "note") {
        adjustment.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      adjustment.note = note;
      adjustment.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideAdjustment({ adjustment_id: adjustmentId, verdict, note });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  await loadState();
  // Without write access the verdict is a ChangeRequest, and the adjustment
  // keeps its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("decisionSaved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const targets = summary.targets || {};
  const thresholds = summary.thresholds || {};
  document.getElementById("settingsBody").innerHTML = `
    ${notice()}
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(summary.currency || "USD")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("platforms")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-row">
            <strong>${escapeHtml(platform.name)}</strong>
            <span class="muted">${t("accountId")} <span class="mono">${escapeHtml(platform.account_id || "—")}</span></span>
          </div>
        `,
            )
            .join("") || emptyInline(t("setupNeeded"))
        }
      </section>
      <section class="card">
        <h2>${t("targets")}</h2>
        <dl>
          <dt>${t("defaultAcos")}</dt><dd>${targets.default_acos_pct != null ? `${escapeHtml(String(targets.default_acos_pct))}%` : "—"}</dd>
          <dt>${t("defaultRoas")}</dt><dd>${escapeHtml(String(targets.default_roas ?? "—"))}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("thresholds")}</h2>
        <dl>
          ${
            Object.entries(thresholds)
              .map(
                ([key, value]) =>
                  `<dt>${escapeHtml(enumLabel(key, "threshold"))}</dt><dd>${escapeHtml(String(value))}</dd>`,
              )
              .join("") || `<dd>${t("setupNeeded")}</dd>`
          }
        </dl>
      </section>
    </div>
  `;
}
