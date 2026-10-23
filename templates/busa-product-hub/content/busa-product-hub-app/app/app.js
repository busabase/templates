import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import {
  agentReadinessFor,
  certificatesFor,
  channelsFor,
  computeMetrics,
  countAgentReady,
  filteredProducts,
  inventoryFor,
  productForCertificate,
  reviewFor,
  sortCertificatesByUrgency,
  statusForVerdict,
} from "./js/product-hub-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   products     → page:   a product is a workplace — gallery, pricing, stock,
//                          channels, certificates, readiness, open reviews.
//   inventory    → drawer: a stock row is a fact you scan many of and return.
//   channels     → drawer: a listing is a fact — status, price, issue — scanned in bulk.
//   certificates → drawer: check one expiry/source, then back to the list.
//   review       → split:  the queue is worked top to bottom, one decision after the next.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const SNAPSHOT_KEY = {
  products: "products",
  inventory: "inventory",
  channels: "channel_matrix",
  certificates: "certificates",
  review: "review_items",
};
const ID_FIELD = {
  products: "product_id",
  inventory: "inventory_id",
  channels: "channel_id",
  certificates: "certificate_id",
  review: "item_id",
};
const VIEW_HINT = {
  products: "productsHint",
  inventory: "inventoryHint",
  channels: "channelsHint",
  certificates: "certificatesHint",
  review: "reviewHint",
};

const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  notice: "",
  edits: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: Object.fromEntries(RECORD_VIEWS.map((view) => [view, new Map()])),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-product-hub-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).has("demo"),
  busy: false,
};

const FEATURED_PRODUCT = "prod-aurora-lamp";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-product-hub.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
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
  reviewCount: byId("count-review"),
  stockCount: byId("count-stock"),
  channelCount: byId("count-channel"),
  certCount: byId("count-cert"),
  language: byId("language"),
};

const PAGINATED_KEYS = ["products", "channels", "inventory", "review", "certificates"];
const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot[SNAPSHOT_KEY[key]] = key === "certificates" ? sortCertificatesByUrgency(rows) : rows;
    refreshMetrics();
  },
  render: () => render(),
  label: (key) => t(key),
});

function refreshMetrics() {
  state.snapshot.metrics = computeMetrics(products(), channels(), inventory(), certificates(), state.snapshot.generated_at);
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  const key = String(value || "");
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
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

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
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
  if (previous.view !== state.route.view || previous.selectedId !== state.route.selectedId) state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes should not
// each become a Back step.
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

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = Object.fromEntries(RECORD_VIEWS.map((view) => [view, new Map()]));
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-product-hub:state", { detail: data }));
  render();
  ensureSelectedRecord();
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
    let row = await provider.getRecord(view, selectedId);
    if (row && view === "certificates") row = sortCertificatesByUrgency([row], state.snapshot.generated_at)[0];
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = RECORD_VIEWS.includes(scenario)
    ? `#/${scenario}`
    : scenario === "detail"
      ? `#/products/${FEATURED_PRODUCT}`
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
  for (const option of els.language.options) option.textContent = languageLabels[option.value] || option.textContent;
  els.search.placeholder = t("search");
  els.search.setAttribute("aria-label", t("search"));
  for (const button of [els.refresh, els.viewRefresh]) {
    button.textContent = t("refresh");
    button.title = t("refresh");
  }
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  byId("settingsTitle").title = t("settingsHint");
  els.detailExpand.textContent = t("openFullPage");
}

function products() {
  return state.snapshot?.products || [];
}

function channels() {
  return state.snapshot?.channel_matrix || [];
}

function inventory() {
  return state.snapshot?.inventory || [];
}

function reviewItems() {
  return state.snapshot?.review_items || [];
}

function certificates() {
  return state.snapshot?.certificates || [];
}

function rowsFor(view) {
  return state.snapshot?.[SNAPSHOT_KEY[view]] || [];
}

// Loaded page first, then a record fetched on its own for the URL.
function recordById(view, id) {
  if (!id) return null;
  return rowsFor(view).find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
}

