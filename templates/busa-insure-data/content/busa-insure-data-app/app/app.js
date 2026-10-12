import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what a data steward does with it:
//   files    → drawer: a file is a fact you scan many of — check its metadata
//                      gaps, close, next file — so the list stays usable behind.
//   qa       → split:  QA pairs are reviewed top to bottom, reading each answer
//                      in turn, so the queue stays beside the record.
//   news     → drawer: an item is skimmed (summary, source link) and dismissed.
//   feedback → split:  feedback is a triage queue worked one item after the next.
// A `/<id>` path always opens the full page; `?peek=<id>` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const NEWS_COLLECTIONS = ["all", "featured", "notice"];
// Which paginated collections back each view (files come whole from the Drive node).
const VIEW_KEYS = { files: [], qa: ["qa"], news: ["featured", "notices"], feedback: ["feedback"] };
const SNAPSHOT_KEY = { files: "files", qa: "qa_pairs", news: "news_items", feedback: "feedback_items" };
const TOTAL_KEY = { files: "file_count", qa: "qa_count", news: "news_count", feedback: "feedback_count" };

const state = {
  route: parseRoute(),
  snapshot: null,
  settings: null,
  provider: null,
  // Next-page cursor per paginated collection; "" once its last page is loaded.
  cursors: {},
  loadingMore: false,
  // Records opened by URL that are not on a loaded page (records.get).
  extra: { files: new Map(), qa: new Map(), news: new Map(), feedback: new Map() },
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-insure-data-language") || "auto",
  ),
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-insure-data.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
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
  viewRefresh: byId("viewRefresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  qualityScore: byId("quality-score"),
  qualityScope: byId("quality-scope"),
  fileCount: byId("count-files"),
  qaCount: byId("count-qa"),
  newsCount: byId("count-news"),
  feedbackCount: byId("count-feedback"),
  language: byId("language"),
};

// ── Shell ──────────────────────────────────────────────────────────────────
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
  if (state.snapshot) renderDetail();
}

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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

const fill = (template, values) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

// Stored option values (`needs_review`, `policy_terms`) are not words. Known
// statuses are translated; anything else is de-slugged rather than printed raw.
function enumLabel(value, group = "status") {
  if (value === null || value === undefined || value === "") return "";
  const key = String(value);
  const known = messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key];
  return known || key.replaceAll("_", " ");
}

