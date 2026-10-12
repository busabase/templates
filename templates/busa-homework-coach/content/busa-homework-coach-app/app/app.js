import { messages, resolveLanguage } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
} from "./js/homework-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// ── Views ──────────────────────────────────────────────────────────────────
// `#/student` is the Overview (the student desk): the only page with a hero and
// a metrics band. Every other view is one toolbar row over a full-bleed table.
// Each record view maps onto one Base; where its record opens is declared per
// Base in config.js `ui.detail_modes` (the reasons are written there):
//   questions → page, mistakes → drawer, papers → page, reviews → split.
// A `/<record>` path always opens the full page; `?peek=<record>` drives the
// drawer and the split. On a phone every mode is a page (base-ui.css).
const VIEW_BASE = { questions: "questions", mistakes: "mistakes", papers: "papers", review: "reviews" };
const RECORD_VIEWS = Object.keys(VIEW_BASE);
const DETAIL_MODES = Object.fromEntries(
  RECORD_VIEWS.map((view) => [view, appConfig.ui?.detail_modes?.[VIEW_BASE[view]] || "drawer"]),
);
const REVIEW_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

const PAGE_TARGETS = {
  questions: { snapshotKey: "questions", idKey: "question_id", normalize: computeQuestionFromRow },
  mistakes: { snapshotKey: "mistakes", idKey: "mistake_id", normalize: computeMistakeFromRow },
  papers: { snapshotKey: "papers", idKey: "paper_id", normalize: computePaperFromRow },
  reviews: { snapshotKey: "review_items", idKey: "review_id", normalize: computeReviewFromRow },
};
const ID_KEY = { questions: "question_id", mistakes: "mistake_id", papers: "paper_id", review: "review_id" };
const SNAPSHOT_KEY = { questions: "questions", mistakes: "mistakes", papers: "papers", review: "review_items" };

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  statusSelect: byId("statusSelect"),
  search: byId("search"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  detailActions: byId("detailActions"),
  detailNotice: byId("detailNotice"),
  detailBody: byId("detailBody"),
  attention: byId("attention"),
  nav: byId("nav"),
  mobileTitle: byId("mobileTitle"),
  modalRoot: byId("modalRoot"),
  scrim: byId("sidebarScrim"),
};

const state = {
  data: null,
  route: parseRoute(),
  lang: resolveLanguage(),
  settingsTab: "guide",
  localPhotoName: "",
  busy: false,
  notice: "",
  pagination: {},
  totalCount: {},
  workflowCount: null,
  readErrors: {},
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { questions: new Map(), mistakes: new Map(), papers: new Map(), review: new Map() },
  // Where Settings returns to when it is closed.
  lastHash: "#/student",
};

function t(key) {
  return messages[state.lang]?.[key] || messages.en[key] || key;
}

function enumLabel(group, value) {
  if (!value) return "";
  return (
    messages[state.lang]?.enum?.[group]?.[value] ||
    messages.en.enum?.[group]?.[value] ||
    String(value).replaceAll("_", " ")
  );
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the review status
// filter and the peeked record live in the URL, so refresh, shared links and
// Back restore the same list context.
function parseRoute() {
  const raw = (window.location.hash || "#/student").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "student";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  // `#/student/<question>` predates the Questions view; it is that question's page.
  if (view === "student" && id) view = "questions";
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "student";
  if (view === "student" || view === "settings") id = "";
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
    status: REVIEW_STATES.includes(status) ? status : "all",
  };
}

