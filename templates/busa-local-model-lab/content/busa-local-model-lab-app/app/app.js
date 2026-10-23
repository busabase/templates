import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Record views and the Base each one lists.
const VIEWS = {
  examples: { base: "training-examples", key: "example_id", rows: "examples" },
  runs: { base: "training-runs", key: "run_id", rows: "runs" },
  evaluations: { base: "evaluations", key: "run_id", rows: "comparisons" },
  registry: { base: "model-registry", key: "model_id", rows: "models" },
};
// Where a record opens, per view — declared once in config.js `ui.detail_modes`:
//   examples    → split:  the dataset is a review queue worked top to bottom,
//                         one verdict after the next, so the queue stays beside it.
//   runs        → drawer: a run is a status fact you scan many of (claim,
//                         heartbeat, artifacts, error), read, and return.
//   evaluations → drawer: open one baseline/adapter comparison, record a
//                         promote/hold/reject verdict, and return to the list.
//   registry    → drawer: an adapter's lineage is a handful of facts to look up.
// A `/<id>` path always opens the full page; `?peek=<id>` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
const DETAIL_MODES = Object.fromEntries(
  Object.entries(VIEWS).map(([view, { base }]) => [view, appConfig.ui.detail_modes[base] || "drawer"]),
);
const RECORD_VIEWS = Object.keys(VIEWS);

const params = new URLSearchParams(location.search);
const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(params.get("lang") || localStorage.getItem("busa-local-model-lab-language") || "auto"),
  messages: { en: {}, zh: {} },
  busy: false,
  // Set after a write the server queued for review; cleared on the next write
  // or when another record is opened.
  notice: "",
  loadingMore: new Set(),
  settingsTab: "guide",
  // Records opened by URL that are not on a loaded page: id → record | null (missing) | undefined (loading).
  extra: new Map(),
};