// Field slugs become the declared field name; undeclared metadata keys are de-slugged.
const DECLARED_FIELD_NAMES = new Map(
  appConfig.bases.flatMap((base) => base.fields.map((field) => [field.slug, field.name])),
);
function fieldLabel(slug) {
  const declared = DECLARED_FIELD_NAMES.get(slug);
  if (declared) return declared;
  const words = String(slug).replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&collection=…&peek=…]`. Search, the news collection
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
  const collection = params.get("collection") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    collection: NEWS_COLLECTIONS.includes(collection) ? collection : "all",
  };
}

function routeQuery(extra = {}, route = state.route) {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "news" && route.collection !== "all") params.set("collection", route.collection);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const blankRoute = (view) => ({ view, query: "", collection: "all" });
const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path, whatever the view's mode.
function detailUrl(id, view = state.route.view) {
  const route = view === state.route.view ? state.route : blankRoute(view);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
}
// What a row (or a link from Overview) opens: the page for a `page` view, else `?peek=`.
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
  // A detail opened from its own list replaces nothing but remembers it came
  // from there, so Back / Close / Escape step back to that exact list entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// clicks should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario;
  const route = RECORD_VIEWS.includes(scenario) || scenario === "settings" ? `#/${scenario}` : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.settings = data;
  state.snapshot = data.snapshot;
  state.cursors = { ...(data.pagination || {}) };
  state.extra = { files: new Map(), qa: new Map(), news: new Map(), feedback: new Map() };
  state.notice = "";
  window.dispatchEvent(new CustomEvent("busa-insure-data:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// True while a view holds only part of its rows. Anything computed from loaded
// rows (search counts, the quality score) has to say so.
function isPartial(view) {
  return (VIEW_KEYS[view] || []).some((key) => Boolean(state.cursors[key]));
}
const anyPartial = () => RECORD_VIEWS.some(isPartial);

// One click, one page per collection behind the view, appended without
// duplicates and run through the provider's normalizer. Never loops.
async function loadMore(view) {
  if (state.loadingMore || !isPartial(view)) return;
  const provider = state.provider;
  if (typeof provider?.fetchPage !== "function") return;
  state.loadingMore = true;
  render();
  try {
    for (const key of VIEW_KEYS[view].filter((entry) => state.cursors[entry])) {
      const { rows, nextCursor } = await provider.fetchPage(key, state.cursors[key]);
      const list = state.snapshot[SNAPSHOT_KEY[view]];
      const seen = new Set(list.map((item) => item.id));
      list.push(...rows.filter((row) => !seen.has(row.id)));
      state.cursors[key] = nextCursor;
    }
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore = false;
    render();
  }
}

// A record named by the URL but not on a loaded page is read on its own
// (records.get) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (recordById(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = state.provider;
  if (view === "files" || typeof provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  render();
  try {
    state.extra[view].set(selectedId, (await provider.getRecord(view, selectedId)) || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function items(view) {
  return state.snapshot?.[SNAPSHOT_KEY[view]] || [];
}

function recordById(view, id) {
  if (!id) return null;
  return items(view).find((item) => String(item.id) === id) || state.extra[view]?.get(id) || null;
}

function metrics() {
  return state.snapshot?.metrics || {};
}

function allItems() {
  return RECORD_VIEWS.flatMap(items);
}

// Completeness is per-row arithmetic across fields — there is no server
// aggregate for it — so these are computed from the loaded rows.
function qualityScore(list = allItems()) {
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, item) => sum + Number(item.governance?.completeness_pct || 0), 0) / list.length);
}

const GOVERNANCE_STATUSES = ["draft", "review", "needs_metadata", "needs_review"];
function needsGovernance(item) {
  return (
    Boolean(item.governance?.missing_fields?.length) || GOVERNANCE_STATUSES.includes(item.governance?.status || "")
  );
}

const formatTotal = (value) => (value === null || value === undefined ? "—" : String(value));

// ── Formatting ─────────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileType(item) {
  const ext = String(item.name || "").match(/\.([a-z0-9]{1,6})$/i)?.[1];
  if (ext) return ext.toUpperCase();
  return String(item.mime_type || "").split("/").pop() || "";
}

const RECORD_ID = /^(rec|bse|bsf|nod|cmt|crq|ast)[a-z0-9]{10,}$/i;
// A display value: arrays joined, objects and raw resource ids never printed.
function displayValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  const text = String(value);
  return RECORD_ID.test(text) ? t("notLoaded") : text;
}

function completeness(item) {
  const value = Number(item.governance?.completeness_pct ?? 100);
  const tone = value >= 90 ? "good" : value >= 65 ? "warn" : "bad";
  return `<span class="quality-pill ${tone}">${value}%</span>`;
}

function missingMarkup(item, { inline = false } = {}) {
  const missing = item.governance?.missing_fields || [];
  if (!missing.length) return `<span class="muted">${escapeHtml(t("complete"))}</span>`;
  if (inline) return escapeHtml(missing.map(fieldLabel).join(", "));
  return missing.map((field) => `<span class="missing-chip">${escapeHtml(fieldLabel(field))}</span>`).join("");
}

