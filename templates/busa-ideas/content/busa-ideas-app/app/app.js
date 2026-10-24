import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.2.2";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.2.2";
import { buildSnapshot, DOC_KINDS, NORMALIZE_ROW_BY_KEY } from "./js/ideas-model.js?v=0.2.2";
import { bindDetailEvents, renderOverview, renderRecordView, renderSettings } from "./js/ideas-views.js";
import { getProvider } from "./js/providers/index.js?v=0.2.2";

// Where a record opens, per view. Chosen by what people do with the record:
//   ideas         → page:  an idea is a workplace — its questions to answer, its
//                          gate, and three long documents — you stay a while.
//   brd/mrd/prd   → split: each is a reading queue over the Documents Base (one
//                          document per idea), read one after the next, so the
//                          list stays beside the document.
// A `/record` path opens the full page; `?peek=` drives the split. Open full
// page on a document lands on its idea's page, on that document's tab — one
// detail implementation, not two. On a phone every mode is a page.
// Declared once, in config.js `ui.detail_modes` (per Base).
const BASE_MODES = appConfig.ui.detail_modes;
export const DETAIL_MODES = {
  ideas: BASE_MODES.ideas,
  ...Object.fromEntries(DOC_KINDS.map((kind) => [kind, BASE_MODES.documents])),
};
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
export const ATTENTION_STATES = ["all", "needs_answer", "ready_for_agent", "needs_document", "ready_for_handoff", "parked"];

export const state = {
  snapshot: null,
  settings: null,
  // Prev/Next pager for the Base that has its own browsed list (ideas).
  // records.list only exposes a forward keyset cursor, so pageCursors[key][i]
  // is the cursor that fetches page i+1. Only neighbouring pages are reachable
  // — one click, one request; there is no "jump to page N" because reaching it
  // would mean reading every page in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  route: parseRoute(),
  // The idea last opened: the subject the sidebar's BRD / MRD / PRD links peek.
  selectedIdeaId: "",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-ideas-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-ideas.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  attentionSelect: byId("attentionSelect"),
  viewBanners: byId("viewBanners"),
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
  ideaCount: byId("count-ideas"),
  needsAnswerCount: byId("count-needs-answer"),
  readyCount: byId("count-ready"),
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

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>[/<tab>]][?q=…&attention=…&peek=…]`. Search, the attention
// filter and the peeked document live in the URL so refresh, shared links and
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
  const attention = params.get("attention") || "all";
  return {
    view,
    id,
    tab: parts[2] || "",
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    attention: view === "ideas" && ATTENTION_STATES.includes(attention) ? attention : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "ideas" && route.attention && route.attention !== "all") params.set("attention", route.attention);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page for an idea, optionally on one tab. Carries the list's search
// and filter so Back to list lands on the same list.
export const ideaUrl = (id, tab = "") => {
  const route = state.route.view === "ideas" ? state.route : { view: "ideas", query: "", attention: "all" };
  return `#/ideas/${encodeURIComponent(id)}${tab ? `/${tab}` : ""}${routeQuery({}, route)}`;
};
// What a row opens: the idea page for ideas, `?peek=` for a document view.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return ideaUrl(id);
  const route = view === state.route.view ? state.route : { view, query: "", attention: "all" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

export function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A document has no page of its own: `#/brd/<idea>` is its idea's BRD tab.
  if (DOC_KINDS.includes(state.route.view) && state.route.id) {
    history.replaceState(history.state, "", ideaUrl(state.route.id, state.route.view));
    state.route = parseRoute();
  }
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one. (Tabs inside an idea
  // replace the entry — see ideas-views.js — so the mark survives them.)
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  // Opening an idea makes it the subject of the sidebar's BRD/MRD/PRD entries.
  if (state.route.view === "ideas" && state.route.id) state.selectedIdeaId = state.route.id;
  if (DOC_KINDS.includes(state.route.view) && state.route.peek) state.selectedIdeaId = state.route.peek;
  state.notice = "";
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

// ── Data ───────────────────────────────────────────────────────────────────
export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("busa-ideas:state", { detail: data }));
  applyDemoRoute();
  render();
}

// The configured page size for a paginated Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// Maps a paginated Base to the counts field carrying its REAL total (from
// records.count), so "Page 2 of 5" has an honest total behind it.
const TOTAL_COUNT_KEY = { ideas: "total" };

