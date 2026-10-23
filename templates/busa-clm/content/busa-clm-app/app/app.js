import { messages } from "./i18n/messages.js";
import {
  atRiskObligationsCount,
  buildContract,
  computeMetrics,
  renewalWatchCount,
} from "./js/clm-model.js?v=0.1.0";
import { readContractForm, renderOverview, renderRecordView, renderSettings } from "./js/clm-views.js?v=0.1.0";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with the record:
//   contracts   → page:   a contract is a workplace — its edit form, its
//                         obligations and approvals — people stay a while.
//   obligations → drawer: an obligation is a fact scanned among many; you
//                         read it, mark it done or reopen it, and go back.
//   renewals    → split:  the notice list is worked top to bottom,
//                         acknowledging one notice after the next.
//   approvals   → split:  a review inbox — one decision after the next.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
// renewals is a view over the contracts Base; the others are their own Base.
export const VIEW_BASE = { contracts: "contracts", obligations: "obligations", renewals: "contracts", approvals: "approvals" };

const qs = new URLSearchParams(location.search);
export const state = {
  // Prev/Next pager per Base. records.list only exposes a forward keyset
  // cursor, so pageCursors[key][i] is the cursor that fetches page i+1. Only
  // neighbouring pages are reachable — one click, one request; there is no
  // "jump to page N" because reaching it would mean reading every page in
  // between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  attention: {},
  contracts: [],
  obligations: [],
  approvals: [],
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { contracts: new Map(), obligations: new Map(), approvals: new Map() },
  metrics: { contracts: 0, renewals_90d: 0, obligations_at_risk: 0, approvals: 0 },
  settings: null,
  ready: false,
  route: parseRoute(),
  lang: normalizeLang(qs.get("lang") || localStorage.getItem("busa-clm-language") || "auto"),
  demo: qs.has("demo"),
  busy: false,
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-clm.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
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
  sync: byId("sync"),
  search: byId("search"),
  refresh: byId("refresh"),
  viewRefresh: byId("viewRefresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  approvalsCount: byId("count-approvals"),
  renewalsCount: byId("count-renewals"),
  riskCount: byId("count-risk"),
  language: byId("language"),
  newContractBtn: byId("newContractBtn"),
};

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed));
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
    syncSidebarState();
    setMobileSidebarOpen(false);
    return;
  }
  setMobileSidebarOpen(false);
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value === "en") return "en";
  return "auto";
}

export function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[key] || messages.en.enum?.[key] || key.replaceAll("_", " ");
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
  els.sidebarToggle.title = t("toggleSidebar");
  els.sidebarToggle.setAttribute("aria-label", t("toggleSidebar"));
  if (els.mobileSidebarToggle) {
    els.mobileSidebarToggle.title = t("openSidebar");
    els.mobileSidebarToggle.setAttribute("aria-label", t("openSidebar"));
  }
  if (els.mobileRefresh) {
    els.mobileRefresh.title = t("refresh");
    els.mobileRefresh.setAttribute("aria-label", t("refresh"));
  }
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

export function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function datetime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
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

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
function replaceRoute(url) {
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
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  state.attention = data.attention || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.contracts = data.contracts || [];
  state.obligations = data.obligations || [];
  state.approvals = data.approvals || [];
  state.extra = { contracts: new Map(), obligations: new Map(), approvals: new Map() };
  state.metrics = data.metrics || state.metrics;
  state.settings = data;
  state.ready = true;
  window.dispatchEvent(new CustomEvent("busa-clm:state", { detail: data }));
  // Do not wipe a half-typed new contract when a refresh lands.
  const isEditingNewContract =
    state.route.view === "contracts" && state.route.id === "new" && document.querySelector("#contractForm");
  if (!isEditingNewContract) render();
  ensureSelectedRecord();
}

