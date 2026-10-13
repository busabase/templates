import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a row opens, per view. Chosen by what people do with the record:
//   entities     → page:   an entity is a workplace of its own — it owns its
//                          holdings and accounts, and people stay to read them.
//   assets       → drawer: an asset class is a fact scanned among a few; peek
//                          at its holdings and go back to the allocation.
//   institutions → drawer: same shape — one custodian's accounts and holdings.
//   performance  → page:   each row IS an entity, so it opens that entity's page.
// A `/<id>` path always opens the full page; `?peek=` drives the drawers.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// A row whose record lives in another view opens there.
const ROW_TARGET_VIEW = { performance: "entities" };
const VIEW_HINT = {
  entities: "entitiesHint",
  assets: "assetsHint",
  institutions: "institutionsHint",
  performance: "performanceHint",
};

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-family-office-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-family-office.sidebarCollapsed";

const DONUT_COLORS = ["#334155", "#0d9488", "#2563eb", "#9333ea", "#d97706", "#dc2626", "#65a30d", "#0891b2"];

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  settingsPage: byId("settingsPage"),
  settingsContent: byId("settingsContent"),
  search: byId("search"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  flagCount: byId("count-flags"),
  entityCount: byId("count-entities"),
  accountCount: byId("count-accounts"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot[key] = rows;
  },
  render: () => render(),
  label: (key) => t(key),
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

function enumLabel(value, group = "type") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function baseCurrency() {
  return state.snapshot?.base_currency || "USD";
}

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

function money(value, currency = baseCurrency()) {
  return new Intl.NumberFormat(locale(), { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Number(value || 0),
  );
}

function moneyPrecise(value, currency = baseCurrency()) {
  return new Intl.NumberFormat(locale(), { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
}

function pct(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function quantity(value) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 4 }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
}

const signClass = (value) => (Number(value) < 0 ? "negative" : "positive");

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
  // Performance has no detail of its own: its rows open the entity page.
  if (ROW_TARGET_VIEW[view]) id = "";
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
// The full page: the record in the path. Always a page, whatever the mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  const target = ROW_TARGET_VIEW[view];
  if (target) return detailUrl(id, target);
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list steps back to that exact list entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
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
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("busa-family-office:state", { detail: data }));
  applyDemoRoute();
  render();
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
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const map = {
    entities: "#/entities",
    detail: "#/entities/family-trust",
    assets: "#/assets",
    institutions: "#/institutions",
    performance: "#/performance",
    overview: "#/overview",
  };
  const route = map[scenario] || "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  document.querySelectorAll(".js-refresh").forEach((button) => {
    button.textContent = t("refresh");
  });
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

function entities() {
  return state.snapshot?.entities || [];
}

function accounts() {
  return state.snapshot?.accounts || [];
}

function holdings() {
  return state.snapshot?.holdings || [];
}

function totals() {
  return state.snapshot?.totals || {};
}

function hasData() {
  return holdings().length > 0;
}

function flags() {
  return (state.snapshot?.insights || []).filter((item) => item.severity === "high" || item.severity === "watch");
}

// Holdings are read one page at a time; when more exist than are loaded,
// every sum built from them is a sum over the loaded page and says so.
function holdingsScope() {
  if (!state.settings?.partial?.holdings) return "";
  return t("partialHoldings").replace("{n}", holdings().length);
}

function renderShell() {
  applyI18n();
  const entityCount = pagination.total("entities", entities().length);
  const flagCount = flags().length;
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : state.settings?.demo
      ? t("demoData")
      : hasData()
        ? t("liveData")
        : t("needsImport");
  if (els.flagCount) els.flagCount.textContent = flagCount;
  if (els.entityCount) els.entityCount.textContent = entityCount;
  if (els.accountCount) els.accountCount.textContent = accounts().length;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = hasData() ? `${flagCount} ${t("flagsToReview")}` : t("needsImport");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "entities") return t("entities");
  if (view === "assets") return t("assets");
  if (view === "institutions") return t("institutions");
  if (view === "performance") return t("performance");
  if (view === "settings") return t("settings");
  return t("overview");
}

// ── Lookups ────────────────────────────────────────────────────────────────
function accountById(accountId) {
  return accounts().find((item) => item.account_id === accountId) || null;
}

function accountName(accountId) {
  const account = accountById(accountId);
  if (!account) return accountId ? t("notLoaded") : "";
  return account.display_name || account.institution || "";
}

