import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  decideAction,
  queueReplyAction,
  renderOverview,
  renderRecordView,
  renderSettings,
} from "./js/message-views.js";
import { REPLY_STATUSES, withReplyRefs } from "./js/messenger-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const FEATURED_DEMO_CONVERSATION = "wa-lena-pricing";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];

// The Base behind each record view.
export const VIEW_BASE = { inbox: "conversations", outbox: "replies", accounts: "accounts" };
// Where a record opens, per view. Chosen by what people do with the record:
//   inbox    → split:  conversations are worked top to bottom — read, decide,
//                      queue a reply, next — so the queue stays beside the chat.
//   outbox   → split:  the reply review queue is the same motion: approve or
//                      send back one draft after the next.
//   accounts → drawer: an account is a fact you scan, check its connector or
//                      readiness, and return to the list.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, per Base, in config.js `ui.detail_modes`.
export const DETAIL_MODES = Object.fromEntries(
  Object.entries(VIEW_BASE).map(([view, base]) => [view, appConfig.ui.detail_modes[base] || "drawer"]),
);
const RECORD_VIEWS = Object.keys(VIEW_BASE);
const OUTBOX_STATES = ["all", ...REPLY_STATUSES];

export const state = {
  snapshot: null,
  outbox: null,
  settings: null,
  route: parseRoute(),
  drafts: {},
  notes: {},
  edits: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-messenger-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100,
  pagination: {},
  totalCount: {},
  workflowCount: {},
  loadingMore: {},
  loadMoreError: {},
  messageRows: [],
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-messenger.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  notice: byId("notice"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  statusSelect: byId("statusSelect"),
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
  needsReplyCount: byId("count-needs-reply"),
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function dateTime(value) {
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

// Month and day only — for a narrow list column; the detail shows the time.
export function shortDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

function referenceNow() {
  if (state.settings?.demo && state.snapshot?.generated_at) return new Date(state.snapshot.generated_at).getTime();
  return Date.now();
}

export function waitingLabel(since) {
  if (!since) return "";
  const ms = Math.max(0, referenceNow() - new Date(since).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}${activeLang() === "zh" ? " 分钟" : "m"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${activeLang() === "zh" ? " 小时" : "h"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const zh = activeLang() === "zh";
  return rest ? `${days}${zh ? " 天 " : "d "}${rest}${zh ? " 小时" : "h"}` : `${days}${zh ? " 天" : "d"}`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the outbox status filter
// and the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : "";
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
    status: view === "outbox" && OUTBOX_STATES.includes(status) ? status : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "outbox" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "", status: "all" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
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
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.outbox = data.outbox;
  state.settings = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || {};
  state.messageRows = data.messageRows || [];
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-messenger:state", { detail: data }));
  render();
}

// One click, one page: appends the next page of one Base and stops.
export async function loadMore(key) {
  const cursor = state.pagination[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    if (key === "conversations") {
      const known = new Set(conversations().map((item) => item.conversation_id));
      const additions = page.rows.filter((item) => !known.has(item.conversation_id));
      for (const conversation of additions) attachLoadedMessages(conversation);
      conversations().push(...additions);
    } else if (key === "messages") {
      for (const message of page.rows) {
        if (!state.messageRows.some((item) => item.message_id === message.message_id)) state.messageRows.push(message);
        const conversation = conversationById(message.conversation_id);
        if (!conversation || conversation.messages.some((item) => item.message_id === message.message_id)) continue;
        const { conversation_id: _conversationId, ...item } = message;
        conversation.messages.push(item);
        conversation.messages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
        conversation.last_message_at = conversation.messages.at(-1)?.sent_at || "";
        conversation.last_incoming_at =
          [...conversation.messages].reverse().find((entry) => entry.direction === "incoming")?.sent_at || "";
      }
    } else if (key === "replies") {
      const known = new Set(outboxReplies().map((item) => item.reply_id));
      state.outbox.replies = withReplyRefs([
        ...outboxReplies(),
        ...page.rows.filter((item) => !known.has(item.reply_id)),
      ]);
    } else if (key === "accounts") {
      const known = new Set(state.snapshot.accounts.map((item) => item.account_id));
      state.snapshot.accounts.push(...page.rows.filter((item) => !known.has(item.account_id)));
    } else if (key === "sync-log") {
      const known = new Set(state.snapshot.sync_log.map((item) => JSON.stringify(item)));
      state.snapshot.sync_log.push(...page.rows.filter((item) => !known.has(JSON.stringify(item))));
    }
    state.pagination[key] = page.nextCursor;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

function attachLoadedMessages(conversation) {
  const items = state.messageRows
    .filter((message) => message.conversation_id === conversation.conversation_id)
    .map(({ conversation_id: _conversationId, ...message }) => message)
    .sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
  conversation.messages = items;
  conversation.last_message_at = items.at(-1)?.sent_at || "";
  conversation.last_incoming_at =
    [...items].reverse().find((message) => message.direction === "incoming")?.sent_at || "";
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "inbox"
      ? "#/inbox"
      : scenario === "chat"
        ? `#/inbox?peek=${FEATURED_DEMO_CONVERSATION}`
        : scenario === "outbox"
          ? "#/outbox"
          : scenario === "accounts"
            ? "#/accounts"
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
  for (const button of [els.refresh, els.viewRefresh]) {
    button.textContent = t("refresh");
    button.title = t("refresh");
  }
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function conversations() {
  return state.snapshot?.conversations || [];
}

export function accounts() {
  return state.snapshot?.accounts || [];
}

export function outboxReplies() {
  return state.outbox?.replies || [];
}

export function pendingRepliesFor(conversationId) {
  return outboxReplies().filter(
    (reply) => reply.conversation_id === conversationId && PENDING_STATUSES.includes(reply.status),
  );
}

export function conversationById(id) {
  return conversations().find((item) => item.conversation_id === id);
}

export function accountById(id) {
  return accounts().find((item) => item.account_id === id);
}

// A relation is a business id (`wa-biz`, `wa-lena-pricing`). Resolve it to a
// name; when the target is not on the loaded page, say so — never print the id.
export function accountName(id) {
  if (!id) return "";
  return accountById(id)?.display_name || t("notLoaded");
}

export function conversationTitle(reply) {
  return conversationById(reply.conversation_id)?.title || reply.conversation_title || t("notLoaded");
}

const ID_FIELD = { inbox: "conversation_id", outbox: "reply_id", accounts: "account_id" };

export function recordById(view, id) {
  if (!id) return null;
  const rows = view === "inbox" ? conversations() : view === "outbox" ? outboxReplies() : accounts();
  return rows.find((item) => item[ID_FIELD[view]] === id) || null;
}

export function awaitingConversations() {
  return conversations().filter((item) => item.awaiting_reply);
}

// True while a Base holds only part of its rows. Anything counted from loaded
// rows must say so.
export const isPartial = (key) => Boolean(state.pagination[key]);

function renderShell() {
  applyI18n();
  const awaiting = state.workflowCount.awaiting ?? awaitingConversations().length;
  const approved =
    state.workflowCount.approved ?? outboxReplies().filter((reply) => reply.status === "approved").length;
  const blocked = state.workflowCount.blocked ?? outboxReplies().filter((reply) => reply.status === "blocked").length;
  // Where the data comes from — the counts already sit in the attention block.
  els.syncStatus.textContent = !state.snapshot ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.needsReplyCount) els.needsReplyCount.textContent = awaiting;
  if (els.approvedCount) els.approvedCount.textContent = approved;
  if (els.blockedCount) els.blockedCount.textContent = blocked;
  if (els.mobileViewTitle) {
    const { view, selectedId } = state.route;
    const record = selectedId ? recordById(view, selectedId) : null;
    els.mobileViewTitle.textContent = record ? recordTitle(view, record) : viewLabel(view);
  }
  if (els.mobileViewMeta) {
    const conversationTotal =
      state.totalCount.conversations ?? `${conversations().length}${isPartial("conversations") ? "+" : ""}`;
    els.mobileViewMeta.textContent = awaiting
      ? `${awaiting} ${t("needsReply")}`
      : `${conversationTotal} ${t("conversationCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function recordTitle(view, record) {
  if (view === "inbox") return record.title;
  if (view === "outbox") return `${t("reply")} #${record.ref}`;
  return record.display_name;
}

// Transient result of an action (queued, decided, failed). Floats over the
// page instead of pushing the list down.
export function flashNotice(text, tone = "ok") {
  if (!els.notice) return;
  els.notice.textContent = text;
  els.notice.className = `notice ${tone}`;
  els.notice.hidden = false;
  clearTimeout(flashNotice.timer);
  flashNotice.timer = setTimeout(() => {
    els.notice.hidden = true;
  }, 3500);
}

export function viewLabel(view) {
  if (view === "inbox") return t("inbox");
  if (view === "outbox") return t("outbox");
  if (view === "accounts") return t("accounts");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}"><span class="dot"></span>${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

// The platform as a coloured dot only, named in its tooltip — for the narrow
// first column of a queue.
export function platformDot(platform) {
  const label = enumLabel(platform, "platform");
  return `<span class="platform-dot ${escapeHtml(platform)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
}

export function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function matchesQuery(values) {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function conversationActivityAt(item) {
  const fromMessages = (item.messages || []).reduce(
    (latest, message) => (String(message.sent_at) > latest ? String(message.sent_at) : latest),
    "",
  );
  return item.last_message_at || fromMessages || "";
}

export function filteredConversations() {
  return conversations()
    .filter((item) =>
      matchesQuery([
        item.title,
        item.channel,
        item.workspace,
        enumLabel(item.platform, "platform"),
        ...(item.participants || []),
        ...(item.messages || []).slice(-6).map((message) => message.text),
      ]),
    )
    .sort((a, b) => conversationActivityAt(b).localeCompare(conversationActivityAt(a)));
}

export function filteredReplies() {
  return outboxReplies().filter(
    (reply) =>
      (state.route.status === "all" || reply.status === state.route.status) &&
      matchesQuery([
        reply.text,
        reply.reason,
        conversationTitle(reply),
        enumLabel(reply.platform, "platform"),
        enumLabel(reply.status),
        `#${reply.ref}`,
      ]),
  );
}

export function filteredAccounts() {
  return accounts().filter((account) =>
    matchesQuery([
      account.display_name,
      account.workspace,
      enumLabel(account.platform, "platform"),
      enumLabel(account.connector, "connector"),
    ]),
  );
}

export function outboxStates() {
  return OUTBOX_STATES;
}

export function conversationPreview(conversation) {
  const last = (conversation.messages || [])[conversation.messages.length - 1];
  if (!last) return "";
  return `${last.sender}: ${last.text}`;
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
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
function onLoadMore(event) {
  const button = event.target.closest("[data-load-more]");
  if (!button) return false;
  loadMore(button.dataset.loadMore);
  return true;
}

els.listPanel.addEventListener("click", (event) => {
  if (onLoadMore(event)) return;
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
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(`#/outbox${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target;
  if (field.id === "composer-text") state.drafts[field.dataset.conversation] = field.value;
  else if (field.id === "composer-note") state.notes[field.dataset.conversation] = field.value;
  else if (field.matches("[data-reply-text]")) state.edits[field.closest("[data-reply-card]").dataset.replyCard] = field.value;
});
els.detailBody.addEventListener("click", (event) => {
  if (onLoadMore(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "queue-reply") queueReplyAction(button.dataset.conversation);
  else if (button.dataset.action === "decide") {
    decideAction(button.dataset.reply, button.dataset.decision, button.closest("[data-reply-card]"));
  }
});
byId("settingsBody").addEventListener("click", onLoadMore);
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
for (const button of [els.refresh, els.viewRefresh, els.mobileRefresh]) {
  button?.addEventListener("click", () => loadState());
}
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-messenger-language", state.lang);
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
