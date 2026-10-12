import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  deriveActivityLog,
  deriveReviewItems,
  normalizeDeckRow,
  normalizeExportRow,
  normalizeProjectRow,
  normalizeQaRow,
  normalizeSlideRow,
  normalizeStyleRow,
} from "./js/ppt-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/ppt-views.js";

// Where a record opens, per view. Chosen by what people do with the record:
//   projects → page:   a project is a workplace — it owns its decks and people
//                      stay on it while planning a batch.
//   decks    → page:   a deck owns its slide cards and QA evidence; reviewing
//                      a deliverable takes minutes, not a glance.
//   slides   → drawer: slide cards are scanned many at a time — read one,
//                      check its copy, move to the next row.
//   review   → split:  the review queue is worked top to bottom, one decision
//                      after the next, so the queue stays beside the record.
//   style    → drawer: a style kit is reference you glance at and return from.
//   exports  → drawer: an export is a log entry — path, status, QA summary.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

// Route → the paginated Base(s) it lists, for Load more and partial counts.
export const VIEW_BASES = {
  projects: ["projects"],
  decks: ["decks"],
  slides: ["slide-cards"],
  review: ["decks", "slide-cards"],
  style: ["style-systems"],
  exports: ["exports"],
};

const PAGE_TARGETS = {
  projects: { snapshotKey: "projects", idKey: "project_id", normalize: normalizeProjectRow },
  decks: { snapshotKey: "decks", idKey: "deck_id", normalize: normalizeDeckRow },
  "slide-cards": { snapshotKey: "slide_cards", idKey: "slide_id", normalize: normalizeSlideRow },
  "style-systems": { snapshotKey: "style_systems", idKey: "style_system_id", normalize: normalizeStyleRow },
  "qa-checks": { snapshotKey: "qa_checks", idKey: "check_id", normalize: normalizeQaRow },
  exports: { snapshotKey: "exports", idKey: "export_id", normalize: normalizeExportRow },
};

export const state = {
  data: null,
  route: parseRoute(),
  lang: "en",
  edits: {},
  notice: "",
  pagination: {},
  totalCount: {},
  workflowCount: {},
  reviewTotal: null,
  loadingMore: {},
  loadMoreError: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: emptyExtra(),
};

function emptyExtra() {
  return Object.fromEntries(RECORD_VIEWS.map((view) => [view, new Map()]));
}

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("searchInput"),
  attention: byId("attentionCount"),
  approved: byId("approvedCount"),
  ready: byId("readyCount"),
  syncStatus: byId("syncStatus"),
  mobileTitle: byId("mobileViewTitle"),
  mobileMeta: byId("mobileViewMeta"),
  sidebarToggle: byId("sidebarToggle"),
  scrim: byId("sidebarScrim"),
  langSelect: byId("languageSelect"),
};

// ── i18n ───────────────────────────────────────────────────────────────────
function pickLang() {
  const params = new URLSearchParams(location.search);
  const forced = params.get("lang") || localStorage.getItem("busa-ppt-factory-language") || "auto";
  if (forced.startsWith("zh") || (forced === "auto" && navigator.language.toLowerCase().startsWith("zh"))) return "zh";
  return "en";
}

export function t(key) {
  const parts = key.split(".");
  let value = messages[state.lang];
  for (const part of parts) value = value?.[part];
  if (value && typeof value === "object" && "_label" in value) return value._label;
  return value ?? key;
}

// An option value (status, stage, slide type, …) as words. Unknown values are
// humanized rather than printed as their raw `snake_case` id.
export function label(group, value) {
  if (!value) return "";
  const key = String(value);
  const known = messages[state.lang]?.[group]?.[key] ?? messages.en[group]?.[key];
  return typeof known === "string" ? known : key.replace(/[-_]+/g, " ");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

export function date(value, withTime = true) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString(state.lang === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  });
}

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
    id = parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
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

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list steps back to that exact list entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.selectedId !== state.route.selectedId || previous.view !== state.route.view) state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
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

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
export function snapshot() {
  return state.data?.snapshot || {};
}
export const projects = () => snapshot().projects || [];
export const decks = () => snapshot().decks || [];
export const slides = () => snapshot().slide_cards || [];
export const reviews = () => snapshot().review_items || [];
export const checks = () => snapshot().qa_checks || [];
export const exportsList = () => snapshot().exports || [];
export const styleSystems = () => snapshot().style_systems || [];

const VIEW_ROWS = {
  projects: [projects, "project_id"],
  decks: [decks, "deck_id"],
  slides: [slides, "slide_id"],
  review: [reviews, "review_id"],
  style: [styleSystems, "style_system_id"],
  exports: [exportsList, "export_id"],
};

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id || !VIEW_ROWS[view]) return null;
  const [rows, key] = VIEW_ROWS[view];
  return rows().find((item) => item[key] === id) || state.extra[view]?.get(id) || null;
}
export const projectById = (id) => recordById("projects", id);
export const deckById = (id) => recordById("decks", id);
export const slideById = (id) => recordById("slides", id);
export const reviewTarget = (item) =>
  item?.target_type === "slide" ? slideById(item.target_id) : deckById(item?.target_id);

// True while a view holds only part of its rows (another page exists).
export function isPartial(view) {
  return (VIEW_BASES[view] || []).some((key) => Boolean(state.pagination[key]));
}

// The nav total for a view: a real count when the provider has one, else the
// loaded rows marked `+` while more pages exist.
export function viewTotal(view) {
  const totals = {
    projects: state.totalCount.projects,
    decks: state.totalCount.decks,
    slides: state.totalCount["slide-cards"],
    review: state.reviewTotal,
    style: state.totalCount["style-systems"],
    exports: state.totalCount.exports,
  };
  if (totals[view] !== null && totals[view] !== undefined) return String(totals[view]);
  const [rows] = VIEW_ROWS[view];
  return `${rows().length}${isPartial(view) ? "+" : ""}`;
}

