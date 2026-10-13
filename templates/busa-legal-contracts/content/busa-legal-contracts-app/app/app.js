import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  normalizeCheckRow,
  normalizeClaimRow,
  normalizeClaimRuleRow,
  normalizeContractRow,
  normalizeIssueRow,
} from "./js/contracts-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { bindDetailEvents, renderOverview, renderRecordView, renderSettings } from "./js/review-views.js";

// Where a record opens, per view. Chosen by what people do with the record:
//   contracts → page:   a contract is a workplace — facts, obligations, the
//                       document checklist and every issue raised on it.
//   issues    → page:   an issue is edited in a multi-field workbench next to
//                       its risk checks; people stay for minutes.
//   review    → split:  the review queue is worked top to bottom, one verdict
//                       after the next, so the queue stays beside the record.
//   checks    → drawer: a check is a fact scanned by the dozen — read the
//                       evidence, maybe jump to its issue, return to the list.
//   claims    → drawer: a playbook clause / hard-stop term is looked up and
//                       left; the list behind it stays usable.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = ["contracts", "issues", "checks", "claims", "review"];
const REVIEW_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
const CHECK_FILTERS = ["rule", "platform", "contract", "result"];

// The Base behind each view (and the claims view's second tab).
export const baseKeyFor = (view, tab = "") =>
  view === "review" ? "issues" : view === "claims" && tab === "rules" ? "claim-rules" : view;
const modeFor = (view, tab = "") => DETAIL_MODES[view === "claims" ? baseKeyFor(view, tab) : view];

