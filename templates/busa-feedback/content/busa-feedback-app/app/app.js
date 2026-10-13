import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { PROPOSAL_STATUSES, REQUEST_STATUSES, TRIAGES } from "./js/feedback-model.js?v=0.1.0";
import {
  bindDetailEvents,
  renderOverview,
  renderRecordView,
  renderSettings,
} from "./js/feedback-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Each record view lists one Base. The detail mode is declared per Base in
// config.js `ui.detail_modes` (feedback → drawer, requests → page, proposals →
// split; the reasons sit next to the declaration). A `/<record>` path always
// opens the full page; `?peek=<record>` drives the drawer and the split. On a
// phone every mode is a page (base-ui.css handles that).
export const VIEW_BASE = { inbox: "feedback", requests: "requests", roadmap: "proposals" };
const RECORD_VIEWS = Object.keys(VIEW_BASE);
export const detailMode = (view) => appConfig.ui.detail_modes[VIEW_BASE[view]] || "drawer";
// The one filter each record view offers, kept in the URL as `?status=`.
export const VIEW_FILTERS = {
  inbox: { field: "triage", values: TRIAGES, group: "triage" },
  requests: { field: "status", values: REQUEST_STATUSES, group: "status" },
  roadmap: { field: "status", values: PROPOSAL_STATUSES, group: "status" },
};
const ID_FIELD = { feedback: "feedback_id", requests: "request_id", proposals: "proposal_id" };

export const state = {
  // Prev/Next pager per paginated Base. records.list exposes a forward keyset
  // cursor only, so pageCursors[key][i] is the cursor that fetches page i+1.
  // Only neighbouring pages are reachable: one click, one request — never a
  // loop through the pages in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records named by the URL that are not on the loaded page (records.get).
  extra: { feedback: new Map(), requests: new Map(), proposals: new Map() },
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-feedback-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { draft: {}, note: {}, effort: {}, assign: {} },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-feedback.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  statusSelect: byId("statusSelect"),
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
  decisionCount: byId("count-decisions"),
  newCount: byId("count-new"),
  needsInfoCount: byId("count-needsinfo"),
  language: byId("language"),
};

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

const locale = () => (activeLang() === "zh" ? "zh-Hans" : "en-US");

export function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
}

// Month + day only, for a narrow table column; the full date goes in the title.
export function shortDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric" }).format(parsed);
}

export function relativeTime(value) {
  if (!value) return t("notAvailable");
  const ref = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at) : new Date();
  const diffMs = ref.getTime() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "always" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the view's filter and
