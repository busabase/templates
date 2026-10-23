import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeMetrics } from "./js/newsroom-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   signals → split:  today's signals are a review queue worked top to bottom,
//                     one decision after the next, so the queue stays beside it.
//   actions → drawer: an action is scanned with its siblings, one is read and
//                     decided, and you return to the list.
//   drafts  → page:   a draft is long copy edited in place — a workplace you
//                     stay in for minutes.
//   sources → drawer: a short list of facts, read and returned.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const DECISION_VIEWS = { signals: "signal", actions: "action", drafts: "draft" };
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-ai-newsroom.sidebarCollapsed";
const VIEW_HINT = {
  signals: "signalsHint",
  actions: "actionsHint",
  drafts: "draftsHint",
  sources: "sourcesHint",
  settings: "settingsHint",
};

const state = {
  batch: null,
  bootstrap: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-ai-newsroom-language") || "auto",
  ),
  saving: false,
  // { id, text, tone } — the result of the last decision, shown on that record.
  notice: null,
  // records.list exposes a forward keyset cursor; `cursors[key]` fetches the
  // next page. Load More appends exactly one page per click.
  cursors: {},
  loadingMore: {},
  totals: {},
  counts: null,
  // Records opened by URL that are not on the loaded page (records.get).
  extra: Object.fromEntries(RECORD_VIEWS.map((view) => [view, new Map()])),
  // Unsaved text per record, so a re-render never drops what was typed.
  edits: {},
};

