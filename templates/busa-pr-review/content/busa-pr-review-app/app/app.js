import { I18N } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  countByWorkflow,
  matchesMode,
  matchesSearch,
  normalizeItem,
  withReviewRefs,
} from "./js/pr-review-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { closeHelp, openHelp, renderDetail, renderList, renderOverview } from "./js/review-views.js";

// Where a review opens, per view. All views read the one `reviews` Base; the
// mode follows what the reviewer is doing in that view:
//   needs_review / to_approve / needs_test / blocked → split: each is a queue
//     worked top to bottom — decide, then the next PR — so the queue stays
//     beside the record.
//   approved / tested / done / all → drawer: history you scan, open one PR to
//     check or change a field, and return to the list.
// A `/<id>` path always opens the full page ("Open full page"); `?peek=<id>`
// drives drawer/split. On a phone every mode is a page (base-ui.css).
// Declared once, in config.js `ui.view_detail_modes`.
export const VIEW_MODES = appConfig.ui.view_detail_modes;
const RECORD_VIEWS = Object.keys(VIEW_MODES);
const MODE_ORDER = ["needs_review", "to_approve", "approved", "needs_test", "tested", "blocked", "done", "all"];

export let state = {
  items: [],
  counts: {},
  batch: null,
  lock: { locked: false },
  config_summary: {},
  demo: false,
  pagination: {},
  loadingMore: false,
  loadMoreError: false,
  failingAwaiting: null,
  loaded: false,
};
// Every review loaded so far (page 1 + any Load more pages), unfiltered.
let allItems = [];
// Reviews opened by URL that are not on the loaded page (records.get).
export const extraItems = new Map();
const params = new URLSearchParams(window.location.search);
const demoScenario = params.get("demo") || "";
const LANGUAGE_STORAGE_KEY = "busa-pr-review.uiLanguage";
export let languageMode = normalizeLanguageMode(
  params.get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto",
);
export const reviewStore = { saveTimer: null };
let hasLoadedMore = false;
const language = resolveLanguage();
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-pr-review.sidebarCollapsed";

export const $ = (id) => document.getElementById(id);

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function t(key, params = {}) {
  return String(I18N[language]?.[key] || I18N.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function normalizeLanguageMode(value) {
  if (value === "zh" || value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  return "auto";
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((item) => String(item).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  return languageMode === "auto" ? browserLanguage() : languageMode;
}

export function setLanguageMode(value) {
  languageMode = normalizeLanguageMode(value);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("lang", languageMode);
  window.location.search = nextParams.toString();
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("#filters button[data-mode]").forEach((button) => {
    if (button.dataset.mode !== "overview") button.title = t(`hint.${button.dataset.mode}`);
  });
  $("reloadButton").title = t("refresh");
  $("reloadButton").setAttribute("aria-label", t("refresh"));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function statusBadge(item) {
  const status = item.status || "needs_review";
  const labels = {
    needs_review: t("status.needs_review"),
    to_approve: t("status.to_approve"),
    approved: t("status.approved"),
    merged: t("status.merged"),
    done: t("status.done"),
    blocked: t("status.blocked"),
  };
  const klass =
    status === "approved" || status === "done"
      ? "ok"
      : status === "blocked"
        ? "danger"
        : status === "to_approve"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[status] || status.replaceAll("_", " "))}</span>`;
}

export function testedBadge(item) {
  if (item.verification_status === "tested")
    return `<span class="badge tested">${escapeHtml(t("status.tested"))}</span>`;
  if (item.verification_status === "needs_test")
    return `<span class="badge warn">${escapeHtml(t("status.needs_test"))}</span>`;
  return "";
}

export function actionBadge(action) {
  const labels = {
    approve: t("action.approve"),
    comment: t("action.comment"),
    request_changes: t("action.request_changes"),
    no_action: t("action.no_action"),
    needs_review: t("action.needs_review"),
    block: t("action.block"),
  };
  const klass =
    action === "approve"
      ? "ok"
      : action === "request_changes" || action === "block"
        ? "danger"
        : action === "comment"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[action] || action || t("action.review"))}</span>`;
}

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

const reportError = (error) => toast(error instanceof Error ? error.message : String(error));

// ── Routing ────────────────────────────────────────────────────────────────
// `#/overview` (default) · `#/<view>[/<id>][?q=…&repo=…&peek=…]`. Search, the
// repo filter and the peeked review live in the URL so refresh, shared links
// and Back restore the same list context.
function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function demoDefaultView() {
  if (demoScenario === "ready") return "to_approve";
  if (RECORD_VIEWS.includes(demoScenario)) return demoScenario;
  return "overview";
}

function parseRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeRoutePart);
  const search = new URLSearchParams(query);
  const view = RECORD_VIEWS.includes(parts[0]) ? parts[0] : parts[0] === "overview" || raw ? "overview" : demoDefaultView();
  const id = view !== "overview" && parts[1] ? parts[1] : "";
  const peek = view !== "overview" && !id ? search.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: id || peek,
    presentation: view === "overview" ? null : id ? "page" : VIEW_MODES[view],
    query: search.get("q") || "",
    repo: search.get("repo") || "all",
  };
}

