import {
  DETAIL_MODES,
  activeLang,
  baseOf,
  detailUrl,
  els,
  entities,
  escapeHtml,
  filteredRows,
  isPartial,
  items,
  recordById,
  recordUrl,
  state,
  t,
  viewLabel,
} from "../app.js";

// ── Small display helpers ───────────────────────────────────────────────────

// Stored option values are snake_case ids (`internal_management`); a reader
// should never see them. Known ids get a translated label, anything else a
// humanized one.
const OPTION_LABELS = {
  internal_management: { en: "Internal management", zh: "内部管理" },
  internal_then_external_review: { en: "Internal, external after review", zh: "先内部，外用需复核" },
  internal: { en: "Internal", zh: "内部" },
  public: { en: "Public", zh: "公开" },
  last_12_months: { en: "Last 12 months", zh: "近 12 个月" },
  last_6_months: { en: "Last 6 months", zh: "近 6 个月" },
  last_quarter: { en: "Last quarter", zh: "上一季度" },
  all_time: { en: "All time", zh: "全部时间" },
  management: { en: "Management", zh: "经营" },
  privacy: { en: "Privacy", zh: "隐私" },
  legal: { en: "Legal", zh: "法律" },
  brand: { en: "Brand", zh: "品牌" },
  low: { en: "Low", zh: "低" },
  medium: { en: "Medium", zh: "中" },
  high: { en: "High", zh: "高" },
  info: { en: "Info", zh: "提示" },
  warning: { en: "Warning", zh: "警告" },
  error: { en: "Error", zh: "错误" },
  critical: { en: "Critical", zh: "严重" },
  prepare: { en: "Prepared", zh: "已准备" },
  update: { en: "Updated", zh: "已更新" },
  decision: { en: "Decision", zh: "复核决定" },
  demo_seed: { en: "Demo data", zh: "演示数据" },
};

export function optionLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const known = OPTION_LABELS[raw];
  if (known) return activeLang() === "zh" ? known.zh : known.en;
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)) return raw;
  const words = raw.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const METRIC_LABEL_KEYS = { case_count: "cases", lawyer_count: "lawyers", public_citable: "publicCitable" };
const metricLabel = (key) => (METRIC_LABEL_KEYS[key] ? t(METRIC_LABEL_KEYS[key]) : optionLabel(key));

const STATUS_TONE = {
  needs_review: "active",
  changes_requested: "warning",
  approved: "positive",
  done: "positive",
  blocked: "danger",
  pass: "positive",
  warn: "warning",
  fail: "danger",
};

