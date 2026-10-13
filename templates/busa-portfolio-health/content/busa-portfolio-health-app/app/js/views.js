import {
  contractById,
  contractInsight,
  DETAIL_MODES,
  detailUrl,
  els,
  escapeHtml,
  insights,
  isAtRisk,
  loadedNote,
  loadMore,
  money,
  pct,
  recordUrl,
  severityLabel,
  state,
  statusLabel,
  t,
} from "../app.js";

const CATEGORY_COLORS = ["#334155", "#19715c", "#9a6700", "#7c3aed", "#0369a1", "#b45309", "#be123c", "#4d7c0f"];
const VIEW_HINT = { contracts: "contractsHint", watchlist: "watchlistHint", concentration: "concentrationHint" };

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const fixed = (value, digits = 1) => Number(value ?? 0).toFixed(digits);
const matches = (values, query) =>
  !query || values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

const STATUS_TONE = { active: "", delinquent: "danger", completed: "positive" };
const SEVERITY_TONE = { high: "danger", watch: "warning", ok: "positive" };
const statusBadge = (status) =>
  `<span class="badge ${STATUS_TONE[status] || ""}">${escapeHtml(statusLabel(status))}</span>`;
const severityBadge = (severity) =>
  `<span class="badge ${SEVERITY_TONE[severity] || ""}">${escapeHtml(severityLabel(severity))}</span>`;
const flagBadge = (contract) =>
  contract.flagged ? ` <span class="badge warning flag-badge">${escapeHtml(t("flagged"))}</span>` : "";

// ── Sparkline ──────────────────────────────────────────────────────────────
let sparkSerial = 0;