function institutionFor(accountId) {
  return accountById(accountId)?.institution || "";
}

function rollupFor(entityId) {
  return (state.snapshot?.by_entity || []).find((row) => row.entity_id === entityId) || {};
}

// An entity on the loaded page, else the name its holdings carried into the
// roll-up (the entity row may sit on another page), else nothing.
function entityById(entityId) {
  const loaded = entities().find((item) => item.entity_id === entityId);
  if (loaded) return loaded;
  const roll = rollupFor(entityId);
  return roll.entity_id ? { entity_id: roll.entity_id, name: roll.name, type: "", member: "" } : null;
}

function entityName(entityId) {
  if (!entityId) return "";
  return entityById(entityId)?.name || t("notLoaded");
}

function costFor(entityId) {
  return holdings()
    .filter((h) => h.entity_id === entityId)
    .reduce((sum, h) => sum + (h.cost_basis_base || 0), 0);
}

// ── Shared fragments ───────────────────────────────────────────────────────
function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
}

function warnings(entityId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !entityId || !item.entity_id || item.entity_id === entityId,
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

function weightBar(weight, max) {
  const width = Math.max(((weight || 0) / Math.max(max, 1)) * 100, 2);
  return `<span class="alloc-track"><span class="alloc-fill" style="width:${width}%"></span></span>`;
}

function donut(rows, labelFn) {
  const data = rows.filter((row) => (row.weight_pct || 0) > 0);
  if (!data.length) return emptyState(t("empty"));
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data
    .map((row, index) => {
      const fraction = (row.weight_pct || 0) / 100;
      const dash = fraction * circumference;
      const seg = `<circle r="${radius}" cx="80" cy="80" fill="none" stroke="${DONUT_COLORS[index % DONUT_COLORS.length]}" stroke-width="28" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"></circle>`;
      offset += dash;
      return seg;
    })
    .join("");
  const legend = data
    .map(
      (row, index) => `
      <a class="legend-row" href="${recordUrl(row.asset_class, "assets")}">
        <span class="legend-swatch" style="background:${DONUT_COLORS[index % DONUT_COLORS.length]}"></span>
        <span>${escapeHtml(labelFn(row))}</span>
        <span class="legend-value">${money(row.aum_base)} · ${pct(row.weight_pct)}</span>
      </a>
    `,
    )
    .join("");
  return `
    <div class="alloc-panel">
      <svg class="donut" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(t("allocation"))}">
        ${segments}
        <circle r="46" cx="80" cy="80" fill="var(--surface)"></circle>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

function insightText(insight) {
  const templates = messages[activeLang()]?.insightTemplates || messages.en.insightTemplates || {};
  const template = templates[insight.code] || messages.en.insightTemplates?.[insight.code] || insight.code;
  const params = insight.params || {};
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    let value = params[key];
    if (value === undefined || value === null) return "";
    if (key === "asset_class") value = enumLabel(value, "asset");
    else if (key === "delta") value = `${Number(value) > 0 ? "+" : ""}${value}`;
    return escapeHtml(String(value));
  });
}

function severityLabel(severity) {
  if (severity === "high") return t("sevHigh");
  if (severity === "watch") return t("sevWatch");
  return t("sevInfo");
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it holds the flag, entity
// and account counts). Cost basis lives on Performance's total row.
function metricsBand() {
  const total = totals();
  const scope = holdingsScope();
  const label = (key) => escapeHtml(scope ? `${t(key)} · ${scope}` : t(key));
  return [
    [label("aum"), money(total.aum_base), ""],
    [label("unrealizedPnl"), money(total.unrealized_pnl_base), signClass(total.unrealized_pnl_base)],
    [label("unrealizedPnlPct"), pct(total.unrealized_pnl_pct), signClass(total.unrealized_pnl_pct)],
  ]
    .map(
      ([text, value, className]) =>
        `<div><span title="${text}">${text}</span><strong${className ? ` class="${className}"` : ""}>${value}</strong></div>`,
    )
    .join("");
}

function insightsPanel() {
  const items = state.snapshot?.insights || [];
  const body = items.length
    ? items
        .map((insight) => {
          const tone = insight.severity === "high" ? "danger" : insight.severity === "watch" ? "warning" : "";
          return `
      <div class="insight-row">
        <span class="badge ${tone}">${escapeHtml(severityLabel(insight.severity))}</span>
        <span class="insight-text">${insightText(insight)}</span>
      </div>
    `;
        })
        .join("")
    : `<div class="muted insight-empty">${t("noFlags")}</div>`;
  return `
    <div class="card overview-panel overview-wide" id="insights">
      <h2 title="${escapeHtml(t("insightsNote"))}">${t("insights")}</h2>
      <div class="muted insight-note">${t("insightsNote")}</div>
      <div class="insight-list">${body}</div>
    </div>
  `;
}

function renderOverview() {
  const snapshot = state.snapshot;
  els.overviewSummary.textContent = hasData()
    ? [
        `${t("consolidatedAs")} ${date(snapshot?.generated_at)}`,
        t("baseCurrencyLine").replace("{currency}", baseCurrency()),
        `${holdings().length} ${t("holdingCount")}`,
      ].join(" · ")
    : t("needsImport");
  els.overviewMetrics.innerHTML = metricsBand();
  const byEntity = snapshot?.by_entity || [];
  const byAsset = snapshot?.by_asset_class || [];
  els.overviewBody.innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("headlineAllocation")}</h2>
        ${donut(byAsset, (row) => enumLabel(row.asset_class, "asset"))}
      </div>
      <div class="card overview-panel">
        <h2>${t("topEntities")}</h2>
        ${
          byEntity
            .map(
              (row) => `
          <a class="health-row" href="${recordUrl(row.entity_id, "entities")}">
            <span><strong>${escapeHtml(row.name)}</strong><small>${pct(row.weight_pct)}</small></span>
            <span class="num">${money(row.aum_base)}</span>
            <span class="num ${signClass(row.unrealized_pnl_base)}">${money(row.unrealized_pnl_base)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      ${insightsPanel()}
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const matches = (values, query) =>
  !query ||
  values
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));

const currentQuery = () => state.route.query.trim().toLowerCase();

function entityRows() {
  const query = currentQuery();
  return entities().filter((entity) =>
    matches([entity.name, entity.member, entity.type, enumLabel(entity.type, "type")], query),
  );
}

function assetRows() {
  const query = currentQuery();
  return (state.snapshot?.by_asset_class || []).filter((row) =>
    matches([row.asset_class, enumLabel(row.asset_class, "asset")], query),
  );
}

function institutionRows() {
  const query = currentQuery();
  return (state.snapshot?.by_institution || []).filter((row) => matches([row.institution], query));
}

function performanceRows() {
  const query = currentQuery();
  return (state.snapshot?.by_entity || [])
    .filter((row) => matches([row.name], query))
    .map((row) => {
      const cost = costFor(row.entity_id);
      const pnl = row.unrealized_pnl_base || 0;
      return { ...row, cost, market: row.aum_base || 0, pnl, pnlPct: cost ? (pnl / cost) * 100 : 0 };
    });
}

function entitiesTable(items) {
  return `
    <table class="ws-table fo-table entities-table">
      ${tableHead([
        [t("name")],
        [t("type"), "ws-col-narrow"],
        [t("member")],
        [t("accounts"), "ws-col-narrow ws-col-num"],
        [t("holdings"), "ws-col-narrow ws-col-num"],
        [t("subtotal"), "ws-col-num ws-split-keep"],
        [t("weight"), "ws-col-narrow ws-col-num"],
        [t("unrealizedPnl"), "ws-col-num"],
      ])}
      <tbody>
        ${items
          .map((entity) => {
            const roll = rollupFor(entity.entity_id);
            const accountCount = accounts().filter((item) => item.entity_id === entity.entity_id).length;
            const holdingCount = holdings().filter((item) => item.entity_id === entity.entity_id).length;
            return `${rowOpen(entity.entity_id)}
              ${cell(`<span class="strong">${escapeHtml(entity.name)}</span>`, entity.name)}
              ${cell(`<span class="badge">${escapeHtml(enumLabel(entity.type, "type"))}</span>`, "", "ws-col-narrow")}
              ${cell(escapeHtml(entity.member || ""), entity.member)}
              ${cell(accountCount, "", "ws-col-num")}
              ${cell(holdingCount, "", "ws-col-num")}
              ${cell(money(roll.aum_base), "", "ws-col-num ws-split-keep")}
              ${cell(pct(roll.weight_pct), "", "ws-col-num")}
              ${cell(money(roll.unrealized_pnl_base), "", `ws-col-num ${signClass(roll.unrealized_pnl_base)}`)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function allocationTable(items, { idOf, labelOf, extraHead, extraCells }) {
  const max = Math.max(...items.map((row) => row.weight_pct || 0), 1);
  return `
    <table class="ws-table fo-table allocation-table">
      ${tableHead([
        [extraHead.label],
        [t("marketValueBase"), "ws-col-num"],
        [t("weight"), "ws-col-narrow ws-col-num ws-split-keep"],
        [t("allocation"), "ws-col-wide"],
        ...extraHead.columns,
      ])}
      <tbody>
        ${items
          .map(
            (row) => `${rowOpen(idOf(row))}
              ${cell(`<span class="strong">${escapeHtml(labelOf(row))}</span>`, labelOf(row))}
              ${cell(money(row.aum_base), "", "ws-col-num")}
              ${cell(pct(row.weight_pct), "", "ws-col-num ws-split-keep")}
              ${cell(weightBar(row.weight_pct, max), "", "ws-col-wide")}
              ${extraCells(row)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function assetsTable(items) {
  return allocationTable(items, {
    idOf: (row) => row.asset_class,
    labelOf: (row) => enumLabel(row.asset_class, "asset"),
    extraHead: { label: t("assetClass"), columns: [[t("holdings"), "ws-col-narrow ws-col-num"]] },
    extraCells: (row) =>
      cell(holdings().filter((h) => h.asset_class === row.asset_class).length, "", "ws-col-num"),
  });
}

function institutionsTable(items) {
  return allocationTable(items, {
    idOf: (row) => row.institution,
    labelOf: (row) => row.institution,
    extraHead: {
      label: t("institution"),
      columns: [
        [t("accounts"), "ws-col-narrow ws-col-num"],
        [t("holdings"), "ws-col-narrow ws-col-num"],
      ],
    },
    extraCells: (row) => {
      const accountIds = new Set(
        accounts()
          .filter((item) => item.institution === row.institution)
          .map((item) => item.account_id),
      );
      return `${cell(accountIds.size, "", "ws-col-num")}${cell(
        holdings().filter((h) => accountIds.has(h.account_id)).length,
        "",
        "ws-col-num",
      )}`;
    },
  });
}

function performanceTable(items) {
  const total = totals();
  return `
    <table class="ws-table fo-table performance-table">
      ${tableHead([
        [t("entity")],
        [t("costBasis"), "ws-col-num"],
        [t("marketValue"), "ws-col-num ws-split-keep"],
        [t("unrealizedPnl"), "ws-col-num"],
        [t("unrealizedPnlPct"), "ws-col-num"],
      ])}
      <tbody>
        ${items
          .map(
            (row) => `${rowOpen(row.entity_id)}
              ${cell(`<span class="strong">${escapeHtml(row.name)}</span>`, row.name)}
              ${cell(money(row.cost), "", "ws-col-num")}
              ${cell(money(row.market), "", "ws-col-num ws-split-keep")}
              ${cell(money(row.pnl), "", `ws-col-num ${signClass(row.pnl)}`)}
              ${cell(pct(row.pnlPct), "", `ws-col-num ${signClass(row.pnlPct)}`)}
            </tr>`,
          )
          .join("")}
      </tbody>
      ${
        state.route.query
          ? ""
          : `<tfoot><tr class="total-row">
        ${cell(`<span class="strong">${escapeHtml(holdingsScope() ? `${t("total")} · ${holdingsScope()}` : t("total"))}</span>`)}
        ${cell(money(total.cost_basis_base), "", "ws-col-num strong")}
        ${cell(money(total.aum_base), "", "ws-col-num ws-split-keep strong")}
        ${cell(money(total.unrealized_pnl_base), "", `ws-col-num strong ${signClass(total.unrealized_pnl_base)}`)}
        ${cell(pct(total.unrealized_pnl_pct), "", `ws-col-num strong ${signClass(total.unrealized_pnl_pct)}`)}
      </tr></tfoot>`
      }
    </table>
  `;
}

const VIEW_RENDERERS = {
  entities: { rows: entityRows, table: entitiesTable, empty: () => t("needsImport") },
  assets: { rows: assetRows, table: assetsTable, empty: () => t("empty") },
  institutions: { rows: institutionRows, table: institutionsTable, empty: () => t("empty") },
  performance: { rows: performanceRows, table: performanceTable, empty: () => t("empty") },
};

function renderRecordView() {
  const { view } = state.route;
  const renderer = VIEW_RENDERERS[view];
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = renderer.rows();
  const partial = view === "entities" && pagination.isPartial("entities");
  els.viewCount.textContent = `${items.length}${partial ? "+" : ""}`;
  const empty = emptyState(state.route.query ? t("noMatches") : renderer.empty());
  els.listPanel.innerHTML = `${items.length ? renderer.table(items) : empty}${view === "entities" ? pagination.control("entities") : ""}`;
  renderDetail();
}

// ── Detail (one markup, every mode) ────────────────────────────────────────
// One holdings table for every detail. The entity page has the room for the
// full set; a drawer (asset class, institution) shows who holds it instead of
// the per-row account, quantity and local-currency value.
function holdingsTable(rows, { compact = false } = {}) {
  // The toolbar search narrows the list, not the record opened from it.
  if (!rows.length) return `<div class="empty-inline">${t("empty")}</div>`;
  const columns = compact
    ? [
        [t("symbol"), "", (h) => `<span class="strong">${escapeHtml(h.symbol || "")}</span>`],
        [t("name"), "", (h) => escapeHtml(h.name || ""), (h) => h.name],
        [t("entity"), "", (h) => escapeHtml(entityName(h.entity_id)), (h) => entityName(h.entity_id)],
        [t("marketValueBase"), "num", (h) => money(h.market_value_base)],
        [t("unrealizedPnl"), "num", (h) => money(h.unrealized_pnl_base), null, (h) => signClass(h.unrealized_pnl_base)],
      ]
    : [
        [t("symbol"), "", (h) => `<span class="strong">${escapeHtml(h.symbol || "")}</span>`],
        [t("name"), "", (h) => escapeHtml(h.name || ""), (h) => h.name],
        [t("assetClass"), "", (h) => escapeHtml(enumLabel(h.asset_class, "asset"))],
        [t("account"), "", (h) => escapeHtml(accountName(h.account_id)), (h) => accountName(h.account_id)],
        [t("quantity"), "num", (h) => quantity(h.quantity)],
        [t("marketValue"), "num", (h) => moneyPrecise(h.market_value, h.currency)],
        [t("marketValueBase"), "num", (h) => money(h.market_value_base)],
        [t("unrealizedPnl"), "num", (h) => money(h.unrealized_pnl_base), null, (h) => signClass(h.unrealized_pnl_base)],
      ];
  return `
    <div class="detail-table-wrap">
      <table class="detail-table${compact ? " compact" : ""}">
        <thead><tr>${columns.map(([label, className]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (h) =>
                `<tr>${columns
                  .map(([, className, html, title, tone]) => {
                    const classes = [className, tone ? tone(h) : ""].filter(Boolean).join(" ");
                    const tip = title ? title(h) : "";
                    return `<td${classes ? ` class="${classes}"` : ""}${tip ? ` title="${escapeHtml(tip)}"` : ""}>${html(h)}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function factList(pairs) {
  return `<dl class="detail-facts">${pairs
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
    .join("")}</dl>`;
}

function entityDetail(entity) {
  const roll = rollupFor(entity.entity_id);
  const entityAccounts = accounts().filter((account) => account.entity_id === entity.entity_id);
  const entityHoldings = holdings().filter((h) => h.entity_id === entity.entity_id);
  const scope = holdingsScope();
  return `
    <header class="detail-head">
      <h2>${escapeHtml(entity.name)}</h2>
      ${entity.type ? `<span class="badge">${escapeHtml(enumLabel(entity.type, "type"))}</span>` : ""}
    </header>
    ${warnings(entity.entity_id)}
    ${factList([
      [scope ? `${t("subtotal")} · ${scope}` : t("subtotal"), money(roll.aum_base)],
      [t("weight"), pct(roll.weight_pct)],
      [t("unrealizedPnl"), `<span class="${signClass(roll.unrealized_pnl_base)}">${money(roll.unrealized_pnl_base)}</span>`],
      [t("member"), escapeHtml(entity.member || "—")],
      [t("entityId"), escapeHtml(entity.entity_id)],
    ])}
    <section class="detail-section">
      <h3>${t("holdings")} <span class="muted">${entityHoldings.length}</span></h3>
      ${holdingsTable(entityHoldings)}
    </section>
    <section class="detail-section">
      <h3>${t("accounts")} <span class="muted">${entityAccounts.length}</span></h3>
      ${
        entityAccounts.length
          ? `<div class="account-list">${entityAccounts
              .map(
                (account) => `
            <div class="account-line">
              <strong>${escapeHtml(account.institution)}</strong>
              <span>${escapeHtml(account.display_name || account.account_type || "")}</span>
              <span class="muted">${escapeHtml([account.account_type, account.currency].filter(Boolean).join(" · "))}</span>
            </div>`,
              )
              .join("")}</div>`
          : `<div class="empty-inline">${t("setupNeeded")}</div>`
      }
    </section>
  `;
}

function assetDetail(row) {
  const classHoldings = holdings().filter((h) => h.asset_class === row.asset_class);
  return `
    <header class="detail-head"><h2>${escapeHtml(enumLabel(row.asset_class, "asset"))}</h2></header>
    ${factList([
      [t("marketValueBase"), money(row.aum_base)],
      [t("weight"), pct(row.weight_pct)],
      [t("holdings"), String(classHoldings.length)],
    ])}
    <section class="detail-section">
      <h3>${t("holdings")}</h3>
      ${holdingsTable(classHoldings, { compact: true })}
    </section>
  `;
}

function institutionDetail(row) {
  const instAccounts = accounts().filter((item) => item.institution === row.institution);
  const accountIds = new Set(instAccounts.map((item) => item.account_id));
  const instHoldings = holdings().filter((h) => accountIds.has(h.account_id));
  return `
    <header class="detail-head"><h2>${escapeHtml(row.institution)}</h2></header>
    ${factList([
      [t("marketValueBase"), money(row.aum_base)],
      [t("weight"), pct(row.weight_pct)],
      [t("accounts"), String(instAccounts.length)],
    ])}
    <section class="detail-section">
      <h3>${t("accounts")}</h3>
      <div class="account-list">${instAccounts
        .map(
          (account) => `
        <div class="account-line">
          <strong>${escapeHtml(account.display_name || account.account_type || account.institution)}</strong>
          <a href="${recordUrl(account.entity_id, "entities")}">${escapeHtml(entityName(account.entity_id))}</a>
          <span class="muted">${escapeHtml([account.account_type, account.currency].filter(Boolean).join(" · "))}</span>
        </div>`,
        )
        .join("")}</div>
    </section>
    <section class="detail-section">
      <h3>${t("holdings")}</h3>
      ${holdingsTable(instHoldings, { compact: true })}
    </section>
  `;
}

function detailMarkup(view, id) {
  if (view === "entities") {
    const entity = entityById(id);
    return entity ? entityDetail(entity) : "";
  }
  if (view === "assets") {
    const row = (state.snapshot?.by_asset_class || []).find((item) => item.asset_class === id);
    return row ? assetDetail(row) : "";
  }
  if (view === "institutions") {
    const row = (state.snapshot?.by_institution || []).find((item) => item.institution === id);
    return row ? institutionDetail(row) : "";
  }
  return "";
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    return;
  }
  els.detailBody.innerHTML = detailMarkup(view, selectedId) || emptyState(t("recordMissing"), t("recordMissingDetail"));
}

// ── Settings ───────────────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const fx = summary.fx_rates || {};
  els.settingsContent.innerHTML = `
    <div class="settings">
      <p class="muted settings-note">${t("localFilesOnly")}</p>
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("fxRates")}</dt><dd>${escapeHtml(
            Object.entries(fx)
              .map(([k, v]) => `${k}=${v}`)
              .join(", "),
          )}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("entities")}</h2>
        ${
          (summary.entities || [])
            .map(
              (entity) => `
          <div class="settings-account">
            <strong>${escapeHtml(entity.name)}</strong>
            <span>${escapeHtml(enumLabel(entity.type, "type"))}</span>
            <span>${escapeHtml(entity.member || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("institutions")}</h2>
        <div class="muted">${escapeHtml((summary.institutions || []).join(" · ") || t("setupNeeded"))}</div>
      </section>
    </div>
  `;
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-has-mobile-bar", true);
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
pagination.bind(els.listPanel);

els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while a drawer is open replaces the entry, so Close
  // still steps back to the list the drawer was opened from.
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
  const { view, id, peek } = state.route;
  const next = { ...state.route, query: els.search.value };
  replaceRoute(
    id ? `#/${view}/${encodeURIComponent(id)}${routeQuery({}, next)}` : `#/${view}${routeQuery({ peek }, next)}`,
  );
});
document.querySelectorAll(".js-refresh").forEach((button) => {
  button.addEventListener("click", () => loadState());
});
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-family-office-language", state.lang);
  render();
});

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
