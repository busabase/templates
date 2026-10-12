import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { SOURCE_KINDS, computeMetrics } from "./js/picks-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderRecordView, renderSettings, submitDecision } from "./js/selection-views.js";

// Where a record opens, per view. Chosen by what people do with the record:
//   candidates → page:   a candidate is a workplace — margin calculator,
//                        competition read, evidence and the verdict — you stay.
//   trends     → drawer: a trend signal is a fact you scan many of, read, maybe
//                        promote, and return to the feed.
//   decisions  → split:  the proposal queue is worked top to bottom, one
//                        develop/watch/drop proposal after the next.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once per Base, in config.js `ui.detail_modes`.
export const VIEW_BASE = { candidates: "candidates", trends: "trend-items", decisions: "proposals" };
export const DETAIL_MODES = Object.fromEntries(
  Object.entries(VIEW_BASE).map(([view, key]) => [view, appConfig.ui.detail_modes[key] || "drawer"]),
);
const RECORD_VIEWS = Object.keys(VIEW_BASE);
const ID_FIELD = { candidates: "candidate_id", trends: "trend_id", decisions: "proposal_id" };
const SNAPSHOT_KEY = { candidates: "candidates", trends: "trend_items", decisions: "proposals" };

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { candidates: new Map(), trends: new Map(), decisions: new Map() },
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-picks-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-picks.sidebarCollapsed";
const FEATURED_CANDIDATE_ID = "cand-lunchbox";
export { SOURCE_KINDS };

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewNotice: byId("viewNotice"),
  sourceSelect: byId("sourceSelect"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  settingsBody: byId("settingsBody"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  reviewCount: byId("count-review"),
  developCount: byId("count-develop"),
  watchCount: byId("count-watch"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot[key.replaceAll("-", "_")] = rows;
    state.snapshot.metrics = computeMetrics(state.snapshot);
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.notice = error instanceof Error ? error.message : String(error);
  },
});

export function recordTotal(key, fallback = 0) {
  return pagination.total(key, fallback);
}

export function isPartial(key) {
  return pagination.isPartial(key);
}

export function pagerControl(key) {
  return pagination.control(key);
}

/* ---------- Shell ---------- */

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

/* ---------- i18n / formatting ---------- */

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
}