export const state = {
  // Prev/Next pager per paginated Base. records.list only exposes a forward
  // keyset cursor, so pageCursors[key][i] is the cursor that fetches page i+1.
  // Only neighbouring pages are reachable — one click, one request; there is
  // no "jump to page N", because reaching it would mean reading every page in
  // between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  counts: {},
  snapshot: null,
  settings: null,
  provider: null,
  // Records opened by URL that are not on the loaded page (records.get).
  extra: {},
  route: parseRoute(),
  edits: {},
  fieldEdits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("busa-legal-contracts-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-legal-contracts.sidebarCollapsed";
const FEATURED_DEMO_ISSUE = "d-msa-liability-us";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewTabs: byId("viewTabs"),
  viewFilters: byId("viewFilters"),
  statusSelect: byId("statusSelect"),
  checkFilters: byId("checkFilters"),
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
  failedCount: byId("count-failed"),
  exportCount: byId("count-export"),
  language: byId("language"),
};

export function isMobileLayout() {
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

export function date(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&tab=…&rule=…&peek=…]`. Search, filters,
// the playbook tab and the peeked record live in the URL so refresh, shared
// links and Back restore the same list context.
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
  const tab = view === "claims" && params.get("tab") === "rules" ? "rules" : "";
  const mode = RECORD_VIEWS.includes(view) ? modeFor(view, tab) : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  const filters = {};
  if (view === "checks") for (const key of CHECK_FILTERS) filters[key] = params.get(key) || "all";
  return {
    view,
    id,
    peek,
    tab,
    filters,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: view === "review" && REVIEW_STATES.includes(status) ? status : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "review" && route.status !== "all") params.set("status", route.status);
  if (route.view === "claims" && route.tab) params.set("tab", route.tab);
  for (const [key, value] of Object.entries(route.filters || {})) if (value && value !== "all") params.set(key, value);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view, tab = "") => ({ view, tab, query: "", status: "all", filters: {} });

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's
// mode. Review and checks have no page of their own — their records are
// issues and checks, whose full page is the issue workbench.
export const detailUrl = (id, view = state.route.view, tab = "") => {
  const target = view === "review" ? "issues" : view;
  const route = target === state.route.view ? state.route : blankRoute(target, tab);
  return `#/${target}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view, tab = view === state.route.view ? state.route.tab : "") => {
  if (modeFor(view, tab) === "page") return detailUrl(id, view, tab);
  const route = view === state.route.view && tab === state.route.tab ? state.route : blankRoute(view, tab);
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from a list (or from a drawer/split, e.g. the
  // review queue's "Open full page") so Back/Close/Escape step back to that
  // exact entry instead of pushing a new one.
  if (state.route.selectedId && (previousRouteWasList || (previous.peek && previous.view !== state.route.view))) {
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
  state.provider = provider;
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  state.counts = data.counts || {};
  state.extra = {};
  // Seed each paginated Base's cursor list with page 1 (no cursor) and the
  // page-2 cursor getState() learned while fetching page 1.
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  window.dispatchEvent(new CustomEvent("busa-legal-contracts:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, tab, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseKeyFor(view, tab);
  const extra = state.extra[key] || (state.extra[key] = new Map());
  if (recordFor(key, selectedId) || extra.has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    extra.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  extra.set(selectedId, undefined);
  try {
    extra.set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    extra.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "contracts"
      ? "#/contracts"
      : scenario === "issues"
        ? "#/issues"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "claims"
            ? "#/claims"
            : scenario === "review"
              ? "#/review"
              : scenario === "detail"
                ? `#/issues/${FEATURED_DEMO_ISSUE}`
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
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function contracts() {
  return state.snapshot?.contracts || [];
}

export function issues() {
  return state.snapshot?.issues || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

export function rules() {
  return state.snapshot?.rules || [];
}

export function reviewItems() {
  return state.snapshot?.review_items || [];
}

export function claimsRegistry() {
  return state.settings?.claims || { claims: [], rules: [] };
}

const LOADED_ROWS = {
  contracts: () => contracts(),
  issues: () => issues(),
  checks: () => checks(),
  claims: () => claimsRegistry().claims || [],
  "claim-rules": () => claimsRegistry().rules || [],
};
const ID_FIELD = {
  contracts: "contract_id",
  issues: "issue_id",
  checks: "check_id",
  claims: "claim_id",
  "claim-rules": "rule_id",
};

// Loaded page first, then a record fetched on its own for the URL.
export function recordFor(key, id) {
  if (!id) return null;
  return (LOADED_ROWS[key]?.() || []).find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

// `undefined` while records.get is in flight for this id.
export function recordPending(key, id) {
  return Boolean(state.extra[key]?.has(id)) && state.extra[key].get(id) === undefined;
}

export function contractById(contractId) {
  return recordFor("contracts", contractId);
}

export function issueById(issueId) {
  return recordFor("issues", issueId);
}

// A rule id is a catalog key (`hard_stop_terms`); never print it raw.
export function ruleName(ruleId) {
  return rules().find((item) => item.rule_id === ruleId)?.name || enumLabel(ruleId, "rule");
}

// A relation is a business id (`ct-…`). Resolve it to a name; when the target
// is not on the loaded page, say so — never print the id.
export function contractName(contractId) {
  if (!contractId) return "";
  return contractById(contractId)?.name || t("notLoaded");
}

export function reviewForIssue(issueId) {
  return reviewItems().find((item) => item.issue_id === issueId) || null;
}

export function platformRulesFor(platform) {
  const entry = (state.settings?.config_summary?.platforms || []).find((item) => item.platform === platform);
  return entry?.rules || {};
}

export function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

export function charLength(value) {
  return [...String(value || "")].length;
}

// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything tallied from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// An exact server count (records.count) when the provider has one; otherwise
// the loaded rows, flagged so the caller can label the scope.
export function countOf(key) {
  const exact = state.counts?.[key];
  if (exact != null) return { value: exact, exact: true };
  const issueStatus = (status) => issues().filter((item) => item.status === status).length;
  const checkResult = (result) => checks().filter((item) => item.result === result).length;
  const loaded = {
    issues_needs_review: () => issueStatus("needs_review"),
    issues_changes_requested: () => issueStatus("changes_requested"),
    issues_approved: () => issueStatus("approved"),
    checks_pass: () => checkResult("pass"),
    checks_warn: () => checkResult("warn"),
    checks_fail: () => checkResult("fail"),
  };
  const sourceKey = key.startsWith("checks") ? "checks" : "issues";
  return { value: loaded[key]?.() ?? 0, exact: !isPartial(sourceKey) };
}

const countLabel = ({ value, exact }) => `${value}${exact ? "" : "+"}`;

function renderShell() {
  applyI18n();
  const review = countOf("issues_needs_review");
  els.syncStatus.textContent = !state.snapshot
    ? t("loading")
    : state.snapshot.seller?.brand || (state.settings?.demo ? t("demoData") : t("setupNeeded"));
  if (els.reviewCount) els.reviewCount.textContent = countLabel(review);
  if (els.failedCount) els.failedCount.textContent = countLabel(countOf("checks_fail"));
  if (els.exportCount) els.exportCount.textContent = countLabel(countOf("issues_approved"));
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = review.value
      ? `${countLabel(review)} ${t("awaitingReview")}`
      : state.snapshot?.seller?.brand || "";
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view && Boolean(link.closest(".filters")));
  });
}

export function viewLabel(view) {
  if (view === "contracts") return t("contracts");
  if (view === "issues") return t("issues");
  if (view === "checks") return t("checks");
  if (view === "claims") return t("claimsRegistry");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function claimStatusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status, "claim"))}</span>`;
}

// Links a claims_registry check back to the offending hard-stop term / clause
// in the Playbook view (opens it in the drawer).
export function claimRefLinks(refs) {
  if (!refs) return "";
  const registry = claimsRegistry();
  const parts = [];
  for (const ruleId of refs.rules || []) {
    const rule = (registry.rules || []).find((entry) => entry.rule_id === ruleId);
    parts.push(
      `<a class="tag" href="${recordUrl(ruleId, "claims", "rules")}" title="${escapeHtml(rule?.reason || "")}">${escapeHtml(rule?.phrase || t("notLoaded"))}</a>`,
    );
  }
  for (const claimId of refs.claims || []) {
    const claim = (registry.claims || []).find((entry) => entry.claim_id === claimId);
    parts.push(
      `<a class="tag" href="${recordUrl(claimId, "claims", "")}">${escapeHtml(claim?.text || t("notLoaded"))}</a>`,
    );
  }
  return parts.length ? `<span class="claim-refs">${parts.join(" ")}</span>` : "";
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

export function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function localeBadge(locale) {
  return locale ? `<span class="tag">${escapeHtml(locale)}</span>` : "";
}

export function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings(issueId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !issueId || (item.draft_id && item.draft_id === issueId),
  );
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

export function issueLabel(issue) {
  return `${contractName(issue.contract_id)} · ${enumLabel(issue.platform, "platform")} ${issue.locale || ""}`.trim();
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredContracts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return contracts();
  return contracts().filter((item) =>
    matches(
      [item.name, item.sku, item.category, item.source, ...(item.keywords || []), ...(item.platforms || [])],
      query,
    ),
  );
}

export function filteredIssues() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return issues();
  return issues().filter((item) =>
    matches(
      [
        item.fields?.title,
        item.platform,
        item.locale,
        item.status,
        contractById(item.contract_id)?.name,
        contractById(item.contract_id)?.sku,
      ],
      query,
    ),
  );
}

export function filteredChecks() {
  const query = state.route.query.trim().toLowerCase();
  const { rule = "all", platform = "all", contract = "all", result = "all" } = state.route.filters;
  return checks().filter((item) => {
    if (rule !== "all" && item.rule_id !== rule) return false;
    const issue = issueById(item.issue_id);
    if (platform !== "all" && issue?.platform !== platform) return false;
    if (contract !== "all" && issue?.contract_id !== contract) return false;
    if (result !== "all" && item.result !== result) return false;
    if (!query) return true;
    return matches([ruleName(item.rule_id), item.evidence, item.result, issue ? issueLabel(issue) : ""], query);
  });
}

export function filteredReviewItems() {
  const query = state.route.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    const issue = issueById(item.issue_id);
    return matches([issue ? issueLabel(issue) : "", item.compliance_summary, item.status, issue?.fields?.title], query);
  });
}

export function filteredClaims() {
  const query = state.route.query.trim().toLowerCase();
  const registry = claimsRegistry();
  if (state.route.tab === "rules") {
    return (registry.rules || []).filter(
      (rule) => !query || matches([rule.phrase, rule.reason, rule.alternative], query),
    );
  }
  return (registry.claims || []).filter(
    (claim) => !query || matches([claim.text, claim.substantiation, claim.category], query),
  );
}

export function reviewStates() {
  return REVIEW_STATES;
}

export function render() {
  renderShell();
  const { view, selectedId, presentation, tab } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && modeFor(view, tab) === "split" && presentation !== "page");
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

// ── Pagination ─────────────────────────────────────────────────────────────
const PAGE_BINDINGS = {
  contracts: { path: "snapshot.contracts", normalize: normalizeContractRow },
  issues: { path: "snapshot.issues", normalize: normalizeIssueRow },
  checks: { path: "snapshot.checks", normalize: normalizeCheckRow },
  claims: { path: "settings.claims.claims", normalize: normalizeClaimRow },
  "claim-rules": { path: "settings.claims.rules", normalize: normalizeClaimRuleRow },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

export function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned. Never appends, never
// walks forward through pages the user did not ask for.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  const binding = PAGE_BINDINGS[key];
  if (!cursors || !binding) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    // fetchPage already ran the same per-row normalizer page 1 went through.
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    replacePageRows(binding.path, rows);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  return `${loadedCount}${isPartial(key) ? "+" : ""}`;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count.
export function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  return `<nav class="pager" aria-label="${t("pagination")}">
    <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
    <span class="pager-summary">${
      total == null
        ? t("pageN").replace("{current}", current)
        : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))
    }</span>
    <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
  </nav>`;
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
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.viewTabs.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-tab]");
  if (!segment) return;
  replaceRoute(`#/claims${routeQuery({}, { ...state.route, tab: segment.dataset.tab })}`);
});
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (!segment) return;
  replaceRoute(`#/review${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(`#/review${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.checkFilters.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-filter]");
  if (!select) return;
  const filters = { ...state.route.filters, [select.dataset.filter]: select.value };
  replaceRoute(`#/checks${routeQuery({ peek: state.route.peek }, { ...state.route, filters })}`);
});
bindDetailEvents();
els.detailBack.addEventListener("click", closeDetail);
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
  localStorage.setItem("busa-legal-contracts-language", state.lang);
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