const byId = (id) => document.getElementById(id);
const els = {
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
  needsReviewCount: byId("count-needs-review"),
  approvedCount: byId("count-approved"),
  blockedCount: byId("count-blocked"),
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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(activeLang() === "zh" ? "zh-CN" : "en-US");
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
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
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

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
const routeFor = (view) => (view === state.route.view ? state.route : { view, query: "" });
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) =>
  `#/${view}/${encodeURIComponent(id)}${routeQuery({}, routeFor(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id }, routeFor(view))}`;

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
  if (state.notice && state.notice.id !== state.route.selectedId) state.notice = null;
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

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.bootstrap = data;
  state.totals = data.totals || {};
  state.counts = data.counts || null;
  state.cursors = { ...(data.pagination || {}) };
  state.loadingMore = {};
  state.extra = Object.fromEntries(RECORD_VIEWS.map((view) => [view, new Map()]));
  window.dispatchEvent(new CustomEvent("busa-ai-newsroom:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// Appends exactly one page for `key`, skipping rows already on screen. The
// provider runs the same per-row normalizer it ran on page 1.
async function loadMore(key) {
  const cursor = state.cursors[key];
  if (!cursor || state.loadingMore[key] || typeof state.provider?.fetchPage !== "function") return;
  state.loadingMore[key] = true;
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchPage(key, cursor);
    const seen = new Set(itemsForView(key).map((item) => item.id));
    state.batch[key] = [...itemsForView(key), ...rows.filter((row) => !seen.has(row.id))];
    state.batch.metrics = computeMetrics(state.batch);
    state.cursors[key] = nextCursor || null;
  } catch (error) {
    state.notice = { id: "", text: error instanceof Error ? error.message : String(error), tone: "negative" };
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.batch || !selectedId || !RECORD_VIEWS.includes(view)) return;
  if (findItem(view, selectedId) || state.extra[view].has(selectedId)) return;
  if (typeof state.provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  try {
    state.extra[view].set(selectedId, (await state.provider.getRecord(view, selectedId)) || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.bootstrap?.demo || location.hash) return;
  const scenario = state.bootstrap.demo_scenario || "overview";
  const first = state.batch?.signals?.[0]?.id || "";
  const route = RECORD_VIEWS.includes(scenario)
    ? `#/${scenario}`
    : scenario === "detail" && first
      ? `#/signals?peek=${encodeURIComponent(first)}`
      : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function itemsForView(view) {
  return state.batch?.[view] || [];
}

// Loaded page first, then a record fetched on its own for the URL.
function findItem(view, id) {
  if (!id) return null;
  return itemsForView(view).find((item) => item.id === id) || state.extra[view]?.get(id) || null;
}

const hasMore = (key) => Boolean(state.cursors[key]);
const anyPartial = () => ["signals", "actions", "drafts"].some(hasMore);

// The per-view total next to each nav item: records.count when the provider
// has it, otherwise the loaded rows, marked `+` while more pages exist.
function navTotal(key) {
  if (state.totals[key] != null) return String(state.totals[key]);
  return `${itemsForView(key).length}${hasMore(key) ? "+" : ""}`;
}

// A count from records.count when available; otherwise derived from the loaded
// rows and marked partial when any of them has more pages.
function countOr(value, loaded, partial) {
  if (value != null) return String(value);
  return `${loaded}${partial ? "+" : ""}`;
}

function isConnected() {
  return Boolean(state.batch?.batch_id || state.batch?.signals?.length || state.batch?.actions?.length);
}

// ── Shell ──────────────────────────────────────────────────────────────────
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
  byId("settingsTitle").title = t("settingsHint");
  els.detailExpand.textContent = t("openFullPage");
}

function renderShell() {
  applyI18n();
  const metrics = state.batch?.metrics || {};
  const counts = state.counts || {};
  const partial = anyPartial();
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.batch ? t("loading") : state.bootstrap?.demo ? t("demoData") : t("liveData");
  const needsReview = countOr(counts.needs_review, metrics.needs_review ?? 0, partial);
  els.needsReviewCount.textContent = needsReview;
  els.approvedCount.textContent = countOr(counts.approved, metrics.approved ?? 0, partial);
  els.blockedCount.textContent = countOr(counts.blocked, metrics.blocked ?? 0, partial);
  for (const key of RECORD_VIEWS) {
    const node = byId(`nav-count-${key}`);
    if (node) node.textContent = state.batch ? navTotal(key) : "";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !state.batch
      ? t("loading")
      : isConnected()
        ? `${needsReview} ${t("needsReview")}`
        : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (RECORD_VIEWS.includes(view) || view === "settings") return t(view);
  return t("overview");
}

const statusBadge = (status) =>
  status ? `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>` : "";
const priorityBadge = (priority) =>
  priority ? `<span class="badge priority-${escapeHtml(priority)}">${escapeHtml(enumLabel(priority, "priority"))}</span>` : "";
const riskBadges = (risk = []) =>
  risk.map((entry) => `<span class="badge risk">${escapeHtml(enumLabel(entry, "risk"))}</span>`).join(" ");
const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

function itemLabel(item) {
  return item.title || item.label || item.channel || "—";
}

// A link to another record by its business id. When that record is not on the
// loaded page, say so rather than print the id.
function recordLink(view, id) {
  if (!id) return "";
  const target = findItem(view, id);
  if (!target) return `<span class="muted">${t("notLoaded")}</span>`;
  return `<a href="${recordUrl(id, view)}">${escapeHtml(itemLabel(target))}</a>`;
}
const recordName = (view, id) => (id ? findItem(view, id) ? itemLabel(findItem(view, id)) : t("notLoaded") : "");

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers neither the nav (per-view totals) nor the attention block
// (needs review / approved / blocked across everything) already shows.
function metricsBand() {
  const counts = state.counts || {};
  const actions = itemsForView("actions");
  const drafts = itemsForView("drafts");
  const sources = itemsForView("sources");
  return [
    [
      t("metricActionsReady"),
      countOr(counts.actions_approved, actions.filter((item) => item.status === "approved").length, hasMore("actions")),
    ],
    [
      t("metricDraftsWaiting"),
      countOr(counts.drafts_needs_review, drafts.filter((item) => item.status === "needs_review").length, hasMore("drafts")),
    ],
    [
      t("metricSourcesGaps"),
      countOr(counts.sources_needs_config, sources.filter((item) => item.status === "needs_config").length, hasMore("sources")),
    ],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function overviewRow(view, item) {
  return `
    <a class="overview-row" href="${recordUrl(item.id, view)}">
      <span class="overview-row-ref">#${item.ref}</span>
      <strong>${escapeHtml(itemLabel(item))}</strong>
      ${statusBadge(item.status)}
    </a>`;
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="info-banner"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div>`;
}

function renderOverview() {
  const b = state.batch;
  byId("overviewSummary").textContent = [
    b.generated_at ? t("overviewSummary").replace("{time}", dateTime(b.generated_at)) : t("empty"),
    b.vertical,
  ]
    .filter(Boolean)
    .join(" · ");
  const metricsEl = byId("overviewMetrics");
  const body = byId("overviewBody");
  if (!isConnected()) {
    metricsEl.hidden = true;
    body.innerHTML = `${demoBanner()}${emptyState(t("setupNeeded"))}`;
    return;
  }
  metricsEl.hidden = false;
  metricsEl.innerHTML = metricsBand();
  const topSignals = itemsForView("signals").slice(0, 5);
  const ready = itemsForView("actions").filter((item) => item.status === "approved");
  const actionsToShow = (ready.length ? ready : itemsForView("actions")).slice(0, 5);
  body.innerHTML = `
    ${demoBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2><a href="#/signals">${t("topSignals")}</a></h2>
        ${topSignals.map((item) => overviewRow("signals", item)).join("") || `<p class="muted">${t("empty")}</p>`}
      </div>
      <div class="card overview-panel">
        <h2><a href="#/actions">${t("readyActions")}</a></h2>
        ${actionsToShow.map((item) => overviewRow("actions", item)).join("") || `<p class="muted">${t("empty")}</p>`}
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("batchBrief")}</h2>
        <dl class="detail-fields">
          <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "—")}</dd>
          <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "—")}</dd>
        </dl>
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) =>
    matches(
      [
        itemLabel(item),
        item.summary,
        item.effective_body,
        item.channel,
        item.owner,
        item.coverage,
        item.source?.name,
        item.status,
        enumLabel(item.status),
      ],
      query,
    ),
  );
}

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const nameCell = (item) =>
  cell(
    `<span class="row-ref">#${item.ref}</span><span class="strong">${escapeHtml(itemLabel(item))}</span>`,
    itemLabel(item),
  );

