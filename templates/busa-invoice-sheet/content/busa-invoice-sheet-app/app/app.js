import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeInvoiceFromRow, WORKFLOW_STATUSES } from "./js/invoice-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const messages = window.KELLY_INVOICE_SHEET_MESSAGES || {};

// Where an invoice opens — declared once in config.js `ui.detail_modes`.
// The invoice view is a review queue worked top to bottom, so it is a split:
// the queue stays beside the record. A `/<id>` path always opens the full
// page; `?peek=<id>` drives the split. On a phone every mode is a page
// (base-ui.css handles that).
const DETAIL_MODE = appConfig.ui?.detail_modes?.invoices || "split";
// Each nav view is one workflow status (or all of them).
const VIEWS = ["all", ...WORKFLOW_STATUSES];
const STATUS_DOT = {
  needs_review: "warning",
  changes_requested: "active",
  approved: "positive",
  done: "",
  blocked: "danger",
};
const FIELD_ROWS = [
  ["vendor", "vendor_name"],
  ["taxId", "vendor_tax_id"],
  ["invoiceNumber", "invoice_number"],
  ["invoiceDate", "invoice_date"],
  ["dueDate", "due_date"],
  ["currency", "currency"],
  ["subtotal", "subtotal", "number"],
  ["tax", "tax", "number"],
  ["total", "total", "number"],
  ["amountDue", "amount_due", "number"],
  ["paymentTerms", "payment_terms"],
  ["purchaseOrder", "purchase_order"],
];
const NUMBER_FIELDS = new Set(["subtotal", "tax", "total", "amount_due"]);

const params = new URLSearchParams(window.location.search);
const state = {
  data: null,
  provider: null,
  route: null,
  // The last record-view/overview route, kept under the Settings modal.
  baseRoute: null,
  // Status views read their own page from the server once the unfiltered
  // page no longer holds every row: { rows, cursor, loading, error }.
  lists: {},
  // Records opened by URL that are not on a loaded page (records.get).
  extra: new Map(),
  allCursor: null,
  loadingMore: false,
  loadMoreError: false,
  hasLoadedMore: false,
  edits: {},
  notice: "",
  extractOpen: false,
  extractSource: "upload",
  lang: normalizeLang(params.get("lang") || localStorage.getItem("busa-invoice-sheet-lang") || "auto"),
};

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  statusNav: byId("statusNav"),
  syncStatus: byId("syncStatus"),
  humanPrimary: byId("humanWorkPrimary"),
  humanSecondary: byId("humanWorkSecondary"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  extractDialog: byId("extractDialog"),
  settingsModal: byId("settingsModal"),
};

// ── Formatting ──────────────────────────────────────────────────────────────
function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  return value === "en" ? "en" : "auto";
}

function activeLang() {
  if (state.lang === "zh" || state.lang === "en") return state.lang;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key, vars) {
  const text = messages[activeLang()]?.[key] ?? messages.en?.[key] ?? key;
  if (!vars) return text;
  return Object.entries(vars).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text);
}

// Option ids never reach the screen: a known id gets its label, an unknown
// one is humanised rather than printed raw.
function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  const label = messages[activeLang()]?.enum?.[group]?.[key] || messages.en?.enum?.[group]?.[key];
  if (label) return label;
  const words = key.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statusLabel(status) {
  return VIEWS.includes(status) ? t(status) : enumLabel(status, "status");
}

function locale() {
  return activeLang() === "zh" ? "zh-CN" : "en-US";
}

function formatMoney(value, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value);
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function threshold() {
  return state.data?.config_summary?.extraction?.low_confidence_threshold ?? 0.82;
}

function statusBadge(status) {
  const dot = STATUS_DOT[status] ?? "";
  return `<span class="badge${dot ? ` ${dot}` : ""}">${escapeHtml(statusLabel(status))}</span>`;
}

