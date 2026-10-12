import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { assembleSnapshot, computeInsights } from "./js/webull-model.js?v=0.1.0";

// Where a record opens, per view — declared once in config.js `ui.detail_modes`:
//   accounts  → page:   an account owns its holdings list and balances; you stay.
//   positions → drawer: a holding is a fact you scan many of, read, and return.
// A `/<record>` path always opens the full page; `?peek=` drives the drawer.
// On a phone every mode is a page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  sort: { key: "market_value", dir: "desc" },
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { accounts: new Map(), positions: new Map() },
  pageError: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-invest-webull-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-invest-webull.sidebarCollapsed";

// Token-driven so the donut follows dark mode instead of fixed light hues.
const ASSET_COLORS = {
  STOCK: "var(--ink-soft)",
  ETF: "var(--positive)",
  CRYPTO: "var(--warning)",
  OPTION: "var(--danger)",
  OTHER: "var(--muted)",
};

const byId = (id) => document.getElementById(id);
const els = {
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
  settingsContent: byId("settingsContent"),
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
  summaryPnl: byId("summary-pnl"),
  pnlArrow: byId("pnl-arrow"),
  positionCount: byId("count-positions"),
  accountCount: byId("count-accounts"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    const snapshot = assembleSnapshot(
      key === "accounts" ? rows : state.snapshot.accounts,
      key === "positions" ? rows : state.snapshot.positions,
      state.snapshot,
    );
    snapshot.insights = computeInsights(snapshot, state.settings?.config_summary?.target_allocation);
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

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(locale(), {
    style: "currency",
    currency,
    // "$" rather than zh-Hans' "US$": the narrow symbol keeps money columns
    // from truncating in Chinese; the currency code is shown in the detail.
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function signedMoney(value, currency) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${money(n, currency)}`;
}

function pct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function num(value, digits = 4) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(Number(value || 0));
}

function syncedAt() {
  const value = state.snapshot?.generated_at;
  return value ? new Date(value).toLocaleString(locale()) : "";
}

function pnlClass(value) {
  const n = Number(value || 0);
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
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
  els.search.value = state.route.query;
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

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = { accounts: new Map(), positions: new Map() };
  state.pageError = "";
  window.dispatchEvent(new CustomEvent("busa-invest-webull:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    renderSetupRequired(error, boot);
  }
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "positions"
      ? "#/positions"
      : scenario === "accounts"
        ? "#/accounts"
        : scenario === "detail"
          ? "#/positions/AAPL"
          : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function positions() {
  return state.snapshot?.positions || [];
}

function accounts() {
  return state.snapshot?.accounts || [];
}

// A position is addressed by its position id; demo rows (and links written
// before ids were routed) fall back to the symbol.
const positionKey = (position) => position.position_id || position.symbol;

// Loaded page first, then a record fetched on its own for the URL.
function recordById(view, id) {
  if (!id) return null;
  const found =
    view === "positions"
      ? positions().find((item) => positionKey(item) === id) || positions().find((item) => item.symbol === id)
      : accounts().find((item) => item.account_id === id);
  return found || state.extra[view]?.get(id) || null;
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business key) instead of loading more pages to find it.
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
    const row = await provider.getRecord(view, selectedId);
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
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
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

function isConnected() {
  return Boolean(state.snapshot?.positions?.length) || Boolean(state.settings?.demo);
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const totals = snapshot?.totals || {};
  const positionCount = pagination.total("positions", positions().length);
  const accountCount = pagination.total("accounts", accounts().length);
  const connected = isConnected();
  els.syncStatus.textContent = !snapshot
    ? t("loading")
    : connected
      ? syncedAt()
        ? `${t("generated")} ${syncedAt()}`
        : t("synced")
      : t("needsConnection");
  if (els.summaryPnl) {
    els.summaryPnl.textContent = connected
      ? `${signedMoney(totals.unrealized_pnl)} (${pct(totals.unrealized_pnl_pct)})`
      : "—";
    els.summaryPnl.className = `human-work-figure ${pnlClass(totals.unrealized_pnl)}`;
  }
  if (els.pnlArrow) {
    els.pnlArrow.textContent = Number(totals.unrealized_pnl || 0) < 0 ? "↓" : "↑";
    els.pnlArrow.className = pnlClass(totals.unrealized_pnl);
  }
  if (els.positionCount) els.positionCount.textContent = positionCount;
  if (els.accountCount) els.accountCount.textContent = accountCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !snapshot
      ? t("loading")
      : connected
        ? `${signedMoney(totals.unrealized_pnl)} · ${positionCount} ${t("positions")}`
        : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "positions") return t("positionsTitle");
  if (view === "accounts") return t("accountsTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries unrealized P/L
// and the position/account counts). The pinned SDK has no server aggregate, so
// they are summed from the loaded page and say so when more rows exist.
function metricsBand() {
  const totals = state.snapshot?.totals || {};
  const positionScope = pagination.isPartial("positions")
    ? ` · ${t("loadedScope").replace("{n}", positions().length)}`
    : "";
  const accountScope = pagination.isPartial("accounts")
    ? ` · ${t("loadedScope").replace("{n}", accounts().length)}`
    : "";
  return [
    [t("marketValue") + positionScope, money(totals.market_value), ""],
    [
      t("dayChange") + positionScope,
      `${signedMoney(totals.day_change)} <small>${pct(totals.day_change_pct)}</small>`,
      pnlClass(totals.day_change),
    ],
    [t("cash") + accountScope, money(totals.total_cash), ""],
  ]
    .map(
      ([label, value, cls]) =>
        `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong class="${cls}">${value}</strong></div>`,
    )
    .join("");
}

function allocationPanel() {
  const allocation = state.snapshot?.allocation || [];
  if (!allocation.length) return "";
  let acc = 0;
  const gradientStops = allocation
    .map((item) => {
      const start = acc;
      acc += Number(item.weight_pct || 0);
      const color = ASSET_COLORS[item.asset_type] || ASSET_COLORS.OTHER;
      return `${color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
    })
    .join(", ");
  const legend = allocation
    .map(
      (item) => `
      <div class="alloc-legend-row">
        <span class="alloc-swatch" style="background:${ASSET_COLORS[item.asset_type] || ASSET_COLORS.OTHER}"></span>
        <span class="alloc-name">${escapeHtml(enumLabel(item.asset_type, "asset_type"))}</span>
        <span class="alloc-weight">${Number(item.weight_pct || 0).toFixed(1)}%</span>
        <span class="alloc-value num">${money(item.market_value)}</span>
      </div>
    `,
    )
    .join("");
  return `
    <div class="card overview-panel">
      <h2>${t("allocation")}</h2>
      <div class="alloc-body">
        <div class="alloc-donut" style="background:conic-gradient(${gradientStops})" aria-hidden="true"><span class="alloc-donut-hole"></span></div>
        <div class="alloc-legend">${legend}</div>
      </div>
    </div>
  `;
}

function insightLabel(code, params) {
  const lang = activeLang();
  const template = messages[lang]?.insightTemplate?.[code] || messages.en.insightTemplate?.[code] || "";
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key) => insightParam(code, key, params?.[key]));
}

