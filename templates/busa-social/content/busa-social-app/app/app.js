import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  renderAccountsView,
  renderCalendarView,
  renderComposeView,
  renderCrisis,
  renderEngagementView,
  renderSettings,
  renderShortsView,
  renderTimelineView,
  warnings,
} from "./js/publishing-views.js";
import { buildSnapshot } from "./js/social-model.js?v=0.1.0";

// Where each record view opens its record (see config.js `ui.detail_modes`
// for the business reasoning). Calendar and crisis are not record views: a
// schedule table and a single incident board, neither has a "record" to open.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const PLAIN_VIEWS = ["calendar"];
const ALL_VIEWS = ["overview", ...RECORD_VIEWS, ...PLAIN_VIEWS, "crisis", "settings"];
const ID_FIELD = {
  accounts: "account_id",
  timeline: "post_id",
  compose: "draft_id",
  shorts: "short_id",
  engagement: "item_id",
};
const SNAPSHOT_KEY = { accounts: "accounts", timeline: "posts", compose: "drafts", shorts: "shorts", engagement: "engagement" };

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  platformFilter: "",
  workflowFilter: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-social-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  busy: false,
};

const REVIEW_STATES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-social.sidebarCollapsed";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const byId = (id) => document.getElementById(id);
export const els = {
  title: byId("page-title"),
  subtitle: byId("page-subtitle"),
  overviewPage: byId("overviewPage"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  crisisPage: byId("crisisPage"),
  crisisTitle: byId("crisisTitle"),
  crisisBody: byId("crisisBody"),
  settingsPage: byId("settingsPage"),
  settingsTitle: byId("settingsTitle"),
  settingsBody: byId("settingsBody"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  staleCount: byId("count-stale"),
  reviewCount: byId("count-review"),
  engagementCount: byId("count-engagement"),
  postCount: byId("count-posts"),
  accountCount: byId("count-accounts"),
  language: byId("language"),
};

const PAGINATED_KEYS = ["accounts", "posts", "calendar", "drafts", "shorts", "engagement"];
const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot = buildSnapshot({ ...state.snapshot, [key]: rows });
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.pageError = error instanceof Error ? error.message : String(error);
  },
});

export function recordTotal(key, fallback = 0) {
  return pagination.total(key, fallback);
}

export function paginationControl(key) {
  return pagination.control(key);
}

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

export function num(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: Math.abs(numeric) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function delta(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `<span class="delta ${numeric < 0 ? "down" : "up"}">${sign}${num(numeric)}</span>`;
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<id>][?peek=<id>]`. A `/<id>` path always opens the full page;
// `?peek=` drives a drawer (accounts) or a split queue (compose/shorts/
// engagement) without leaving the list. On a phone every mode becomes a page
// (base-ui.css handles that).
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
  if (!ALL_VIEWS.includes(view)) view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
  };
}

export const listUrl = (view = state.route.view) => `#/${view}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => `#/${view}/${encodeURIComponent(id)}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}?peek=${encodeURIComponent(id)}`;

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new history entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  setMobileSidebarOpen(false);
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("busa-social:state", { detail: data }));
  applyDemoRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const scenarioRoutes = {
    accounts: "#/accounts",
    detail: "#/accounts?peek=x-atlas",
    timeline: "#/timeline",
    calendar: "#/calendar",
    compose: "#/compose",
    shorts: "#/shorts",
    engagement: "#/engagement",
    crisis: "#/crisis",
  };
  const route = scenarioRoutes[scenario] || "#/overview";
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
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  els.crisisTitle.textContent = t("crisisPlaybook");
  els.settingsTitle.textContent = t("settings");
  els.settingsTitle.title = t("localFilesOnly");
  els.detailExpand.textContent = t("openFullPage");
}

export function accounts() {
  return state.snapshot?.accounts || [];
}

export function posts() {
  return state.snapshot?.posts || [];
}

export function syncLog() {
  return state.snapshot?.sync_log || [];
}

export function calendar() {
  return state.snapshot?.calendar || [];
}

export function drafts() {
  return state.snapshot?.drafts || [];
}

export function shorts() {
  return state.snapshot?.shorts || [];
}

export function engagement() {
  return state.snapshot?.engagement || [];
}

export function crisis() {
  return state.snapshot?.crisis || null;
}

function shareOfVoice() {
  return state.snapshot?.share_of_voice || null;
}

// The record named by the current route, searched on the currently loaded
// page only — no provider here exposes a by-id lookup for an off-page record.
export function recordById(view, id) {
  if (!id) return null;
  const field = ID_FIELD[view];
  const rows = state.snapshot?.[SNAPSHOT_KEY[view]] || [];
  return rows.find((item) => item[field] === id) || null;
}