function routeQuery(extra = {}, route = state.route) {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "review" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const blankRoute = (view) => ({ view, query: "", status: "all" });
const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path, whatever the view's mode.
function detailUrl(id, view = state.route.view) {
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
}
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
function recordUrl(id, view = state.route.view) {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}${routeQuery({ peek: id }, route)}`;
}

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list marks its history entry, so Back, Close
  // and Escape step back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (state.route.view !== "settings") state.lastHash = window.location.hash || "#/student";
  state.notice = "";
  els.search.value = state.route.query;
  setSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// clicks should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  state.lastHash = url;
  previousRouteWasList = previousWasList;
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else window.location.hash = listUrl();
}

// `?demo=<scenario>` picks the first route when the URL names none.
function applyDemoRoute() {
  if (!state.data?.demo || window.location.hash) return;
  const scenario = state.data.demo_scenario;
  const route = ["questions", "mistakes", "papers", "review"].includes(scenario) ? `#/${scenario}` : "#/student";
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${route}`);
  state.route = parseRoute();
  state.lastHash = route;
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  if (els.scrim) els.scrim.hidden = !open;
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  return ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName) && active.type !== "search";
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState({ quiet = false } = {}) {
  if (isEditing() && quiet) return;
  if (quiet && state.hasLoadedMore) return;
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.data = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || null;
  state.readErrors = data.readErrors || {};
  if (!quiet) {
    state.hasLoadedMore = false;
    state.extra = { questions: new Map(), mistakes: new Map(), papers: new Map(), review: new Map() };
  }
  window.dispatchEvent(new CustomEvent("busa-homework-coach:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function collection(view) {
  return state.data?.snapshot?.[SNAPSHOT_KEY[view]] || [];
}

// Loaded page first, then a record fetched on its own for the URL.
function recordById(view, id) {
  if (!id || !SNAPSHOT_KEY[view]) return null;
  return collection(view).find((item) => item[ID_KEY[view]] === id) || state.extra[view]?.get(id) || null;
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
    state.extra[view].set(selectedId, (await provider.getRecord(VIEW_BASE[view], selectedId)) || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

async function loadMore(key) {
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
    const current = state.data.snapshot[target.snapshotKey];
    const known = new Set(current.map((item) => item[target.idKey]));
    current.push(...page.rows.map(target.normalize).filter((item) => !known.has(item[target.idKey])));
    state.pagination[key] = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

function statusCounts(items) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 },
  );
}

function workflowCounts() {
  return state.workflowCount || statusCounts(collection("review"));
}

function totalFor(key, loaded) {
  return state.totalCount[key] ?? `${loaded}${state.pagination[key] ? "+" : ""}`;
}

// ── Badges ─────────────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    needs_review: ["warning", t("needsReview")],
    changes_requested: ["warning", t("changesRequested")],
    approved: ["active", t("ready")],
    done: ["positive", t("done")],
    blocked: ["danger", t("blocked")],
  };
  const [kind, label] = map[status] || ["", enumLabel("status", status)];
  return `<span class="badge ${kind}">${esc(label)}</span>`;
}

function outcomeBadge(outcome) {
  const map = {
    correct: ["positive", t("correct")],
    wrong: ["danger", t("wrong")],
    uncertain: ["warning", t("uncertain")],
    in_progress: ["active", t("inProgress")],
  };
  const [kind, label] = map[outcome] || ["", enumLabel("outcome", outcome)];
  return `<span class="badge ${kind}">${esc(label)}</span>`;
}

const tag = (text) => (text ? `<span class="tag">${esc(text)}</span>` : "");

// ── Shell ──────────────────────────────────────────────────────────────────
function viewLabel(view) {
  return (
    {
      student: t("overview"),
      questions: t("questions"),
      mistakes: t("mistakes"),
      papers: t("papers"),
      review: t("review"),
      settings: t("settings"),
    }[view] || t("overview")
  );
}

function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-HK" : "en";
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  els.search.placeholder = t("search");
  els.detailExpand.textContent = t("openFullPage");
}

function renderSidebar() {
  const snapshot = state.data.snapshot || {};
  const counts = workflowCounts();
  const due = snapshot.metrics?.due_reviews || 0;
  const cell = (href, value, label) =>
    `<a class="attention-metric" href="${href}"><b>${esc(value)}</b><span>${esc(label)}</span></a>`;
  els.attention.innerHTML = [
    cell("#/review?status=needs_review", counts.needs_review + counts.changes_requested, t("needsReview")),
    cell("#/review?status=approved", counts.approved, t("readyForAgent")),
    cell("#/mistakes", due, t("dueReviews")),
    cell("#/review?status=blocked", counts.blocked, t("blockedCount")),
  ].join("");
  const navItem = (view, count) => {
    const active = state.route.view === view ? " active" : "";
    return `<a class="nav-link${active}" href="#/${view}"><span>${esc(viewLabel(view))}</span>${count === null ? "" : `<small>${esc(count)}</small>`}</a>`;
  };
  els.nav.innerHTML = [
    navItem("student", null),
    navItem("questions", totalFor("questions", collection("questions").length)),
    navItem("mistakes", totalFor("mistakes", collection("mistakes").length)),
    navItem("papers", totalFor("papers", collection("papers").length)),
    navItem("review", totalFor("reviews", collection("review").length)),
  ].join("");
  for (const button of document.querySelectorAll('.sidebar-footer [data-route="settings"]')) {
    button.classList.toggle("active", state.route.view === "settings");
  }
  els.mobileTitle.textContent = viewLabel(state.route.view);
}

function render() {
  if (!state.data) return;
  state.lang = resolveLanguage();
  applyI18n();
  renderSidebar();
  const { view, selectedId, presentation } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = true;
  els.overviewPage.hidden = onRecordView;
  els.viewPage.hidden = !onRecordView;
  if (onRecordView) renderRecordView();
  else renderOverview();
  els.modalRoot.innerHTML = view === "settings" ? renderSettingsModal() : "";
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show: mastery and the all-time
// analyzed count (authored on the settings row) and the questions still open.
function renderOverview() {
  const snapshot = state.data.snapshot || {};
  const metrics = snapshot.metrics || {};
  const profile = snapshot.profile || {};
  const questions = collection("questions");
  const current = questions.find((item) => item.status !== "done") || null;
  const waiting = collection("review")
    .filter((item) => ["needs_review", "changes_requested"].includes(item.status))
    .slice(0, 5);
  const context = [profile.display_name, profile.grade].filter(Boolean).join(" · ");
  els.overviewPage.innerHTML = `
    <header class="page-hero">
      <div>
        ${context ? `<div class="page-hero-context">${esc(context)}</div>` : ""}
        <h1>${esc(t("overview"))}</h1>
        <p>${esc(t("overviewLead"))}</p>
      </div>
    </header>
    <div class="ws-metrics" aria-label="${esc(t("overview"))}">
      <div><span>${esc(t("mastery"))}</span><strong>${esc(metrics.mastery_score || 0)}%</strong></div>
      <div><span>${esc(t("analyzed"))}</span><strong>${esc(metrics.questions_analyzed || 0)}</strong></div>
      <div><span>${esc(t("activeQuestions"))}</span><strong>${esc(metrics.active_questions || 0)}</strong></div>
    </div>
    ${(snapshot.warnings || []).map((item) => `<div class="notice-banner">${esc(item.message)}</div>`).join("")}
    <section class="overview-grid">
      <div class="card overview-card">
        ${renderPhotoBox()}
      </div>
      <div class="card overview-card">
        <h2>${esc(t("currentQuestion"))}</h2>
        ${
          current
            ? `<div class="current-question">
                <div class="tags">${statusBadge(current.status)}${outcomeBadge(current.outcome)}${tag(current.subject)}</div>
                <strong>${esc(current.title)}</strong>
                <p class="note">${esc(current.explanation?.kid_summary || current.prompt_text || "")}</p>
                <a class="button" href="${detailUrl(current.question_id, "questions")}">${esc(t("openQuestion"))}</a>
              </div>`
            : `<p class="note">${esc(t("noCurrentQuestion"))}</p>`
        }
      </div>
      <div class="card overview-card">
        <div class="overview-card-head">
          <h2>${esc(t("waitingDecision"))}</h2>
          <a href="#/review">${esc(t("viewAll"))}</a>
        </div>
        ${
          waiting.length
            ? waiting
                .map(
                  (item) => `
              <a class="due-row" href="${recordUrl(item.review_id, "review")}">
                <span>${esc(item.title)}</span>
                ${statusBadge(item.status)}
              </a>`,
                )
                .join("")
            : `<p class="note">${esc(t("nothingWaiting"))}</p>`
        }
      </div>
    </section>
  `;
}

function renderPhotoBox() {
  return `
    <div class="photo-box">
      <div class="overview-card-head">
        <h2>${esc(t("photoDesk"))}</h2>
        <span class="badge active">${esc(t("selectedOnly"))}</span>
      </div>
      <input type="file" accept="image/*" data-local-photo />
      <p class="note">${esc(state.localPhotoName || t("localPhoto"))}</p>
      <button class="button primary" data-copy-prompt="photo" type="button">${esc(t("askAgent"))}</button>
    </div>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { questions: "questionsHint", mistakes: "mistakesHint", papers: "papersHint", review: "reviewHint" };

function matchesQuery(item, query) {
  return JSON.stringify(item).toLowerCase().includes(query);
}

function filteredItems(view) {
  let items = collection(view);
  if (view === "review" && state.route.status !== "all") {
    items = items.filter((item) => item.status === state.route.status);
  }
  const query = state.route.query.trim().toLowerCase();
  return query ? items.filter((item) => matchesQuery(item, query)) : items;
}

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${esc(title)}"` : ""}>${html}</td>`;
const head = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${esc(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) => `<tr data-id="${esc(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const strong = (text) => `<span class="cell-strong">${esc(text)}</span>`;

function questionsTable(items) {
  return `<table class="ws-table">
    ${head([[t("question")], [t("subject"), "ws-col-narrow"], [t("topic"), "ws-col-wide"], [t("difficulty"), "ws-col-narrow"], [t("outcome")], [t("status")]])}
    <tbody>${items
      .map(
        (item) => `${rowOpen(item.question_id)}
        ${cell(strong(item.title), item.title)}
        ${cell(esc(item.subject), item.subject, "ws-col-narrow")}
        ${cell(esc(item.topic), item.topic)}
        ${cell(esc(enumLabel("difficulty", item.difficulty)))}
        ${cell(outcomeBadge(item.outcome))}
        ${cell(statusBadge(item.status))}
      </tr>`,
      )
      .join("")}</tbody></table>`;
}

function mistakesTable(items) {
  return `<table class="ws-table">
    ${head([[t("mistakeType")], [t("subject"), "ws-col-narrow"], [t("topic"), "ws-col-wide"], [t("attempts"), "ws-col-num"], [t("nextReview")], [t("status")]])}
    <tbody>${items
      .map(
        (item) => `${rowOpen(item.mistake_id)}
        ${cell(strong(item.mistake_type || item.topic), item.mistake_type)}
        ${cell(esc(item.subject), item.subject)}
        ${cell(esc(item.topic), item.topic)}
        ${cell(esc(item.attempts), "", "ws-col-num")}
        ${cell(esc(item.next_review_at || "—"))}
        ${cell(statusBadge(item.status))}
      </tr>`,
      )
      .join("")}</tbody></table>`;
}

function papersTable(items) {
  return `<table class="ws-table">
    ${head([[t("paper")], [t("subject"), "ws-col-narrow"], [t("questionCount"), "ws-col-num"], [t("minutes"), "ws-col-num"], [t("focus"), "ws-col-wide"], [t("status")]])}
    <tbody>${items
      .map((item) => {
        const focus = (item.focus_topics || []).join(", ");
        return `${rowOpen(item.paper_id)}
        ${cell(strong(item.title), item.title)}
        ${cell(esc(item.subject), item.subject)}
        ${cell(esc(item.question_count), "", "ws-col-num")}
        ${cell(esc(item.estimated_minutes), "", "ws-col-num")}
        ${cell(esc(focus), focus)}
        ${cell(statusBadge(item.status))}
      </tr>`;
      })
      .join("")}</tbody></table>`;
}

function reviewTable(items) {
  return `<table class="ws-table">
    ${head([[t("item")], [t("status")], [t("targetType"), "ws-col-narrow"], [t("proposedAction")]])}
    <tbody>${items
      .map(
        (item) => `${rowOpen(item.review_id)}
        ${cell(strong(item.title), item.title)}
        ${cell(statusBadge(item.status))}
        ${cell(esc(enumLabel("target", item.target_type)))}
        ${cell(esc(enumLabel("action", item.proposed_action)))}
      </tr>`,
      )
      .join("")}</tbody></table>`;
}

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button class="button" type="button" data-load-more="${esc(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${esc(state.loadingMore[key] ? t("loadingMore") : t("loadMore"))}</button>${state.loadMoreError[key] ? `<span role="alert">${esc(t("loadMoreFailed"))}</span>` : ""}</div>`;
}

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ""}</div>`;

function reviewStateCount(value) {
  const counts = workflowCounts();
  if (value === "all") return totalFor("reviews", collection("review").length);
  return counts[value] ?? 0;
}

function reviewStateLabel(value) {
  return value === "all" ? t("all") : value === "changes_requested" ? t("changesRequested") : statusLabel(value);
}

function statusLabel(value) {
  return { needs_review: t("needsReview"), approved: t("ready"), done: t("done"), blocked: t("blocked") }[value] || value;
}

function renderRecordView() {
  const { view } = state.route;
  const key = VIEW_BASE[view];
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredItems(view);
  els.viewCount.textContent = `${items.length}${state.pagination[key] ? "+" : ""}`;
  const isReview = view === "review";
  els.viewFilters.hidden = !isReview;
  els.statusSelect.hidden = !isReview;
  if (isReview) {
    els.viewFilters.innerHTML = REVIEW_STATES.map(
      (value) =>
        `<button type="button" class="segment${state.route.status === value ? " active" : ""}" data-status="${value}">${esc(reviewStateLabel(value))} <b>${esc(reviewStateCount(value))}</b></button>`,
    ).join("");
    els.statusSelect.innerHTML = REVIEW_STATES.map(
      (value) =>
        `<option value="${value}"${state.route.status === value ? " selected" : ""}>${esc(reviewStateLabel(value))} (${esc(reviewStateCount(value))})</option>`,
    ).join("");
  }
  const table =
    view === "questions"
      ? questionsTable(items)
      : view === "mistakes"
        ? mistakesTable(items)
        : view === "papers"
          ? papersTable(items)
          : reviewTable(items);
  const empty = state.readErrors[key]
    ? emptyState(t("readFailed"), state.readErrors[key])
    : emptyState(state.route.query ? t("noMatches") : t("noItems"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${loadMoreControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobile() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  els.detailNotice.innerHTML = state.notice ? `<div class="notice-banner" role="status">${esc(state.notice)}</div>` : "";
  if (!selectedId) {
    els.detailActions.innerHTML = "";
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${esc(t("selectReview"))}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    els.detailActions.innerHTML = "";
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<p class="note">${esc(t("loading"))}</p>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailActions.innerHTML = view === "review" ? reviewActions(item) : recordActions(view, item);
  els.detailBody.innerHTML =
    view === "mistakes"
      ? renderMistake(item)
      : view === "papers"
        ? renderPaper(item)
        : view === "review"
          ? renderReviewItem(item)
          : renderQuestion(item);
}

function recordActions(view, item) {
  if (view !== "questions") {
    // A mistake or paper is decided in the review queue: link to its review
    // item when it is loaded, else to the queue itself.
    const review = nearestReviewForTarget(item[ID_KEY[view]]);
    const href = review ? recordUrl(review.review_id, "review") : "#/review";
    return `<a class="button${view === "papers" ? " primary" : ""}" href="${href}">${esc(t("review"))}</a>`;
  }
  const disabled = state.busy ? " disabled" : "";
  return `
    <button class="button primary" data-understand="${esc(item.question_id)}" type="button"${disabled}>${esc(t("iUnderstand"))}</button>
    <button class="button" data-need-help="${esc(item.question_id)}" type="button"${disabled}>${esc(t("stillNeedHelp"))}</button>
  `;
}

function reviewActions(item) {
  const disabled = state.busy ? " disabled" : "";
  return `
    <button class="button primary" data-decision-action="approve" data-review-id="${esc(item.review_id)}" type="button"${disabled}>${esc(t("approve"))}</button>
    <button class="button" data-decision-action="request_changes" data-review-id="${esc(item.review_id)}" type="button"${disabled}>${esc(t("requestChanges"))}</button>
    <button class="button danger" data-decision-action="block" data-review-id="${esc(item.review_id)}" type="button"${disabled}>${esc(t("block"))}</button>
  `;
}

// `level` lets the review queue embed a target without a second page title.
function renderQuestion(question, level = "h2") {
  return `
    <section class="hero-answer">
      <div class="tags">${statusBadge(question.status)}${outcomeBadge(question.outcome)}${tag(question.subject)}${tag(question.topic)}</div>
      <${level} class="question-title">${esc(question.title)}</${level}>
      <p>${esc(question.prompt_text)}</p>
      <div class="answer-grid">
        <div class="answer-box"><span>${esc(t("studentAnswer"))}</span><b>${esc(question.student_answer)}</b></div>
        <div class="answer-box"><span>${esc(t("correctAnswer"))}</span><b>${esc(question.correct_answer)}</b></div>
      </div>
      <p class="note">${esc(question.explanation?.kid_summary || "")}</p>
    </section>
    <section class="section">
      <h3>${esc(t("gentleSteps"))}</h3>
      <ol class="step-list">
        ${(question.explanation?.steps || []).map((step, index) => `<li><span class="step-num">${index + 1}</span><span>${esc(step)}</span></li>`).join("")}
      </ol>
    </section>
    ${infoSection(t("keyConcept"), question.explanation?.key_concept)}
    ${infoSection(t("selfCheck"), question.explanation?.self_check)}
    ${infoSection(t("nextHint"), question.explanation?.next_hint)}
  `;
}

function renderMistake(mistake, level = "h2") {
  return `
    <section class="hero-answer">
      <div class="tags">${statusBadge(mistake.status)}${tag(mistake.subject)}${tag(`${t("attempts")}: ${mistake.attempts}`)}</div>
      <${level} class="question-title">${esc(mistake.mistake_type || mistake.topic)}</${level}>
      <p>${esc(t("topic"))}: ${esc(mistake.topic)} · ${esc(t("due"))}: ${esc(mistake.next_review_at || "—")}</p>
    </section>
    ${infoSection(t("rootCause"), mistake.analysis?.root_cause)}
    ${infoSection(t("misconception"), mistake.analysis?.misconception)}
    ${infoSection(t("fixStrategy"), mistake.analysis?.fix_strategy)}
    ${infoSection(t("similarPrompt"), mistake.analysis?.similar_prompt)}
    ${infoSection(t("parentNote"), mistake.analysis?.parent_note)}
  `;
}

function renderPaper(paper, level = "h2") {
  const focus = (paper.focus_topics || []).join(", ");
  return `
    <section class="hero-answer">
      <div class="tags">${statusBadge(paper.status)}${tag(paper.subject)}${tag(`${paper.estimated_minutes} ${t("minutes")}`)}</div>
      <${level} class="question-title">${esc(paper.title)}</${level}>
      <dl class="fact-grid">
        <div><dt>${esc(t("questionCount"))}</dt><dd>${esc(paper.question_count)}</dd></div>
        <div><dt>${esc(t("wrongCount"))}</dt><dd>${esc(paper.analysis?.wrong_count || 0)}</dd></div>
        <div><dt>${esc(t("focus"))}</dt><dd>${esc(focus || "—")}</dd></div>
      </dl>
    </section>
    <section class="section">
      <h3>${esc(t("items"))}</h3>
      <ol class="info-list">${(paper.items || []).map((entry) => `<li>${esc(entry)}</li>`).join("")}</ol>
    </section>
    ${listSection(t("strengths"), paper.analysis?.strengths)}
    ${listSection(t("reviewPlan"), paper.analysis?.review_plan)}
    ${infoSection(t("deepNotes"), paper.analysis?.deep_notes)}
  `;
}

function renderReviewItem(item) {
  const target = findTarget(item);
  const decision = item.decision;
  const targetView = { question: "questions", mistake: "mistakes", paper: "papers" }[item.target_type];
  return `
    <section class="hero-answer">
      <div class="tags">${statusBadge(item.status)}${(item.risk || []).map((risk) => `<span class="badge warning">${esc(risk)}</span>`).join("")}</div>
      <h2 class="question-title">${esc(item.title)}</h2>
      <p>${esc(item.summary)}</p>
      <div class="answer-grid">
        <div class="answer-box"><span>${esc(t("proposedAction"))}</span><b>${esc(enumLabel("action", item.proposed_action))}</b></div>
        <div class="answer-box"><span>${esc(t("reason"))}</span><p>${esc(item.reason)}</p></div>
      </div>
    </section>
    ${listSection(t("suggestions"), item.suggestions)}
    ${infoSection(t("suggestedNote"), item.suggested_note)}
    <section class="section">
      <h3><label for="reviewNote">${esc(t("reviewNote"))}</label></h3>
      <div class="field">
        <textarea id="reviewNote">${esc(decision?.comment || item.suggested_note || "")}</textarea>
      </div>
    </section>
    ${
      targetView && item.target_id
        ? `<section class="section target-section">
            <div class="overview-card-head">
              <h3>${esc(t("target"))} · ${esc(enumLabel("target", item.target_type))}</h3>
              <a href="${recordUrl(item.target_id, targetView)}">${esc(t("openTarget"))}</a>
            </div>
            ${target ? targetSummary(target, item.target_type) : `<p class="note">${esc(t("notLoaded"))}</p>`}
          </section>`
        : ""
    }
  `;
}

function findTarget(item) {
  if (item.target_type === "question") return recordById("questions", item.target_id);
  if (item.target_type === "mistake") return recordById("mistakes", item.target_id);
  if (item.target_type === "paper") return recordById("papers", item.target_id);
  return null;
}

function targetSummary(target, type) {
  if (type === "question") return renderQuestion(target, "h3");
  if (type === "mistake") return renderMistake(target, "h3");
  return renderPaper(target, "h3");
}

function infoSection(title, body) {
  if (!body) return "";
  return `<section class="section"><h3>${esc(title)}</h3><ul class="info-list"><li>${esc(body)}</li></ul></section>`;
}

function listSection(title, items = []) {
  if (!items.length) return "";
  return `<section class="section"><h3>${esc(title)}</h3><ul class="info-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>`;
}