export function pageCount(key) {
  if (!state.pageCursors[key]) return 1;
  const total = state.snapshot?.counts?.[TOTAL_COUNT_KEY[key]] ?? 0;
  return Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything counted from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends, never
// walks forward through pages it does not show.
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
    if (key === "ideas") {
      // An idea row is only renderable once enriched with its questions,
      // documents, gate and attention — the same buildSnapshot() page 1 went
      // through. Normalizing alone left page-2 ideas without them, and the
      // first badge or detail that touched one crashed.
      state.snapshot.ideas = buildSnapshot({
        ideas: rows,
        documents: state.snapshot.documents,
        completeness: state.snapshot.completeness,
        questions: state.snapshot.questions,
      }).ideas;
    } else {
      const normalize = NORMALIZE_ROW_BY_KEY[key];
      state.snapshot[key] = normalize ? rows.map(normalize) : rows;
    }
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "needs-answer"
      ? "#/ideas/idea-vague/questions"
      : scenario === "why-now"
        ? "#/ideas/idea-why-now/questions"
        : scenario === "ready"
          ? "#/ideas/idea-email/prd"
          : scenario === "parked"
            ? "#/ideas/idea-parked"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  if (state.route.view === "ideas" && state.route.id) state.selectedIdeaId = state.route.id;
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
  byId("settingsTitle").textContent = t("settingsTitle");
  els.detailExpand.textContent = t("openFullPage");
}

export function ideas() {
  return state.snapshot?.ideas || [];
}

export function ideaById(recordId) {
  return ideas().find((item) => item.record_id === recordId) || null;
}

function renderShell() {
  applyI18n();
  const counts = state.snapshot?.counts || {};
  const needsAnswer = counts.needsAnswer ?? 0;
  const readyForAgent = counts.readyForAgent ?? 0;
  // Prefer the real total (records.count, unaffected by which page is loaded)
  // over the in-memory length, which is only correct while everything fits on
  // one page.
  const total = counts.total ?? ideas().length;
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.needsAnswerCount) els.needsAnswerCount.textContent = needsAnswer;
  if (els.readyCount) els.readyCount.textContent = readyForAgent;
  if (els.ideaCount) els.ideaCount.textContent = total;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsAnswer ? `${needsAnswer} ${t("needAnswer")}` : `${total} ${t("ideasUnit")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.dataset.route;
    link.classList.toggle("active", route === state.route.view);
    // BRD / MRD / PRD open on the idea last looked at, when it has that document.
    if (DOC_KINDS.includes(route)) {
      const subject = ideaById(state.selectedIdeaId);
      link.setAttribute("href", subject?.documents?.[route] ? `#/${route}?peek=${encodeURIComponent(subject.record_id)}` : `#/${route}`);
    }
  });
}

export function viewLabel(view) {
  if (view === "ideas") return t("ideasTitle");
  if (DOC_KINDS.includes(view)) return t(`nav${view[0].toUpperCase()}${view.slice(1)}`);
  if (view === "settings") return t("settings");
  return t("overview");
}

export function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(t(`stage_${stage}`))}</span>`;
}

// Task language, not data-model language: the badge says what the operator can
// do about this idea, which is what the human attention panel is for.
export function attentionBadge(idea) {
  const key = idea.attention;
  return `<span class="attention-badge attention-${escapeHtml(key)}">${escapeHtml(t(`attention_${key}`))}</span>`;
}

export function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key;
}

export function clarityBar(idea) {
  const value = Math.max(0, Math.min(100, Number(idea.clarity) || 0));
  return `
    <div class="clarity" title="${escapeHtml(t("clarityHint"))}">
      <span class="clarity-label">${escapeHtml(t("clarity"))}</span>
      <span class="clarity-track"><span class="clarity-fill" style="width:${value}%"></span></span>
      <span class="clarity-value">${value}</span>
    </div>
  `;
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

export function warnings() {
  const items = state.snapshot?.warnings || [];
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

function matchesQuery(item, query) {
  return [item.title, item.one_liner, item.who, item.problem, item.source, ...(item.tags || [])]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

// Workflow filters are attention states, not data states -- "needs_answer"
// is something the operator can act on, "打磨中" is not.
export function filteredIdeas({ attention = state.route.attention } = {}) {
  const query = state.route.query.trim().toLowerCase();
  return ideas().filter((item) => {
    if (attention && attention !== "all" && item.attention !== attention) return false;
    return !query || matchesQuery(item, query);
  });
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
  // Switching documents while the split shows one replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
const setAttention = (attention) => replaceRoute(`#/ideas${routeQuery({}, { ...state.route, attention })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-attention]");
  if (segment) setAttention(segment.dataset.attention);
});
els.attentionSelect.addEventListener("change", (event) => setAttention(event.target.value));
bindDetailEvents();
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside an answer only leaves the field; a second Escape closes.
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
  localStorage.setItem("busa-ideas-language", state.lang);
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
if (state.route.view === "ideas" && state.route.id) state.selectedIdeaId = state.route.id;
syncResponsiveShell();
boot();