export let route = parseRoute();

const routeQuery = (extra = {}, from = route) => {
  const search = new URLSearchParams();
  if (from.query && from.view !== "overview") search.set("q", from.query);
  if (from.repo && from.repo !== "all") search.set("repo", from.repo);
  for (const [key, value] of Object.entries(extra)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (from = route) => `#/${from.view}${routeQuery({}, from)}`;
export const viewUrl = (view, extra = {}) => `#/${view}${routeQuery(extra, { ...route, view, query: "" })}`;
// The full page: the review in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, view === route.view ? route : { ...route, view, query: "" })}`;
// What a row opens in this view: drawer/split → `?peek=`.
export const recordUrl = (id, view = route.view) =>
  VIEW_MODES[view] === "page"
    ? detailUrl(id, view)
    : `#/${view}${routeQuery({ peek: id }, view === route.view ? route : { ...route, view, query: "" })}`;

let previousRouteWasList = false;

function setRoute() {
  const previous = route;
  route = parseRoute();
  // A record opened from its own list: Back/Close/Escape steps back to that
  // exact list entry instead of pushing a new one.
  if (route.selectedId && previousRouteWasList && previous.view === route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(route.view) && !route.selectedId;
  $("searchInput").value = route.query;
  setMobileSidebarOpen(false);
  if (previous.repo !== route.repo) refreshRepoCounts();
  else render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and
// switching between records in an open drawer/split are not Back steps.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  const previous = route;
  route = parseRoute();
  previousRouteWasList = previousWasList;
  if (previous.repo !== route.repo) refreshRepoCounts();
  else render();
  ensureSelectedRecord();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else window.location.hash = listUrl();
}

// Open a queue from the nav. On desktop a split queue starts on its first PR,
// as the review desk always has; on a phone the list comes first.
function openView(view) {
  if (view === "overview" || VIEW_MODES[view] !== "split" || isMobileLayout()) {
    window.location.hash = viewUrl(view);
    return;
  }
  const first = itemsFor(view, "")[0];
  window.location.hash = viewUrl(view, first ? { peek: first.id } : {});
}

// ── Data ───────────────────────────────────────────────────────────────────
function repoItems(repo = route.repo) {
  return repo && repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
}

export function itemsFor(view = route.view, search = route.query) {
  return repoItems().filter((item) => matchesMode(item, view) && matchesSearch(item, search));
}

export function awaitingItems() {
  return repoItems().filter((item) => matchesMode(item, "needs_review") || matchesMode(item, "to_approve"));
}

export function needsTestItems() {
  return repoItems().filter((item) => matchesMode(item, "needs_test"));
}

// True while only part of the Base is loaded — anything summed from loaded
// rows must say so.
export function isPartial() {
  return Boolean(state.pagination.reviews);
}

// Loaded page first (any view), then a review fetched on its own for the URL.
export function reviewById(id) {
  if (!id) return null;
  return allItems.find((item) => item.id === id) || extraItems.get(id) || null;
}

export function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts?.[name] || 0;
}

// Exact counts for the repo filter come from records.count; the demo (and a
// provider without it) counts the loaded rows.
async function computeCounts(provider, data) {
  const repo = route.repo;
  const scoped = repoItems(repo);
  let exact = data?.demo ? null : repo === "all" ? (data?.workflowCount ?? null) : null;
  let failing = data?.demo ? null : repo === "all" ? (data?.failingAwaiting ?? null) : null;
  if (!data?.demo && repo !== "all") {
    if (typeof provider.countWorkflowCounts === "function") exact = await provider.countWorkflowCounts(repo);
    if (typeof provider.countFailingAwaiting === "function") failing = await provider.countFailingAwaiting(repo);
  }
  const loadedFailing = scoped.filter(
    (item) => (matchesMode(item, "needs_review") || matchesMode(item, "to_approve")) && item.checks === "failing",
  ).length;
  return {
    counts: exact || countByWorkflow(scoped),
    total_cached: exact?.all ?? scoped.length,
    // `null` only when a live provider could not count: the band shows "—".
    failingAwaiting: failing ?? (data?.demo || !isPartial() ? loadedFailing : null),
  };
}

async function refreshRepoCounts() {
  const provider = await getProvider();
  Object.assign(state, await computeCounts(provider, lastData));
  render();
}

let lastData = null;

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  lastData = data;
  allItems = data.snapshot?.items || [];
  hasLoadedMore = false;
  state = {
    ...state,
    repos: data.snapshot?.repos || [],
    batch: {
      batch_id: data.snapshot?.source,
      generated_at: data.snapshot?.generated_at,
      source: data.snapshot?.source,
    },
    total_all_repos: data.totalCount?.reviews ?? allItems.length,
    config_summary: data.config_summary || {},
    lock: data.lock || { locked: false },
    demo: Boolean(data.demo),
    pagination: data.pagination || {},
    loadingMore: false,
    loadMoreError: false,
    loaded: true,
  };
  Object.assign(state, await computeCounts(provider, data));
  window.dispatchEvent(new CustomEvent("busa-pr-review:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

export async function loadMoreReviews() {
  const cursor = state.pagination.reviews;
  if (!cursor || state.loadingMore) return;
  state.loadingMore = true;
  state.loadMoreError = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage("reviews", cursor);
    const known = new Set(allItems.map((item) => item.id));
    const additions = page.rows.map(normalizeItem).filter((item) => !known.has(item.id));
    allItems = withReviewRefs([...allItems, ...additions]).sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
    );
    state.pagination.reviews = page.nextCursor;
    hasLoadedMore = true;
  } catch {
    state.loadMoreError = true;
  } finally {
    state.loadingMore = false;
    render();
  }
}

// A review named by the URL but not loaded is read on its own (records.get by
// item id) instead of paging until it turns up.
async function ensureSelectedRecord() {
  const id = route.selectedId;
  if (!state.loaded || !id || reviewById(id) || extraItems.has(id)) return;
  const provider = await getProvider();
  if (typeof provider.getReview !== "function") {
    extraItems.set(id, null);
    render();
    return;
  }
  extraItems.set(id, undefined);
  render();
  try {
    extraItems.set(id, (await provider.getReview(id)) || null);
  } catch {
    extraItems.set(id, null);
  }
  render();
}

// ── Render ─────────────────────────────────────────────────────────────────
function modeTitle(view = route.view) {
  return t(`mode.${view}`);
}

function renderShell() {
  for (const name of MODE_ORDER) {
    const node = $(`count-${name}`);
    if (node) node.textContent = countFor(name);
  }
  document.querySelectorAll("#filters button[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === route.view);
  });
  renderRepoFilters();
  const config = state.config_summary || {};
  $("setupBody").textContent = state.demo
    ? t("demo_notice")
    : config.configured
      ? t("ready.as", { handle: config.reviewer?.handle || "@me" })
      : t("gh.defaults");
  $("mobileViewTitle").textContent = route.view === "overview" ? t("nav.overview") : modeTitle();
}

function renderRepoFilters() {
  const repos = state.repos || [];
  const current = repos.some((repo) => repo.repo === route.repo) ? route.repo : "all";
  const options = [
    `<option value="all">${escapeHtml(t("all_repos"))} (${escapeHtml(state.total_all_repos || 0)})</option>`,
    ...repos.map(
      (repo) =>
        `<option value="${escapeHtml(repo.repo)}">${escapeHtml(repo.repo)} (${escapeHtml(repo.count ?? "—")})</option>`,
    ),
  ].join("");
  for (const select of [$("repoFilter"), $("overviewRepoFilter")]) {
    if (!select) continue;
    if (select.innerHTML !== options) select.innerHTML = options;
    select.value = current;
  }
}

// Writes are only blocked inside the record while the agent holds the lock;
// navigation, search and Help keep working.
export function renderLock() {
  const lock = state.lock || {};
  $("lockBanner").hidden = !lock.locked;
  $("lockMessage").textContent = lock.message || t("lock.default");
  document.querySelectorAll("#detailBody button, #detailBody textarea, #detailBody input").forEach((node) => {
    node.disabled = Boolean(lock.locked);
  });
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = route;
  const ready = state.loaded;
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && presentation === "split");
  body.toggle("ws-searching", onRecordView && Boolean(route.query));
  $("loadState").hidden = ready;
  $("overviewPage").hidden = !ready || view !== "overview";
  $("viewPage").hidden = !onRecordView;
  if (!ready) return;
  if (onRecordView) {
    $("sectionTitle").textContent = modeTitle();
    $("sectionTitle").title = t(`hint.${view}`);
    state.items = itemsFor();
    $("listCount").textContent = route.query
      ? `${state.items.length}${isPartial() ? "+" : ""}`
      : String(countFor(view));
    renderList();
    renderDetail();
  } else {
    renderOverview();
  }
  renderLock();
}

