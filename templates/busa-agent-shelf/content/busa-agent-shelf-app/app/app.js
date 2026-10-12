import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  DECIDABLE_STATUSES,
  attentionList,
  filterObservations,
  freshness,
  isUnsourced,
  positionGrid,
  rankCompetitors,
  reviewQueue,
  shareOfShelf,
} from "./js/shelf-model.js?v=0.1.0";

const LANGUAGE_STORAGE_KEY = "busa-agent-shelf-language";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-agent-shelf.sidebarCollapsed";
const BROWSED_KEYS = ["questions", "observations", "competitors", "fixes"];
const AGENT_NAMES = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  "meta-muse": "Meta Muse",
  "amazon-rufus": "Amazon Rufus",
  perplexity: "Perplexity",
  other: "Other",
};
// Fix queue filters; "" is the default "To decide" queue.
const FIX_VIEWS = ["", "approved", "applied", "blocked", "all"];

// Record views and the Base each one lists. Where a record opens is declared
// per Base in config.js `ui.detail_modes` (the reasons live there):
// questions/answers/competitors → drawer, fixes → split. A `/<record>` path
// always opens the full page; `?peek=<record>` drives the drawer/split. On a
// phone every mode is a page (base-ui.css handles that).
const VIEW_BASE = { questions: "questions", answers: "observations", competitors: "competitors", fixes: "fixes" };
const RECORD_VIEWS = Object.keys(VIEW_BASE);
const DETAIL_MODES = Object.fromEntries(
  RECORD_VIEWS.map((view) => [view, appConfig.ui?.detail_modes?.[VIEW_BASE[view]] || "drawer"]),
);

const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || appConfig.locale,
  ),
  notice: null,
  error: "",
  busyFix: "",
  loadingMore: {},
  pageError: "",
  drafts: {},
  noteErrors: {},
  // Records opened by URL that are not on the loaded page (records.get).
  // A value of `undefined` means the read is in flight; `null` means not found.
  extra: emptyExtra(),
};

function emptyExtra() {
  return Object.fromEntries(BROWSED_KEYS.map((key) => [key, new Map()]));
}

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewTitle: byId("overviewTitle"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewNotice: byId("viewNotice"),
  fixFilters: byId("fixFilters"),
  fixStatus: byId("fixStatus"),
  answerAgent: byId("answerAgent"),
  answerQuestion: byId("answerQuestion"),
  search: byId("search"),
  viewRefresh: byId("viewRefresh"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  settingsPage: byId("settingsPage"),
  settingsTitle: byId("settingsTitle"),
  settingsBody: byId("settingsBody"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  countProposed: byId("count-proposed"),
  countMissing: byId("count-missing"),
  countHighRisk: byId("count-high-risk"),
  countUnsourced: byId("count-unsourced"),
  language: byId("language"),
};

// ── shell ────────────────────────────────────────────────────────────────────

// Same breakpoint as base-ui.css's record-view phone rules.
function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

// ── i18n & formatting ───────────────────────────────────────────────────────

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key, vars = {}) {
  const template = messages[activeLang()]?.[key] ?? messages.en[key] ?? key;
  return Object.entries(vars).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), template);
}

function enumLabel(group, value) {
  if (!value) return "";
  return messages[activeLang()]?.enum?.[group]?.[value] || messages.en.enum?.[group]?.[value] || value;
}

const agentName = (agent) => AGENT_NAMES[agent] || agent || "";
const locale = () => (activeLang() === "zh" ? "zh-CN" : "en-US");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDay(day) {
  if (!day) return "";
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const percent = (share) => (share == null ? "—" : `${Math.round(share * 100)}%`);

function money(value) {
  if (value == null) return "";
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value);
}

/** Only http(s) links are rendered as links; anything else is shown as text. */
function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// ── data access helpers ─────────────────────────────────────────────────────

const rows = (key) => state.data?.rows?.[key] || [];
const settings = () => state.data?.settings || null;
const extraRows = (key) => [...state.extra[key].values()].filter(Boolean);
/** Loaded questions plus any fetched on their own for a shared link. */
const knownQuestions = () => {
  const loaded = rows("questions");
  const seen = new Set(loaded.map((row) => row.id));
  return [...loaded, ...extraRows("questions").filter((row) => !seen.has(row.id))];
};
const questionsById = () => new Map(knownQuestions().map((row) => [row.id, row]));

/** Loaded page first, then a record read on its own for the URL. */
function recordById(key, id) {
  if (!id) return null;
  return rows(key).find((row) => row.id === id) || state.extra[key].get(id) || null;
}

/** A relation shows the target's question text, or says it is not loaded — never the id. */
function questionLabel(id, lookup = questionsById()) {
  if (!id) return "";
  return lookup.get(id)?.question || "";
}

function questionText(id, lookup) {
  const label = questionLabel(id, lookup);
  return label ? esc(label) : `<span class="muted">${esc(t("notLoaded"))}</span>`;
}

function loadedLabel(key) {
  const loaded = rows(key).length;
  const total = state.data?.totals?.[key];
  if (total != null) return t("loadedOf", { loaded, total });
  return state.data?.cursors?.[key] ? t("loadedPlus", { loaded }) : String(loaded);
}

/** The per-Base total for the nav: records.count when known, else loaded rows. */
function navCount(key) {
  const total = state.data?.totals?.[key];
  if (total != null) return String(total);
  return `${rows(key).length}${state.data?.cursors?.[key] ? "+" : ""}`;
}

