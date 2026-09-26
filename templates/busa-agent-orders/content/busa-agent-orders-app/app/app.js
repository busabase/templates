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
  orderFilter: { agent: "", status: "" },
};

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  countBreaching: document.querySelector("#count-breaching"),
  countOpen: document.querySelector("#count-open"),
  countUncovered: document.querySelector("#count-uncovered"),
  countWaiting: document.querySelector("#count-waiting"),
  language: document.querySelector("#language"),
};

// ── shell ────────────────────────────────────────────────────────────────────

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

function loadedLabel(key) {
  const loaded = rows(key).length;
  const total = state.data?.totals?.[key];
  if (total != null) return t("loadedOf", { loaded, total });
  return state.data?.cursors?.[key] ? t("loadedPlus", { loaded }) : String(loaded);
}

function loadMoreControl(key) {
  if (!state.data?.cursors?.[key]) return "";
  const busy = Boolean(state.loadingMore[key]);
  return `<div class="load-more">
    <span class="muted">${esc(loadedLabel(key))}</span>
    <button type="button" class="button" data-load-more="${key}" ${busy ? "disabled" : ""}>${esc(busy ? t("loadingMore") : t("loadMore"))}</button>
    ${state.pageError ? `<span class="inline-error" role="alert">${esc(t("loadFailed", { error: state.pageError }))}</span>` : ""}
  </div>`;
}

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

// ── routing & loading ───────────────────────────────────────────────────────

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = null;
  setMobileSidebarOpen(false);
  render();
  els.content.scrollTop = 0;
}

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
}

const currentAttention = () =>
  attentionList({ orders: rows("orders"), guardrails: rows("guardrails"), proposals: rows("proposals"), exceptions: rows("exceptions") });

