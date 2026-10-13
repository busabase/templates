import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  decideAction,
  renderKbDetail,
  renderKnowledge,
  renderOverview,
  renderSettings,
  renderSla,
  renderTicketDetail,
  renderTickets,
  saveReplyAction,
  saveSlaAction,
} from "./js/service-views.js";
import { recomputeMetrics } from "./js/support-model.js?v=0.1.0";

export const FEATURED_DEMO_TICKET = "tk-ochoa-refund";
const WORKFLOW_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

// Where a record opens, per view. See config.js `ui.detail_modes` for the
// business reason behind each choice. A `/record` path always opens the full
// page; `?peek=` drives drawer/split. On a phone every mode is a page
// (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const KNOWN_VIEWS = new Set([...RECORD_VIEWS, "sla", "settings"]);
const KEY_BY_VIEW = { tickets: "tickets", knowledge: "knowledge-base" };
const ID_FIELD = { tickets: "ticket_id", knowledge: "article_id" };

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  drafts: {},
  notes: {},
  slas: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-support-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-support.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  slaPage: byId("slaPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  slaBody: byId("slaBody"),
  settingsBody: byId("settingsBody"),
  search: document.querySelector("#search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  approvalsCount: byId("count-approvals"),
  slaCount: byId("count-sla"),
  blockedCount: byId("count-blocked"),
  language: byId("language"),
  notice: byId("notice"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot[key === "knowledge-base" ? "knowledge_base" : key] = rows;
    recomputeMetrics(state.snapshot);
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.pageError = error instanceof Error ? error.message : String(error);
  },
});

export function recordTotal(key, fallback = 0) {
  return pagination.total(key, fallback);
}

export function pagerControl(view) {
  return pagination.control(KEY_BY_VIEW[view]);
}

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

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function referenceNow() {
  if (state.settings?.demo && state.snapshot?.generated_at) return new Date(state.snapshot.generated_at).getTime();
  return Date.now();
}

export function waitingLabel(since) {
  if (!since) return "";
  const ms = Math.max(0, referenceNow() - new Date(since).getTime());
  const minutes = Math.floor(ms / 60000);
  const zh = activeLang() === "zh";
  if (minutes < 60) return `${minutes}${zh ? " 分钟" : "m"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${zh ? " 小时" : "h"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}${zh ? " 天 " : "d "}${rest}${zh ? " 小时" : "h"}` : `${days}${zh ? " 天" : "d"}`;
}

export function slaCountdown(dueBy) {
  if (!dueBy) return { text: "—", overdue: false };
  const diff = new Date(dueBy).getTime() - referenceNow();
  const overdue = diff < 0;
  const minutes = Math.floor(Math.abs(diff) / 60000);
  const zh = activeLang() === "zh";
  let magnitude;
  if (minutes < 60) magnitude = `${minutes}${zh ? " 分钟" : "m"}`;
  else if (minutes < 1440) magnitude = `${Math.floor(minutes / 60)}${zh ? " 小时" : "h"}`;
  else magnitude = `${Math.floor(minutes / 1440)}${zh ? " 天" : "d"}`;
  return { text: overdue ? `${magnitude} ${t("slaBreached")}` : `${magnitude} ${t("slaDue")}`, overdue };
}

