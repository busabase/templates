import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/ticket-views.js";
import { computeMetrics } from "./js/tickets-model.js?v=0.1.0";

// Where a record opens, per view — declared once in config.js `ui.detail_modes`:
//   intake   → drawer: a raw complaint is a fact scanned many of, classified
//              with a couple of fields, then returned to the stream.
//   dispatch → split:  the review queue is worked top to bottom, one
//              proposal after the next, so the queue stays beside the card.
//   board    → page:   a ticket is a workplace of its own — full history,
//              resolution notes — people stay on it for minutes.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

export const BOARD_STATUSES = ["open", "assigned", "in_progress", "waiting", "resolved"];
export const DISPATCH_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "elevator",
  "security",
  "noise",
  "parking",
  "cleaning",
  "amenity",
  "other",
];
export const URGENCIES = ["urgent", "high", "normal", "low"];

// A route view's Base key (matches appConfig.bases[].key and the pagination/
// totals keys the provider returns) and the snapshot array it reads.
const VIEW_BASE_KEY = { intake: "intake", dispatch: "proposals", board: "tickets" };
const VIEW_SNAPSHOT_KEY = { intake: "intake", dispatch: "dispatch_proposals", board: "tickets" };
const VIEW_STATUS_VALUES = { dispatch: DISPATCH_STATUSES, board: BOARD_STATUSES };

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Prev/Next pager for the three browsed Bases (intake, proposals, tickets).
  // records.list only exposes a forward keyset cursor, so pageCursors[key][i]
  // is the cursor that fetches page i+1. Only neighbouring pages are
  // reachable — one click, one request; there is no "jump to page N" because
  // reaching it would mean reading every page in between (see
  // runtime-and-sdk.md's "A full scan in disguise").
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { intake: new Map(), dispatch: new Map(), board: new Map() },
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-tickets-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-tickets.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  reviewCount: byId("count-review"),
  unclassifiedCount: byId("count-unclassified"),
  slaCount: byId("count-sla"),
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

export function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function nowMs() {
  if (state.demo && state.snapshot?.generated_at) return Date.parse(state.snapshot.generated_at);
  return Date.now();
}

