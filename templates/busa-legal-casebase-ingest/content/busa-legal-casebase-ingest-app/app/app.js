import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/review-views.js";

// Where a record opens, per view — declared once in config.js `ui.detail_modes`
// (the reasoning sits next to the declaration). A `/record` path always opens
// the full page; `?peek=` drives drawer and split. On a phone every mode is a
// page (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Views over the Case Records Base, and the workflow status each one slices.
export const ITEM_VIEW_STATUS = { items: null, review: "needs_review", approved: "approved", done: "done", blocked: "blocked" };
// The Base behind each record view.
export const VIEW_BASE = { items: "items", review: "items", approved: "items", done: "items", blocked: "items", checks: "checks", entities: "entities" };

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("legal-app-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { note: {}, draft: {} },
  notice: "",
  pagination: {},
  totalCount: {},
  workflowCount: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { items: new Map(), checks: new Map(), entities: new Map() },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "legal-app.sidebarCollapsed";
const AUTO_REFRESH_MS = 15_000;

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
  countNeeds: byId("count-needs"),
  countReady: byId("count-ready"),
  countBlocked: byId("count-blocked"),
  language: byId("language"),
};

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

export function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

// Option values (risk, severity, activity kind, metric key) never reach the
// screen raw: a label when one exists, else the words without underscores.
export function enumLabel(value, group) {
  if (value === null || value === undefined || value === "") return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    return;
  }
  setMobileSidebarOpen(false);
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
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
  const mode = DETAIL_MODES[view];
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

const routeFor = (view) => (view === state.route.view ? state.route : { view, query: "" });

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
  // A detail opened from its own list steps Back/Close/Escape to that exact
  // list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.selectedId !== state.route.selectedId) state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should not
