import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { draftToReviewItem } from "./js/listing-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  bindDetailEvents,
  renderOverview,
  renderRecordView,
  renderSettings,
} from "./js/review-views.js";

// Where a record opens, per view. Chosen by what people do with the record:
//   products → page:   a product is a workplace — specs, features, keywords,
//                      image checklist and every draft written from it.
//   drafts   → page:   the draft workbench edits long listing copy field by
//                      field; people stay there for minutes.
//   checks   → drawer: a check is a fact you scan many of — read the evidence,
//                      jump to the draft, come back to the list.
//   claims   → drawer: a claim or banned phrase is a short registry entry you
//                      look up and return from.
//   review   → split:  the review queue is worked top to bottom, one draft
//                      after the next, so the queue stays beside the record.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
export const REVIEW_STATES = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
const CHECK_FILTERS = ["rule", "platform", "product", "result"];

export const state = {
  // Prev/Next pager per paginated Base. records.list only exposes a forward
  // keyset cursor, so pageCursors[key][i] is the cursor that fetches page i+1.
  // Only neighbouring pages are reachable — one click, one request; there is
  // no "jump to page N" because reaching it would mean reading every page in
  // between.
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  // Exact server-side counts (records.count); null entries mean unavailable.
  counts: {},
  // Records opened by URL that are not on the loaded page (records.get).
  extra: {},
  snapshot: null,
  settings: null,
  provider: null,
  route: parseRoute(),
  edits: {},
  fieldEdits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-listing-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-listing.sidebarCollapsed";
const FEATURED_DEMO_DRAFT = "d-lunchbox-amazon-us";

const byId = (id) => document.getElementById(id);
export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  viewSelects: byId("viewSelects"),
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
  failedCount: byId("count-failed"),
  exportCount: byId("count-export"),
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
// `#/<view>[/<record>][?q=…&status=…&rule=…&tab=…&peek=…]`. Search, filters,
// the claims tab and the peeked record live in the URL so refresh, shared
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
    status: REVIEW_STATES.includes(status) ? status : "all",
    tab: params.get("tab") === "rules" ? "rules" : "claims",
    filters: Object.fromEntries(CHECK_FILTERS.map((key) => [key, params.get(key) || "all"])),
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "review" && route.status !== "all") params.set("status", route.status);
  if (route.view === "claims" && route.tab === "rules") params.set("tab", "rules");
  if (route.view === "checks") {
    for (const key of CHECK_FILTERS) if (route.filters?.[key] && route.filters[key] !== "all") params.set(key, route.filters[key]);
  }
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const blankRoute = (view, extra = {}) => ({
  view,
  query: "",
  status: "all",
  tab: "claims",
  filters: Object.fromEntries(CHECK_FILTERS.map((key) => [key, "all"])),
  ...extra,
});

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view, extra = {}) => {
  const route = view === state.route.view ? state.route : blankRoute(view, extra);
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view, extra = {}) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view, extra);
  const route = view === state.route.view && !Object.keys(extra).length ? state.route : blankRoute(view, extra);
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