function statusBadge(status) {
  if (!status) return "";
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

const collectionLabel = (item) => (item.collection === "featured" ? t("featured") : t("notices"));
const collectionShort = (item) => (item.collection === "featured" ? t("featuredShort") : t("noticesShort"));

function keyValueTable(entries) {
  const rows = entries
    .map(([key, value]) => [key, displayValue(value)])
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`);
  if (!rows.length) return `<p class="muted">${escapeHtml(t("empty"))}</p>`;
  return `<dl class="kv-table">${rows.join("")}</dl>`;
}

// Option-like values (status, category, policy type) are de-slugged like everywhere else.
const ENUM_FIELDS = new Set(["status", "category", "policy_type", "content_type"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
function fieldValue(key, value) {
  if (typeof value !== "string") return value;
  if (ENUM_FIELDS.has(key)) return enumLabel(value);
  return ISO_DATE.test(value) ? formatDate(value) : value;
}
// `shown` lists the slugs the detail already renders above, so the remaining
// Base fields never repeat them.
const fieldEntries = (obj = {}, shown = []) =>
  Object.entries(obj)
    .filter(([key]) => !shown.includes(key))
    .map(([key, value]) => [fieldLabel(key), fieldValue(key, value)]);

function warningsMarkup() {
  const warnings = state.snapshot?.warnings || [];
  if (!warnings.length) return "";
  return `<section class="card warnings"><h2>${escapeHtml(t("warnings"))}</h2>${warnings
    .map((warning) => `<p>${escapeHtml(warning.message)}</p>`)
    .join("")}</section>`;
}

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── i18n / shell ───────────────────────────────────────────────────────────
function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) option.textContent = languageLabels[option.value] || option.textContent;
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  els.viewRefresh.title = t("refresh");
  els.viewRefresh.setAttribute("aria-label", t("refresh"));
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  byId("settingsTitle").title = t("settingsSubtitle");
  els.detailExpand.textContent = t("openFullPage");
}

function viewLabel(view = state.route.view) {
  if (view === "files") return t("files");
  if (view === "qa") return t("qa");
  if (view === "news") return t("news");
  if (view === "feedback") return t("feedback");
  if (view === "settings") return t("settings");
  return t("overview");
}

const VIEW_HINT = { files: "filesSubtitle", qa: "qaSubtitle", news: "newsSubtitle", feedback: "feedbackSubtitle" };

function renderShell() {
  applyI18n();
  const m = metrics();
  const score = qualityScore();
  const partial = anyPartial();
  const needing = allItems().filter(needsGovernance).length;
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  els.qualityScore.textContent = score;
  els.qualityScope.hidden = !partial;
  els.qualityScope.textContent = partial ? t("loadedScope") : "";
  els.fileCount.textContent = formatTotal(m.file_count);
  els.qaCount.textContent = formatTotal(m.qa_count);
  els.newsCount.textContent = formatTotal(m.news_count);
  els.feedbackCount.textContent = formatTotal(m.feedback_count);
  els.mobileViewTitle.textContent = viewLabel();
  els.mobileViewMeta.textContent = `${score} ${t("qualityScore")} · ${needing} ${t("needsGovernance")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it has the score and the
// per-collection totals). All three are computed from loaded rows.
function metricsBand() {
  const loaded = allItems();
  const scope = anyPartial() ? ` · ${t("loadedScope")}` : "";
  const cells = [
    [t("needsGovernance"), loaded.filter(needsGovernance).length],
    [t("missingValues"), loaded.reduce((sum, item) => sum + (item.governance?.missing_fields?.length || 0), 0)],
    [t("completeRecords"), loaded.filter((item) => Number(item.governance?.completeness_pct ?? 100) >= 100).length],
  ];
  return cells
    .map(
      ([label, value]) =>
        `<div title="${escapeHtml(label + scope)}"><span>${escapeHtml(label + scope)}</span><strong>${value}</strong></div>`,
    )
    .join("");
}

function mostMissing(list) {
  const tally = new Map();
  for (const item of list) {
    for (const field of item.governance?.missing_fields || []) tally.set(field, (tally.get(field) || 0) + 1);
  }
  const [field] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return field ? fieldLabel(field) : "";
}

function coverageTable() {
  const rows = [
    ["files", t("files"), items("files")],
    ["qa", t("qa"), items("qa")],
    ["news", t("featured"), items("news").filter((item) => item.collection === "featured"), "featured"],
    ["news", t("notices"), items("news").filter((item) => item.collection !== "featured"), "notice"],
    ["feedback", t("feedback"), items("feedback")],
  ];
  return `
    <table class="ws-table coverage-table">
      <thead><tr>
        <th>${escapeHtml(t("collection"))}</th>
        <th class="ws-col-num ws-split-keep">${escapeHtml(t("avgCompleteness"))}</th>
        <th class="ws-col-num">${escapeHtml(t("needsGovernance"))}</th>
        <th>${escapeHtml(t("mostMissing"))}</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(([view, label, list, collection]) => {
            const href = collection ? `#/news?collection=${collection}` : `#/${view}`;
            const missing = mostMissing(list);
            return `<tr data-href="${href}">
              <td><a href="${href}">${escapeHtml(label)}</a></td>
              <td class="ws-col-num ws-split-keep">${list.length ? `${qualityScore(list)}%` : "—"}</td>
              <td class="ws-col-num">${list.filter(needsGovernance).length}</td>
              <td>${missing ? escapeHtml(missing) : `<span class="muted">${escapeHtml(t("complete"))}</span>`}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function governanceList() {
  const governed = RECORD_VIEWS.flatMap((view) => items(view).map((item) => ({ view, item })))
    .filter(({ item }) => needsGovernance(item))
    .sort((a, b) => Number(a.item.governance?.completeness_pct || 0) - Number(b.item.governance?.completeness_pct || 0))
    .slice(0, 8);
  if (!governed.length) return emptyState(t("complete"));
  return `
    <table class="ws-table governance-table">
      <thead><tr>
        <th>${escapeHtml(t("title"))}</th>
        <th class="ws-col-wide">${escapeHtml(t("collection"))}</th>
        <th class="ws-col-num ws-split-keep">${escapeHtml(t("completeness"))}</th>
        <th>${escapeHtml(t("missingFields"))}</th>
      </tr></thead>
      <tbody>
        ${governed
          .map(({ view, item }) => {
            const title = item.name || item.question || item.title;
            const where = view === "news" ? collectionLabel(item) : viewLabel(view);
            return `<tr data-href="${recordUrl(item.id, view)}">
              <td title="${escapeHtml(title)}"><a href="${recordUrl(item.id, view)}">${escapeHtml(title)}</a></td>
              <td>${escapeHtml(where)}</td>
              <td class="ws-col-num ws-split-keep">${completeness(item)}</td>
              <td title="${escapeHtml(missingMarkup(item, { inline: true }))}">${item.governance?.missing_fields?.length ? missingMarkup(item, { inline: true }) : statusBadge(item.governance?.status || item.status)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  byId("overviewSummary").textContent = [t("overviewSubtitle"), generated ? `${t("generated")} ${generated}` : ""]
    .filter(Boolean)
    .join(" ");
  byId("overviewMetrics").innerHTML = metricsBand();
  byId("overviewBody").innerHTML = `
    ${warningsMarkup()}
    <section class="card overview-card">
      <h2>${escapeHtml(t("needsGovernance"))} <small class="muted">${escapeHtml(t("lowestFirst"))}</small></h2>
      ${governanceList()}
    </section>
    <section class="card overview-card">
      <h2>${escapeHtml(t("coverage"))}</h2>
      ${coverageTable()}
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
function matchesQuery(item, values) {
  const q = state.route.query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(q),
  );
}

function filteredItems(view) {
  return items(view).filter((item) => {
    if (view === "news" && state.route.collection !== "all" && item.collection !== state.route.collection) return false;
    if (view === "files") return matchesQuery(item, [item.name, item.path, ...Object.values(item.metadata || {})]);
    if (view === "qa") return matchesQuery(item, [item.question, item.answer, item.category, item.source, item.status]);
    if (view === "news")
      return matchesQuery(item, [item.title, item.summary, item.source, item.category, item.status, collectionLabel(item)]);
    return matchesQuery(item, [item.title, item.content, item.source, item.category, item.status, item.user_name]);
  });
}

const head = (columns) =>
  `<thead><tr>${columns
    .map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`)
    .join("")}</tr></thead>`;
const cell = (html, { title = "", className = "" } = {}) =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${String(id) === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const primary = (text) => cell(`<span class="strong">${escapeHtml(text)}</span>`, { title: text });

const TABLES = {
  files: (list) => `
    <table class="ws-table insure-table files-table">
      ${head([[t("name")], [t("path")], [t("type"), "ws-col-narrow"], [t("size"), "ws-col-num"], [t("updated")], [t("completeness"), "ws-col-num ws-split-keep"], [t("missingFields"), "ws-col-wide"]])}
      <tbody>${list
        .map(
          (item) => `${rowOpen(item.id)}
            ${primary(item.name)}
            ${cell(escapeHtml(item.path), { title: item.path })}
            ${cell(escapeHtml(fileType(item)))}
            ${cell(escapeHtml(formatBytes(item.size)), { className: "ws-col-num" })}
            ${cell(escapeHtml(formatDate(item.updated_at)))}
            ${cell(completeness(item), { className: "ws-col-num ws-split-keep" })}
            ${cell(missingMarkup(item, { inline: true }), { title: missingMarkup(item, { inline: true }) })}
          </tr>`,
        )
        .join("")}</tbody>
    </table>`,
  qa: (list) => `
    <table class="ws-table insure-table qa-table">
      ${head([[t("question")], [t("completenessShort"), "ws-col-num ws-split-keep"], [t("carrier")], [t("category")], [t("status")], [t("updated")]])}
      <tbody>${list
        .map(
          (item) => `${rowOpen(item.id)}
            ${primary(item.question)}
            ${cell(completeness(item), { className: "ws-col-num ws-split-keep" })}
            ${cell(escapeHtml(item.source), { title: item.source })}
            ${cell(escapeHtml(enumLabel(item.category)))}
            ${cell(statusBadge(item.status))}
            ${cell(escapeHtml(formatDate(item.updated_at)))}
          </tr>`,
        )
        .join("")}</tbody>
    </table>`,
  news: (list) => `
    <table class="ws-table insure-table news-table">
      ${head([[t("title")], [t("collection")], [t("carrier")], [t("category")], [t("published")], [t("status")], [t("completeness"), "ws-col-num ws-split-keep"]])}
      <tbody>${list
        .map(
          (item) => `${rowOpen(item.id)}
            ${primary(item.title)}
            ${cell(escapeHtml(collectionShort(item)), { title: collectionLabel(item) })}
            ${cell(escapeHtml(item.source), { title: item.source })}
            ${cell(escapeHtml(enumLabel(item.category)))}
            ${cell(escapeHtml(formatDate(item.published_at)))}
            ${cell(statusBadge(item.status))}
            ${cell(completeness(item), { className: "ws-col-num ws-split-keep" })}
          </tr>`,
        )
        .join("")}</tbody>
    </table>`,
  feedback: (list) => `
    <table class="ws-table insure-table feedback-table">
      ${head([[t("title")], [t("status")], [t("carrier")], [t("category")], [t("created")], [t("completeness"), "ws-col-num"]])}
      <tbody>${list
        .map(
          (item) => `${rowOpen(item.id)}
            ${primary(item.title)}
            ${cell(statusBadge(item.status))}
            ${cell(escapeHtml(item.source), { title: item.source })}
            ${cell(escapeHtml(enumLabel(item.category)))}
            ${cell(escapeHtml(formatDate(item.created_at)))}
            ${cell(completeness(item), { className: "ws-col-num" })}
          </tr>`,
        )
        .join("")}</tbody>
    </table>`,
};

function newsFilters() {
  const m = metrics();
  const totals = { all: m.news_count, featured: m.featured_count, notice: m.notice_count };
  const labels = { all: t("all"), featured: t("featuredShort"), notice: t("noticesShort") };
  return NEWS_COLLECTIONS.map((value) => {
    const count = totals[value];
    return `<button type="button" class="segment${state.route.collection === value ? " active" : ""}" data-collection="${value}">${escapeHtml(labels[value])}${count === null || count === undefined ? "" : ` <b>${count}</b>`}</button>`;
  }).join("");
}

// Load more: a visible action, one page per collection per click.
function loadMoreControl(view) {
  if (!isPartial(view) && !state.notice) return "";
  const loaded = items(view).length;
  const total = metrics()[TOTAL_KEY[view]];
  const summary =
    total === null || total === undefined ? fill(t("loadedCount"), { loaded }) : fill(t("loadedOf"), { loaded, total });
  return `
    <div class="load-more">
      ${state.notice ? `<span class="load-more-error">${escapeHtml(state.notice)}</span>` : ""}
      ${isPartial(view) ? `<button type="button" class="button" data-load-more ${state.loadingMore ? "disabled" : ""}>${escapeHtml(state.loadingMore ? t("loadingMore") : t("loadMore"))}</button>` : ""}
      <span class="load-more-summary">${escapeHtml(summary)}</span>
    </div>`;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const list = filteredItems(view);
  els.viewCount.textContent = `${list.length}${isPartial(view) ? "+" : ""}`;
  els.viewFilters.hidden = view !== "news";
  els.viewFilters.innerHTML = view === "news" ? newsFilters() : "";
  const failed = (state.snapshot?.warnings || []).filter((warning) => warning.view === view);
  const empty = state.route.query
    ? emptyState(t("noResults"))
    : emptyState(failed.length ? t("readFailed") : t("empty"), failed.map((warning) => warning.message).join(" · "));
  els.listPanel.innerHTML = `${list.length ? TABLES[view](list) : empty}${loadMoreControl(view)}`;
  renderDetail();
}

const DETAIL = {
  files: (item) => ({
    title: item.name,
    meta: [item.path, formatBytes(item.size), formatDate(item.updated_at)],
    sections: [
      [t("missingFields"), `<div class="missing-list">${missingMarkup(item)}</div>`],
      [t("fileMetadata"), keyValueTable(fieldEntries(item.metadata))],
    ],
  }),
  qa: (item) => ({
    title: item.question,
    meta: [item.source || t("source"), enumLabel(item.category), formatDate(item.updated_at)],
    sections: [
      [t("answer"), `<p class="detail-body">${escapeHtml(item.answer)}</p>`],
      [t("missingFields"), `<div class="missing-list">${missingMarkup(item)}</div>`],
      [t("baseFields"), keyValueTable(fieldEntries(item.fields, ["question", "answer", "status", "carrier", "category"]))],
    ],
  }),
  news: (item) => ({
    title: item.title,
    meta: [collectionLabel(item), item.source, enumLabel(item.category), formatDate(item.published_at)],
    sections: [
      [
        t("summary"),
        `<p class="detail-body">${escapeHtml(item.summary)}</p>${item.url ? `<p><a class="detail-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(t("openSource"))} ↗</a></p>` : ""}`,
      ],
      [t("missingFields"), `<div class="missing-list">${missingMarkup(item)}</div>`],
      [t("baseFields"), keyValueTable(fieldEntries(item.fields, ["title", "content", "source_url", "status", "carrier", "category", "published_at"]))],
    ],
  }),
  feedback: (item) => ({
    title: item.title,
    meta: [enumLabel(item.category), item.source, formatDate(item.created_at)],
    sections: [
      [t("feedbackContent"), `<p class="detail-body">${escapeHtml(item.content)}</p>`],
      [
        t("submittedBy"),
        keyValueTable([
          [t("userName"), item.user_name],
          [t("contact"), item.contact],
          [t("rating"), item.rating],
        ]),
      ],
      [t("missingFields"), `<div class="missing-list">${missingMarkup(item)}</div>`],
      [
        t("baseFields"),
        keyValueTable(
          fieldEntries(item.fields, [
            "title",
            "content",
            "status",
            "user_name",
            "contact",
            "rating",
            "tags",
            "source",
            "category",
            "created_at",
          ]),
        ),
      ],
    ],
  }),
};

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  if (!RECORD_VIEWS.includes(view)) return;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  // On a phone every mode is already a page.
  els.detailExpand.hidden = !selectedId || presentation === "page" || isMobileLayout();
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectRecord"))}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="ws-detail-empty">${escapeHtml(t("loading"))}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const detail = DETAIL[view](item);
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>${escapeHtml(detail.title)}</h2>
      <p class="muted">${escapeHtml(detail.meta.filter(Boolean).join(" · "))}</p>
      <div class="detail-badges">
        ${completeness(item)}
        ${view === "files" ? "" : statusBadge(item.status)}
        ${(item.tags || []).map((tag) => `<span class="badge">${escapeHtml(enumLabel(tag, "tag"))}</span>`).join("")}
      </div>
    </header>
    ${detail.sections
      .map(([heading, body]) => `<section class="detail-section"><h3>${escapeHtml(heading)}</h3>${body}</section>`)
      .join("")}
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function fieldTable(fields = []) {
  return keyValueTable(fields.map((field) => [field.key, field.value]));
}

function renderSettings() {
  const summary = state.settings?.config_summary || {};
  byId("settingsBody").innerHTML = `
    <section class="settings-grid">
      ${warningsMarkup()}
      <article class="card settings-card">
        <h2>${escapeHtml(t("busabaseTargets"))}</h2>
        ${keyValueTable([
          [t("dataProvider"), state.settings?.data_provider || ""],
          [t("configPath"), summary.config_path || ""],
          [t("files"), summary.drive?.slug || ""],
          [t("featured"), summary.bases?.featured || ""],
          [t("notices"), summary.bases?.notices || ""],
          [t("qa"), summary.bases?.qa || ""],
          [t("feedback"), summary.bases?.feedback || ""],
        ])}
      </article>
      <article class="card settings-card">
        <h2>${escapeHtml(t("driveMetadata"))}</h2>
        ${fieldTable(state.snapshot?.drive?.metadata_fields || [])}
      </article>
      <article class="card settings-card settings-wide">
        <h2>${escapeHtml(t("baseFields"))}</h2>
        <h3>${escapeHtml(t("featured"))}</h3>
        ${fieldTable(state.snapshot?.bases?.featured?.fields || [])}
        <h3>${escapeHtml(t("notices"))}</h3>
        ${fieldTable(state.snapshot?.bases?.notices?.fields || [])}
        <h3>${escapeHtml(t("qa"))}</h3>
        ${fieldTable(state.snapshot?.bases?.qa?.fields || [])}
        <h3>${escapeHtml(t("feedback"))}</h3>
        ${fieldTable(state.snapshot?.bases?.feedback?.fields || [])}
      </article>
    </section>
  `;
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const ready = Boolean(state.snapshot);
  const { view, selectedId, presentation } = state.route;
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
  renderShell();
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-load-more]")) {
    loadMore(state.route.view);
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
byId("overviewBody").addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const row = event.target.closest("tr[data-href]");
  if (row) location.hash = row.dataset.href;
});
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-collection]");
  if (!segment) return;
  replaceRoute(`#/news${routeQuery({ peek: state.route.peek }, { ...state.route, collection: segment.dataset.collection })}`);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("input, textarea, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
els.sidebarToggle.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) button?.addEventListener("click", () => loadState());
els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-insure-data-language", state.lang);
  render();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    renderSetupRequired(error, boot);
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