// each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "review"
      ? "#/review"
      : scenario === "items"
        ? "#/items"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "entities"
            ? "#/entities"
            : scenario === "detail"
              ? `#/items/${encodeURIComponent(items()[0]?.id || "")}`
              : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || null;
  state.hasLoadedMore = false;
  state.extra = { items: new Map(), checks: new Map(), entities: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-legal-casebase-ingest:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function shouldSkipAutoRefresh() {
  const active = document.activeElement;
  if (!active) return false;
  return active.matches("textarea, input:not([type='search']), select");
}

function scheduleAutoRefresh() {
  window.setInterval(() => {
    if (shouldSkipAutoRefresh() || state.hasLoadedMore) return;
    loadState().catch(() => {});
  }, AUTO_REFRESH_MS);
}

// "Load more" fetches exactly one further page per click and appends it.
export async function loadMore(key) {
  const cursor = state.pagination[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const target = key === "items" ? items() : key === "entities" ? entities() : checks();
    const known = new Set(target.map((row) => row.id));
    target.push(...page.rows.filter((row) => !known.has(row.id)));
    state.pagination[key] = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
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
  render();
  try {
    state.extra[key].set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    state.extra[key].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

// A reviewer decision is written straight onto the item row by the Busabase
// provider, and Busabase reads are always live, so state.snapshot.items
// already reflects the latest decision on every load.
export function items() {
  return state.snapshot?.items || [];
}

export function entities() {
  return state.snapshot?.entities || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(key, id) {
  if (!id) return null;
  const rows = state.snapshot?.[key] || [];
  return rows.find((row) => row.id === id) || state.extra[key]?.get(id) || null;
}

const matches = (values, query) => values.filter(Boolean).join(" ").toLowerCase().includes(query);

export function filteredItems(status) {
  const q = state.route.query.trim().toLowerCase();
  return items().filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matches(
      [item.title, item.ref, item.summary, item.category, item.owner, item.body, item.recommendation, item.fields?.cause, item.fields?.court],
      q,
    );
  });
}

export function filteredChecks() {
  const q = state.route.query.trim().toLowerCase();
  if (!q) return checks();
  return checks().filter((check) =>
    matches([check.label, check.detail, check.status, check.severity, recordById("items", check.item_id)?.title], q),
  );
}

export function filteredEntities() {
  const q = state.route.query.trim().toLowerCase();
  const order = ["needs_review", "changes_requested", "approved", "done", "blocked"];
  const rank = (entity) => (order.includes(entity.status) ? order.indexOf(entity.status) : order.length);
  const list = q
    ? entities().filter((entity) => matches([entity.title, entity.meta, entity.summary, entity.owner, ...(entity.tags || [])], q))
    : entities();
  // Grouped by workflow status, as the library always was.
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

export function itemsForView(view = state.route.view) {
  return filteredItems(ITEM_VIEW_STATUS[view]);
}

// "N" when the count is known, "N+" while more pages exist.
export const loadedCount = (rows, key) => `${rows.length}${state.pagination[key] ? "+" : ""}`;

function needsCount() {
  return state.workflowCount?.needs_review ?? items().filter((item) => item.status === "needs_review").length;
}

function navCount(key) {
  if (key === "items") return state.totalCount.items ?? loadedCount(items(), "items");
  if (key === "checks") return state.totalCount.checks ?? loadedCount(checks(), "checks");
  if (key === "entities") return state.totalCount.entities ?? loadedCount(entities(), "entities");
  return state.workflowCount?.[key] ?? items().filter((item) => item.status === key).length;
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("searchView");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  els.detailExpand.textContent = t("openFullPage");
  byId("settingsTitle").textContent = t("settings");
  if (els.language) {
    els.language.value = state.lang;
    const labels =
      activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of els.language.options) option.textContent = labels[option.value] || option.textContent;
  }
}

function renderShell() {
  applyI18n();
  const all = items();
  const needs = needsCount();
  const ready =
    state.workflowCount?.approved != null && state.workflowCount?.done != null
      ? state.workflowCount.approved + state.workflowCount.done
      : all.filter((item) => item.status === "approved" || item.status === "done").length;
  const blocked = state.workflowCount?.blocked ?? all.filter((item) => item.status === "blocked").length;
  els.countNeeds.textContent = state.snapshot ? needs : "–";
  els.countReady.textContent = state.snapshot ? ready : "–";
  els.countBlocked.textContent = state.snapshot ? blocked : "–";
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = state.snapshot ? navCount(node.dataset.navCount) : "";
  });
  els.mobileViewTitle.textContent = viewLabel(state.route.view);
  els.mobileViewMeta.textContent = !state.snapshot
    ? ""
    : state.settings?.demo
      ? t("demoData")
      : needs
        ? `${needs} ${t("needsReview")}`
        : t("liveData");
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "review") return t("needsReview");
  if (view === "approved") return t("approved");
  if (view === "done") return t("done");
  if (view === "blocked") return t("blocked");
  if (view === "items") return t("allItems");
  if (view === "checks") return t("checks");
  if (view === "entities") return t("entities");
  if (view === "settings") return t("settings");
  return t("overview");
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

export function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>`;
}

// A side read (library, checks, settings) that failed is named, not hidden.
export function unavailableBanner() {
  const failed = state.settings?.unavailable || [];
  if (!failed.length) return "";
  const names = { entities: t("entities"), checks: t("checks"), settings: t("settings") };
  return `<div class="notice-banner warning" role="status">${escapeHtml(t("sideUnavailable").replace("{list}", failed.map((key) => names[key] || key).join(", ")))}</div>`;
}

async function submitDecision(id, action) {
  if (state.settings?.demo) {
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  const comment = state.edits.note[id] ?? document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value ?? "";
  const draft = state.edits.draft[id] ?? document.querySelector(`[data-draft="${CSS.escape(id)}"]`)?.value ?? "";
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideItem({ id, action, comment, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  delete state.edits.note[id];
  delete state.edits.draft[id];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the record keeps
  // its old status until someone who has it approves: say so, after the reload.
  if (result?.pending) {
    state.notice = t("savedForReview");
    render();
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const escapeAttr = escapeHtml;

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", async (event) => {
  const loadMoreButton = event.target.closest("[data-load-more]");
  if (loadMoreButton) {
    await loadMore(loadMoreButton.dataset.loadMore);
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.listPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest("tr[data-id]");
  if (row) location.hash = recordUrl(row.dataset.id);
});
els.detailBody.addEventListener("input", (event) => {
  const draftId = event.target?.dataset?.draft;
  const noteId = event.target?.dataset?.note;
  if (draftId) state.edits.draft[draftId] = event.target.value;
  if (noteId) state.edits.note[noteId] = event.target.value;
});
els.detailBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  await submitDecision(button.dataset.id, button.dataset.action);
  button.disabled = false;
});
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
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh?.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language?.addEventListener("change", (event) => {
  state.lang = normalizeLang(event.target.value);
  localStorage.setItem("legal-app-language", state.lang);
  render();
});

let autoRefreshStarted = false;

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
    if (!autoRefreshStarted) {
      autoRefreshStarted = true;
      scheduleAutoRefresh();
    }
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