export function statusLabel(status) {
  const labels = {
    needs_review: t("needsReview"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
    pass: t("pass"),
    warn: t("warn"),
    fail: t("fail"),
  };
  return labels[status] || optionLabel(status);
}

const statusBadge = (status) =>
  status ? `<span class="badge ${STATUS_TONE[status] || ""}">${escapeHtml(statusLabel(status))}</span>` : "";

const chip = (value) => (value ? `<span class="chip">${escapeHtml(value)}</span>` : "");

export function field(item, key, fallback = "") {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : item?.metrics;
  return fields?.[key] ?? item?.[key] ?? fallback;
}

export function listValue(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(String);
  if (typeof value === "string" && value.trim()) return value.split(/\s*[;；]\s*/).filter(Boolean);
  return [];
}

export function sumField(key) {
  return items().reduce((sum, item) => sum + (Number(field(item, key, 0)) || 0), 0);
}

export function percentText(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${Math.round((number > 1 ? number : number * 100) * 10) / 10}%`;
}

function fieldTile(label, value) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  return `<div class="field-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display === 0 ? "0" : display || "—")}</strong></div>`;
}

function emptyState(text) {
  return `<div class="empty-state"><p>${escapeHtml(text)}</p></div>`;
}

export function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

function noticeBanner() {
  return state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : "";
}

// ── Overview ────────────────────────────────────────────────────────────────

// A summed metric over a partially loaded Base is labelled as such: the pinned
// SDK has no records.groupBy aggregate to make it exact.
function summed(stored, key) {
  if (stored !== undefined && stored !== null && stored !== "") return { value: String(stored) };
  const partial = isPartial("items");
  return { value: `${sumField(key)}${partial ? "+" : ""}`, title: partial ? t("loadedOnly") : "" };
}

function metricCell(label, { value, title = "" }) {
  return `<div${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function practiceBarHtml(entity) {
  const size = Number(field(entity, "case_count", field(entity, "sample_size", 0))) || 0;
  const width = Math.max(6, Math.min(100, size * 2));
  return `<a class="practice-bar" href="${recordUrl(entity.id, "entities")}">
    <div><strong>${escapeHtml(entity.title)}</strong><span>${escapeHtml(entity.meta || "")}</span></div>
    <div class="bar"><span style="width:${width}%"></span></div>
    <b>${escapeHtml(size)}</b>
  </a>`;
}

function trendChart(points) {
  const values = points.map((point) => {
    const value = Number(point.win_rate) || 0;
    return value > 1 ? value / 100 : value;
  });
  const width = 280;
  const height = 96;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = values.map((value, index) => `${Math.round(index * step)},${Math.round(height - value * height)}`);
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("outcomeTrends"))}">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords.join(" ")}" />
    ${values
      .map(
        (value, index) =>
          `<circle cx="${Math.round(index * step)}" cy="${Math.round(height - value * height)}" r="3" fill="currentColor" />`,
      )
      .join("")}
  </svg>`;
}

// Outcome trends: only seeded via metrics.outcome_trends; hidden otherwise.
function outcomeTrendsCard() {
  const trends = state.snapshot?.metrics?.outcome_trends || [];
  if (!trends.length) return "";
  return `<section class="card trends-card">
    <div class="panel-head"><h2>${escapeHtml(t("outcomeTrends"))}</h2></div>
    ${trendChart(trends)}
    <div class="trend-legend">${trends
      .map((point) => `<span><b>${escapeHtml(point.period)}</b>${escapeHtml(percentText(point.win_rate))}</span>`)
      .join("")}</div>
  </section>`;
}

export function renderOverview() {
  const metrics = state.snapshot.metrics || {};
  const profiles = entities();
  const review = items()
    .filter((item) => item.status === "needs_review")
    .slice(0, 5);
  els.overviewTitle.textContent = t("appTitle");
  els.overviewLead.textContent = t("overviewLead");
  els.overviewAction.textContent = t("openReviewQueue");
  // Three numbers the nav does not already show.
  els.overviewMetrics.innerHTML = [
    metricCell(t("metricCases"), summed(metrics.case_samples, "sample_size")),
    metricCell(t("metricLawyers"), summed(metrics.lawyers_profiled, "lawyer_count")),
    metricCell(t("metricPublic"), summed(metrics.public_citable, "public_citable")),
  ].join("");
  els.overviewBody.innerHTML = `
    ${lockBanner()}
    <div class="overview-grid">
      <div class="overview-col">
      <section class="card practice-card">
        <div class="panel-head"><h2>${escapeHtml(t("practiceMix"))}</h2><a href="#/entities">${escapeHtml(t("viewAll"))}</a></div>
        <div class="practice-bars">${profiles.map(practiceBarHtml).join("") || emptyState(t("empty"))}</div>
        <div class="proof-grid">${items()
          .map(
            (item) =>
              `<a href="${recordUrl(item.id, "items")}"><span>${escapeHtml(item.category || "")}</span><strong>${escapeHtml(optionLabel(field(item, "visibility", "")) || "—")}</strong><small>${escapeHtml(item.title)}</small></a>`,
          )
          .join("")}</div>
      </section>
      <section class="card">
        <div class="panel-head"><h2>${escapeHtml(t("reviewQueue"))}</h2><a href="#/review">${escapeHtml(t("viewAll"))}</a></div>
        <div class="queue-list">${
          review
            .map(
              (item) =>
                `<a class="queue-row" href="${recordUrl(item.id, "review")}"><span class="queue-ref">${escapeHtml(item.ref || "")}</span><strong>${escapeHtml(item.title)}</strong>${chip(item.category)}</a>`,
            )
            .join("") || emptyState(t("empty"))
        }</div>
      </section>
      </div>
      <div class="overview-col">
        ${outcomeTrendsCard()}
        <section class="card">
          <div class="panel-head"><h2>${escapeHtml(t("talentSignals"))}</h2></div>
          ${
            profiles
              .map(
                (entity) =>
                  `<div class="signal-row"><b>${escapeHtml(entity.title)}</b><span>${escapeHtml(field(entity, "lawyer_count", field(entity, "lawyers", 0)))} ${escapeHtml(t("lawyersSuffix"))}</span></div>`,
              )
              .join("") || emptyState(t("empty"))
          }
        </section>
      <section class="card">
        <div class="panel-head"><h2>${escapeHtml(t("activity"))}</h2><span>${escapeHtml(t("generated"))}: ${escapeHtml(dateTime(state.snapshot.generated_at))}</span></div>
        <div class="activity-list">${(state.snapshot.activity_log || [])
          .slice(0, 5)
          .map((entry) => `<div><b>${escapeHtml(optionLabel(entry.action))}</b><span>${escapeHtml(entry.detail || "")}</span></div>`)
          .join("")}</div>
      </section>
      </div>
    </div>`;
}

// ── Record views ────────────────────────────────────────────────────────────

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const numCell = (value) => cell(value === undefined || value === null || value === "" ? "—" : escapeHtml(value), "", "ws-col-num");

function itemsTable(list) {
  return `<table class="ws-table insights-table">
    ${tableHead([[t("insight")], [t("status"), "status-col"]])}
    <tbody>${list
      .map(
        (item) => `${rowOpen(item.id)}
          ${cell(`<span class="strong">${escapeHtml(item.title || item.ref)}</span>`, [item.ref, item.title].filter(Boolean).join(" · "))}
          ${cell(statusBadge(item.status), "", "status-col")}
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function insightTitle(id) {
  const item = recordById("items", id);
  if (item) return item.title || item.ref;
  return "";
}

function checksTable(list) {
  return `<table class="ws-table checks-table">
    ${tableHead([[t("check")], [t("status"), "status-col"], [t("severity"), "ws-col-narrow"], [t("linkedInsight"), "ws-col-wide"], [t("detail")]])}
    <tbody>${list
      .map((check) => {
        const linked = insightTitle(check.item_id);
        return `${rowOpen(check.id)}
          ${cell(`<span class="strong">${escapeHtml(check.label)}</span>`, check.label)}
          ${cell(statusBadge(check.status), "", "status-col")}
          ${cell(escapeHtml(optionLabel(check.severity)), "", "ws-col-narrow")}
          ${cell(linked ? escapeHtml(linked) : check.item_id ? `<span class="muted">${escapeHtml(t("notLoaded"))}</span>` : "", linked, "ws-col-wide")}
          ${cell(`<span class="muted">${escapeHtml(check.detail || "")}</span>`, check.detail)}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function entitiesTable(list) {
  return `<table class="ws-table entities-table">
    ${tableHead([[t("profile")], [t("status"), "status-col"], [t("coverage"), "ws-col-wide"], [t("owner")], [t("cases"), "ws-col-num"], [t("lawyers"), "ws-col-num"], [t("publicCitable"), "ws-col-num"]])}
    <tbody>${list
      .map(
        (entity) => `${rowOpen(entity.id)}
          ${cell(`<span class="strong">${escapeHtml(entity.title)}</span>`, entity.title)}
          ${cell(statusBadge(entity.status), "", "status-col")}
          ${cell(escapeHtml(entity.meta || ""), entity.meta, "ws-col-wide")}
          ${cell(escapeHtml(entity.owner || ""), entity.owner)}
          ${numCell(entity.metrics?.case_count)}
          ${numCell(entity.metrics?.lawyer_count)}
          ${numCell(entity.metrics?.public_citable)}
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button class="button" type="button" data-load-more="${escapeHtml(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${escapeHtml(state.loadingMore[key] ? t("loadingMore") : t("loadMore"))}</button>${state.loadMoreError[key] ? `<span role="alert">${escapeHtml(t("loadMoreFailed"))}</span>` : ""}</div>`;
}

export function renderRecordView() {
  const { view } = state.route;
  const key = baseOf(view);
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(`${view}Hint`);
  const list = filteredRows(view);
  els.viewCount.textContent = `${list.length}${isPartial(key) ? "+" : ""}`;
  const table = key === "items" ? itemsTable(list) : key === "checks" ? checksTable(list) : entitiesTable(list);
  els.listPanel.innerHTML = `${list.length ? table : emptyState(state.route.query ? t("noMatches") : t("empty"))}${loadMoreControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const key = baseOf(view);
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.textContent = t("openFullPage");
  // On a phone every mode already is a full page.
  els.detailExpand.hidden = !selectedId || presentation === "page" || phone;
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailBar.hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[key] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectInsight"))}</div>` : "";
    return;
  }
  const record = recordById(key, selectedId);
  if (!record) {
    const pending = state.extra[key]?.has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending ? `<div class="ws-detail-empty">${escapeHtml(t("loading"))}</div>` : emptyState(t("recordMissing"));
    return;
  }
  els.detailBody.innerHTML = key === "items" ? itemDetail(record) : key === "checks" ? checkDetail(record) : entityDetail(record);
}

function itemDetail(item) {
  const noteValue = state.edits.note[item.id] ?? item.review_note ?? "";
  const draftValue = state.edits.draft[item.id] ?? item.draft ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const risk = (item.risk || []).map(optionLabel).join(", ");
  return `
    ${lockBanner()}
    ${noticeBanner()}
    <article class="record-detail">
      <header class="record-head">
        ${item.ref ? `<div class="record-meta">${escapeHtml(item.ref)}</div>` : ""}
        <h2>${escapeHtml(item.title)}</h2>
        <div class="record-status">${statusBadge(item.status)}</div>
      </header>
      <div class="decision-bar">
        <button class="button primary" type="button" data-action="approve" data-id="${escapeHtml(item.id)}" ${disabled}>${escapeHtml(t("approve"))}</button>
        <button class="button" type="button" data-action="request_changes" data-id="${escapeHtml(item.id)}" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
        <button class="button danger" type="button" data-action="block" data-id="${escapeHtml(item.id)}" ${disabled}>${escapeHtml(t("block"))}</button>
      </div>
      ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ""}
      <dl class="meta">
        <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(item.owner || "—")}</dd></div>
        <div><dt>${escapeHtml(t("category"))}</dt><dd>${escapeHtml(item.category || "—")}</dd></div>
        <div><dt>${escapeHtml(t("risk"))}</dt><dd>${escapeHtml(risk || "—")}</dd></div>
        <div><dt>${escapeHtml(t("period"))}</dt><dd>${escapeHtml(optionLabel(field(item, "period", "")) || "—")}</dd></div>
      </dl>
      ${item.body ? `<section><h3>${escapeHtml(t("context"))}</h3><p>${escapeHtml(item.body)}</p></section>` : ""}
      ${item.recommendation ? `<section><h3>${escapeHtml(t("recommendation"))}</h3><p>${escapeHtml(item.recommendation)}</p></section>` : ""}
      <section class="analytics">
        <h3>${escapeHtml(t("managementAnalytics"))}</h3>
        <div class="field-grid">
          ${fieldTile(t("sampleSize"), field(item, "sample_size", ""))}
          ${fieldTile(t("publicCitable"), field(item, "public_citable", ""))}
          ${fieldTile(t("lawyers"), field(item, "lawyer_count", ""))}
          ${fieldTile(t("visibility"), optionLabel(field(item, "visibility", "")))}
        </div>
        ${listSection(t("qualityIndicators"), listValue(field(item, "quality_indicators", item.evidence || [])))}
      </section>
      ${listSection(t("evidence"), item.evidence || [])}
      <label class="field"><span>${escapeHtml(t("editableDraft"))}</span><textarea data-draft="${escapeHtml(item.id)}">${escapeHtml(draftValue)}</textarea></label>
      <label class="field"><span>${escapeHtml(t("reviewNote"))}</span><textarea data-note="${escapeHtml(item.id)}">${escapeHtml(noteValue)}</textarea></label>
      <div><button class="button" type="button" data-action="revise" data-id="${escapeHtml(item.id)}" ${disabled}>${escapeHtml(t("saveRevision"))}</button></div>
    </article>`;
}

function listSection(title, values) {
  const list = listValue(values);
  if (!list.length) return "";
  return `<section><h3>${escapeHtml(title)}</h3><ul class="plain-list">${list.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`;
}

function checkDetail(check) {
  const linked = recordById("items", check.item_id);
  const linkedHtml = linked
    ? `<a href="${recordUrl(linked.id, "items")}">${escapeHtml(linked.title || linked.ref)}</a>`
    : check.item_id
      ? `<span class="muted">${escapeHtml(t("notLoaded"))}</span>`
      : "—";
  return `<article class="record-detail">
    <header class="record-head">
      <h2>${escapeHtml(check.label)}</h2>
      <div class="record-status">${statusBadge(check.status)}</div>
    </header>
    ${check.detail ? `<p class="summary">${escapeHtml(check.detail)}</p>` : ""}
    <dl class="meta">
      <div><dt>${escapeHtml(t("severity"))}</dt><dd>${escapeHtml(optionLabel(check.severity) || "—")}</dd></div>
      <div><dt>${escapeHtml(t("linkedInsight"))}</dt><dd>${linkedHtml}</dd></div>
    </dl>
  </article>`;
}

function entityDetail(entity) {
  const metrics = Object.entries(entity.metrics || {});
  return `<article class="record-detail">
    <header class="record-head">
      ${entity.meta ? `<div class="record-meta">${escapeHtml(entity.meta)}</div>` : ""}
      <h2>${escapeHtml(entity.title)}</h2>
      <div class="record-status">${statusBadge(entity.status)}</div>
    </header>
    ${entity.summary ? `<p class="summary">${escapeHtml(entity.summary)}</p>` : ""}
    <dl class="meta">
      <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(entity.owner || "—")}</dd></div>
    </dl>
    ${metrics.length ? `<div class="field-grid three">${metrics.map(([key, value]) => fieldTile(metricLabel(key), value)).join("")}</div>` : ""}
    ${(entity.tags || []).length ? `<section><h3>${escapeHtml(t("tags"))}</h3><div class="chips">${entity.tags.map(chip).join("")}</div></section>` : ""}
  </article>`;
}

// ── Settings ────────────────────────────────────────────────────────────────

export function renderSettings() {
  els.settingsTitle.textContent = t("settings");
  els.settingsTitle.title = t("settingsHint");
  const blocks = [
    [t("config"), state.settings?.config_summary || {}],
    [t("onboarding"), state.settings?.onboarding || {}],
    [t("executionReport"), state.settings?.execution_report || {}],
  ];
  // Keep the accent picker (mounted by accent-theme.js) across re-renders.
  els.settingsContent.querySelectorAll("[data-settings-block]").forEach((node) => node.remove());
  els.settingsContent.insertAdjacentHTML(
    "afterbegin",
    blocks
      .map(
        ([title, value]) =>
          `<section class="card settings-card" data-settings-block><h2>${escapeHtml(title)}</h2><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></section>`,
      )
      .join(""),
  );
}

