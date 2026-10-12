import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings } from "./js/lead-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

export const STAGES = ["new", "data_verified", "scored", "term_sheet_ready", "rejected"];

// Where a lead opens. Both record views (Board, Leads) read the one `leads`
// Base, so they share its mode — `drawer`: a lead is a fact the sourcing team
// scans many of, reads the score, moves one field (its stage) or leaves a note,
// and goes back to the board. `?peek=<id>` drives the drawer; `#/leads/<id>`
// is the full page ("Open full page"). On a phone every mode is a page
// (base-ui.css handles that). Declared once, in config.js `ui.detail_modes`.
const LEAD_DETAIL_MODE = appConfig.ui?.detail_modes?.leads || "drawer";
const RECORD_VIEWS = ["board", "leads"];

export const state = {
  provider: null,
  settings: null,
  // Exact totals from records.count: { total, by_stage: { new: n, … } }.
  // `null` members mean the count was unavailable (denied / failed).
  counts: { total: null, by_stage: null },
  // One page per stage filter ("all" for the unfiltered list), each with a
  // forward keyset cursor list: cursors[i] fetches page i+1. Prev/Next only —
  // reaching page N must not mean reading every page before it.
  datasets: {},
  // Leads opened by URL that are not on a loaded page (records.get).
  extra: new Map(),
  route: parseRoute(),
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-lead-funnel-language") || "auto",
  ),
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-lead-funnel.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  stageFilters: byId("stageFilters"),
  stageSelect: byId("stageSelect"),
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
  newCount: byId("new-count"),
  readyCount: byId("ready-count"),
  rejectedCount: byId("rejected-count"),
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

// Enum lookups never print a raw id: an unknown value is humanized.
function enumText(group, value) {
  if (value == null || value === "") return "";
  const key = String(value);
  return messages[activeLang()]?.[group]?.[key] || messages.en[group]?.[key] || key.replaceAll("_", " ");
}

export const stageLabel = (stage) => enumText("stage", stage);
export const categoryLabel = (category) => enumText("category_enum", category);
export const sourceLabel = (source) => enumText("source_enum", source);
export const actionLabel = (action) => enumText("action_enum", action);
export const factorLabel = (factor) => enumText("factor_enum", factor);
export const tierLabel = (tier) => enumText("tier", tier);