// ── Settings ───────────────────────────────────────────────────────────────
function renderSettingsModal() {
  const config = state.data.config_summary || {};
  const tabs = ["guide", "policy", "language"];
  return `
    <div class="modal-backdrop" data-close-settings>
      <section class="modal" role="dialog" aria-modal="true" aria-label="${esc(t("settings"))}" data-modal>
        <header class="modal-head">
          <h2>${esc(t("settings"))}</h2>
          <button class="button" data-close-settings-button type="button">${esc(t("close"))}</button>
        </header>
        <nav class="modal-tabs segmented">
          ${tabs.map((tab) => `<button class="segment${state.settingsTab === tab ? " active" : ""}" data-settings-tab="${tab}" type="button">${esc(settingsTabLabel(tab))}</button>`).join("")}
        </nav>
        <div class="modal-body">
          ${settingsTab(config)}
        </div>
      </section>
    </div>
  `;
}

function settingsTabLabel(tab) {
  return { guide: t("guide"), policy: t("policy"), language: t("language") }[tab] || tab;
}

function settingsTab(config) {
  if (state.settingsTab === "policy") {
    return `
      <section class="settings-card">
        ${settingsRow(t("answerPolicy"), config.learning_policy?.answer_policy)}
        ${settingsRow(t("tone"), config.learning_policy?.tone)}
        ${settingsRow(t("storeRawPhotos"), String(config.learning_policy?.store_raw_photos))}
        ${settingsRow(t("exportApproval"), String(config.learning_policy?.parent_review_required_for_exports))}
      </section>
    `;
  }
  if (state.settingsTab === "language") {
    return `<section class="settings-card">${languagePicker()}</section>`;
  }
  return `
    <section class="settings-card">
      ${settingsRow(t("studentName"), config.student_profile?.display_name || state.data.snapshot?.profile?.display_name)}
      ${settingsRow(t("grade"), config.student_profile?.grade || state.data.snapshot?.profile?.grade)}
      ${settingsRow(t("subjects"), (config.subjects || []).join(", "))}
      ${settingsRow(t("dataProvider"), state.data.data_provider)}
    </section>
  `;
}