// Items still waiting on a human decision (drives the attention counters).
export function openReview(list) {
  return list.filter((item) => item.status === "needs_review" || item.status === "changes_requested");
}

// Apply one ECHO operation through the active provider, then adopt the fresh
// state it returns. Demo mode never mutates real state, so its
// applyOperation() resolves with no `.snapshot` — that's the signal to fall
// back to a local reload of the deterministic scene.
async function applyOperation(op) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const data = await provider.applyOperation(op);
    if (data?.snapshot) {
      state.snapshot = data.snapshot;
      state.settings = { ...state.settings, ...data };
      state.busy = false;
      render();
    } else {
      // Demo mode: no write happened, so reload the deterministic scene.
      state.busy = false;
      await loadState();
    }
  } catch (error) {
    state.busy = false;
    window.alert(`${t("opFailed")}: ${error.message}`);
    render();
  }
}

function isStaleAccount(account) {
  if (account.status && account.status !== "ok") return true;
  if (!account.last_sync_at) return true;
  const reference = new Date(state.snapshot?.generated_at || Date.now()).getTime();
  return reference - new Date(account.last_sync_at).getTime() > STALE_AFTER_MS;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const warningCount = snapshot?.warnings?.length || 0;
  const staleCount = accounts().filter(isStaleAccount).length;
  const configuredCount = pagination.total("accounts", state.settings?.config_summary?.accounts?.length || 0);
  const postCount = pagination.total("posts", posts().length);
  const reviewCount =
    openReview(drafts()).length +
    shorts().filter((s) => s.status === "needs_review" || s.status === "changes_requested").length;
  const engagementReview = openReview(engagement()).length;
  els.syncStatus.textContent = snapshot ? `${reviewCount} ${t("needsReviewCount")}` : t("empty");
  if (els.staleCount) els.staleCount.textContent = staleCount + warningCount;
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.engagementCount) els.engagementCount.textContent = engagementReview;
  if (els.postCount) els.postCount.textContent = postCount;
  if (els.accountCount) els.accountCount.textContent = configuredCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = staleCount
      ? `${staleCount} ${t("needCollection")}`
      : warningCount
        ? `${warningCount} ${t("warnings")}`
        : `${postCount} ${t("posts")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "timeline") return t("timeline");
  if (view === "accounts") return t("accounts");
  if (view === "settings") return t("settings");
  if (view === "calendar") return t("contentCalendar");
  if (view === "compose") return t("composerQueue");
  if (view === "shorts") return t("shortScripts");
  if (view === "engagement") return t("engagementInbox");
  if (view === "crisis") return t("crisisPlaybook");
  return t("overview");
}

export function platformBadge(platform) {
  return `<span class="badge platform-${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function methodBadge(method) {
  return `<span class="badge method">${escapeHtml(enumLabel(method, "method"))}</span>`;
}

export function accountName(accountId) {
  const account = accounts().find((item) => item.account_id === accountId);
  return account?.handle || account?.display_name || accountId;
}