function smoothPath(points) {
  if (points.length < 3) return `M ${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L ")}`;
  let d = `M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

// Catmull-Rom smoothed trend, filled with a fade of the line's own color.
function sparkline(values = []) {
  const series = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (series.length < 2) return "";
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const points = series.map((v, i) => [(i / (series.length - 1)) * 100, 28 - ((v - min) / span) * 24 - 2]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(2)},30 L ${points[0][0].toFixed(2)},30 Z`;
  const gradientId = `spark-fill-${++sparkSerial}`;
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
        <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gradientId})" stroke="none"></path>
    <path d="${linePath}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
  </svg>`;
}

const truncate = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries the watchlist,
// at-risk and contract counts). There is no server-side sum in the pinned SDK,
// so they are computed from the loaded contracts and the summary line says so
// while more contracts exist than are loaded.
function metricsBand() {
  const totals = insights().totals || {};
  const scope = loadedNote();
  return [
    [t("totalAum"), money(totals.total_aum)],
    [t("totalCollected"), money(totals.total_collected)],
    [t("weightedAvgProgress"), `${fixed(totals.weighted_avg_progress_pct)}%`],
  ]
    .map(
      ([label, value]) =>
        `<div${scope ? ` title="${escapeHtml(scope)}"` : ""}><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`,
    )
    .join("");
}

function allocationCard() {
  const allocation = insights().concentration_by_category || [];
  if (!allocation.length) return "";
  // Thin transparent gaps between slices read cleaner than abutting wedges;
  // gapPct is in the same percentage-of-circle units as the weights.
  const gapPct = 0.6;
  let acc = 0;
  const gradientStops = allocation
    .map((item, index) => {
      const start = acc;
      const width = Math.max(0, Number(item.weight_pct || 0) - gapPct);
      acc += Number(item.weight_pct || 0);
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      return `${color} ${start.toFixed(2)}% ${(start + width).toFixed(2)}%, transparent ${(start + width).toFixed(2)}% ${acc.toFixed(2)}%`;
    })
    .join(", ");
  const legend = allocation
    .map(
      (item, index) => `
      <a class="alloc-legend-row" href="${recordUrl(item.key, "concentration")}">
        <span class="alloc-swatch" style="background:${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}"></span>
        <span class="alloc-name">${escapeHtml(item.key)}</span>
        <span class="alloc-weight">${fixed(item.weight_pct)}%</span>
        <span class="alloc-value">${money(item.funding_amount)}</span>
      </a>`,
    )
    .join("");
  const top = allocation[0];
  return `
    <div class="card overview-panel">
      <h2>${t("concentrationByCategory")}</h2>
      <div class="alloc-body">
        <div class="alloc-donut" style="background:conic-gradient(${gradientStops})" aria-hidden="true"><span class="alloc-donut-hole"><span class="alloc-donut-figure">${fixed(top.weight_pct, 0)}%</span><span class="alloc-donut-caption">${escapeHtml(truncate(top.key, 12))}</span></span></div>
        <div class="alloc-legend">${legend}</div>
      </div>
    </div>`;
}

function laggingCard() {
  const rows = [...(insights().progress || [])]
    .filter((row) => row.severity !== "ok")
    .sort((a, b) => b.lag_pp - a.lag_pp)
    .slice(0, 8);
  const body = rows.length
    ? rows
        .map(
          (row) => `
        <a class="lag-row" href="${recordUrl(row.id, "contracts")}">
          ${severityBadge(row.severity)}
          <span class="lag-name"><strong>${escapeHtml(row.business_name)}</strong><small>${escapeHtml(row.category)}</small></span>
          <span class="lag-figures">${t("expectedProgress")} ${fixed(row.expected_pct, 0)}% · ${t("actualProgress")} ${fixed(row.actual_pct, 0)}%</span>
          <span class="lag-value">${fixed(row.lag_pp, 0)}pp</span>
        </a>`,
        )
        .join("")
    : `<div class="empty-inline">${t("watchlistEmpty")}</div>`;
  return `<div class="card overview-panel"><h2>${t("laggingContracts")}</h2><div class="lag-list">${body}</div></div>`;
}

export function renderOverview() {
  const snapshot = state.snapshot;
  const generated = snapshot?.generated_at ? new Date(snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = [
    snapshot?.fund_name,
    generated ? `${t("generated")} ${generated}` : "",
    loadedNote(),
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  document.getElementById("overviewBody").innerHTML = `
    <section class="overview-grid">
      ${allocationCard()}
      ${laggingCard()}
    </section>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}" aria-sort="${active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none"}">${escapeHtml(label)}${arrow}</th>`;
}

// Loaded contracts with their lag/severity merged in.
function contractsWithProgress() {
  const progressById = new Map((insights().progress || []).map((row) => [row.id, row]));
  return state.contracts.map((c) => ({ ...c, ...progressById.get(c.id), flagged: c.flagged }));
}

function contractRows() {
  const query = state.route.query.trim().toLowerCase();
  return contractsWithProgress().filter((c) => {
      if (state.route.filter === "at_risk" && !isAtRisk(c, c)) return false;
      if (state.route.filter === "flagged" && !c.flagged) return false;
    return matches([c.business_name, c.category, c.city, statusLabel(c.status)], query);
  });
}

function sortedContracts(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function contractsTable(rows) {
  return `
    <table class="ws-table contracts-table">
      <thead><tr>
        ${sortHeader("business_name", t("business"))}
        ${sortHeader("category", t("category"))}
        ${sortHeader("city", t("city"))}
        ${sortHeader("funding_amount", t("fundingAmount"), "ws-col-num")}
        ${sortHeader("actual_pct", t("actualProgress"), "ws-col-num")}
        ${sortHeader("lag_pp", t("lag"), "ws-col-num ws-split-keep")}
        ${sortHeader("status", t("status"), "ws-col-narrow")}
      </tr></thead>
      <tbody>
        ${sortedContracts(rows)
          .map(
            (c) => `${rowOpen(c.id)}
          <td title="${escapeHtml(c.business_name)}"><span class="strong">${escapeHtml(c.business_name)}</span>${flagBadge(c)}</td>
          <td>${escapeHtml(c.category)}</td>
          <td>${escapeHtml(c.city)}</td>
          <td class="ws-col-num">${money(c.funding_amount, c.currency)}</td>
          <td class="ws-col-num">${fixed(c.actual_pct)}%</td>
          <td class="ws-col-num ws-split-keep ${(c.lag_pp ?? 0) > 0 ? "negative" : ""}">${fixed(c.lag_pp)}pp</td>
          <td class="ws-col-narrow">${statusBadge(c.status)}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function watchlistRows() {
  const query = state.route.query.trim().toLowerCase();
  return (insights().watchlist || [])
    .map((row) => ({ ...row, flagged: Boolean(contractById(row.id)?.flagged) }))
    .filter((row) => matches([row.business_name, row.category, row.city], query));
}

function watchlistTable(rows) {
  return `
    <table class="ws-table watchlist-table">
      <thead><tr>
        <th>${escapeHtml(t("business"))}</th>
        <th class="ws-col-num">${escapeHtml(t("decline"))}</th>
        <th class="trend-col">${escapeHtml(t("trend"))}</th>
        <th class="ws-col-num">${escapeHtml(t("recentRevenue"))}</th>
        <th>${escapeHtml(t("category"))}</th>
        <th>${escapeHtml(t("city"))}</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `${rowOpen(row.id)}
          <td title="${escapeHtml(row.business_name)}"><span class="strong">${escapeHtml(row.business_name)}</span>${flagBadge(row)}</td>
          <td class="ws-col-num negative">${pct(row.decline_pct)}</td>
          <td class="trend-col"><span class="spark-wrap negative">${sparkline(row.monthly_revenue)}</span></td>
          <td class="ws-col-num">${money(row.recent_revenue)}</td>
          <td>${escapeHtml(row.category)}</td>
          <td>${escapeHtml(row.city)}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function bucketRows() {
  const query = state.route.query.trim().toLowerCase();
  const key = state.route.by === "city" ? "concentration_by_city" : "concentration_by_category";
  return (insights()[key] || []).filter((row) => matches([row.key], query));
}

function concentrationTable(rows) {
  const max = Math.max(1, ...rows.map((row) => Number(row.weight_pct || 0)));
  return `
    <table class="ws-table concentration-table">
      <thead><tr>
        <th>${escapeHtml(t(state.route.by === "city" ? "city" : "category"))}</th>
        <th class="ws-col-wide">${escapeHtml(t("weight"))}</th>
        <th class="ws-col-num">${escapeHtml(t("fundingAmount"))}</th>
        <th class="ws-col-num">${escapeHtml(t("contractsTitle"))}</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `${rowOpen(row.key)}
          <td title="${escapeHtml(row.key)}"><span class="strong">${escapeHtml(row.key)}</span></td>
          <td class="ws-col-wide"><span class="weight-cell"><span class="weight-bar"><span style="width:${((Number(row.weight_pct || 0) / max) * 100).toFixed(1)}%"></span></span><span class="weight-value">${fixed(row.weight_pct)}%</span></span></td>
          <td class="ws-col-num">${money(row.funding_amount)}</td>
          <td class="ws-col-num">${row.contract_count}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function segmented(items, attribute, current) {
  return items
    .map(
      ([value, label, count]) =>
        `<button type="button" class="segment${value === current ? " active" : ""}" data-${attribute}="${value}" aria-pressed="${value === current}">${escapeHtml(label)}${count == null ? "" : ` <b>${count}</b>`}</button>`,
    )
    .join("");
}

// Every view here is derived from the loaded contracts, so each list carries
// the same Load More while more exist.
function loadMoreFooter() {
  if (!loadMore.partial() && !loadMore.error) return "";
  return `<div class="list-footer">
    <span>${escapeHtml(loadedNote())}</span>
    ${loadMore.partial() ? `<button type="button" class="button" data-load-more ${loadMore.loading ? "disabled" : ""}>${escapeHtml(loadMore.loading ? t("loadingMore") : t("loadMore"))}</button>` : ""}
    ${loadMore.error ? `<span class="list-error" role="alert">${escapeHtml(loadMore.error)}</span>` : ""}
  </div>`;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view === "contracts" ? "contractsTitle" : `${view}Title`);
  els.viewTitle.title = t(VIEW_HINT[view]);
  let items;
  let table;
  if (view === "contracts") {
    items = contractRows();
    table = contractsTable(items);
    const all = contractsWithProgress();
    els.viewFilters.innerHTML = segmented(
      [
        ["all", t("all"), null],
        ["at_risk", t("filterAtRisk"), all.filter((c) => isAtRisk(c, c)).length],
        ["flagged", t("filterFlagged"), all.filter((c) => c.flagged).length],
      ],
      "filter",
      state.route.filter,
    );
  } else if (view === "watchlist") {
    items = watchlistRows();
    table = watchlistTable(items);
    els.viewFilters.innerHTML = "";
  } else {
    items = bucketRows();
    table = concentrationTable(items);
    els.viewFilters.innerHTML = segmented(
      [
        ["category", t("byCategory"), null],
        ["city", t("byCity"), null],
      ],
      "by",
      state.route.by,
    );
  }
  els.viewFilters.hidden = !els.viewFilters.innerHTML;
  els.viewCount.textContent = `${items.length}${loadMore.partial() ? "+" : ""}`;
  const empty =
    view === "watchlist" && !state.route.query
      ? emptyState(t("watchlistEmpty"))
      : emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${loadMoreFooter()}`;
  renderDetail();
}

// ── Detail (one markup for drawer, split and full page) ────────────────────
function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectWatchlist")) : "";
    return;
  }
  if (view === "concentration") {
    els.detailBody.innerHTML = bucketDetail(selectedId);
    return;
  }
  const contract = contractById(selectedId);
  if (!contract) {
    els.detailBody.innerHTML =
      contract === undefined
        ? `<div class="empty-inline">${t("loading")}</div>`
        : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = contractDetail(contract);
}

function contractDetail(c) {
  const { progress, watch } = contractInsight(c);
  const disabled = state.busy ? "disabled" : "";
  const recent = (c.monthly_revenue || []).at?.(-1);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(c.business_name)}</h2>
      <p class="muted">${escapeHtml([c.category, c.city].filter(Boolean).join(" · "))}</p>
      <div class="detail-badges">${statusBadge(c.status)}${severityBadge(progress.severity)}${flagBadge(c)}</div>
    </header>
    ${state.notice ? `<div class="notice-banner" role="alert">${escapeHtml(state.notice)}</div>` : ""}
    <div class="detail-figures">
      <div><span>${t("fundingAmount")}</span><strong>${money(c.funding_amount, c.currency)}</strong></div>
      <div><span>${t("capAmount")}</span><strong>${money(c.cap_amount, c.currency)}</strong></div>
      <div><span>${t("cumulativeRepayment")}</span><strong>${money(c.cumulative_repayment, c.currency)}</strong></div>
      <div><span>${t("lag")}</span><strong class="${(progress.lag_pp ?? 0) > 0 ? "negative" : ""}">${fixed(progress.lag_pp)}pp</strong></div>
    </div>
    <section class="detail-section">
      <h3>${t("revenueTrend")}</h3>
      <div class="spark-wrap detail-spark ${watch ? "negative" : ""}">${sparkline(c.monthly_revenue)}</div>
      <p class="muted">${recent != null ? `${t("recentRevenue")}: ${money(recent, c.currency)}` : ""}${watch ? ` · ${t("revenueDecline")} <span class="negative">${pct(watch.decline_pct)}</span>` : ""}</p>
    </section>
    <section class="detail-section review-panel">
      <h3>${t("reviewNote")}</h3>
      <textarea id="reviewNote" rows="3" placeholder="${escapeHtml(t("reviewNote"))}" ${disabled}>${escapeHtml(c.note || "")}</textarea>
      <div class="detail-actions">
        <button type="button" class="button${c.flagged ? "" : " primary"}" data-action="toggle-flag" data-id="${escapeHtml(c.id)}" ${disabled}>${escapeHtml(c.flagged ? t("clearFlag") : t("flagForReview"))}</button>
        <button type="button" class="button" data-action="save-note" data-id="${escapeHtml(c.id)}" ${disabled}>${escapeHtml(t("saveNote"))}</button>
      </div>
    </section>
    <section class="detail-section">
      <h3>${t("keyFacts")}</h3>
      <dl class="detail-facts">
        <dt>${t("originationDate")}</dt><dd>${escapeHtml(c.origination_date || "—")}</dd>
        <dt>${t("monthsSince")}</dt><dd>${c.months_since_origination}</dd>
        <dt>${t("term")}</dt><dd>${c.expected_term_months}</dd>
        <dt>${t("capMultiple")}</dt><dd>${fixed(c.cap_multiple, 2)}×</dd>
        <dt>${t("expectedProgress")}</dt><dd>${fixed(progress.expected_pct)}%</dd>
        <dt>${t("actualProgress")}</dt><dd>${fixed(progress.actual_pct)}%</dd>
      </dl>
    </section>`;
}

function bucketDetail(key) {
  const by = state.route.by;
  const listKey = by === "city" ? "concentration_by_city" : "concentration_by_category";
  const bucket = (insights()[listKey] || []).find((row) => row.key === key);
  const members = state.contracts
    .filter((c) => c.status !== "completed" && c[by] === key)
    .map((c) => ({ ...c, ...contractInsight(c).progress, flagged: c.flagged }))
    .sort((a, b) => b.funding_amount - a.funding_amount);
  if (!bucket || !members.length) return emptyState(key, t("bucketMissing"));
  return `
    <header class="detail-head">
      <h2>${escapeHtml(key)}</h2>
      <p class="muted">${fixed(bucket.weight_pct)}% ${t("ofAum")} · ${money(bucket.funding_amount)} · ${bucket.contract_count} ${t("contracts")}${loadedNote() ? ` · ${escapeHtml(loadedNote())}` : ""}</p>
    </header>
    <section class="detail-section">
      <h3>${t("contractsInBucket")}</h3>
      <div class="bucket-list">
        ${members
          .map(
            (c) => `
          <a class="bucket-row" href="${recordUrl(c.id, "contracts")}">
            <span class="bucket-name"><strong>${escapeHtml(c.business_name)}</strong>${flagBadge(c)}</span>
            <span class="bucket-num">${money(c.funding_amount, c.currency)}</span>
            <span class="bucket-num ${(c.lag_pp ?? 0) > 0 ? "negative" : ""}">${fixed(c.lag_pp)}pp</span>
            ${statusBadge(c.status)}
          </a>`,
          )
          .join("")}
      </div>
    </section>`;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const policy = summary.risk_policy || {};
  document.getElementById("settingsInfo").innerHTML = `
    ${state.settings?.settings_error ? `<div class="notice-banner" role="alert">${escapeHtml(t("settingsReadFailed"))}</div>` : ""}
    <section class="card">
      <h2>${t("viewsHelp")}</h2>
      <dl>
        <dt>${t("contractsTitle")}</dt><dd>${escapeHtml(t("contractsHint"))}</dd>
        <dt>${t("watchlistTitle")}</dt><dd>${escapeHtml(t("watchlistHint"))}</dd>
        <dt>${t("concentrationTitle")}</dt><dd>${escapeHtml(t("concentrationHint"))}</dd>
      </dl>
    </section>
    <section class="card">
      <h2>${t("configuration")}</h2>
      <dl>
        <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
        <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "—")}</dd>
        <dt>${t("fundName")}</dt><dd>${escapeHtml(summary.fund_name || "—")}</dd>
        <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
        <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
      </dl>
    </section>
    <section class="card">
      <h2>${t("riskPolicy")}</h2>
      <dl>
        <dt>${t("lagWatch")}</dt><dd>${policy.lag_watch_pp ?? "—"}</dd>
        <dt>${t("lagHigh")}</dt><dd>${policy.lag_high_pp ?? "—"}</dd>
        <dt>${t("revenueDeclineThreshold")}</dt><dd>${policy.revenue_decline_pct ?? "—"}</dd>
      </dl>
    </section>`;
}
