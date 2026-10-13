import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createLoadMore } from "./js/pagination.js?v=0.1.0";
import { buildSnapshot, computeInsights, DEFAULT_RISK_POLICY } from "./js/portfolio-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/views.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with it:
//   contracts     → drawer: a contract is a fact you scan many of — check its
//                   lag, maybe flag it or leave a note — and return to the book.
//   watchlist     → split:  the watchlist is a queue worked top to bottom, one
//                   declining contract after the next, so it stays beside it.
//   concentration → drawer: a bucket is peeked (which contracts make up this
//                   20%?) and dismissed; the comparison lives in the table.
// A `/<id>` path always opens the full page; `?peek=<id>` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const CONTRACT_FILTERS = ["all", "at_risk", "flagged"];
const BUCKETS = ["category", "city"];

export const state = {
  snapshot: null,
  settings: null,
  // Contracts read so far (page 1 plus every Load More), the source for every
  // derived number in the app.
  contracts: [],
  // Contracts opened by URL that are not on a loaded page (records.get).
  extra: new Map(),
  route: parseRoute(),
  sort: { key: "lag_pp", dir: "desc" },
  notice: "",
  busy: false,
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("busa-portfolio-health-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-portfolio-health.sidebarCollapsed";

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
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  watchlistCount: byId("watchlist-count"),
  atRiskCount: byId("count-atrisk"),
  contractCount: byId("count-contracts"),
  language: byId("language"),
};

export const loadMore = createLoadMore({
  getProvider,
  key: "contracts",
  idOf: (row) => row.id,
  onRows: (rows) => setContracts(rows),
  render: () => render(),
});

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

export function activeLang() {
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

export function statusLabel(status) {
  if (!status) return "";
  const key = String(status);
  return messages[activeLang()]?.statusLabels?.[key] || messages.en.statusLabels?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  try {
    return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return Number(value || 0).toLocaleString();
  }
}

export function pct(value, digits = 1) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function severityLabel(severity) {
  if (severity === "high") return t("severityHigh");
  if (severity === "watch") return t("severityWatch");
  return t("severityOk");
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<id>][?q=…&filter=…&by=…&peek=…]`. Search, the contracts filter,
// the concentration grouping and the peeked record live in the URL so refresh,
// shared links and Back restore the same list context.
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
  const filter = params.get("filter") || "all";
  const by = params.get("by") || "category";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : peek ? mode : null,
    query: params.get("q") || "",
    filter: CONTRACT_FILTERS.includes(filter) ? filter : "all",
    by: BUCKETS.includes(by) ? by : "category",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "contracts" && route.filter !== "all") params.set("filter", route.filter);
  if (route.view === "concentration" && route.by !== "category") params.set("by", route.by);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const contextFor = (view) =>
  view === state.route.view ? state.route : { view, query: "", filter: "all", by: state.route.by || "category" };

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, contextFor(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  return `#/${view}${routeQuery({ peek: id }, contextFor(view))}`;
};
export const filterUrl = (patch) =>
  `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, ...patch })}`;

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
  ensureSelectedContract();
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
function riskPolicy() {
  return state.settings?.config_summary?.risk_policy || DEFAULT_RISK_POLICY;
}

function setContracts(rows) {
  state.contracts = rows;
  state.snapshot = buildSnapshot({
    contracts: rows,
    configSummary: state.settings?.config_summary,
    generatedAt: state.snapshot?.generated_at,
    source: state.snapshot?.source,
  });
}

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.settings = data;
  state.snapshot = data.snapshot;
  state.contracts = data.snapshot?.contracts || [];
  state.extra = new Map();
  loadMore.reset({ cursor: data.pagination?.contracts, total: data.totals?.contracts });
  window.dispatchEvent(new CustomEvent("busa-portfolio-health:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedContract();
}

// A contract named by the URL but not on a loaded page is read on its own
// (records.get by contract id) instead of loading more pages to find it.
async function ensureSelectedContract() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || view === "concentration" || !RECORD_VIEWS.includes(view)) return;
  if (loadedContract(selectedId) || state.extra.has(selectedId)) return;
  const provider = await getProvider();
  if (typeof provider?.getContract !== "function") {
    state.extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra.set(selectedId, undefined);
  render();
  try {
    state.extra.set(selectedId, (await provider.getContract(selectedId)) || null);
  } catch {
    state.extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = RECORD_VIEWS.includes(scenario) || scenario === "settings" ? `#/${scenario}` : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

const loadedContract = (id) => state.contracts.find((item) => item.id === id) || null;

// Loaded page first, then a contract fetched on its own for the URL.
// `undefined` = still being read, `null` = unavailable.
export function contractById(id) {
  if (!id) return null;
  return loadedContract(id) || state.extra.get(id);
}

// Per-contract derived figures (lag, severity, revenue decline). Computed for
// the one contract so a contract read on its own gets the same numbers.
export function contractInsight(contract) {
  const insight = computeInsights([contract], riskPolicy());
  return { progress: insight.progress[0] || {}, watch: insight.watchlist[0] || null };
}

export function insights() {
  return state.snapshot?.insights || {};
}

export function isAtRisk(contract, progress) {
  return contract.status === "delinquent" || (progress && progress.severity !== "ok");
}

// Copy for numbers derived from loaded contracts while more exist.
export function loadedNote() {
  if (!loadMore.partial()) return "";
  const n = state.contracts.length;
  return loadMore.total != null
    ? t("loadedOf").replace("{n}", n).replace("{total}", loadMore.total)
    : t("loadedSome").replace("{n}", n);
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

export function viewLabel(view) {
  if (view === "contracts") return t("contractsTitle");
  if (view === "concentration") return t("concentrationTitle");
  if (view === "watchlist") return t("watchlistTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const ready = Boolean(state.snapshot);
  const totals = insights().totals || {};
  const watchCount = insights().watchlist?.length || 0;
  const partial = loadMore.partial() ? "+" : "";
  // The real total when records.count answered; else the loaded rows, marked.
  const contractCount = loadMore.total ?? `${state.contracts.length}${partial}`;
  els.syncStatus.textContent = !ready ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  els.watchlistCount.textContent = ready ? `${watchCount}${partial}` : "–";
  els.atRiskCount.textContent = ready ? `${totals.at_risk_count ?? 0}${partial}` : "–";
  els.contractCount.textContent = ready ? contractCount : "–";
  els.mobileViewTitle.textContent = viewLabel(state.route.view);
  els.mobileViewMeta.textContent = !ready
    ? t("loading")
    : t("aumMeta").replace("{value}", money(totals.total_aum));
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
  body.add("ws-has-mobile-bar");
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

// ── Writes ─────────────────────────────────────────────────────────────────
// Direct decision write: flag-for-review / clear-flag / note, applied straight
// through the active provider onto the contract's own record (a pending
// ChangeRequest from the deployed AirApp, merged immediately only from a
// standalone local run) — there is no separate approval step. Demo mode never
// writes anywhere; it only reflects the decision in memory.
async function submitDecision(id, patch) {
  const contract = contractById(id);
  if (!contract) return;
  if (state.demo) {
    Object.assign(contract, patch);
    render();
    return;
  }
  state.busy = true;
  state.notice = "";
  render();
  try {
    const provider = await getProvider();
    await provider.decideContract(id, patch);
    await loadState();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-load-more]")) {
    loadMore.loadMore(state.contracts);
    return;
  }
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    else state.sort = { key, dir: ["business_name", "category", "city", "status"].includes(key) ? "asc" : "desc" };
    render();
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
  const segment = event.target.closest("[data-filter], [data-by]");
  if (!segment) return;
  if (segment.dataset.filter) replaceRoute(filterUrl({ filter: segment.dataset.filter }));
  // A different grouping has different buckets: drop the peeked one.
  else replaceRoute(`#/concentration${routeQuery({}, { ...state.route, by: segment.dataset.by })}`);
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "toggle-flag") {
    submitDecision(id, { flagged: !contractById(id)?.flagged });
  } else if (button.dataset.action === "save-note") {
    submitDecision(id, { note: els.detailBody.querySelector("#reviewNote")?.value || "" });
  }
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
  replaceRoute(filterUrl({ query: els.search.value }));
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-portfolio-health-language", state.lang);
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