export function sparkline(seriesData, { width = 220, height = 46 } = {}) {
  const values = (seriesData || []).map((point) => Number(point.followers || 0));
  if (values.length < 2) return `<span class="muted">${t("empty")}</span>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 4 - ((value - min) / span) * (height - 8)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ≤3 numbers the nav does not already show (the nav's attention block already
// covers posts tracked / accounts configured / review counts).
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  return [
    [t("totalFollowers"), `${num(metrics.total_followers)} ${delta(metrics.followers_delta_7d)}`],
    [t("impressions7d"), num(metrics.impressions_7d)],
    [t("engagementRate7d"), pct(metrics.engagement_rate_7d)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function filteredPosts(accountId = "") {
  const query = state.query.trim().toLowerCase();
  return posts()
    .filter((post) => {
      if (accountId && post.account_id !== accountId) return false;
      if (state.platformFilter && !accountId && post.platform !== state.platformFilter) return false;
      if (!query) return true;
      return [post.text, post.platform, accountName(post.account_id), post.type, post.media, post.agent_notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
}

export function mediaIndicator(post) {
  if (!post.media || post.media === "none") return "";
  const glyph = post.media === "video" ? "▶" : post.media === "carousel" ? "▤" : post.media === "link" ? "↗" : "▣";
  return `<span class="media-indicator" title="${escapeHtml(enumLabel(post.media, "media"))}">${glyph} ${escapeHtml(enumLabel(post.media, "media"))}${post.media_count > 1 ? ` ×${post.media_count}` : ""}</span>`;
}

export function platformChips() {
  const platforms = [...new Set(posts().map((post) => post.platform))];
  return `
    <button type="button" class="chip ${state.platformFilter === "" ? "active" : ""}" data-platform="">${t("allPlatforms")}</button>
    ${platforms
      .map(
        (platform) => `
      <button type="button" class="chip ${state.platformFilter === platform ? "active" : ""}" data-platform="${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</button>
    `,
      )
      .join("")}
  `;
}

export function bindPlatformChips() {
  els.viewFilters.querySelectorAll(".chip[data-platform]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.platformFilter = chip.dataset.platform || "";
      render();
    });
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const list = accounts();
  const reference = new Date(state.snapshot?.generated_at || Date.now()).getTime();
  const weekAgo = reference - STALE_AFTER_MS;
  const topPosts = posts()
    .filter((post) => new Date(post.posted_at).getTime() >= weekAgo)
    .sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0))
    .slice(0, 5);
  els.overviewBody.innerHTML = `
    <div class="ws-metrics">${metricsBand()}</div>
    ${warnings()}
    <div class="kpi-grid">
      ${list
        .map(
          (account) => `
        <a class="account-card" href="${recordUrl(account.account_id, "accounts")}">
          <div class="row between"><strong>${escapeHtml(account.handle)}</strong>${platformBadge(account.platform)}</div>
          <div class="muted">${escapeHtml(account.display_name)}</div>
          <div class="balance">${num(account.metrics?.followers)} <small class="muted">${t("followers")}</small></div>
          <div class="row stats">
            <span>${delta(account.metrics?.followers_delta_7d)} ${t("delta7d")}</span>
            <span>${delta(account.metrics?.followers_delta_28d)} ${t("delta28d")}</span>
          </div>
          <div class="row stats">
            <span>${t("impressions7d")} ${num(account.metrics?.impressions_7d)}</span>
            <span>${t("engagementRate")} ${pct(account.metrics?.engagement_rate_7d)}</span>
            <span>${t("profileVisits")} ${num(account.metrics?.profile_visits_7d)}</span>
          </div>
        </a>
      `,
        )
        .join("")}
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("followersTrend")}</h2>
        ${list
          .map(
            (account) => `
          <a class="trend-row" href="${recordUrl(account.account_id, "accounts")}">
            <span><strong>${escapeHtml(account.handle)}</strong><small>${escapeHtml(enumLabel(account.platform, "platform"))}</small></span>
            <span class="trend-spark">${sparkline(account.follower_series)}</span>
            <span class="num">${num(account.metrics?.followers)} ${delta(account.metrics?.followers_delta_7d)}</span>
          </a>
        `,
          )
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("topPostsThisWeek")}</h2>
        ${
          topPosts
            .map(
              (post) => `
          <a class="movement-row" href="${detailUrl(post.post_id, "timeline")}">
            <span><strong>${escapeHtml(truncate(post.text, 76))}</strong><small>${escapeHtml(enumLabel(post.platform, "platform"))} · ${escapeHtml(accountName(post.account_id))}</small></span>
            <span class="num">${num(post.metrics?.views)} <small class="muted">${t("views")}</small></span>
          </a>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
      ${shareOfVoicePanel()}
      <div class="overview-panel wide">
        <h2>${t("collectionFreshness")}</h2>
        ${list
          .map(
            (account) => `
          <div class="freshness-row">
            <span><strong>${escapeHtml(account.handle)}</strong><small>${escapeHtml(enumLabel(account.platform, "platform"))}</small></span>
            <span>${methodBadge(account.collection)}</span>
            <span class="muted">${t("lastSync")} ${dateTime(account.last_sync_at)}</span>
            <span class="status ${escapeHtml(account.status)}">${escapeHtml(enumLabel(account.status))}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

// ─── ECHO publishing side: shared UI helpers ────────────────────────────────

export function reviewBadge(status) {
  return `<span class="badge review-${escapeHtml(status)}">${escapeHtml(enumLabel(status, "review"))}</span>`;
}

export function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "SHIP";
  return `<span class="gate gate-${escapeHtml(verdict)}" title="${t("gateScore")} ${escapeHtml(String(gate.score))}">⛩ ${escapeHtml(enumLabel(verdict, "verdict"))} · ${escapeHtml(String(gate.score))}</span>`;
}

export function gatePanel(gate) {
  if (!gate) return "";
  return `
    <div class="gate-panel gate-${escapeHtml(gate.verdict)}">
      <div class="row between">
        <strong>${t("qualityGate")}</strong>
        ${gateBadge(gate)}
      </div>
      ${gate.summary ? `<div class="muted">${escapeHtml(gate.summary)}</div>` : ""}
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) => `
          <li class="gate-check ${escapeHtml(check.result)}">
            <span class="gate-dot" aria-hidden="true"></span>
            <span><strong>${escapeHtml(check.label)}</strong>${check.note ? `<small>${escapeHtml(check.note)}</small>` : ""}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function channelBadges(channels) {
  return (channels || []).map((channel) => platformBadge(channel)).join(" ");
}

// Reusable workflow (review-status) filter chips for the publishing queues.
export function workflowChips(list) {
  const counts = REVIEW_STATES.map((status) => ({
    status,
    n: list.filter((item) => item.status === status).length,
  })).filter((entry) => entry.n > 0);
  return `
    <button type="button" class="chip ${state.workflowFilter === "" ? "active" : ""}" data-workflow="">${t("allItems")} ${list.length}</button>
    ${counts
      .map(
        (entry) => `
      <button type="button" class="chip ${state.workflowFilter === entry.status ? "active" : ""}" data-workflow="${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status, "review"))} ${entry.n}</button>
    `,
      )
      .join("")}
  `;
}

export function byWorkflow(list) {
  if (!state.workflowFilter) return list;
  return list.filter((item) => item.status === state.workflowFilter);
}

export function bindWorkflowChips() {
  els.viewFilters.querySelectorAll(".chip[data-workflow]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.workflowFilter = chip.dataset.workflow || "";
      render();
    });
  });
}