function loadMoreControl(key) {
  if (!state.data?.cursors?.[key]) return "";
  const busy = Boolean(state.loadingMore[key]);
  const label = key === "observations" && state.route.view === "questions" ? `${t("answers")}: ` : "";
  return `<div class="load-more">
    <span class="muted">${esc(label + loadedLabel(key))}</span>
    <button type="button" class="button" data-load-more="${key}" ${busy ? "disabled" : ""}>${esc(busy ? t("loadingMore") : t("loadMore"))}</button>
    ${state.pageError ? `<span class="inline-error" role="alert">${esc(t("loadFailed", { error: state.pageError }))}</span>` : ""}
  </div>`;
}

/** A Base whose first page could not be read says so where its rows would be. */
function readErrorNote(key) {
  const error = state.data?.errors?.[key];
  return error ? `<div class="notice danger read-error" role="alert">${esc(t("readFailed", { error }))}</div>` : "";
}

// One explicit page per click; never a loop over nextCursor.
async function loadMore(key) {
  const cursor = state.data?.cursors?.[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.pageError = "";
  render();
  try {
    const provider = await getProvider();
    const page = await provider.fetchPage(key, cursor);
    const seen = new Set(rows(key).map((row) => row.id));
    state.data.rows[key] = [...rows(key), ...page.rows.filter((row) => !seen.has(row.id))];
    state.data.cursors[key] = page.nextCursor;
  } catch (error) {
    state.pageError = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// ── routing ─────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&agent=…&question=…&peek=…]`. Search,
// filters and the peeked record live in the URL so refresh, shared links and
// Back restore the same list context.

function safeDecode(value) {
  try {
    return value ? decodeURIComponent(value) : "";
  } catch {
    return "";
  }
}

function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  let id = RECORD_VIEWS.includes(view) ? safeDecode(parts[1]) : "";
  let status = params.get("status") || "";
  // Older links put the fix filter in the path: `#/fixes/all`.
  if (view === "fixes" && FIX_VIEWS.includes(id)) {
    status = id || status;
    id = "";
  }
  if (!FIX_VIEWS.includes(status)) status = "";
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode,
    query: params.get("q") || "",
    status: view === "fixes" ? status : "",
    agent: view === "answers" ? params.get("agent") || "" : "",
    question: view === "answers" ? params.get("question") || "" : "",
  };
}

const blankRoute = (view) => ({ view, query: "", status: "", agent: "", question: "" });

function routeQuery(route, extra = {}) {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.status) params.set("status", route.status);
  if (route.agent) params.set("agent", route.agent);
  if (route.question) params.set("question", route.question);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const contextFor = (view, route) => route || (view === state.route.view ? state.route : blankRoute(view));
const listUrl = (route = state.route) => `#/${route.view}${routeQuery(route)}`;
/** The full page: the record in the path. Always a page, whatever the view's mode. */
const detailUrl = (id, view = state.route.view, route) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery(contextFor(view, route))}`;
/** What a row or a cross-link opens: the page for a `page` view, else `?peek=`. */
function recordUrl(id, view = state.route.view, route) {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view, route);
  return `#/${view}${routeQuery(contextFor(view, route), { peek: id })}`;
}
/** A fix link from elsewhere: decided fixes are outside the default queue. */
const fixUrl = (fix) =>
  recordUrl(fix.id, "fixes", { ...blankRoute("fixes"), status: DECIDABLE_STATUSES.has(fix.status) ? "" : "all" });

let previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A record opened from its own list marks the entry, so Close/Escape step
  // back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.view !== state.route.view) state.notice = null;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  if (previous.view !== state.route.view) {
    els.overviewPage.scrollTop = 0;
    els.listPanel.scrollTop = 0;
  }
  ensureSelectedRecord();
}

/** Replace the entry without a hashchange: keystrokes and filter clicks are not Back steps. */
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const keep = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = keep;
  render();
  ensureSelectedRecord();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── loading ─────────────────────────────────────────────────────────────────

let loadToken = 0;
async function loadState() {
  const token = ++loadToken;
  const provider = await getProvider();
  const data = await provider.getState();
  if (token !== loadToken) return;
  closeConnectGate();
  state.data = data;
  state.extra = emptyExtra();
  state.error = "";
  state.pageError = "";
  render();
  ensureSelectedRecord();
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  const key = VIEW_BASE[view];
  if (!state.data || !selectedId || !key) return;
  if (rows(key).some((row) => row.id === selectedId) || state.extra[key].has(selectedId)) return;
  const provider = await getProvider();
  if (typeof provider.getRecord !== "function") {
    state.extra[key].set(selectedId, null);
    render();
    return;
  }
  state.extra[key].set(selectedId, undefined);
  render();
  try {
    state.extra[key].set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    state.extra[key].set(selectedId, null);
  }
  render();
}

// ── rendering primitives ────────────────────────────────────────────────────

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = activeLang() === "zh" ? { auto: "自动" } : { auto: "Auto" };
  for (const option of els.language.options) if (languageLabels[option.value]) option.textContent = languageLabels[option.value];
  els.refresh.textContent = t("refresh");
  for (const button of [els.mobileRefresh, els.viewRefresh]) {
    button.title = t("refresh");
    button.setAttribute("aria-label", t("refresh"));
  }
  els.sidebarToggle.title = t("toggleSidebar");
  els.sidebarToggle.setAttribute("aria-label", t("toggleSidebar"));
  els.mobileSidebarToggle.title = t("openSidebar");
  els.mobileSidebarToggle.setAttribute("aria-label", t("openSidebar"));
  els.overviewTitle.textContent = t("overview");
  els.settingsTitle.textContent = t("settings");
  els.settingsTitle.title = t("settingsSubtitle");
  els.detailExpand.textContent = t("openFullPage");
  els.answerAgent.setAttribute("aria-label", t("allAgents"));
  els.answerQuestion.setAttribute("aria-label", t("allQuestions"));
  els.fixStatus.setAttribute("aria-label", t("fixes"));
}

