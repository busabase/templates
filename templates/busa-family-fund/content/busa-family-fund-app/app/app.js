import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { buildSnapshot, computeInsights } from "./js/fund-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/fund-views.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   ledger   → drawer: an entry is a fact you scan many of, read, and return
//                      to the timeline.
//   family   → page:   a family is a workplace of its own — its fairness facts
//                      plus its directed and shared expense lists.
//   category → drawer: a category total is scanned, its entries peeked at,
//                      then you move to the next one.
// A `/record` path always opens the full page; `?peek=` drives the drawer.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Views whose list a search box narrows.
const SEARCH_VIEWS = ["ledger", "family"];

export const state = {
  snapshot: null,
  settings: null,
  route: null,
  // "" means every month. Shared by Overview and the Ledger; the URL carries
  // it on the Ledger (`?month=`) so refresh and shared links keep the filter.
  month: "",
  monthTouched: false,
  pageError: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-family-fund-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-family-fund.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewTitle: byId("overviewTitle"),
  overviewSummary: byId("overviewSummary"),
  overviewMonth: byId("overviewMonth"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  monthSelect: byId("monthSelect"),
  searchBox: byId("searchBox"),
  search: byId("search"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  settingsPage: byId("settingsPage"),
  settingsTitle: byId("settingsTitle"),
  settingsBody: byId("settingsBody"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  balanceCount: byId("count-balance"),
  familyCount: byId("count-families"),
  entryCount: byId("count-entries"),
  language: byId("language"),
};

export const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    const snapshot = buildSnapshot({ ...state.snapshot, [key]: rows });
    snapshot.insights = computeInsights(snapshot, state.settings?.config_summary?.deviation_threshold_pct);
    state.snapshot = snapshot;
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.pageError = error instanceof Error ? error.message : String(error);
  },
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

export function categoryLabel(value) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.category?.[key] || messages.en.enum?.category?.[key] || key;
}

export function money(value, currency = state.snapshot?.base_currency || "CNY") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function pct(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

export function signedPct(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&month=…&peek=…]`. Search, the ledger month and the
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
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: SEARCH_VIEWS.includes(view) ? params.get("q") || "" : "",
    month: params.has("month") ? params.get("month") || "all" : null,
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "ledger" && state.monthTouched) params.set("month", state.month || "all");
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
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

function applyRouteMonth() {
  if (state.route.month == null) return;
  state.month = state.route.month === "all" ? "" : state.route.month;
  state.monthTouched = true;
}

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  applyRouteMonth();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// changes should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  applyRouteMonth();
  previousRouteWasList = previousWasList;
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.pageError = "";
  window.dispatchEvent(new CustomEvent("busa-family-fund:state", { detail: data }));
  const monthKeys = months().map((m) => m.month);
  if (state.month && !monthKeys.includes(state.month)) state.monthTouched = false;
  if (!state.monthTouched) state.month = monthKeys.length ? monthKeys[monthKeys.length - 1] : "";
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const map = {
    ledger: "#/ledger",
    family: "#/family",
    detail: "#/family/fam-01",
    category: "#/category",
    overview: "#/overview",
  };
  const route = map[scenario] || "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
}

export function fund() {
  return state.snapshot?.fund || {};
}

export function beneficiaries() {
  return state.snapshot?.beneficiaries || [];
}

export function families() {
  return state.snapshot?.families || [];
}

export function incomeRows() {
  return state.snapshot?.income || [];
}

export function expenseRows() {
  return state.snapshot?.expenses || [];
}

export function months() {
  return state.snapshot?.months || [];
}

export function totals() {
  return state.snapshot?.totals || {};
}

export function byCategory() {
  return state.snapshot?.by_category || [];
}

export function byFamily() {
  return state.snapshot?.by_family || [];
}

export function hasData() {
  return months().length > 0;
}

// A relation that points at a record outside the loaded page says so instead
// of printing the raw id.
export function familyName(familyId) {
  if (!familyId) return "";
  return families().find((f) => f.id === familyId)?.name || t("notLoaded");
}

export function beneficiaryName(id) {
  if (!id) return "";
  return beneficiaries().find((b) => b.id === id)?.name || t("notLoaded");
}

// Income and expenses merged into one timeline; `id` is each entry's own id.
export function allLedgerEntries() {
  const entries = [];
  for (const row of incomeRows()) {
    entries.push({
      id: row.id,
      kind: "income",
      month: row.month,
      date: row.month,
      category: "",
      amount: row.amount,
      label: beneficiaryName(row.beneficiary_id),
      occasion: row.note || "",
      note: "",
      family_id: null,
      shared: false,
    });
  }
  for (const row of expenseRows()) {
    entries.push({
      id: row.id,
      kind: "expense",
      month: row.month,
      date: row.date || row.month,
      category: row.category,
      amount: row.amount,
      label: row.payee || "",
      occasion: row.occasion || "",
      note: row.note || "",
      family_id: row.family_id,
      shared: row.shared,
    });
  }
  return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function ledgerEntries() {
  const query = state.route.query.trim().toLowerCase();
  return allLedgerEntries().filter((entry) => {
    if (state.month && entry.month !== state.month) return false;
    if (!query) return true;
    return [entry.label, entry.occasion, categoryLabel(entry.category), familyName(entry.family_id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function filteredFamilies() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return byFamily();
  return byFamily().filter((row) => {
    const family = families().find((f) => f.id === row.family_id) || {};
    return [row.name, family.head].some((value) => String(value || "").toLowerCase().includes(query));
  });
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
  els.detailBack.textContent = t("backToList");
  els.detailExpand.textContent = t("openFullPage");
  els.overviewMonth.setAttribute("aria-label", t("month"));
  els.monthSelect.setAttribute("aria-label", t("month"));
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function renderShell() {
  applyI18n();
  const balance = totals().balance || 0;
  const familyCount = pagination.total("families", families().length);
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : !hasData()
      ? t("needsEntry")
      : state.settings?.demo
        ? t("demoData")
        : t("liveData");
  if (els.balanceCount) els.balanceCount.textContent = money(balance);
  if (els.familyCount) els.familyCount.textContent = familyCount;
  if (els.entryCount) els.entryCount.textContent = entryTotal();
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = hasData() ? `${money(balance)} · ${familyCount} ${t("familyCount")}` : t("needsEntry");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

// Income + expense entries; records.count totals when the provider has them,
// otherwise the loaded rows with a "+" while more pages exist.
function entryTotal() {
  const income = pagination.total("income", incomeRows().length);
  const expenses = pagination.total("expenses", expenseRows().length);
  const partial = [income, expenses].some((value) => String(value).endsWith("+"));
  const sum = Number.parseInt(income, 10) + Number.parseInt(expenses, 10);
  return `${Number.isFinite(sum) ? sum : 0}${partial ? "+" : ""}`;
}

export function viewLabel(view) {
  if (view === "ledger") return t("ledger");
  if (view === "family") return t("family");
  if (view === "category") return t("category");
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
  body.toggle("ws-layout-split", false);
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
pagination.bind(els.listPanel);
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while the drawer is open replaces the entry, so Close
  // still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
// Rows inside a detail (a family's expenses, a category's entries) open that
// entry in the Ledger.
els.detailBody.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-href]");
  if (row) location.hash = row.dataset.href;
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("input, select, textarea")) {
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
  const route = { ...state.route, query: els.search.value };
  replaceRoute(`#/${route.view}${routeQuery({ peek: state.route.peek }, route)}`);
});
els.monthSelect.addEventListener("change", () => {
  state.month = els.monthSelect.value;
  state.monthTouched = true;
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek })}`);
});
els.overviewMonth.addEventListener("change", () => {
  state.month = els.overviewMonth.value;
  state.monthTouched = true;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-family-fund-language", state.lang);
  render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    renderSetupRequired(error, boot);
  }
}

state.route = parseRoute();
applyRouteMonth();
els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