export function pct(value) {
  return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

export function compactNumber(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

const validDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function date(value) {
  const parsed = validDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function dateTime(value) {
  const parsed = validDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/* ---------- Routing ---------- */
// `#/<view>[/<record>][?q=…&source=…&peek=…]`. Search, the trend source filter
// and the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.

export function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const source = params.get("source") || "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    source: view === "trends" && SOURCE_KINDS.includes(source) ? source : "",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "trends" && route.source) params.set("source", route.source);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view) => ({ view, query: "", source: "" });

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// changes should not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

/* ---------- Data ---------- */

export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = { candidates: new Map(), trends: new Map(), decisions: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-picks:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (recordById(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  render();
  try {
    const row = await provider.getRecord(VIEW_BASE[view], selectedId);
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "candidates"
      ? "#/candidates"
      : scenario === "detail"
        ? `#/candidates/${FEATURED_CANDIDATE_ID}`
        : scenario === "trends"
          ? "#/trends"
          : scenario === "decisions"
            ? "#/decisions"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function candidates() {
  return state.snapshot?.candidates || [];
}

export function trendItems() {
  return state.snapshot?.trend_items || [];
}

export function proposals() {
  return state.snapshot?.proposals || [];
}

function sources() {
  return state.snapshot?.sources || [];
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const rows = state.snapshot?.[SNAPSHOT_KEY[view]] || [];
  return rows.find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
}

export function candidateById(id) {
  return recordById("candidates", id);
}

export function proposalForCandidate(candidateId) {
  return proposals().find((item) => item.candidate_id === candidateId);
}

export function pickRef(proposalId) {
  const index = proposals().findIndex((item) => item.proposal_id === proposalId);
  return index >= 0 ? `${t("pick")} #${index + 1}` : "";
}

// A platform id (`amazon_us`) is configuration, not a name: show the
// configured platform's name, and the humanised id only if it is unknown.
export function platformName(platformId) {
  if (!platformId) return "";
  const platform = (state.settings?.config_summary?.platforms || []).find((item) => item.platform_id === platformId);
  return platform?.name || String(platformId).replaceAll("_", " ");
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function snapshotNow() {
  return Date.parse(state.snapshot?.generated_at || "") || Date.now();
}

function attentionCounts() {
  const now = snapshotNow();
  const review = proposals().filter((item) => item.status === "needs_review").length;
  const toReview = candidates().filter((item) => ["new", "reviewing"].includes(item.stage)).length;
  const develop = candidates().filter((item) => item.stage === "develop").length;
  const watching = candidates().filter((item) => item.stage === "watch").length;
  const awaitingHandoff = proposals().filter((item) => item.status === "approved").length;
  const staleWatches = candidates().filter(
    (item) => item.stage === "watch" && now - Date.parse(item.last_updated || 0) > 14 * 24 * 3600 * 1000,
  ).length;
  return { review, toReview, develop, watching, awaitingHandoff, staleWatches };
}

function renderShell() {
  applyI18n();
  const counts = attentionCounts();
  // Where the data comes from — the counts sit next to each nav item.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  els.syncStatus.title = state.settings?.demo ? t("demoNote") : "";
  if (els.reviewCount) els.reviewCount.textContent = counts.review;
  if (els.developCount) els.developCount.textContent = counts.develop;
  if (els.watchCount) els.watchCount.textContent = counts.watching;
  const navTotals = {
    candidates: recordTotal("candidates", candidates().length),
    trends: recordTotal("trend-items", trendItems().length),
    decisions: recordTotal("proposals", proposals().length),
  };
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = state.snapshot ? String(navTotals[node.dataset.navCount] ?? "") : "";
  });
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = counts.review
      ? `${counts.review} ${t("proposalsToReview")}`
      : `${navTotals.candidates} ${t("candidates").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "candidates") return t("candidates");
  if (view === "trends") return t("trends");
  if (view === "decisions") return t("decisions");
  if (view === "settings") return t("settings");
  return t("overview");
}

/* ---------- Shared fragments ---------- */

export function sourceBadge(kind) {
  if (!kind) return "";
  return `<span class="badge source ${escapeHtml(kind)}">${escapeHtml(enumLabel(kind, "source"))}</span>`;
}

export function stageBadge(stage) {
  return `<span class="badge stage-badge ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function statusBadge(status) {
  return `<span class="badge status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function gradeBadge(grade) {
  if (!grade) return "";
  return `<span class="badge grade grade-${escapeHtml(grade)}" title="${t("grade")}">${escapeHtml(grade)}</span>`;
}

export function verdictBadge(verdict) {
  return `<span class="badge verdict-badge ${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))}</span>`;
}

export function deltaArrow(delta) {
  const value = Number(delta || 0);
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}%</span>`;
}

export function sparkline(momentum = [], { width = 96, height = 26 } = {}) {
  if (!momentum.length) return "";
  const max = Math.max(...momentum);
  const min = Math.min(...momentum);
  const span = max - min || 1;
  const step = width / Math.max(momentum.length - 1, 1);
  const points = momentum
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function reviewBars(counts = []) {
  if (!counts.length) return "";
  const width = 320;
  const height = 96;
  const gap = 5;
  const barWidth = (width - gap * (counts.length - 1)) / counts.length;
  const max = Math.max(...counts) || 1;
  const bars = counts
    .map((value, index) => {
      const barHeight = Math.max((value / max) * (height - 18), 2);
      const x = index * (barWidth + gap);
      const y = height - 14 - barHeight;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2" class="${index === 0 ? "head" : ""}"><title>#${index + 1}: ${value.toLocaleString()}</title></rect>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle">${compactNumber(value)}</text>`;
    })
    .join("");
  return `<svg class="review-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("topReviewCounts")}">${bars}</svg>`;
}

export function lockBanner() {
  if (!isLocked()) return "";
  const lock = state.settings.lock;
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")} · ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function demoBanner() {
  return state.settings?.demo ? `<div class="demo-note">${t("demoNote")}</div>` : "";
}

/* ---------- Overview ---------- */
// Three numbers nothing else on screen shows: per-view totals sit next to the
// nav items and develop/watch/review counts in the attention block. All three
// are computed from the loaded candidates (no server aggregate in the pinned
// SDK for "new in the last 7 days" or an average over a JSON-encoded margin),
// so they say so while more candidates exist than are loaded.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const scope = isPartial("candidates") ? ` · ${t("loadedScope")}` : "";
  return [
    [t("newThisWeek"), String(metrics.candidates_new_7d ?? 0)],
    [t("avgMarginApproved"), pct(metrics.avg_margin_approved_pct)],
    [t("belowFloorMetric"), String(metrics.below_margin_floor ?? 0)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label + scope)}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  byId("overviewSummary").textContent = generated ? `${t("overviewLead")} ${t("generated")} ${generated}.` : t("empty");
  byId("overviewMetrics").innerHTML = metricsBand();
  const counts = attentionCounts();
  const movers = [...trendItems()].sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct)).slice(0, 5);
  byId("overviewBody").innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        <a class="attention-row" href="#/candidates">
          <span class="attention-count">${counts.toReview}</span>
          <span>${t("candidatesToReview")}</span>
        </a>
        <a class="attention-row" href="#/decisions">
          <span class="attention-count">${counts.awaitingHandoff}</span>
          <span>${t("awaitingHandoff")}</span>
        </a>
        <a class="attention-row" href="#/candidates">
          <span class="attention-count">${counts.staleWatches}</span>
          <span>${t("staleWatches")}</span>
        </a>
      </div>
      <div class="card overview-panel">
        <h2>${t("topMovers")}</h2>
        ${
          movers
            .map(
              (item) => `
          <a class="mover-row" href="${item.candidate_id ? recordUrl(item.candidate_id, "candidates") : recordUrl(item.trend_id, "trends")}">
            <span class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(enumLabel(item.source, "source"))} · ${escapeHtml(item.metric_label)} ${compactNumber(item.metric_value)}</small>
            </span>
            ${sparkline(item.momentum)}
            ${deltaArrow(item.delta_pct)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel wide">
        <h2>${t("sourceFreshness")}</h2>
        ${
          sources()
            .map(
              (item) => `
          <div class="freshness-row">
            <span class="row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(enumLabel(item.method, "method"))} · ${item.items_7d} ${t("itemsWeek")}</small>
            </span>
            ${sourceBadge(item.kind)}
            <span class="muted">${t("lastSweep")} ${dateTime(item.last_sweep_at) || "—"}</span>
            ${statusBadge(item.status)}
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

/* ---------- Render ---------- */

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query || state.route.source));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

/* ---------- Events ---------- */

pagination.bind(els.listPanel);

els.listPanel.addEventListener("click", (event) => {
  const action = event.target.closest("button[data-action]");
  if (action) {
    submitDecision({ kind: action.dataset.kind, id: action.dataset.id, action: action.dataset.action, comment: "" });
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const scope = button.closest("[data-record]") || els.detailBody;
  const note = scope.querySelector("[data-note]")?.value || "";
  const brief = scope.querySelector("[data-brief]")?.value;
  submitDecision({
    kind: button.dataset.kind,
    id: button.dataset.id,
    action: button.dataset.action,
    comment: note,
    brief: button.dataset.kind === "proposal" ? brief : undefined,
  });
});
els.detailBack.addEventListener("click", closeDetail);
els.sourceSelect.addEventListener("change", () => {
  replaceRoute(
    `#/trends${routeQuery({ peek: state.route.peek }, { ...state.route, source: els.sourceSelect.value })}`,
  );
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-picks-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
  } else {
    render();
  }
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
