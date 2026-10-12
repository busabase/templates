import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeCheckFromRow } from "./js/finance-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view (declared once in config.js `ui.detail_modes`):
//   checks → split: the check queue is worked top to bottom — read the
//            evidence, leave a note, decide, next — so the queue stays beside
//            the record. `?peek=<id>` selects; `/<id>` is the full page.
// The model and settings Bases have no record list: the current model IS the
// Overview + Workbook pages, and settings is one sanitized row.
// On a phone every mode is a page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const PAGES = ["overview", ...RECORD_VIEWS, "workbook", "settings"];
// `open` = everything still waiting on a human (the sidebar's attention number).
const STATUS_FILTERS = ["all", "open", "needs_review", "changes_requested", "approved", "done", "blocked"];
const OPEN_STATUSES = new Set(["needs_review", "changes_requested"]);

const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-finance-language") || "auto",
  ),
  pagination: {},
  totalCount: {},
  loadingMore: false,
  loadMoreError: false,
  notice: "",
  submitting: false,
  // Checks opened by URL that are not on the loaded page (records.get).
  extra: new Map(),
};

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  checksPage: byId("checksPage"),
  workbookPage: byId("workbookPage"),
  settingsPage: byId("settingsPage"),
  overviewTitle: byId("overviewTitle"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  checksTitle: byId("checksTitle"),
  checksCount: byId("checksCount"),
  statusSelect: byId("statusSelect"),
  search: byId("search"),
  notice: byId("notice"),
  listPanel: byId("listPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  workbookTitle: byId("workbookTitle"),
  workbookPath: byId("workbookPath"),
  workbookList: byId("workbookList"),
  settingsTitle: byId("settingsTitle"),
  settingsBody: byId("settingsBody"),
  syncStatus: byId("syncStatus"),
  attentionMain: byId("attentionMain"),
  attentionMeta: byId("attentionMeta"),
  navChecksCount: byId("navChecksCount"),
  language: byId("language"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileTitle: byId("mobileTitle"),
  mobileMeta: byId("mobileMeta"),
};

function normalizeLang(lang) {
  if (String(lang).toLowerCase().startsWith("zh")) return "zh";
  if (lang === "en") return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] ?? messages.en[key] ?? key;
}

// Stored option values (`needs_review`, `statement_tie`) never reach the
// screen raw: known values are translated, unknown ones are de-snaked.
function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]` — search, the status filter and
// the peeked check live in the URL so refresh, shared links and Back restore
// the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!PAGES.includes(view)) view = "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  if (!mode) id = "";
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: id || peek,
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: mode ? params.get("q") || "" : "",
    status: STATUS_FILTERS.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.status && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
const detailUrl = (id) => `#/checks/${encodeURIComponent(id)}${routeQuery()}`;
const peekUrl = (id, route = state.route) => `#/checks${routeQuery({ peek: id }, route)}`;
// From outside the queue (Overview) a check opens in the queue's own mode.
const checkUrl = (id) => peekUrl(id, { view: "checks", query: "", status: "all" });

let previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A record opened from its list steps Back/Close/Escape to that exact entry.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  setMobileSidebar(false);
  render();
  ensureSelectedCheck();
}