function settingsRow(label, value) {
  return `<div class="settings-row"><strong>${esc(label)}</strong><span>${esc(value ?? "")}</span></div>`;
}

function languagePicker() {
  const saved = localStorage.getItem("khc-language") || "auto";
  return `
    <div class="language-picker">
      <button class="button${saved === "auto" ? " primary" : ""}" data-lang="auto" type="button">${esc(t("auto"))}</button>
      <button class="button${saved === "en" ? " primary" : ""}" data-lang="en" type="button">${esc(t("english"))}</button>
      <button class="button${saved === "zh" ? " primary" : ""}" data-lang="zh" type="button">${esc(t("chinese"))}</button>
    </div>
  `;
}

function closeSettings() {
  window.location.hash = state.lastHash && !state.lastHash.startsWith("#/settings") ? state.lastHash : "#/student";
}

// ── Writes ─────────────────────────────────────────────────────────────────
async function submitDecision(payload) {
  if (state.data?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.submitReview(payload);
    await loadState();
    state.notice = t("saved");
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function nearestReviewForTarget(targetId) {
  return collection("review").find((item) => item.target_id === targetId);
}

async function decideForQuestion(questionId, action, comment) {
  const review = nearestReviewForTarget(questionId);
  if (!review) {
    state.notice = t("noReviewForQuestion");
    render();
    return;
  }
  await submitDecision({ review_id: review.review_id, action, comment });
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
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
    window.location.hash = url;
  }
});

