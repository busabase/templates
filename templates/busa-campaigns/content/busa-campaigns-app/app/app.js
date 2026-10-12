import { messages } from "./i18n/messages.js";
import {
  renderOverview,
  renderRecordView,
  renderSettings,
  submitDecision,
} from "./js/campaign-views.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   campaigns      → split:  the send review queue is worked top to bottom —
//                            approve, request changes or block one draft,
//                            then the next — so the queue stays beside it.
//   deliverability → drawer: an auth/spam/inbox fact you scan across many
//                            sends, check one, and return to the list.
//   performance    → drawer: results you compare across sends, read, return.
//   suppression    → drawer: a consent fact (who, why, when) you look up.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// Every view but suppression lists rows of the Sends Base.
export const BASE_FOR_VIEW = {
  campaigns: "sends",
  deliverability: "sends",
  performance: "sends",
  suppression: "suppression",
};
export const SEND_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
export const PHASES = ["setup", "engage", "nurture", "deliver"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Prev/Next pager per paginated Base. records.list only exposes a forward
  // keyset cursor, so pageCursors[key][i] is the cursor that fetches page i+1.
  // Only neighbouring pages are reachable — one click, one request; there is
  // no "jump to page N" because reaching it would mean reading every page in
  // between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { sends: new Map(), suppression: new Map() },
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-campaigns-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-campaigns.sidebarCollapsed";
// Inverse of campaigns-model.js's statusForAction(): a send's own `status`
// plus `decided_at`/`decision_note`/`chosen_variant` are the single source of
// truth now (written directly onto the record) — this only recovers which
// verdict produced the current status, for display in the review queue.
const ACTION_FOR_STATUS = {
  approved: "approve",
  changes_requested: "request_changes",
  blocked: "block",
  needs_review: "revise",
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
  statusSelect: byId("statusSelect"),
  phaseSelect: byId("phaseSelect"),
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
  approvedCount: byId("count-approved"),
  riskCount: byId("count-risk"),
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

export function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function count(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US").format(Number(value || 0));
}

export function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&phase=…&peek=…]`. Search, the queue's
// status/phase filters and the peeked record live in the URL so refresh,
// shared links and Back restore the same list context.
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
  const phase = params.get("phase") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: SEND_STATES.includes(status) ? status : "all",
    phase: PHASES.includes(phase) ? phase : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "campaigns" && route.status !== "all") params.set("status", route.status);
  if (route.view === "campaigns" && route.phase !== "all") params.set("phase", route.phase);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view) => ({ view, query: "", status: "all", phase: "all" });
export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};
// A filtered list link from elsewhere (overview phase tiles, attention block).
export const filterUrl = (view, filters = {}) => routeQuery({}, { ...blankRoute(view), ...filters });

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
  state.totals = data.totals || {};
  state.extra = { sends: new Map(), suppression: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("busa-campaigns:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// Pages behind the real total (records.count), so "Page 2 of 5" is honest.
export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything counted from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Where each paginated Base's displayed rows live in state.
const PAGE_ROWS = {
  sends: (rows) => {
    state.snapshot.sends = rows;
  },
  suppression: (rows) => {
    state.settings.suppression = { ...state.settings.suppression, entries: rows };
  },
};

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
export async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !PAGE_ROWS[key]) return;
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
    PAGE_ROWS[key](rows);
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
  const key = BASE_FOR_VIEW[view];
  if (recordById(view, selectedId) || state.extra[key].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[key].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[key].set(selectedId, undefined);
  try {
    state.extra[key].set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    state.extra[key].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "campaigns"
      ? "#/campaigns"
      : scenario === "deliverability"
        ? "#/deliverability"
        : scenario === "performance"
          ? "#/performance"
          : scenario === "suppression"
            ? "#/suppression"
            : scenario === "detail"
              ? "#/campaigns/send-summer-launch"
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
  els.statusSelect.setAttribute("aria-label", t("status"));
  els.phaseSelect.setAttribute("aria-label", t("phase"));
}

export function decisionFor(sendId) {
  const send = sendById(sendId);
  if (!send || !send.decided_at) return null;
  return {
    action: ACTION_FOR_STATUS[send.status] || "revise",
    comment: send.decision_note || "",
    chosen_variant: send.chosen_variant || "",
    decided_at: send.decided_at,
  };
}

export function effectiveStatus(send) {
  // Busabase reads are always live, so the record's own status is already
  // current — no separate decisions.json to reconcile against staleness.
  return send.status;
}

export function sends() {
  return state.snapshot?.sends || [];
}

function segments() {
  return state.snapshot?.segments || [];
}

// A send names its segment by business id. Resolve it to the segment's name;
// when that segment is not loaded, say so — never print the id.
export function segmentName(segmentId) {
  if (!segmentId) return "";
  return segments().find((item) => item.segment_id === segmentId)?.name || t("notLoaded");
}

export function suppressionEntries() {
  return state.settings?.suppression?.entries || [];
}

export const suppressionId = (entry) => entry?.entry_id || entry?.__recordId || "";

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  const key = BASE_FOR_VIEW[view];
  const rows = key === "suppression" ? suppressionEntries() : sends();
  const match =
    key === "suppression" ? rows.find((item) => suppressionId(item) === id) : rows.find((item) => item.send_id === id);
  return match || state.extra[key]?.get(id) || null;
}

export function sendById(sendId) {
  return recordById("campaigns", sendId);
}

// A send carries a precomputed `suppression` summary (from the provider's
// pre-send check); render it read-only.
export function suppressionNote(send) {
  const info = send?.suppression;
  if (!info || !info.suppressed_count) return "";
  const cls = info.blocked ? "suppression-note blocked" : "suppression-note";
  const label = info.blocked ? t("suppressionBlocked") : `${info.suppressed_count} ${t("suppressionExcluded")}`;
  return `<div class="${cls}">${escapeHtml(label)}</div>`;
}

// Exact per-status totals when the provider counted them (records.count);
// otherwise counted from the loaded page.
export function statusCount(status) {
  const exact = state.settings?.status_counts;
  if (status === "all") return state.totals?.sends ?? sends().length;
  if (exact && exact[status] != null) return exact[status];
  return sends().filter((item) => effectiveStatus(item) === status).length;
}

export function reviewCount() {
  return statusCount("needs_review");
}

function approvedCount() {
  return statusCount("approved");
}

// Derived from each send's deliverability JSON, so it cannot be counted on the
// server: it covers the loaded page and says "+" when more sends exist.
export function atRiskCount() {
  const n = sends().filter((item) => item.deliverability?.risk === "high" || item.quality_gate?.verdict === "block").length;
  return `${n}${isPartial("sends") ? "+" : ""}`;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const review = snapshot ? reviewCount() : 0;
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.approvedCount) els.approvedCount.textContent = snapshot ? approvedCount() : 0;
  if (els.riskCount) els.riskCount.textContent = snapshot ? atRiskCount() : 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !snapshot
      ? t("loading")
      : review
        ? `${review} ${t("needReview")}`
        : state.settings?.demo
          ? t("demoData")
          : t("liveData");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "campaigns") return t("campaigns");
  if (view === "deliverability") return t("deliverability");
  if (view === "performance") return t("performance");
  if (view === "suppression") return t("suppressionNav");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function typeBadge(type) {
  return `<span class="type-badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

export function verdictBadge(verdict) {
  if (!verdict) return "";
  return `<span class="verdict-badge verdict-${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))}</span>`;
}

export function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

export function deliverabilityBadge(deliverability) {
  if (!deliverability) return "";
  const risk = deliverability.risk || "low";
  return `<span class="deliv-badge deliv-${escapeHtml(risk)}">${escapeHtml(enumLabel(risk, "deliverabilityRisk"))}</span>`;
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

export function matchesQuery(send) {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return true;
  return [
    send.subject,
    send.preview_text,
    send.reason,
    send.body,
    enumLabel(send.type, "type"),
    enumLabel(send.phase, "phase"),
    segmentName(send.segment_id),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function filteredCampaigns() {
  return sends().filter((item) => {
    const status = effectiveStatus(item);
    if (state.route.status !== "all" && status !== state.route.status) return false;
    if (state.route.phase !== "all" && item.phase !== state.route.phase) return false;
    return matchesQuery(item);
  });
}

export function filteredSuppression() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return suppressionEntries();
  return suppressionEntries().filter((entry) =>
    [entry.address, entry.segment_id ? segmentName(entry.segment_id) : "", enumLabel(entry.reason, "suppressionReason"), entry.note, entry.source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
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
const filterRoute = (changes) =>
  replaceRoute(`#/campaigns${routeQuery({ peek: state.route.peek }, { ...state.route, ...changes })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (segment) filterRoute({ status: segment.dataset.status });
});
els.statusSelect.addEventListener("change", (event) => filterRoute({ status: event.target.value }));
els.phaseSelect.addEventListener("change", (event) => filterRoute({ phase: event.target.value }));
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-field]");
  const radio = event.target.closest('input[type="radio"]');
  const id = event.target.closest("[data-send]")?.dataset.send;
  if (!id) return;
  if (field) state.edits[id] = { ...state.edits[id], [field.dataset.field]: field.value };
  if (radio) state.edits[id] = { ...state.edits[id], chosen_variant: radio.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-send]");
  submitDecision(card.dataset.send, button.dataset.action, card);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input, select")) {
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
  localStorage.setItem("busa-campaigns-language", state.lang);
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