// Search keystrokes and filter changes replace the entry instead of each
// becoming a Back step.
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
function fmt(value) {
  const currency = state.data?.snapshot?.currency || "USD";
  try {
    return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Math.round(Number(value || 0)).toLocaleString()}`;
  }
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function dateTime(value) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function snapshot() {
  return state.data?.snapshot || { periods: [], checks: [], metrics: {}, warnings: [], workbook: { tabs: [] } };
}

function checks() {
  return snapshot().checks || [];
}

// Loaded page first, then a check fetched on its own for the URL.
function checkById(id) {
  if (!id) return null;
  return checks().find((item) => item.id === id) || state.extra.get(id) || null;
}

let fetchSerial = 0;
async function ensureSelectedCheck() {
  const id = state.route.selectedId;
  if (!state.data || !id || !RECORD_VIEWS.includes(state.route.view)) return;
  if (checks().some((item) => item.id === id) || state.extra.has(id)) return;
  const provider = await getProvider();
  if (typeof provider.getRecord !== "function") return;
  const serial = ++fetchSerial;
  state.extra.set(id, undefined);
  try {
    state.extra.set(id, (await provider.getRecord("checks", id)) || null);
  } catch {
    state.extra.set(id, null);
  }
  if (serial === fetchSerial) render();
}

// The real total when records.count answered, else the loaded rows marked
// partial while more pages exist.
function checksTotal() {
  const total = state.totalCount.checks;
  if (typeof total === "number") return String(total);
  return `${checks().length}${state.pagination.checks ? "+" : ""}`;
}

function filteredChecks() {
  const query = state.route.query.trim().toLowerCase();
  const status = state.route.status;
  return checks().filter((item) => {
    if (status === "open" && !OPEN_STATUSES.has(item.status)) return false;
    if (status !== "all" && status !== "open" && item.status !== status) return false;
    if (!query) return true;
    return [
      item.title,
      item.summary,
      item.proposed_action,
      enumLabel(item.status, "status"),
      enumLabel(item.check_type, "check_type"),
      ...(item.evidence || []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

const badge = (value, group, tone = "") =>
  value ? `<span class="badge ${tone}">${escapeHtml(enumLabel(value, group))}</span>` : "";
const STATUS_TONE = {
  needs_review: "warning",
  changes_requested: "warning",
  approved: "positive",
  done: "",
  blocked: "danger",
};
const statusBadge = (status) => badge(status, "status", STATUS_TONE[status] || "");
const severityBadge = (severity) =>
  badge(severity, "severity", severity === "critical" ? "danger" : severity === "warning" ? "warning" : "");

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState({ lang: activeLang() });
  closeConnectGate();
  state.data = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.loadMoreError = false;
  state.extra = new Map();
  window.dispatchEvent(new CustomEvent("busa-finance:state", { detail: data }));
  render();
  ensureSelectedCheck();
}

// One click, one page: appends the next page of checks, never loops.
async function loadMoreChecks() {
  const cursor = state.pagination.checks;
  if (!cursor || state.loadingMore) return;
  state.loadingMore = true;
  state.loadMoreError = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage("checks", cursor);
    const known = new Set(checks().map((item) => item.id));
    snapshot().checks.push(...page.rows.map(computeCheckFromRow).filter((item) => !known.has(item.id)));
    state.pagination.checks = page.nextCursor;
  } catch {
    state.loadMoreError = true;
  } finally {
    state.loadingMore = false;
    render();
  }
}

async function submitDecision(action) {
  const selected = checkById(state.route.selectedId);
  if (!selected || state.submitting) return;
  const provider = await getProvider();
  state.submitting = true;
  try {
    await provider.submitReview({
      id: selected.id,
      action,
      comment: byId("decisionComment")?.value || "",
      draft: byId("decisionDraft")?.value || "",
    });
    state.submitting = false;
    await loadState();
  } catch (error) {
    state.submitting = false;
    const message = error instanceof Error ? error.message : String(error);
    state.notice = state.data?.demo ? t("demo_read_only") : message;
    render();
  }
}

// ── Shell ──────────────────────────────────────────────────────────────────
function viewLabel(view) {
  return view === "overview" ? t("overview") : t(view);
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.language.value = state.lang;
  els.checksTitle.textContent = t("checks");
  els.checksTitle.parentElement.title = t("checks_hint");
  els.workbookTitle.textContent = t("workbook");
  els.workbookTitle.parentElement.title = t("workbook_hint");
  els.settingsTitle.textContent = t("settings");
  els.search.placeholder = t("search");
  els.search.setAttribute("aria-label", t("search"));
  els.statusSelect.setAttribute("aria-label", t("status"));
  els.detailExpand.textContent = t("open_full_page");
  els.mobileRefresh.setAttribute("aria-label", t("refresh"));
}

function setShell() {
  const metrics = snapshot().metrics || {};
  els.syncStatus.textContent = !state.data ? t("loading") : state.data.demo ? t("demo_notice") : t("ready");
  els.attentionMain.textContent = `${metrics.needs_review || 0} ${t("needs_review")}`;
  els.attentionMeta.textContent = `${metrics.approved || 0} ${t("approved")} · ${metrics.blocked || 0} ${t("blocked")}`;
  els.navChecksCount.textContent = state.data ? checksTotal() : "";
  els.mobileTitle.textContent = viewLabel(state.route.view);
  // The phone toolbar already shows the view's count; the bar carries the
  // number that needs a human instead.
  els.mobileMeta.textContent = `${metrics.needs_review || 0} ${t("needs_review")}`;
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === state.route.view);
  });
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the forecast table and the sidebar do not already show: each
// takes a computation across periods to know.
function metricsBand() {
  const snap = snapshot();
  const periods = snap.periods || [];
  const last = periods[periods.length - 1] || {};
  const margin = Number(last.revenue) > 0 ? Number(last.gross_profit || 0) / Number(last.revenue) : null;
  const cells = [
    [t("revenue_cagr"), periods.length ? pct(snap.metrics?.revenue_cagr) : "—"],
    [`${t("gross_margin")}${last.label ? ` · ${last.label}` : ""}`, margin === null ? "—" : pct(margin)],
    [t("balance_check"), periods.length ? fmt(snap.metrics?.balance_check) : "—"],
  ];
  return cells
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

const FORECAST_ROWS = ["revenue", "gross_profit", "ebitda", "net_income", "ending_cash", "free_cash_flow"];

function forecastTable(periods) {
  if (!periods.length) return `<p class="empty-inline">${escapeHtml(t("no_checks"))}</p>`;
  return `<div class="table-scroll"><table class="table forecast-table">
    <thead><tr><th>${escapeHtml(t("metric"))}</th>${periods.map((p) => `<th class="num">${escapeHtml(p.label)}</th>`).join("")}</tr></thead>
    <tbody>${FORECAST_ROWS.map(
      (key) =>
        `<tr><td>${escapeHtml(t(key))}</td>${periods.map((p) => `<td class="num">${escapeHtml(fmt(p[key]))}</td>`).join("")}</tr>`,
    ).join("")}</tbody>
  </table></div>`;
}

function renderOverview() {
  const snap = snapshot();
  els.overviewTitle.textContent = snap.company || appConfig.appName;
  els.overviewSummary.textContent = [
    snap.model_purpose,
    snap.currency,
    snap.generated_at ? `${t("generated")} ${dateTime(snap.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  els.overviewMetrics.innerHTML = metricsBand();
  const waiting = checks()
    .filter((item) => OPEN_STATUSES.has(item.status))
    .slice(0, 5);
  const warnings = (snap.warnings || []).filter(Boolean);
  els.overviewBody.innerHTML = `
    ${
      warnings.length
        ? `<div class="warnings card"><strong>${escapeHtml(t("warnings"))}</strong>${warnings
            .map((line) => `<span>${escapeHtml(typeof line === "string" ? line : line?.message || "")}</span>`)
            .join("")}</div>`
        : ""
    }
    <section class="card overview-panel">
      <div class="card-heading"><h2>${escapeHtml(t("forecast"))}</h2></div>
      ${forecastTable(snap.periods || [])}
    </section>
    <section class="card overview-panel">
      <div class="card-heading"><h2>${escapeHtml(t("needs_attention_list"))}</h2></div>
      ${
        waiting
          .map(
            (item) => `<a class="due-row" href="${checkUrl(item.id)}">
              <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary)}</small></span>
              <span class="due-meta">${severityBadge(item.severity)}${statusBadge(item.status)}</span>
            </a>`,
          )
          .join("") || `<p class="empty-inline">${escapeHtml(t("nothing_waiting"))}</p>`
      }
    </section>`;
}