export function money(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency: state.settings?.config_summary?.base_currency || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function storesText(count) {
  const n = Number(count || 0);
  return `${n} ${n === 1 ? t("storesOne") : t("storesMany")}`;
}

export function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function scoreClass(score) {
  const n = Number(score || 0);
  if (n >= 75) return "high";
  if (n >= 55) return "medium";
  return "low";
}

export function riskClass(category) {
  const criteria = state.settings?.config_summary?.scoring_criteria || {};
  if ((criteria.low_risk_categories || []).includes(category)) return "risk-low";
  if ((criteria.medium_risk_categories || []).includes(category)) return "risk-medium";
  if ((criteria.higher_risk_categories || []).includes(category)) return "risk-higher";
  return "";
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/overview` · `#/board[?q=&peek=]` · `#/leads[?stage=&q=&peek=]` ·
// `#/leads/<id>` (full page) · `#/settings`. Search, the stage filter and the
// peeked lead live in the URL so refresh, shared links and Back restore the
// same list context. The pre-migration `#/board/<stage>` queue redirects to
// the Leads table filtered by that stage.
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
  let stage = params.get("stage") || "";
  if (view === "board" && STAGES.includes(id)) {
    stage = id;
    id = "";
    view = "leads";
  }
  if (view === "board") id = "";
  if (![...RECORD_VIEWS, "settings", "overview"].includes(view)) view = "overview";
  const onRecordView = RECORD_VIEWS.includes(view);
  const peek = onRecordView && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: onRecordView ? id || peek : "",
    presentation: !onRecordView ? null : id ? "page" : peek ? LEAD_DETAIL_MODE : null,
    query: params.get("q") || "",
    stage: view === "leads" && STAGES.includes(stage) ? stage : "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.view === "leads" && route.stage) params.set("stage", route.stage);
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: always a page, whichever view it was opened from.
export const detailUrl = (id) => {
  const route = state.route.view === "leads" ? state.route : { view: "leads", query: "", stage: "" };
  return `#/leads/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row or card opens: `?peek=` for the drawer, or the page if the
// declared mode is `page`.
export const recordUrl = (id, view = state.route.view) => {
  if (LEAD_DETAIL_MODE === "page") return detailUrl(id);
  const route = view === state.route.view ? state.route : { view, query: "", stage: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};
export const stageUrl = (stage) => `#/leads${stage ? `?stage=${encodeURIComponent(stage)}` : ""}`;

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Canonicalize the legacy `#/board/<stage>` shape without a new Back step.
  if (/^#\/?board\/[^/?]+/.test(location.hash)) history.replaceState(history.state, "", listUrl());
  // A detail opened from its own list is marked, so Back/Close/Escape step
  // back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureDataset();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// clicks do not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
  ensureDataset();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
const datasetKey = (stage) => stage || "all";

const seedDataset = (rows, nextCursor) => ({
  rows,
  cursors: [undefined, nextCursor ?? null],
  page: 1,
  loading: false,
  error: "",
});

export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.settings = data;
  state.counts = data.counts || { total: data.totals?.leads ?? null, by_stage: null };
  state.datasets = { all: seedDataset(data.leads || [], data.pagination?.leads) };
  state.extra = new Map();
  window.dispatchEvent(new CustomEvent("busa-lead-funnel:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureDataset();
  ensureSelectedRecord();
}

export function dataset(stage = state.route.stage) {
  return state.datasets[datasetKey(stage)] || null;
}

// The Leads table filtered by a stage reads that stage's first page once, on
// the user's click — one request, never a scan of the unfiltered pages.
async function ensureDataset() {
  const { view, stage } = state.route;
  if (!state.settings || view !== "leads" || !stage || state.datasets[stage]) return;
  state.datasets[stage] = { ...seedDataset([], null), loading: true };
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchPage("leads", undefined, { stage });
    state.datasets[stage] = seedDataset(rows, nextCursor);
  } catch (error) {
    state.datasets[stage] = { ...seedDataset([], null), error: error instanceof Error ? error.message : String(error) };
  }
  render();
}

function pageSize() {
  return appConfig.bases.find((entry) => entry.key === "leads")?.readLimit || 50;
}

// Total for a dataset from records.count — `null` when unavailable.
export function datasetTotal(stage = state.route.stage) {
  return stage ? (state.counts.by_stage?.[stage] ?? null) : state.counts.total;
}

export function pageCount(stage = state.route.stage) {
  const total = datasetTotal(stage);
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize()));
}

// True while a dataset holds only part of its rows. Anything derived from
// loaded rows must say so.
export function isPartial(stage = state.route.stage) {
  const set = dataset(stage);
  if (!set) return false;
  return set.page > 1 || Boolean(set.cursors[set.page]);
}

// Replaces the displayed page with a NEIGHBOURING page: one request per click,
// using a cursor already in hand. Never appends, never loops.
export async function goToPage(stage, targetPage) {
  const set = dataset(stage);
  if (!set || set.loading) return;
  if (Math.abs(targetPage - set.page) !== 1 || targetPage < 1) return;
  if (targetPage > set.page && !set.cursors[set.page]) return;
  set.loading = true;
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchPage("leads", set.cursors[targetPage - 1], { stage });
    set.rows = rows;
    set.cursors[targetPage] = nextCursor;
    set.page = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    set.loading = false;
    render();
  }
}

// A lead named by the URL but not on a loaded page is read on its own
// (records.get by its business id) instead of loading pages to find it.
async function ensureSelectedRecord() {
  const { selectedId } = state.route;
  if (!state.settings || !selectedId) return;
  if (leadById(selectedId) || state.extra.has(selectedId)) return;
  if (typeof state.provider?.getRecord !== "function") {
    state.extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra.set(selectedId, undefined);
  try {
    state.extra.set(selectedId, (await state.provider.getRecord("leads", selectedId)) || null);
  } catch {
    state.extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

export function leadById(id) {
  if (!id) return null;
  for (const set of Object.values(state.datasets)) {
    const found = set.rows.find((lead) => lead.id === id);
    if (found) return found;
  }
  return state.extra.get(id) || null;
}

export const allLeads = () => state.datasets.all?.rows || [];

// Exact when records.count answered; otherwise a tally of the loaded page.
export function stageCount(stage) {
  const exact = state.counts.by_stage?.[stage];
  if (exact != null) return exact;
  return allLeads().filter((lead) => lead.stage === stage).length;
}

export function totalCount() {
  return state.counts.total ?? allLeads().length;
}

export const countsExact = () => state.counts.total != null && state.counts.by_stage != null;

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "lead"
      ? `#/leads/${encodeURIComponent(allLeads()[0]?.id || "")}`
      : scenario === "board"
        ? "#/board"
        : scenario === "leads"
          ? "#/leads"
          : scenario === "settings"
            ? "#/settings"
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
  byId("overviewOpenBoard").textContent = t("board");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function viewLabel(view = state.route.view) {
  if (view === "board") return t("board");
  if (view === "leads") return state.route.stage ? stageLabel(state.route.stage) : t("leadsNav");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const ready = Boolean(state.settings);
  els.syncStatus.textContent = !ready ? t("loading") : state.settings.demo ? t("demoData") : t("liveData");
  if (els.newCount) els.newCount.textContent = ready ? stageCount("new") : "0";
  if (els.readyCount) els.readyCount.textContent = ready ? stageCount("scored") : "0";
  if (els.rejectedCount) els.rejectedCount.textContent = ready ? stageCount("rejected") : "0";
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel();
  if (els.mobileViewMeta) {
    const { view, stage } = state.route;
    els.mobileViewMeta.textContent = !ready
      ? t("loading")
      : view === "leads" && stage
        ? `${stageCount(stage)} ${t("leads")}`
        : `${totalCount()} ${t("leads")}`;
  }
  document.querySelectorAll(".filters [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.settings);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && presentation === "split");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  body.toggle("view-board", onRecordView && view === "board");
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

// ── Writes ─────────────────────────────────────────────────────────────────
// Direct writes go straight through the active provider (Busabase or demo) —
// a stage move or a note, written onto the lead's own record. There is no
// separate approval step in this app; when Busabase holds the change for
// review, the notice says so.
async function runWrite(action) {
  if (state.settings?.demo) {
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  let result;
  try {
    result = await action(await getProvider());
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error || "Request failed");
    render();
    return;
  }
  await loadState();
  state.notice = result?.pending ? t("submittedForReview") : t("saved");
  render();
}

const moveLeadStage = (id, stage, reason) => runWrite((provider) => provider.moveStage(id, stage, reason));
const addLeadNote = (id, text) => runWrite((provider) => provider.addNote(id, text));

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [stage, page] = pager.dataset.gotoPage.split(":");
    goToPage(stage, Number(page));
    return;
  }
  const target = event.target.closest("tr[data-id], [data-card-id]");
  if (!target) return;
  if (event.target.closest("a:not([data-card-id]), button")) return;
  event.preventDefault();
  const url = recordUrl(target.dataset.id || target.dataset.cardId);
  // Switching leads while the drawer is open replaces the entry, so Close
  // still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.stageFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-stage]");
  if (!segment) return;
  replaceRoute(`#/leads${routeQuery({ peek: state.route.peek }, { ...state.route, stage: segment.dataset.stage })}`);
});
els.stageSelect.addEventListener("change", (event) => {
  replaceRoute(`#/leads${routeQuery({ peek: state.route.peek }, { ...state.route, stage: event.target.value })}`);
});
els.detailBody.addEventListener("click", (event) => {
  const move = event.target.closest("[data-move]");
  if (move) {
    moveLeadStage(move.dataset.lead, move.dataset.move);
    return;
  }
  const toggle = event.target.closest("[data-toggle-reject]");
  if (toggle) {
    const form = els.detailBody.querySelector("#rejectForm");
    if (form) form.hidden = toggle.dataset.toggleReject !== "1";
    if (!form?.hidden) form.querySelector("textarea")?.focus();
  }
});
els.detailBody.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const id = form.dataset.lead;
  const text = form.querySelector("textarea")?.value.trim();
  if (!id || !text) return;
  if (form.id === "rejectForm") moveLeadStage(id, "rejected", text);
  else if (form.id === "noteForm") addLeadNote(id, text);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
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
  localStorage.setItem("busa-lead-funnel-language", state.lang);
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

if (/^#\/?board\/[^/?]+/.test(location.hash)) history.replaceState(null, "", listUrl());
els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
