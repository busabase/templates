import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { computeMetrics } from "./js/radar-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision, submitFollowup } from "./js/radar-views.js";

// Where a record opens, per Base. Chosen by what people do with the record:
//   signals       → split:  triage is a queue worked top to bottom — read the
//                           change, decide, next — so the queue stays beside it.
//   watchlist     → page:   a watch target is a workplace — its sources, their
//                           methods and the signal history it produced.
//   questions     → page:   a research question owns a brief to review or a long
//                           cited report to read and rate; you stay for minutes.
//   movers        → drawer: a trend mover is a fact you scan many of, glance at
//                           its momentum and opportunity, and return.
//   opportunities → drawer: an opportunity card is read and approved/ignored in
//                           one step, then back to the list.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = ["signals", "watchlist", "research", "trends"];
const TREND_TABS = ["movers", "opportunities"];

// The Base a record view lists (trends lists one of two, by tab).
export function baseKeyFor(view, tab = "movers") {
  if (view === "research") return "questions";
  if (view === "trends") return tab === "opportunities" ? "opportunities" : "movers";
  return view;
}

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { watchlist: new Map(), signals: new Map(), questions: new Map(), opportunities: new Map() },
  // Unsaved review notes / follow-up drafts, so a re-render never eats typing.
  drafts: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-radar-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-radar.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewTabs: byId("viewTabs"),
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
  triageCount: byId("count-triage"),
  briefsCount: byId("count-briefs"),
  reportsCount: byId("count-reports"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    if (key === "questions") state.snapshot.research.questions = rows;
    else if (key === "opportunities") state.snapshot.trends.opportunities = rows;
    else state.snapshot[key] = rows;
    state.snapshot.metrics = computeMetrics(state.snapshot);
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.notice = error instanceof Error ? error.message : String(error);
  },
});

export function recordTotal(key, fallback = 0) {
  return pagination.total(key, fallback);
}

export function isPartial(key) {
  return pagination.isPartial(key);
}