function signalsTable(items) {
  return `
    <table class="ws-table newsroom-table signals-table">
      ${tableHead([[t("signal")], [t("status")], [t("confidence"), "ws-col-num ws-split-keep"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${nameCell(item)}
              ${cell(statusBadge(item.status))}
              ${cell(percent(item.confidence), "", "ws-col-num ws-split-keep")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function actionsTable(items) {
  return `
    <table class="ws-table newsroom-table actions-table">
      ${tableHead([[t("action")], [t("status")], [t("priority")], [t("owner")], [t("linkedSignals")], [t("nextStep")]])}
      <tbody>
        ${items
          .map((item) => {
            const linked = (item.linked_signal_ids || []).map((id) => recordName("signals", id)).join(", ");
            return `${rowOpen(item.id)}
              ${nameCell(item)}
              ${cell(statusBadge(item.status))}
              ${cell(priorityBadge(item.priority))}
              ${cell(escapeHtml(item.owner || ""), item.owner)}
              ${cell(escapeHtml(linked), linked)}
              ${cell(escapeHtml(item.next_step || ""), item.next_step)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function draftsTable(items) {
  return `
    <table class="ws-table newsroom-table drafts-table">
      ${tableHead([[t("draft")], [t("channel")], [t("status")], [t("risk")], [t("linkedAction")], [t("body")]])}
      <tbody>
        ${items
          .map((item) => {
            const linked = recordName("actions", item.linked_action_id);
            return `${rowOpen(item.id)}
              ${nameCell(item)}
              ${cell(escapeHtml(item.channel || ""), item.channel)}
              ${cell(statusBadge(item.status))}
              ${cell(riskBadges(item.risk))}
              ${cell(escapeHtml(linked), linked)}
              ${cell(`<span class="muted">${escapeHtml(item.effective_body || "")}</span>`, item.effective_body)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function sourcesTable(items) {
  return `
    <table class="ws-table newsroom-table sources-table">
      ${tableHead([[t("source")], [t("status")], [t("freshness")], [t("coverage")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(itemLabel(item))}</span>`, itemLabel(item))}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.freshness || ""), item.freshness)}
              ${cell(`<span class="muted">${escapeHtml(item.coverage || "")}</span>`, item.coverage)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

const TABLES = { signals: signalsTable, actions: actionsTable, drafts: draftsTable, sources: sourcesTable };

function loadMoreControl(key) {
  if (!hasMore(key)) return "";
  const loading = Boolean(state.loadingMore[key]);
  return `
    <div class="load-more">
      <button type="button" class="button" data-load-more="${key}" ${loading ? "disabled" : ""}>${loading ? t("loadingMore") : t("loadMore")}</button>
    </div>`;
}

function renderRecordView() {
  const { view, query } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredItems(view);
  els.viewCount.textContent = query ? `${items.length}${hasMore(view) ? "+" : ""}` : navTotal(view);
  const banner =
    state.notice && !state.notice.id
      ? `<div class="notice-banner negative">${escapeHtml(state.notice.text)}</div>`
      : "";
  const empty = emptyState(query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${banner}${items.length ? TABLES[view](items) : empty}${loadMoreControl(view)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectSignal")}</div>` : "";
    return;
  }
  const item = findItem(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<p class="muted">${t("loading")}</p>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = recordDetail(view, item);
}

function section(label, text) {
  return text ? `<section class="detail-section"><h3>${label}</h3><p>${escapeHtml(text)}</p></section>` : "";
}

function signalBody(item) {
  return `
    <dl class="detail-fields">
      <dt>${t("confidence")}</dt><dd>${percent(item.confidence)}</dd>
      <dt>${t("detected")}</dt><dd>${escapeHtml(dateTime(item.detected_at) || "—")}</dd>
      ${item.source?.url ? `<dt>${t("evidence")}</dt><dd><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a></dd>` : ""}
      ${item.suggested_action_id ? `<dt>${t("suggestedAction")}</dt><dd>${recordLink("actions", item.suggested_action_id)}</dd>` : ""}
    </dl>
    ${section(t("why"), item.why_it_matters)}
    ${section(t("buyerIntent"), item.buyer_intent)}`;
}

function actionBody(item) {
  const linked = item.linked_signal_ids || [];
  return `
    <dl class="detail-fields">
      <dt>${t("priority")}</dt><dd>${priorityBadge(item.priority) || "—"}</dd>
      <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "—")}</dd>
      ${linked.length ? `<dt>${t("linkedSignals")}</dt><dd>${linked.map((id) => recordLink("signals", id)).join("<br>")}</dd>` : ""}
    </dl>
    ${section(t("reason"), item.reason)}
    ${section(t("nextStep"), item.next_step)}`;
}

function draftBody(item) {
  const edits = state.edits[item.id] || {};
  const text = edits.body ?? (item.edited_body || item.body || "");
  return `
    <dl class="detail-fields">
      <dt>${t("channel")}</dt><dd>${escapeHtml(item.channel || "—")}</dd>
      ${item.linked_action_id ? `<dt>${t("linkedAction")}</dt><dd>${recordLink("actions", item.linked_action_id)}</dd>` : ""}
    </dl>
    <div class="detail-field-block">
      <label class="detail-label" for="draft-body-${escapeHtml(item.id)}">${t("editedDraft")}</label>
      <textarea id="draft-body-${escapeHtml(item.id)}" class="draft-body" data-field="body" rows="10">${escapeHtml(text)}</textarea>
    </div>`;
}

function sourceBody(item) {
  return `
    <dl class="detail-fields">
      <dt>${t("status")}</dt><dd>${statusBadge(item.status) || "—"}</dd>
      <dt>${t("freshness")}</dt><dd>${escapeHtml(item.freshness || "—")}</dd>
    </dl>
    ${section(t("coverage"), item.coverage)}`;
}

function decisionForm(view, item) {
  const kind = DECISION_VIEWS[view];
  const edits = state.edits[item.id] || {};
  const note = edits.note ?? (item.decision?.comment || "");
  const disabled = state.saving ? "disabled" : "";
  const notice = state.notice?.id === item.id ? state.notice : null;
  return `
    <div class="detail-field-block">
      <label class="detail-label" for="review-note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="review-note-${escapeHtml(item.id)}" data-field="note" rows="3">${escapeHtml(note)}</textarea>
    </div>
    <div class="decision-actions">
      <button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>
      <button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>
      <button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>
      ${kind === "draft" ? `<button type="button" class="button" data-action="revise" ${disabled}>${t("revise")}</button>` : ""}
      ${state.saving ? `<span class="muted">${t("decisionSaving")}</span>` : ""}
      ${item.decision && !notice ? `<span class="muted">${t("decision")}: ${escapeHtml(decisionLabel(item.decision.action))} · ${escapeHtml(dateTime(item.decision.decided_at))}</span>` : ""}
    </div>
    ${notice ? `<div class="decision-feedback ${notice.tone}">${escapeHtml(notice.text)}</div>` : ""}`;
}

const DECISION_STATUS = { approve: "approved", request_changes: "changes_requested", block: "blocked" };
const decisionLabel = (action) => (DECISION_STATUS[action] ? enumLabel(DECISION_STATUS[action]) : t("revise"));

function recordDetail(view, item) {
  const body =
    view === "signals"
      ? signalBody(item)
      : view === "actions"
        ? actionBody(item)
        : view === "drafts"
          ? draftBody(item)
          : sourceBody(item);
  const summary = item.summary && item.summary !== itemLabel(item) ? `<p class="detail-summary">${escapeHtml(item.summary)}</p>` : "";
  return `
    <article class="record-detail" data-record="${escapeHtml(item.id)}">
      <header class="detail-head">
        <div class="detail-meta">
          ${item.ref ? `<span class="row-ref">#${item.ref}</span>` : ""}
          ${view === "sources" ? "" : statusBadge(item.status)}
          ${riskBadges(item.risk)}
        </div>
        <h2>${escapeHtml(itemLabel(item))}</h2>
        ${summary}
      </header>
      ${body}
      ${DECISION_VIEWS[view] ? decisionForm(view, item) : ""}
    </article>`;
}

async function submitDecision(id, action) {
  const view = state.route.view;
  const kind = DECISION_VIEWS[view];
  if (!kind || state.saving) return;
  const edits = state.edits[id] || {};
  const item = findItem(view, id);
  state.saving = true;
  state.notice = null;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.saveDecision({
      kind,
      id,
      action,
      comment: edits.note ?? (item?.decision?.comment || ""),
      edited_body: edits.body ?? (item?.edited_body || item?.body || ""),
    });
    if (!result.ok) throw new Error(result.error || t("decisionError"));
    delete state.edits[id];
    state.saving = false;
    await loadState();
    // Without write access the decision is a ChangeRequest, and the item keeps
    // its old status until someone who has it approves: say that, not "Saved".
    state.notice = { id, text: result.pending ? t("savedForReview") : t("decisionSaved"), tone: "positive" };
  } catch (error) {
    state.notice = { id, text: error instanceof Error ? error.message : String(error), tone: "negative" };
  } finally {
    state.saving = false;
    render();
  }
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const b = state.batch || {};
  byId("settingsBody").innerHTML = `
    <section class="settings">
      <div class="card settings-card">
        <h2>${t("configuration")}</h2>
        <dl class="detail-fields">
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
          <dt>${t("batchId")}</dt><dd>${escapeHtml(b.batch_id || "—")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(b.vertical || "—")}</dd>
          <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "—")}</dd>
          <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "—")}</dd>
        </dl>
      </div>
    </section>
  `;
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.batch);
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
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("textarea[data-field]");
  if (!field) return;
  const id = field.closest("[data-record]")?.dataset.record;
  if (id) state.edits[id] = { ...state.edits[id], [field.dataset.field]: field.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest("[data-record]")?.dataset.record;
  if (id) submitDecision(id, button.dataset.action);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
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
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState());
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-ai-newsroom-language", state.lang);
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