export function routeWith(changes) {
  return `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, ...changes })}`;
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
  window.dispatchEvent(new CustomEvent("busa-listing:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "products"
      ? "#/products"
      : scenario === "drafts"
        ? "#/drafts"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "claims"
            ? "#/claims"
            : scenario === "review"
              ? "#/review"
              : scenario === "detail"
                ? `#/drafts/${FEATURED_DEMO_DRAFT}`
                : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
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

export function products() {
  return state.snapshot?.products || [];
}

export function drafts() {
  return state.snapshot?.drafts || [];
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

// The Base a view reads its records from (review is a lens over drafts).
export function baseKeyFor(view, tab = state.route.tab) {
  if (view === "review") return "drafts";
  if (view === "claims") return tab === "rules" ? "claim-rules" : "claims";
  return view;
}

const ID_FIELD = {
  products: "product_id",
  drafts: "draft_id",
  checks: "check_id",
  claims: "claim_id",
  "claim-rules": "rule_id",
};

function loadedRows(key) {
  if (key === "claims") return claimsRegistry().claims || [];
  if (key === "claim-rules") return claimsRegistry().rules || [];
  return state.snapshot?.[key] || [];
}

const extraMap = (key) => {
  if (!state.extra[key]) state.extra[key] = new Map();
  return state.extra[key];
};

// Loaded page first, then a record fetched on its own for the URL.
export function recordById(view, id, tab = state.route.tab) {
  if (!id) return null;
  const key = baseKeyFor(view, tab);
  return loadedRows(key).find((item) => item[ID_FIELD[key]] === id) || state.extra[key]?.get(id) || null;
}

export function productById(productId) {
  return recordById("products", productId);
}

export function draftById(draftId) {
  return recordById("drafts", draftId);
}

export function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

export function reviewForDraft(draftId) {
  const item = reviewItems().find((entry) => entry.draft_id === draftId);
  if (item) return item;
  const draft = draftById(draftId);
  return draft ? draftToReviewItem(draft) : null;
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

// A record named by the URL but not on the loaded page is read on its own
// (records.get by its business id) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.snapshot || !selectedId || !RECORD_VIEWS.includes(view)) return;
  const key = baseKeyFor(view);
  if (recordById(view, selectedId) || extraMap(key).has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    extraMap(key).set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  extraMap(key).set(selectedId, undefined);
  try {
    extraMap(key).set(selectedId, (await provider.getRecord(key, selectedId)) || null);
  } catch {
    extraMap(key).set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

export function isPendingRecord(view, id) {
  const map = state.extra[baseKeyFor(view)];
  return Boolean(map?.has(id) && map.get(id) === undefined);
}

// ── Counts ─────────────────────────────────────────────────────────────────
// True while a Base holds only part of its rows — more pages exist, or the user
// is on a later page. Anything tallied from loaded rows must say so.
export function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

// An exact server count when the provider has one (records.count), otherwise
// the loaded rows — marked with "+" when more rows exist than are loaded.
export function countOf(countKey, baseKey, loadedValue) {
  const exact = state.counts?.[countKey];
  if (exact != null) return exact;
  return `${loadedValue}${isPartial(baseKey) ? "+" : ""}`;
}

export function attentionCounts() {
  return {
    review: countOf(
      "drafts_needs_review",
      "drafts",
      reviewItems().filter((item) => item.status === "needs_review").length,
    ),
    failed: countOf("checks_fail", "checks", checks().filter((item) => item.result === "fail").length),
    approved: countOf("drafts_approved", "drafts", drafts().filter((item) => item.status === "approved").length),
  };
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const counts = attentionCounts();
  // Brand, or where the data comes from — the counts sit in the attention block.
  els.syncStatus.textContent = !snapshot
    ? t("loading")
    : `${snapshot.seller?.brand || ""}`.trim() || (state.settings?.demo ? t("demoData") : t("liveData"));
  if (els.reviewCount) els.reviewCount.textContent = counts.review;
  if (els.failedCount) els.failedCount.textContent = counts.failed;
  if (els.exportCount) els.exportCount.textContent = counts.approved;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !snapshot
      ? t("loading")
      : Number.parseInt(counts.review, 10)
        ? `${counts.review} ${t("awaitingReview")}`
        : `${countOf("drafts_total", "drafts", drafts().length)} ${t("draftsLower")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view && Boolean(link.closest("nav")));
  });
}

export function viewLabel(view) {
  if (view === "products") return t("products");
  if (view === "drafts") return t("drafts");
  if (view === "checks") return t("checks");
  if (view === "claims") return t("claims");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function claimStatusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status, "claim"))}</span>`;
}

// Links a claims_registry check back to the offending rule / claim in the
// Claims view (opens it in the Claims drawer). A ref that is not on the loaded
// page says so instead of printing its id.
export function claimRefLinks(refs) {
  if (!refs) return "";
  const registry = claimsRegistry();
  const parts = [];
  for (const ruleId of refs.rules || []) {
    const rule = (registry.rules || []).find((entry) => entry.rule_id === ruleId);
    parts.push(
      `<a class="tag" href="${recordUrl(ruleId, "claims", { tab: "rules" })}" title="${escapeHtml(rule?.reason || "")}">${escapeHtml(rule?.phrase || t("notLoaded"))}</a>`,
    );
  }
  for (const claimId of refs.claims || []) {
    const claim = (registry.claims || []).find((entry) => entry.claim_id === claimId);
    parts.push(`<a class="tag" href="${recordUrl(claimId, "claims")}">${escapeHtml(claim?.text || t("notLoaded"))}</a>`);
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

export function warnings(draftId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !draftId || !item.draft_id || item.draft_id === draftId,
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

// A draft's product is a relation (product id). Resolve it to the product's
// name; when the product is not on the loaded page, say so — never the id.
export function productName(productId) {
  if (!productId) return "";
  return productById(productId)?.name || t("notLoaded");
}

export function draftLabel(draft) {
  return `${productName(draft.product_id)} · ${enumLabel(draft.platform, "platform")} ${draft.locale || ""}`.trim();
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function filteredProducts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return products();
  return products().filter((item) =>
    matches([item.name, item.sku, item.category, item.source, ...(item.keywords || []), ...(item.platforms || [])], query),
  );
}

export function filteredDrafts() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return drafts();
  return drafts().filter((item) =>
    matches(
      [
        item.fields?.title,
        item.platform,
        item.locale,
        item.status,
        productById(item.product_id)?.name,
        productById(item.product_id)?.sku,
      ],
      query,
    ),
  );
}

export function filteredChecks() {
  const query = state.route.query.trim().toLowerCase();
  const { rule, platform, product, result } = state.route.filters;
  return checks().filter((item) => {
    if (rule !== "all" && item.rule_id !== rule) return false;
    const draft = draftById(item.draft_id);
    if (platform !== "all" && draft?.platform !== platform) return false;
    if (product !== "all" && draft?.product_id !== product) return false;
    if (result !== "all" && item.result !== result) return false;
    if (!query) return true;
    return matches([ruleById(item.rule_id)?.name, item.evidence, item.result, draft ? draftLabel(draft) : ""], query);
  });
}

export function filteredReviewItems() {
  const query = state.route.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    if (state.route.status !== "all" && item.status !== state.route.status) return false;
    if (!query) return true;
    const draft = draftById(item.draft_id);
    return matches([draft ? draftLabel(draft) : "", item.compliance_summary, item.status, draft?.fields?.title], query);
  });
}

export function filteredClaims() {
  const query = state.route.query.trim().toLowerCase();
  const registry = claimsRegistry();
  if (state.route.tab === "rules") {
    return (registry.rules || []).filter((rule) => !query || matches([rule.phrase, rule.reason, rule.alternative], query));
  }
  return (registry.claims || []).filter(
    (claim) => !query || matches([claim.text, claim.substantiation, claim.category], query),
  );
}

export function render() {
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
  products: "snapshot.products",
  drafts: "snapshot.drafts",
  checks: "snapshot.checks",
  claims: "settings.claims.claims",
  "claim-rules": "settings.claims.rules",
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
  const path = PAGE_BINDINGS[key];
  if (!cursors || !path) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    // The provider runs the same per-row normalizer it ran on page 1.
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    replacePageRows(path, rows);
    if (key === "drafts" && state.snapshot) state.snapshot.review_items = rows.map(draftToReviewItem);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// Prev / Next only. The page total comes from records.count when known.
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
    ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>`}
    <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
  </nav>`;
}

// ── Events ─────────────────────────────────────────────────────────────────
function onPagerClick(event) {
  const pager = event.target.closest("[data-goto-page]");
  if (!pager) return false;
  const [key, page] = pager.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
  return true;
}

els.listPanel.addEventListener("click", (event) => {
  if (onPagerClick(event)) return;
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
  const segment = event.target.closest("[data-status], [data-tab]");
  if (!segment) return;
  if (segment.dataset.tab) {
    // A peeked claim belongs to one tab; switching tabs closes it.
    replaceRoute(`#/claims${routeQuery({}, { ...state.route, tab: segment.dataset.tab })}`);
    return;
  }
  replaceRoute(routeWith({ status: segment.dataset.status }));
});
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(routeWith({ status: event.target.value }));
});
els.viewSelects.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-filter]");
  if (!select) return;
  replaceRoute(routeWith({ filters: { ...state.route.filters, [select.dataset.filter]: select.value } }));
});
els.detailBack.addEventListener("click", closeDetail);
bindDetailEvents();
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
  replaceRoute(routeWith({ query: els.search.value }));
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-listing-language", state.lang);
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