export function pagerControl(key) {
  return pagination.control(key);
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

function validDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function date(value) {
  const parsed = validDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function dateTime(value) {
  const parsed = validDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&tab=…&peek=…]`. Search, the Trends tab and the
// peeked record live in the URL so refresh, shared links and Back restore the
// same list context.
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
  const tab = TREND_TABS.includes(params.get("tab")) ? params.get("tab") : "movers";
  const mode = RECORD_VIEWS.includes(view) ? DETAIL_MODES[baseKeyFor(view, tab)] || "drawer" : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    tab: view === "trends" ? tab : "",
    mode,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "trends" && route.tab && route.tab !== "movers") params.set("tab", route.tab);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const routeFor = (view, tab) =>
  view === state.route.view && (!tab || tab === state.route.tab) ? state.route : { view, query: "", tab: tab || "" };

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the Base's mode.
export const detailUrl = (id, view = state.route.view, tab = "") =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, routeFor(view, tab))}`;
// What a row (or a cross-link) opens: the page for a `page` Base, else `?peek=`.
export const recordUrl = (id, view = state.route.view, tab = "") => {
  const route = routeFor(view, tab);
  if (DETAIL_MODES[baseKeyFor(view, route.tab || tab)] === "page") return detailUrl(id, view, tab);
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  closing = false;
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

// Replace the current entry without a hashchange: search keystrokes and tab
// clicks should not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

// history.back() lands asynchronously; a second Escape before the hashchange
// arrives must not step back past the list as well.
let closing = false;
export function closeDetail() {
  if (closing) return;
  closing = true;
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = { watchlist: new Map(), signals: new Map(), questions: new Map(), opportunities: new Map() };
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-radar:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, tab, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseKeyFor(view, tab);
  if (recordById(key, selectedId) || !state.extra[key] || state.extra[key].has(selectedId)) return;
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
    scenario === "signals"
      ? "#/signals"
      : scenario === "detail"
        ? "#/signals?peek=sig-formora-pricing"
        : scenario === "research"
          ? "#/research"
          : scenario === "trends"
            ? "#/trends"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
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

export function signals() {
  return state.snapshot?.signals || [];
}

export function watchlist() {
  return state.snapshot?.watchlist || [];
}

export function research() {
  return state.snapshot?.research || { questions: [], briefs: [], reports: [] };
}

export function trends() {
  return state.snapshot?.trends || { movers: [], opportunities: [] };
}

const ID_FIELD = {
  watchlist: "target_id",
  signals: "signal_id",
  questions: "question_id",
  movers: "mover_id",
  opportunities: "opportunity_id",
};

function rowsFor(key) {
  if (key === "questions") return research().questions;
  if (key === "movers") return trends().movers;
  if (key === "opportunities") return trends().opportunities;
  return state.snapshot?.[key] || [];
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(key, id) {
  if (!id) return null;
  return rowsFor(key).find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

export function briefById(briefId) {
  return research().briefs.find((item) => item.brief_id === briefId);
}

export function reportById(reportId) {
  return research().reports.find((item) => item.report_id === reportId);
}

// A relation is a business id (`formora`, `opp-…`). Resolve it to a name; when
// the target is not on the loaded page, say so — never print the id.
export function targetName(targetId) {
  if (!targetId) return "";
  return recordById("watchlist", targetId)?.name || t("notLoaded");
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

// Exact server counts when the provider has them (records.count with filters);
// otherwise counted from the loaded page.
export function attentionCounts() {
  const exact = state.settings?.counts || {};
  const pick = (name, loaded) => (exact[name] == null ? loaded : exact[name]);
  const triage = pick("triage", signals().filter((item) => item.status === "needs_review").length);
  const briefs = pick("briefs", research().briefs.filter((item) => item.status === "needs_review").length);
  const reports = pick("reports", research().questions.filter((item) => item.status === "report_ready").length);
  const opportunities = pick(
    "opportunities",
    trends().opportunities.filter((item) => item.status === "needs_review").length,
  );
  const highTriage = pick(
    "highTriage",
    signals().filter((item) => item.severity === "high" && item.status === "needs_review").length,
  );
  // Follow-ups live inside each question's JSON, so they can only be counted
  // from the loaded questions.
  const followups = research().questions.reduce(
    (sum, question) => sum + (question.followups || []).filter((fu) => fu.status !== "closed").length,
    0,
  );
  return { triage, briefs, reports, opportunities, highTriage, followups };
}

function renderShell() {
  applyI18n();
  const counts = attentionCounts();
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.triageCount) els.triageCount.textContent = counts.triage;
  if (els.briefsCount) els.briefsCount.textContent = counts.briefs;
  if (els.reportsCount) els.reportsCount.textContent = counts.reports;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = counts.triage
      ? `${counts.triage} ${t("signalsToTriage")}`
      : `${recordTotal("signals", signals().length)} ${t("signals").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "signals") return t("signals");
  if (view === "watchlist") return t("watchlist");
  if (view === "research") return t("research");
  if (view === "trends") return t("trends");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function render() {
  renderShell();
  const { view, selectedId, presentation, mode } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && mode === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  for (const name of RECORD_VIEWS) body.toggle(`view-${name}`, onRecordView && view === name);
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
els.listPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest("tr[data-id]");
  if (row) location.hash = recordUrl(row.dataset.id);
});
els.viewTabs.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-tab]");
  if (!segment) return;
  replaceRoute(`#/trends${routeQuery({}, { ...state.route, tab: segment.dataset.tab })}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-draft]");
  if (field) state.drafts[field.dataset.draft] = field.value;
});
els.detailBody.addEventListener("click", (event) => {
  const followup = event.target.closest("#file-followup");
  if (followup) {
    submitFollowup(followup.dataset.question);
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  submitDecision({
    kind: button.dataset.kind,
    id: button.dataset.id,
    action: button.dataset.action,
    comment: els.detailBody.querySelector("#review-note")?.value || "",
    confidence: button.dataset.confidence ? Number(button.dataset.confidence) : undefined,
  });
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a note only leaves the field; a second Escape closes.
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState());
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-radar-language", state.lang);
  loadState();
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