// the peeked record live in the URL so refresh, shared links and Back restore
// the same list context.
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
  const isRecordView = RECORD_VIEWS.includes(view);
  const mode = isRecordView ? detailMode(view) : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const filter = VIEW_FILTERS[view];
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: isRecordView ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: filter?.values.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.status && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const contextFor = (view) => (view === state.route.view ? state.route : { view, query: "", status: "all" });
export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, contextFor(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) =>
  detailMode(view) === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id }, contextFor(view))}`;

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
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and filter
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
  state.extra = { feedback: new Map(), requests: new Map(), proposals: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("busa-feedback:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything computed from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// The Base's real total (records.count) when known, else what is loaded,
// marked "+" while more pages exist.
export function recordCountLabel(key, loadedCount) {
  const total = state.totals?.[key];
  if (total != null) return String(total);
  return `${loadedCount}${isPartial(key) ? "+" : ""}`;
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
    toast(error instanceof Error ? error.message : String(error));
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  const key = VIEW_BASE[view];
  if (!state.snapshot || !selectedId || !key) return;
  if (recordById(key, selectedId) || state.extra[key].has(selectedId)) return;
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

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "inbox"
      ? "#/inbox"
      : scenario === "requests"
        ? "#/requests"
        : scenario === "roadmap"
          ? "#/roadmap"
          : scenario === "detail"
            ? "#/requests/req-csv-export"
            : "#/overview";
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
  for (const button of [els.viewRefresh, els.mobileRefresh]) {
    if (!button) continue;
    button.title = t("refresh");
    button.setAttribute("aria-label", t("refresh"));
  }
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function feedbackItems() {
  return state.snapshot?.feedback || [];
}

export function requests() {
  return state.snapshot?.requests || [];
}

export function proposals() {
  return state.snapshot?.proposals || [];
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(key, id) {
  if (!id) return null;
  const rows = state.snapshot?.[key] || [];
  return rows.find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const waiting = proposals().filter((item) => item.status === "needs_review").length;
  const fresh = feedbackItems().filter((item) => item.triage === "new").length;
  const needsInfo = requests().filter((item) => item.status === "needs_info").length;
  // Where the data comes from; the counts sit in the attention block and nav.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.decisionCount) els.decisionCount.textContent = waiting;
  if (els.newCount) els.newCount.textContent = fresh;
  if (els.needsInfoCount) els.needsInfoCount.textContent = needsInfo;
  for (const [view, key] of Object.entries(VIEW_BASE)) {
    const node = byId(`navCount-${view}`);
    if (node) node.textContent = snapshot ? recordCountLabel(key, (snapshot[key] || []).length) : "";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !snapshot
      ? t("loading")
      : waiting
        ? `${waiting} ${t("decisionsWaiting")}`
        : fresh
          ? `${fresh} ${t("newUncategorized")}`
          : `${feedbackItems().length} ${t("items")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "inbox") return t("inbox");
  if (view === "requests") return t("requests");
  if (view === "roadmap") return t("roadmap");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function channelBadge(channel) {
  if (!channel) return "";
  return `<span class="channel-badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function sentimentBadge(sentiment) {
  return `<span class="sentiment ${escapeHtml(sentiment)}">${escapeHtml(enumLabel(sentiment, "sentiment"))}</span>`;
}

export function triageBadge(triage) {
  return `<span class="triage-badge triage-${escapeHtml(triage)}">${escapeHtml(enumLabel(triage, "triage"))}</span>`;
}

export function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function trendArrow(trend) {
  const glyph = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return `<span class="trend trend-${escapeHtml(trend)}" title="${escapeHtml(enumLabel(trend, "trend"))}">${glyph} ${escapeHtml(enumLabel(trend, "trend"))}</span>`;
}

// A product is a business slug; show its display name. The products Base is
// read in full (≤50 rows), so a miss means the slug is unregistered — the
// slug itself is the only name there is.
export function productName(productId) {
  if (!productId) return "";
  return state.snapshot?.products?.find((product) => product.product_id === productId)?.display_name || productId;
}

// A source is referenced by id; resolve it to the source's name, and say
// "not loaded" rather than print the id when it is not in the loaded rows.
export function sourceName(sourceId) {
  if (!sourceId) return "";
  return state.snapshot?.sources?.find((source) => source.source_id === sourceId)?.name || t("notLoaded");
}

export function planLabel(plan) {
  return plan ? enumLabel(plan, "plan") : "";
}

// A request link by business id: the title when the request is loaded, "not
// loaded" when it is referenced but not on this page, and "not clustered
// yet" only when there is no request at all.
export function requestLink(requestId) {
  if (!requestId) return `<span class="muted">${escapeHtml(t("noRequest"))}</span>`;
  const request = recordById("requests", requestId);
  if (!request) return `<span class="muted">${escapeHtml(t("notLoaded"))}</span>`;
  return `<a class="request-link" href="${detailUrl(request.request_id, "requests")}">${escapeHtml(request.title)}</a>`;
}

export function requestTitle(requestId) {
  if (!requestId) return t("noRequest");
  return recordById("requests", requestId)?.title || t("notLoaded");
}

export function preview(text, length = 110) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

// Rows of the current record view, narrowed by the URL's search and filter.
export function filteredRows(view = state.route.view) {
  const query = state.route.query.trim().toLowerCase();
  const filter = VIEW_FILTERS[view];
  const status = state.route.status;
  const rows = state.snapshot?.[VIEW_BASE[view]] || [];
  return rows.filter((item) => {
    if (filter && status !== "all" && item[filter.field] !== status) return false;
    if (!query) return true;
    if (view === "inbox") {
      return matches(
        [
          item.text,
          item.user?.handle,
          enumLabel(item.channel, "channel"),
          productName(item.product),
          enumLabel(item.sentiment, "sentiment"),
          enumLabel(item.triage, "triage"),
          requestTitle(item.request_id),
          sourceName(item.source_id),
        ],
        query,
      );
    }
    if (view === "requests") {
      return matches(
        [item.title, productName(item.product), enumLabel(item.status), item.problem_statement],
        query,
      );
    }
    return matches([item.title, item.reason, item.evidence, enumLabel(item.type, "type"), enumLabel(item.status)], query);
  });
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
  body.toggle("ws-layout-split", onRecordView && detailMode(view) === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query || state.route.status !== "all"));
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

let toastTimer = null;
export function toast(message) {
  let node = document.querySelector("#toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
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
const setStatus = (status) =>
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (segment) setStatus(segment.dataset.status);
});
els.statusSelect.addEventListener("change", (event) => setStatus(event.target.value));
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
bindDetailEvents();
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState().catch((error) => toast(error.message)));
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-feedback-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
  render();
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