function renderShell() {
  applyI18n();
  const attention = currentAttention();
  els.countBreaching.textContent = String(attention.counts.breaching);
  els.countOpen.textContent = String(attention.counts.open);
  els.countUncovered.textContent = String(attention.counts.uncovered);
  els.countWaiting.textContent = String(rows("proposals").filter((row) => DECIDABLE_PROPOSALS.has(row.status)).length);
  els.syncStatus.textContent = !state.data
    ? t("loading")
    : state.data.demo
      ? t("demoNote")
      : t("liveNote", { time: formatTime(state.data.loaded_at) });
  els.language.value = state.lang;
  document.querySelectorAll("nav [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function setPage(title, subtitle = "") {
  els.title.textContent = title;
  els.subtitle.textContent = subtitle;
  els.mobileViewTitle.textContent = title;
  els.mobileViewMeta.textContent = subtitle;
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
    <p>${esc(body)}</p>
    ${action}
  </div>`;
}

function noticeBar() {
  if (!state.notice) return "";
  return `<div class="notice ${state.notice.tone || ""}" role="status">${esc(state.notice.text)}</div>`;
}

function segments(base, views, labelFor, countFor, active) {
  return `<div class="segmented view-tabs" role="tablist">${views
    .map(
      (id) =>
        `<a class="segment ${active === id ? "active" : ""}" href="#/${base}${id ? `/${id}` : ""}" data-route="${base}">${esc(labelFor(id))} <b>${countFor(id)}</b></a>`,
    )
    .join("")}</div>`;
}

// ── screens ─────────────────────────────────────────────────────────────────

const unitsLine = (totals) => t("ordersUnits", { orders: tn("countOrders", totals.orders), units: tn("countUnits", totals.units) });

function renderOverview() {
  const store = settings()?.store_name;
  setPage(t("overview"), store ? t("overviewSubtitle", { store }) : t("overviewSubtitleNoStore"));
  const orders = rows("orders");
  const totals = agentTotals({ orders, settings: settings() });
  const attention = currentAttention();

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
            <h2>${esc(t("channelTitle"))}</h2>
            <p>${esc(t("channelHint", { current: formatRange(totals.current), previous: formatRange(totals.previous) }))}</p>
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
          <article class="agent-cell total">
            <div class="agent-name">${esc(t("allAgents"))}</div>
            <div class="agent-value">${esc(money(totals.total.current.revenue))}</div>
            <div class="muted">${esc(unitsLine(totals.total.current))}</div>
            ${deltaLine({
              previous: totals.total.previous,
              delta: {
                orders: totals.total.current.orders - totals.total.previous.orders,
                revenue: totals.total.current.revenue - totals.total.previous.revenue,
                revenue_pct: totals.total.previous.revenue > 0 ? (totals.total.current.revenue - totals.total.previous.revenue) / totals.total.previous.revenue : null,
              },
            })}
          </article>
        </div>
        <p class="footnote muted">${esc(t("revenueGross"))}${state.data?.cursors?.orders ? ` · ${esc(t("loadedOnly", { count: orders.length }))}` : ""}</p>
      </section>`;

  const breaching = attention.breaching.length
    ? `<ul class="attention-list">${attention.breaching
        .map(
          ({ proposal, check }) => `<li class="attention-item">
            <div class="attention-main">
              <a href="#/proposals">${esc(proposal.title)}</a>
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
              <a href="#/exceptions">${esc(row.title)}</a>
              <div class="muted">${esc(enumLabel("exceptionType", row.type))} · ${esc(lookup.get(row.order)?.order_no || row.sku)}</div>
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
              <a href="#/orders/flagged">${esc(order.order_no)} · ${esc(order.sku)}</a>
              <div class="muted">${esc(t("uncoveredLine", { agent: agentName(order.agent), paid: money(order.paid_price, order.currency), listed: money(order.listed_price, order.currency), date: formatDay(order.ordered_on) }))}</div>
            </div>
            ${badge(t("belowListed", { amount: money(orderFlags(order, rows("guardrails")).shortfall, order.currency) }), "warning")}
          </li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${esc(t("uncoveredEmpty"))}</p>`;

  els.content.innerHTML = `
    ${noticeBar()}
    ${channelCard}
    <div class="overview-columns">
      <section class="card">
        <div class="card-heading">
          <h2>${esc(t("breachingTitle"))} <span class="count-pill">${attention.counts.breaching}</span></h2>
          <a class="text-link" href="#/proposals">${esc(t("reviewAll"))}</a>
        </div>
        ${breaching}
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <h2>${esc(t("exceptionsTitle"))} <span class="count-pill">${attention.counts.open}</span></h2>
            <p>${esc(t("exceptionsImpact", { amount: signedMoney(attention.impact) }))}</p>
          </div>
          <a class="text-link" href="#/exceptions">${esc(t("viewAll"))}</a>
        </div>
        ${openList}
        <h3 class="subhead">${esc(t("uncoveredTitle"))} <span class="count-pill">${attention.counts.uncovered}</span></h3>
        ${uncovered}
      </section>
    </div>`;
}

function renderOrders() {
  setPage(t("orders"), t("ordersSubtitle"));
  const orders = rows("orders");
  const guardrails = guardrailIndex(rows("guardrails"));
  const flagged = state.route.id === "flagged";
  const filter = state.orderFilter;
  const list = filterOrders(orders, { ...filter, flagged }, rows("guardrails"));
  const agents = [...new Set(orders.map((row) => row.agent).filter(Boolean))];
  els.content.innerHTML = `
    <section class="card flush">
      <div class="toolbar">
        <select id="orderAgent" aria-label="${esc(t("allAgents"))}">
          <option value="">${esc(t("allAgents"))}</option>
          ${agents.map((agent) => `<option value="${esc(agent)}" ${filter.agent === agent ? "selected" : ""}>${esc(agentName(agent))}</option>`).join("")}
        </select>
        <select id="orderStatus" aria-label="${esc(t("allStatuses"))}">
          <option value="">${esc(t("allStatuses"))}</option>
          ${ORDER_STATUSES.map((status) => `<option value="${status}" ${filter.status === status ? "selected" : ""}>${esc(enumLabel("orderStatus", status))}</option>`).join("")}
        </select>
        <label class="toggle-filter"><input id="orderFlagged" type="checkbox" ${flagged ? "checked" : ""}> ${esc(t("onlyFlagged"))}</label>
      </div>
      <p class="filter-note muted">${esc(t("filterNote", { count: orders.length }))}</p>
      ${
        list.length
          ? `<table class="table stack-table orders-table">
        <thead><tr><th>${esc(t("order"))}</th><th>${esc(t("agent"))}</th><th>${esc(t("sku"))}</th><th class="num">${esc(t("qty"))}</th><th class="num">${esc(t("paid"))}</th><th class="num">${esc(t("listed"))}</th><th class="num">${esc(t("revenue"))}</th><th>${esc(t("status"))}</th></tr></thead>
        <tbody>
          ${list
            .map((order) => {
              const flags = orderFlags(order, guardrails);
              const problem = flags.below_listed || flags.below_floor;
              return `<tr class="${problem ? "flagged" : ""}" data-order="${esc(order.id)}">
                <td data-label="${esc(t("order"))}"><div class="cell-identity"><div><strong>${esc(order.order_no)}</strong><span>${esc(formatDay(order.ordered_on))}${order.store ? ` · ${esc(enumLabel("store", order.store))}` : ""}</span></div></div></td>
                <td data-label="${esc(t("agent"))}">${esc(agentName(order.agent))}</td>
                <td data-label="${esc(t("sku"))}"><code>${esc(order.sku)}</code></td>
                <td class="num" data-label="${esc(t("qty"))}">${esc(order.quantity)}</td>
                <td class="num" data-label="${esc(t("paid"))}">
                  <span class="${problem ? "paid-below" : ""}">${esc(money(order.paid_price, order.currency))}</span>
                  ${flags.below_listed ? `<div class="price-flag">${esc(t("belowListed", { amount: money(flags.shortfall, order.currency) }))}</div>` : ""}
                  ${flags.below_floor ? `<div class="price-flag danger">${esc(t("belowFloor"))}</div>` : ""}
                </td>
                <td class="num" data-label="${esc(t("listed"))}">${esc(money(order.listed_price, order.currency))}</td>
                <td class="num" data-label="${esc(t("revenue"))}">${esc(money(orderRevenue(order), order.currency))}</td>
                <td data-label="${esc(t("status"))}">${badge(enumLabel("orderStatus", order.status), toneForOrder(order.status))}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
          : emptyState(t("noMatchingOrders"), t("noMatchingOrdersBody"))
      }
    </section>
    ${loadMoreControl("orders")}`;
}

function renderProposals() {
  const view = PROPOSAL_VIEWS.includes(state.route.id) ? state.route.id : "";
  const index = guardrailIndex(rows("guardrails"));
  const all = reviewQueue(rows("proposals"), rows("guardrails"));
  const matches = (row, id) => (id === "all" ? true : id ? row.status === id : DECIDABLE_PROPOSALS.has(row.status));
  const list = all.filter((row) => matches(row, view));
  setPage(t("proposals"), t("proposalsSubtitle"));
  els.content.innerHTML = `
    ${noticeBar()}
    ${segments(
      "proposals",
      PROPOSAL_VIEWS,
      (id) => (id === "" ? t("toDecide") : id === "all" ? t("all") : enumLabel("proposalStatus", id)),
      (id) => all.filter((row) => matches(row, id)).length,
      view,
    )}
    <div class="card-list">
      ${list.length ? list.map((row) => proposalCard(row, index)).join("") : `<section class="card">${emptyState(t("noProposals"), t("noProposalsBody"))}</section>`}
    </div>
    ${loadMoreControl("proposals")}
    ${loadMoreControl("guardrails")}`;
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

function proposalCard(row, index) {
  const check = evaluateProposal(row, index);
  const decidable = DECIDABLE_PROPOSALS.has(row.status);
  const key = `proposals:${row.id}`;
  const anyBusy = Boolean(state.busy);
  const noteError = state.noteErrors[key];
  const unsourced = !row.source.trim() || /^\(?none\)?$/i.test(row.source.trim());
  return `<article class="card decision-card" data-proposal="${esc(row.id)}">
    <div class="card-head">
      <div class="card-title">
        <h3>${esc(row.title)}</h3>
        <div class="muted"><code>${esc(row.sku)}</code>${row.channels ? ` · ${esc(t("channels"))}: ${esc(row.channels)}` : ""}</div>
      </div>
      <div class="badge-row">
        ${check.computed.length ? badge(t("guardrailCheck"), "danger") : ""}
        ${badge(enumLabel("proposalStatus", row.status), toneForProposal(row.status))}
      </div>
    </div>
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
      ${row.reason ? `<div><dt>${esc(t("reason"))}</dt><dd>${esc(row.reason)}</dd></div>` : ""}
      <div><dt>${esc(t("source"))}</dt><dd>${unsourced ? `<span class="inline-error">${esc(t("noSource"))}</span>` : esc(row.source)}</dd></div>
      ${row.decision_note ? `<div><dt>${esc(t("decisionNote"))}</dt><dd>${esc(row.decision_note)}</dd></div>` : ""}
      ${row.applied_on ? `<div><dt>${esc(enumLabel("proposalStatus", "applied"))}</dt><dd>${esc(t("appliedOn", { date: formatDay(row.applied_on) }))}</dd></div>` : ""}
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

function renderExceptions() {
  const view = EXCEPTION_VIEWS.includes(state.route.id) ? state.route.id : "";
  const all = exceptionQueue(rows("exceptions"));
  const matches = (row, id) => (id === "all" ? true : id ? row.status === id : row.status === "open");
  const list = all.filter((row) => matches(row, view));
  setPage(t("exceptions"), t("exceptionsSubtitle"));
  const lookup = ordersById();
  els.content.innerHTML = `
    ${noticeBar()}
    ${segments(
      "exceptions",
      EXCEPTION_VIEWS,
      (id) => (id === "" ? t("exceptionsOpen") : id === "all" ? t("all") : enumLabel("exceptionStatus", id)),
      (id) => all.filter((row) => matches(row, id)).length,
      view,
    )}
    <div class="card-list">
      ${list.length ? list.map((row) => exceptionCard(row, lookup)).join("") : `<section class="card">${emptyState(t("noExceptions"), t("noExceptionsBody"))}</section>`}
    </div>
    ${loadMoreControl("exceptions")}
    ${loadMoreControl("orders")}`;
}

function exceptionCard(row, lookup) {
  const key = `exceptions:${row.id}`;
  const anyBusy = Boolean(state.busy);
  const noteError = state.noteErrors[key];
  const order = row.order ? lookup.get(row.order) : null;
  const orderLine = !row.order
    ? `<span class="muted">${esc(t("noOrderLinked"))}</span>`
    : !order
      ? `<span class="muted">${esc(t("orderNotLoaded"))}</span>`
      : esc(
          t("orderLine", {
            order: order.order_no,
            agent: agentName(order.agent),
            paid: money(order.paid_price, order.currency),
            listed: order.listed_price == null ? "" : t("orderListedPart", { listed: money(order.listed_price, order.currency) }),
          }),
        );
  return `<article class="card decision-card" data-exception="${esc(row.id)}">
    <div class="card-head">
      <div class="card-title">
        <h3>${esc(row.title)}</h3>
        <div class="muted">${esc(enumLabel("exceptionType", row.type))}${row.sku ? ` · <code>${esc(row.sku)}</code>` : ""} · ${esc(t("detectedOn", { date: formatDay(row.detected_on) }))}</div>
      </div>
      <div class="badge-row">${badge(enumLabel("exceptionStatus", row.status), toneForException(row.status))}</div>
    </div>
    <dl class="facts">
      <div><dt>${esc(t("order"))}</dt><dd>${orderLine}</dd></div>
      <div><dt>${esc(t("impact"))}</dt><dd><span class="impact ${row.impact < 0 ? "negative" : ""}">${esc(row.impact == null ? "—" : signedMoney(row.impact))}</span></dd></div>
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

function renderGuardrails() {
  setPage(t("guardrails"), t("guardrailsSubtitle"));
  const list = [...rows("guardrails")].sort((a, b) => a.sku.localeCompare(b.sku));
  if (!list.length) {
    els.content.innerHTML = `<section class="card">${emptyState(t("noGuardrails"), t("noGuardrailsBody"))}</section>${loadMoreControl("guardrails")}`;
    return;
  }
  els.content.innerHTML = `
    <section class="card flush">
      <table class="table stack-table">
        <thead><tr><th>${esc(t("sku"))}</th><th class="num">${esc(t("floor"))}</th><th class="num">${esc(t("ceiling"))}</th><th class="num">${esc(t("maxChange"))}</th><th>${esc(t("samePrice"))}</th><th>${esc(t("owner"))}</th></tr></thead>
        <tbody>
          ${list
            .map(
              (row) => `<tr>
                <td data-label="${esc(t("sku"))}"><code>${esc(row.sku)}</code></td>
                <td class="num" data-label="${esc(t("floor"))}">${esc(money(row.floor_price))}</td>
                <td class="num" data-label="${esc(t("ceiling"))}">${esc(money(row.ceiling_price))}</td>
                <td class="num" data-label="${esc(t("maxChange"))}">${row.max_change_pct == null ? "—" : `±${esc(row.max_change_pct)}%`}</td>
                <td data-label="${esc(t("samePrice"))}">${row.same_price_everywhere ? badge(t("yes"), "active") : `<span class="muted">${esc(t("no"))}</span>`}</td>
                <td data-label="${esc(t("owner"))}">${esc(row.owner || "—")}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>
    ${loadMoreControl("guardrails")}`;
}

function renderSettings() {
  setPage(t("settings"), t("settingsSubtitle"));
  const current = settings();
  const channels = current?.agent_channels?.length ? current.agent_channels.map(agentName).join(", ") : t("notSet");
  els.content.innerHTML = `
    <section class="card settings-card">
      <h2>${esc(t("settings"))}</h2>
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

function render() {
  renderShell();
  if (state.error) {
    setPage(t("errorTitle"));
    els.content.innerHTML = `<section class="card">${emptyState(t("errorTitle"), state.error, `<button type="button" class="button" data-retry>${esc(t("retry"))}</button>`)}</section>`;
    return;
  }
  if (!state.data) {
    setPage(t("loading"));
    els.content.innerHTML = `<section class="card"><p class="muted">${esc(t("loadingData"))}</p><div class="skeleton skeleton-block"></div></section>`;
    return;
  }
  const view = state.route.view;
  if (view === "orders") renderOrders();
  else if (view === "proposals") renderProposals();
  else if (view === "exceptions") renderExceptions();
  else if (view === "guardrails") renderGuardrails();
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

function bindEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("resize", syncResponsiveShell);
  const refresh = () => {
    state.notice = null;
    loadState().catch(showFatal);
  };
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
    history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
    render();
  });
  els.content.addEventListener("click", (event) => {
    const more = event.target.closest("[data-load-more]");
    if (more) return void loadMore(more.dataset.loadMore);
    const decision = event.target.closest("[data-decide]");
    if (decision) return void decide(decision.dataset.key, decision.dataset.id, decision.dataset.decide);
    if (event.target.closest("[data-retry]")) {
      state.error = "";
      render();
      boot();
    }
  });
  els.content.addEventListener("input", (event) => {
    const note = event.target.closest("[data-note]");
    if (note) state.drafts[note.dataset.note] = note.value;
  });
  els.content.addEventListener("change", (event) => {
    if (event.target.id === "orderAgent") state.orderFilter.agent = event.target.value;
    else if (event.target.id === "orderStatus") state.orderFilter.status = event.target.value;
    else if (event.target.id === "orderFlagged") {
      location.hash = event.target.checked ? "#/orders/flagged" : "#/orders";
      return;
    } else return;
    render();
  });
}

function showFatal(error) {
  state.error = error instanceof Error ? error.message : String(error);
  render();
}

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
