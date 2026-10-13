import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/operations-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   services → drawer: a service is a fact scanned among many — glance at its
//                      checks and certificate, then back to the fleet list.
//   expiries → drawer: a ledger row — read the renewal guidance, jump to its
//                      action card, return to the list sorted by days left.
//   spend    → drawer: a provider row — read the note behind the number.
//   actions  → split:  the review queue is worked top to bottom, one card
//                      after the next, so the queue stays beside the card.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const SPEND_TABS = ["providers", "products"];

export const state = {
  // Prev/Next pager for services/expiries/actions. records.list only exposes a
  // forward keyset cursor, so pageCursors[key][i] is the cursor that fetches
  // page i+1. Only neighbouring pages are reachable — one click, one request;
  // there is no "jump to page N" because reaching it would mean reading every
  // page in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: emptyExtra(),
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-devops-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-devops.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  refresh: byId("refresh"),
  viewRefresh: byId("viewRefresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  reviewCount: byId("count-review"),
  expiringCount: byId("count-expiring"),
  downCount: byId("count-down"),
  language: byId("language"),
};

function emptyExtra() {
  return { services: new Map(), expiries: new Map(), spend: new Map(), actions: new Map() };
}

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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function dateTime(value) {
  if (!value) return t("never");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t("never");
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function pct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&by=…&peek=…]`. Search, the spend tab and the
// peeked record live in the URL so refresh, shared links and Back restore the
// same list context.
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
  const by = SPEND_TABS.includes(params.get("by")) ? params.get("by") : "providers";
  // Product rows have nothing beyond their columns, so only providers open.
  const mode = view === "spend" && by === "products" ? null : DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id: mode ? id : "",
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    by,
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "spend" && route.by !== "providers") params.set("by", route.by);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view) => ({ view, query: "", by: "providers" });

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

// Replace the current entry without a hashchange: search keystrokes and tab
// clicks should not each become a Back step.
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

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  state.extra = emptyExtra();
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-devops:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// Total pages from the real records.count total, or null when unknown.
export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything counted from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

const PAGE_PATH = { services: ["services"], expiries: ["expiries"], actions: ["actions"] };

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends, never
// walks forward through pages to reach a far one.
export async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !PAGE_PATH[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
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
  if (recordById(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  try {
    state.extra[view].set(selectedId, (await provider.getRecord(view, selectedId)) || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = RECORD_VIEWS.includes(scenario) ? `#/${scenario}` : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
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
  els.viewRefresh.title = t("refresh");
  els.viewRefresh.setAttribute("aria-label", t("refresh"));
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function services() {
  return state.snapshot?.services || [];
}

export function expiries() {
  return state.snapshot?.expiries || [];
}

export function actions() {
  return state.snapshot?.actions || [];
}

export function events() {
  return state.snapshot?.events || [];
}

export function spend() {
  return state.snapshot?.spend || { providers: [], products: [] };
}

export function metrics() {
  return state.snapshot?.metrics || {};
}

const ID_FIELD = { services: "service_id", expiries: "expiry_id", spend: "provider_id", actions: "action_id" };

function rowsFor(view) {
  return view === "spend" ? spend().providers : state.snapshot?.[view] || [];
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  return rowsFor(view).find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
}

export function actionById(actionId) {
  return recordById("actions", actionId);
}

// Attention numbers: the exact records.count total where the provider has one,
// else what the loaded page shows.
export function attentionCounts() {
  const counts = state.settings?.counts || {};
  return {
    review: counts.needs_review ?? actions().filter((item) => item.status === "needs_review").length,
    expiring: expiries().filter((item) => Number(item.days_left) <= 14).length,
    down: counts.services_down ?? services().filter((item) => item.status === "down").length,
  };
}

function renderShell() {
  applyI18n();
  const { review, expiring, down } = attentionCounts();
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.expiringCount) els.expiringCount.textContent = expiring;
  if (els.downCount) els.downCount.textContent = down;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review
      ? `${review} ${t("needDecision")}`
      : down
        ? `${down} ${t("servicesDown")}`
        : `${recordCountLabel("services", services().length)} ${t("services").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "services") return t("services");
  if (view === "expiries") return t("expiries");
  if (view === "spend") return t("spend");
  if (view === "actions") return t("actionsQueue");
  if (view === "settings") return t("settings");
  return t("overview");
}

// A count of loaded rows says so when more pages exist; a records.count total
// is shown as-is.
export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return `${loadedCount}${isPartial(key) ? "+" : ""}`;
  const total = state.totals?.[key];
  if (total != null) return total;
  return `${loadedCount}${isPartial(key) ? "+" : ""}`;
}

export function statusDot(status) {
  return `<span class="dot ${escapeHtml(status || "unknown")}" aria-hidden="true"></span>`;
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

export function daysLeftBadge(daysLeft) {
  const days = Number(daysLeft);
  const cls = days < 7 ? "crit" : days < 30 ? "warn" : "ok";
  const label = days < 0 ? `${Math.abs(days)} ${t("days")} ${t("overdue")}` : `${days} ${t("days")}`;
  return `<span class="days-badge ${cls}">${escapeHtml(label)}</span>`;
}

export function typeBadge(type) {
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

export function warnings(serviceId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !serviceId || !item.service_id || item.service_id === serviceId,
  );
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

export function sparkline(history) {
  const points = (history || []).map((entry) => Number(entry.latency_ms || 0));
  if (!points.length) return `<div class="empty-inline">${t("notAvailable")}</div>`;
  const width = 260;
  const height = 64;
  const pad = 6;
  // Scale to the observed range so a steady service reads as a flat line in
  // the middle rather than a line pinned to the top edge.
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || max;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (value) => height - pad - ((value - (max === min ? 0 : min)) / range) * (height - pad * 2);
  const coords = points.map((value, index) => [pad + index * step, y(value)]);
  const line = coords.map(([x, yy], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const dots = coords
    .map(([x, yy], index) => {
      const status = history[index]?.status || "up";
      return status === "up"
        ? ""
        : `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3" class="spark-dot ${escapeHtml(status)}"></circle>`;
    })
    .join("");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("latency")}" preserveAspectRatio="none">
      <path d="${line}" fill="none"></path>
      ${dots}
    </svg>
  `;
}

const matches = (values, query) =>
  values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

export function filteredServices() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return services();
  return services().filter((item) => matches([item.name, item.product, item.url, item.status], query));
}

export function filteredExpiries() {
  const query = state.route.query.trim().toLowerCase();
  const rows = [...expiries()].sort((a, b) => Number(a.days_left) - Number(b.days_left));
  if (!query) return rows;
  return rows.filter((item) =>
    matches([item.item, item.product, enumLabel(item.type, "type"), item.registrar, item.detail], query),
  );
}

export function filteredActions() {
  const query = state.route.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...actions()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    matches([item.title, item.reason, enumLabel(item.type, "type"), enumLabel(item.status), item.note], query),
  );
}

export function filteredSpend() {
  const query = state.route.query.trim().toLowerCase();
  const data = spend();
  if (!query) return data;
  return {
    ...data,
    providers: data.providers.filter((row) => matches([row.name, row.note], query)),
    products: data.products.filter((row) => matches([row.product], query)),
  };
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const splitView = onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", splitView);
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
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-by]");
  if (!segment) return;
  replaceRoute(`#/spend${routeQuery({}, { ...state.route, by: segment.dataset.by })}`);
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-verdict]");
  if (!button) return;
  submitDecision(button.dataset.action, button.dataset.verdict);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside the review note only leaves the field; a second Escape closes.
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", () => loadState());
els.viewRefresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-devops-language", state.lang);
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