function viewLabel(view) {
  return RECORD_VIEWS.includes(view) || view === "settings" ? t(view) : t("overview");
}

function renderShell() {
  applyI18n();
  const attention = attentionList({ questions: rows("questions"), observations: rows("observations"), fixes: rows("fixes") });
  els.countProposed.textContent = String(attention.counts.proposed);
  els.countMissing.textContent = String(attention.counts.missing);
  els.countHighRisk.textContent = String(attention.counts.highRisk);
  els.countUnsourced.textContent = String(attention.counts.unsourced);
  els.syncStatus.textContent = !state.data
    ? t("loading")
    : state.data.demo
      ? t("demoNote")
      : t("liveNote", { time: formatTime(state.data.loaded_at) });
  els.language.value = state.lang;
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = state.data ? navCount(node.dataset.navCount) : "";
  });
  document.querySelectorAll("nav [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  const title = state.error ? t("errorTitle") : state.data ? viewLabel(state.route.view) : t("loading");
  els.mobileViewTitle.textContent = title;
  els.mobileViewMeta.textContent = !state.data
    ? ""
    : attention.counts.proposed
      ? `${attention.counts.proposed} ${t("fixesWaiting")}`
      : settings()?.brand || t("appTitle");
  document.title = `${title} · ${t("appTitle")}`;
}

const badge = (label, tone = "") => (label ? `<span class="badge ${tone}">${esc(label)}</span>` : "");
const toneForRisk = (risk) => ({ high: "danger", medium: "warning", low: "positive" })[risk] || "";
const toneForStatus = (status) =>
  ({ proposed: "active", "changes-requested": "warning", approved: "positive", applied: "positive", blocked: "danger" })[
    status
  ] || "";
const toneForPriority = (priority) => ({ high: "danger", medium: "warning" })[priority] || "";

function emptyState(title, body, action = "") {
  return `<div class="empty-state">
    <div class="empty-state-icon" aria-hidden="true">○</div>
    <strong>${esc(title)}</strong>
    ${body ? `<p>${esc(body)}</p>` : ""}
    ${action}
  </div>`;
}

function noticeBar() {
  if (!state.notice) return "";
  return `<div class="notice ${state.notice.tone || ""}" role="status">${esc(state.notice.text)}</div>`;
}

function positionChip(position) {
  if (position == null) return `<span class="position none" title="${esc(t("notChecked"))}">${esc(t("notCheckedShort"))}</span>`;
  if (position > 0) return `<span class="position shown">${esc(t("positionN", { n: position }))}</span>`;
  return `<span class="position missing">${esc(t("notShown"))}</span>`;
}