function recomputeDemoMetrics() {
  state.metrics = computeMetrics(state.contracts, state.obligations, state.approvals, state.settings?.generated_at);
}

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(base, id) {
  if (!id) return null;
  return (state[base] || []).find((item) => item.id === id) || state.extra[base]?.get(id) || null;
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.ready || !selectedId || selectedId === "new" || !RECORD_VIEWS.includes(view)) return;
  const base = VIEW_BASE[view];
  if (recordById(base, selectedId) || state.extra[base].has(selectedId)) return;
  const provider = await getProvider();
  if (typeof provider?.getRecord !== "function") {
    state.extra[base].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[base].set(selectedId, undefined);
  try {
    state.extra[base].set(selectedId, (await provider.getRecord(base, selectedId)) || null);
  } catch {
    state.extra[base].set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

// The configured page size for a paginated Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything counted from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    // fetchPage applies the same per-row normalizer page 1 went through.
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    state[key] = rows;
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// ── Sidebar attention numbers ──────────────────────────────────────────────
// Exact server counts when the provider has them (records.count); otherwise
// the loaded rows, marked with "+" when more pages exist.
function attentionValue(key, loaded, base) {
  const exact = state.attention?.[key];
  if (exact != null && !state.demo) return String(exact);
  return `${loaded}${isPartial(base) ? "+" : ""}`;
}

export function approvalsNeedingReview() {
  return attentionValue("approvals", state.metrics?.approvals ?? 0, "approvals");
}

function renderShell() {
  applyI18n();
  const approvals = approvalsNeedingReview();
  const renewals = attentionValue("renewals", renewalWatchCount(state.contracts), "contracts");
  const risks = attentionValue("risks", atRiskObligationsCount(state.obligations), "obligations");
  // Where the data comes from — the counts already sit in the attention block.
  els.sync.textContent = !state.ready ? t("loading") : state.settings?.demo ? t("demoData") : t("liveData");
  if (els.approvalsCount) els.approvalsCount.textContent = approvals;
  if (els.renewalsCount) els.renewalsCount.textContent = renewals;
  if (els.riskCount) els.riskCount.textContent = risks;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent =
      approvals !== "0" ? `${approvals} ${t("needApproval")}` : `${risks} ${t("riskCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "contracts") return t("contracts");
  if (view === "obligations") return t("obligations");
  if (view === "renewals") return t("renewals");
  if (view === "approvals") return t("approvals");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = state.ready;
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

// ---- Direct writes: create/edit a contract, mark an obligation done,
// acknowledge a renewal notice, and record an approval decision -- applied
// straight through the active provider (Busabase or demo). This is a
// direct-manipulation control panel, not a review/approval queue: each
// decision is a field write on the record itself. Demo mode never reaches
// Busabase; it mutates the in-memory snapshot already rendered so ?demo=1
// stays fully interactive for screenshots/docs. ----

function showError(error) {
  state.notice = error instanceof Error ? error.message : String(error);
  render();
}

async function runWrite(write) {
  state.busy = true;
  state.notice = "";
  render();
  try {
    const provider = await getProvider();
    const result = await write(provider);
    await loadState();
    // Without write access the change is a ChangeRequest, and the record keeps
    // its old values until someone who has it approves: say that, after the
    // reload, so the person is not left thinking nothing happened.
    if (result?.pending) state.notice = t("savedForReview");
    return result;
  } catch (error) {
    showError(error);
    return null;
  } finally {
    state.busy = false;
    render();
  }
}

export async function submitCreateContract(input) {
  if (state.demo) {
    const contract = buildContract(input);
    state.contracts.push(contract);
    recomputeDemoMetrics();
    render();
    return contract;
  }
  return runWrite((provider) => provider.createContract(input));
}

export async function submitUpdateContract(id, input) {
  if (state.demo) {
    const index = state.contracts.findIndex((item) => item.id === id);
    if (index !== -1) {
      const existing = state.contracts[index];
      state.contracts[index] = buildContract({ ...existing, ...input, id, created_at: existing.created_at });
      recomputeDemoMetrics();
    }
    render();
    return;
  }
  await runWrite((provider) => provider.updateContract(id, input));
}

export async function submitMarkObligationDone(id, done) {
  if (state.demo) {
    const index = state.obligations.findIndex((item) => item.id === id);
    if (index !== -1) {
      state.obligations[index] = {
        ...state.obligations[index],
        status: done ? "done" : "open",
        updated_at: new Date().toISOString(),
      };
      recomputeDemoMetrics();
    }
    render();
    return;
  }
  await runWrite((provider) => provider.markObligationDone(id, done));
}

export async function submitAcknowledgeRenewal(contractId) {
  if (state.demo) {
    const index = state.contracts.findIndex((item) => item.id === contractId);
    if (index !== -1) {
      state.contracts[index] = { ...state.contracts[index], notice_acknowledged_at: new Date().toISOString() };
    }
    render();
    return;
  }
  await runWrite((provider) => provider.acknowledgeRenewal(contractId));
}

export async function submitApprovalDecision(id, action, note = "") {
  if (state.demo) {
    const index = state.approvals.findIndex((item) => item.id === id);
    if (index !== -1) {
      const status = { approve: "approved", changes: "changes_requested", block: "blocked" }[action] || action;
      state.approvals[index] = {
        ...state.approvals[index],
        status,
        decision_note: note,
        decided_at: new Date().toISOString(),
      };
      recomputeDemoMetrics();
    }
    render();
    return;
  }
  await runWrite((provider) => provider.saveApprovalDecision(id, action, note));
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button, input, select, textarea")) return;
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
els.detailBack.addEventListener("click", closeDetail);
// Row actions and detail actions, wherever they render (list or detail).
els.viewPage.addEventListener("click", (event) => {
  const obligation = event.target.closest("[data-obligation-action]");
  if (obligation) {
    submitMarkObligationDone(obligation.dataset.id, obligation.dataset.obligationAction === "done");
    return;
  }
  const acknowledge = event.target.closest("[data-acknowledge-id]");
  if (acknowledge) {
    submitAcknowledgeRenewal(acknowledge.dataset.acknowledgeId);
    return;
  }
  const decision = event.target.closest("[data-decision]");
  if (decision) {
    const note = decision.closest("[data-approval]")?.querySelector("[data-decision-note]")?.value || "";
    submitApprovalDecision(decision.dataset.id, decision.dataset.decision, note);
    return;
  }
  // An obligation row on the contract page opens that obligation.
  if (event.target.closest("a, button, input, select, textarea")) return;
  const embedded = event.target.closest("#detailBody .obligations-table tr[data-id]");
  if (embedded) location.hash = recordUrl(embedded.dataset.id, "obligations");
});
els.detailBody.addEventListener("submit", async (event) => {
  const form = event.target.closest("#contractForm");
  if (!form) return;
  event.preventDefault();
  const input = readContractForm(form);
  const id = form.dataset.contractId;
  if (id) {
    await submitUpdateContract(id, input);
    return;
  }
  const contract = await submitCreateContract(input);
  // A queued contract does not exist yet, so there is no page to open: stay
  // here, where the sent-for-review notice is showing.
  if (contract?.id && !contract.pending) location.hash = detailUrl(contract.id, "contracts");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh.addEventListener("click", () => loadState().catch(showError));
els.viewRefresh?.addEventListener("click", () => loadState().catch(showError));
els.mobileRefresh?.addEventListener("click", () => loadState().catch(showError));
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-clm-language", state.lang);
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
render();
boot();