function insightParam(code, key, value) {
  if (value == null) return "";
  if (key === "asset_type") return enumLabel(value, "asset_type");
  if (key === "amount") return money(value);
  if (key === "delta") {
    const n = Number(value || 0);
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
  }
  // top_gainer / top_laggard carry a signed unrealized P/L percent.
  if (key === "pct" && (code === "top_gainer" || code === "top_laggard")) return pct(value);
  if (key === "pct" || key === "actual" || key === "target") return Number(value || 0).toFixed(1);
  return String(value);
}

function insightsPanel() {
  const insights = state.snapshot?.insights || [];
  if (!insights.length) return "";
  const rows = insights
    .map((insight) => {
      const severity = ["info", "watch", "high"].includes(insight.severity) ? insight.severity : "info";
      const category = messages[activeLang()]?.insightCategory?.[insight.category];
      const text = insightLabel(insight.code, insight.params);
      return `
      <div class="insight-row">
        <span class="badge sev-${severity}">${escapeHtml(category || insight.severity)}</span>
        <span class="insight-text">${escapeHtml(text)}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="card overview-panel overview-wide">
      <h2>${t("insights")}</h2>
      <div class="insight-list">${rows}</div>
    </div>
  `;
}

function topMoversPanel() {
  const movers = [...positions()]
    .sort((a, b) => Math.abs(Number(b.day_change_pct || 0)) - Math.abs(Number(a.day_change_pct || 0)))
    .slice(0, 6);
  return `
    <div class="card overview-panel">
      <h2>${t("topMovers")}</h2>
      ${movers
        .map(
          (position) => `
        <a class="mover-row" href="${recordUrl(positionKey(position), "positions")}">
          <span><strong>${escapeHtml(position.symbol)}</strong><small>${escapeHtml(position.name || "")}</small></span>
          <span class="num">${money(position.last_price, position.currency)}</span>
          <span class="num ${pnlClass(position.day_change_pct)}">${pct(position.day_change_pct)}</span>
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderOverview() {
  const source = state.settings?.demo ? t("demoData") : "";
  byId("overviewSummary").textContent = isConnected()
    ? [syncedAt() ? `${t("generated")} ${syncedAt()}` : t("synced"), source].filter(Boolean).join(" · ")
    : t("empty");
  const metrics = byId("overviewMetrics");
  metrics.hidden = !isConnected();
  metrics.innerHTML = isConnected() ? metricsBand() : "";
  byId("overviewBody").innerHTML = isConnected()
    ? `
    ${warnings()}
    <section class="overview-grid">
      ${allocationPanel()}
      ${topMoversPanel()}
      ${insightsPanel()}
    </section>
  `
    : `${warnings()}${emptyState(t("setupNeeded"))}`;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { positions: "positionsHint", accounts: "accountsHint" };

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredPositions(accountId = "") {
  const query = state.route.query.trim().toLowerCase();
  return positions().filter((position) => {
    if (accountId && position.account_id !== accountId) return false;
    if (!query) return true;
    return matches(
      [
        position.symbol,
        position.name,
        position.asset_type,
        enumLabel(position.asset_type, "asset_type"),
        accountName(position.account_id),
      ],
      query,
    );
  });
}

function filteredAccounts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return accounts();
  return accounts().filter((account) =>
    matches(
      [account.display_name, account.account_id, account.currency, enumLabel(account.account_type, "account_type")],
      query,
    ),
  );
}

function sortedPositions(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

// An account relation is a business id. Resolve it to the account's name; when
// the account is not on the loaded page, say so rather than print the id.
function accountName(accountId) {
  if (!accountId) return "";
  return accounts().find((account) => account.account_id === accountId)?.display_name || t("notLoaded");
}

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  const aria = active ? ` aria-sort="${state.sort.dir === "asc" ? "ascending" : "descending"}"` : "";
  return `<th class="sortable ${cls}${active ? " active" : ""}" data-sort="${key}"${aria}>${escapeHtml(label)}${arrow}</th>`;
}

const cell = (html, className = "", title = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

// One table for the Positions view and an account's holdings. Inside an
// account the Account column would repeat the page's own subject, so it drops.
function positionsTable(list, { linkView = "positions" } = {}) {
  const rows = sortedPositions(list);
  const withAccount = linkView === "positions";
  return `
    <table class="ws-table invest-table positions-table">
      <thead>
        <tr>
          ${sortHeader("symbol", t("symbol"), "col-symbol")}
          ${sortHeader("name", t("name"), "col-name")}
          ${withAccount ? `<th class="col-account">${escapeHtml(t("account"))}</th>` : ""}
          ${sortHeader("quantity", t("qty"), "ws-col-num col-qty")}
          ${sortHeader("last_price", t("last"), "ws-col-num col-money")}
          ${sortHeader("market_value", t("marketValue"), "ws-col-num col-money ws-split-keep")}
          ${sortHeader("unrealized_pnl", t("unrealizedPnl"), "ws-col-num col-money")}
          ${sortHeader("unrealized_pnl_pct", t("plPct"), "ws-col-num col-pct ws-split-keep")}
          ${sortHeader("weight_pct", t("weight"), "ws-col-num col-qty")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((position) => {
            const id = positionKey(position);
            const selected = withAccount && id === state.route.selectedId;
            const type = enumLabel(position.asset_type, "asset_type");
            return `
          <tr data-id="${escapeHtml(id)}" data-href="${escapeHtml(recordUrl(id, "positions"))}"${selected ? ' class="ws-selected"' : ""}>
            ${cell(`<span class="strong">${escapeHtml(position.symbol)}</span><span class="badge">${escapeHtml(type)}</span>`, "", `${position.symbol} · ${type}`)}
            ${cell(escapeHtml(position.name || ""), "", position.name || "")}
            ${withAccount ? cell(escapeHtml(accountName(position.account_id)), "muted-cell", accountName(position.account_id)) : ""}
            ${cell(num(position.quantity), "ws-col-num")}
            ${cell(money(position.last_price, position.currency), "ws-col-num")}
            ${cell(money(position.market_value, position.currency), "ws-col-num ws-split-keep")}
            ${cell(signedMoney(position.unrealized_pnl, position.currency), `ws-col-num ${pnlClass(position.unrealized_pnl)}`)}
            ${cell(pct(position.unrealized_pnl_pct), `ws-col-num ws-split-keep ${pnlClass(position.unrealized_pnl_pct)}`)}
            ${cell(`${Number(position.weight_pct || 0).toFixed(1)}%`, "ws-col-num")}
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function accountsTable(list) {
  const partial = pagination.isPartial("positions") ? "+" : "";
  return `
    <table class="ws-table invest-table accounts-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("accountName"))}</th>
          <th>${escapeHtml(t("accountType"))}</th>
          <th class="ws-col-narrow">${escapeHtml(t("currency"))}</th>
          <th class="ws-col-num ws-split-keep">${escapeHtml(t("netLiquidation"))}</th>
          <th class="ws-col-num">${escapeHtml(t("marketValue"))}</th>
          <th class="ws-col-num">${escapeHtml(t("cash"))}</th>
          <th class="ws-col-num">${escapeHtml(t("buyingPower"))}</th>
          <th class="ws-col-num">${escapeHtml(t("positionsCount"))}</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map((account) => {
            const owned = positions().filter((p) => p.account_id === account.account_id);
            const marketValue = owned.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
            return `
          <tr data-id="${escapeHtml(account.account_id)}" data-href="${escapeHtml(recordUrl(account.account_id, "accounts"))}"${account.account_id === state.route.selectedId ? ' class="ws-selected"' : ""}>
            ${cell(`<span class="strong">${escapeHtml(account.display_name)}</span>`, "", account.display_name)}
            ${cell(`<span class="badge">${escapeHtml(enumLabel(account.account_type, "account_type"))}</span>`)}
            ${cell(escapeHtml(account.currency), "ws-col-narrow")}
            ${cell(money(account.net_liquidation, account.currency), "ws-col-num ws-split-keep")}
            ${cell(money(marketValue, account.currency), "ws-col-num")}
            ${cell(money(account.total_cash, account.currency), "ws-col-num")}
            ${cell(money(account.buying_power, account.currency), "ws-col-num")}
            ${cell(`${owned.length}${partial}`, "ws-col-num")}
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "positions" ? filteredPositions() : filteredAccounts();
  els.viewCount.textContent = `${items.length}${pagination.isPartial(view) ? "+" : ""}`;
  if (!isConnected()) {
    els.listPanel.innerHTML = emptyState(t("setupNeeded"));
  } else {
    const table = view === "positions" ? positionsTable(items) : accountsTable(items);
    const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
    els.listPanel.innerHTML = `${items.length ? table : empty}${pagination.control(view)}`;
  }
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = view === "positions" ? positionDetail(item) : accountDetail(item);
}

function accountDetail(account) {
  const owned = positions().filter((p) => p.account_id === account.account_id);
  const shown = filteredPositions(account.account_id);
  const marketValue = owned.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
  const costBasis = owned.reduce((sum, p) => sum + Number(p.cost_basis || 0), 0);
  const pnl = marketValue - costBasis;
  const pnlPct = costBasis ? (pnl / costBasis) * 100 : 0;
  return `
    <header class="detail-head">
      <h2>${escapeHtml(account.display_name)}</h2>
      <p class="muted">${escapeHtml([enumLabel(account.account_type, "account_type"), account.currency].filter(Boolean).join(" · "))}</p>
    </header>
    ${warnings(account.account_id)}
    <section class="detail-stack">
      <div class="detail-figures detail-figures-3">
        <div><span>${t("netLiquidation")}</span><strong>${money(account.net_liquidation, account.currency)}</strong></div>
        <div><span>${t("marketValue")}</span><strong>${money(marketValue, account.currency)}</strong></div>
        <div><span>${t("unrealizedPnl")}</span><strong class="${pnlClass(pnl)}">${signedMoney(pnl, account.currency)} <small>${pct(pnlPct)}</small></strong></div>
        <div><span>${t("cash")}</span><strong>${money(account.total_cash, account.currency)}</strong></div>
        <div><span>${t("buyingPower")}</span><strong>${money(account.buying_power, account.currency)}</strong></div>
        <div><span>${t("accountId")}</span><strong class="figure-text">${escapeHtml(account.account_id)}</strong></div>
      </div>
      <div class="detail-main">
        <h3>${t("holdings")}</h3>
        ${
          shown.length
            ? `<div class="detail-table">${positionsTable(shown, { linkView: "accounts" })}</div>`
            : emptyState(owned.length ? t("noMatches") : t("noPositions"))
        }
      </div>
    </section>
  `;
}

function positionDetail(position) {
  const account = accounts().find((item) => item.account_id === position.account_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(position.symbol)} <span class="badge">${escapeHtml(enumLabel(position.asset_type, "asset_type"))}</span></h2>
      <p class="muted">${escapeHtml(position.name || "")}</p>
    </header>
    ${warnings(position.account_id)}
    <section class="detail-stack">
      <div class="detail-figures">
        <div><span>${t("marketValue")}</span><strong>${money(position.market_value, position.currency)}</strong></div>
        <div><span>${t("unrealizedPnl")}</span><strong class="${pnlClass(position.unrealized_pnl)}">${signedMoney(position.unrealized_pnl, position.currency)} <small>${pct(position.unrealized_pnl_pct)}</small></strong></div>
        <div><span>${t("dayChange")}</span><strong class="${pnlClass(position.day_change)}">${signedMoney(position.day_change, position.currency)} <small>${pct(position.day_change_pct)}</small></strong></div>
        <div><span>${t("weight")}</span><strong>${Number(position.weight_pct || 0).toFixed(1)}% <small>${t("ofPortfolio")}</small></strong></div>
      </div>
      <dl>
        <dt>${t("account")}</dt><dd>${account ? `<a href="${recordUrl(account.account_id, "accounts")}">${escapeHtml(account.display_name)}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
        <dt>${t("qty")}</dt><dd class="num-dd">${num(position.quantity)}</dd>
        <dt>${t("avgCost")}</dt><dd class="num-dd">${money(position.avg_cost, position.currency)}</dd>
        <dt>${t("last")}</dt><dd class="num-dd">${money(position.last_price, position.currency)}</dd>
        <dt>${t("costBasis")}</dt><dd class="num-dd">${money(position.cost_basis, position.currency)}</dd>
        <dt>${t("currency")}</dt><dd>${escapeHtml(position.currency)}</dd>
      </dl>
    </section>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const webull = summary.webull || {};
  els.settingsContent.innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>Webull</h2>
        <dl>
          <dt>${t("region")}</dt><dd>${escapeHtml(webull.region || "")}</dd>
          <dt>${t("baseUrl")}</dt><dd>${escapeHtml(webull.base_url || "")}</dd>
          <dt>${t("credentials")}</dt><dd>${webull.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
          <dt>${t("secretEnvs")}</dt><dd class="code-dd">${escapeHtml((webull.secret_envs || []).join(", ") || "—")}</dd>
        </dl>
      </section>
    </div>
  `;
}

function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !accountId || !item.account_id || item.account_id === accountId,
  );
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

function render() {
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

function escapeHtml(value) {
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
function onSortClick(event) {
  const header = event.target.closest("[data-sort]");
  if (!header) return false;
  const key = header.dataset.sort;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort = { key, dir: key === "symbol" || key === "name" ? "asc" : "desc" };
  }
  render();
  return true;
}

pagination.bind(els.listPanel);
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-goto-page], a, button")) return;
  if (onSortClick(event)) return;
  const row = event.target.closest("tr[data-href]");
  if (!row) return;
  const url = row.dataset.href;
  // Switching records while the drawer is open replaces the entry, so Close
  // still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
// The holdings table inside an account page: sort in place, rows open the
// position's drawer in the Positions view.
els.detailBody.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  if (onSortClick(event)) return;
  const row = event.target.closest("tr[data-href]");
  if (row) location.hash = row.dataset.href;
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
  const route = { ...state.route, query: els.search.value };
  const path = state.route.presentation === "page" ? `#/${route.view}/${encodeURIComponent(route.id)}` : `#/${route.view}`;
  replaceRoute(`${path}${routeQuery({ peek: state.route.peek }, route)}`);
});
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState().catch((error) => renderSetupRequired(error, boot)));
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-invest-webull-language", state.lang);
  render();
});

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