const cell = (html, { title = "", className = "", label = "" } = {}) =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${esc(title)}"` : ""}${label ? ` data-label="${esc(label)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${esc(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) => `<tr data-id="${esc(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

// ── overview ────────────────────────────────────────────────────────────────

function renderOverview() {
  const brand = settings()?.brand;
  els.overviewSummary.textContent = brand ? t("overviewSubtitle", { brand }) : t("overviewSubtitleNoBrand");
  const observations = rows("observations");
  const share = shareOfShelf({ questions: rows("questions"), observations, settings: settings() });
  const attention = attentionList({ questions: rows("questions"), observations, fixes: rows("fixes") });
  const fresh = freshness({ latest: share.latest, cadence: settings()?.cadence });
  const lookup = questionsById();

  // Three numbers nothing else on screen shows: the per-agent cells below give
  // each agent's share, the sidebar gives the attention counts.
  const overallDelta = share.overall.delta == null ? null : Math.round(share.overall.delta * 100);
  const metrics = [
    [t("overallShare"), percent(share.overall.share), ""],
    [
      share.previous ? t("overallChange", { previous: formatDay(share.previous) }) : t("overallChangeNone"),
      overallDelta == null ? "—" : `${overallDelta > 0 ? "+" : overallDelta < 0 ? "−" : "±"}${Math.abs(overallDelta)} ${t("pts")}`,
      overallDelta > 0 ? "up" : overallDelta < 0 ? "down" : "",
    ],
    [
      t("daysSinceCheck", { limit: fresh.limit }),
      fresh.days == null ? "—" : String(fresh.days),
      fresh.stale ? "stale" : "",
    ],
  ];
  els.overviewMetrics.innerHTML = metrics
    .map(
      ([label, value, tone]) =>
        `<div class="metric-cell ${tone}"><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong></div>`,
    )
    .join("");

  const shareCard = !share.latest
    ? `<section class="card">${emptyState(t("noChecks"), t("noChecksBody"))}</section>`
    : `<section class="card">
        <div class="card-heading">
          <div>
            <h2>${esc(t("shareTitle"))}</h2>
            <p>${esc(share.previous ? t("shareHint", { latest: formatDay(share.latest) }) : t("shareHintNoPrev", { latest: formatDay(share.latest) }))}</p>
          </div>
          <a class="text-link" href="#/questions">${esc(t("openGrid"))}</a>
        </div>
        <div class="share-grid">
          ${share.agents
            .map((item) => {
              const delta = item.delta == null ? null : Math.round(item.delta * 100);
              const deltaLine =
                item.share == null
                  ? `<span class="muted">${esc(t("notChecked"))}</span>`
                  : delta == null
                    ? `<span class="muted">${esc(t("deltaNone"))}</span>`
                    : `<span class="metric-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}"><b>${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}</b> ${esc(t("pts"))} ${esc(t("deltaVs", { previous: formatDay(share.previous) }))}</span>`;
              return `<article class="share-cell">
                <div class="share-agent">${esc(agentName(item.agent))}</div>
                <div class="share-value">${esc(percent(item.share))}</div>
                <div class="share-meter" aria-hidden="true"><span style="width:${Math.round((item.share || 0) * 100)}%"></span></div>
                <div class="muted">${item.share == null ? "&nbsp;" : esc(t("shareOf", { shown: item.shown, total: item.total }))}</div>
                ${deltaLine}
              </article>`;
            })
            .join("")}
        </div>
        ${state.data?.cursors?.observations ? `<p class="footnote muted">${esc(t("loadedOnly", { count: observations.length }))}</p>` : ""}
      </section>`;

  const missingItems = attention.missing.map(
    (item) => `<li class="attention-item">
      <div class="attention-main">
        <a href="${esc(recordUrl(item.question.id, "questions"))}">${esc(item.question.question)}</a>
        <div class="muted">${esc(t("missingLine", { date: formatDay(item.checked_on) }))}${item.picked_instead ? ` · ${esc(t("pickedInstead"))}: ${esc(item.picked_instead)}` : ""}</div>
      </div>
      ${badge(enumLabel("priority", "high"), "danger")}
    </li>`,
  );
  const fixItems = attention.fixes.map(
    (item) => `<li class="attention-item">
      <div class="attention-main">
        <a href="${esc(fixUrl(item.fix))}">${esc(item.fix.title)}</a>
        <div class="muted">${esc(item.fix.product)} · ${esc(enumLabel("fixStatus", item.fix.status))}${item.fix.question ? ` · ${questionText(item.fix.question, lookup)}` : ""}</div>
      </div>
      <div class="badge-row">${item.reasons.map((reason) => badge(t(`reason_${reason}`), reason === "proposed" ? "active" : reason === "high-risk" ? "danger" : "warning")).join("")}</div>
    </li>`,
  );

  els.overviewBody.innerHTML = `
    ${noticeBar()}
    ${["questions", "observations", "fixes", "settings"].map(readErrorNote).join("")}
    ${shareCard}
    <div class="overview-columns">
      <section class="card">
        <div class="card-heading"><h2>${esc(t("missingTitle"))}</h2></div>
        ${
          missingItems.length
            ? `<ul class="attention-list">${missingItems.join("")}</ul>`
            : `<p class="muted">${esc(t("missingEmpty"))}</p>`
        }
      </section>
      <section class="card">
        <div class="card-heading">
          <h2>${esc(t("fixesNeedYou"))}</h2>
          <a class="text-link" href="#/fixes">${esc(t("reviewAll"))}</a>
        </div>
        ${
          fixItems.length
            ? `<ul class="attention-list">${fixItems.join("")}</ul>`
            : `<p class="muted">${esc(t("noFixesWaiting"))}</p>`
        }
      </section>
    </div>`;
}

// ── record views ────────────────────────────────────────────────────────────

const matches = (values, needle) => !needle || values.join(" ").toLowerCase().includes(needle);
const needle = () => state.route.query.trim().toLowerCase();

function questionGrid() {
  const grid = positionGrid({ questions: knownQuestions(), observations: rows("observations"), settings: settings() });
  const query = needle();
  return {
    ...grid,
    rows: grid.rows.filter(({ question, loaded }) =>
      loaded ? matches([question.question, question.category, question.target_products, question.notes], query) : !query,
    ),
  };
}

const filteredAnswers = () =>
  filterObservations(rows("observations"), {
    agent: state.route.agent,
    question: state.route.question,
    query: state.route.query,
  });

const filteredCompetitors = () =>
  rankCompetitors(rows("competitors")).filter((row) => matches([row.product, row.brand, row.what_they_have], needle()));

function fixMatchesView(fix, view) {
  if (view === "all") return true;
  if (!view) return DECIDABLE_STATUSES.has(fix.status);
  return fix.status === view;
}

const filteredFixes = () =>
  reviewQueue(rows("fixes")).filter(
    (fix) =>
      fixMatchesView(fix, state.route.status) &&
      matches([fix.title, fix.product, fix.field_name, fix.proposed_value, fix.source], needle()),
  );

/** True while a search or filter narrows the list, so the toolbar shows its count. */
function isNarrowed() {
  const { view, query, agent, question } = state.route;
  return Boolean(query || (view === "answers" && (agent || question)));
}

function renderToolbar(view, count) {
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = [t(`${view}Subtitle`), view === "questions" ? t("legend") : ""].filter(Boolean).join("\n");
  els.viewCount.textContent = count;
  els.search.placeholder = t(view === "answers" ? "searchAnswers" : "searchLoaded");
  els.search.setAttribute("aria-label", els.search.placeholder);
  els.search.title = view === "answers" ? t("filterNote", { count: rows("observations").length }) : "";

  els.fixFilters.hidden = view !== "fixes";
  els.fixStatus.hidden = view !== "fixes";
  if (view === "fixes") {
    const all = rows("fixes");
    const labelFor = (id) => (id === "" ? t("toDecide") : id === "all" ? t("all") : enumLabel("fixStatus", id));
    const countFor = (id) => all.filter((fix) => fixMatchesView(fix, id)).length;
    els.fixFilters.innerHTML = FIX_VIEWS.map(
      (id) =>
        `<button type="button" role="tab" class="segment ${state.route.status === id ? "active" : ""}" aria-selected="${state.route.status === id}" data-status="${id}">${esc(labelFor(id))} <b>${countFor(id)}</b></button>`,
    ).join("");
    els.fixStatus.innerHTML = FIX_VIEWS.map(
      (id) => `<option value="${id}" ${state.route.status === id ? "selected" : ""}>${esc(labelFor(id))} (${countFor(id)})</option>`,
    ).join("");
  }

  els.answerAgent.hidden = view !== "answers";
  els.answerQuestion.hidden = view !== "answers";
  if (view === "answers") {
    const observations = rows("observations");
    const lookup = questionsById();
    const agents = [...new Set(observations.map((row) => row.agent).filter(Boolean))];
    const questionIds = [...new Set(observations.map((row) => row.question).filter(Boolean))];
    els.answerAgent.innerHTML = `<option value="">${esc(t("allAgents"))}</option>${agents
      .map((agent) => `<option value="${esc(agent)}" ${state.route.agent === agent ? "selected" : ""}>${esc(agentName(agent))}</option>`)
      .join("")}`;
    els.answerQuestion.innerHTML = `<option value="">${esc(t("allQuestions"))}</option>${questionIds
      .map(
        (id) =>
          `<option value="${esc(id)}" ${state.route.question === id ? "selected" : ""}>${esc(questionLabel(id, lookup) || t("notLoaded"))}</option>`,
      )
      .join("")}`;
  }
}

function questionsTable(grid) {
  return `<table class="ws-table shelf-table questions-table">
    ${tableHead([[t("question")], [t("priority"), "col-badge"], ...grid.agents.map((agent) => [agentName(agent), "agent-col"])])}
    <tbody>
      ${grid.rows
        .map(({ question, loaded, cells }) => {
          const status =
            question.status === "paused"
              ? badge(enumLabel("questionStatus", "paused"))
              : badge(enumLabel("priority", question.priority), toneForPriority(question.priority));
          return `${rowOpen(question.id)}
            ${
              loaded
                ? cell(`<span class="strong">${esc(question.question)}</span>`, { title: question.question })
                : cell(`<span class="muted">${esc(t("notLoaded"))}</span>`, { title: t("notLoadedHint") })
            }
            ${cell(loaded ? status : "", { className: "col-badge" })}
            ${cells
              .map((item) =>
                cell(positionChip(item.position), {
                  className: "agent-col",
                  title: item.checked_on ? `${agentName(item.agent)} · ${t("checkedOn", { date: formatDay(item.checked_on) })}` : "",
                }),
              )
              .join("")}
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function answersTable(list, lookup) {
  return `<table class="ws-table shelf-table answers-table">
    ${tableHead([[t("question")], [t("ourPosition"), "col-badge"], [t("agent")], [t("checked"), "ws-col-narrow"], [t("ourProduct")], [t("pickedInstead"), "ws-col-wide"]])}
    <tbody>
      ${list
        .map(
          (row) => `${rowOpen(row.id)}
            ${cell(`<span class="strong">${questionText(row.question, lookup)}</span>`, { title: questionLabel(row.question, lookup) })}
            ${cell(positionChip(row.our_position), { className: "col-badge" })}
            ${cell(esc(agentName(row.agent)))}
            ${cell(esc(formatDay(row.checked_on)), { className: "ws-col-narrow" })}
            ${cell(esc(row.our_product || "—"), { title: row.our_product })}
            ${cell(esc(row.picked_instead), { title: row.picked_instead, className: "ws-col-wide" })}
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function competitorsTable(list) {
  return `<table class="ws-table shelf-table competitors-table">
    ${tableHead([[t("product")], [t("timesPicked"), "ws-col-num col-picks"], [t("brand")], [t("price"), "ws-col-num"], [t("whatTheyHave"), "ws-col-wide"]])}
    <tbody>
      ${list
        .map(
          (row) => `${rowOpen(row.id)}
            ${cell(`<span class="strong">${esc(row.product)}</span>`, { title: row.product })}
            ${cell(esc(row.times_picked), { className: "ws-col-num col-picks" })}
            ${cell(esc(row.brand), { title: row.brand })}
            ${cell(esc(money(row.price)), { className: "ws-col-num" })}
            ${cell(esc(row.what_they_have), { title: row.what_they_have, className: "ws-col-wide" })}
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function fixesTable(list) {
  return `<table class="ws-table shelf-table fixes-table">
    ${tableHead([[t("fix")], [t("risk"), "ws-split-keep col-risk"], [t("status"), "ws-split-keep col-status"]])}
    <tbody>
      ${list
        .map(
          (fix) => `${rowOpen(fix.id)}
            ${cell(`<span class="strong">${esc(fix.title)}</span>`, { title: `${fix.title} · ${fix.product}` })}
            ${cell(badge(enumLabel("riskShort", fix.risk), toneForRisk(fix.risk)), { className: "ws-split-keep col-risk" })}
            ${cell(badge(enumLabel("fixStatus", fix.status), toneForStatus(fix.status)), { className: "ws-split-keep col-status" })}
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderRecordView() {
  const { view } = state.route;
  const key = VIEW_BASE[view];
  const partial = state.data?.cursors?.[key] ? "+" : "";
  let count = 0;
  let body = "";
  if (view === "questions") {
    const grid = questionGrid();
    count = grid.rows.length;
    body = grid.rows.length
      ? questionsTable(grid)
      : state.route.query
        ? emptyState(t("noMatches"), t("noMatchesBody"))
        : emptyState(t("noQuestions"), t("noQuestionsBody"));
    body += loadMoreControl("questions") + loadMoreControl("observations");
  } else if (view === "answers") {
    const list = filteredAnswers();
    count = list.length;
    body = (list.length ? answersTable(list, questionsById()) : emptyState(t("noAnswers"), t("noAnswersBody"))) + loadMoreControl("observations");
  } else if (view === "competitors") {
    const list = filteredCompetitors();
    count = list.length;
    body = list.length
      ? competitorsTable(list)
      : state.route.query
        ? emptyState(t("noMatches"), t("noMatchesBody"))
        : emptyState(t("noCompetitors"), t("noCompetitorsBody"));
    body += loadMoreControl("competitors");
  } else {
    const list = filteredFixes();
    count = list.length;
    body = (list.length ? fixesTable(list) : emptyState(t("noFixes"), t("noFixesBody"))) + loadMoreControl("fixes");
  }
  renderToolbar(view, `${count}${partial}`);
  els.viewNotice.hidden = !state.notice;
  els.viewNotice.innerHTML = noticeBar();
  els.listPanel.innerHTML = readErrorNote(key) + body;
  renderDetail();
}

// ── detail (one markup for drawer, split and full page) ─────────────────────

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const key = VIEW_BASE[view];
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${esc(t("selectFix"))}</div>` : "";
    return;
  }
  const item = recordById(key, selectedId);
  if (view === "questions") {
    // A question referenced by answers renders its answers even when the
    // question row itself could not be read.
    const pending = state.extra.questions.has(selectedId) && state.extra.questions.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending ? `<p class="muted">${esc(t("loading"))}</p>` : questionDetail(selectedId, item);
    return;
  }
  if (!item) {
    const pending = state.extra[key].has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<p class="muted">${esc(t("loading"))}</p>`
      : emptyState(t("recordMissing"), t("recordMissingBody"));
    return;
  }
  if (view === "answers") els.detailBody.innerHTML = answerDetail(item);
  else if (view === "competitors") els.detailBody.innerHTML = competitorDetail(item);
  else els.detailBody.innerHTML = `${noticeBar()}${fixDetail(item, questionsById())}`;
}

const fact = (label, html) => (html ? `<div><dt>${esc(label)}</dt><dd>${html}</dd></div>` : "");

function questionDetail(id, question) {
  const grid = positionGrid({ questions: knownQuestions(), observations: rows("observations"), settings: settings() });
  const gridRow = grid.rows.find((row) => row.question.id === id);
  const fixes = reviewQueue(rows("fixes").filter((fix) => fix.question === id));
  if (!question && !gridRow) return emptyState(t("recordMissing"), t("recordMissingBody"));
  const head = question
    ? `<header class="detail-head">
        <h2>${esc(question.question)}</h2>
        <div class="badge-row">
          ${badge(enumLabel("priority", question.priority), toneForPriority(question.priority))}
          ${question.status === "paused" ? badge(enumLabel("questionStatus", "paused")) : ""}
          ${question.market ? `<span class="muted">${esc(enumLabel("market", question.market))}</span>` : ""}
          ${question.intent ? `<span class="muted">· ${esc(enumLabel("intent", question.intent))}</span>` : ""}
          ${question.category ? `<span class="muted">· ${esc(question.category)}</span>` : ""}
        </div>
      </header>
      <dl class="detail-facts">
        ${fact(t("targetProducts"), esc(question.target_products))}
        ${fact(t("notes"), question.notes ? `<span class="wrap">${esc(question.notes)}</span>` : "")}
      </dl>`
    : `<header class="detail-head"><h2 class="muted">${esc(t("notLoaded"))}</h2><p class="muted">${esc(t("notLoadedHint"))}</p></header>`;
  const answers = (gridRow?.cells || [])
    .map(
      (item) => `<li>
        <span class="detail-list-main"><strong>${esc(agentName(item.agent))}</strong>${item.checked_on ? `<small class="muted">${esc(t("checkedOn", { date: formatDay(item.checked_on) }))}</small>` : ""}</span>
        ${item.observation_id ? `<a href="${esc(recordUrl(item.observation_id, "answers"))}">${positionChip(item.position)}</a>` : positionChip(item.position)}
      </li>`,
    )
    .join("");
  return `${head}
    <section class="detail-section">
      <h3>${esc(t("latestPerAgent"))}</h3>
      ${answers ? `<ul class="detail-list">${answers}</ul>` : `<p class="muted">${esc(t("noAnswersForQuestion"))}</p>`}
    </section>
    <section class="detail-section">
      <h3>${esc(t("fixesForQuestion"))}</h3>
      ${
        fixes.length
          ? `<ul class="detail-list">${fixes
              .map(
                (fix) => `<li>
                  <span class="detail-list-main"><a href="${esc(fixUrl(fix))}">${esc(fix.title)}</a><small class="muted">${esc(fix.product)}</small></span>
                  ${badge(enumLabel("fixStatus", fix.status), toneForStatus(fix.status))}
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">${esc(t("noFixesForQuestion"))}</p>`
      }
    </section>`;
}

function answerDetail(row) {
  const lookup = questionsById();
  const link = safeUrl(row.evidence_url);
  return `<header class="detail-head">
      <h2>${questionText(row.question, lookup)}</h2>
      <div class="badge-row">${positionChip(row.our_position)}<span class="muted">${esc(agentName(row.agent))} · ${esc(formatDay(row.checked_on))}</span></div>
    </header>
    <dl class="detail-facts">
      ${fact(t("ourProduct"), esc(row.our_product))}
      ${fact(t("pickedInstead"), esc(row.picked_instead))}
      ${fact(t("reasonGiven"), esc(row.reason_given))}
    </dl>
    ${row.answer_excerpt ? `<section class="detail-section"><h3>${esc(t("excerpt"))}</h3><blockquote class="excerpt">${esc(row.answer_excerpt)}</blockquote></section>` : ""}
    <div class="detail-links">
      ${row.question ? `<a class="text-link" href="${esc(recordUrl(row.question, "questions"))}">${esc(t("openQuestion"))}</a>` : ""}
      ${link ? `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(t("evidenceLink"))} ↗</a>` : ""}
    </div>`;
}

function competitorDetail(row) {
  const link = safeUrl(row.url);
  return `<header class="detail-head">
      <h2>${esc(row.product)}</h2>
      ${row.brand ? `<p class="muted">${esc(row.brand)}</p>` : ""}
    </header>
    <dl class="detail-facts">
      ${fact(t("timesPicked"), esc(row.times_picked))}
      ${fact(t("price"), esc(money(row.price)))}
      ${fact(t("listing"), link ? `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)} ↗</a>` : "")}
      ${fact(t("whatTheyHave"), row.what_they_have ? `<span class="wrap">${esc(row.what_they_have)}</span>` : "")}
    </dl>`;
}

function fixDetail(fix, lookup) {
  const decidable = DECIDABLE_STATUSES.has(fix.status);
  const busy = state.busyFix === fix.id;
  const anyBusy = Boolean(state.busyFix);
  const unsourced = isUnsourced(fix);
  const noteError = state.noteErrors[fix.id];
  return `<article class="fix-detail" data-fix="${esc(fix.id)}">
    <header class="detail-head">
      <h2>${esc(fix.title)}</h2>
      <div class="badge-row">
        ${badge(enumLabel("risk", fix.risk), toneForRisk(fix.risk))}
        ${badge(enumLabel("fixStatus", fix.status), toneForStatus(fix.status))}
        <span class="muted">${esc(fix.product)}${fix.gap_type ? ` · ${esc(enumLabel("gap", fix.gap_type))}` : ""}</span>
      </div>
      ${fix.question ? `<p class="muted">${esc(t("forQuestion"))}: <a href="${esc(recordUrl(fix.question, "questions"))}">${questionText(fix.question, lookup)}</a></p>` : ""}
    </header>
    <div class="diff">
      ${fix.field_name ? `<div class="diff-field">${esc(t("field"))}: <code>${esc(fix.field_name)}</code></div>` : ""}
      <div class="diff-grid">
        <div class="diff-side before"><span class="diff-label">${esc(t("current"))}</span><div>${esc(fix.current_value || "—")}</div></div>
        <div class="diff-arrow" aria-hidden="true">→</div>
        <div class="diff-side after"><span class="diff-label">${esc(t("proposed"))}</span><div>${esc(fix.proposed_value)}</div></div>
      </div>
    </div>
    <dl class="detail-facts">
      <div><dt>${esc(t("source"))}</dt><dd>${unsourced ? `<span class="inline-error">${esc(t("noSource"))}</span>` : esc(fix.source)}</dd></div>
      ${fact(t("evidence"), esc(fix.evidence))}
      ${fact(t("decisionNote"), esc(fix.decision_note))}
      ${fact(enumLabel("fixStatus", "applied"), fix.applied_on ? esc(t("appliedOn", { date: formatDay(fix.applied_on) })) : "")}
    </dl>
    ${
      decidable
        ? `<div class="decision">
            <label class="decision-label" for="note-${esc(fix.id)}">${esc(t("decisionNote"))}</label>
            <textarea id="note-${esc(fix.id)}" data-note="${esc(fix.id)}" rows="2" placeholder="${esc(t("decisionNotePlaceholder"))}" ${busy ? "disabled" : ""}>${esc(state.drafts[fix.id] || "")}</textarea>
            ${noteError ? `<div class="inline-error" role="alert">${esc(noteError)}</div>` : ""}
            <div class="decision-actions">
              <button type="button" class="button primary" data-decide="approve" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("approve"))}</button>
              <button type="button" class="button" data-decide="request-changes" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("requestChanges"))}</button>
              <button type="button" class="button danger" data-decide="block" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("block"))}</button>
            </div>
          </div>`
        : ""
    }
  </article>`;
}

// ── settings ────────────────────────────────────────────────────────────────

function renderSettings() {
  const current = settings();
  const agents = current?.agents?.length ? current.agents.map(agentName).join(", ") : t("notSet");
  els.settingsBody.innerHTML = `
    <div class="settings-stack">
      ${readErrorNote("settings")}
      <section class="card settings-card">
        <h2>${esc(t("trackingSetup"))}</h2>
        <dl class="settings-grid">
          <div><dt>${esc(t("brandLabel"))}</dt><dd>${esc(current?.brand || t("notSet"))}</dd></div>
          <div><dt>${esc(t("agentsLabel"))}</dt><dd>${esc(agents)}</dd></div>
          <div><dt>${esc(t("cadenceLabel"))}</dt><dd>${esc(enumLabel("cadence", current?.cadence) || t("notSet"))}</dd></div>
          <div class="span-2"><dt>${esc(t("policyLabel"))}</dt><dd class="wrap">${esc(current?.review_policy || t("notSet"))}</dd></div>
        </dl>
      </section>
      <section class="card settings-card">
        <h2>${esc(t("dataSource"))}</h2>
        <dl class="settings-grid">
          <div><dt>${esc(t("dataSource"))}</dt><dd>${esc(state.data?.demo ? t("sourceDemo") : t("sourceLive"))}</dd></div>
          <div><dt>${esc(t("onboarding"))}</dt><dd>${esc(current?.brand ? t("onboardingDone") : t("onboardingTodo"))}</dd></div>
          ${BROWSED_KEYS.map((key) => `<div><dt>${esc(t(key === "observations" ? "answers" : key))}</dt><dd>${esc(loadedLabel(key))}</dd></div>`).join("")}
        </dl>
      </section>
      <section class="settings" id="settingsContent"></section>
    </div>`;
}

// ── render ──────────────────────────────────────────────────────────────────

function renderLoadState() {
  els.loadState.innerHTML = state.error
    ? emptyState(t("errorTitle"), state.error, `<button type="button" class="button" data-retry>${esc(t("retry"))}</button>`)
    : `<p class="muted">${esc(t("loadingData"))}</p><div class="skeleton skeleton-block"></div>`;
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data) && !state.error;
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && presentation === "split");
  body.toggle("ws-searching", onRecordView && isNarrowed());
  body.toggle("view-fixes", onRecordView && view === "fixes");
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) {
    renderLoadState();
    return;
  }
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── decisions ───────────────────────────────────────────────────────────────

async function decide(fixId, action) {
  if (state.busyFix) return;
  const fix = recordById("fixes", fixId);
  if (!fix) return;
  const note = String(state.drafts[fixId] || "").trim();
  if ((action === "request-changes" || action === "block") && !note) {
    state.noteErrors[fixId] = t("noteRequired");
    render();
    document.querySelector(`[data-note="${CSS.escape(fixId)}"]`)?.focus();
    return;
  }
  // The queue is worked top to bottom: remember the neighbours so the split
  // can move on once this fix leaves the current filter.
  const queue = filteredFixes();
  const index = queue.findIndex((item) => item.id === fixId);
  const neighbours = index === -1 ? [] : [queue[index + 1], queue[index - 1]].filter(Boolean);
  state.noteErrors[fixId] = "";
  state.busyFix = fixId;
  state.notice = null;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.decideFix(fix, action, note);
    delete state.drafts[fixId];
    state.notice =
      result.outcome === "demo"
        ? { text: t("decisionDemo"), tone: "positive" }
        : result.outcome === "pending"
          ? { text: t("decisionPending"), tone: "positive" }
          : { text: t("decisionSaved", { title: fix.title }), tone: "positive" };
    state.busyFix = "";
    await loadState();
    const { view, presentation, selectedId } = state.route;
    if (view === "fixes" && presentation === "split" && selectedId === fixId) {
      const remaining = new Set(filteredFixes().map((item) => item.id));
      if (!remaining.has(fixId)) {
        const next = neighbours.find((item) => remaining.has(item.id));
        replaceRoute(next ? recordUrl(next.id) : listUrl());
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.notice = { text: t("decisionFailed", { error: message === "NOTE_REQUIRED" ? t("noteRequired") : message }), tone: "danger" };
    state.busyFix = "";
    render();
  }
}

// ── events ──────────────────────────────────────────────────────────────────

function showFatal(error) {
  state.error = error instanceof Error ? error.message : String(error);
  render();
}

function bindEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("resize", () => {
    syncResponsiveShell();
    if (RECORD_VIEWS.includes(state.route.view) && state.data) renderDetail();
  });
  const refresh = () => {
    state.notice = null;
    loadState().catch(showFatal);
  };
  els.refresh.addEventListener("click", refresh);
  els.mobileRefresh.addEventListener("click", refresh);
  els.viewRefresh.addEventListener("click", refresh);
  els.sidebarToggle.addEventListener("click", toggleSidebar);
  els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
  els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
  els.language.addEventListener("change", () => {
    state.lang = normalizeLang(els.language.value);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, state.lang);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${location.hash}`);
    render();
  });
  els.loadState.addEventListener("click", (event) => {
    if (!event.target.closest("[data-retry]")) return;
    state.error = "";
    render();
    boot();
  });

  // Toolbar: search and filters replace the entry (keeping any peek).
  const withRoute = (patch) =>
    replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, ...patch }, { peek: state.route.peek })}`);
  els.search.addEventListener("input", () => withRoute({ query: els.search.value }));
  els.fixFilters.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-status]");
    if (segment) withRoute({ status: segment.dataset.status });
  });
  els.fixStatus.addEventListener("change", () => withRoute({ status: els.fixStatus.value }));
  els.answerAgent.addEventListener("change", () => withRoute({ agent: els.answerAgent.value }));
  els.answerQuestion.addEventListener("change", () => withRoute({ question: els.answerQuestion.value }));

  els.listPanel.addEventListener("click", (event) => {
    const more = event.target.closest("[data-load-more]");
    if (more) return void loadMore(more.dataset.loadMore);
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
  els.detailBack.addEventListener("click", closeDetail);
  els.detailBody.addEventListener("click", (event) => {
    const decision = event.target.closest("[data-decide]");
    if (decision) decide(decision.dataset.fixId, decision.dataset.decide);
  });
  els.detailBody.addEventListener("input", (event) => {
    const note = event.target.closest("[data-note]");
    if (note) state.drafts[note.dataset.note] = note.value;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Escape inside a field only leaves the field; a second Escape closes.
    if (event.target.closest?.("textarea, input, select")) {
      event.target.blur();
      return;
    }
    const { selectedId, presentation } = state.route;
    if (selectedId && (presentation === "drawer" || presentation === "split")) closeDetail();
  });
}

syncResponsiveShell();
bindEvents();
els.search.value = state.route.query;
render();

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
    showFatal(error);
  }
}

boot();