export async function loadState() {
  const provider = await getProvider();
  state.data = await provider.getState();
  state.pagination = state.data.pagination || {};
  state.totalCount = state.data.totalCount || {};
  state.workflowCount = state.data.workflowCount || {};
  state.reviewTotal = state.data.reviewTotal ?? null;
  state.extra = emptyExtra();
  closeConnectGate();
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-ppt-factory:state", { detail: state.data }));
  render();
  ensureSelectedRecord();
}

// Load more appends exactly one page of one Base, without duplicates.
export async function loadMore(key) {
  const cursor = state.pagination[key];
  const target = PAGE_TARGETS[key];
  if (!cursor || !target || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const current = snapshot()[target.snapshotKey] || [];
    const known = new Set(current.map((item) => item[target.idKey]));
    current.push(...page.rows.map(target.normalize).filter((item) => !known.has(item[target.idKey])));
    state.pagination[key] = page.nextCursor;
    snapshot().review_items = deriveReviewItems(decks(), slides());
    snapshot().activity_log = deriveActivityLog(decks(), slides());
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.data || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (recordById(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = await getProvider();
  if (typeof provider.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  try {
    if (view === "review") {
      // A review id is `<deck|slide>:<business id>`; read the row it sits on.
      const [kind, ...rest] = selectedId.split(":");
      const targetView = kind === "deck" ? "decks" : "slides";
      const row = await provider.getRecord(targetView, rest.join(":"));
      if (row) state.extra[targetView].set(rest.join(":"), row);
      const item = row
        ? deriveReviewItems(kind === "deck" ? [row] : [], kind === "deck" ? [] : [row]).find(
            (entry) => entry.review_id === selectedId,
          )
        : null;
      state.extra.review.set(selectedId, item || null);
    } else {
      state.extra[view].set(selectedId, (await provider.getRecord(view, selectedId)) || null);
    }
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (location.hash) return;
  const demo = new URLSearchParams(location.search).get("demo");
  if (!demo) return;
  const view = [...RECORD_VIEWS, "overview", "settings"].includes(demo) ? demo : "overview";
  history.replaceState(null, "", `${location.pathname}${location.search}#/${view}`);
  state.route = parseRoute();
}

// ── Shell ──────────────────────────────────────────────────────────────────
function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.getAttribute("data-i18n"));
  });
  els.search.placeholder = t("search");
  els.langSelect.value = localStorage.getItem("busa-ppt-factory-language") || "auto";
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function viewLabel(view) {
  const keys = {
    projects: "projects",
    decks: "decks",
    slides: "slideCards",
    review: "review",
    style: "styleSystem",
    exports: "exports",
    settings: "settings",
  };
  return t(keys[view] || "overview");
}

function renderShell() {
  applyI18n();
  const ready = Boolean(state.data);
  const items = reviews();
  const needs = items.filter((item) => ["needs_review", "changes_requested"].includes(item.status)).length;
  const approved = items.filter((item) => item.status === "approved").length;
  const readyDecks = decks().filter((item) => ["approved", "generated"].includes(item.status)).length;
  els.attention.textContent = String(state.workflowCount.needsReview ?? needs);
  els.approved.textContent = String(state.workflowCount.approved ?? approved);
  els.ready.textContent = String(state.workflowCount.ready ?? readyDecks);
  els.syncStatus.textContent = !ready ? t("loading") : state.data.demo ? t("demoData") : t("appSubtitle");
  document.querySelectorAll(".nav-count").forEach((node) => {
    node.textContent = ready ? viewTotal(node.dataset.count) : "";
  });
  document.querySelectorAll(".filters a").forEach((node) => {
    node.classList.toggle("active", node.dataset.route === state.route.view);
  });
  const { view } = state.route;
  els.mobileTitle.textContent = viewLabel(view);
  els.mobileMeta.textContent =
    ready && RECORD_VIEWS.includes(view)
      ? `${viewTotal(view)} · ${t("needsReview")} ${els.attention.textContent}`
      : ready
        ? `${t("needsReview")} ${els.attention.textContent}`
        : "";
}

export function statusBadge(status) {
  if (!status) return "";
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(label("status", status))}</span>`;
}

export function resultBadge(result) {
  return `<span class="badge status-${escapeHtml(result)}">${escapeHtml(label("result", result))}</span>`;
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data);
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

// ── Sidebar ────────────────────────────────────────────────────────────────
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-ppt-factory.sidebarCollapsed";
const isMobileLayout = () => window.matchMedia("(max-width: 720px)").matches;

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  els.scrim.hidden = !open;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function syncResponsiveShell() {
  setMobileSidebarOpen(false);
  if (isMobileLayout()) document.body.classList.remove("sidebar-collapsed");
  else setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const more = event.target.closest("[data-load-more]");
  if (more) {
    loadMore(more.dataset.loadMore);
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-review-note]");
  if (field) state.edits[`review:${field.dataset.reviewNote}`] = field.value;
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) submitDecision(button);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside the review note only leaves the field; a second one closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle.addEventListener("click", () => {
  if (isMobileLayout()) setMobileSidebarOpen(false);
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
});
byId("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
els.scrim.addEventListener("click", () => setMobileSidebarOpen(false));
els.langSelect.addEventListener("change", () => {
  localStorage.setItem("busa-ppt-factory-language", els.langSelect.value);
  state.lang = pickLang();
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

state.lang = pickLang();
els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
render();
boot();