function productById(productId) {
  return recordById("products", productId);
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function money2(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function baseCurrency() {
  return state.snapshot?.seller?.base_currency || "USD";
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function num(value) {
  return Number(value || 0).toLocaleString(activeLang() === "zh" ? "zh-CN" : "en-US");
}

function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pendingReviewCount() {
  return reviewItems().filter((item) => item.status === "needs_review").length;
}

function viewLabel(view) {
  if (view === "review") return t("reviewQueue");
  return t(view);
}

function renderShell() {
  applyI18n();
  const metrics = state.snapshot?.metrics || {};
  const pending = pendingReviewCount();
  els.reviewCount.textContent = String(pending);
  els.stockCount.textContent = String(metrics.low_stock_count || 0);
  els.channelCount.textContent = String(metrics.channel_issue_count || 0);
  els.certCount.textContent = String((metrics.expiring_cert_count || 0) + (metrics.expired_cert_count || 0));
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  els.syncStatus.title = state.settings?.demo ? t("demoNote") : "";
  els.language.value = state.lang;
  // Per-view totals live next to the nav item (records.count when available).
  for (const key of PAGINATED_KEYS) {
    const node = byId(`nav-count-${key}`);
    if (node) node.textContent = state.snapshot ? String(pagination.total(key, rowsFor(key).length)) : "";
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    if (!link.closest(".filters")) return;
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  els.mobileViewTitle.textContent = viewLabel(state.route.view);
  els.mobileViewMeta.textContent = state.settings?.demo
    ? t("demoData")
    : pending
      ? `${pending} ${t("needsReview")}`
      : "";
}

function badge(value, group = "status") {
  if (!value) return "";
  return `<span class="badge badge-${esc(String(value).replaceAll("_", "-"))}">${esc(enumLabel(value, group))}</span>`;
}

function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ""}</div>`;
}

// ---- Agent readiness (derived in product-hub-model.js's agentReadinessFor;
// nothing here is read from or written to a stored field). ----

function fill(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function countKey(table, key, count) {
  if (count === 1 && table?.[`${key}_one`]) return `${key}_one`;
  if (table?.[`${key}_other`]) return `${key}_other`;
  return key;
}

function readinessText(group, key) {
  return messages[activeLang()]?.readiness?.[group]?.[key] || messages.en.readiness?.[group]?.[key] || key;
}

function moneyIn(value, currency) {
  try {
    return money2(value, currency);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function readinessFor(product) {
  return agentReadinessFor(product, {
    channels: channels(),
    inventory: inventory(),
    certificates: certificates(),
    reviewItems: reviewItems(),
    now: state.snapshot?.generated_at,
  });
}

function readinessDetail(check, product) {
  const data = check.data || {};
  const currency = product.pricing?.currency || baseCurrency();
  const separator = activeLang() === "zh" ? "、" : ", ";
  const values = {
    count: typeof data.count === "number" ? Number(data.count).toLocaleString() : "",
    price: data.price !== undefined ? moneyIn(data.price, data.currency || currency) : "",
    list: (data.channels || [])
      .map((item) => `${enumLabel(item.platform, "platform")} ${moneyIn(item.price, currency)}`)
      .join(separator),
    missing: (data.missing || []).map((key) => readinessText("attributes", key)).join(separator),
    types: data.types || "",
  };
  const reasons = messages[activeLang()]?.readiness?.reasons || messages.en.readiness.reasons;
  const key = typeof data.count === "number" ? countKey(reasons, check.reason, data.count) : check.reason;
  const template = reasons[key] || messages.en.readiness.reasons[key];
  return template ? fill(template, values) : check.detail;
}

function readinessBadge(result, { short = false } = {}) {
  const tone = result.passed === result.total ? "pass" : result.passed >= result.total - 2 ? "warn" : "fail";
  const label = fill(t("agentReadyBadge"), result);
  // In a table column the header already says "Agent-ready"; the cell keeps the score.
  return `<span class="badge badge-readiness badge-${tone}" title="${esc(label)}">${esc(short ? `${result.passed}/${result.total}` : label)}</span>`;
}

function readinessPanel(product) {
  const result = readinessFor(product);
  return `<section class="card detail-card">
    <div class="panel-head"><h2>${t("agentReadiness")}</h2>${readinessBadge(result)}</div>
    <p class="muted readiness-hint">${esc(t("agentReadinessHint"))}</p>
    <ul class="readiness-list">
      ${result.checks
        .map(
          (check) => `<li class="readiness-check ${check.ok ? "is-ok" : "is-fail"}">
            <span class="readiness-mark" aria-hidden="true">${check.ok ? "✓" : "✗"}</span>
            <strong>${esc(readinessText("checks", check.id))}</strong>
            <span>${esc(readinessDetail(check, product))}</span>
          </li>`,
        )
        .join("")}
    </ul>
  </section>`;
}

function productImage(product, className = "") {
  if (!product?.image) return `<span class="thumb-empty${className ? ` ${className}` : ""}" aria-hidden="true"></span>`;
  return `<img${className ? ` class="${className}"` : ""} src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">`;
}

// A product reference (channel/inventory/certificate/review row → product).
// Never prints the raw id: a product not on the loaded page says so.
function productCell(product, { link = true } = {}) {
  if (!product) return `<span class="muted">${esc(t("productNotLoaded"))}</span>`;
  const inner = `${productImage(product, "row-thumb")}<span class="cell-name">${esc(product.name)}</span>`;
  return link
    ? `<a class="row-product" href="${detailUrl(product.product_id, "products")}">${inner}</a>`
    : `<span class="row-product">${inner}</span>`;
}

function productCard(product) {
  const inv = product.inventory || {};
  const href = detailUrl(product.product_id, "products");
  return `<article class="product-card">
    <a class="product-card-image" href="${href}">${productImage(product)}</a>
    <div class="product-card-body">
      <div class="product-card-head">
        <div>
          <a class="product-title" href="${href}">${esc(product.name)}</a>
          <div class="muted">${esc(product.sku)} · ${esc(product.category)}</div>
        </div>
        ${badge(product.status)}
      </div>
      <div class="readiness-row">${readinessBadge(readinessFor(product))}</div>
      <div class="product-stats">
        <div><span>${t("grossMargin")}</span><strong>${pct(product.pricing?.gross_margin_pct)}</strong></div>
        <div><span>${t("daysCover")}</span><strong>${esc(inv.days_cover ?? "—")}</strong></div>
        <div><span>${t("onHand")}</span><strong>${num(inv.on_hand)}</strong></div>
      </div>
    </div>
  </article>`;
}

function warningsBlock(filter = () => true) {
  const items = (state.snapshot?.warnings || []).filter(filter);
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) =>
        `<div class="${esc(item.severity || "warning")}"><strong>${esc(item.message)}</strong>${item.detail ? `<span>${esc(item.detail)}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav and attention block do not already show. Each is
// per-row arithmetic over JSON blocks (no server aggregate can answer it), so
// it is computed from the loaded rows and says so when more rows exist.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const readinessContext = {
    channels: channels(),
    inventory: inventory(),
    certificates: certificates(),
    reviewItems: reviewItems(),
    now: state.snapshot?.generated_at,
  };
  const agentReady = countAgentReady(products(), readinessContext);
  const partialProducts = pagination.isPartial("products");
  const scope = (partial) => (partial ? ` · ${t("loadedScope")}` : "");
  return [
    [t("inventoryValue") + scope(partialProducts), money(metrics.inventory_value, baseCurrency())],
    [t("avgMargin") + scope(partialProducts), pct(metrics.avg_margin_pct)],
    [t("agentReadyProducts") + scope(partialProducts), `${agentReady} / ${products().length}`],
  ]
    .map(([label, value]) => `<div><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join("");
}

function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  const generated = state.snapshot?.generated_at ? `${t("generated")} ${date(state.snapshot.generated_at)}` : "";
  byId("overviewSummary").textContent = [
    fill(t("activeSummary"), { count: metrics.active_count || 0 }),
    state.settings?.demo ? t("demoNote") : generated,
  ]
    .filter(Boolean)
    .join(" · ");
  byId("overviewMetrics").innerHTML = metricsBand();
  const pending = reviewItems()
    .filter((item) => item.status === "needs_review")
    .slice(0, 4);
  const urgentCerts = certificates()
    .filter((item) => item.cert_status === "expiring_soon" || item.cert_status === "expired")
    .slice(0, 5);
  byId("overviewBody").innerHTML = `
    ${warningsBlock()}
    <section class="overview-grid">
      <div class="card overview-panel overview-products">
        <div class="panel-head"><h2>${t("products")}</h2><a href="#/products">${t("allProducts")}</a></div>
        <div class="product-grid">${products()
          .slice(0, 4)
          .map((product) => productCard(product))
          .join("")}</div>
      </div>
      <div class="card overview-panel">
        <div class="panel-head"><h2>${t("reviewQueue")}</h2><a href="#/review">${t("review")}</a></div>
        ${
          pending
            .map((item) => {
              const product = productById(item.product_id);
              return `<a class="due-row" href="${recordUrl(item.item_id, "review")}">
                <span><strong>${esc(item.title)}</strong><small>${esc(product?.name || t("productNotLoaded"))}</small></span>
                <span class="due-meta">${badge(item.risk, "risk")}</span>
              </a>`;
            })
            .join("") || `<p class="muted">${t("noReviewPending")}</p>`
        }
      </div>
      <div class="card overview-panel">
        <div class="panel-head"><h2>${t("certsExpiringSoon")}</h2><a href="#/certificates">${t("certificates")}</a></div>
        ${
          urgentCerts
            .map((item) => {
              const product = productForCertificate(products(), item);
              return `<a class="due-row" href="${recordUrl(item.certificate_id, "certificates")}">
                <span><strong>${esc(item.cert_type)} · ${esc(product?.name || t("productNotLoaded"))}</strong><small>${t("expiryDate")} ${date(item.expiry_date)}</small></span>
                <span class="due-meta">${badge(item.cert_status, "certStatus")}</span>
              </a>`;
            })
            .join("") || `<p class="muted">${t("noCertsUrgent")}</p>`
        }
      </div>
      <div class="card overview-panel">
        <div class="panel-head"><h2>${t("activity")}</h2></div>
        <div class="timeline">
          ${(state.snapshot?.activity_log || [])
            .map(
              (item) => `<div class="timeline-item">
                <span>${date(item.at)}</span>
                <strong>${esc(item.actor)}</strong>
                <p>${esc(item.text)}</p>
              </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${esc(label)}</th>`).join("")}</tr></thead>`;

const cell = (html, { title = "", className = "" } = {}) =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${esc(title)}"` : ""}>${html}</td>`;

const rowOpen = (id) => `<tr data-id="${esc(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredRows(view) {
  const query = state.route.query.trim().toLowerCase();
  if (view === "products") return filteredProducts(products(), query);
  const rows = rowsFor(view);
  if (!query) return rows;
  return rows.filter((item) => {
    const product = view === "certificates" ? productForCertificate(products(), item) : productById(item.product_id);
    const base = [product?.name, product?.sku];
    if (view === "inventory") return matches([...base, item.warehouse_name, enumLabel(item.status)], query);
    if (view === "channels")
      return matches([...base, enumLabel(item.platform, "platform"), item.listing_id, enumLabel(item.status), item.issue], query);
    if (view === "certificates")
      return matches([...base, item.cert_type, item.issuer, item.cert_number, item.source_note], query);
    return matches([...base, item.title, item.summary, enumLabel(item.type, "type"), enumLabel(item.status)], query);
  });
}