// After a decision in a split queue the PR usually leaves the queue: move to
// the next one so the reviewer keeps working top to bottom.
export async function reloadAfterWrite(itemId) {
  const before = state.items.map((item) => item.id);
  await loadState();
  if (route.presentation !== "split" || itemsFor().some((item) => item.id === itemId)) return;
  const index = before.indexOf(itemId);
  const remaining = new Set(itemsFor().map((item) => item.id));
  const next = before.slice(index + 1).find((id) => remaining.has(id)) || itemsFor()[0]?.id || "";
  replaceRoute(next ? recordUrl(next) : listUrl());
}

// ── Events ─────────────────────────────────────────────────────────────────
function wire() {
  document.querySelectorAll("#filters button[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setMobileSidebarOpen(false);
      openView(button.dataset.mode);
    });
  });
  $("sidebarToggle").addEventListener("click", toggleSidebar);
  $("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
  $("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
  window.addEventListener("resize", syncResponsiveShell);
  $("searchInput").addEventListener("input", () => {
    replaceRoute(`#/${route.view}${routeQuery({ peek: route.peek }, { ...route, query: $("searchInput").value })}`);
  });
  for (const id of ["repoFilter", "overviewRepoFilter"]) {
    $(id).addEventListener("change", (event) => {
      const repo = event.target.value || "all";
      replaceRoute(`#/${route.view}${routeQuery({}, { ...route, repo })}`);
    });
  }
  $("reloadButton").addEventListener("click", () => loadState().catch(reportError));
  $("refreshButton").addEventListener("click", () => loadState().catch(reportError));
  $("helpButton").addEventListener("click", openHelp);
  $("closeHelp").addEventListener("click", closeHelp);
  $("helpModal").addEventListener("click", (event) => {
    if (event.target === $("helpModal")) closeHelp();
  });
  $("detailBack").addEventListener("click", closeDetail);
  $("prList").addEventListener("click", (event) => {
    if (event.target.closest("[data-load-more]")) {
      loadMoreReviews();
      return;
    }
    if (event.target.closest("a, button")) return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const url = recordUrl(row.dataset.id);
    // Switching records while a drawer/split is open replaces the entry, so
    // Close still steps back to the list it was opened from.
    if (route.peek) replaceRoute(url);
    else window.location.hash = url;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("helpModal").hidden) {
      closeHelp();
      return;
    }
    // Escape inside a draft only leaves the field; a second Escape closes.
    if (event.target.closest?.("textarea, input")) {
      event.target.blur();
      return;
    }
    if (route.selectedId && route.presentation && route.presentation !== "page") closeDetail();
  });
  // Keeps the queue in step with the agent: one page-1 read every 5s, paused
  // while typing and once the user has loaded more pages.
  setInterval(() => {
    const active = document.activeElement;
    if (active && ["TEXTAREA", "INPUT"].includes(active.tagName)) return;
    if (!hasLoadedMore) loadState().catch(() => {});
  }, 5000);
  window.addEventListener("hashchange", setRoute);
}

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
    $("loadState").hidden = false;
    $("loadState").classList.add("error");
    $("loadState").textContent = error instanceof Error ? error.message : String(error);
  }
}

applyTranslations();
syncResponsiveShell();
$("searchInput").value = route.query;
previousRouteWasList = RECORD_VIEWS.includes(route.view) && !route.selectedId;
wire();
boot();
