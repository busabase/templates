import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/lesson-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   plans  → page:   a lesson plan is a workplace of its own — objectives,
//                    timed stages, board plan, its checks and the dean's note —
//                    read for minutes, so it gets the whole screen.
//   checks → drawer: a check result is one fact among dozens; you read the
//                    evidence, maybe jump to the plan, and return to the list.
//   review → split:  the review queue is worked top to bottom, one plan after
//                    the next, so the queue stays beside the feedback draft.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const REVIEW_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
export const CHECK_RESULTS = ["pass", "warn", "fail", "agent_review"];

export const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Prev/Next pager. records.list only exposes a forward keyset cursor, so
  // pageCursors[key][i] is the cursor that fetches page i+1. Only neighbouring
  // pages are reachable — one click, one request; there is no "jump to page N"
  // because reaching it would mean reading every page in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { plans: new Map(), checks: new Map(), review: new Map() },
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-lesson-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-lesson.sidebarCollapsed";

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
  checkFilters: byId("checkFilters"),
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
  failedCount: byId("count-failed"),
  revisionCount: byId("count-revision"),
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
// `#/<view>[/<record>][?q=…&status=…&rule=…&teacher=…&result=…&peek=…]`.
// Search, the filters and the peeked record live in the URL so refresh, shared
// links and Back restore the same list context.
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
  const result = params.get("result") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: REVIEW_STATES.includes(status) ? status : "all",
    rule: params.get("rule") || "all",
    teacher: params.get("teacher") || "all",
    result: CHECK_RESULTS.includes(result) ? result : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "review" && route.status !== "all") params.set("status", route.status);
  if (route.view === "checks") {
    if (route.rule !== "all") params.set("rule", route.rule);
    if (route.teacher !== "all") params.set("teacher", route.teacher);
    if (route.result !== "all") params.set("result", route.result);
  }
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view) => ({ view, query: "", status: "all", rule: "all", teacher: "all", result: "all" });

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
// changes should not each become a Back step.
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
  state.extra = { plans: new Map(), checks: new Map(), review: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-lesson:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

// The real total (records.count) behind "Page 2 of 5"; null when unknown.
export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything tallied from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
async function goToPage(key, targetPage) {
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
    // fetchPage already ran the same per-row normalizer page 1 went through.
    state.snapshot[key] = rows;
    if (key === "plans") state.snapshot.review_items = rows.map(reviewItemFor);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A review item is its plan's own fields (see lesson-model.js planToReviewItem).
function reviewItemFor(plan) {
  return {
    review_id: plan.plan_id,
    ref: plan.ref,
    plan_id: plan.plan_id,
    status: plan.status,
    compliance_summary: plan.compliance_summary,
    suggestions: plan.suggestions,
    feedback_draft: plan.feedback_draft,
    created_at: plan.created_at,
  };
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
    state.extra[view].set(selectedId, row ? (view === "review" ? reviewItemFor(row) : row) : null);
    if (row && view === "review") state.extra.plans.set(selectedId, row);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "plans"
      ? "#/plans"
      : scenario === "checks"
        ? "#/checks"
        : scenario === "review"
          ? "#/review"
          : scenario === "detail"
            ? "#/plans/plan-math-linear-eq"
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

export function plans() {
  return state.snapshot?.plans || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

export function rules() {
  return state.snapshot?.rules || [];
}

export function reviewItems() {
  return state.snapshot?.review_items || [];
}

export function teachers() {
  return state.snapshot?.teachers || [];
}

const ID_FIELD = { plans: "plan_id", checks: "check_id", review: "review_id" };
const ROWS = { plans, checks, review: reviewItems };

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id) {
  if (!id) return null;
  return ROWS[view]().find((item) => item[ID_FIELD[view]] === id) || state.extra[view]?.get(id) || null;
}

export function planById(planId) {
  return recordById("plans", planId);
}

export function teacherById(teacherId) {
  return teachers().find((item) => item.teacher_id === teacherId) || null;
}

export function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

// A plan reference is a business id (`plan-…`). Resolve it to the plan's
// title; when the plan is not on the loaded page, say so — never print the id.
export function planLabel(planId) {
  const plan = planById(planId);
  if (!plan) return t("notLoaded");
  return `${t("planRef")} #${plan.ref} · ${plan.title}`;
}

export function teacherName(teacherId) {
  if (!teacherId) return "";
  return teacherById(teacherId)?.name || t("notLoaded");
}

export function ruleName(ruleId) {
  return ruleById(ruleId)?.name || enumLabel(ruleId, "rule");
}

// Exact counts (records.count) from the provider; "—" when unavailable.
export function exactCount(key) {
  const value = state.settings?.counts?.[key];
  return typeof value === "number" ? value : null;
}

const shown = (value, suffix = "") => (value == null ? "—" : `${value}${suffix}`);

function renderShell() {
  applyI18n();
  const review = exactCount("plans_needs_review");
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : state.settings?.demo
      ? t("demoData")
      : state.snapshot.school?.name || t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = shown(review);
  if (els.failedCount) els.failedCount.textContent = shown(exactCount("checks_fail"));
  if (els.revisionCount) els.revisionCount.textContent = shown(exactCount("plans_changes_requested"));
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review
      ? `${review} ${t("awaitingReview")}`
      : `${shown(exactCount("plans"))} ${t("plansLower")}`;
  }
  document.querySelectorAll("nav [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "plans") return t("plans");
  if (view === "checks") return t("checks");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

export function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings(planId = "") {
  const items = (state.snapshot?.warnings || []).filter((item) => !planId || !item.plan_id || item.plan_id === planId);
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

export function filteredPlans() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return plans();
  return plans().filter((item) =>
    matches(
      [item.title, item.subject, item.grade, item.unit, enumLabel(item.source, "source"), enumLabel(item.status), teacherById(item.teacher_id)?.name],
      query,
    ),
  );
}

export function filteredChecks() {
  const { query: rawQuery, rule, teacher, result } = state.route;
  const query = rawQuery.trim().toLowerCase();
  return checks().filter((item) => {
    if (rule !== "all" && item.rule_id !== rule) return false;
    const plan = planById(item.plan_id);
    if (teacher !== "all" && plan?.teacher_id !== teacher) return false;
    if (result !== "all" && item.result !== result) return false;
    if (!query) return true;
    return matches(
      [ruleById(item.rule_id)?.name, item.evidence, enumLabel(item.result, "result"), plan?.title, teacherById(plan?.teacher_id)?.name],
      query,
    );
  });
}

export function filteredReviewItems() {
  const query = state.route.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    const plan = planById(item.plan_id);
    return matches(
      [
        plan?.title,
        plan?.subject,
        plan?.grade,
        item.compliance_summary,
        item.feedback_draft,
        enumLabel(item.status),
        teacherById(plan?.teacher_id)?.name,
      ],
      query,
    );
  });
}

export function reviewStates() {
  return REVIEW_STATES;
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
const withStatus = (status) =>
  replaceRoute(`#/review${routeQuery({ peek: state.route.peek }, { ...state.route, status })}`);
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (segment) withStatus(segment.dataset.status);
});
els.statusSelect.addEventListener("change", (event) => withStatus(event.target.value));
els.checkFilters.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-filter]");
  if (!select) return;
  const next = { ...state.route, [select.dataset.filter]: select.value };
  replaceRoute(`#/checks${routeQuery({ peek: state.route.peek }, next)}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-field]");
  if (!field) return;
  const review = field.closest("[data-review]")?.dataset.review;
  if (review) state.edits[review] = { ...state.edits[review], [field.dataset.field]: field.value };
  const plan = field.closest("[data-plan-note]")?.dataset.planNote;
  if (plan) state.edits[`note:${plan}`] = field.value;
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const review = button.closest("[data-review]");
  if (review) {
    const draft = review.querySelector('[data-field="draft"]')?.value ?? "";
    const note = review.querySelector('[data-field="note"]')?.value ?? "";
    submitDecision(review.dataset.review, button.dataset.action, { comment: note, draft });
    return;
  }
  const notes = button.closest("[data-plan-note]");
  if (notes) {
    // A "revise" only resaves the plan's decision_note; it never changes status.
    const note = notes.querySelector('[data-field="note"]')?.value ?? "";
    submitDecision(notes.dataset.planNote, "revise", { comment: note });
  }
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
  localStorage.setItem("busa-lesson-language", state.lang);
  // The demo's copy is localized at build time, so a language switch rebuilds it.
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
