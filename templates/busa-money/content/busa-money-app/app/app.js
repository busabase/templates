import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { summarizeAccounts } from "./js/money-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/money-views.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   ledger   → drawer: a transaction is a fact you scan many of — read the
//                      amounts and its invoice, then go back to the list.
//   accounts → page:   an account is a workplace — balances, sync health and
//                      its own slice of the ledger; you stay a while.
//   invoices → split:  reconciliation is a queue worked top to bottom, one
//                      exception after the next, so the queue stays beside it.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Route name → Base key (and snapshot array) behind it.
export const VIEW_BASE = { ledger: "transactions", accounts: "accounts", invoices: "invoices" };
const ID_FIELD = { transactions: "transaction_id", accounts: "account_id", invoices: "invoice_id" };
const INVOICE_STATES = ["all", "review", "matched"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Load more: nextCursor per Base (null at the end). One click, one request,
  // appended without duplicates — never a loop that drains the Base.
  cursors: {},
  loadingMore: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { transactions: new Map(), accounts: new Map(), invoices: new Map() },
  // Matches looked up on their own, keyed `<field>:<value>`.
  extraMatches: new Map(),
  route: parseRoute(),
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-money-language") || "auto",
  ),
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-money.sidebarCollapsed";

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
  txCount: byId("count-transactions"),
  accountCount: byId("count-accounts"),
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

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  try {
    return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

export function date(value, withTime = false) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the invoice match
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
    status: view === "invoices" && INVOICE_STATES.includes(status) ? status : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "invoices" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const sameViewRoute = (view) => (view === state.route.view ? state.route : { view, query: "", status: "all" });
export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, sameViewRoute(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id }, sameViewRoute(view))}`;

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
  state.cursors = { ...(data.pagination || {}) };
  state.loadingMore = {};
  state.totals = data.totals || {};
  state.extra = { transactions: new Map(), accounts: new Map(), invoices: new Map() };
  state.extraMatches = new Map();
  window.dispatchEvent(new CustomEvent("busa-money:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// True while a Base holds only part of its rows. Anything counted or summed
// from loaded rows must say so.
export function isPartial(key) {
  return Boolean(state.cursors[key]);
}

// Matches are read one page at a time too; when that page is not the whole
// Base (or the read failed), "no match found" means "not loaded", not "missing".
export function matchesIncomplete() {
  return isPartial("invoice-matches") || Boolean(state.settings?.side_errors?.["invoice-matches"]);
}

// The real total for a Base when records.count answered, else the loaded rows
// marked `+` while more pages exist.
export function totalLabel(key, loaded) {
  const total = state.totals[key];
  if (total != null) return String(total);
  return `${loaded}${isPartial(key) ? "+" : ""}`;
}

// Appends exactly one more page for `key` — one request per click.
export async function loadMore(key) {
  const cursor = state.cursors[key];
  if (!cursor || state.loadingMore[key]) return;
  const provider = state.provider;
  if (typeof provider?.fetchPage !== "function") return;
  state.loadingMore[key] = true;
  render();
  try {
    const { rows, nextCursor } = await provider.fetchPage(key, cursor);
    const idField = ID_FIELD[key];
    const existing = state.snapshot[key] || [];
    const seen = new Set(existing.map((row) => row[idField]));
    state.snapshot[key] = [...existing, ...rows.filter((row) => !seen.has(row[idField]))];
    state.cursors[key] = nextCursor || null;
    if (key === "accounts") {
      const { metrics, warnings } = summarizeAccounts(state.snapshot.accounts, state.snapshot.transactions.length);
      state.snapshot.metrics = metrics;
      state.snapshot.warnings = warnings;
    }
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
// The same goes for the invoice match an opened invoice or transaction needs.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = VIEW_BASE[view];
  const provider = state.provider;
  const serial = ++routeSerial;
  let changed = false;
  if (!recordById(key, selectedId) && !state.extra[key].has(selectedId)) {
    if (typeof provider?.getRecord !== "function") {
      state.extra[key].set(selectedId, null);
      render();
      return;
    }
    state.extra[key].set(selectedId, undefined);
    try {
      state.extra[key].set(selectedId, (await provider.getRecord(key, selectedId)) || null);
    } catch {
      state.extra[key].set(selectedId, null);
    }
    changed = true;
  }
  const matchField = key === "invoices" ? "invoice-id" : key === "transactions" ? "transaction-id" : "";
  if (matchField && matchesIncomplete() && typeof provider?.getRecord === "function") {
    const lookup = `${matchField}:${selectedId}`;
    const loaded = key === "invoices" ? loadedMatchForInvoice(selectedId) : loadedMatchForTransaction(selectedId);
    if (!loaded && !state.extraMatches.has(lookup)) {
      state.extraMatches.set(lookup, undefined);
      try {
        state.extraMatches.set(lookup, (await provider.getRecord("invoice-matches", selectedId, matchField)) || null);
      } catch {
        state.extraMatches.delete(lookup);
      }
      changed = true;
    }
  }
  if (changed && serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "accounts"
      ? "#/accounts"
      : scenario === "detail"
        ? "#/invoices?peek=inv-render-20260625"
        : scenario === "ledger"
          ? "#/ledger"
          : scenario === "invoices"
            ? "#/invoices"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
}

// ── Selectors ──────────────────────────────────────────────────────────────
export const transactions = () => state.snapshot?.transactions || [];
export const accounts = () => state.snapshot?.accounts || [];
export const invoices = () => state.snapshot?.invoices || [];
export const invoiceMatches = () => state.snapshot?.invoice_matches || [];

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(key, id) {
  if (!id) return null;
  return (state.snapshot?.[key] || []).find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

const loadedMatchForInvoice = (invoiceId) => invoiceMatches().find((match) => match.invoice_id === invoiceId);
const loadedMatchForTransaction = (transactionId) =>
  invoiceMatches().find((match) => match.transaction_id === transactionId);

// `undefined` = not known (match page incomplete and not looked up yet),
// `null` = known to have no match.
export function matchForInvoice(invoiceId) {
  const loaded = loadedMatchForInvoice(invoiceId);
  if (loaded) return loaded;
  const extra = state.extraMatches.get(`invoice-id:${invoiceId}`);
  if (extra !== undefined) return extra;
  return matchesIncomplete() ? undefined : null;
}

export function matchForTransaction(transactionId) {
  const loaded = loadedMatchForTransaction(transactionId);
  if (loaded) return loaded;
  const extra = state.extraMatches.get(`transaction-id:${transactionId}`);
  if (extra !== undefined) return extra;
  return matchesIncomplete() ? undefined : null;
}

// A relation here is a business id (`stripe-main`). Resolve it to a name;
// when the target is not loaded, say so — never print the id.
export function accountName(accountId) {
  if (!accountId) return "";
  return recordById("accounts", accountId)?.display_name || t("notLoaded");
}

export function invoiceNumber(invoiceId) {
  if (!invoiceId) return "";
  return recordById("invoices", invoiceId)?.invoice_number || t("notLoaded");
}

// An invoice needs review when its match is anything but `matched`, or when it
// has no match at all. Unknown (match not loaded) is not counted.
export function invoiceNeedsReview(invoice) {
  const match = matchForInvoice(invoice.invoice_id);
  if (match === undefined) return false;
  return !match || match.status !== "matched";
}

export const reviewInvoices = () => invoices().filter(invoiceNeedsReview);

export function invoiceStatusKey(invoice) {
  const match = matchForInvoice(invoice.invoice_id);
  if (match === undefined) return "unknown";
  return match ? match.status : "missing";
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredTransactions(accountId = "") {
  const query = state.route.query.trim().toLowerCase();
  return transactions().filter((tx) => {
    if (accountId && tx.account_id !== accountId) return false;
    if (!query || accountId) return true;
    const match = matchForTransaction(tx.transaction_id);
    return matches(
      [
        tx.description,
        tx.counterparty,
        tx.provider,
        accountName(tx.account_id),
        enumLabel(tx.type, "type"),
        enumLabel(tx.status),
        match ? enumLabel(match.status) : "",
        match ? invoiceNumber(match.invoice_id) : "",
      ],
      query,
    );
  });
}

export function filteredAccounts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return accounts();
  return accounts().filter((account) =>
    matches([account.display_name, account.provider, account.entity, account.currency, enumLabel(account.status)], query),
  );
}

export function filteredInvoices() {
  const query = state.route.query.trim().toLowerCase();
  return invoices().filter((invoice) => {
    if (state.route.status === "review" && !invoiceNeedsReview(invoice)) return false;
    if (state.route.status === "matched" && invoiceStatusKey(invoice) !== "matched") return false;
    if (!query) return true;
    return matches(
      [
        invoice.invoice_number,
        invoice.vendor,
        invoice.customer,
        enumLabel(invoice.status),
        enumLabel(invoice.direction),
        invoice.source,
        enumLabel(invoiceStatusKey(invoice)),
      ],
      query,
    );
  });
}

export function invoiceStates() {
  return INVOICE_STATES;
}

// ── Shell ──────────────────────────────────────────────────────────────────
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
  els.search.setAttribute("aria-label", t("search"));
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  els.viewRefresh.title = t("refresh");
  els.viewRefresh.setAttribute("aria-label", t("refresh"));
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
  els.statusSelect.setAttribute("aria-label", t("match"));
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const review = reviewInvoices().length;
  const reviewLabel = `${review}${isPartial("invoices") ? "+" : ""}`;
  const configuredCount = totalLabel("accounts", accounts().length);
  const txCount = totalLabel("transactions", transactions().length);
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = reviewLabel;
  if (els.txCount) els.txCount.textContent = txCount;
  if (els.accountCount) els.accountCount.textContent = configuredCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !snapshot
      ? t("loading")
      : review
        ? `${reviewLabel} ${t("invoiceNeedsReview")}`
        : `${txCount} ${t("tx")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "ledger") return t("ledger");
  if (view === "accounts") return t("accounts");
  if (view === "invoices") return t("invoices");
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
function openRow(url) {
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
}

els.listPanel.addEventListener("click", (event) => {
  const more = event.target.closest("[data-load-more]");
  if (more) {
    loadMore(more.dataset.loadMore);
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (row) openRow(recordUrl(row.dataset.id));
});
// Rows inside a detail (an account's ledger) open their own record.
els.detailBody.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-href]");
  if (row) location.hash = row.dataset.href;
});
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (!segment) return;
  replaceRoute(`#/invoices${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(`#/invoices${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("input, textarea, select")) {
    event.target.blur();
    return;
  }
  if (document.body.classList.contains("sidebar-open")) {
    setMobileSidebarOpen(false);
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
// A failed refresh keeps the rows already on screen and says why.
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () =>
    loadState().catch((error) => {
      if (!state.snapshot) return showLoadError(error);
      state.notice = error instanceof Error ? error.message : String(error);
      render();
    }),
  );
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-money-language", state.lang);
  render();
});

function showLoadError(error) {
  state.snapshot = null;
  render();
  els.loadState.hidden = false;
  els.loadState.classList.add("error");
  els.loadState.textContent = error instanceof Error ? error.message : String(error);
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
    showLoadError(error);
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
