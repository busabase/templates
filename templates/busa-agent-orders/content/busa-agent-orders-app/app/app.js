import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  DECIDABLE_PROPOSALS,
  agentTotals,
  attentionList,
  evaluateProposal,
  exceptionQueue,
  filterOrders,
  guardrailIndex,
  orderFlags,
  orderRevenue,
  reviewQueue,
} from "./js/orders-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const LANGUAGE_STORAGE_KEY = "busa-agent-orders-language";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-agent-orders.sidebarCollapsed";
const BROWSED_KEYS = ["orders", "guardrails", "proposals", "exceptions"];
const AGENT_NAMES = {
  "meta-muse": "Meta Muse",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  other: "Other agent",
};
const ORDER_STATUSES = ["paid", "fulfilled", "refunded", "disputed"];
const PROPOSAL_VIEWS = ["", "approved", "applied", "blocked", "all"];
const EXCEPTION_VIEWS = ["", "resolved", "accepted", "all"];

// Where a record opens, per view. Chosen by what people do with the record:
//   orders     → drawer: an order is a fact you scan many of — check paid vs
//                listed and whether an exception covers it, then go back.
//   proposals  → split:  the price review queue is worked top to bottom, one
//                decision after the next, so the queue stays beside it.
//   exceptions → split:  the same — open exceptions are closed one by one.
//   guardrails → drawer: a per-SKU reference row, looked up and dismissed.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// The view's one-line description lives in the toolbar title's tooltip.
const VIEW_HINT = {
  orders: "ordersSubtitle",
  proposals: "proposalsSubtitle",
  exceptions: "exceptionsSubtitle",
  guardrails: "guardrailsSubtitle",
};

const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || appConfig.locale,
  ),
  notice: null,
  error: "",
  busy: "",
  loadingMore: {},
  pageError: "",
  drafts: {},
  noteErrors: {},
};

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewTitle: byId("overviewTitle"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewActions: byId("viewActions"),
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
  countBreaching: byId("count-breaching"),
  countOpen: byId("count-open"),
  countUncovered: byId("count-uncovered"),
  countWaiting: byId("count-waiting"),
  language: byId("language"),
};

// ── shell ────────────────────────────────────────────────────────────────────

const PHONE_QUERY = "(max-width: 720px)";
const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
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

// ── i18n & formatting ───────────────────────────────────────────────────────

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

function t(key, vars = {}) {
  const template = messages[activeLang()]?.[key] ?? messages.en[key] ?? key;
  return Object.entries(vars).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), template);
}

/** Count copy: a locale's `_one` form when it has one (English), otherwise the general form. */
function tn(key, n, vars = {}) {
  const one = n === 1 ? messages[activeLang()]?.[`${key}_one`] : undefined;
  return one === undefined ? t(key, { ...vars, n }) : t(`${key}_one`, { ...vars, n });
}

function enumLabel(group, value) {
  if (!value) return "";
  return messages[activeLang()]?.enum?.[group]?.[value] || messages.en.enum?.[group]?.[value] || value;
}