const els = {
  loadState: document.querySelector("#loadState"),
  overviewPage: document.querySelector("#overviewPage"),
  overviewMetrics: document.querySelector("#overviewMetrics"),
  overviewBody: document.querySelector("#overviewBody"),
  viewPage: document.querySelector("#viewPage"),
  viewTitle: document.querySelector("#viewTitle"),
  viewCount: document.querySelector("#viewCount"),
  listPanel: document.querySelector("#listPanel"),
  detailPanel: document.querySelector("#detailPanel"),
  detailBody: document.querySelector("#detailBody"),
  detailBack: document.querySelector("#detailBack"),
  detailExpand: document.querySelector("#detailExpand"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  reviewCount: document.querySelector("#review-count"),
  activeRunCount: document.querySelector("#active-run-count"),
  candidateCount: document.querySelector("#candidate-count"),
  language: document.querySelector("#language"),
};

function normalizeLang(value) {
  return String(value || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : value || "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return state.messages[activeLang()]?.[key] || state.messages.en[key] || key;
}

function label(value, group = "status") {
  return state.messages[activeLang()]?.enum?.[group]?.[value] || state.messages.en.enum?.[group]?.[value] || value;
}

async function loadMessages() {
  const [en, zh] = await Promise.all([
    fetch("./i18n/en.json").then((response) => response.json()),
    fetch("./i18n/zh-CN.json").then((response) => response.json()),
  ]);
  state.messages = { en, zh };
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in the
// URL so refresh, shared links and Back restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const search = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? search.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: search.get("q") || "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const search = new URLSearchParams();
  if (route.query) search.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its list replaces nothing, so Close/Escape can step
  // Back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.view !== state.route.view || previous.selectedId !== state.route.selectedId) state.notice = "";
  els.search.value = state.route.query;
  setSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Search keystrokes should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Formatting ─────────────────────────────────────────────────────────────
function escapeHtml(value) {
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

// null/undefined is an unknown figure (a count the server could not answer), never 0.
function number(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

const pct = (value) => `${number(value, 1)}%`;
const delta = (value) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${number(value, 1)} pp`;

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(activeLang() === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(activeLang() === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium" });
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  els.sidebarScrim.hidden = !open;
}

function syncResponsive() {
  if (!isMobile()) setSidebarOpen(false);
  if (state.data && RECORD_VIEWS.includes(state.route.view)) renderDetail();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.data = await provider.getState();
  state.extra = new Map();
  closeConnectGate();
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function applyDemoRoute() {
  if (!state.data?.demo || location.hash) return;
  const scenario = state.data.demo_scenario;
  const route =
    scenario === "dataset"
      ? "#/examples?peek=EX-004"
      : scenario === "evaluations"
        ? "#/evaluations?peek=RUN-001"
        : scenario === "registry"
          ? "#/registry"
          : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  previousRouteWasList = false;
}

const rowsOf = (view) => state.data?.snapshot?.[VIEWS[view].rows] || [];

function recordById(view, id) {
  const loaded = rowsOf(view).find((item) => item[VIEWS[view].key] === id);
  if (loaded) return loaded;
  return state.extra.get(`${view}:${id}`) || null;
}

// A shared link can name a record beyond the loaded page: fetch just that one.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.data || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const cacheKey = `${view}:${selectedId}`;
  if (rowsOf(view).some((item) => item[VIEWS[view].key] === selectedId) || state.extra.has(cacheKey)) return;
  state.extra.set(cacheKey, undefined);
  renderDetail();
  const provider = await getProvider();
  const record = await provider.findRecord(VIEWS[view].base, selectedId).catch(() => null);
  state.extra.set(cacheKey, record || null);
  if (state.route.view === view && state.route.selectedId === selectedId) renderDetail();
}

async function loadMore(key) {
  if (state.loadingMore.has(key)) return;
  state.loadingMore.add(key);
  render();
  try {
    const provider = await getProvider();
    const next = await provider.loadMore(key);
    state.data = { ...state.data, ...next };
  } finally {
    state.loadingMore.delete(key);
    render();
  }
}

// ── Shell ──────────────────────────────────────────────────────────────────
function shell() {
  const counts = state.data?.snapshot?.counts || {};
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("search");
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.classList.toggle("active", node.dataset.route === state.route.view);
  });
  els.reviewCount.textContent = number(counts.needs_review);
  els.activeRunCount.textContent = number(counts.active_runs);
  els.candidateCount.textContent = number(counts.candidate_models);
  els.syncStatus.textContent = state.data?.demo ? t("demo") : t("busabase");
  els.mobileViewTitle.textContent = t(state.route.view) || t("overview");
  els.mobileViewMeta.textContent = state.data?.demo ? t("demo") : t("busabase");
  els.language.value = state.lang;
}

function render() {
  if (!state.data) return;
  document.querySelector(".modal-backdrop")?.remove();
  shell();
  const { view, selectedId, presentation } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
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
  if (view === "settings") document.body.insertAdjacentHTML("beforeend", settingsModal());
}

// ── Overview ───────────────────────────────────────────────────────────────
function latestComparison() {
  return state.data?.snapshot?.comparisons?.find((item) => item.adapter && item.baseline) || null;
}

function renderOverview() {
  const snapshot = state.data.snapshot;
  const counts = snapshot.counts;
  const comparison = latestComparison();
  // ≤3 numbers, none of them already in the sidebar (needs review, active
  // runs, candidate adapters live there; the latest delta is in its panel).
  els.overviewMetrics.innerHTML = [
    [t("approvedExamples"), number(counts.approved)],
    [t("approvedSplit"), [counts.train, counts.valid, counts.test].map((value) => number(value)).join(" / ")],
    [t("completedRuns"), number(counts.completed_runs)],
  ]
    .map(([name, value]) => `<div><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  els.overviewBody.innerHTML = `
    <section class="lab-overview-grid">
      <div class="overview-panel">
        <div class="panel-heading"><h2>${escapeHtml(t("pipeline"))}</h2><span class="badge">Busabase → MLX</span></div>
        <ol class="pipeline-list">
          <li><strong>${escapeHtml(t("curate"))}</strong><span>${escapeHtml(t("curateCopy"))}</span></li>
          <li><strong>${escapeHtml(t("snapshot"))}</strong><span>${escapeHtml(t("snapshotCopy"))}</span></li>
          <li><strong>${escapeHtml(t("train"))}</strong><span>${escapeHtml(t("trainCopy"))}</span></li>
          <li><strong>${escapeHtml(t("evaluate"))}</strong><span>${escapeHtml(t("evaluateCopy"))}</span></li>
        </ol>
      </div>
      <div class="overview-panel">
        <div class="panel-heading"><h2>${escapeHtml(t("latestComparison"))}</h2>${comparison ? `<span class="badge ${comparison.schema_delta > 0 ? "sev-info" : "sev-high"}">${escapeHtml(delta(comparison.schema_delta))}</span>` : ""}</div>
        ${
          comparison
            ? `
          <div class="comparison-bars">
            <div><span>${escapeHtml(t("baseline"))}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, comparison.baseline.schema_valid_pct))}%"></i></div><strong>${pct(comparison.baseline.schema_valid_pct)}</strong></div>
            <div><span>${escapeHtml(t("adapter"))}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, comparison.adapter.schema_valid_pct))}%"></i></div><strong>${pct(comparison.adapter.schema_valid_pct)}</strong></div>
          </div>
          <a class="text-link" href="${escapeHtml(recordUrl(comparison.run_id, "evaluations"))}">${escapeHtml(t("openEvaluation"))}</a>
        `
            : `<div class="empty">${escapeHtml(t("noEvaluation"))}</div>`
        }
      </div>
    </section>
    <section class="overview-panel recent-runs">
      <div class="panel-heading"><h2>${escapeHtml(t("recentRuns"))}</h2><a class="text-link" href="#/runs">${escapeHtml(t("viewAll"))}</a></div>
      ${snapshot.runs.length ? runsTable(snapshot.runs.slice(0, 4), { link: true }) : `<div class="empty">${escapeHtml(t("noRuns"))}</div>`}
    </section>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const matches = (values, query) => values.some((value) => String(value ?? "").toLowerCase().includes(query));

function filteredRows(view) {
  const query = state.route.query.trim().toLowerCase();
  const rows = rowsOf(view);
  if (!query) return rows;
  return rows.filter((item) => {
    if (view === "examples")
      return matches([item.example_id, item.prompt, item.task, item.split, item.status, label(item.status)], query);
    if (view === "runs")
      return matches([item.run_id, item.title, item.base_model, item.method, item.status, label(item.status)], query);
    if (view === "evaluations")
      return matches([item.run_id, runTitle(item.run_id), item.adapter?.verdict, item.adapter?.decision_note], query);
    return matches([item.model_id, item.display_name, item.base_model, item.training_run_id, item.status], query);
  });
}

const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const badge = (value, group = "status") =>
  `<span class="badge status-${escapeHtml(value)}">${escapeHtml(label(value, group))}</span>`;

function examplesTable(items) {
  return `<table class="ws-table lab-table">
    <thead><tr><th>${escapeHtml(t("example"))}</th><th>${escapeHtml(t("status"))}</th><th class="ws-col-narrow">${escapeHtml(t("split"))}</th><th class="ws-col-wide">${escapeHtml(t("task"))}</th><th>${escapeHtml(t("updated"))}</th></tr></thead>
    <tbody>${items
      .map(
        (item) =>
          `${rowOpen(item.example_id)}<td title="${escapeHtml(item.prompt)}"><span class="row-id">${escapeHtml(item.example_id)}</span> ${escapeHtml(item.prompt)}</td><td>${badge(item.status)}</td><td>${escapeHtml(label(item.split, "split"))}</td><td>${escapeHtml(item.task)}</td><td>${escapeHtml(formatTime(item.reviewed_at || item.updated_at))}</td></tr>`,
      )
      .join("")}</tbody></table>`;
}

function runsTable(runs, { link = false } = {}) {
  return `<table class="ws-table lab-table">
    <thead><tr><th>${escapeHtml(t("run"))}</th><th>${escapeHtml(t("status"))}</th><th>${escapeHtml(t("model"))}</th><th class="ws-col-num">${escapeHtml(t("attempt"))}</th><th class="ws-col-wide">${escapeHtml(t("updated"))}</th></tr></thead>
    <tbody>${runs
      .map(
        (run) =>
          `${link ? `<tr data-href="${escapeHtml(recordUrl(run.run_id, "runs"))}">` : rowOpen(run.run_id)}<td><span class="row-id">${escapeHtml(run.run_id)}</span> ${escapeHtml(run.title)}</td><td${run.error ? ` title="${escapeHtml(run.error)}"` : ""}>${badge(run.status)}</td><td title="${escapeHtml(run.base_model)}">${escapeHtml(run.base_model)}</td><td class="ws-col-num">${number(run.attempt)}</td><td>${escapeHtml(formatTime(run.completed_at || run.heartbeat_at || run.created_at))}</td></tr>`,
      )
      .join("")}</tbody></table>`;
}

function runTitle(runId) {
  return state.data?.snapshot?.runs?.find((run) => run.run_id === runId)?.title || "";
}

function evaluationsTable(items) {
  return `<table class="ws-table lab-table">
    <thead><tr><th>${escapeHtml(t("run"))}</th><th class="ws-col-narrow">${escapeHtml(t("verdict"))}</th><th class="ws-col-num">${escapeHtml(t("baselineSchema"))}</th><th class="ws-col-num">${escapeHtml(t("adapterSchema"))}</th><th class="ws-col-num">${escapeHtml(t("schemaDelta"))}</th><th class="ws-col-num">${escapeHtml(t("exactDelta"))}</th><th>${escapeHtml(t("evaluated"))}</th></tr></thead>
    <tbody>${items
      .map((item) => {
        const latest = item.adapter || item.baseline;
        return `${rowOpen(item.run_id)}<td><span class="row-id">${escapeHtml(item.run_id)}</span> ${escapeHtml(runTitle(item.run_id))}</td><td>${item.adapter ? badge(item.adapter.verdict || "needs_review", "verdict") : `<span class="muted">${escapeHtml(t("noAdapter"))}</span>`}</td><td class="ws-col-num">${item.baseline ? pct(item.baseline.schema_valid_pct) : "—"}</td><td class="ws-col-num">${item.adapter ? pct(item.adapter.schema_valid_pct) : "—"}</td><td class="ws-col-num">${escapeHtml(delta(item.schema_delta))}</td><td class="ws-col-num">${escapeHtml(delta(item.exact_delta))}</td><td>${escapeHtml(formatTime(latest?.evaluated_at))}</td></tr>`;
      })
      .join("")}</tbody></table>`;
}

function registryTable(models) {
  return `<table class="ws-table lab-table registry-table">
    <thead><tr><th>${escapeHtml(t("model"))}</th><th>${escapeHtml(t("status"))}</th><th class="ws-col-wide">${escapeHtml(t("baseModel"))}</th><th>${escapeHtml(t("trainingRun"))}</th><th>${escapeHtml(t("adapterFile"))}</th><th>${escapeHtml(t("registered"))}</th></tr></thead>
    <tbody>${models
      .map(
        (model) =>
          `${rowOpen(model.model_id)}<td>${escapeHtml(model.display_name || model.model_id)}</td><td>${badge(model.status)}</td><td title="${escapeHtml(model.base_model)}">${escapeHtml(model.base_model)}</td><td>${escapeHtml(model.training_run_id || "-")}</td><td title="${escapeHtml(model.adapter_file)}">${escapeHtml(model.adapter_file || "-")}</td><td title="${escapeHtml(formatTime(model.registered_at))}">${escapeHtml(formatDate(model.registered_at))}</td></tr>`,
      )
      .join("")}</tbody></table>`;
}

const VIEW_TABLES = { examples: examplesTable, runs: runsTable, evaluations: evaluationsTable, registry: registryTable };
const VIEW_EMPTY = { examples: "noExamples", runs: "noRuns", evaluations: "noEvaluation", registry: "noModels" };
const VIEW_HINT = {
  examples: "examplesSubtitle",
  runs: "runsSubtitle",
  evaluations: "evaluationsSubtitle",
  registry: "registrySubtitle",
};

function loadMoreControl(key) {
  const page = state.data?.paging?.[key];
  if (!page?.hasMore) return "";
  const total = page.total === null || page.total === undefined ? "" : ` / ${number(page.total)}`;
  return `<div class="load-more-row"><button type="button" class="button" data-load-more="${escapeHtml(key)}" ${state.loadingMore.has(key) ? "disabled" : ""}>${escapeHtml(state.loadingMore.has(key) ? t("loading") : t("loadMore"))}</button><span>${number(page.loaded)}${total}</span></div>`;
}

function renderRecordView() {
  const { view } = state.route;
  const items = filteredRows(view);
  els.viewTitle.textContent = t(view);
  // The view's description lives in the title tooltip, not on a line of its own.
  els.viewTitle.title = t(VIEW_HINT[view]);
  els.viewCount.textContent = number(items.length);
  const empty = `<div class="empty-state"><strong>${escapeHtml(state.route.query ? t("noMatches") : t(VIEW_EMPTY[view]))}</strong></div>`;
  els.listPanel.innerHTML = `${items.length ? VIEW_TABLES[view](items) : empty}${loadMoreControl(VIEWS[view].base)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  if (!RECORD_VIEWS.includes(view)) return;
  els.detailBack.textContent = presentation === "page" || isMobile() ? t("backToList") : t("close");
  els.detailExpand.textContent = t("openFullPage");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split"
        ? `<div class="ws-detail-empty"><strong>${escapeHtml(t("selectExample"))}</strong><br>${escapeHtml(t("selectExampleCopy"))}</div>`
        : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const loading = state.extra.has(`${view}:${selectedId}`) && state.extra.get(`${view}:${selectedId}`) === undefined;
    els.detailBody.innerHTML = `<div class="ws-detail-empty">${escapeHtml(loading ? t("loading") : t("recordMissing"))}</div>`;
    return;
  }
  const notice = state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : "";
  els.detailBody.innerHTML =
    notice +
    (view === "examples"
      ? exampleDetail(item)
      : view === "runs"
        ? runDetail(item)
        : view === "evaluations"
          ? evaluationDetail(item)
          : modelDetail(item));
}

