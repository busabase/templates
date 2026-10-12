import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/review-views.js";

// Where a record opens, per Base. Chosen by what people do with the record:
//   items    → split:  management insights are a review queue worked top to
//                      bottom (approve / request changes / block), so the
//                      queue stays beside the insight being decided.
//   entities → drawer: a practice or lawyer profile is a fact you scan many
//                      of, read, and return to the list.
//   checks   → drawer: a QA check is a short log entry — read it, maybe jump
//                      to its insight, close.
//   settings → page:   the single config row is the Settings page itself.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;

// The workflow views are status slices of the one Management Insights Base.
const ITEM_VIEWS = ["items", "review", "approved", "done", "blocked"];
const VIEW_STATUS = { review: "needs_review", approved: "approved", done: "done", blocked: "blocked" };
const RECORD_VIEWS = [...ITEM_VIEWS, "checks", "entities"];
export const baseOf = (view) => (ITEM_VIEWS.includes(view) ? "items" : view);

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("legal-app-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { note: {}, draft: {} },
  pagination: {},
  totalCount: {},
  workflowCount: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { items: new Map(), entities: new Map(), checks: new Map() },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "legal-app.sidebarCollapsed";
const AUTO_REFRESH_MS = 15_000;

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewTitle: byId("overviewTitle"),
  overviewLead: byId("overviewLead"),
  overviewAction: byId("overviewAction"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  search: byId("search"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBar: byId("detailBar"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  detailBody: byId("detailBody"),
  settingsPage: byId("settingsPage"),
  settingsTitle: byId("settingsTitle"),
  settingsContent: byId("settingsContent"),
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

// ── Shell ──────────────────────────────────────────────────────────────────
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
  setMobileSidebarOpen(false);
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    return;
  }
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
  const mode = RECORD_VIEWS.includes(view) ? DETAIL_MODES[baseOf(view)] || "drawer" : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id: mode ? id : "",
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: mode ? params.get("q") || "" : "",
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
// The full page: the record in the path. Always a page, whatever the Base's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` Base, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[baseOf(view)] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (els.search) els.search.value = state.route.query;
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

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const routes = { review: "#/review", items: "#/items", checks: "#/checks", entities: "#/entities" };
  const route =
    scenario === "detail"
      ? `#/items/${encodeURIComponent(items()[0]?.id || "")}`
      : routes[scenario] || "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || null;
  state.hasLoadedMore = false;
  state.extra = { items: new Map(), entities: new Map(), checks: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-legal-firm-radar:state", { detail: data }));
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

// A decision is written straight onto the item row by the Busabase provider,
// so state.snapshot.items reflects the latest decision on every load.
export function items() {
  return state.snapshot?.items || [];
}

export function entities() {
  return state.snapshot?.entities || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

const rowsFor = (key) => (key === "items" ? items() : key === "entities" ? entities() : checks());

export function recordById(key, id) {
  if (!id) return undefined;
  return rowsFor(key).find((row) => row.id === id) || state.extra[key]?.get(id) || undefined;
}

// A record named by the URL but not on the loaded page: one records.get.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseOf(view);
  if (recordById(key, selectedId) || state.extra[key].has(selectedId)) return;
  const provider = await getProvider();
  if (typeof provider.fetchRecord !== "function") return;
  state.extra[key].set(selectedId, undefined);
  render();
  try {
    const record = await provider.fetchRecord(key, selectedId);
    if (record) state.extra[key].set(selectedId, record);
    else state.extra[key].delete(selectedId);
  } catch {
    state.extra[key].delete(selectedId);
  }
  render();
}

export const isPartial = (key) => Boolean(state.pagination[key]);

const matches = (values, query) => values.filter(Boolean).join(" ").toLowerCase().includes(query);

export function filteredRows(view) {
  const key = baseOf(view);
  const query = state.route.query.trim().toLowerCase();
  const status = VIEW_STATUS[view];
  return rowsFor(key).filter((row) => {
    if (status && row.status !== status) return false;
    if (!query) return true;
    if (key === "items")
      return matches([row.ref, row.title, row.summary, row.category, row.owner, row.body, row.recommendation], query);
    if (key === "checks") return matches([row.label, row.detail, row.status, row.severity], query);
    return matches([row.title, row.meta, row.summary, row.owner, ...(row.tags || [])], query);
  });
}

async function loadMore(key) {
  const cursor = state.pagination[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const target = rowsFor(key);
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

async function submitDecision(id, action) {
  if (state.settings?.demo) throw new Error("Demo mode is read-only.");
  const comment = document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value || "";
  const draft = document.querySelector(`[data-draft="${CSS.escape(id)}"]`)?.value || "";
  const provider = await getProvider();
  await provider.decideItem({ id, action, comment, draft });
  await loadState();
}

// ── Render ─────────────────────────────────────────────────────────────────
export function viewLabel(view) {
  const keys = {
    review: "needsReview",
    approved: "approved",
    done: "done",
    blocked: "blocked",
    items: "allItems",
    checks: "checks",
    entities: "entities",
    settings: "settings",
  };
  return t(keys[view] || "overview");
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  if (els.search) els.search.placeholder = t("search");
  if (els.refresh) els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) {
    els.language.value = state.lang;
    els.language.setAttribute("aria-label", t("language"));
    const labels =
      activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of els.language.options) option.textContent = labels[option.value] || option.textContent;
  }
}

// "123", or "50+" when only part of the Base is loaded and no count exists.
const totalText = (count, loaded, key) => String(count ?? `${loaded}${isPartial(key) ? "+" : ""}`);

function renderShell() {
  applyI18n();
  const all = items();
  const localCount = (status) => all.filter((item) => item.status === status).length;
  const wf = state.workflowCount || {};
  const needs = wf.needs_review ?? localCount("needs_review");
  const ready =
    wf.approved != null && wf.done != null ? wf.approved + wf.done : localCount("approved") + localCount("done");
  const blocked = wf.blocked ?? localCount("blocked");
  if (els.countNeeds) els.countNeeds.textContent = needs;
  if (els.countReady) els.countReady.textContent = ready;
  if (els.countBlocked) els.countBlocked.textContent = blocked;
  // Per-view totals sit next to the nav item. Needs review and Blocked are
  // already in the attention block above, so they carry no second number.
  const navCounts = state.snapshot
    ? {
        items: totalText(state.totalCount.items, all.length, "items"),
        approved: totalText(wf.approved, localCount("approved"), "items"),
        done: totalText(wf.done, localCount("done"), "items"),
        checks: totalText(state.totalCount.checks, checks().length, "checks"),
        entities: totalText(state.totalCount.entities, entities().length, "entities"),
      }
    : {};
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = navCounts[node.dataset.navCount] ?? "";
  });
  document.querySelectorAll(".filters [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta)
    els.mobileViewMeta.textContent = needs
      ? `${needs} ${t("needsReview")}`
      : `${totalText(state.totalCount.items, all.length, "items")} ${t("allItems")}`;
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const mode = onRecordView ? DETAIL_MODES[baseOf(view)] : null;
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && mode === "split" && presentation !== "page");
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
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

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
  // Close still steps back to the list the detail was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
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
  try {
    await submitDecision(button.dataset.id, button.dataset.action);
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (document.body.classList.contains("sidebar-open")) {
    setMobileSidebarOpen(false);
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});

els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", () => {
  syncResponsiveShell();
  if (state.snapshot && RECORD_VIEWS.includes(state.route.view)) render();
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
