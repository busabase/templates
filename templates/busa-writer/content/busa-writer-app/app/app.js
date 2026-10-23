import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { buildSnapshot } from "./js/writer-model.js?v=0.1.0";

// Where a record opens. drafts → split: the review queue is worked top to
// bottom, one draft after the next, so the queue stays beside the record
// (same workflow as busa-crm's followups). The only record view in this app.
// A `/record` path always opens the full page; `?peek=` drives the split.
// On a phone every mode becomes a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const DRAFT_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

const state = {
  snapshot: null,
  settings: null,
  provider: null,
  // Drafts not on the loaded page but named by the URL (records.get).
  extra: new Map(),
  route: parseRoute(),
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-writer-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-writer.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  statusSelect: byId("statusSelect"),
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
  approvedCount: byId("count-approved"),
  blockedCount: byId("count-blocked"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (_key, rows) => {
    const page = buildSnapshot({ drafts: rows });
    state.snapshot = { ...state.snapshot, drafts: page.drafts, metrics: page.metrics, channels: page.channels };
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.notice = error instanceof Error ? error.message : String(error);
  },
});

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

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the draft status
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
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: DRAFT_STATES.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "drafts" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
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
// clicks should not each become a Back step.
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
  state.snapshot = data.snapshot;
  state.settings = data;
  state.extra = new Map();
  pagination.reset(data.pagination, data.totals);
  window.dispatchEvent(new CustomEvent("busa-writer:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

// A draft named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || view !== "drafts") return;
  if (draftById(selectedId) || state.extra.has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra.set(selectedId, undefined);
  try {
    const row = await provider.getRecord("drafts", selectedId);
    state.extra.set(selectedId, row || null);
  } catch {
    state.extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = scenario === "drafts" ? "#/drafts" : scenario === "settings" ? "#/settings" : "#/overview";
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
  const settingsTitle = byId("settingsTitle");
  settingsTitle.textContent = t("settings");
  settingsTitle.title = t("settingsSubtitle");
  els.detailExpand.textContent = t("openFullPage");
}

function drafts() {
  return state.snapshot?.drafts || [];
}

function channels() {
  return state.snapshot?.channels || [];
}

// Loaded page first, then a draft fetched on its own for the URL.
function draftById(id) {
  if (!id) return null;
  return drafts().find((entry) => entry.draft_id === id) || state.extra.get(id) || null;
}

function reviewCount() {
  return drafts().filter((item) => item.status === "needs_review").length;
}

function renderShell() {
  applyI18n();
  const review = reviewCount();
  const approvedCount = drafts().filter((item) => item.status === "approved").length;
  const blockedCount = drafts().filter((item) => item.status === "blocked").length;
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.reviewCount) els.reviewCount.textContent = review;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review ? `${review} ${t("needReview")}` : t("overviewSubtitle");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "drafts") return t("drafts");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function channelBadge(channel) {
  if (!channel) return "";
  return `<span class="badge">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function lockBanner() {
  if (!state.settings?.lock?.locked) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not already show (the sidebar's attention block
// already shows needs-review/approved/blocked): total loaded drafts, channels
// covered, and done. isPartial() says so when a later page may hold more.
function isPartial() {
  // pagination.total() returns a real number only once records.count is
  // known; otherwise it falls back to a string ("4" or "4+" with a next
  // cursor) — compare as strings so the "no real total yet" case doesn't
  // read as partial just because of the type mismatch.
  return String(pagination.total("drafts", drafts().length)) !== String(drafts().length);
}

function metricsBand() {
  const scope = isPartial() ? ` · ${t("loadedOnly")}` : "";
  const doneCount = drafts().filter((item) => item.status === "done").length;
  return [
    [t("totalDrafts") + scope, pagination.total("drafts", drafts().length)],
    [t("channels"), channels().length],
    [t("done"), doneCount],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

function renderOverview() {
  byId("overviewSummary").textContent = t("overviewSubtitle");
  byId("overviewMetrics").innerHTML = metricsBand();
  byId("overviewBody").innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("channelBreakdown")}</h2>
        ${
          channels()
            .map(
              (entry) => `
          <div class="activity-row channel-row">
            <span class="badge">${escapeHtml(enumLabel(entry.channel, "channel"))}</span>
            <span class="muted">${escapeHtml(entry.channel)}</span>
            <span class="num">${entry.count}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("needsReview")}</h2>
        ${
          drafts()
            .filter((item) => item.status === "needs_review")
            .slice(0, 6)
            .map(
              (item) => `
          <a class="due-row" href="${recordUrl(item.draft_id, "drafts")}">
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.channel, "channel"))}</small></span>
            <span class="due-meta">${statusBadge(item.status)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noItems")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Drafts (record view) ─────────────────────────────────────────────────
function filteredDrafts() {
  const query = state.route.query.trim().toLowerCase();
  return drafts().filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    return [item.title, item.summary, item.body, item.channel, item.hook]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function draftFilters() {
  return DRAFT_STATES.map((value) => {
    const count = value === "all" ? drafts().length : drafts().filter((item) => item.status === value).length;
    const label = value === "all" ? t("all") : enumLabel(value);
    return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${count}</b></button>`;
  }).join("");
}

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function draftsTable(items) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("title"))}</th>
          <th class="ws-col-narrow">${escapeHtml(t("channel"))}</th>
          <th>${escapeHtml(t("status"))}</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.draft_id)}
              ${cell(`<span class="strong">#${item.ref} · ${escapeHtml(item.title || item.summary || "")}</span>`, item.title)}
              ${cell(channelBadge(item.channel), "", "ws-col-narrow")}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderDraftsView() {
  els.viewTitle.textContent = t("drafts");
  els.viewTitle.title = t("draftsHint");
  const items = filteredDrafts();
  els.viewCount.textContent = `${items.length}${isPartial() ? "+" : ""}`;
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = draftFilters();
  els.statusSelect.hidden = false;
  els.statusSelect.innerHTML = DRAFT_STATES.map((value) => {
    const count = value === "all" ? drafts().length : drafts().filter((item) => item.status === value).length;
    return `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("all") : enumLabel(value))} (${count})</option>`;
  }).join("");
  els.listPanel.innerHTML = `${
    items.length ? draftsTable(items) : `<div class="empty-state"><strong>${escapeHtml(t("noItems"))}</strong></div>`
  }${pagination.control("drafts")}`;
  renderDetail();
}