const facts = (rows) =>
  `<dl class="fact-list">${rows.map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value || "-")}</dd>`).join("")}</dl>`;

function exampleDetail(example) {
  return `<div class="lab-detail">
    <div class="detail-heading"><span class="row-id">${escapeHtml(example.example_id)}</span><h2>${escapeHtml(example.task)}</h2><div class="detail-badges">${badge(example.status)}<span class="badge">${escapeHtml(label(example.split, "split"))}</span></div></div>
    <section><h3>${escapeHtml(t("prompt"))}</h3><div class="prompt-block">${escapeHtml(example.prompt)}</div></section>
    <section><h3>${escapeHtml(t("idealResponse"))}</h3><pre class="json-block">${escapeHtml(example.ideal_response)}</pre></section>
    <section><h3>${escapeHtml(t("provenance"))}</h3>${facts([
      [t("source"), example.source],
      ["SHA", example.content_hash],
      [t("reviewed"), example.reviewed_at ? formatTime(example.reviewed_at) : ""],
    ])}</section>
    <section class="review-box">
      <label for="review-note">${escapeHtml(t("reviewNote"))}</label>
      <textarea id="review-note" rows="3" placeholder="${escapeHtml(t("reviewPlaceholder"))}">${escapeHtml(example.review_note)}</textarea>
      <div class="review-actions">
        <button class="primary" type="button" data-example-verdict="approve" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("approve"))}</button>
        <button type="button" data-example-verdict="request_changes" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("requestChanges"))}</button>
        <button class="danger-quiet" type="button" data-example-verdict="block" data-example-id="${escapeHtml(example.example_id)}">${escapeHtml(t("block"))}</button>
      </div>
    </section>
  </div>`;
}

function runDetail(run) {
  const config = run.config && Object.keys(run.config).length ? JSON.stringify(run.config, null, 2) : "";
  return `<div class="lab-detail">
    <div class="detail-heading"><span class="row-id">${escapeHtml(run.run_id)}</span><h2>${escapeHtml(run.title)}</h2><div class="detail-badges">${badge(run.status)}<span class="badge">${escapeHtml(run.method)}</span></div></div>
    ${run.error ? `<div class="error-block">${escapeHtml(run.error)}</div>` : ""}
    <section><h3>${escapeHtml(t("inputs"))}</h3>${facts([
      [t("baseModel"), run.base_model],
      [t("baseRevision"), run.base_revision],
      [t("datasetSnapshot"), run.dataset_snapshot],
      [t("datasetHash"), run.dataset_hash],
    ])}</section>
    ${config ? `<section><h3>${escapeHtml(t("trainingConfig"))}</h3><pre class="json-block">${escapeHtml(config)}</pre></section>` : ""}
    <section><h3>${escapeHtml(t("worker"))}</h3>${facts([
      [t("claimant"), run.claimant],
      [t("claimedAt"), run.claimed_at ? formatTime(run.claimed_at) : ""],
      [t("heartbeat"), run.heartbeat_at ? formatTime(run.heartbeat_at) : ""],
      [t("attempt"), number(run.attempt)],
      [t("created"), formatTime(run.created_at)],
      [t("completed"), run.completed_at ? formatTime(run.completed_at) : ""],
    ])}</section>
    <section><h3>${escapeHtml(t("artifacts"))}</h3>${facts([
      [t("adapterFile"), run.adapter_file],
      [t("reportFile"), run.report_file],
    ])}</section>
    <div class="boundary-note">${escapeHtml(t("workerBoundary"))}</div>
  </div>`;
}

function evaluationDetail(comparison) {
  const { adapter, baseline } = comparison;
  const cell = (evaluation, field) => (evaluation ? pct(evaluation[field]) : "—");
  const latency = (evaluation) => (evaluation ? `${number(evaluation.latency_ms, 0)} ms` : "—");
  const title = runTitle(comparison.run_id);
  return `<div class="lab-detail">
    <div class="detail-heading"><span class="row-id">${escapeHtml(comparison.run_id)}</span><h2>${escapeHtml(title || t("baselineVsAdapter"))}</h2><div class="detail-badges">${adapter ? badge(adapter.verdict || "needs_review", "verdict") : ""}</div></div>
    <section><h3>${escapeHtml(t("baselineVsAdapter"))}</h3>
      <div class="eval-grid"><span></span><strong>${escapeHtml(t("baseline"))}</strong><strong>${escapeHtml(t("adapter"))}</strong>
        <span>${escapeHtml(t("jsonValid"))}</span><b>${cell(baseline, "json_valid_pct")}</b><b>${cell(adapter, "json_valid_pct")}</b>
        <span>${escapeHtml(t("schemaValid"))}</span><b>${cell(baseline, "schema_valid_pct")}</b><b>${cell(adapter, "schema_valid_pct")}</b>
        <span>${escapeHtml(t("exactFields"))}</span><b>${cell(baseline, "exact_field_pct")}</b><b>${cell(adapter, "exact_field_pct")}</b>
        <span>${escapeHtml(t("latency"))}</span><b>${latency(baseline)}</b><b>${latency(adapter)}</b>
      </div>
    </section>
    <section><h3>${escapeHtml(t("provenance"))}</h3>${facts([
      [t("cases"), number((adapter || baseline)?.case_count)],
      [t("datasetHash"), (adapter || baseline)?.dataset_hash],
      [`${t("reportFile")} · ${t("baseline")}`, baseline?.report_file],
      [`${t("reportFile")} · ${t("adapter")}`, adapter?.report_file],
    ])}</section>
    ${
      adapter
        ? `<section class="review-box">
      <label for="evaluation-note">${escapeHtml(t("decisionNote"))}</label>
      <textarea id="evaluation-note" class="evaluation-note" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}" rows="3">${escapeHtml(adapter.decision_note)}</textarea>
      <div class="review-actions"><button class="primary" type="button" data-evaluation-verdict="promote" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("promote"))}</button><button type="button" data-evaluation-verdict="hold" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("hold"))}</button><button class="danger-quiet" type="button" data-evaluation-verdict="reject" data-evaluation-id="${escapeHtml(adapter.evaluation_id)}">${escapeHtml(t("reject"))}</button></div>
    </section>`
        : `<div class="boundary-note">${escapeHtml(t("noAdapterCopy"))}</div>`
    }
  </div>`;
}

function modelDetail(model) {
  return `<div class="lab-detail">
    <div class="detail-heading"><span class="row-id">${escapeHtml(model.model_id)}</span><h2>${escapeHtml(model.display_name || model.model_id)}</h2><div class="detail-badges">${badge(model.status)}</div></div>
    <section><h3>${escapeHtml(t("lineage"))}</h3>${facts([
      [t("baseModel"), model.base_model],
      [t("baseRevision"), model.base_revision],
      [t("trainingRun"), model.training_run_id],
      [t("datasetHash"), model.dataset_hash],
      [t("adapterFile"), model.adapter_file],
      [t("registered"), formatTime(model.registered_at)],
    ])}</section>
    ${model.notes ? `<section><h3>${escapeHtml(t("notes"))}</h3><p class="detail-notes">${escapeHtml(model.notes)}</p></section>` : ""}
  </div>`;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function settingsModal() {
  const resources = state.data.resources || {};
  const settings = state.data.snapshot.settings || {};
  const tabs = ["guide", "resources", "training"];
  const panel =
    state.settingsTab === "resources"
      ? facts([
          [t("provider"), state.data.data_provider],
          [t("folder"), resources.folder_name],
          [t("bases"), Object.keys(resources.base_ids || {}).join(", ")],
        ])
      : state.settingsTab === "training"
        ? facts([
            [t("baseModel"), settings.base_model],
            [t("method"), settings.method],
            [t("worker"), settings.local_worker?.status || t("notReported")],
          ])
        : `<div class="guide-copy"><p>${escapeHtml(t("guideCopy"))}</p><ol><li>${escapeHtml(t("curateCopy"))}</li><li>${escapeHtml(t("snapshotCopy"))}</li><li>${escapeHtml(t("trainCopy"))}</li><li>${escapeHtml(t("evaluateCopy"))}</li></ol></div>`;
  return `<div class="modal-backdrop" data-close-settings><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("settings"))}"><header><h2>${escapeHtml(t("settings"))}</h2><button type="button" data-close-settings aria-label="${escapeHtml(t("close"))}" title="${escapeHtml(t("close"))}">×</button></header><div class="modal-tabs">${tabs.map((tab) => `<button type="button" class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}">${escapeHtml(t(tab))}</button>`).join("")}</div><div class="modal-body">${panel}</div></section></div>`;
}

