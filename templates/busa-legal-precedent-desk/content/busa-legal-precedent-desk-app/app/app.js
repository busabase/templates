import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/review-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what the reviewing lawyer does:
//   items / approved / done / blocked → page: a research pack is a workplace —
//     research question, matched cases, local court pattern, citations and an
//     editable memo draft — read for minutes, and linked to from checks.
//   review → split: the lawyer-review queue is worked top to bottom, one pack
//     after the next, so the queue stays beside the record.
//   checks → drawer: a QA check is a fact scanned among many; open, read the
//     detail, jump to its research pack or close.
//   entities → drawer: a precedent-library cluster is a short profile looked
//     up and dismissed.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
export const STATUS_ROUTES = new Set(["approved", "done", "blocked"]);
// Which Base a view reads.
export const VIEW_BASE = { checks: "checks", entities: "entities" };
export const baseForView = (view) => VIEW_BASE[view] || "items";

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
  extra: { items: new Map(), entities: new Map(), checks: new Map() },
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

// Option ids (`warning`, `business_secret`) never reach the screen raw.
export function enumLabel(group, value) {
  if (value === null || value === undefined || value === "") return "";
  const key = String(value);
  return messages[activeLang()]?.[group]?.[key] || messages.en[group]?.[key] || key.replaceAll("_", " ");
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

const routeFor = (view) => (view === state.route.view ? state.route : { view, query: "" });
export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, routeFor(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id }, routeFor(view))}`;

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list marks the entry, so Back/Close/Escape
  // step back to that list instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.selectedId !== state.route.selectedId || previous.view !== state.route.view) state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

function closeDetail() {
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
  state.extra = { items: new Map(), entities: new Map(), checks: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-legal-precedent-desk:state", { detail: data }));
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

// Load more: one page per click, appended without duplicates.
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
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseForView(view);
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

// A reviewer decision is written directly onto the item row (decision_action /
// review_note / decided_at / draft / status), and Busabase reads are always
// live, so state.snapshot.items reflects the latest decision on every load.
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
  const rows = key === "items" ? items() : key === "entities" ? entities() : checks();
  return rows.find((row) => row.id === id) || state.extra[key]?.get(id) || null;
}

const matches = (values, query) =>
  values
    .flat()
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));

export function rowsForRoute() {
  const { view } = state.route;
  const q = state.route.query.trim().toLowerCase();
  if (view === "checks") {
    return checks().filter(
      (check) => !q || matches([check.label, check.detail, check.status, recordById("items", check.item_id)?.title], q),
    );
  }
  if (view === "entities") {
    return entities().filter(
      (entity) => !q || matches([entity.title, entity.meta, entity.owner, entity.summary, entity.tags], q),
    );
  }
  const status = view === "review" ? "needs_review" : STATUS_ROUTES.has(view) ? view : null;
  return items().filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return matches(
      [
        item.title,
        item.ref,
        item.summary,
        item.category,
        item.owner,
        item.body,
        item.recommendation,
        item.fields?.query,
        item.fields?.jurisdiction,
      ],
      q,
    );
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

// Exact per-status counts (records.count) when the provider has them,
// otherwise the loaded rows.
export function statusCount(status) {
  return state.workflowCount?.[status] ?? items().filter((item) => item.status === status).length;
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  els.search.placeholder = t("search");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) {
    els.language.value = state.lang;
    const labels =
      activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of els.language.options) option.textContent = labels[option.value] || option.textContent;
  }
}

function renderShell() {
  applyI18n();
  const needs = statusCount("needs_review");
  const ready = statusCount("approved") + statusCount("done");
  const blocked = statusCount("blocked");
  if (els.countNeeds) els.countNeeds.textContent = needs;
  if (els.countReady) els.countReady.textContent = ready;
  if (els.countBlocked) els.countBlocked.textContent = blocked;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) els.mobileViewMeta.textContent = needs ? `${needs} ${t("needsReview")}` : "";
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
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

async function submitDecision(id, action) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const comment = document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value || "";
  const draft = document.querySelector(`[data-draft="${CSS.escape(id)}"]`)?.value || "";
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
  // Without write access the decision is a ChangeRequest, and the pack keeps
  // its old status until someone who has it approves: say that, not "submitted".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
  render();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
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
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});

els.detailBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action][data-id]");
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  await submitDecision(button.dataset.id, button.dataset.action);
  button.disabled = false;
});

document.addEventListener("input", (event) => {
  const draftId = event.target?.dataset?.draft;
  const noteId = event.target?.dataset?.note;
  if (draftId) state.edits.draft[draftId] = event.target.value;
  if (noteId) state.edits.note[noteId] = event.target.value;
});

els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});

window.addEventListener("hashchange", setRoute);
els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
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
window.addEventListener("resize", syncResponsiveShell);

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
