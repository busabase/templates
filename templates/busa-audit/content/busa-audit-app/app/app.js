import { messages } from "./i18n/messages.js";
import {
  renderOverview,
  renderRecordView,
  renderSettings,
  submitDecision,
} from "./js/audit-views.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   orders    → page:   an order is where an audit trail is traced — order →
//                       invoices → payments plus the anomalies raised on it —
//                       so it owns related lists and earns the whole screen.
//   invoices  → drawer: invoices are scanned for aging and overdue amounts; you
//                       read one invoice's payments and return to the list.
//   anomalies → split:  the review queue is worked top to bottom, one verdict
//                       after the next, so the queue stays beside the record.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
export const ANOMALY_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

export const state = {
  // Prev/Next pager per Base. records.list only exposes a forward keyset
  // cursor, so pageCursors[key][i] is the cursor that fetches page i+1. Only
  // neighbouring pages are reachable — one click, one request; there is no
  // "jump to page N" because reaching it would mean reading every page between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { orders: new Map(), invoices: new Map(), anomalies: new Map() },
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-audit-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-audit.sidebarCollapsed";

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
  reviewCount: byId("count-review"),
  approvedCount: byId("count-approved"),
  blockedCount: byId("count-blocked"),
  language: byId("language"),
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

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

export function money(value, currency) {
  const code = currency || state.snapshot?.base_currency || "USD";
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: code, maximumFractionDigits: 2 }).format(
      Number(value || 0),
    );
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

export function n(value) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function date(value) {
  if (!value) return "";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the anomaly status
// filter and the peeked record live in the URL so refresh, shared links and
// Back restore the same list context.
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
    status: ANOMALY_FILTERS.includes(status) ? status : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "anomalies" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const otherView = (view) => ({ view, query: "", status: "all" });

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : otherView(view);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : otherView(view);
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
  state.extra = { orders: new Map(), invoices: new Map(), anomalies: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-audit:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// The page count needs an honest total (records.count); without one the pager
// shows Prev/Next only.
export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything summed from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends, never
// walks forward to reach a far page.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return;
  const provider = state.provider || (await getProvider());
  if (typeof provider.fetchPage !== "function") return;
  state.pageLoading[key] = true;
  render();
  try {
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
  const mismatch = (state.snapshot?.anomalies || []).find((item) => item.rule === "amount_mismatch");
  const route =
    scenario === "orders"
      ? "#/orders"
      : scenario === "invoices"
        ? "#/invoices"
        : scenario === "anomalies"
          ? "#/anomalies"
          : scenario === "detail" && mismatch
            ? `#/anomalies?peek=${encodeURIComponent(mismatch.id)}`
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
  for (const button of [els.refresh, els.viewRefresh]) button.title = t("refresh");
  els.viewRefresh.setAttribute("aria-label", t("refresh"));
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

// ── Records ────────────────────────────────────────────────────────────────
export function anomalies() {
  const list = state.snapshot?.anomalies || [];
  if (!state.demo) return list;
  return list.map(withDemoDecision);
}

function withDemoDecision(anomaly) {
  const local = state.demoDecisions[anomaly.id];
  if (!local) return anomaly;
  let status = anomaly.status;
  if (local.action === "approve") status = "approved";
  if (local.action === "request_changes") status = "changes_requested";
  if (local.action === "block") status = "blocked";
  if (local.action === "dismiss") status = "done";
  return { ...anomaly, status, decision: local, draft: local.draft ?? anomaly.draft };
}

export function orders() {
  return state.snapshot?.orders || [];
}

export function invoices() {
  return state.snapshot?.invoices || [];
}

function payments() {
  return state.snapshot?.payments || [];
}

const ID_FIELD = { orders: "order_id", invoices: "invoice_id", anomalies: "id" };

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const rows = view === "anomalies" ? anomalies() : state.snapshot?.[view] || [];
  const found = rows.find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
  return found && view === "anomalies" && state.demo ? withDemoDecision(found) : found;
}

export function anomalyById(id) {
  return recordById("anomalies", id);
}

export function orderById(id) {
  return recordById("orders", id);
}

export function invoiceById(id) {
  return recordById("invoices", id);
}

export function paymentById(id) {
  return payments().find((item) => item.payment_id === id);
}

// The real total when records.count gave one; otherwise the loaded rows, with
// a `+` while more pages exist.
export function recordCountLabel(key, loadedCount) {
  const total = state.totals?.[key];
  if (total != null) return n(total);
  return `${n(loadedCount)}${isPartial(key) ? "+" : ""}`;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const list = anomalies();
  const reviewCount = list.filter((item) => item.status === "needs_review").length;
  const approvedCount = list.filter((item) => item.status === "approved").length;
  const blockedCount = list.filter((item) => item.status === "blocked").length;
  // Where the data comes from — the counts already sit next to the nav items.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  for (const key of RECORD_VIEWS) {
    const node = byId(`nav-count-${key}`);
    if (node) node.textContent = snapshot ? recordCountLabel(key, (snapshot[key] || []).length) : "";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needsReview")}`
      : `${recordCountLabel("orders", orders().length)} ${t("orders").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "orders") return t("orders");
  if (view === "invoices") return t("invoices");
  if (view === "anomalies") return t("anomalies");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  if (!status) return "";
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function ruleBadge(rule) {
  return `<span class="badge badge-${escapeHtml(rule)}">${escapeHtml(enumLabel(rule, "rule"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="badge badge-severity-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function anomalyBadges(anomalyIds) {
  const list = (anomalyIds || []).map((id) => anomalyById(id)).filter(Boolean);
  if (!list.length) return `<span class="muted">—</span>`;
  return list
    .map(
      (anomaly) =>
        `<a class="badge badge-${escapeHtml(anomaly.rule)}" href="${recordUrl(anomaly.id, "anomalies")}" title="${escapeHtml(anomaly.title)}">#${anomaly.ref} ${escapeHtml(enumLabel(anomaly.rule, "rule"))}</a>`,
    )
    .join(" ");
}

export function warningsPanel(filter = () => true) {
  const items = (state.snapshot?.warnings || []).filter(filter);
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

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

// ── Search (over the loaded page) ──────────────────────────────────────────
function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredOrders() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return orders();
  return orders().filter((order) =>
    matches([order.order_no, order.customer, order.invoice_status, order.payment_status, order.currency], query),
  );
}

export function filteredInvoices() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return invoices();
  return invoices().filter((invoice) =>
    matches([invoice.invoice_no, invoice.order_no, invoice.customer, invoice.status, invoice.currency], query),
  );
}

export function filteredAnomalies() {
  const query = state.route.query.trim().toLowerCase();
  return anomalies().filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    return matches([item.title, item.customer, item.rule, item.reason, String(item.ref)], query);
  });
}

// ── Render ─────────────────────────────────────────────────────────────────
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
  els.viewPage.dataset.view = onRecordView ? view : "";
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
const setStatusFilter = (status) =>
  replaceRoute(`#/anomalies${routeQuery({ peek: state.route.peek }, { ...state.route, status })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (segment) setStatusFilter(segment.dataset.status);
});
els.statusSelect.addEventListener("change", (event) => setStatusFilter(event.target.value));
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) submitDecision(button.dataset.id, button.dataset.decision);
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
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState());
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-audit-language", state.lang);
  if (state.demo) loadState();
  else render();
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