// ── Writes ─────────────────────────────────────────────────────────────────
async function reviewExample(id, verdict) {
  const example = recordById("examples", id);
  if (!example || state.busy) return;
  state.busy = true;
  state.notice = "";
  try {
    const note = document.querySelector("#review-note")?.value || "";
    const provider = await getProvider();
    const result = await provider.reviewExample(example, verdict, note);
    await loadState();
    // Without write access the verdict is a ChangeRequest, and the example
    // keeps its old status until someone who has it approves: say so.
    if (result?.pending) {
      state.notice = t("savedForReview");
      render();
    }
  } finally {
    state.busy = false;
  }
}

async function decideEvaluation(id, verdict) {
  const evaluation = state.data.snapshot.evaluations.find((item) => item.evaluation_id === id);
  if (!evaluation || state.busy) return;
  state.busy = true;
  state.notice = "";
  try {
    const note = document.querySelector(`.evaluation-note[data-evaluation-id="${CSS.escape(id)}"]`)?.value || "";
    const provider = await getProvider();
    const result = await provider.decideEvaluation(evaluation, verdict, note);
    await loadState();
    // Without write access the verdict is a ChangeRequest, and the evaluation
    // keeps its old decision until someone who has it approves: say so.
    if (result?.pending) {
      state.notice = t("savedForReview");
      render();
    }
  } finally {
    state.busy = false;
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsive);
els.sidebarToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
els.mobileSidebarToggle.addEventListener("click", () => setSidebarOpen(true));
els.sidebarScrim.addEventListener("click", () => setSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.detailBack.addEventListener("click", closeDetail);
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-local-model-lab-language", state.lang);
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.route.view === "settings") {
    location.hash = "#/overview";
    return;
  }
  // Escape inside a note only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
document.addEventListener("click", (event) => {
  const loadMoreAction = event.target.closest("[data-load-more]");
  if (loadMoreAction) loadMore(loadMoreAction.dataset.loadMore);
  const exampleAction = event.target.closest("[data-example-verdict]");
  if (exampleAction) reviewExample(exampleAction.dataset.exampleId, exampleAction.dataset.exampleVerdict);
  const evaluationAction = event.target.closest("[data-evaluation-verdict]");
  if (evaluationAction)
    decideEvaluation(evaluationAction.dataset.evaluationId, evaluationAction.dataset.evaluationVerdict);
  const tab = event.target.closest("[data-settings-tab]");
  if (tab) {
    state.settingsTab = tab.dataset.settingsTab;
    render();
  }
  const close = event.target.closest("[data-close-settings]");
  if (close && (close === event.target || close.tagName === "BUTTON")) location.hash = "#/overview";
  if (event.target.closest("a, button")) return;
  const link = event.target.closest("tr[data-href]");
  if (link) {
    location.hash = link.dataset.href;
    return;
  }
  const row = event.target.closest("#listPanel tr[data-id]");
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

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadMessages();
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
boot();