// ── Routing ─────────────────────────────────────────────────────────────────
// `#/overview` · `#/invoices/<view>[/<id>][?q=…&peek=…]` · `#/settings`.
// Search and the peeked record live in the URL so refresh, shared links and
// Back restore the same list context.
function parseRoute() {
  const raw = (window.location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const search = new URLSearchParams(query);
  if (parts[0] === "settings") return { page: "settings" };
  if (parts[0] !== "invoices") return { page: "overview" };
  const view = VIEWS.includes(parts[1]) ? parts[1] : "all";
  let id = "";
  try {
    id = parts[2] ? decodeURIComponent(parts[2]) : "";
  } catch {
    id = "";
  }
  const peek = !id && DETAIL_MODE !== "page" ? search.get("peek") || "" : "";
  return {
    page: "invoices",
    view,
    id,
    peek,
    selectedId: id || peek,
    presentation: id ? "page" : peek ? DETAIL_MODE : null,
    query: search.get("q") || "",
  };
}

function routeQuery(route, extra = {}) {
  const search = new URLSearchParams();
  if (route.query) search.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

function routeHash(route) {
  if (!route || route.page === "overview") return "#/overview";
  if (route.page === "settings") return "#/settings";
  if (route.id) return `#/invoices/${route.view}/${encodeURIComponent(route.id)}${routeQuery(route)}`;
  return `#/invoices/${route.view}${routeQuery(route, { peek: route.peek })}`;
}

const listUrl = (route = state.route) => `#/invoices/${route.view}${routeQuery(route)}`;
const detailUrl = (id, route = state.route) => `#/invoices/${route.view}/${encodeURIComponent(id)}${routeQuery(route)}`;
// What a row (or an overview link) opens: the page for a `page` view, else `?peek=`.
function recordUrl(id, view = state.route?.view || "all") {
  const route = state.route?.page === "invoices" && view === state.route.view ? state.route : { view, query: "" };
  if (DETAIL_MODE === "page") return detailUrl(id, route);
  return `#/invoices/${view}${routeQuery(route, { peek: id })}`;
}

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  if (state.route.page !== "settings") state.baseRoute = state.route;
  // A detail opened from its own list steps Back/Close/Escape back to that
  // exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = state.route.page === "invoices" && !state.route.selectedId;
  state.notice = "";
  if (state.route.page === "invoices") els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureList();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const keep = previousRouteWasList;
  state.route = parseRoute();
  state.baseRoute = state.route;
  previousRouteWasList = keep;
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else window.location.hash = listUrl();
}

function closeSettings() {
  window.location.hash = routeHash(state.baseRoute);
}

// ── Data ────────────────────────────────────────────────────────────────────
function allRows() {
  return state.data?.batch?.invoices || [];
}

// While the unfiltered page holds every row (always in demo), a status view
// is exact from it. Once more rows exist, each status view reads its own page.
function exactLocally() {
  return Boolean(state.data?.demo) || !state.allCursor;
}

function listState(view) {
  if (view === "all") {
    return { rows: allRows(), cursor: state.allCursor, loading: state.loadingMore, error: state.loadMoreError };
  }
  if (exactLocally()) return { rows: allRows().filter((invoice) => invoice.status === view), cursor: null };
  return state.lists[view] || { rows: [], cursor: null, loading: true, initial: true };
}

async function ensureList() {
  const { page, view } = state.route;
  if (!state.data || page !== "invoices" || view === "all" || exactLocally() || state.lists[view]) return;
  const provider = state.provider;
  if (typeof provider?.fetchPage !== "function") return;
  state.lists[view] = { rows: [], cursor: null, loading: true, initial: true };
  render();
  try {
    const result = await provider.fetchPage("invoices", undefined, { status: view });
    state.lists[view] = { rows: result.rows.map(computeInvoiceFromRow), cursor: result.nextCursor, loading: false };
  } catch {
    state.lists[view] = { rows: [], cursor: null, loading: false, error: true, initial: true };
  }
  render();
}

async function loadMore() {
  const view = state.route.view;
  const provider = state.provider;
  if (typeof provider?.fetchPage !== "function") return;
  if (view === "all") {
    if (!state.allCursor || state.loadingMore) return;
    state.loadingMore = true;
    state.loadMoreError = false;
    render();
    try {
      const page = await provider.fetchPage("invoices", state.allCursor);
      const invoices = state.data.batch.invoices;
      const known = new Set(invoices.map((invoice) => invoice.id));
      invoices.push(...page.rows.map(computeInvoiceFromRow).filter((invoice) => !known.has(invoice.id)));
      state.allCursor = page.nextCursor;
      state.hasLoadedMore = true;
    } catch {
      state.loadMoreError = true;
    } finally {
      state.loadingMore = false;
      render();
    }
    return;
  }
  const list = state.lists[view];
  if (!list?.cursor || list.loading) return;
  list.loading = true;
  list.error = false;
  render();
  try {
    const page = await provider.fetchPage("invoices", list.cursor, { status: view });
    const known = new Set(list.rows.map((invoice) => invoice.id));
    list.rows.push(...page.rows.map(computeInvoiceFromRow).filter((invoice) => !known.has(invoice.id)));
    list.cursor = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    list.error = true;
  } finally {
    list.loading = false;
    render();
  }
}

function recordById(id) {
  if (!id) return null;
  const found = allRows().find((invoice) => invoice.id === id);
  if (found) return found;
  for (const list of Object.values(state.lists)) {
    const hit = list.rows?.find((invoice) => invoice.id === id);
    if (hit) return hit;
  }
  return state.extra.get(id) || null;
}

async function ensureSelectedRecord() {
  const id = state.route?.selectedId;
  if (!state.data || !id || recordById(id) || state.extra.has(id)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra.set(id, null);
    render();
    return;
  }
  state.extra.set(id, undefined);
  render();
  try {
    state.extra.set(id, (await provider.getRecord(id)) || null);
  } catch {
    state.extra.set(id, null);
  }
  render();
}

async function loadState({ quiet = false } = {}) {
  if (quiet) {
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
    if (state.hasLoadedMore || state.extractOpen || state.route?.page === "settings") return;
  }
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.data = data;
  state.allCursor = data.pagination?.invoices || null;
  state.lists = {};
  state.extra = new Map();
  state.hasLoadedMore = false;
  window.dispatchEvent(new CustomEvent("busa-invoice-sheet:state", { detail: data }));
  render();
  ensureList();
  ensureSelectedRecord();
}

function metrics() {
  return state.data?.batch?.metrics || {};
}

// ── Shell ───────────────────────────────────────────────────────────────────
function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function viewLabel() {
  const route = state.baseRoute || state.route;
  return route?.page === "invoices" ? statusLabel(route.view) : t("overview");
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  els.search.placeholder = t("searchPlaceholder");
  els.search.setAttribute("aria-label", t("search"));
  byId("overviewTitle").textContent = t("overview");
  els.detailExpand.textContent = t("openFullPage");
}

function renderShell() {
  applyI18n();
  const m = metrics();
  const ready = Boolean(state.data);
  const partial = Boolean(state.allCursor);
  els.syncStatus.textContent = !ready ? t("loading") : state.data.demo ? t("demoData") : t("liveData");
  const needs = m.needs_review || 0;
  els.humanPrimary.innerHTML = needs
    ? `<strong>${needs}</strong> <span>${escapeHtml(t("needReview"))}</span>`
    : `<span>${escapeHtml(t("nothingToReview"))}</span>`;
  // Low confidence is counted on the loaded rows only, so it says so.
  els.humanSecondary.textContent = ready
    ? `${m.low_confidence || 0}${partial ? "+" : ""} ${t("lowConfidence")}`
    : "";
  const route = state.baseRoute || state.route;
  els.statusNav.innerHTML = VIEWS.map((view) => {
    const count = view === "all" ? (m.total ?? 0) : (m[view] ?? 0);
    const active = route?.page === "invoices" && route.view === view;
    return `<a class="filter${active ? " active" : ""}" href="#/invoices/${view}" title="${escapeHtml(t(`${view}Hint`))}"><span>${escapeHtml(statusLabel(view))}</span><b>${ready ? count : ""}</b></a>`;
  }).join("");
  for (const link of document.querySelectorAll("[data-route]")) {
    const target = link.dataset.route;
    link.classList.toggle("active", target === "settings" ? state.route?.page === "settings" : route?.page === target);
  }
  els.mobileViewTitle.textContent = viewLabel();
  els.mobileViewMeta.textContent = ready ? (needs ? `${needs} ${t("needReview")}` : t("nothingToReview")) : t("loading");
}

function render() {
  renderShell();
  const ready = Boolean(state.data);
  const route = state.route?.page === "settings" ? state.baseRoute || { page: "overview" } : state.route;
  const onView = ready && route.page === "invoices";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onView && Boolean(route.selectedId));
  body.toggle("ws-detail-page", onView && route.presentation === "page");
  body.toggle("ws-detail-drawer", onView && route.presentation === "drawer");
  body.toggle("ws-layout-split", onView && DETAIL_MODE === "split" && route.presentation !== "page");
  body.toggle("ws-searching", onView && Boolean(route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || route.page !== "overview";
  els.viewPage.hidden = !onView;
  if (ready) {
    if (onView) renderRecordView(route);
    else renderOverview();
  }
  renderExtractDialog();
  renderSettings();
}

// ── Overview ────────────────────────────────────────────────────────────────
function sumByCurrency(items) {
  const sums = new Map();
  for (const invoice of items) {
    if (typeof invoice.total !== "number" || !Number.isFinite(invoice.total)) continue;
    const currency = invoice.currency || "USD";
    sums.set(currency, (sums.get(currency) || 0) + invoice.total);
  }
  return sums;
}

function moneyCell(sums) {
  const fallback = state.data?.config_summary?.default_currency || "USD";
  if (!sums.size) return { text: formatMoney(0, fallback), title: "" };
  const parts = [...sums].map(([currency, value]) => formatMoney(value, currency));
  return parts.length === 1
    ? { text: parts[0], title: "" }
    : { text: t("mixedCurrencies"), title: parts.join(" · ") };
}

const isFlagged = (invoice) =>
  !["done", "approved"].includes(invoice.status) && (invoice.risk.length > 0 || invoice.warnings.length > 0);

// Three numbers the nav does not already show. Sums across invoices have no
// server aggregate in the pinned SDK, so they come from the loaded rows and
// say so while more rows exist than are loaded.
function metricsBand() {
  const rows = allRows();
  const awaiting = moneyCell(sumByCurrency(rows.filter((i) => ["needs_review", "changes_requested"].includes(i.status))));
  const approved = moneyCell(sumByCurrency(rows.filter((i) => i.status === "approved")));
  const flagged = rows.filter(isFlagged).length;
  const scope = state.allCursor ? ` · ${t("loadedScope", { n: rows.length })}` : "";
  return [
    [t("awaitingValue"), awaiting.text, awaiting.title],
    [t("approvedValue"), approved.text, approved.title],
    [t("flaggedCount"), `${flagged}${state.allCursor ? "+" : ""}`, ""],
  ]
    .map(
      ([label, value, title]) =>
        `<div${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(label + scope)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

function overviewRow(invoice, view, trailing) {
  return `
    <a class="overview-row" href="${recordUrl(invoice.id, view)}">
      <span class="overview-row-main">
        <strong>${escapeHtml(invoice.vendor_name || invoice.title || "-")}</strong>
        <small>${escapeHtml(trailing)}</small>
      </span>
      <span class="overview-row-meta">${statusBadge(invoice.status)}<span class="num">${formatMoney(invoice.total, invoice.currency)}</span></span>
    </a>`;
}

function renderOverview() {
  byId("overviewSummary").textContent = t("overviewSummary");
  byId("overviewMetrics").innerHTML = metricsBand();
  const rows = allRows();
  const waiting = rows
    .filter((invoice) => ["needs_review", "changes_requested"].includes(invoice.status))
    .sort((a, b) => (a.confidence || 0) - (b.confidence || 0))
    .slice(0, 6);
  const flagged = rows.filter(isFlagged).slice(0, 6);
  byId("overviewBody").innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${escapeHtml(t("waitingOnYou"))}</h2>
        ${
          waiting
            .map((invoice) =>
              overviewRow(
                invoice,
                invoice.status,
                [invoice.invoice_number, t("confidenceValue", { n: Math.round((invoice.confidence || 0) * 100) })]
                  .filter(Boolean)
                  .join(" · "),
              ),
            )
            .join("") || `<p class="empty-inline">${escapeHtml(t("noWaiting"))}</p>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${escapeHtml(t("flagged"))}</h2>
        ${
          flagged
            .map((invoice) =>
              overviewRow(invoice, "all", invoice.warnings[0] || enumLabel(invoice.risk[0], "risk")),
            )
            .join("") || `<p class="empty-inline">${escapeHtml(t("noFlagged"))}</p>`
        }
      </div>
    </section>
  `;
}

// ── Record view ─────────────────────────────────────────────────────────────
function filtered(rows, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((invoice) =>
    [invoice.vendor_name, invoice.invoice_number, invoice.title, invoice.source_file, invoice.ref]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

// Column letters (A, B, C...) are purely decorative corner marks on the real
// `<th>`s (see styles.css `.invoice-table th[data-col]::before`) — derived
// from this same `head` array so they can never drift out of sync with the
// real columns.
function columnLetter(index) {
  return String.fromCharCode(65 + index);
}

function tableHtml(items, selectedId) {
  const low = threshold();
  const head = [
    [t("vendor")],
    [t("status"), "status-col"],
    [t("invoiceNumber")],
    [t("date"), "ws-col-narrow date-col"],
    [t("due"), "ws-col-narrow date-col"],
    [t("total"), "ws-col-num"],
    [t("confidence"), "ws-col-num"],
  ];
  // `.sheet-gutter` is a decorative sibling of the real table (never a column
  // inside it), so the row numbers can't shift the table's own columns,
  // sorting, search or the split/drawer/page detail modes.
  const gutter = `
    <div class="sheet-gutter" aria-hidden="true">
      <span class="sheet-gutter-head"></span>
      ${items.map((_, i) => `<span>${i + 1}</span>`).join("")}
    </div>
  `;
  return `
    <div class="sheet-table-frame">
      ${gutter}
      <table class="ws-table invoice-table">
        <thead><tr>${head.map(([label, cls], i) => `<th${cls ? ` class="${cls}"` : ""} data-col="${columnLetter(i)}">${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${items
            .map((invoice) => {
              const vendor = invoice.vendor_name || invoice.title || "-";
              const lowConfidence = (invoice.confidence || 0) < low;
              return `<tr data-id="${escapeHtml(invoice.id)}"${invoice.id === selectedId ? ' class="ws-selected"' : ""}>
                <td title="${escapeHtml([vendor, invoice.title].filter(Boolean).join(" · "))}"><span class="strong">${escapeHtml(vendor)}</span></td>
                <td class="status-col">${statusBadge(invoice.status)}</td>
                <td title="${escapeHtml(invoice.invoice_number || "")}">${escapeHtml(invoice.invoice_number || "-")}</td>
                <td class="date-col">${escapeHtml(invoice.invoice_date || "-")}</td>
                <td class="date-col">${escapeHtml(invoice.due_date || "-")}</td>
                <td class="ws-col-num">${formatMoney(invoice.total, invoice.currency)}</td>
                <td class="ws-col-num"><span class="confidence${lowConfidence ? " low" : ""}">${percent(invoice.confidence)}</span></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function loadMoreControl(list) {
  if (!list.cursor) return list.error ? `<div class="load-more"><span role="alert">${t("loadMoreFailed")}</span></div>` : "";
  return `<div class="load-more"><button class="button" type="button" data-load-more ${list.loading ? "disabled" : ""}>${list.loading ? t("loadingMore") : t("loadMore")}</button>${list.error ? `<span role="alert">${t("loadMoreFailed")}</span>` : ""}</div>`;
}

function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
}

function renderRecordView(route) {
  els.viewTitle.textContent = statusLabel(route.view);
  els.viewTitle.title = t(`${route.view}Hint`);
  const list = listState(route.view);
  const items = filtered(list.rows, route.query);
  els.viewCount.textContent = `${items.length}${list.cursor ? "+" : ""}`;
  let html;
  if (list.initial && list.loading) html = `<p class="empty-inline">${escapeHtml(t("loading"))}</p>`;
  else if (list.initial && list.error) html = emptyState(t("loadMoreFailed"));
  else if (!items.length) html = route.query ? emptyState(t("noMatches")) : emptyState(t("empty"), t("emptyHint"));
  else html = tableHtml(items, route.selectedId);
  els.listPanel.innerHTML = html + (list.initial ? "" : loadMoreControl(list));
  renderDetail(route);
}

function fieldHtml(invoice, edits, [labelKey, key, type = "text"]) {
  const value = key in edits ? edits[key] : type === "number" ? formatNumber(invoice[key]) : invoice[key] ?? "";
  const fieldConfidence = invoice.field_confidence?.[key];
  const low = typeof fieldConfidence?.confidence === "number" && fieldConfidence.confidence < threshold();
  const hint = low
    ? `<small class="field-hint" title="${escapeHtml(t("lowFieldConfidence"))}">${escapeHtml(t("sourceText"))} “${escapeHtml(fieldConfidence.source_text || "")}” · ${percent(fieldConfidence.confidence)}</small>`
    : "";
  return `<label class="field${low ? " low" : ""}"><span>${escapeHtml(t(labelKey))}</span><input name="${key}" type="${type}" step="any" value="${escapeHtml(value)}" />${hint}</label>`;
}

function renderDetail(route) {
  const { selectedId, presentation } = route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, route);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODE === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectInvoice"))}</div>` : "";
    return;
  }
  const invoice = recordById(selectedId);
  if (!invoice) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<p class="empty-inline">${escapeHtml(t("loading"))}</p>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const locked = Boolean(state.data?.lock?.locked);
  const disabled = locked ? "disabled" : "";
  const edits = state.edits[invoice.id] || {};
  const notes = "notes" in edits ? edits.notes : invoice.notes || "";
  const extraction = [
    ...invoice.risk.map((risk) => `<span class="risk-chip">${escapeHtml(enumLabel(risk, "risk"))}</span>`),
    ...invoice.warnings.map((warning) => `<p class="warning-line">${escapeHtml(warning)}</p>`),
  ].join("");
  const decision = invoice.decision
    ? `<span class="decision-meta">${escapeHtml(t("decision"))}: ${escapeHtml(enumLabel(invoice.decision.action, "action"))}${invoice.decision.decided_at ? ` · ${escapeHtml(new Date(invoice.decision.decided_at).toLocaleString(locale()))}` : ""}</span>`
    : "";
  const meta = [
    escapeHtml(invoice.ref),
    statusBadge(invoice.status),
    escapeHtml(enumLabel(invoice.category, "category")),
    invoice.source_file ? `<span title="${escapeHtml(invoice.source_path || invoice.source_file)}">${escapeHtml(invoice.source_file)}</span>` : "",
    `<span class="confidence${(invoice.confidence || 0) < threshold() ? " low" : ""}">${escapeHtml(t("confidenceValue", { n: Math.round((invoice.confidence || 0) * 100) }))}</span>`,
  ].filter(Boolean);
  els.detailBody.innerHTML = `
    <article class="invoice-detail" data-invoice="${escapeHtml(invoice.id)}">
      <header class="detail-head">
        <div class="detail-meta">${meta.join('<span class="sep">·</span>')}</div>
        <h2>${escapeHtml(invoice.title || invoice.vendor_name || "-")}</h2>
      </header>
      ${locked ? `<div class="lock-banner">${escapeHtml(t("lockedBanner"))}</div>` : ""}
      <div class="decision-bar">
        <button class="button primary" type="button" data-action="approve" ${disabled}>${escapeHtml(t("approve"))}</button>
        <button class="button" type="button" data-action="request_changes" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
        <button class="button danger" type="button" data-action="block" ${disabled}>${escapeHtml(t("block"))}</button>
        ${decision}
      </div>
      ${state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : ""}
      <form class="detail-form" data-form="${escapeHtml(invoice.id)}">
        <section class="fields-grid">${FIELD_ROWS.map((row) => fieldHtml(invoice, edits, row)).join("")}</section>
        <label class="field wide"><span>${escapeHtml(t("reviewNote"))}</span><textarea name="notes" rows="3">${escapeHtml(notes)}</textarea></label>
        <div class="form-actions"><button class="button" type="submit" ${disabled}>${escapeHtml(t("save"))}</button></div>
      </form>
      <section class="detail-section">
        <div class="section-head"><h3>${escapeHtml(t("lineItems"))}</h3><span>${escapeHtml(t("rows", { n: invoice.line_items.length }))}</span></div>
        <table class="line-items">
          <thead><tr><th>${escapeHtml(t("description"))}</th><th class="num">${escapeHtml(t("qty"))}</th><th class="num">${escapeHtml(t("unit"))}</th><th class="num">${escapeHtml(t("amount"))}</th></tr></thead>
          <tbody>
            ${invoice.line_items
              .map(
                (line) => `<tr>
                  <td>${escapeHtml(line.description || "")}</td>
                  <td class="num">${escapeHtml(line.quantity ?? "")}</td>
                  <td class="num">${escapeHtml(line.unit_price ?? "")}</td>
                  <td class="num">${escapeHtml(line.amount ?? "")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>
      <section class="detail-section extraction-notes">
        <h3>${escapeHtml(t("extractionNotes"))}</h3>
        ${extraction || `<p class="muted">${escapeHtml(t("noWarnings"))}</p>`}
      </section>
    </article>
  `;
}

// ── Extract Data dialog ─────────────────────────────────────────────────────
// Extraction happens in the agent; the dialog tells the user how to hand it
// files from each source. It never uploads anything itself.
const EXTRACT_SOURCES = ["upload", "googleDrive", "oneDrive", "email"];

function renderExtractDialog() {
  if (!state.extractOpen || !state.data) {
    els.extractDialog.innerHTML = "";
    return;
  }
  const source = state.extractSource;
  els.extractDialog.innerHTML = `
    <div class="modal-backdrop" data-close-extract>
      <section class="modal extract-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("extractData"))}">
        <header>
          <h2>${escapeHtml(t("extractData"))}</h2>
          <button class="icon-close" type="button" data-close-extract title="${escapeHtml(t("close"))}" aria-label="${escapeHtml(t("close"))}">×</button>
        </header>
        <p class="extract-intro">${escapeHtml(t("extractIntro"))}</p>
        <div class="segmented extract-tabs" role="tablist">
          ${EXTRACT_SOURCES.map(
            (key) =>
              `<button type="button" role="tab" class="segment${key === source ? " active" : ""}" aria-selected="${key === source}" data-extract-source="${key}">${escapeHtml(t(key))}</button>`,
          ).join("")}
        </div>
        <div class="drop-zone">
          <div class="upload-icon" aria-hidden="true">⇧</div>
          <strong>${escapeHtml(t(source === "upload" ? "uploadTitle" : `${source}Title`))}</strong>
          <span>${escapeHtml(t(source === "upload" ? "uploadSub" : `${source}Sub`))}</span>
        </div>
        <p class="extract-usage">${escapeHtml(t("extractedSoFar", { n: `${metrics().total ?? allRows().length}` }))}</p>
      </section>
    </div>
  `;
}

// ── Help & Settings (modal over the current page) ───────────────────────────
function renderSettings() {
  if (state.route?.page !== "settings" || !state.data) {
    els.settingsModal.innerHTML = "";
    return;
  }
  const summary = state.data.config_summary || {};
  els.settingsModal.innerHTML = `
    <div class="modal-backdrop" data-close-settings>
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("settings"))}">
        <header>
          <h2>${escapeHtml(t("settings"))}</h2>
          <button class="icon-close" type="button" data-close-settings title="${escapeHtml(t("close"))}" aria-label="${escapeHtml(t("close"))}">×</button>
        </header>
        <div class="modal-body">
          <div class="settings-card">
            <h3>${escapeHtml(t("configTitle"))}</h3>
            <p><strong>${escapeHtml(t("defaultCurrency"))}</strong><code>${escapeHtml(summary.default_currency || "USD")}</code></p>
            <p><strong>${escapeHtml(t("preferredOcr"))}</strong><code>${escapeHtml(summary.extraction?.preferred_ocr || "agent-provided")}</code></p>
            <p><strong>${escapeHtml(t("threshold"))}</strong><code>${escapeHtml(summary.extraction?.low_confidence_threshold ?? 0.82)}</code></p>
          </div>
          <div class="settings-card">
            <h3>${escapeHtml(t("exportTitle"))}</h3>
            <p><strong>${escapeHtml(t("directory"))}</strong><code>${escapeHtml(summary.export?.directory || "exports/<batch-id>")}</code></p>
            <p><strong>${escapeHtml(t("provider"))}</strong><code>${escapeHtml(state.data.data_provider || "busabase")}</code></p>
          </div>
          <div class="settings-card" id="settingsContent"></div>
          <div class="settings-card">
            <h3>${escapeHtml(t("language"))}</h3>
            <select data-language aria-label="${escapeHtml(t("language"))}">
              <option value="auto" ${state.lang === "auto" ? "selected" : ""}>${escapeHtml(t("auto"))}</option>
              <option value="en" ${state.lang === "en" ? "selected" : ""}>English</option>
              <option value="zh" ${state.lang === "zh" ? "selected" : ""}>中文</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  `;
}

// ── Decisions ───────────────────────────────────────────────────────────────
function patchFromForm(form) {
  const patch = {};
  for (const [key, value] of new FormData(form).entries()) {
    patch[key] = NUMBER_FIELDS.has(key) ? (value === "" ? undefined : Number(value)) : value;
  }
  return patch;
}

async function submitDecision(id, action, patch = null, comment = "") {
  if (!id) return;
  if (state.data?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  let result;
  try {
    result = await state.provider.submitDecision({ item_id: id, action, comment, patch });
  } catch (error) {
    state.notice = error?.message || t("decisionFailed");
    render();
    return;
  }
  delete state.edits[id];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the invoice
  // keeps its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
  render();
}

// ── Events ──────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-load-more]")) {
    loadMore();
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while the split/drawer is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    window.location.hash = url;
  }
});

els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("input[name], textarea[name]");
  const id = field?.closest("[data-invoice]")?.dataset.invoice;
  if (id) state.edits[id] = { ...state.edits[id], [field.name]: field.value };
});

els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-invoice]");
  const comment = card.querySelector("textarea[name=notes]")?.value || "";
  submitDecision(card.dataset.invoice, button.dataset.action, null, comment);
});

els.detailBody.addEventListener("submit", (event) => {
  const form = event.target.closest(".detail-form");
  if (!form) return;
  event.preventDefault();
  const patch = patchFromForm(form);
  submitDecision(form.dataset.form, "revise", patch, String(patch.notes || ""));
});

els.detailBack.addEventListener("click", closeDetail);

els.search.addEventListener("input", () => {
  const route = { ...state.route, query: els.search.value };
  replaceRoute(`#/invoices/${route.view}${routeQuery(route, { peek: route.peek })}`);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target.closest("[data-open-extract]")) {
    state.extractOpen = true;
    renderExtractDialog();
    return;
  }
  const source = target.closest("[data-extract-source]");
  if (source) {
    state.extractSource = source.dataset.extractSource;
    renderExtractDialog();
    return;
  }
  // Backdrop clicks close; clicks inside the dialog do not.
  const closeExtract = target.closest("[data-close-extract]");
  if (closeExtract && (closeExtract.tagName === "BUTTON" || target === closeExtract)) {
    state.extractOpen = false;
    renderExtractDialog();
    return;
  }
  const closeSettingsEl = target.closest("[data-close-settings]");
  if (closeSettingsEl && (closeSettingsEl.tagName === "BUTTON" || target === closeSettingsEl)) {
    closeSettings();
    return;
  }
  if (target.closest("[data-refresh]")) loadState();
});

document.addEventListener("change", (event) => {
  if (!event.target.matches?.("[data-language]")) return;
  state.lang = normalizeLang(event.target.value);
  localStorage.setItem("busa-invoice-sheet-lang", state.lang);
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.extractOpen) {
    state.extractOpen = false;
    renderExtractDialog();
    return;
  }
  if (state.route?.page === "settings") {
    closeSettings();
    return;
  }
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target.closest?.("input, textarea, select")) {
    event.target.blur();
    return;
  }
  if (state.route?.peek) closeDetail();
});

els.sidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(!document.body.classList.contains("sidebar-open")));
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", () => {
  if (!isMobileLayout()) setMobileSidebarOpen(false);
  if (state.data) render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
    setInterval(() => loadState({ quiet: true }).catch(() => {}), 15000);
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

state.route = parseRoute();
state.baseRoute = state.route.page === "settings" ? { page: "overview" } : state.route;
previousRouteWasList = state.route.page === "invoices" && !state.route.selectedId;
if (state.route.page === "invoices") els.search.value = state.route.query;
render();
boot();