els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target instanceof Element ? event.target.closest("[data-status]") : null;
  if (!segment) return;
  replaceRoute(`#/review${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});

els.statusSelect.addEventListener("change", () => {
  replaceRoute(`#/review${routeQuery({ peek: state.route.peek }, { ...state.route, status: els.statusSelect.value })}`);
});

els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});

els.detailBack.addEventListener("click", closeDetail);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.route.view === "settings") {
    closeSettings();
    return;
  }
  // Escape inside a note only leaves the field; a second Escape closes.
  if (event.target instanceof Element && event.target.closest("textarea, input, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target === els.scrim) {
    setSidebarOpen(false);
    return;
  }
  if (event.target.matches("[data-close-settings]")) {
    closeSettings();
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.loadMore) {
    await loadMore(button.dataset.loadMore);
    return;
  }
  if (button.dataset.route) {
    window.location.hash = `#/${button.dataset.route}`;
    setSidebarOpen(false);
    return;
  }
  if (button.dataset.closeSettingsButton !== undefined) {
    closeSettings();
    return;
  }
  if (button.dataset.toggleSidebar !== undefined) {
    document.body.classList.toggle("sidebar-collapsed");
    return;
  }
  if (button.dataset.openSidebar !== undefined) {
    setSidebarOpen(true);
    return;
  }
  if (button.dataset.lang) {
    localStorage.setItem("khc-language", button.dataset.lang);
    state.lang = resolveLanguage();
    render();
    return;
  }
  if (button.dataset.settingsTab) {
    state.settingsTab = button.dataset.settingsTab;
    render();
    return;
  }
  if (button.dataset.copyPrompt === "photo") {
    const prompt = state.localPhotoName
      ? `/busa-homework-coach I selected a local homework photo named "${state.localPhotoName}". Please analyze it, explain it gently, and record the result with scripts/record_homework.mjs.`
      : "/busa-homework-coach Help me analyze the next homework photo, explain it gently, and record the result with scripts/record_homework.mjs.";
    await navigator.clipboard.writeText(prompt);
    return;
  }
  if (button.dataset.decisionAction) {
    const comment = document.getElementById("reviewNote")?.value || "";
    await submitDecision({ review_id: button.dataset.reviewId, action: button.dataset.decisionAction, comment });
    return;
  }
  if (button.dataset.understand) {
    await decideForQuestion(button.dataset.understand, "approve", t("iUnderstand"));
    return;
  }
  if (button.dataset.needHelp) {
    await decideForQuestion(button.dataset.needHelp, "request_changes", t("stillNeedHelp"));
  }
});

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest(".sidebar a")) setSidebarOpen(false);
});

document.addEventListener("change", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches("[data-local-photo]")) {
    const file = event.target.files?.[0];
    state.localPhotoName = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "";
    render();
  }
});

window.addEventListener("hashchange", setRoute);

window.addEventListener("resize", () => {
  if (!isMobile()) setSidebarOpen(false);
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
    setInterval(() => loadState({ quiet: true }), 20000);
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
if (state.route.view !== "settings") state.lastHash = window.location.hash || "#/student";
boot();