export function flagEmoji(country) {
  const code = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the ticket status
// filter and the peeked record live in the URL so refresh, shared links and
// Back restore the same list context.
export function parseRoute() {
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
  if (!KNOWN_VIEWS.has(view)) view = "overview";
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
    status: view === "tickets" && WORKFLOW_FILTERS.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "tickets" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

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

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("busa-support:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "tickets"
      ? "#/tickets"
      : scenario === "detail"
        ? `#/tickets/${FEATURED_DEMO_TICKET}`
        : scenario === "knowledge"
          ? "#/knowledge"
          : scenario === "sla"
            ? "#/sla"
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
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("slaTitle").textContent = t("sla");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

/* ----- accessors ----- */

export function tickets() {
  return state.snapshot?.tickets || [];
}

export function knowledge() {
  return state.snapshot?.knowledge_base || [];
}

export function ticketById(id) {
  return tickets().find((item) => item.ticket_id === id);
}

export function kbById(id) {
  return knowledge().find((item) => item.article_id === id);
}

// Loaded page first; a record not on the loaded page is simply "not loaded"
// (no records.get-by-id fetch for a record outside the page — see report).
export function recordById(view, id) {
  if (!id) return null;
  const rows = view === "tickets" ? tickets() : knowledge();
  return rows.find((item) => item[ID_FIELD[view]] === id) || null;
}

export function breachingTickets() {
  return tickets().filter((item) => item.sla?.breached);
}

export function gateBlockedTickets() {
  return tickets().filter((item) => item.quality_gate?.verdict === "block" && item.status !== "blocked");
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

export function customerLabel(customer) {
  if (!customer) return "";
  return [customer.name, customer.company].filter(Boolean).join(" · ");
}

export function matchesQuery(values, query = state.route.query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
}

/* ----- shell ----- */

function renderShell() {
  applyI18n();
  const needsReview = tickets().filter((item) => item.status === "needs_review").length;
  const breaching = breachingTickets().length;
  const blocked = gateBlockedTickets().length;
  const ticketCount = pagination.total("tickets", tickets().length);
  const knowledgeCount = pagination.total("knowledge-base", knowledge().length);
  els.syncStatus.textContent = tickets().length
    ? `${ticketCount} ${t("ticketCount")} · ${knowledgeCount} KB`
    : t("empty");
  if (els.approvalsCount) els.approvalsCount.textContent = needsReview;
  if (els.slaCount) els.slaCount.textContent = breaching;
  if (els.blockedCount) els.blockedCount.textContent = blocked;
  if (els.mobileViewTitle) {
    const ticket = state.route.view === "tickets" && state.route.id ? ticketById(state.route.id) : null;
    els.mobileViewTitle.textContent = ticket ? ticket.customer?.name || ticket.ticket_id : viewLabel(state.route.view);
  }
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsReview
      ? `${needsReview} ${t("awaitingApproval")}`
      : `${ticketCount} ${t("ticketCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  const filterActive = state.route.view === "tickets" ? state.route.status : "";
  document.querySelectorAll("[data-filter]").forEach((link) => {
    link.classList.toggle("active", link.dataset.filter === filterActive);
  });
  if (!els.notice.dataset.flash) {
    if (isLocked()) {
      els.notice.textContent = t("lockNotice");
      els.notice.hidden = false;
      els.notice.className = "notice locked";
    } else if (state.settings?.demo) {
      els.notice.textContent = t("demoNotice");
      els.notice.hidden = false;
      els.notice.className = "notice demo";
    } else {
      els.notice.hidden = true;
    }
  }
}

export function flashNotice(text) {
  els.notice.dataset.flash = "1";
  els.notice.textContent = text;
  els.notice.className = "notice flash";
  els.notice.hidden = false;
  setTimeout(() => {
    delete els.notice.dataset.flash;
    renderShell();
  }, 3500);
}

export function viewLabel(view) {
  if (view === "tickets") return t("tickets");
  if (view === "knowledge") return t("knowledge");
  if (view === "sla") return t("sla");
  if (view === "settings") return t("settings");
  return t("overview");
}

/* ----- chips ----- */

export function channelBadge(channel) {
  return `<span class="channel-badge ${escapeHtml(channel)}"><span class="dot"></span>${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function categoryChip(category) {
  return `<span class="category-chip ${escapeHtml(category)}">${escapeHtml(enumLabel(category, "category"))}</span>`;
}

export function priorityChip(priority) {
  return `<span class="priority-chip ${escapeHtml(priority)}">${escapeHtml(enumLabel(priority, "priority"))}</span>`;
}

export function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function actionChip(action) {
  const risky = action === "refund" || action === "escalate";
  return `<span class="action-chip ${risky ? "risky" : ""}">${escapeHtml(enumLabel(action, "action"))}${risky ? " ⚑" : ""}</span>`;
}

export function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "ship";
  return `<span class="gate-badge ${escapeHtml(verdict)}" title="${escapeHtml(gate.summary || "")}">⛩ ${escapeHtml(enumLabel(verdict, "verdict"))} · ${gate.score}</span>`;
}

export function countryCell(country) {
  return `<span class="country">${flagEmoji(country)} ${escapeHtml(String(country || "").toUpperCase())}</span>`;
}

export function warningsHtml(filter = () => true) {
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

export function csatStars(score) {
  const full = Math.round(Number(score) || 0);
  return `<span class="csat-stars" title="${full}/5">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

export function barsSvg(entries, { colorFor } = {}) {
  const rows = entries.filter(([, count]) => count >= 0);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  const rowH = 30;
  const labelW = 96;
  const barMax = 240;
  const width = labelW + barMax + 40;
  const height = Math.max(1, rows.length) * rowH;
  const body = rows
    .map(([label, count], index) => {
      const y = index * rowH;
      const barW = Math.max(3, Math.round((count / max) * barMax));
      const fill = colorFor ? colorFor(label) : "#4b6bfb";
      return `
        <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="bar-label">${escapeHtml(label)}</text>
        <rect x="${labelW}" y="${y + 6}" width="${barMax}" height="${rowH - 12}" rx="5" class="bar-track"></rect>
        <rect x="${labelW}" y="${y + 6}" width="${barW}" height="${rowH - 12}" rx="5" fill="${fill}"></rect>
        <text x="${labelW + barW + 8}" y="${y + rowH / 2 + 4}" class="bar-count">${count}</text>
      `;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="bar-svg" role="img" aria-label="bars">${body}</svg>`;
}

export function csatTrendSvg(trend) {
  if (!trend?.length) return `<div class="empty-inline">—</div>`;
  const width = 320;
  const height = 90;
  const padX = 24;
  const padY = 14;
  const min = 1;
  const max = 5;
  const stepX = trend.length > 1 ? (width - padX * 2) / (trend.length - 1) : 0;
  const points = trend.map((point, index) => {
    const x = padX + index * stepX;
    const y = padY + (1 - (point.score - min) / (max - min)) * (height - padY * 2);
    return [x, y, point];
  });
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dots = points
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="trend-dot"></circle>`)
    .join("");
  const labels = points
    .map(
      ([x], index) =>
        `<text x="${x.toFixed(1)}" y="${height - 1}" text-anchor="middle" class="trend-label">${escapeHtml(trend[index].label)}</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="${escapeHtml(t("csatTrend"))}">
    <path d="${path}" class="trend-line" fill="none"></path>${dots}${labels}
  </svg>`;
}

/* ----- main render ----- */

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = Boolean(state.snapshot);
  els.overviewPage.hidden = !state.snapshot || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.slaPage.hidden = !state.snapshot || view !== "sla";
  els.settingsPage.hidden = !state.snapshot || view !== "settings";
  if (!state.snapshot) return;
  if (onRecordView) renderRecordView();
  else if (view === "sla") renderSla();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(view === "tickets" ? "ticketsHint" : "knowledgeHint");
  if (view === "tickets") renderTickets();
  else renderKnowledge();
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectTicket")) : "";
    return;
  }
  const record = recordById(view, selectedId);
  if (!record) {
    els.detailBody.innerHTML = emptyState(t("notLoaded"));
    return;
  }
  if (view === "tickets") renderTicketDetail(selectedId);
  else renderKbDetail(selectedId);
}

export function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
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

/* ----- events ----- */

pagination.bind(els.listPanel);

els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("a, button, [data-goto-page]")) return;
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
els.detailBack.addEventListener("click", closeDetail);
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "save-reply") {
    saveReplyAction(button.dataset.ticket);
    return;
  }
  if (button.dataset.action === "save-sla") {
    saveSlaAction(button.dataset.ticket);
    return;
  }
  if (button.dataset.action === "decide") {
    decideAction(button.dataset.ticket, button.dataset.decision);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
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
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-support-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
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