function productsTable(items) {
  return `<table class="ws-table hub-table">
    ${tableHead([
      [t("product")],
      [t("status")],
      [t("sku"), "ws-col-narrow"],
      [t("category")],
      [t("agentReadyCol"), "ws-col-narrow"],
      [t("grossMargin"), "ws-col-num"],
      [t("daysCover"), "ws-col-num"],
      [t("onHand"), "ws-col-num"],
    ])}
    <tbody>${items
      .map((product) => {
        const inv = product.inventory || {};
        return `${rowOpen(product.product_id)}
          ${cell(productCell(product, { link: false }), { title: product.name })}
          ${cell(badge(product.status))}
          ${cell(esc(product.sku), { title: product.sku })}
          ${cell(esc(product.category), { title: product.category })}
          ${cell(readinessBadge(readinessFor(product), { short: true }))}
          ${cell(pct(product.pricing?.gross_margin_pct), { className: "ws-col-num" })}
          ${cell(esc(inv.days_cover ?? "—"), { className: "ws-col-num" })}
          ${cell(num(inv.on_hand), { className: "ws-col-num" })}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function inventoryTable(items) {
  return `<table class="ws-table hub-table">
    ${tableHead([
      [t("product")],
      [t("warehouse")],
      [t("onHand"), "ws-col-num"],
      [t("available"), "ws-col-num"],
      [t("inbound"), "ws-col-num"],
      [t("daysCover"), "ws-col-num"],
      [t("status")],
    ])}
    <tbody>${items
      .map((item) => {
        const product = productById(item.product_id);
        return `${rowOpen(item.inventory_id)}
          ${cell(productCell(product), { title: product?.name })}
          ${cell(esc(item.warehouse_name), { title: item.warehouse_name })}
          ${cell(num(item.on_hand), { className: "ws-col-num" })}
          ${cell(num(item.available), { className: "ws-col-num" })}
          ${cell(num(item.inbound), { className: "ws-col-num" })}
          ${cell(esc(item.days_cover ?? "—"), { className: "ws-col-num" })}
          ${cell(badge(item.status))}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function scoreCell(score) {
  const value = Math.min(100, Math.max(0, Number(score || 0)));
  return `<span class="score"><span class="score-bar"><span style="width:${value}%"></span></span><span>${esc(score ?? "—")}</span></span>`;
}

function channelsTable(items) {
  return `<table class="ws-table hub-table">
    ${tableHead([
      [t("product")],
      [t("platform"), "ws-col-narrow"],
      [t("status")],
      [t("price"), "ws-col-num"],
      [t("contentScore")],
      [t("channelIssue")],
    ])}
    <tbody>${items
      .map((item) => {
        const product = productById(item.product_id);
        return `${rowOpen(item.channel_id)}
          ${cell(productCell(product), { title: product?.name })}
          ${cell(esc(enumLabel(item.platform, "platform")))}
          ${cell(badge(item.status))}
          ${cell(money2(item.price, baseCurrency()), { className: "ws-col-num" })}
          ${cell(scoreCell(item.content_score))}
          ${cell(item.issue ? esc(item.issue) : `<span class="muted">${t("noIssue")}</span>`, { title: item.issue })}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function certificatesTable(items) {
  return `<table class="ws-table hub-table">
    ${tableHead([
      [t("product")],
      [t("certType"), "ws-col-narrow"],
      [t("issuer")],
      [t("certNumber")],
      [t("expiryDate")],
      [t("status")],
      [t("sourceNote"), "ws-col-wide"],
    ])}
    <tbody>${items
      .map((item) => {
        const product = productForCertificate(products(), item);
        return `${rowOpen(item.certificate_id)}
          ${cell(productCell(product), { title: product?.name })}
          ${cell(esc(item.cert_type))}
          ${cell(esc(item.issuer), { title: item.issuer })}
          ${cell(esc(item.cert_number), { title: item.cert_number })}
          ${cell(date(item.expiry_date))}
          ${cell(badge(item.cert_status, "certStatus"))}
          ${cell(esc(item.source_note), { title: item.source_note, className: "ws-col-wide" })}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function reviewTable(items) {
  return `<table class="ws-table hub-table">
    ${tableHead([[t("reviewQueue")], [t("status")]])}
    <tbody>${items
      .map(
        (item) => `${rowOpen(item.item_id)}
          ${cell(`<span class="cell-name">${esc(item.title)}</span>`, { title: item.title })}
          ${cell(badge(item.status))}
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

const TABLES = {
  products: productsTable,
  inventory: inventoryTable,
  channels: channelsTable,
  certificates: certificatesTable,
  review: reviewTable,
};

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredRows(view);
  els.viewCount.textContent = `${items.length}${pagination.isPartial(view) ? "+" : ""}`;
  els.viewNotice.innerHTML = warningsBlock((warning) => warning.base === view);
  const empty = state.route.query ? emptyState(t("noMatches")) : emptyState(t("empty"));
  els.listPanel.innerHTML = `${items.length ? TABLES[view](items) : empty}${pagination.control(view)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectReview")}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="ws-detail-empty">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const renderers = {
    products: productDetail,
    inventory: inventoryDetail,
    channels: channelDetail,
    certificates: certificateDetail,
    review: reviewDetail,
  };
  els.detailBody.innerHTML = renderers[view](item);
}

function fieldList(pairs) {
  return `<dl class="detail-fields">${pairs
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value === "" || value === null ? "—" : value}</dd>`)
    .join("")}</dl>`;
}

function detailHead(title, meta = "", badges = "") {
  return `<header class="detail-head">
    <div><h2>${esc(title)}</h2>${meta ? `<p class="muted">${meta}</p>` : ""}</div>
    ${badges ? `<div class="detail-badges">${badges}</div>` : ""}
  </header>`;
}

function productDetail(product) {
  const inv = inventoryFor(inventory(), product.product_id);
  const channelRows = channelsFor(channels(), product.product_id);
  const reviewRows = reviewFor(reviewItems(), product.product_id);
  const certRows = certificatesFor(certificates(), product);
  const currency = baseCurrency();
  const pairs = (items) =>
    `<div class="data-grid">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${value}</strong></div>`).join("")}</div>`;
  return `
    <section class="detail-hero">
      <div class="detail-gallery">
        <div class="main-photo">${productImage(product)}</div>
        <div class="thumb-row">
          ${(product.gallery?.length ? product.gallery : [product.image])
            .filter(Boolean)
            .map((src) => `<img src="${esc(src)}" alt="${esc(product.name)}">`)
            .join("")}
        </div>
      </div>
      <div class="detail-summary">
        <div class="detail-heading">
          <div>
            <div class="muted">${esc(product.sku)} · ${esc(product.category)}</div>
            <h2>${esc(product.name)}</h2>
          </div>
          ${badge(product.status)}
        </div>
        <p>${esc(product.subtitle)}</p>
        <div class="tag-row">${(product.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
        ${pairs([
          [t("owner"), esc(product.owner || "—")],
          [t("vendor"), esc(product.vendor || "—")],
          [t("launchDate"), date(product.launch_date) || "—"],
          [t("lifecycle"), esc(enumLabel(product.lifecycle, "lifecycle"))],
        ])}
      </div>
    </section>
    <section class="detail-grid">
      <article class="card detail-card">
        <h2>${t("price")}</h2>
        ${pairs([
          [t("currentPrice"), money2(product.pricing?.current_price, currency)],
          [t("targetPrice"), money2(product.pricing?.target_price, currency)],
          [t("landedCost"), money2(product.pricing?.landed_cost, currency)],
          [t("grossMargin"), pct(product.pricing?.gross_margin_pct)],
        ])}
      </article>
      <article class="card detail-card">
        <h2>${t("inventory")}</h2>
        ${pairs([
          [t("onHand"), num(inv?.on_hand)],
          [t("inbound"), num(inv?.inbound)],
          [t("daysCover"), esc(inv?.days_cover ?? "—")],
          [t("status"), inv?.status ? esc(enumLabel(inv.status)) : "—"],
        ])}
      </article>
      <article class="card detail-card">
        <h2>${t("content")}</h2>
        ${pairs([
          [
            t("images"),
            product.content?.hero_images_required
              ? `${product.content?.hero_images_ready ?? 0}/${product.content.hero_images_required}`
              : "—",
          ],
          [t("video"), product.content?.video_ready ? t("ready") : t("needsReview")],
          [t("copy"), product.content?.copy_status ? esc(enumLabel(product.content.copy_status)) : "—"],
          [t("source"), esc(product.content?.listing_source || "—")],
        ])}
      </article>
      <article class="card detail-card">
        <h2>${t("compliance")}</h2>
        <div class="score-row">
          <strong>${esc(product.compliance?.score ?? "—")}</strong>
          ${badge(product.compliance?.status)}
        </div>
        <ul class="clean-list">${(product.compliance?.notes || []).map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
      </article>
    </section>
    ${readinessPanel(product)}
    <section class="card detail-card">
      <div class="panel-head"><h2>${t("channels")}</h2></div>
      ${
        channelRows.length
          ? `<table class="table related-table">
              ${tableHead([[t("platform")], [t("status")], [t("price")], [t("contentScore")], [t("channelIssue")]])}
              <tbody>${channelRows
                .map(
                  (item) => `<tr>
                    <td><a href="${recordUrl(item.channel_id, "channels")}">${esc(enumLabel(item.platform, "platform"))}</a></td>
                    <td>${badge(item.status)}</td>
                    <td class="num">${money2(item.price, currency)}</td>
                    <td>${scoreCell(item.content_score)}</td>
                    <td>${item.issue ? esc(item.issue) : `<span class="muted">${t("noIssue")}</span>`}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
          : `<p class="muted">—</p>`
      }
    </section>
    <section class="card detail-card">
      <div class="panel-head"><h2>${t("certificates")}</h2></div>
      ${
        certRows.length
          ? `<table class="table related-table">
              ${tableHead([[t("certType")], [t("certNumber")], [t("issuedDate")], [t("expiryDate")], [t("status")]])}
              <tbody>${certRows
                .map(
                  (item) => `<tr>
                    <td><a href="${recordUrl(item.certificate_id, "certificates")}">${esc(item.cert_type)}</a> <span class="muted">${esc(item.issuer)}</span></td>
                    <td>${esc(item.cert_number)}</td>
                    <td>${date(item.issued_date)}</td>
                    <td>${date(item.expiry_date)}</td>
                    <td>${badge(item.cert_status, "certStatus")}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
          : `<p class="muted">${t("noCerts")}</p>`
      }
    </section>
    ${
      reviewRows.length
        ? `<section class="card detail-card"><div class="panel-head"><h2>${t("reviewQueue")}</h2></div>${reviewRows
            .map(
              (item) => `<a class="due-row" href="${recordUrl(item.item_id, "review")}">
                <span><strong>${esc(fill(t("reviewRef"), { ref: item.ref }))} · ${esc(item.title)}</strong><small>${esc(enumLabel(item.type, "type"))}</small></span>
                <span class="due-meta">${badge(item.status)}</span>
              </a>`,
            )
            .join("")}</section>`
        : ""
    }`;
}

function inventoryDetail(item) {
  const product = productById(item.product_id);
  return `${detailHead(product?.name || t("productNotLoaded"), esc(item.warehouse_name), badge(item.status))}
    ${fieldList([
      [t("product"), productCell(product)],
      [t("warehouse"), esc(item.warehouse_name)],
      [t("onHand"), num(item.on_hand)],
      [t("available"), num(item.available)],
      [t("reserved"), num(item.reserved)],
      [t("inbound"), num(item.inbound)],
      [t("inboundEta"), date(item.inbound_eta)],
      [t("daysCover"), esc(item.days_cover ?? "")],
      [t("updated"), date(item.updated_at)],
    ])}`;
}

// `buybox` is a text field: demo data carries booleans, a live row "true"/"false".
function buyboxLabel(value) {
  const text = String(value ?? "").toLowerCase();
  if (text === "true") return esc(t("buyboxWon"));
  if (text === "false") return esc(t("buyboxLost"));
  return "";
}

function channelDetail(item) {
  const product = productById(item.product_id);
  return `${detailHead(
    `${product?.name || t("productNotLoaded")} · ${enumLabel(item.platform, "platform")}`,
    esc(item.listing_id),
    badge(item.status),
  )}
    ${item.issue ? `<div class="issue-panel"><h3>${t("channelIssue")}</h3><p>${esc(item.issue)}</p></div>` : ""}
    ${fieldList([
      [t("product"), productCell(product)],
      [t("platform"), esc(enumLabel(item.platform, "platform"))],
      [t("listingId"), esc(item.listing_id)],
      [t("price"), money2(item.price, baseCurrency())],
      [t("buybox"), buyboxLabel(item.buybox)],
      [t("contentScore"), scoreCell(item.content_score)],
      [t("nextStep"), item.next_step ? esc(enumLabel(item.next_step, "nextStep")) : ""],
      [t("updated"), date(item.updated_at)],
    ])}`;
}

function certificateDetail(item) {
  const product = productForCertificate(products(), item);
  const files = Array.isArray(item.file) ? item.file : item.file ? [item.file] : [];
  const fileHtml = files.length
    ? files
        .map((file) => {
          const name = esc(file?.name || file?.filename || t("certFile"));
          return file?.url ? `<a href="${esc(file.url)}" target="_blank" rel="noopener">${name}</a>` : name;
        })
        .join("<br>")
    : `<span class="muted">${t("noFile")}</span>`;
  return `${detailHead(`${item.cert_type} · ${product?.name || t("productNotLoaded")}`, esc(item.issuer), badge(item.cert_status, "certStatus"))}
    ${fieldList([
      [t("product"), productCell(product)],
      [t("certType"), esc(item.cert_type)],
      [t("issuer"), esc(item.issuer)],
      [t("certNumber"), esc(item.cert_number)],
      [t("issuedDate"), date(item.issued_date)],
      [t("expiryDate"), date(item.expiry_date)],
      [t("sourceNote"), esc(item.source_note)],
      [t("certFile"), fileHtml],
    ])}`;
}

const ACTION_LABEL = { approve: "approve", request_changes: "requestChanges", block: "block" };

function reviewDetail(item) {
  const product = productById(item.product_id);
  const open = item.status === "needs_review";
  const disabled = state.busy ? "disabled" : "";
  const note = state.edits[item.item_id] ?? "";
  return `<article class="review-detail" data-review="${esc(item.item_id)}">
    <header class="queue-head">
      <span class="queue-ref">${esc(fill(t("reviewRef"), { ref: item.ref }))}</span>
      ${badge(item.status)}
      ${badge(item.risk, "risk")}
      ${badge(item.type, "type")}
    </header>
    <h2 class="queue-subject">${esc(item.title)}</h2>
    <div class="queue-meta">${productCell(product)}</div>
    <p class="queue-summary">${esc(item.summary)}</p>
    ${
      (item.evidence || []).length
        ? `<h3>${t("evidence")}</h3><ul class="clean-list">${item.evidence.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
        : ""
    }
    ${item.recommendation ? fieldList([[t("recommendation"), esc(ACTION_LABEL[item.recommendation] ? t(ACTION_LABEL[item.recommendation]) : enumLabel(item.recommendation))]]) : ""}
    ${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}
    ${
      open
        ? `<label class="queue-label" for="note-${esc(item.item_id)}">${t("reviewNote")}</label>
          <textarea id="note-${esc(item.item_id)}" class="queue-note" data-note rows="3" placeholder="${esc(t("reviewNotePlaceholder"))}" ${disabled}>${esc(note)}</textarea>
          <div class="queue-actions">
            <button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>
            <button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>
            <button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>
          </div>`
        : fieldList([
            [t("decisionNote"), esc(item.decision_note)],
            [t("decidedAt"), date(item.decided_at)],
            ...(item.execution_status
              ? [[t("execution"), `${badge(item.execution_status)} ${esc(item.execution_detail || "")}`]]
              : []),
          ])
    }
  </article>`;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.settings?.config_summary || {};
  byId("settingsBody").innerHTML = `<div class="settings">
    <section class="card">
      ${fieldList([
        [t("dataProvider"), esc(state.settings?.data_provider || "")],
        [t("configPath"), esc(summary.config_path || "demo")],
        [t("brand"), esc(summary.seller?.brand || state.snapshot?.seller?.brand || "")],
        [t("currency"), esc(summary.seller?.base_currency || "USD")],
        [t("onboarding"), state.settings?.onboarding?.completed ? t("completed") : t("incomplete")],
        ...(state.settings?.onboarding?.completed_at
          ? [[t("completed"), date(state.settings.onboarding.completed_at)]]
          : []),
      ])}
    </section>
    <section class="card">
      <h2>${t("platform")}</h2>
      <div class="settings-list">${(summary.platforms || [])
        .map(
          (platform) =>
            `<div><strong>${esc(enumLabel(platform.platform, "platform"))}</strong><span>${esc(platform.store_name)}</span></div>`,
        )
        .join("")}</div>
    </section>
    <section class="card">
      <h2>${t("warehouses")}</h2>
      <div class="settings-list">${(summary.warehouses || [])
        .map((warehouse) => `<div><strong>${esc(warehouse.name)}</strong><span>${esc(warehouse.region)}</span></div>`)
        .join("")}</div>
    </section>
  </div>`;
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const noData = ready && state.snapshot.warnings?.some((warning) => warning.id === "no-snapshot") && !products().length;
  const onRecordView = ready && !noData && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready && !noData;
  if (noData) els.loadState.textContent = t("empty");
  els.overviewPage.hidden = !ready || noData || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || noData || view !== "settings";
  if (!ready || noData) return;
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ---- Direct write: record the operator's review decision straight through
// the active provider (Busabase or demo) -- there is no separate
// decisions.json-equivalent bucket, the status/decision-note/decided-at
// fields are written directly onto the review item's own record. Demo mode
// never reaches Busabase; it mutates the in-memory snapshot already
// rendered so ?demo=1 stays fully interactive for screenshots/docs. ----

async function postDecision(action, itemId) {
  const comment = state.edits[itemId] || "";
  if (state.demo) {
    const items = reviewItems();
    const index = items.findIndex((item) => item.item_id === itemId);
    if (index !== -1) {
      const now = new Date().toISOString();
      items[index] = {
        ...items[index],
        status: statusForVerdict(action, items[index].status),
        decision_note: comment,
        decided_at: now,
        updated_at: now,
      };
      refreshMetrics();
    }
    delete state.edits[itemId];
    state.notice = t("decisionSavedDemo");
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.decideReview(itemId, action, comment);
    delete state.edits[itemId];
    await loadState();
    // Without write access the verdict is a ChangeRequest, and the item keeps
    // its old status until someone who has it approves: say that, not "recorded".
    state.notice = result?.pending ? t("savedForReview") : t("decisionSaved");
  } catch (error) {
    state.notice = error?.message || String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function bindEvents() {
  pagination.bind(els.listPanel);
  els.listPanel.addEventListener("click", (event) => {
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
  els.detailBody.addEventListener("input", (event) => {
    const field = event.target.closest("textarea[data-note]");
    const id = field?.closest("[data-review]")?.dataset.review;
    if (id) state.edits[id] = field.value;
  });
  els.detailBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const id = button?.closest("[data-review]")?.dataset.review;
    if (id) postDecision(button.dataset.action, id);
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
  window.addEventListener("resize", syncResponsiveShell);
  els.search.addEventListener("input", () => {
    replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
  });
  for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) button?.addEventListener("click", () => loadState());
  els.sidebarToggle?.addEventListener("click", toggleSidebar);
  els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
  els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
  els.language.addEventListener("change", () => {
    state.lang = normalizeLang(els.language.value);
    localStorage.setItem("busa-product-hub-language", state.lang);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
    loadState();
  });
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
bindEvents();

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

boot();