function renderDetail() {
  const { selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, "drafts");
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES.drafts === "split" ? `<div class="empty-state"><strong>${escapeHtml(t("selectDraft"))}</strong></div>` : "";
    return;
  }
  const item = draftById(selectedId);
  if (!item) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : `<div class="empty-state"><strong>${escapeHtml(t("recordMissing"))}</strong></div>`;
    return;
  }
  els.detailBody.innerHTML = draftDetail(item);
}

function draftDetail(item) {
  const edits = state.edits[item.draft_id] || {};
  const title = edits.title ?? item.title ?? "";
  const body = edits.body ?? item.body ?? "";
  const note = edits.note ?? item.decision_note ?? "";
  const disabled = state.settings?.lock?.locked ? "disabled" : "";
  return `
    <article class="queue-card status-${escapeHtml(item.status)}" data-item="${escapeHtml(item.draft_id)}">
      <header class="queue-head">
        <span class="queue-ref">#${item.ref}</span>
        ${channelBadge(item.channel)}
        ${statusBadge(item.status)}
        ${item.format ? `<span class="badge">${escapeHtml(item.format)}</span>` : ""}
      </header>
      ${lockBanner()}
      ${noticeBanner()}
      <label class="queue-label">${t("title")}</label>
      <input class="queue-title" data-field="title" value="${escapeAttr(title)}" ${disabled}>
      <label class="queue-label">${t("draft")}</label>
      <textarea class="queue-draft" data-field="body" rows="9" ${disabled}>${escapeHtml(body)}</textarea>
      <div class="queue-meta">
        ${item.cta ? `<span class="muted">${escapeHtml(t("cta"))}: ${escapeHtml(item.cta)}</span>` : ""}
        ${item.hashtags?.length ? `<span class="muted">${item.hashtags.map(escapeHtml).join(" ")}</span>` : ""}
      </div>
      ${item.media_brief ? `<p class="queue-reason"><span class="muted">${escapeHtml(t("mediaBrief"))}:</span> ${escapeHtml(item.media_brief)}</p>` : ""}
      ${item.title_options?.length ? `<p class="queue-reason"><span class="muted">${escapeHtml(t("titleOptions"))}:</span> ${item.title_options.map(escapeHtml).join(" · ")}</p>` : ""}
      <label class="queue-label">${t("reviewNote")}</label>
      <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${item.decided_at ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(item.status, "action"))} · ${escapeHtml(new Date(item.decided_at).toLocaleString())}</span>` : ""}
      </div>
    </article>
  `;
}

async function submitDecision(draftId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const title = card.querySelector('[data-field="title"]')?.value ?? "";
  const body = card.querySelector('[data-field="body"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  let result;
  try {
    const provider = await getProvider();
    result = await provider.applyDecision(draftId, { action, comment: note, title, body });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  delete state.edits[draftId];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the draft keeps
  // its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const brand = summary.brand || {};
  byId("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("brand")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("audience")}</dt><dd>${escapeHtml(summary.audience || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(brand.voice || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("channels")}</h2>
        ${
          Object.keys(summary.channels || {})
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(enumLabel(channel, "channel"))}</strong>
            <span>${escapeHtml(summary.channels[channel]?.language || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("exportStep")}</h2>
        <p class="muted">${t("exportStepBody")}</p>
        <pre class="patch">node scripts/generate_batch.mjs --source &lt;path-or-text&gt; --apply
node scripts/export_decisions.mjs --apply</pre>
      </section>
    </div>
  `;
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
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
  if (onRecordView) renderDraftsView();
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

// ── Events ─────────────────────────────────────────────────────────────────
pagination.bind(els.listPanel);
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-goto-page]")) return;
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching drafts while the split pane is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (!segment) return;
  replaceRoute(`#/drafts${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(`#/drafts${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("input[data-field], textarea[data-field]");
  if (!field) return;
  const id = field.closest("[data-item]")?.dataset.item;
  if (id) state.edits[id] = { ...state.edits[id], [field.dataset.field]: field.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-item]");
  submitDecision(card.dataset.item, button.dataset.action, card);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft field only leaves the field; a second Escape closes.
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
  localStorage.setItem("busa-writer-language", state.lang);
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
