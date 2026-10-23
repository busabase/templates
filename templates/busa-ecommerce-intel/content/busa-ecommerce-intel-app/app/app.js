import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeMetrics } from "./js/ecommerce-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view (the reasons sit next to the declaration in
// config.js `ui.detail_modes`): signals → split queue, actions → drawer,
// drafts → full page, sources → drawer. A `/<record>` path always opens the
// full page; `?peek=<record>` drives drawer/split. On a phone every mode is a
// page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const VIEW_KINDS = { signals: "signal", actions: "action", drafts: "draft", sources: "source" };
const VIEW_HINT = { signals: "signalsHint", actions: "actionsHint", drafts: "draftsHint", sources: "sourcesHint" };

const state = {
  batch: null,
  bootstrap: null,
  provider: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("busa-ecommerce-intel-language") ||
      "auto",
  ),
  saving: false,
  notice: null,
  // Prev/Next pager per Base. records.list only exposes a forward keyset
  // cursor, so pageCursors[key][i] is the cursor that fetches page i+1. Only a
  // neighbouring page is reachable — one click, one request; there is no "jump
  // to page N", because reaching it would mean reading every page in between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  counts: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { signals: new Map(), actions: new Map(), drafts: new Map(), sources: new Map() },
  // Unsaved review notes / draft edits, kept across re-renders.
  edits: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-ecommerce-intel.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewNotice: byId("viewNotice"),
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
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same list context.
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
// The full page: the record in the path. Always a page, whatever the view's mode.
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
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A record opened from its list marks the entry, so Back/Close/Escape step
  // back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.selectedId !== state.route.selectedId || previous.view !== state.route.view) state.notice = null;
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
  state.counts = data.counts || {};
  state.extra = { signals: new Map(), actions: new Map(), drafts: new Map(), sources: new Map() };
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("busa-ecommerce-intel:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything computed from loaded rows must say so.
function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// The nav count: the real total (records.count) when there is one, else the
// loaded rows with a "+" while more exist.
function navCount(key) {
  const loaded = itemsForView(key).length;
  if (state.totals[key] != null) return String(state.totals[key]);
  return `${loaded}${isPartial(key) ? "+" : ""}`;
}

// Replaces the displayed page with a NEIGHBOURING page: exactly one request
// per click, using a cursor already learned. Never appends, never walks.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    state.batch[key] = rows;
    state.batch.metrics = computeMetrics(state.batch);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = { tone: "negative", text: error instanceof Error ? error.message : String(error) };
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.batch || !selectedId || !RECORD_VIEWS.includes(view)) return;
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
    state.extra[view].set(selectedId, row || null);
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

function recordById(view, id) {
  if (!id) return null;
  return itemsForView(view).find((item) => item.id === id) || state.extra[view]?.get(id) || null;
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
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

function renderShell() {
  applyI18n();
  const metrics = state.batch?.metrics || {};
  // Where the data comes from; the counts already sit in the attention block.
  els.syncStatus.textContent = !state.batch
    ? t("loading")
    : state.bootstrap?.demo
      ? t("demoData")
      : state.batch.generated_at
        ? `${t("generated")} ${dateTime(state.batch.generated_at)}`
        : t("empty");
  if (els.needsReviewCount) els.needsReviewCount.textContent = metrics.needs_review ?? 0;
  if (els.approvedCount) els.approvedCount.textContent = metrics.approved ?? 0;
  if (els.blockedCount) els.blockedCount.textContent = metrics.blocked ?? 0;
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = state.batch ? navCount(node.dataset.navCount) : "";
  });
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !state.batch
      ? t("loading")
      : isConnected()
        ? `${metrics.needs_review ?? 0} ${t("needsReview")}`
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

function statusBadge(status) {
  if (!status) return "";
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function priorityBadge(priority) {
  if (!priority) return "";
  return `<span class="badge priority-${escapeHtml(priority)}">${escapeHtml(enumLabel(priority, "priority"))}</span>`;
}

function riskBadges(risk = []) {
  return risk.map((entry) => `<span class="badge risk">${escapeHtml(enumLabel(entry, "risk"))}</span>`).join(" ");
}

function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
}

function warningsBlock() {
  const items = state.bootstrap?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) =>
        `<div class="warning"><strong>${escapeHtml(item.message)}</strong>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}

function itemLabel(item) {
  return item.title || enumLabel(item.channel, "channel") || item.label || `#${item.ref}`;
}

