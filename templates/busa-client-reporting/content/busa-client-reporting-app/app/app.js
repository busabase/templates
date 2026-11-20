import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { buildSnapshot } from "./js/reporting-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderReportPage } from "./js/reporting-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Pages: `overview` (client list + rollups), `report` (the client-facing
// page for one client + period) and `reports` (the report list/detail).
// Only `reports` is a record view; its detail mode comes from config.js —
// a drawer, because the list is scanned and one report checked at a time.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const PAGES = ["overview", "report", ...RECORD_VIEWS];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // records.list cursors per Base; null when that Base is fully loaded.
  pagination: {},
  loadingMore: false,
  extra: new Map(),
  route: parseRoute(),
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-client-reporting-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-client-reporting.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  reportPage: byId("reportPage"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewNotice: byId("viewNotice"),
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
  readyCount: byId("count-ready"),
  language: byId("language"),
  clientPicker: byId("clientPicker"),
  periodPicker: byId("periodPicker"),
  reportBody: byId("reportBody"),
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

export function statusLabel(value) {
  return t("statuses")?.[value] || messages.en.statuses?.[value] || String(value || "");
}

// `2026-10-09` → "Oct 9" / "10月9日"; anything else shows as typed.
export function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "");
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function formatNumber(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { maximumFractionDigits: 2 }).format(n) : String(value);
}

export function formatChange(fraction) {
  if (fraction == null) return "—";
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<page>[/<record>][?q=…&peek=…&client=…&period=…]`. Search, the peeked
// record and the report page's client/period live in the URL so refresh,
// shared links and Back restore the same context.
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
  if (!PAGES.includes(view)) view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: mode ? params.get("q") || "" : "",
    client: params.get("client") || "",
    period: params.get("period") || "",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "report") {
    if (route.client) params.set("client", route.client);
    if (route.period) params.set("period", route.period);
  }
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};
export const reportUrl = (clientId, period = "") =>
  `#/report${routeQuery({ client: clientId, ...(period ? { period } : {}) }, { view: "report", query: "", client: "", period: "" })}`;

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.view !== state.route.view) state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
  ensureSelectedRecord();
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
  state.pagination = data.pagination || {};
  state.extra = new Map();
  window.dispatchEvent(new CustomEvent("busa-client-reporting:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// One more page of one Base, appended without duplicates — exactly one
// request per click.
export async function loadMore(key = "reports") {
  if (state.loadingMore || !state.pagination?.[key] || typeof state.provider?.fetchPage !== "function") return;
  state.loadingMore = true;
  render();
  try {
    const result = await state.provider.fetchPage(key, state.pagination[key]);
    if (result.snapshot) {
      state.snapshot = result.snapshot;
    } else if (Array.isArray(result.rows)) {
      const normalizeKey = key;
      const seen = new Set((state.snapshot[normalizeKey] || []).map((row) => row.__recordId));
      const fresh = result.rows.filter((row) => row.__recordId && !seen.has(row.__recordId));
      state.snapshot = buildSnapshot({
        clients: state.snapshot.clients,
        projects: state.snapshot.projects,
        deliverables: state.snapshot.deliverables,
        metrics: state.snapshot.metrics,
        milestones: state.snapshot.milestones,
        reports: state.snapshot.reports,
        [normalizeKey]: [...(state.snapshot[normalizeKey] || []), ...fresh],
      });
    }
    state.pagination = { ...state.pagination, [key]: result.nextCursor };
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore = false;
    render();
  }
}

// True while more rows exist than are loaded in any Base: anything counted
// from loaded rows must say so.
export const isPartial = () => Object.values(state.pagination || {}).some(Boolean);

// A record named by the URL but not on a loaded page is read on its own
// instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (recordById(selectedId) || state.extra.has(selectedId)) return;
  if (typeof state.provider?.getRecord !== "function") {
    state.extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra.set(selectedId, undefined);
  try {
    state.extra.set(selectedId, (await state.provider.getRecord("reports", selectedId)) || null);
  } catch {
    state.extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

export function reports() {
  return state.snapshot?.reports || [];
}

export function recordById(id) {
  if (!id) return null;
  return reports().find((item) => item.__recordId === id) || state.extra.get(id) || null;
}

function matches(item, query) {
  const clientName = state.snapshot?.clientById?.get(item.client)?.client_name || "";
  return [item.report_title, clientName, item.period, statusLabel(item.status)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function viewRows(view = state.route.view) {
  const rows = view === "reports" ? reports() : [];
  const query = state.route.query.trim().toLowerCase();
  return query ? rows.filter((item) => matches(item, query)) : rows;
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
  for (const button of [els.refresh, els.viewRefresh]) {
    button.textContent = t("refresh");
    button.title = t("refresh");
  }
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("reportPageTitle").textContent = t("reportTitle");
  byId("reportPageHint").textContent = t("reportHint");
  els.detailExpand.textContent = t("openFullPage");
}

function renderShell() {
  applyI18n();
  const ready = state.snapshot?.counts?.reports_ready ?? 0;
  const readyLabel = `${ready}${isPartial() ? "+" : ""}`;
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.readyCount) els.readyCount.textContent = readyLabel;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) els.mobileViewMeta.textContent = `${readyLabel} ${t("attentionUnit")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (link.closest(".filters")) link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "reports") return t("reportsTitle");
  if (view === "report") return t("reportTitle");
  return t("overview");
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
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
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.reportPage.hidden = !ready || view !== "report";
  els.viewPage.hidden = !onRecordView;
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else if (view === "report") renderReportPage();
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
  const more = event.target.closest("[data-load-more]");
  if (more) {
    loadMore(more.dataset.loadMore || "reports");
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("input, textarea, select")) {
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
els.clientPicker?.addEventListener("change", () => {
  replaceRoute(reportUrl(els.clientPicker.value, state.route.period));
});
els.periodPicker?.addEventListener("change", () => {
  replaceRoute(reportUrl(state.route.client, els.periodPicker.value));
});
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState());
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-client-reporting-language", state.lang);
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
