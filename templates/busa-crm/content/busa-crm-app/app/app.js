import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { NORMALIZE_ROW_BY_KEY } from "./js/crm-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/crm-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   deals     → page:   a deal is a workplace — notes, timeline, linked
//                       contacts and related follow-ups — you stay a while.
//   contacts  → drawer: a contact is a fact you scan many of, read, and return.
//   followups → split:  the review queue is worked top to bottom, one draft
//                       after the next, so the queue stays beside the record.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const FOLLOWUP_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Prev/Next pager for the Bases that have their own browsed list (contacts,
  // deals). records.list only exposes a forward keyset cursor, so
  // pageCursors[key][i] is the cursor that fetches page i+1. Only neighbouring
  // pages are reachable — one click, one request; there is no "jump to page N"
  // because reaching it would mean reading every page in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { deals: new Map(), contacts: new Map(), followups: new Map() },
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-crm-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-crm.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

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
  dealCount: byId("count-deals"),
  contactCount: byId("count-contacts"),
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
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the follow-up status
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
    status: FOLLOWUP_STATES.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "followups" && route.status !== "all") params.set("status", route.status);
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
  state.extra = { deals: new Map(), contacts: new Map(), followups: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("busa-crm:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// The configured page size for a paginated Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// Maps a paginated Base to the metrics field carrying its REAL total (from
// records.count), so "Page 2 of 5" has an honest total behind it.
const TOTAL_COUNT_METRIC_KEY = { contacts: "contact_count", deals: "deal_count" };

export function pageCount(key) {
  if (!state.pageCursors[key]) return 1;
  const total = state.snapshot?.metrics?.[TOTAL_COUNT_METRIC_KEY[key]] ?? 0;
  return Math.max(1, Math.ceil(total / pageSize(key)));
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
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    // Same per-row normalization buildSnapshot() ran on page 1.
    state.snapshot[key] = normalize ? rows.map(normalize) : rows;
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
    scenario === "deals"
      ? "#/deals"
      : scenario === "contacts"
        ? "#/contacts"
        : scenario === "followups"
          ? "#/followups"
          : scenario === "detail"
            ? "#/deals/deal-beacon-api"
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
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function decisionFor(followupId) {
  return state.settings?.decisions?.decisions?.[followupId] || null;
}

export function effectiveStatus(followup) {
  const decision = decisionFor(followup.followup_id);
  if (!decision) return followup.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return followup.status;
}

export function followups() {
  return state.snapshot?.followups || [];
}

export function deals() {
  return state.snapshot?.deals || [];
}

export function contacts() {
  return state.snapshot?.contacts || [];
}

export function interactions() {
  return state.snapshot?.interactions || [];
}

const ID_FIELD = { deals: "deal_id", contacts: "contact_id", followups: "followup_id" };

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const rows = state.snapshot?.[view] || [];
  return rows.find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
}

// A relation is a business id (`comp-…`, `ct-…`). Resolve it to a name; when
// the target is not on the loaded page, say so — never print the id.
export function companyName(companyId) {
  if (!companyId) return "";
  return state.snapshot?.companies?.find((item) => item.company_id === companyId)?.name || t("notLoaded");
}

export function contactById(contactId) {
  return recordById("contacts", contactId);
}

export function dealById(dealId) {
  return recordById("deals", dealId);
}

export function reviewCount() {
  return followups().filter((item) => effectiveStatus(item) === "needs_review").length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const review = reviewCount();
  // Prefer the real total (records.count, unaffected by which page is loaded);
  // fall back to the loaded rows for providers that do not populate metrics.
  const metrics = snapshot?.metrics || {};
  const openDealCount = metrics.open_deal_count ?? deals().filter((item) => item.status === "open").length;
  const contactCount = metrics.contact_count ?? contacts().length;
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.dealCount) els.dealCount.textContent = openDealCount;
  if (els.contactCount) els.contactCount.textContent = contactCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review ? `${review} ${t("needReview")}` : `${openDealCount} ${t("openDeals")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "deals") return t("deals");
  if (view === "contacts") return t("contacts");
  if (view === "followups") return t("followups");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function relationshipBadge(value) {
  return `<span class="relationship-badge rel-${escapeHtml(value)}">${escapeHtml(enumLabel(value, "relationship"))}</span>`;
}

export function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
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

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredDeals() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return deals();
  return deals().filter((item) =>
    matches(
      [
        item.name,
        item.stage,
        item.status,
        item.next_step,
        item.owner,
        companyName(item.company_id),
        contactById(item.primary_contact_id)?.name,
      ],
      query,
    ),
  );
}

export function filteredContacts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return contacts();
  return contacts().filter((item) =>
    matches([item.name, item.role, item.relationship, item.email, companyName(item.company_id), ...(item.tags || [])], query),
  );
}

export function filteredFollowups() {
  const query = state.route.query.trim().toLowerCase();
  return followups().filter((item) => {
    const status = effectiveStatus(item);
    if (state.route.status !== "all" && status !== state.route.status) return false;
    if (!query) return true;
    return matches(
      [
        item.subject,
        item.reason,
        item.suggested_reply,
        status,
        contactById(item.contact_id)?.name,
        companyName(contactById(item.contact_id)?.company_id),
      ],
      query,
    );
  });
}

export function followupStates() {
  return FOLLOWUP_STATES;
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
  const segment = event.target.closest("[data-status]");
  if (!segment) return;
  replaceRoute(`#/followups${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});
document.getElementById("statusSelect").addEventListener("change", (event) => {
  replaceRoute(`#/followups${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-field]");
  if (!field) return;
  const id = field.closest("[data-followup]")?.dataset.followup;
  if (id) state.edits[id] = { ...state.edits[id], [field.dataset.field]: field.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-followup]");
  submitDecision(card.dataset.followup, button.dataset.action, card);
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
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-crm-language", state.lang);
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