// Review actions shared by drafts / shorts / engagement. `kind` picks the op.
export function reviewActions(kind, id, item) {
  const disabled = state.busy ? "disabled" : "";
  const blocked = item.gate?.verdict === "BLOCK";
  const opFor = { draft: "review_draft", short: "review_short", engagement: "review_engagement" }[kind];
  const idKey = { draft: "draft_id", short: "short_id", engagement: "item_id" }[kind];
  const buttons = [];
  if (!blocked) {
    buttons.push(
      `<button type="button" class="btn-approve" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="approved" ${disabled}>${t("approve")}</button>`,
    );
  }
  buttons.push(
    `<button type="button" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="changes_requested" ${disabled}>${t("requestChanges")}</button>`,
  );
  buttons.push(
    `<button type="button" class="btn-danger" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="blocked" ${disabled}>${t("block")}</button>`,
  );
  return `<div class="actions">${buttons.join("")}</div>`;
}

// Wire every data-op button in the current scene to applyOperation().
export function bindOps(root = els.detailBody) {
  root.querySelectorAll("[data-op]").forEach((button) => {
    button.addEventListener("click", () => {
      const op = { operation: button.dataset.op };
      if (button.dataset.idkey) op[button.dataset.idkey] = button.dataset.id;
      if (button.dataset.status) op.status = button.dataset.status;
      if (button.dataset.channel) op.channel = button.dataset.channel;
      if (button.dataset.scheduledFor) op.scheduled_for = button.dataset.scheduledFor;
      if (button.dataset.stepId) op.step_id = button.dataset.stepId;
      if (button.dataset.paused) op.publishing_paused = button.dataset.paused === "true";
      if (button.dataset.incident) op.status = button.dataset.incident;
      applyOperation(op);
    });
  });
}

function shareOfVoicePanel() {
  const sov = shareOfVoice();
  if (!sov || !(sov.entries || []).length) return "";
  const max = Math.max(...sov.entries.map((entry) => entry.share || 0)) || 1;
  return `
    <div class="overview-panel">
      <h2>${t("shareOfVoice")}</h2>
      <div class="muted">${t("youVsCompetitors")} · ${num(sov.total_mentions)} ${t("mentions7d")}</div>
      ${sov.entries
        .map(
          (entry) => `
        <div class="sov-row ${entry.is_self ? "self" : ""}">
          <span class="sov-name">${escapeHtml(entry.name)}</span>
          <span class="traffic-bar"><span style="width:${Math.round((Number(entry.share || 0) / max) * 100)}%"></span></span>
          <span class="num">${pct(entry.share)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

// ── Detail panel chrome shared by every drawer/split/page record view ──────
export function renderDetailChrome(emptyMessage) {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${emptyMessage}</div>` : "";
    return null;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    els.detailBody.innerHTML = `<div class="ws-detail-empty"><strong>${t("recordMissing")}</strong><p>${t("recordMissingDetail")}</p></div>`;
  }
  return item;
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const onPlainList = ready && PLAIN_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", (onRecordView || onPlainList) && Boolean(state.query));
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !ready || !(onRecordView || onPlainList);
  els.crisisPage.hidden = !ready || view !== "crisis";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (view === "accounts") renderAccountsView();
  else if (view === "timeline") renderTimelineView();
  else if (view === "calendar") renderCalendarView();
  else if (view === "compose") renderComposeView();
  else if (view === "shorts") renderShortsView();
  else if (view === "engagement") renderEngagementView();
  else if (view === "crisis") renderCrisis();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

function truncate(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
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

pagination.bind(els.listPanel);

els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("a, button, [data-goto-page]")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const { view } = state.route;
  if (!RECORD_VIEWS.includes(view)) return;
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
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) return;
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-social-language", state.lang);
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
    els.overviewBody.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