const agentName = (agent) => AGENT_NAMES[agent] || agent || "";
const locale = () => (activeLang() === "zh" ? "zh-CN" : "en-US");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDay(day) {
  if (!day) return "";
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

const formatRange = (window) => (window ? `${formatDay(window.from)} – ${formatDay(window.to)}` : "");

function formatTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** The Settings currency (or the row's own) when it is a valid ISO code; a plain number otherwise. */
function money(value, currency = settings()?.currency) {
  if (value == null) return "—";
  const code = String(currency || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale(), {
        style: "currency",
        currency: code,
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      // fall through to a plain number
    }
  }
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value);
}

const signedMoney = (value, currency) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${money(Math.abs(value), currency)}`;
const signedPct = (value, digits = 1) =>
  value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(digits)}%`;

// ── data access helpers ─────────────────────────────────────────────────────

const rows = (key) => state.data?.rows?.[key] || [];
const settings = () => state.data?.settings || null;
const ordersById = () => new Map(rows("orders").map((row) => [row.id, row]));
const recordById = (key, id) => (id ? rows(key).find((row) => row.id === id) || null : null);

function loadedLabel(key) {
  const loaded = rows(key).length;
  const total = state.data?.totals?.[key];
  if (total != null) return t("loadedOf", { loaded, total });
  return state.data?.cursors?.[key] ? t("loadedPlus", { loaded }) : String(loaded);
}

function loadMoreControl(key) {
  if (!state.data?.cursors?.[key]) return "";
  const busy = Boolean(state.loadingMore[key]);
  const label = key === state.route.view ? t("loadMore") : t("loadMoreOf", { name: t(key) });
  return `<div class="load-more">
    <span class="muted">${esc(key === state.route.view ? loadedLabel(key) : `${t(key)} · ${loadedLabel(key)}`)}</span>
    <button type="button" class="button" data-load-more="${key}" ${busy ? "disabled" : ""}>${esc(busy ? t("loadingMore") : label)}</button>
    ${state.pageError ? `<span class="inline-error" role="alert">${esc(t("loadFailed", { error: state.pageError }))}</span>` : ""}
  </div>`;
}

// One page per click: append the next page without duplicates. Never loops.
async function loadMore(key) {
  const cursor = state.data?.cursors?.[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.pageError = "";
  render();
  try {
    const provider = await getProvider();
    const page = await provider.fetchPage(key, cursor);
    const seen = new Set(rows(key).map((row) => row.id));
    state.data.rows[key] = [...rows(key), ...page.rows.filter((row) => !seen.has(row.id))];
    state.data.cursors[key] = page.nextCursor;
  } catch (error) {
    state.pageError = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// ── routing ─────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?peek=…&view=…&agent=…&status=…&flagged=1]`. Filters and
// the peeked record live in the URL so refresh, shared links and Back restore
// the same list context. Legacy `#/orders/flagged` and `#/proposals/approved`
// style links still open the filtered list.

function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  let flagged = params.get("flagged") === "1";
  let filter = params.get("view") || "";
  if (view === "orders" && id === "flagged") [id, flagged] = ["", true];
  if (view === "proposals" && PROPOSAL_VIEWS.includes(id)) [id, filter] = ["", id];
  if (view === "exceptions" && EXCEPTION_VIEWS.includes(id)) [id, filter] = ["", id];
  const views = view === "proposals" ? PROPOSAL_VIEWS : view === "exceptions" ? EXCEPTION_VIEWS : [""];
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    filter: views.includes(filter) ? filter : "",
    agent: params.get("agent") || "",
    status: ORDER_STATUSES.includes(status) ? status : "",
    flagged,
  };
}

function routeQuery(extra = {}, route = state.route) {
  const params = new URLSearchParams();
  if (route.view === "orders") {
    if (route.agent) params.set("agent", route.agent);
    if (route.status) params.set("status", route.status);
    if (route.flagged) params.set("flagged", "1");
  }
  if (route.filter) params.set("view", route.filter);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
const otherView = (view) => (view === state.route.view ? state.route : { view, filter: "" });
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => `#/${view}/${encodeURIComponent(id)}${routeQuery({}, otherView(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id }, otherView(view))}`;

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list replaces nothing but remembers where it
  // came from, so Back/Close/Escape step back to that exact list entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.view !== state.route.view || previous.selectedId !== state.route.selectedId) state.notice = null;
  setMobileSidebarOpen(false);
  render();
  if (previous.view !== state.route.view) els.listPanel.scrollTop = 0;
  els.detailPanel.scrollTop = 0;
}

// Filter changes replace the current entry: they should not each be a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── loading ─────────────────────────────────────────────────────────────────

let loadToken = 0;
async function loadState() {
  const token = ++loadToken;
  const provider = await getProvider();
  const data = await provider.getState();
  if (token !== loadToken) return;
  closeConnectGate();
  state.data = data;
  state.error = "";
  state.pageError = "";
  render();
}

// ── rendering primitives ────────────────────────────────────────────────────

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = activeLang() === "zh" ? { auto: "自动" } : { auto: "Auto" };
  for (const option of els.language.options) if (languageLabels[option.value]) option.textContent = languageLabels[option.value];
  els.refresh.textContent = t("refresh");
  els.mobileRefresh.title = t("refresh");
  els.mobileRefresh.setAttribute("aria-label", t("refresh"));
  els.sidebarToggle.title = t("toggleSidebar");
  els.sidebarToggle.setAttribute("aria-label", t("toggleSidebar"));
  els.mobileSidebarToggle.title = t("openSidebar");
  els.mobileSidebarToggle.setAttribute("aria-label", t("openSidebar"));
  els.overviewTitle.textContent = t("overview");
  els.overviewMetrics.setAttribute("aria-label", t("channelTitle"));
  els.settingsTitle.textContent = t("settings");
  els.settingsTitle.title = t("settingsSubtitle");
  els.detailExpand.textContent = t("openFullPage");
}

const currentAttention = () =>
  attentionList({ orders: rows("orders"), guardrails: rows("guardrails"), proposals: rows("proposals"), exceptions: rows("exceptions") });

function syncLabel() {
  if (!state.data) return t("loading");
  return state.data.demo ? t("demoNote") : t("liveNote", { time: formatTime(state.data.loaded_at) });
}

function renderShell() {
  applyI18n();
  const attention = currentAttention();
  els.countBreaching.textContent = String(attention.counts.breaching);
  els.countOpen.textContent = String(attention.counts.open);
  els.countUncovered.textContent = String(attention.counts.uncovered);
  els.countWaiting.textContent = String(rows("proposals").filter((row) => DECIDABLE_PROPOSALS.has(row.status)).length);
  els.syncStatus.textContent = syncLabel();
  els.mobileViewMeta.textContent = syncLabel();
  els.language.value = state.lang;
  document.querySelectorAll("nav [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function setTitle(title) {
  els.mobileViewTitle.textContent = title;
  document.title = `${title} · ${t("appTitle")}`;
}

const badge = (label, tone = "") => `<span class="badge ${tone}">${esc(label)}</span>`;
const toneForProposal = (status) =>
  ({ proposed: "active", "changes-requested": "warning", approved: "positive", applied: "positive", blocked: "danger" })[status] || "";
const toneForException = (status) => ({ open: "warning", resolved: "positive", accepted: "" })[status] || "";
const toneForOrder = (status) => ({ refunded: "warning", disputed: "danger" })[status] || "";

function emptyState(title, body, action = "") {
  return `<div class="empty-state">
    <div class="empty-state-icon" aria-hidden="true">○</div>
    <strong>${esc(title)}</strong>
    ${body ? `<p>${esc(body)}</p>` : ""}
    ${action}
  </div>`;
}

function noticeBar() {
  if (!state.notice) return "";
  return `<div class="notice ${state.notice.tone || ""}" role="status">${esc(state.notice.text)}</div>`;
}

const cell = (html, { title = "", className = "" } = {}) =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${esc(title)}"` : ""}>${html}</td>`;

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${esc(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id, extraClass = "") => {
  const classes = [extraClass, id === state.route.selectedId ? "ws-selected" : ""].filter(Boolean).join(" ");
  return `<tr data-id="${esc(id)}" tabindex="0"${classes ? ` class="${classes}"` : ""}>`;
};

// ── overview ────────────────────────────────────────────────────────────────

const unitsLine = (totals) => t("ordersUnits", { orders: tn("countOrders", totals.orders), units: tn("countUnits", totals.units) });

// Three numbers the sidebar does not already show. Revenue is quantity × unit
// price paid — per-row arithmetic with no server aggregate — so it is computed
// from the loaded orders and says so when more orders exist than are loaded.
function metricsBand(totals, attention) {
  const partial = Boolean(state.data?.cursors?.orders);
  const scope = partial ? ` · ${t("loadedScope")}` : "";
  const now = totals.total.current.revenue;
  const before = totals.total.previous.revenue;
  const delta = totals.latest && totals.total.previous.orders ? now - before : null;
  const deltaPct = before > 0 ? ((now - before) / before) * 100 : null;
  const cells = [
    [t("metricRevenue") + scope, totals.latest ? money(now) : "—", ""],
    [
      t("metricDelta") + scope,
      delta == null ? "—" : `${signedMoney(delta)}${deltaPct == null ? "" : ` (${signedPct(deltaPct, 0)})`}`,
      delta == null ? "" : delta > 0 ? "up" : delta < 0 ? "down" : "",
    ],
    [t("metricImpact"), attention.open.length ? signedMoney(attention.impact) : money(0), attention.impact < 0 ? "down" : ""],
  ];
  return cells
    .map(([label, value, tone]) => `<div><span title="${esc(label)}">${esc(label)}</span><strong class="${tone}">${esc(value)}</strong></div>`)
    .join("");
}

function renderOverview() {
  setTitle(t("overview"));
  const store = settings()?.store_name;
  const orders = rows("orders");
  const totals = agentTotals({ orders, settings: settings() });
  const attention = currentAttention();
  els.overviewSummary.textContent = store ? t("overviewSubtitle", { store }) : t("overviewSubtitleNoStore");
  els.overviewMetrics.innerHTML = metricsBand(totals, attention);

  const deltaLine = (item) => {
    if (!item.previous.orders) return `<span class="muted">${esc(t("noEarlier"))}</span>`;
    const tone = item.delta.revenue > 0 ? "up" : item.delta.revenue < 0 ? "down" : "";
    const sign = item.delta.orders > 0 ? "+" : item.delta.orders < 0 ? "−" : "±";
    return `<span class="metric-delta ${tone}"><b>${esc(signedMoney(item.delta.revenue))}</b> ${item.delta.revenue_pct == null ? "" : `(${esc(signedPct(item.delta.revenue_pct * 100, 0))})`} · ${esc(tn("deltaOrders", Math.abs(item.delta.orders), { sign }))} <span class="muted">${esc(t("deltaVsPrev"))}</span></span>`;
  };

  const channelCard = !totals.latest
    ? `<section class="card">${emptyState(t("noOrders"), t("noOrdersBody"))}</section>`
    : `<section class="card">
        <div class="card-heading">
          <div>
            <h2>${esc(t("channelByAgent"))}</h2>
            <p class="muted">${esc(t("channelHint", { current: formatRange(totals.current), previous: formatRange(totals.previous) }))}</p>
          </div>
          <a class="text-link" href="#/orders">${esc(t("viewOrders"))}</a>
        </div>
        <div class="agent-grid">
          ${totals.agents
            .map(
              (item) => `<article class="agent-cell" data-agent="${esc(item.agent)}">
                <div class="agent-name">${esc(agentName(item.agent))}</div>
                <div class="agent-value">${esc(money(item.current.revenue))}</div>
                <div class="agent-meter" aria-hidden="true"><span style="width:${Math.round(item.share * 100)}%"></span></div>
                <div class="muted">${item.current.orders ? esc(unitsLine(item.current)) : esc(t("noOrdersWindow"))}</div>
                ${deltaLine(item)}
              </article>`,
            )
            .join("")}
        </div>
        <p class="footnote muted">${esc(t("revenueGross"))} · ${esc(t("allAgentsUnits", { line: unitsLine(totals.total.current) }))}${state.data?.cursors?.orders ? ` · ${esc(t("loadedOnly", { count: orders.length }))}` : ""}</p>
      </section>`;

  const breaching = attention.breaching.length
    ? `<ul class="attention-list">${attention.breaching
        .map(
          ({ proposal, check }) => `<li class="attention-item">
            <div class="attention-main">
              <a href="${recordUrl(proposal.id, "proposals")}">${esc(proposal.title)}</a>
              <div class="muted">${esc(proposal.sku)} · ${esc(money(proposal.current_price))} → ${esc(money(proposal.proposed_price))} (${esc(signedPct(check.change_pct))})</div>
            </div>
            <div class="badge-row">${check.computed.map((item) => badge(t(`kind_${item.kind}`), "danger")).join("")}${check.mismatch.length ? badge("≠", "warning") : ""}</div>
          </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t("breachingEmpty"))}</p>`;

  const lookup = ordersById();
  const openList = attention.open.length
    ? `<ul class="attention-list">${attention.open
        .map(
          (row) => `<li class="attention-item">
            <div class="attention-main">
              <a href="${recordUrl(row.id, "exceptions")}">${esc(row.title)}</a>
              <div class="muted">${esc(enumLabel("exceptionType", row.type))}${lookup.get(row.order)?.order_no || row.sku ? ` · ${esc(lookup.get(row.order)?.order_no || row.sku)}` : ""}</div>
            </div>
            <span class="impact ${row.impact < 0 ? "negative" : ""}">${esc(row.impact == null ? "—" : signedMoney(row.impact))}</span>
          </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t("exceptionsEmpty"))}</p>`;

  const uncovered = attention.uncovered.length
    ? `<ul class="attention-list">${attention.uncovered
        .map(
          (order) => `<li class="attention-item">
            <div class="attention-main">
              <a href="${recordUrl(order.id, "orders")}">${esc(order.order_no)} · ${esc(order.sku)}</a>
              <div class="muted">${esc(t("uncoveredLine", { agent: agentName(order.agent), paid: money(order.paid_price, order.currency), listed: money(order.listed_price, order.currency), date: formatDay(order.ordered_on) }))}</div>
            </div>
            ${badge(t("belowListed", { amount: money(orderFlags(order, rows("guardrails")).shortfall, order.currency) }), "warning")}
          </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t("uncoveredEmpty"))}</p>`;

  els.overviewBody.innerHTML = `
    ${channelCard}
    <div class="overview-columns">
      <section class="card">
        <div class="card-heading">
          <h2>${esc(t("breachingTitle"))}</h2>
          <a class="text-link" href="#/proposals">${esc(t("reviewAll"))}</a>
        </div>
        ${breaching}
      </section>
      <section class="card">
        <div class="card-heading">
          <h2>${esc(t("exceptionsTitle"))}</h2>
          <a class="text-link" href="#/exceptions">${esc(t("viewAll"))}</a>
        </div>
        ${openList}
        <h3 class="subhead">${esc(t("uncoveredTitle"))}</h3>
        ${uncovered}
      </section>
    </div>`;
}

// ── record views ────────────────────────────────────────────────────────────

const proposalMatches = (row, id) => (id === "all" ? true : id ? row.status === id : DECIDABLE_PROPOSALS.has(row.status));
const exceptionMatches = (row, id) => (id === "all" ? true : id ? row.status === id : row.status === "open");

// Segmented tabs on a wide screen; the same choices as one select on a phone,
// so the toolbar stays a single row there.
function segments(views, labelFor, countFor, active) {
  const tabs = `<div class="segmented view-tabs" role="tablist">${views
    .map(
      (id) =>
        `<button type="button" role="tab" aria-selected="${active === id}" class="segment ${active === id ? "active" : ""}" data-filter="${id}">${esc(labelFor(id))} <b>${countFor(id)}</b></button>`,
    )
    .join("")}</div>`;
  const select = `<select class="filter-select" data-filter-select aria-label="${esc(t("status"))}">${views
    .map((id) => `<option value="${id}" ${active === id ? "selected" : ""}>${esc(labelFor(id))} (${countFor(id)})</option>`)
    .join("")}</select>`;
  return tabs + select;
}

const refreshButton = () => `<button type="button" class="button" data-refresh>${esc(t("refresh"))}</button>`;

function ordersList() {
  const route = state.route;
  const orders = rows("orders");
  const guardrails = guardrailIndex(rows("guardrails"));
  const list = filterOrders(orders, { agent: route.agent, status: route.status, flagged: route.flagged }, rows("guardrails"));
  const agents = [...new Set(orders.map((row) => row.agent).filter(Boolean))];
  const actions = `
    <select data-order-filter="agent" aria-label="${esc(t("agent"))}">
      <option value="">${esc(t("allAgents"))}</option>
      ${agents.map((agent) => `<option value="${esc(agent)}" ${route.agent === agent ? "selected" : ""}>${esc(agentName(agent))}</option>`).join("")}
    </select>
    <select data-order-filter="status" aria-label="${esc(t("status"))}">
      <option value="">${esc(t("allStatuses"))}</option>
      ${ORDER_STATUSES.map((status) => `<option value="${status}" ${route.status === status ? "selected" : ""}>${esc(enumLabel("orderStatus", status))}</option>`).join("")}
    </select>
    <label class="toggle-filter" title="${esc(t("filterNote", { count: orders.length }))}"><input data-order-filter="flagged" type="checkbox" ${route.flagged ? "checked" : ""}> ${esc(t("onlyFlagged"))}</label>
    ${refreshButton()}`;
  const table = `<table class="ws-table orders-table">
    ${tableHead([
      [t("order")],
      [t("orderedOn"), "ws-col-narrow"],
      [t("agent")],
      [t("sku")],
      [t("qty"), "col-qty num"],
      [t("paid"), "ws-col-num ws-split-keep"],
      [t("listed"), "ws-col-num"],
      [t("revenue"), "ws-col-num"],
      [t("priceCheck"), "ws-col-wide"],
      [t("status"), "ws-col-narrow"],
    ])}
    <tbody>
      ${list
        .map((order) => {
          const flags = orderFlags(order, guardrails);
          const problem = flags.below_listed || flags.below_floor;
          const checks = [
            flags.below_floor ? badge(t("belowFloor"), "danger") : "",
            flags.below_listed ? badge(t("belowListed", { amount: money(flags.shortfall, order.currency) }), "warning") : "",
          ].join("");
          return `${rowOpen(order.id, problem ? "flagged" : "")}
            ${cell(`<strong>${esc(order.order_no)}</strong>`, { title: order.order_no })}
            ${cell(esc(formatDay(order.ordered_on)), { className: "ws-col-narrow" })}
            ${cell(esc(agentName(order.agent)))}
            ${cell(`<code>${esc(order.sku)}</code>`, { title: order.sku })}
            ${cell(esc(order.quantity), { className: "col-qty num" })}
            ${cell(`<span class="${problem ? "paid-below" : ""}">${esc(money(order.paid_price, order.currency))}</span>`, { className: "ws-col-num ws-split-keep" })}
            ${cell(esc(money(order.listed_price, order.currency)), { className: "ws-col-num" })}
            ${cell(esc(money(orderRevenue(order), order.currency)), { className: "ws-col-num" })}
            ${cell(checks || `<span class="muted">—</span>`, { className: "ws-col-wide" })}
            ${cell(badge(enumLabel("orderStatus", order.status), toneForOrder(order.status)), { className: "ws-col-narrow" })}
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
  return {
    actions,
    count: list.length,
    narrowed: Boolean(route.agent || route.status || route.flagged),
    list: `${list.length ? table : emptyState(t("noMatchingOrders"), t("noMatchingOrdersBody"))}${loadMoreControl("orders")}`,
  };
}

function proposalsList() {
  const view = state.route.filter;
  const index = guardrailIndex(rows("guardrails"));
  const all = reviewQueue(rows("proposals"), rows("guardrails"));
  const list = all.filter((row) => proposalMatches(row, view));
  const actions = `${segments(
    PROPOSAL_VIEWS,
    (id) => (id === "" ? t("toDecide") : id === "all" ? t("all") : enumLabel("proposalStatus", id)),
    (id) => all.filter((row) => proposalMatches(row, id)).length,
    view,
  )}${refreshButton()}`;
  const table = `<table class="ws-table queue-table proposals-table">
    ${tableHead([[t("proposal")], [t("status")], [t("changePct"), "ws-col-num ws-split-keep"]])}
    <tbody>
      ${list
        .map((row) => {
          const check = evaluateProposal(row, index);
          const breach = check.computed.length > 0;
          return `${rowOpen(row.id)}
            ${cell(`${breach ? `<span class="breach-dot" title="${esc(t("guardrailCheck"))}" aria-label="${esc(t("guardrailCheck"))}"></span>` : ""}<span class="row-title">${esc(row.title)}</span>`, { title: row.title })}
            ${cell(badge(enumLabel("proposalStatus", row.status), toneForProposal(row.status)))}
            ${cell(`<span class="${check.computed.some((item) => item.kind === "step") ? "paid-below" : ""}">${esc(signedPct(check.change_pct))}</span>`, { className: "ws-col-num ws-split-keep" })}
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
  return {
    actions,
    count: list.length,
    narrowed: false,
    list: `${list.length ? table : emptyState(t("noProposals"), t("noProposalsBody"))}${loadMoreControl("proposals")}${loadMoreControl("guardrails")}`,
  };
}

function exceptionsList() {
  const view = state.route.filter;
  const all = exceptionQueue(rows("exceptions"));
  const list = all.filter((row) => exceptionMatches(row, view));
  const actions = `${segments(
    EXCEPTION_VIEWS,
    (id) => (id === "" ? t("exceptionsOpen") : id === "all" ? t("all") : enumLabel("exceptionStatus", id)),
    (id) => all.filter((row) => exceptionMatches(row, id)).length,
    view,
  )}${refreshButton()}`;
  const table = `<table class="ws-table queue-table exceptions-table">
    ${tableHead([[t("exception")], [t("status")], [t("impact"), "ws-col-num ws-split-keep"]])}
    <tbody>
      ${list
        .map(
          (row) => `${rowOpen(row.id)}
            ${cell(`<span class="row-title">${esc(row.title)}</span>`, { title: row.title })}
            ${cell(badge(enumLabel("exceptionStatus", row.status), toneForException(row.status)))}
            ${cell(`<span class="impact ${row.impact < 0 ? "negative" : ""}">${esc(row.impact == null ? "—" : signedMoney(row.impact))}</span>`, { className: "ws-col-num ws-split-keep" })}
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
  return {
    actions,
    count: list.length,
    narrowed: false,
    list: `${list.length ? table : emptyState(t("noExceptions"), t("noExceptionsBody"))}${loadMoreControl("exceptions")}${loadMoreControl("orders")}`,
  };
}

function guardrailsList() {
  const list = [...rows("guardrails")].sort((a, b) => a.sku.localeCompare(b.sku));
  const table = `<table class="ws-table guardrails-table">
    ${tableHead([
      [t("sku")],
      [t("floor"), "ws-col-num"],
      [t("ceiling"), "ws-col-num"],
      [t("maxChange"), "ws-col-num"],
      [t("samePrice")],
      [t("owner")],
    ])}
    <tbody>
      ${list
        .map(
          (row) => `${rowOpen(row.id)}
            ${cell(`<code>${esc(row.sku)}</code>`, { title: row.sku })}
            ${cell(esc(money(row.floor_price)), { className: "ws-col-num" })}
            ${cell(esc(money(row.ceiling_price)), { className: "ws-col-num" })}
            ${cell(row.max_change_pct == null ? "—" : `±${esc(row.max_change_pct)}%`, { className: "ws-col-num" })}
            ${cell(row.same_price_everywhere ? badge(t("yes"), "active") : `<span class="muted">${esc(t("no"))}</span>`)}
            ${cell(esc(row.owner || "—"), { title: row.owner })}
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
  return {
    actions: refreshButton(),
    count: list.length,
    narrowed: false,
    list: `${list.length ? table : emptyState(t("noGuardrails"), t("noGuardrailsBody"))}${loadMoreControl("guardrails")}`,
  };
}

const LISTS = { orders: ordersList, proposals: proposalsList, exceptions: exceptionsList, guardrails: guardrailsList };

function renderRecordView() {
  const { view } = state.route;
  setTitle(t(view));
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const model = LISTS[view]();
  els.viewCount.textContent = String(model.count);
  document.body.classList.toggle("ws-searching", model.narrowed);
  // Keep a focused control (a select the user just changed) across re-renders.
  const focused = document.activeElement?.dataset || {};
  const focusSelector =
    focused.orderFilter != null
      ? `[data-order-filter="${focused.orderFilter}"]`
      : focused.filterSelect != null
        ? "[data-filter-select]"
        : focused.filter != null
          ? `[data-filter="${focused.filter}"]`
          : "";
  els.viewActions.innerHTML = model.actions;
  if (focusSelector && els.viewActions.contains(document.activeElement) === false) els.viewActions.querySelector(focusSelector)?.focus();
  els.listPanel.innerHTML = model.list;
  renderDetail();
}

// ── detail (one markup for drawer, split and full page) ─────────────────────

const DETAIL_RENDERERS = {
  orders: (row) => orderDetail(row),
  proposals: (row) => proposalDetail(row),
  exceptions: (row) => exceptionDetail(row),
  guardrails: (row) => guardrailDetail(row),
};
const EMPTY_PROMPT = { proposals: "selectProposal", exceptions: "selectException" };

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isPhone() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page" || isPhone();
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${esc(t(EMPTY_PROMPT[view]))}</div>` : "";
    return;
  }
  const row = recordById(view, selectedId);
  // A record named by the URL that is not on a loaded page. This app has no
  // records.get permission, so it says so instead of reading more pages.
  els.detailBody.innerHTML = row
    ? `${noticeBar()}${DETAIL_RENDERERS[view](row)}`
    : emptyState(t("recordMissing"), state.data?.cursors?.[view] ? t("recordMissingMore") : t("recordMissingBody"));
}

const detailHead = (title, sub, badges) => `<header class="detail-head">
    <div class="detail-title">
      <h2>${esc(title)}</h2>
      ${sub ? `<div class="muted">${sub}</div>` : ""}
    </div>
    <div class="badge-row">${badges}</div>
  </header>`;

const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;

function orderDetail(order) {
  const guardrails = guardrailIndex(rows("guardrails"));
  const flags = orderFlags(order, guardrails);
  const guardrail = guardrails.get(order.sku) || null;
  const covering = rows("exceptions").filter((row) => row.order === order.id);
  const checks = [
    flags.below_floor
      ? `<div class="notice danger compact">${esc(t("orderBelowFloor", { floor: money(guardrail?.floor_price, order.currency) }))}</div>`
      : "",
    flags.below_listed
      ? `<div class="notice warning compact">${esc(t("orderBelowListed", { amount: money(flags.shortfall, order.currency) }))}</div>`
      : "",
    flags.below_listed && !covering.length ? `<div class="notice compact">${esc(t("orderUncovered"))}</div>` : "",
  ].join("");
  return `<article class="record-detail">
    ${detailHead(order.order_no, `${esc(agentName(order.agent))} · ${esc(formatDay(order.ordered_on))}`, badge(enumLabel("orderStatus", order.status), toneForOrder(order.status)))}
    ${checks}
    <dl class="facts">
      ${order.store ? fact(t("store"), esc(enumLabel("store", order.store))) : ""}
      ${fact(t("sku"), `<code>${esc(order.sku)}</code>`)}
      ${fact(t("quantity"), esc(order.quantity))}
      ${fact(t("unitPaid"), `<span class="${flags.below_listed || flags.below_floor ? "paid-below" : ""}">${esc(money(order.paid_price, order.currency))}</span>`)}
      ${fact(t("listedAt"), esc(money(order.listed_price, order.currency)))}
      ${fact(t("revenue"), esc(money(orderRevenue(order), order.currency)))}
    </dl>
    <section class="detail-section">
      <h3>${esc(t("guardrailFor", { sku: order.sku }))}</h3>
      ${
        guardrail
          ? `<a class="related-row" href="${recordUrl(guardrail.id, "guardrails")}"><span>${esc(t("checkFloor", { limit: money(guardrail.floor_price) }))} · ${esc(t("checkCeiling", { limit: money(guardrail.ceiling_price) }))}${guardrail.max_change_pct == null ? "" : ` · ${esc(t("checkStep", { limit: guardrail.max_change_pct }))}`}</span></a>`
          : `<p class="muted">${esc(t("noGuardrailFor"))}</p>`
      }
    </section>
    <section class="detail-section">
      <h3>${esc(t("exceptions"))}</h3>
      ${
        covering.length
          ? covering
              .map(
                (row) =>
                  `<a class="related-row" href="${recordUrl(row.id, "exceptions")}"><span>${esc(row.title)}</span>${badge(enumLabel("exceptionStatus", row.status), toneForException(row.status))}</a>`,
              )
              .join("")
          : `<p class="muted">${esc(t("noExceptionForOrder"))}</p>`
      }
    </section>
  </article>`;
}

function checkMarkup(proposal, check) {
  if (!check.guardrail) return `<div class="check-line warning">${esc(t("noGuardrail", { sku: proposal.sku }))}</div>`;
  const g = check.guardrail;
  const breached = new Map(check.computed.map((item) => [item.kind, item]));
  const line = (kind, okLabel, breachLabel) => {
    if (breached.has(kind)) return `<li class="check-line breach"><span aria-hidden="true">✕</span> ${esc(breachLabel)}</li>`;
    return `<li class="check-line ok"><span aria-hidden="true">✓</span> ${esc(okLabel)}</li>`;
  };
  const items = [];
  if (g.floor_price != null) items.push(line("floor", t("checkFloor", { limit: money(g.floor_price) }), t("breachFloor", { limit: money(g.floor_price) })));
  if (g.ceiling_price != null) items.push(line("ceiling", t("checkCeiling", { limit: money(g.ceiling_price) }), t("breachCeiling", { limit: money(g.ceiling_price) })));
  if (g.max_change_pct != null) {
    items.push(line("step", t("checkStep", { limit: g.max_change_pct }), t("breachStep", { value: signedPct(check.change_pct), limit: g.max_change_pct })));
  }
  return `<ul class="check-list">${items.join("")}</ul>`;
}

function proposalDetail(row) {
  const check = evaluateProposal(row, guardrailIndex(rows("guardrails")));
  const decidable = DECIDABLE_PROPOSALS.has(row.status);
  const key = `proposals:${row.id}`;
  const anyBusy = Boolean(state.busy);
  const noteError = state.noteErrors[key];
  const unsourced = !row.source.trim() || /^\(?none\)?$/i.test(row.source.trim());
  return `<article class="record-detail decision-card" data-proposal="${esc(row.id)}">
    ${detailHead(
      row.title,
      `<code>${esc(row.sku)}</code>${row.channels ? ` · ${esc(t("channels"))}: ${esc(row.channels)}` : ""}`,
      `${check.computed.length ? badge(t("guardrailCheck"), "danger") : ""}${badge(enumLabel("proposalStatus", row.status), toneForProposal(row.status))}`,
    )}
    <div class="price-change">
      <div class="price-side before"><span class="diff-label">${esc(t("current"))}</span><strong>${esc(money(row.current_price))}</strong></div>
      <div class="diff-arrow" aria-hidden="true">→</div>
      <div class="price-side after"><span class="diff-label">${esc(t("proposed"))}</span><strong>${esc(money(row.proposed_price))}</strong></div>
      <div class="price-side pct ${check.computed.some((item) => item.kind === "step") ? "breach" : ""}"><span class="diff-label">${esc(t("changePct"))}</span><strong>${esc(signedPct(check.change_pct))}</strong></div>
    </div>
    <div class="guardrail-check">
      <div class="check-col">
        <div class="diff-label">${esc(t("computedCheck"))}</div>
        ${checkMarkup(row, check)}
      </div>
      <div class="check-col">
        <div class="diff-label">${esc(t("statedByAgent"))}</div>
        <p class="${check.stated.text ? "" : "muted"}">${esc(check.stated.text || t("statedNone"))}</p>
      </div>
    </div>
    ${check.mismatch.length ? `<div class="notice warning compact">${esc(t("mismatch", { kinds: check.mismatch.map((kind) => t(`kind_${kind}`)).join(", ") }))}</div>` : ""}
    ${check.same_price_rule ? `<div class="notice compact">${esc(t("samePriceRule"))}</div>` : ""}
    ${!check.same_price_rule && check.same_price_noted ? `<div class="notice compact">${esc(t("samePriceNoted"))}</div>` : ""}
    <dl class="facts">
      ${row.reason ? fact(t("reason"), esc(row.reason)) : ""}
      ${fact(t("source"), unsourced ? `<span class="inline-error">${esc(t("noSource"))}</span>` : esc(row.source))}
      ${row.decision_note ? fact(t("decisionNote"), esc(row.decision_note)) : ""}
      ${row.applied_on ? fact(enumLabel("proposalStatus", "applied"), esc(t("appliedOn", { date: formatDay(row.applied_on) }))) : ""}
    </dl>
    ${
      decidable
        ? `<div class="decision">
            <label class="decision-label" for="note-${esc(row.id)}">${esc(t("decisionNote"))}</label>
            <textarea id="note-${esc(row.id)}" data-note="${esc(key)}" rows="2" placeholder="${esc(t("decisionNotePlaceholder"))}" ${state.busy === key ? "disabled" : ""}>${esc(state.drafts[key] || "")}</textarea>
            ${noteError ? `<div class="inline-error" role="alert">${esc(noteError)}</div>` : ""}
            <div class="decision-actions">
              <button type="button" class="button primary" data-decide="approve" data-key="proposals" data-id="${esc(row.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("approve"))}</button>
              <button type="button" class="button" data-decide="request-changes" data-key="proposals" data-id="${esc(row.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("requestChanges"))}</button>
              <button type="button" class="button danger" data-decide="block" data-key="proposals" data-id="${esc(row.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("block"))}</button>
            </div>
          </div>`
        : ""
    }
  </article>`;
}

function exceptionDetail(row) {
  const key = `exceptions:${row.id}`;
  const anyBusy = Boolean(state.busy);
  const noteError = state.noteErrors[key];
  const order = row.order ? recordById("orders", row.order) : null;
  // A relation is a record id: resolve it to the order number, or say it is
  // not loaded — never print the id.
  const orderLine = !row.order
    ? `<span class="muted">${esc(t("noOrderLinked"))}</span>`
    : !order
      ? `<span class="muted">${esc(t("orderNotLoaded"))}</span>`
      : `<a class="text-link" href="${recordUrl(order.id, "orders")}">${esc(
          t("orderLine", {
            order: order.order_no,
            agent: agentName(order.agent),
            paid: money(order.paid_price, order.currency),
            listed: order.listed_price == null ? "" : t("orderListedPart", { listed: money(order.listed_price, order.currency) }),
          }),
        )}</a>`;
  return `<article class="record-detail decision-card" data-exception="${esc(row.id)}">
    ${detailHead(
      row.title,
      `${esc(enumLabel("exceptionType", row.type))}${row.sku ? ` · <code>${esc(row.sku)}</code>` : ""} · ${esc(t("detectedOn", { date: formatDay(row.detected_on) }))}`,
      badge(enumLabel("exceptionStatus", row.status), toneForException(row.status)),
    )}
    <dl class="facts">
      ${fact(t("order"), orderLine)}
      ${fact(t("impact"), `<span class="impact ${row.impact < 0 ? "negative" : ""}">${esc(row.impact == null ? "—" : signedMoney(row.impact))}</span>`)}
      ${row.resolution ? `<div><dt>${esc(t("resolution"))}</dt><dd class="wrap">${esc(row.resolution)}</dd></div>` : ""}
    </dl>
    ${
      row.status === "open"
        ? `<div class="decision">
            <label class="decision-label" for="res-${esc(row.id)}">${esc(t("resolution"))}</label>
            <textarea id="res-${esc(row.id)}" data-note="${esc(key)}" rows="2" placeholder="${esc(t("resolutionPlaceholder"))}" ${state.busy === key ? "disabled" : ""}>${esc(state.drafts[key] || "")}</textarea>
            ${noteError ? `<div class="inline-error" role="alert">${esc(noteError)}</div>` : ""}
            <div class="decision-actions">
              <button type="button" class="button primary" data-decide="resolve" data-key="exceptions" data-id="${esc(row.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("resolve"))}</button>
              <button type="button" class="button" data-decide="accept" data-key="exceptions" data-id="${esc(row.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("accept"))}</button>
            </div>
          </div>`
        : ""
    }
  </article>`;
}

function guardrailDetail(row) {
  const proposals = rows("proposals").filter((item) => item.sku === row.sku);
  const index = guardrailIndex(rows("guardrails"));
  const belowFloor = rows("orders").filter((order) => order.sku === row.sku && orderFlags(order, index).below_floor);
  return `<article class="record-detail">
    ${detailHead(row.sku, row.owner ? `${esc(t("owner"))}: ${esc(row.owner)}` : "", "")}
    <dl class="facts">
      ${fact(t("floor"), esc(money(row.floor_price)))}
      ${fact(t("ceiling"), esc(money(row.ceiling_price)))}
      ${fact(t("maxChange"), row.max_change_pct == null ? "—" : `±${esc(row.max_change_pct)}%`)}
      ${fact(t("samePrice"), esc(row.same_price_everywhere ? t("yes") : t("no")))}
    </dl>
    <p class="muted">${esc(t("guardrailsReadOnly"))}</p>
    <section class="detail-section">
      <h3>${esc(t("proposals"))}</h3>
      ${
        proposals.length
          ? proposals
              .map(
                (item) =>
                  `<a class="related-row" href="${recordUrl(item.id, "proposals")}"><span>${esc(item.title)}</span>${badge(enumLabel("proposalStatus", item.status), toneForProposal(item.status))}</a>`,
              )
              .join("")
          : `<p class="muted">${esc(t("noProposalsForSku"))}</p>`
      }
    </section>
    <section class="detail-section">
      <h3>${esc(t("ordersBelowFloor"))}</h3>
      ${
        belowFloor.length
          ? belowFloor
              .map(
                (order) =>
                  `<a class="related-row" href="${recordUrl(order.id, "orders")}"><span>${esc(order.order_no)} · ${esc(agentName(order.agent))} · ${esc(formatDay(order.ordered_on))}</span><span class="paid-below">${esc(money(order.paid_price, order.currency))}</span></a>`,
              )
              .join("")
          : `<p class="muted">${esc(t("noOrdersBelowFloor"))}</p>`
      }
    </section>
  </article>`;
}

// ── settings ────────────────────────────────────────────────────────────────

function renderSettings() {
  setTitle(t("settings"));
  const current = settings();
  const channels = current?.agent_channels?.length ? current.agent_channels.map(agentName).join(", ") : t("notSet");
  els.settingsBody.innerHTML = `
    <section class="card settings-card">
      <h2>${esc(t("storeSettings"))}</h2>
      <dl class="settings-grid">
        <div><dt>${esc(t("storeLabel"))}</dt><dd>${esc(current?.store_name || t("notSet"))}</dd></div>
        <div><dt>${esc(t("channelsLabel"))}</dt><dd>${esc(channels)}</dd></div>
        <div><dt>${esc(t("currencyLabel"))}</dt><dd>${esc(current?.currency || t("notSet"))}</dd></div>
        <div class="span-2"><dt>${esc(t("policyLabel"))}</dt><dd class="wrap">${esc(current?.review_policy || t("notSet"))}</dd></div>
      </dl>
    </section>
    <section class="card settings-card">
      <h2>${esc(t("dataSource"))}</h2>
      <dl class="settings-grid">
        <div><dt>${esc(t("dataSource"))}</dt><dd>${esc(state.data?.demo ? t("sourceDemo") : t("sourceLive"))}</dd></div>
        <div><dt>${esc(t("onboarding"))}</dt><dd>${esc(current?.store_name ? t("onboardingDone") : t("onboardingTodo"))}</dd></div>
        ${BROWSED_KEYS.map((key) => `<div><dt>${esc(t(key))}</dt><dd>${esc(loadedLabel(key))}</dd></div>`).join("")}
      </dl>
    </section>
    <section class="settings" id="settingsContent"></section>`;
}

// ── render ──────────────────────────────────────────────────────────────────

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data) && !state.error;
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  if (!onRecordView) body.remove("ws-searching");
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (state.error) {
    setTitle(t("errorTitle"));
    els.loadState.classList.add("error");
    els.loadState.innerHTML = emptyState(t("errorTitle"), state.error, `<button type="button" class="button" data-retry>${esc(t("retry"))}</button>`);
    return;
  }
  if (!state.data) {
    setTitle(t("loading"));
    els.loadState.classList.remove("error");
    els.loadState.innerHTML = `<p class="muted">${esc(t("loadingData"))}</p><div class="skeleton skeleton-block"></div>`;
    return;
  }
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── decisions ───────────────────────────────────────────────────────────────

async function decide(key, id, action) {
  if (state.busy) return;
  const row = rows(key).find((item) => item.id === id);
  if (!row) return;
  const busyKey = `${key}:${id}`;
  const note = String(state.drafts[busyKey] || "").trim();
  const needsNote = key === "exceptions" || action === "request-changes" || action === "block";
  const requiredText = key === "exceptions" ? t("resolutionRequired") : t("noteRequired");
  if (needsNote && !note) {
    state.noteErrors[busyKey] = requiredText;
    render();
    document.querySelector(`[data-note="${CSS.escape(busyKey)}"]`)?.focus();
    return;
  }
  state.noteErrors[busyKey] = "";
  state.busy = busyKey;
  state.notice = null;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.decide(key, row, action, note);
    delete state.drafts[busyKey];
    state.notice =
      result.outcome === "demo"
        ? { text: t("decisionDemo"), tone: "positive" }
        : result.outcome === "pending"
          ? { text: t("decisionPending", { id: result.changeRequestId || "—" }), tone: "positive" }
          : { text: t("decisionSaved", { title: row.title }), tone: "positive" };
    state.busy = "";
    await loadState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.notice = { text: t("decisionFailed", { error: message === "NOTE_REQUIRED" ? requiredText : message }), tone: "danger" };
    state.busy = "";
    render();
  }
}

// ── events ──────────────────────────────────────────────────────────────────

function openRow(id) {
  const url = recordUrl(id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
}

function refresh() {
  state.notice = null;
  loadState().catch(showFatal);
}

function bindEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("resize", () => {
    syncResponsiveShell();
    if (state.data && RECORD_VIEWS.includes(state.route.view)) renderDetail();
  });
  els.refresh.addEventListener("click", refresh);
  els.mobileRefresh.addEventListener("click", refresh);
  els.sidebarToggle.addEventListener("click", toggleSidebar);
  els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
  els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
  els.language.addEventListener("change", () => {
    state.lang = normalizeLang(els.language.value);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, state.lang);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${location.hash}`);
    render();
  });
  els.viewActions.addEventListener("click", (event) => {
    if (event.target.closest("[data-refresh]")) return void refresh();
    const segment = event.target.closest("[data-filter]");
    if (segment) replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, filter: segment.dataset.filter })}`);
  });
  els.viewActions.addEventListener("change", (event) => {
    const select = event.target.closest("[data-filter-select]");
    if (select) {
      replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, filter: select.value })}`);
      return;
    }
    const control = event.target.closest("[data-order-filter]");
    if (!control) return;
    const name = control.dataset.orderFilter;
    const next = { ...state.route, [name]: name === "flagged" ? control.checked : control.value };
    replaceRoute(`#/orders${routeQuery({ peek: state.route.peek }, next)}`);
  });
  els.listPanel.addEventListener("click", (event) => {
    const more = event.target.closest("[data-load-more]");
    if (more) return void loadMore(more.dataset.loadMore);
    if (event.target.closest("a, button")) return;
    const row = event.target.closest("tr[data-id]");
    if (row) openRow(row.dataset.id);
  });
  els.listPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const row = event.target.closest("tr[data-id]");
    if (row) openRow(row.dataset.id);
  });
  els.detailBack.addEventListener("click", closeDetail);
  els.detailBody.addEventListener("click", (event) => {
    const decision = event.target.closest("[data-decide]");
    if (decision) decide(decision.dataset.key, decision.dataset.id, decision.dataset.decide);
  });
  els.detailBody.addEventListener("input", (event) => {
    const note = event.target.closest("[data-note]");
    if (note) state.drafts[note.dataset.note] = note.value;
  });
  els.loadState.addEventListener("click", (event) => {
    if (!event.target.closest("[data-retry]")) return;
    state.error = "";
    render();
    boot();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Escape inside a note only leaves the field; a second Escape closes.
    if (event.target.closest?.("textarea, input, select")) {
      event.target.blur();
      return;
    }
    if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
  });
}

function showFatal(error) {
  state.error = error instanceof Error ? error.message : String(error);
  render();
}

previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
bindEvents();
render();

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
    showFatal(error);
  }
}

boot();