// ── Checks (split) ─────────────────────────────────────────────────────────
function renderChecks() {
  const items = filteredChecks();
  const { selectedId, presentation } = state.route;
  els.checksCount.textContent = String(items.length);
  if (document.activeElement !== els.search) els.search.value = state.route.query;
  els.statusSelect.innerHTML = STATUS_FILTERS.map(
    (value) =>
      `<option value="${value}"${value === state.route.status ? " selected" : ""}>${escapeHtml(
        value === "all" ? t("all_statuses") : value === "open" ? t("needs_attention_list") : enumLabel(value, "status"),
      )}</option>`,
  ).join("");
  els.notice.hidden = !state.notice;
  els.notice.textContent = state.notice;

  const rows = items
    .map(
      (item) => `<tr data-id="${escapeHtml(item.id)}"${item.id === selectedId ? ' class="ws-selected"' : ""}>
        <td title="${escapeHtml([item.title, item.summary].filter(Boolean).join(" — "))}"><span class="strong">${escapeHtml(item.title)}</span></td>
        <td>${statusBadge(item.status)}</td>
        <td class="ws-col-narrow">${severityBadge(item.severity)}</td>
        <td>${escapeHtml(enumLabel(item.check_type, "check_type"))}</td>
        <td title="${escapeHtml(item.proposed_action)}">${escapeHtml(item.proposed_action)}</td>
      </tr>`,
    )
    .join("");
  const empty = !checks().length ? t("no_checks") : !items.length ? t("no_match") : "";
  els.listPanel.innerHTML = `<table class="ws-table checks-table">
      <thead><tr>
        <th>${escapeHtml(t("check"))}</th>
        <th class="checks-status">${escapeHtml(t("status"))}</th>
        <th class="ws-col-narrow">${escapeHtml(t("severity"))}</th>
        <th>${escapeHtml(t("check_type"))}</th>
        <th>${escapeHtml(t("proposed_action"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${empty ? `<div class="empty-state"><strong>${escapeHtml(empty)}</strong></div>` : ""}
    ${loadMoreControl()}`;

  const selected = checkById(selectedId);
  els.detailExpand.hidden = presentation === "page" || !selected;
  if (selected) els.detailExpand.href = detailUrl(selected.id);
  els.detailBack.textContent = presentation === "page" ? t("back_to_list") : t("close");
  els.detailBack.hidden = !selectedId;
  byId("detailBar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = `<div class="ws-detail-empty">${escapeHtml(t("pick_check"))}</div>`;
  } else if (!selected) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = `<div class="ws-detail-empty">${escapeHtml(pending ? t("loading") : t("not_loaded"))}</div>`;
  } else {
    // Keep a half-typed note when the same record re-renders (e.g. load more).
    const sameRecord = els.detailBody.firstElementChild?.dataset.check === selected.id;
    const comment = sameRecord ? byId("decisionComment")?.value : undefined;
    const draft = sameRecord ? byId("decisionDraft")?.value : undefined;
    els.detailBody.innerHTML = renderCheckDetail(selected);
    if (comment !== undefined) byId("decisionComment").value = comment;
    if (draft !== undefined) byId("decisionDraft").value = draft;
  }
}

