import { messages } from "./i18n/messages.js";
import { normalizeDriftAlertRow, normalizeItemRow } from "./js/brand-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/brand-views.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   narrative → page:   a positioning statement, pillar or guardrail is the
//                       canonical message itself — a long draft you edit and
//                       decide on, with the drift alerts that cite it; you stay.
//   stories   → drawer: the story bank is a library — scan many stories and
//                       proof points, check one's evidence, return to the list.
//   drift     → split:  drift alerts are a queue worked top to bottom, resolve
//                       or dismiss one and move to the next.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Narrative and Stories are two views over the one Narrative Items Base.
export const VIEW_BASE = { narrative: "items", stories: "items", drift: "drift-alerts" };
export const NARRATIVE_TYPES = ["positioning", "message_pillar", "vocabulary", "guardrail"];
export const STORY_TYPES = ["story", "proof_point"];
const ASSET_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Prev/Next pager per Base. records.list only exposes a forward keyset
  // cursor, so pageCursors[key][i] is the cursor that fetches page i+1. Only
  // neighbouring pages are reachable — one click, one request; there is no
  // "jump to page N" because reaching it would mean reading every page between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { items: new Map(), "drift-alerts": new Map() },
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-brand-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-brand.sidebarCollapsed";

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
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  reviewLink: byId("reviewLink"),
  reviewCount: byId("count-review"),
  driftCount: byId("count-drift"),
  canonicalCount: byId("count-canonical"),
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
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(activeLang() === "zh" ? "zh-Hans" : "en-US");
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the asset status filter
// and the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.
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
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: hasStatusFilter(view) && ASSET_STATES.includes(status) ? status : "all",
  };
}

function hasStatusFilter(view) {
  return view === "narrative" || view === "stories";
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (hasStatusFilter(route.view) && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const routeFor = (view) => (view === state.route.view ? state.route : { view, query: "", status: "all" });

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, routeFor(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  return `#/${view}${routeQuery({ peek: id }, routeFor(view))}`;
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
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.totals = data.totals || {};
  state.extra = { items: new Map(), "drift-alerts": new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("busa-brand:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything counted from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

export const countLabel = (count, key) => `${count}${isPartial(key) ? "+" : ""}`;

const SNAPSHOT_FIELD = { items: "items", "drift-alerts": "drift_alerts" };
const NORMALIZE_ROW = { items: normalizeItemRow, "drift-alerts": normalizeDriftAlertRow };

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
export async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
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
    state.snapshot[SNAPSHOT_FIELD[key]] = rows;
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
  const key = VIEW_BASE[view];
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
    const row = await provider.getRecord(key, selectedId);
    state.extra[key].set(selectedId, row || null);
  } catch {
    state.extra[key].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = ["narrative", "stories", "drift", "settings"].includes(scenario) ? `#/${scenario}` : "#/overview";
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
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("messageHouse");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function items() {
  return state.snapshot?.items || [];
}

export function itemsOfType(type) {
  return items().filter((item) => item.type === type);
}

export function driftAlerts() {
  return state.snapshot?.drift_alerts || [];
}

export const viewItems = (view) => {
  const types = view === "stories" ? STORY_TYPES : NARRATIVE_TYPES;
  return items()
    .filter((item) => types.includes(item.type))
    .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type) || a.ref - b.ref);
};

// Which view owns an item: proof points and stories live in the story bank.
export const viewForItem = (item) => (STORY_TYPES.includes(item?.type) ? "stories" : "narrative");

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const key = VIEW_BASE[view];
  if (key === "drift-alerts") {
    return driftAlerts().find((alert) => alert.alert_id === id) || state.extra[key]?.get(id) || null;
  }
  return items().find((item) => item.item_id === id) || state.extra[key]?.get(id) || null;
}

export function itemById(itemId) {
  return recordById("narrative", itemId);
}

export function channelName(channelId) {
  const channels = state.settings?.config_summary?.channels || [];
  return channels.find((channel) => channel.channel_id === channelId)?.display_name || channelId || "";
}

function renderShell() {
  applyI18n();
  const reviewItems = items().filter((item) => item.status === "needs_review");
  const canonicalCount = items().filter((item) => item.status === "approved").length;
  const driftOpen = driftAlerts().filter((alert) => alert.status === "open").length;
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : state.settings?.demo
      ? t("demoData")
      : state.snapshot.brand_name || t("liveData");
  els.reviewCount.textContent = countLabel(reviewItems.length, "items");
  els.driftCount.textContent = countLabel(driftOpen, "drift-alerts");
  els.canonicalCount.textContent = countLabel(canonicalCount, "items");
  // Review work can sit in either view; send the reviewer to where it is.
  const reviewView =
    reviewItems.length && !reviewItems.some((item) => viewForItem(item) === "narrative") ? "stories" : "narrative";
  els.reviewLink.href = `#/${reviewView}?status=needs_review`;
  const navCounts = {
    narrative: countLabel(viewItems("narrative").length, "items"),
    stories: countLabel(viewItems("stories").length, "items"),
    drift: state.totals?.["drift-alerts"] ?? countLabel(driftAlerts().length, "drift-alerts"),
  };
  for (const [view, count] of Object.entries(navCounts)) {
    byId(`nav-count-${view}`).textContent = state.snapshot ? count : "";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewItems.length
      ? `${reviewItems.length} ${t("needReview")}`
      : `${canonicalCount} ${t("canonical")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "narrative") return t("narrative");
  if (view === "stories") return t("stories");
  if (view === "drift") return t("driftAlerts");
  if (view === "settings") return t("settings");
  return t("overview");
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  return viewItems(view).filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    return matches(
      [
        item.title,
        item.draft,
        item.reason,
        enumLabel(item.type, "type"),
        enumLabel(item.phase, "phase"),
        item.sub_skill,
        item.evidence?.source,
        item.evidence?.stat,
      ],
      query,
    );
  });
}

export function filteredDrift() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return driftAlerts();
  return driftAlerts().filter((alert) =>
    matches([alert.title, alert.offending_usage, alert.canonical_guidance, channelName(alert.channel_id)], query),
  );
}

export function assetStates() {
  return ASSET_STATES;
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
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
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
const setStatus = (status) =>
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (segment) setStatus(segment.dataset.status);
});
els.statusSelect.addEventListener("change", (event) => setStatus(event.target.value));
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-field]");
  if (!field) return;
  const id = field.closest("[data-record]")?.dataset.record;
  if (id) state.edits[id] = { ...state.edits[id], [field.dataset.field]: field.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-record]");
  submitDecision(card.dataset.record, button.dataset.action, card);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft only leaves the field; a second Escape closes.
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
  localStorage.setItem("busa-brand-language", state.lang);
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
