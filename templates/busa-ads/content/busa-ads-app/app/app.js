import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/campaign-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   campaigns   → page:   a campaign is a workplace — daily series, targets,
//                         linked anomalies and its adjustment history.
//   alerts      → drawer: an anomaly is a fact you scan many of, read its
//                         evidence, maybe follow it to its card, and return.
//   adjustments → split:  the review queue is worked top to bottom, one card
//                         after the next, so the queue stays beside the card.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, per Base, in config.js `ui.detail_modes`.
const VIEW_BASE = { campaigns: "campaigns", alerts: "anomalies", adjustments: "adjustments" };
const RECORD_VIEWS = Object.keys(VIEW_BASE);
export const modeFor = (view) => appConfig.ui.detail_modes[VIEW_BASE[view]];
export const baseFor = (view) => VIEW_BASE[view];

export const state = {
  // Prev/Next pager per paginated Base. records.list only exposes a forward
  // keyset cursor, so pageCursors[key][i] is the cursor that fetches page i+1.
  // Only neighbouring pages are reachable — one click, one request; there is
  // no "jump to page N" because reaching it means reading every page between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { campaigns: new Map(), anomalies: new Map(), adjustments: new Map() },
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-ads-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-ads.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
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
  alertCount: byId("count-alerts"),
  budgetCount: byId("count-budget"),
  language: byId("language"),
};