// A relation holds the target's business id. Resolve it to the target's
// title; when that record is not on the loaded page, say so — never print it.
function relationLink(view, id) {
  if (!id) return "";
  const target = recordById(view, id);
  if (!target) return `<span class="muted">${t("notLoaded")}</span>`;
  return `<a href="${recordUrl(id, view)}">${escapeHtml(itemLabel(target))}</a>`;
}

function relationText(view, id) {
  if (!id) return "";
  const target = recordById(view, id);
  return target ? itemLabel(target) : t("notLoaded");
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav and the attention block do not already show.
function metricsBand() {
  const signals = itemsForView("signals");
  const scope = isPartial("signals") ? ` · ${t("loadedScope").replace("{n}", signals.length)}` : "";
  const avg = signals.length ? signals.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / signals.length : null;
  const approvedDrafts =
    state.counts.approved_drafts ??
    `${itemsForView("drafts").filter((item) => item.status === "approved").length}${isPartial("drafts") ? "+" : ""}`;
  const unconfigured =
    state.counts.unconfigured_sources ??
    `${itemsForView("sources").filter((item) => item.status === "needs_config").length}${isPartial("sources") ? "+" : ""}`;
  return [
    [`${t("avgConfidence")}${scope}`, avg == null ? "—" : percent(avg)],
    [t("draftsReady"), approvedDrafts],
    [t("sourcesUnconfigured"), unconfigured],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function overviewRow(view, item) {
  return `
    <a class="due-row" href="${recordUrl(item.id, view)}">
      <span class="due-ref">#${escapeHtml(item.ref)}</span>
      <strong>${escapeHtml(itemLabel(item))}</strong>
      ${statusBadge(item.status)}
    </a>
  `;
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="warnings"><div class="info"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div></div>`;
}

function renderOverview() {
  const b = state.batch || {};
  byId("overviewSummary").textContent = [
    b.vertical,
    b.buyer ? `${t("buyer")}: ${b.buyer}` : "",
    b.generated_at ? `${t("generated")} ${dateTime(b.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const metricsEl = byId("overviewMetrics");
  metricsEl.hidden = !isConnected();
  metricsEl.innerHTML = isConnected() ? metricsBand() : "";
  if (!isConnected()) {
    byId("overviewBody").innerHTML = `${warningsBlock()}${emptyState(t("setupNeeded"))}`;
    return;
  }
  const topSignals = itemsForView("signals")
    .slice()
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, 5);
  const readyActions = itemsForView("actions").filter((item) => item.status === "approved");
  const actionsToShow = (readyActions.length ? readyActions : itemsForView("actions")).slice(0, 5);
  byId("overviewBody").innerHTML = `
    ${demoBanner()}
    ${warningsBlock()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2><a href="#/signals">${t("topSignals")}</a></h2>
        ${topSignals.map((item) => overviewRow("signals", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="card overview-panel">
        <h2><a href="#/actions">${readyActions.length ? t("readyActions") : t("actionsToReview")}</a></h2>
        ${actionsToShow.map((item) => overviewRow("actions", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
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
        item.coverage,
        item.source?.name,
        item.owner,
        enumLabel(item.status),
        enumLabel(item.priority, "priority"),
        enumLabel(item.channel, "channel"),
      ],
      query,
    ),
  );
}

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const tableHead = (columns) =>
  `<thead><tr>${columns
    .map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`)
    .join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const strong = (text) => `<span class="strong">${escapeHtml(text)}</span>`;

function signalsTable(items) {
  return `
    <table class="ws-table intel-table">
      ${tableHead([
        [t("signal")],
        [t("status")],
        [t("confidence"), "ws-col-num"],
        [t("source")],
        [t("buyerIntent"), "ws-col-wide"],
        [t("detected")],
        [t("risk")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemLabel(item))}
              ${cell(statusBadge(item.status))}
              ${cell(percent(item.confidence), "", "ws-col-num")}
              ${cell(escapeHtml(item.source?.name || ""), item.source?.name)}
              ${cell(escapeHtml(item.buyer_intent || ""), item.buyer_intent)}
              ${cell(escapeHtml(dateTime(item.detected_at)))}
              ${cell(riskBadges(item.risk) || '<span class="muted">—</span>')}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table intel-table">
      ${tableHead([
        [t("action")],
        [t("status")],
        [t("priority"), "ws-col-narrow"],
        [t("owner"), "ws-col-narrow"],
        [t("linkedSignals")],
        [t("nextStep"), "ws-col-wide"],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const linked = (item.linked_signal_ids || []).map((id) => relationText("signals", id)).join(", ");
            return `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemLabel(item))}
              ${cell(statusBadge(item.status))}
              ${cell(priorityBadge(item.priority), "", "ws-col-narrow")}
              ${cell(escapeHtml(item.owner || ""), item.owner, "ws-col-narrow")}
              ${cell(escapeHtml(linked), linked)}
              ${cell(escapeHtml(item.next_step || ""), item.next_step)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table intel-table">
      ${tableHead([[t("draft")], [t("status")], [t("channel")], [t("linkedAction")], [t("risk")]])}
      <tbody>
        ${items
          .map((item) => {
            const action = relationText("actions", item.linked_action_id);
            return `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemLabel(item))}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(enumLabel(item.channel, "channel")))}
              ${cell(escapeHtml(action), action)}
              ${cell(riskBadges(item.risk) || '<span class="muted">—</span>')}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function sourcesTable(items) {
  return `
    <table class="ws-table intel-table">
      ${tableHead([[t("source")], [t("status")], [t("freshness")], [t("coverage"), "sources-coverage"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(strong(item.label || "—"), item.label)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.freshness || ""), item.freshness)}
              ${cell(escapeHtml(item.coverage || ""), item.coverage)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

const TABLES = { signals: signalsTable, actions: actionsTable, drafts: draftsTable, sources: sourcesTable };

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count when available.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  return `
    <nav class="pager" aria-label="${t("pagination")}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${
        total == null
          ? t("pageN").replace("{current}", current)
          : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))
      }</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredItems(view);
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  els.viewNotice.innerHTML = warningsBlock();
  els.viewNotice.hidden = !els.viewNotice.innerHTML;
  const empty = state.route.query ? emptyState(t("noMatches")) : emptyState(t("empty"), t("setupNeeded"));
  els.listPanel.innerHTML = `${items.length ? TABLES[view](items) : empty}${pagerControl(view)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page" || isMobileLayout();
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectSignal")) : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = detailMarkup(view, item);
}

const field = (label, html) => (html ? `<dt>${escapeHtml(label)}</dt><dd>${html}</dd>` : "");

function signalFields(item) {
  return [
    field(t("confidence"), percent(item.confidence)),
    field(t("detected"), escapeHtml(dateTime(item.detected_at))),
    field(
      t("evidence"),
      item.source?.url
        ? `<a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a>`
        : escapeHtml(item.source?.name || ""),
    ),
    field(t("suggestedAction"), relationLink("actions", item.suggested_action_id)),
  ].join("");
}

function actionFields(item) {
  return [
    field(t("priority"), priorityBadge(item.priority)),
    field(t("owner"), escapeHtml(item.owner || "")),
    field(t("linkedSignals"), (item.linked_signal_ids || []).map((id) => relationLink("signals", id)).join("<br>")),
  ].join("");
}

function draftFields(item) {
  return [
    field(t("channel"), escapeHtml(enumLabel(item.channel, "channel"))),
    field(t("linkedAction"), relationLink("actions", item.linked_action_id)),
  ].join("");
}

function sourceFields(item) {
  return [field(t("freshness"), escapeHtml(item.freshness || ""))].join("");
}

function prose(label, text) {
  return text ? `<section class="detail-prose"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(text)}</p></section>` : "";
}

function decisionBlock(kind, item) {
  const edits = state.edits[item.id] || {};
  const note = edits.note ?? item.decision?.comment ?? "";
  const disabled = state.saving ? "disabled" : "";
  // The status badge already says what was decided; this only adds when.
  const decided = item.decision?.decided_at
    ? `<span class="decision-meta muted">${escapeHtml(t("decidedAt").replace("{time}", dateTime(item.decision.decided_at)))}</span>`
    : "";
  const notice = state.notice
    ? `<div class="decision-feedback ${escapeHtml(state.notice.tone)}" role="status">${escapeHtml(state.notice.text)}</div>`
    : "";
  return `
    <div class="detail-input">
      <label class="detail-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="detail-note" data-field="note" rows="2" ${disabled}>${escapeHtml(note)}</textarea>
    </div>
    <div class="actions-bar">
      <button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>
      <button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>
      <button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>
      ${kind === "draft" ? `<button type="button" class="button" data-action="revise" ${disabled}>${t("revise")}</button>` : ""}
      ${decided}
    </div>
    ${notice}
  `;
}

function detailMarkup(view, item) {
  const kind = VIEW_KINDS[view];
  const title = itemLabel(item);
  const summary = item.summary && item.summary !== title ? `<p class="detail-summary">${escapeHtml(item.summary)}</p>` : "";
  const fields =
    kind === "signal"
      ? signalFields(item)
      : kind === "action"
        ? actionFields(item)
        : kind === "draft"
          ? draftFields(item)
          : sourceFields(item);
  let body = "";
  if (kind === "signal") body = prose(t("why"), item.why_it_matters) + prose(t("buyerIntent"), item.buyer_intent);
  if (kind === "action") body = prose(t("reason"), item.reason) + prose(t("nextStep"), item.next_step);
  if (kind === "source") body = prose(t("coverage"), item.coverage);
  if (kind === "draft") {
    const edits = state.edits[item.id] || {};
    const edited = edits.body ?? (item.edited_body || item.body || "");
    // The agent's original only shows separately once a human revision exists;
    // before that the editable text IS the draft, so it is shown once.
    body = `
      ${item.edited_body ? prose(t("agentDraft"), item.body) : ""}
      <div class="detail-input">
        <label class="detail-label" for="body-${escapeHtml(item.id)}">${item.edited_body ? t("editedDraft") : t("draftText")}</label>
        <textarea id="body-${escapeHtml(item.id)}" class="detail-draft" data-field="body" rows="8" ${state.saving ? "disabled" : ""}>${escapeHtml(edited)}</textarea>
      </div>
    `;
  }
  return `
    <article class="intel-detail" data-kind="${kind}" data-id="${escapeHtml(item.id)}">
      <header class="detail-head">
        <div class="detail-badges">${item.ref ? `<span class="detail-ref">#${escapeHtml(item.ref)}</span>` : ""}${statusBadge(item.status)} ${riskBadges(item.risk)}</div>
        <h2>${escapeHtml(title)}</h2>
        ${summary}
      </header>
      ${fields ? `<dl class="detail-fields">${fields}</dl>` : ""}
      ${body}
      ${kind === "source" ? "" : decisionBlock(kind, item)}
    </article>
  `;
}

async function submitDecision(kind, id, action) {
  const edits = state.edits[id] || {};
  const card = els.detailBody.querySelector("[data-id]");
  const note = card?.querySelector('[data-field="note"]')?.value ?? edits.note ?? "";
  const editedBody = card?.querySelector('[data-field="body"]')?.value ?? edits.body ?? "";
  state.saving = true;
  state.notice = { tone: "", text: t("decisionSaving") };
  render();
  try {
    const provider = await getProvider();
    const result = await provider.saveDecision({ kind, id, action, comment: note, edited_body: editedBody });
    if (!result.ok) throw new Error(result.error || t("decisionError"));
    delete state.edits[id];
    state.saving = false;
    await loadState();
    // Without write access the decision is a ChangeRequest, and the item keeps
    // its old status until someone who has it approves: say that, not "Saved".
    state.notice = { tone: "positive", text: result.pending ? t("savedForReview") : t("decisionSaved") };
  } catch (error) {
    state.notice = { tone: "negative", text: error instanceof Error ? error.message : String(error) };
  } finally {
    state.saving = false;
    render();
  }
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const b = state.batch || {};
  byId("settingsBody").innerHTML = `
    <div id="settingsContent" class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
          <dt>${t("batchId")}</dt><dd>${escapeHtml(b.batch_id || "—")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(b.vertical || "")}</dd>
          <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "")}</dd>
          <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("viewsHelp")}</h2>
        <dl>
          ${RECORD_VIEWS.map((view) => `<dt>${escapeHtml(t(view))}</dt><dd>${escapeHtml(t(VIEW_HINT[view]))}</dd>`).join("")}
        </dl>
      </section>
    </div>
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
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("input", (event) => {
  const input = event.target.closest("textarea[data-field]");
  if (!input) return;
  const id = input.closest("[data-id]")?.dataset.id;
  if (id) state.edits[id] = { ...state.edits[id], [input.dataset.field]: input.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || state.saving) return;
  const card = button.closest("[data-id]");
  submitDecision(card.dataset.kind, card.dataset.id, button.dataset.action);
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
window.addEventListener("resize", () => {
  syncResponsiveShell();
  if (state.batch) renderDetail();
});
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
  localStorage.setItem("busa-ecommerce-intel-language", state.lang);
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
