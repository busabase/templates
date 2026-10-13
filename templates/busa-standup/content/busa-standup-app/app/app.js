import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { computeMetrics } from "./js/standup-model.js?v=0.1.0";
import { renderOverview, renderRecordView, renderSettings, submitDecision } from "./js/team-views.js";

// Where a record opens, per view — declared once in config.js `ui.detail_modes`:
//   members   → page:   a member's profile is a workplace of its own (open
//                       blockers + a recent-updates timeline) — people stay a
//                       while.
//   blockers  → drawer: a fact people scan many of, read, and return to the
//                       list.
//   reminders → split:  the approval queue is worked top to bottom, one
//                       draft after the next, so the queue stays beside it.
//   history   → page:   a standup day is its own workspace — digest plus
//                       every member's update.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;
export const RECORD_VIEWS = Object.keys(DETAIL_MODES);
export const REMINDER_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
// Status filter options per view (first entry is the default / "no filter
// applied" value, so it never appears in the URL). Views with no entry here
// (members, history) have no status filter.
export const STATUS_FILTERS = {
  blockers: ["open", "resolved", "all"],
  reminders: ["all", ...REMINDER_STATUSES],
};

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-standup-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-standup.sidebarCollapsed";

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
  missingCount: byId("count-missing"),
  blockerCount: byId("count-blockers"),
  language: byId("language"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.snapshot[key] = rows;
    state.snapshot.metrics = computeMetrics(state.snapshot);
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

export function pagerControl(key) {
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

export function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

export function dayLabel(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat(locale(), {
    month: "short",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export function timeLabel(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: teamTimezone(),
  }).format(new Date(iso));
}

export function dateTimeLabel(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: teamTimezone(),
  }).format(new Date(iso));
}

function teamTimezone() {
  return state.snapshot?.team?.timezone || undefined;
}

function nowMs() {
  if (state.demo && state.snapshot?.generated_at) return Date.parse(state.snapshot.generated_at);
  return Date.now();
}

function ageDays(isoDate) {
  if (!isoDate) return 0;
  return Math.max(0, Math.round((nowMs() - Date.parse(`${isoDate}T00:00:00.000Z`)) / 86400000));
}

export function blockerAgeDays(blocker) {
  if (blocker.status === "resolved" && blocker.resolved_date) {
    return Math.max(
      0,
      Math.round(
        (Date.parse(`${blocker.resolved_date}T00:00:00.000Z`) - Date.parse(`${blocker.raised_date}T00:00:00.000Z`)) /
          86400000,
      ),
    );
  }
  return ageDays(blocker.raised_date);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the status filter and
// the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.
export function parseRoute() {
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
  const statusOptions = STATUS_FILTERS[view];
  const rawStatus = params.get("status");
  const status = statusOptions ? (statusOptions.includes(rawStatus) ? rawStatus : statusOptions[0]) : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status,
  };
}

function routeQuery(extra = {}, route = state.route) {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  const statusOptions = STATUS_FILTERS[route.view];
  if (statusOptions && route.status && route.status !== statusOptions[0]) params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "", status: STATUS_FILTERS[view]?.[0] || "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "", status: STATUS_FILTERS[view]?.[0] || "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes and
// filter clicks should not each become a Back step.
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

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-standup:state", { detail: data }));
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "members"
      ? "#/members"
      : scenario === "blockers"
        ? "#/blockers?status=open"
        : scenario === "history"
          ? "#/history"
          : scenario === "detail"
            ? "#/members/alex"
            : scenario === "reminders"
              ? "#/reminders"
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
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

/* Data accessors */

export function members() {
  return state.snapshot?.members || [];
}

export function memberById(memberId) {
  return members().find((member) => member.member_id === memberId);
}

export function memberName(memberId) {
  return memberById(memberId)?.name || memberId || "";
}

export function days() {
  return [...(state.snapshot?.days || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function latestDay() {
  const list = days();
  return list[list.length - 1] || null;
}

export function dayByDate(date) {
  return days().find((day) => day.date === date);
}

export function blockersList() {
  return state.snapshot?.blockers || [];
}

export function reminders() {
  const list = state.snapshot?.reminders || [];
  if (!state.demo) return list;
  return list.map((reminder) => {
    const local = state.demoDecisions[reminder.id];
    if (!local) return reminder;
    let status = reminder.status;
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
    return { ...reminder, status, decision: local, draft: local.draft ?? reminder.draft };
  });
}

function viewRows(view) {
  if (view === "members") return members();
  if (view === "blockers") return blockersList();
  if (view === "reminders") return reminders();
  if (view === "history") return days();
  return [];
}

const ID_FIELD = { members: "member_id", blockers: "blocker_id", reminders: "id", history: "date" };

export function recordById(view, id) {
  if (!id) return null;
  return viewRows(view).find((item) => item[ID_FIELD[view]] === id) || null;
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredMembers() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return members();
  return members().filter((member) => matches([member.name, member.role, member.timezone, member.channel], query));
}

export function filteredBlockers() {
  const query = state.route.query.trim().toLowerCase();
  return blockersList()
    .filter((blocker) => state.route.status === "all" || blocker.status === state.route.status)
    .filter(
      (blocker) =>
        !query ||
        matches(
          [blocker.text, memberName(blocker.member_id), blocker.severity, blocker.status, blocker.suggested_action],
          query,
        ),
    );
}

export function filteredReminders() {
  const query = state.route.query.trim().toLowerCase();
  return reminders()
    .filter((reminder) => state.route.status === "all" || reminder.status === state.route.status)
    .filter(
      (reminder) =>
        !query ||
        matches(
          [reminder.title, reminder.reason, reminder.draft, memberName(reminder.member_id), reminder.status, reminder.channel],
          query,
        ),
    );
}

export function filteredHistory() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return days().slice().reverse();
  return days()
    .slice()
    .reverse()
    .filter((day) => matches([dayLabel(day.date), day.digest], query));
}

/* Shell */

function viewLabel(view) {
  if (view === "members") return t("members");
  if (view === "blockers") return t("blockers");
  if (view === "reminders") return t("reminders");
  if (view === "history") return t("history");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = reminders().filter((reminder) => reminder.status === "needs_review").length;
  const missing = metrics.missing_today ?? 0;
  const openBlockers = metrics.open_blockers ?? 0;
  els.syncStatus.textContent = state.snapshot ? state.snapshot?.team?.name || t("empty") : t("loading");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.missingCount) els.missingCount.textContent = missing;
  if (els.blockerCount) els.blockerCount.textContent = openBlockers;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("remindersToReview")}`
      : `${metrics.submitted_today ?? 0}/${metrics.expected_today ?? 0} ${t("submitted")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

/* Shared components */

function sourceBadge(source) {
  return `<span class="badge source-${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

export function channelBadge(channel) {
  return `<span class="badge source-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="badge severity-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function statusBadge(status, group) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status, group))}</span>`;
}

export function moodDot(mood) {
  if (!mood) return "";
  return `<span class="mood-dot mood-${escapeHtml(mood)}" title="${t("mood")}: ${escapeHtml(enumLabel(mood, "mood"))}"></span>`;
}

export function avatar(member) {
  const initial = (member?.name || "?").trim().charAt(0).toUpperCase();
  return `<span class="avatar">${escapeHtml(initial)}</span>`;
}

export function participationBar(submitted, expected) {
  const ratio = expected ? Math.min(1, submitted / expected) : 0;
  const width = Math.round(ratio * 120);
  return `
    <svg class="participation-svg" viewBox="0 0 120 8" width="120" height="8" role="img" aria-label="${submitted}/${expected}" preserveAspectRatio="none">
      <rect x="0" y="0" width="120" height="8" rx="4" class="svg-track"></rect>
      <rect x="0" y="0" width="${width}" height="8" rx="4" class="svg-bar ${ratio >= 1 ? "full" : ""}"></rect>
    </svg>
  `;
}

export function itemList(items) {
  if (!items?.length) return `<li class="muted-item">—</li>`;
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function updateBlockerRows(update) {
  if (!update.blockers?.length) return "";
  return `
    <div class="card-section blockers-section">
      <h4>${t("blockersLabel")}</h4>
      ${update.blockers
        .map(
          (blocker) => `
        <a class="card-blocker ${escapeHtml(blocker.status)}" href="${recordUrl(blocker.blocker_id, "blockers")}">
          ${severityBadge(blocker.severity)}
          ${blocker.status === "resolved" ? statusBadge("resolved", "blocker_status") : ""}
          <span>${escapeHtml(blocker.text)}</span>
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function memberCard(member, update) {
  return `
    <article class="member-card">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="${detailUrl(member.member_id, "members")}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
        ${moodDot(update.mood)}
      </header>
      <div class="member-card-meta">
        <span>${escapeHtml(timeLabel(update.submitted_at))}</span>
        ${sourceBadge(update.source)}
      </div>
      <div class="card-section">
        <h4>${t("yesterday")}</h4>
        <ul>${itemList(update.yesterday)}</ul>
      </div>
      <div class="card-section">
        <h4>${t("todayPlan")}</h4>
        <ul>${itemList(update.today)}</ul>
      </div>
      ${updateBlockerRows(update)}
    </article>
  `;
}

function lastSubmittedBefore(memberId, beforeDate) {
  let last = "";
  for (const day of days()) {
    if (beforeDate && day.date >= beforeDate) continue;
    if ((day.updates || []).some((update) => update.member_id === memberId)) last = day.date;
  }
  return last;
}

function missingCard(member, { withReminderLink = false, beforeDate = "" } = {}) {
  const reminder = withReminderLink
    ? reminders().find(
        (item) =>
          item.member_id === member.member_id &&
          item.type === "missing_checkin" &&
          ["needs_review", "changes_requested", "approved"].includes(item.status),
      )
    : null;
  return `
    <article class="member-card missing">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="${detailUrl(member.member_id, "members")}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
      </header>
      <div class="missing-body">
        <span class="missing-label">${t("notSubmitted")}</span>
        <span class="muted">${t("lastCheckin")}: ${lastSubmittedBefore(member.member_id, beforeDate) ? escapeHtml(dayLabel(lastSubmittedBefore(member.member_id, beforeDate))) : "—"}</span>
        ${reminder ? `<a class="reminder-link" href="${recordUrl(reminder.id, "reminders")}">Reminder #${reminder.ref} · ${escapeHtml(enumLabel(reminder.status, "reminder_status"))}</a>` : ""}
      </div>
    </article>
  `;
}

function leaveCard(member) {
  return `
    <article class="member-card on-leave">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="${detailUrl(member.member_id, "members")}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
      </header>
      <div class="missing-body">
        <span class="badge status-on-leave">${t("onLeave")}</span>
      </div>
    </article>
  `;
}

export function dayBoard(day, { withReminderLink = false } = {}) {
  const updatesById = new Map((day.updates || []).map((update) => [update.member_id, update]));
  const onLeave = new Set(day.on_leave || []);
  const cards = members()
    .filter((member) => member.active !== false)
    .map((member) => {
      const update = updatesById.get(member.member_id);
      if (update) return memberCard(member, update);
      if (onLeave.has(member.member_id)) return leaveCard(member);
      return missingCard(member, { withReminderLink, beforeDate: day.date });
    });
  return `<div class="board-grid">${cards.join("") || `<div class="empty">${t("empty")}</div>`}</div>`;
}

export function digestPanel(day) {
  if (!day?.digest) return "";
  return `
    <section class="digest-panel">
      <h2>${t("teamDigest")}</h2>
      <p>${escapeHtml(day.digest)}</p>
    </section>
  `;
}

export function warnings(filter = () => true) {
  const items = (state.snapshot?.warnings || []).filter(filter);
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

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page");
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && presentation === "split");
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
    pagination.goToPage(key, Number(page));
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
els.viewFilters.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-status]");
  if (!chip) return;
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status: chip.dataset.status })}`,
  );
});
els.statusSelect?.addEventListener("change", (event) => {
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`,
  );
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) submitDecision(button.dataset.id, button.dataset.decision);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-standup-language", state.lang);
  if (state.demo) {
    loadState();
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