export function formatAge(iso) {
  if (!iso) return "";
  const hours = Math.max(0, (nowMs() - Date.parse(iso)) / 3600000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}${t("hours")}`;
  return `${Math.floor(hours / 24)}d`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the status filter and
// the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.
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
  const statusValues = VIEW_STATUS_VALUES[view];
  const status = statusValues ? (statusValues.includes(params.get("status")) ? params.get("status") : "all") : "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status,
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (VIEW_STATUS_VALUES[route.view] && route.status !== "all") params.set("status", route.status);
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
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
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

// Replace the current entry without a hashchange: search keystrokes and
// filter clicks should not each become a Back step.
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
  state.extra = { intake: new Map(), dispatch: new Map(), board: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-tickets:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// The configured page size for a paginated Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// The real total (records.count, from provider.getState()'s `totals`), so a
// pager has an honest total behind it when the SDK can supply one.
export function pageCount(key) {
  if (!state.pageCursors[key]) return null;
  const total = state.settings?.totals?.[key];
  if (total == null) return null;
  return Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything summed from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
export async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    const snapshotKey = Object.entries(VIEW_BASE_KEY).find(([, baseKey]) => baseKey === key)?.[0];
    state.snapshot[VIEW_SNAPSHOT_KEY[snapshotKey]] = rows;
    state.snapshot.metrics = computeMetrics(state.snapshot);
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
    const row = await provider.getRecord(view, selectedId);
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "intake"
      ? "#/intake"
      : scenario === "dispatch"
        ? "#/dispatch"
        : scenario === "board"
          ? "#/board"
          : scenario === "detail"
            ? "#/board/T-1001"
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
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  els.detailExpand.textContent = t("openFullPage");
}

function applyLocalDecision(item, kindStatuses = true) {
  const local = state.demoDecisions[item.id];
  if (!local) return item;
  let status = item.status;
  if (kindStatuses) {
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
  }
  return { ...item, status, decision: local, note_to_crew: local.draft ?? item.note_to_crew };
}

export function proposals() {
  const list = state.snapshot?.dispatch_proposals || [];
  if (!state.demo) return list;
  return list.map((proposal) => applyLocalDecision(proposal));
}

export function intakeItems() {
  const list = state.snapshot?.intake || [];
  if (!state.demo) return list;
  return list.map((item) => {
    const local = state.demoDecisions[item.id];
    if (!local) return item;
    const triage_state = local.action === "ignore" ? "ignored" : item.triage_state;
    return { ...item, triage_state, decision: local };
  });
}

export function tickets() {
  const list = state.snapshot?.tickets || [];
  if (!state.demo) return list;
  return list.map((ticket) => {
    const local = state.demoDecisions[ticket.id];
    if (!local) return ticket;
    return { ...ticket, decision: local, resolution_note: local.note || ticket.resolution_note };
  });
}

function crews() {
  return state.snapshot?.crews || [];
}

export function crewName(crewId) {
  return crews().find((crew) => crew.crew_id === crewId)?.name || crewId || "";
}

// Loaded page first (with the demo-decision overlay already applied by
// intakeItems()/proposals()/tickets()), then a record fetched on its own for
// the URL (records.get, never pre-resolved — see ensureSelectedRecord()).
export function recordById(view, id) {
  if (!id) return null;
  const rows = view === "intake" ? intakeItems() : view === "dispatch" ? proposals() : tickets();
  return rows.find((item) => item.id === id) || state.extra[view]?.get(id) || null;
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredIntake() {
  return intakeItems().filter((item) =>
    matchesQuery([
      item.text,
      item.reporter,
      item.unit,
      item.location,
      item.channel,
      item.category_guess,
      item.triage_state,
      item.ticket_id,
    ]),
  );
}

export function filteredTickets() {
  return tickets().filter((ticket) => {
    if (state.route.status !== "all" && ticket.status !== state.route.status) return false;
    return matchesQuery([
      ticket.id,
      ticket.title,
      ticket.category,
      ticket.unit,
      ticket.location,
      ticket.reporter,
      crewName(ticket.crew_id),
      ticket.status,
    ]);
  });
}

export function filteredProposals() {
  return proposals().filter((proposal) => {
    if (state.route.status !== "all" && proposal.status !== state.route.status) return false;
    return matchesQuery([
      proposal.title,
      proposal.summary,
      proposal.reason,
      proposal.ticket_id,
      crewName(proposal.proposed_crew_id),
      proposal.status,
      proposal.priority,
    ]);
  });
}

function slaAtRiskCount() {
  return tickets().filter(
    (ticket) => ticket.status !== "resolved" && ["at_risk", "breached"].includes(ticket.sla_state),
  ).length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = proposals().filter((proposal) => proposal.status === "needs_review").length;
  const unclassified = intakeItems().filter((item) => item.triage_state === "new").length;
  const slaCount = slaAtRiskCount();
  els.syncStatus.textContent = !snapshot ? t("loading") : snapshot?.property?.name || t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.unclassifiedCount) els.unclassifiedCount.textContent = unclassified;
  if (els.slaCount) els.slaCount.textContent = slaCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("dispatchToApprove")}`
      : `${tickets().length}${isPartial("tickets") ? "+" : ""} ${t("tickets")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "intake") return t("intake");
  if (view === "dispatch") return t("dispatch");
  if (view === "board") return t("board");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function channelBadge(channel) {
  return `<span class="badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function categoryBadge(category) {
  return `<span class="badge category-badge">${escapeHtml(enumLabel(category, "category"))}</span>`;
}

export function urgencyBadge(urgency) {
  return `<span class="badge urgency-${escapeHtml(urgency)}">${escapeHtml(enumLabel(urgency, "urgency"))}</span>`;
}

export function statusBadge(status, group) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status, group))}</span>`;
}

export function slaBadge(ticket) {
  const stateName = ticket.sla_state || "ok";
  const due = ticket.sla_due_at ? ` · ${date(ticket.sla_due_at)}` : "";
  return `<span class="badge sla-${escapeHtml(stateName)}" title="${t("slaTarget")}${escapeHtml(due)}">${escapeHtml(enumLabel(stateName, "sla"))}${due ? escapeHtml(due) : ""}</span>`;
}

export function warnings(filter = () => true) {
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
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
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
els.viewFilters.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-status]");
  if (!chip) return;
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status: chip.dataset.status })}`,
  );
});
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
  state.query = els.search.value;
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-tickets-language", state.lang);
  if (state.demo) {
    loadState();
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