function loadMoreControl() {
  if (!state.pagination.checks) return "";
  return `<div class="load-more"><button class="button" type="button" data-load-more ${state.loadingMore ? "disabled" : ""}>${escapeHtml(state.loadingMore ? t("loading") : t("load_more"))}</button>${state.loadMoreError ? `<span role="alert">${escapeHtml(t("load_more_failed"))}</span>` : ""}</div>`;
}

function renderCheckDetail(item) {
  const decision = item.decision
    ? `<div class="detail-row"><dt>${escapeHtml(t("decision"))}</dt><dd>${escapeHtml(enumLabel(item.decision.action, "action"))}${item.decision.decided_at ? ` · ${escapeHtml(dateTime(item.decision.decided_at))}` : ""}</dd></div>`
    : "";
  return `<article class="check-detail" data-check="${escapeHtml(item.id)}">
    <header class="detail-head">
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.summary)}</p>
      <div class="detail-badges">${statusBadge(item.status)}${severityBadge(item.severity)}</div>
    </header>
    <dl class="detail-grid">
      <div class="detail-row"><dt>${escapeHtml(t("check_type"))}</dt><dd>${escapeHtml(enumLabel(item.check_type, "check_type")) || "—"}</dd></div>
      <div class="detail-row"><dt>${escapeHtml(t("proposed_action"))}</dt><dd>${escapeHtml(item.proposed_action) || "—"}</dd></div>
      ${decision}
    </dl>
    ${
      (item.evidence || []).length
        ? `<h3>${escapeHtml(t("evidence"))}</h3><div class="evidence">${item.evidence.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`
        : ""
    }
    <label class="field">${escapeHtml(t("review_note"))}<textarea id="decisionComment" rows="4">${escapeHtml(item.decision?.comment || "")}</textarea></label>
    <label class="field">${escapeHtml(t("draft"))}<textarea id="decisionDraft" rows="5">${escapeHtml(item.draft || "")}</textarea></label>
    <div class="actions">
      ${["approve", "request_changes", "block", "dismiss"]
        .map(
          (action) =>
            `<button class="button${action === "approve" ? " primary" : ""}" type="button" data-action="${action}" ${state.submitting ? "disabled" : ""}>${escapeHtml(t(action))}</button>`,
        )
        .join("")}
    </div>
  </article>`;
}

// ── Workbook ───────────────────────────────────────────────────────────────
function renderWorkbook() {
  const workbook = snapshot().workbook || {};
  const tabs = workbook.tabs || [];
  const roles = t("tab_roles") || {};
  els.workbookPath.textContent = workbook.last_generated_path ? `${t("workbook_path")}: ${workbook.last_generated_path}` : "";
  els.workbookPath.title = workbook.last_generated_path || "";
  els.workbookList.innerHTML = tabs.length
    ? `<table class="ws-table workbook-table">
        <thead><tr><th>${escapeHtml(t("tab"))}</th><th>${escapeHtml(t("tab_role"))}</th></tr></thead>
        <tbody>${tabs
          .map(
            (tab) =>
              `<tr><td><span class="strong">${escapeHtml(tab)}</span></td><td title="${escapeHtml(roles[tab] || "")}">${escapeHtml(roles[tab] || "")}</td></tr>`,
          )
          .join("")}</tbody>
      </table>`
    : `<div class="empty-state"><strong>${escapeHtml(t("no_workbook"))}</strong></div>`;
}

// ── Settings ───────────────────────────────────────────────────────────────
function renderSettings() {
  const data = state.data || {};
  const summary = data.config_summary || {};
  const rows = [
    [t("settings_provider"), data.data_provider],
    [t("settings_source"), summary.config_source],
    [t("settings_company"), summary.company?.name],
    [t("settings_currency"), summary.company?.base_currency || snapshot().currency],
    [t("settings_onboarding"), data.onboarding?.completed ? t("complete") : t("incomplete")],
    [t("settings_secrets"), summary.secrets_required ? t("yes") : t("no")],
  ];
  els.settingsBody.innerHTML = `<section class="card settings-card">
      <dl class="detail-grid">${rows
        .map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`)
        .join("")}</dl>
    </section>
    <section class="card settings-card">
      <div class="card-heading"><h2>${escapeHtml(t("settings_raw"))}</h2></div>
      <pre>${escapeHtml(
        JSON.stringify(
          { data_provider: data.data_provider, onboarding: data.onboarding, lock: data.lock, config_summary: summary },
          null,
          2,
        ),
      )}</pre>
    </section>`;
}

function render() {
  applyI18n();
  setShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query || state.route.status !== "all"));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.checksPage.hidden = !onRecordView;
  els.workbookPage.hidden = !ready || view !== "workbook";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderChecks();
  else if (view === "workbook") renderWorkbook();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── Events ─────────────────────────────────────────────────────────────────
function setMobileSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  els.sidebarScrim.hidden = !open;
}

window.addEventListener("hashchange", setRoute);
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh.addEventListener("click", () => loadState());
els.language.addEventListener("change", () => {
  state.lang = els.language.value;
  localStorage.setItem("busa-finance-language", state.lang);
  loadState();
});
els.sidebarToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
els.mobileSidebarToggle.addEventListener("click", () => setMobileSidebar(true));
els.sidebarScrim.addEventListener("click", () => setMobileSidebar(false));
els.search.addEventListener("input", () => {
  replaceRoute(`#/checks${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.statusSelect.addEventListener("change", () => {
  replaceRoute(`#/checks${routeQuery({ peek: state.route.peek }, { ...state.route, status: els.statusSelect.value })}`);
});
els.listPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-load-more]")) {
    loadMoreChecks();
    return;
  }
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = peekUrl(row.dataset.id);
  // Switching checks while one is open replaces the entry, so Close still
  // steps back to the list the queue was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) submitDecision(button.dataset.action);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a note only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input, select")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
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

applyI18n();
boot();