function isMobileLayout() {
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

export function money(value, currency = state.snapshot?.currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function dateTime(value) {
  if (!value) return t("notAvailable");
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ageOf(startIso) {
  const reference = Date.parse(state.snapshot?.generated_at || "") || Date.now();
  const start = Date.parse(startIso || "");
  if (!Number.isFinite(start)) return t("notAvailable");
  const hours = Math.max(0, Math.round((reference - start) / 3600000));
  if (hours < 48) return `${hours}${t("hoursShort")}`;
  return `${Math.round(hours / 24)}${t("daysShort")}`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in the
// URL so refresh, shared links and Back restore the same list context.
function parseRoute() {
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
  const mode = RECORD_VIEWS.includes(view) ? modeFor(view) : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (modeFor(view) === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
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

// Replace the current entry without a hashchange: search keystrokes should not
// each become a Back step.
function replaceRoute(url) {
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

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  state.extra = { campaigns: new Map(), anomalies: new Map(), adjustments: new Map() };
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-ads:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "campaigns"
      ? "#/campaigns"
      : scenario === "alerts"
        ? "#/alerts"
        : scenario === "adjustments"
          ? "#/adjustments"
          : scenario === "detail"
            ? "#/campaigns/amz-sp-manual-lunchbox"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// The real total comes from records.count; null when the SDK or the grant
// cannot answer, and the pager then says "Page N" without inventing a total.
export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything summed from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    state.snapshot[key] = rows;
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseFor(view);
  if (recordById(view, selectedId) || state.extra[key].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[key].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[key].set(selectedId, undefined);
  try {
    state.extra[key].set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    state.extra[key].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
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

export function campaigns() {
  return state.snapshot?.campaigns || [];
}

export function platforms() {
  return state.snapshot?.platforms || [];
}

export function anomalies() {
  return state.snapshot?.anomalies || [];
}

export function adjustments() {
  return state.snapshot?.adjustments || [];
}

export function syncLog() {
  return state.snapshot?.sync_log || [];
}

export function metrics() {
  return state.snapshot?.metrics || {};
}

const ID_FIELD = { campaigns: "campaign_id", anomalies: "anomaly_id", adjustments: "adjustment_id" };

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const key = baseFor(view) || view;
  const rows = state.snapshot?.[key] || [];
  return rows.find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

export function campaignById(campaignId) {
  return recordById("campaigns", campaignId);
}

export function adjustmentById(adjustmentId) {
  return recordById("adjustments", adjustmentId);
}

export function anomalyById(anomalyId) {
  return recordById("alerts", anomalyId);
}

// A campaign reference is a business id (`amz-sp-…`). Resolve it to a name;
// when the campaign is not on the loaded page, say so — never print the id.
export function campaignName(campaignId) {
  if (!campaignId) return "";
  return campaignById(campaignId)?.name || t("notLoaded");
}

export function reviewCount() {
  return adjustments().filter((item) => item.status === "needs_review").length;
}

export function openAlertCount() {
  return anomalies().filter((item) => item.state === "open").length;
}

function renderShell() {
  applyI18n();
  const review = reviewCount();
  const openAlerts = openAlertCount();
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.alertCount) els.alertCount.textContent = openAlerts;
  if (els.budgetCount) els.budgetCount.textContent = Number(metrics().budget_at_risk_today || 0);
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review
      ? `${review} ${t("needReview")}`
      : openAlerts
        ? `${openAlerts} ${t("openAlerts")}`
        : state.settings?.demo
          ? t("demoData")
          : t("liveData");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "campaigns") return t("campaigns");
  if (view === "alerts") return t("alertsFeed");
  if (view === "adjustments") return t("adjustmentsQueue");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusDot(status) {
  return `<span class="dot ${escapeHtml(status || "unknown")}" aria-hidden="true"></span>`;
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

export function platformDot(status) {
  return statusDot(status);
}

export function platformBadge(platformId) {
  return `<span class="badge platform-${escapeHtml(platformId)}">${escapeHtml(enumLabel(platformId, "platform"))}</span>`;
}

export function typeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function adjTypeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "adjtype"))}</span>`;
}

export function acosBadge(acos, target) {
  const value = Number(acos || 0);
  const goal = Number(target || 0);
  const cls = !goal || value <= goal ? "" : value <= goal * 1.2 ? "warn" : "crit";
  const label = goal ? `${value.toFixed(1)}% / ${goal.toFixed(0)}%` : `${value.toFixed(1)}%`;
  return `<span class="acos-badge ${cls}" title="${t("acos")} ${t("vs")} ${t("acosTarget")}">${escapeHtml(label)}</span>`;
}

export function trendArrow(trend) {
  const glyph = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  return `<span class="trend ${escapeHtml(trend || "flat")}" title="${t("trend")}">${glyph}</span>`;
}

export function budgetBar(pctSpent) {
  const value = Math.max(0, Math.min(100, Number(pctSpent || 0)));
  const cls = value >= 100 ? "crit" : value >= 85 ? "warn" : "";
  return `<span class="budget-bar ${cls}"><i style="width:${value}%"></i></span>`;
}

export function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

export function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function warnings(filter = () => true) {
  const items = (state.snapshot?.warnings || []).filter(filter);
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredCampaigns() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return campaigns();
  return campaigns().filter((campaign) =>
    matches(
      [
        campaign.name,
        campaign.product,
        campaign.sku,
        enumLabel(campaign.platform, "platform"),
        enumLabel(campaign.status),
        campaign.platform,
        campaign.status,
      ],
      query,
    ),
  );
}

export function filteredAnomalies() {
  const query = state.route.query.trim().toLowerCase();
  const order = { critical: 0, warning: 1, info: 2 };
  const stateOrder = { open: 0, actioned: 1, dismissed: 2, resolved: 3 };
  const rows = [...anomalies()].sort(
    (a, b) =>
      (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  if (!query) return rows;
  return rows.filter((item) =>
    matches(
      [
        item.type,
        item.severity,
        item.state,
        enumLabel(item.type, "type"),
        enumLabel(item.severity),
        enumLabel(item.state),
        item.evidence,
        item.platform,
        campaignById(item.campaign_id)?.name,
      ],
      query,
    ),
  );
}

export function filteredAdjustments() {
  const query = state.route.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...adjustments()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    matches(
      [
        item.title,
        item.reason,
        item.type,
        item.status,
        enumLabel(item.type, "adjtype"),
        enumLabel(item.status),
        item.note,
        item.platform,
        `#${item.ref}`,
      ],
      query,
    ),
  );
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && modeFor(view) === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
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

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
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
  const button = event.target.closest("button[data-verdict]");
  if (!button) return;
  const card = button.closest("[data-adjustment]");
  if (card) submitDecision(card.dataset.adjustment, button.dataset.verdict);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside the note only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
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
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-ads-language", state.lang);
  loadState();
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
