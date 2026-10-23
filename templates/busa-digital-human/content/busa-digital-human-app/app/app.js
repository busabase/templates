import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { appConfig } from "./js/config.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { renderRecordView, renderSettings, renderStudio } from "./js/studio-views.js";
const messages = {
  en: {
    attention: "Need attention",
    humanWorkTitle: "What needs your attention",
    needReview: "checks need review",
    changesOpen: "sent back",
    blockedOpen: "blocked",
    overview: "Overview",
    review: "Review Queue",
    studio: "Studio",
    vendors: "Vendors",
    settings: "Help & Settings",
    all: "All",
    needsReview: "Needs Review",
    approved: "Approved",
    changesRequested: "Changes Requested",
    blocked: "Blocked",
    language: "Language",
    refresh: "Refresh",
    generated: "Generated",
    readiness: "Readiness",
    currentPath: "Recommended path",
    latency: "Latency",
    lipSync: "Lip sync",
    stability: "Stream stability",
    qa: "QA",
    verdict: "Verdict",
    fastPath: "2D fast launch",
    customPath: "3D custom build",
    pipeline: "Pipeline",
    reviewTitle: "QA review queue",
    reviewSubtitle: "Approve, request changes, or block each launch gate before real provider upload.",
    evidence: "Evidence",
    owner: "Owner",
    note: "Review note",
    notePlaceholder: "What should the agent change or watch?",
    approve: "Approve",
    requestChanges: "Request changes",
    block: "Block",
    decision: "Decision",
    studioTitle: "Multimodal stream studio",
    studioSubtitle: "Local simulation of voice/text input, lip motion, subtitles, route latency, and stream events.",
    providerMode: "Provider mode",
    persona: "Persona",
    inputMode: "Input mode",
    script: "Demo script",
    start: "Start stream",
    pause: "Pause",
    reset: "Reset",
    routeLatency: "Route latency",
    streamEvents: "Stream events",
    vendorsTitle: "Vendor and architecture routes",
    vendorsSubtitle: "Compare fast 2D service adapters against the UE/Unity custom path.",
    path: "Path",
    integration: "Integration",
    speed: "Speed",
    control: "Control",
    cost: "Cost",
    risks: "Risks",
    architecture: "Reference architecture",
    localFilesOnly:
      "Reads and writes go straight to Busabase. No vendor upload, no camera, no microphone, and no other external side effect.",
    configuration: "Configuration",
    dataProvider: "Data provider",
    handoffFiles: "Busabase resources",
    safety: "Safety boundary",
    demoNotice: "Demo mode: this is a read-only tour, nothing was saved.",
    saved: "Saved.",
    savedForReview:
      "Sent for review. You don't have write access here, so this waits until someone who does approves it.",
    search: "Search",
    empty: "No matching items.",
    loading: "Loading",
    demoData: "Demo data",
    liveData: "Busabase data",
    backToList: "Back to list",
    openFullPage: "Open full page",
    selectCheck: "Pick a check from the queue to read its evidence and record a verdict.",
    notFound: "This item is not in the list.",
    vendorRoute: "Vendor / route",
    matchingPipeline: "Matching pipeline",
    stages: "Stages",
    readinessCaption: "QA baseline {passed}/{total} passed",
    decisionFailed: "Decision failed",
    projectContext: "{path} · {name}",
  },
  zh: {
    attention: "需要关注",
    humanWorkTitle: "需要你处理的事项",
    needReview: "项待审",
    changesOpen: "项已打回",
    blockedOpen: "项已阻止",
    overview: "总览",
    review: "审核队列",
    studio: "Studio",
    vendors: "服务商",
    settings: "帮助与设置",
    all: "全部",
    needsReview: "待审核",
    approved: "已批准",
    changesRequested: "已要求返修",
    blocked: "已阻止",
    language: "语言",
    refresh: "刷新",
    generated: "生成于",
    readiness: "就绪度",
    currentPath: "推荐路径",
    latency: "延迟",
    lipSync: "唇形",
    stability: "流稳定",
    qa: "QA",
    verdict: "结论",
    fastPath: "2D 快上线",
    customPath: "3D 定制",
    pipeline: "链路",
    reviewTitle: "QA 审核队列",
    reviewSubtitle: "真实上传服务商之前，逐项批准、要求返修或阻止上线门。",
    evidence: "证据",
    owner: "负责人",
    note: "审核备注",
    notePlaceholder: "希望 agent 修改或注意什么？",
    approve: "通过",
    requestChanges: "返修",
    block: "阻止",
    decision: "决策",
    studioTitle: "多模态推流 Studio",
    studioSubtitle: "本地模拟语音/文本输入、口型、字幕、链路延迟和流事件。",
    providerMode: "服务模式",
    persona: "数字人",
    inputMode: "输入",
    script: "演示脚本",
    start: "开始推流",
    pause: "暂停",
    reset: "重置",
    routeLatency: "链路延迟",
    streamEvents: "流事件",
    vendorsTitle: "服务商与架构路径",
    vendorsSubtitle: "对比快速 2D 服务接入和 UE/Unity 3D 定制路径。",
    path: "路径",
    integration: "接入方式",
    speed: "速度",
    control: "控制权",
    cost: "成本",
    risks: "风险",
    architecture: "参考架构",
    localFilesOnly: "读写直接通过 Busabase 完成。不上传服务商，不调用摄像头/麦克风，无其他外部副作用。",
    configuration: "配置",
    dataProvider: "数据源",
    handoffFiles: "Busabase 资源",
    safety: "安全边界",
    demoNotice: "Demo 模式：这是只读演示，没有保存任何内容。",
    saved: "已保存。",
    savedForReview: "已提交审核。你在这里没有写权限，需要有写权限的人批准后才会生效。",
    search: "搜索",
    empty: "没有匹配项。",
    loading: "加载中",
    demoData: "演示数据",
    liveData: "Busabase 数据",
    backToList: "返回列表",
    openFullPage: "打开完整页面",
    selectCheck: "从队列中选择一项检查，查看证据并给出结论。",
    notFound: "列表中没有这一项。",
    vendorRoute: "服务商 / 路径",
    matchingPipeline: "对应链路",
    stages: "环节",
    readinessCaption: "QA 基线 {passed}/{total} 项通过",
    decisionFailed: "保存结论失败",
    projectContext: "{path} · {name}",
  },
};

// Detail mode per view, declared in config.js `ui.detail_modes`:
//   qa      → split: the review queue is worked top to bottom, one check after the next.
//   vendors → drawer: a vendor is a fact people compare against the others and return to the list.
// A `/<id>` path always opens the full page; `?peek=<id>` drives drawer/split.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const TOOL_VIEWS = ["studio", "settings"];
export const QA_STATES = ["all", "needs_review", "approved", "changes_requested", "blocked"];

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  edits: {},
  notice: "",
  busy: false,
  lang: new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en",
  demo: new URLSearchParams(location.search).has("demo"),
};

export const streamStore = {
  running: true,
  audioLevel: 0.24,
  waveContext: null,
  currentPersona: "kelly-host-cn",
  currentProvider: "fast-2d-stream",
};
let animationId = 0;

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-digital-human.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

const byId = (id) => document.getElementById(id);

export const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  statusSelect: byId("statusSelect"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  studioPage: byId("studioPage"),
  studioTitle: byId("studioTitle"),
  studioBody: byId("studioBody"),
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
  reviewCount: byId("count-review"),
  changesCount: byId("count-changes"),
  blockedCount: byId("count-blocked"),
  navCountQa: byId("navCountQa"),
  navCountVendors: byId("navCountVendors"),
  language: byId("language"),
};

export function t(key, vars) {
  const text = messages[state.lang]?.[key] || messages.en[key] || key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : text;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the QA status filter
// and the peeked record live in the URL so refresh, shared links and Back
// restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (view === "review") view = "qa";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && !TOOL_VIEWS.includes(view)) view = "overview";
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
    status: view === "qa" && QA_STATES.includes(status) ? status : "all",
  };
}

export const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "qa" && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => `#/${view}/${encodeURIComponent(id)}${routeQuery({})}`;
// What a row opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id })}`;

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
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// clicks should not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
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

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.settings = data;
  state.snapshot = data.snapshot;
  window.dispatchEvent(new CustomEvent("busa-digital-human:state", { detail: data }));
  render();
  startAnimation();
}

function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) els.language.value = state.lang;
  byId("overviewTitle").textContent = t("overview");
  els.settingsTitle.textContent = t("settings");
  els.studioTitle.textContent = t("studioTitle");
  // The description lives in the title's tooltip, not as a second line.
  els.studioTitle.title = t("studioSubtitle");
  els.detailBack.textContent = t("backToList");
  els.detailExpand.textContent = t("openFullPage");
}

export function decisionFor(id) {
  return state.settings?.decisions?.[id] || null;
}

export function effectiveStatus(check) {
  const decision = decisionFor(check.id);
  if (decision?.action && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  if (check.status === "pass") return "approved";
  if (check.status === "block") return "blocked";
  return "needs_review";
}

// Badge tone from the shared `.badge` vocabulary (one `--dot` per status).
export function statusTone(status) {
  if (status === "approved" || status === "pass" || status === "SHIP" || status === "ready_for_demo") return "positive";
  if (status === "blocked" || status === "block" || status === "BLOCK") return "danger";
  return "warning";
}

export function statusLabel(status) {
  if (status === "needs_review") return t("needsReview");
  if (status === "changes_requested") return t("changesRequested");
  if (status === "approved") return t("approved");
  if (status === "blocked") return t("blocked");
  if (status === "all") return t("all");
  return String(status || "").replaceAll("_", " ");
}

// A stored decision action (`request_changes`) shown as the words a reviewer uses.
export function actionLabel(action) {
  if (action === "approve") return t("approve");
  if (action === "request_changes") return t("requestChanges");
  if (action === "block") return t("block");
  return "-";
}

export function statusBadge(status) {
  return `<span class="badge ${statusTone(status)}">${esc(statusLabel(status))}</span>`;
}

export function pathLabel(path) {
  if (path === "2d_fast") return state.lang === "zh" ? "2D 快上线" : "2D fast";
  if (path === "3d_custom") return state.lang === "zh" ? "3D 定制" : "3D custom";
  return "Hybrid";
}

export function pathBadge(path) {
  return `<span class="badge path-badge ${path === "3d_custom" ? "custom" : "fast"}">${esc(pathLabel(path))}</span>`;
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function checks() {
  return state.snapshot?.qa_checks || [];
}

export function vendors() {
  return state.snapshot?.vendors || [];
}

const matches = (values, query) => values.some((value) => String(value || "").toLowerCase().includes(query));

export function filteredChecks() {
  const query = state.route.query.trim().toLowerCase();
  return checks().filter((check) => {
    const status = effectiveStatus(check);
    if (state.route.status !== "all" && status !== state.route.status) return false;
    return !query || matches([check.label, check.owner, check.evidence, statusLabel(status)], query);
  });
}

export function filteredVendors() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return vendors();
  return vendors().filter((vendor) =>
    matches([vendor.label, pathLabel(vendor.path), vendor.integration, vendor.cost, vendor.risk], query),
  );
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const counts = { needs_review: 0, changes_requested: 0, blocked: 0 };
  for (const check of checks()) {
    const status = effectiveStatus(check);
    if (status in counts) counts[status] += 1;
  }
  // Where the data comes from; the counts already sit in the attention block.
  els.syncStatus.textContent = !snapshot ? t("loading") : state.demo ? t("demoData") : t("liveData");
  els.reviewCount.textContent = counts.needs_review;
  els.changesCount.textContent = counts.changes_requested;
  els.blockedCount.textContent = counts.blocked;
  els.navCountQa.textContent = snapshot ? checks().length : "";
  els.navCountVendors.textContent = snapshot ? vendors().length : "";
  els.mobileViewTitle.textContent = viewLabel(state.route.view);
  els.mobileViewMeta.textContent = `${counts.needs_review} ${t("needReview")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "qa") return t("review");
  if (view === "studio") return t("studio");
  if (view === "vendors") return t("vendors");
  if (view === "settings") return t("settings");
  return t("overview");
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
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query || state.route.status !== "all"));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.studioPage.hidden = !ready || view !== "studio";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (view !== "studio") streamStore.waveContext = null;
  if (onRecordView) renderRecordView();
  else if (view === "studio") renderStudio();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

export function noticeBanner() {
  return state.notice ? `<div class="notice-banner">${esc(state.notice)}</div>` : "";
}

export function isBusy() {
  return Boolean(state.busy);
}

// ── Overview ───────────────────────────────────────────────────────────────
// The only page with the hero and the metrics band. Three numbers, none of
// them shown anywhere else: the review counts sit in the sidebar, readiness
// and the QA baseline in the readiness card below.
function renderOverview() {
  const snapshot = state.snapshot;
  const project = snapshot.project;
  const pipelines = snapshot.pipelines || [];
  const fast = pipelines.find((item) => item.path === "2d_fast");
  const custom = pipelines.find((item) => item.path === "3d_custom");
  const primary = fast || custom || pipelines[0] || null;
  const metrics = snapshot.metrics;
  els.overviewSummary.textContent = project.launch_goal;
  els.overviewMetrics.innerHTML = [
    [t("latency"), `${metrics.current_latency_ms} / ${metrics.target_latency_ms} ms`],
    [t("lipSync"), `${metrics.lip_sync_score}%`],
    [t("stability"), `${metrics.stream_stability}%`],
  ]
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join("");
  const score = Math.max(0, Math.min(100, Number(project.readiness_score) || 0));
  els.overviewBody.innerHTML = `
    ${noticeBanner()}
    <section class="card readiness-card">
      <div>
        <div class="readiness-label">${t("currentPath")}</div>
        <h2>${esc(t("projectContext", { path: pathLabel(project.recommended_path), name: project.name }))}</h2>
        <p class="readiness-line">
          ${statusBadge(project.verdict === "SHIP" ? "approved" : project.verdict === "BLOCK" ? "blocked" : "needs_review")}
          <a class="quiet-link" href="#/qa">${esc(t("readinessCaption", { passed: metrics.qa_passed, total: metrics.qa_total }))} →</a>
        </p>
      </div>
      <div class="score-ring" style="--score:${score}%">
        <div><strong>${score}</strong><span>${t("readiness")}</span></div>
      </div>
    </section>
    <section class="path-grid">
      ${fast ? pathPanel(t("fastPath"), fast, "Ship a polished web demo in days through an existing 2D digital-human service.") : ""}
      ${custom ? pathPanel(t("customPath"), custom, "Build a reusable brand character with owned motion and engine-rendered scenes.") : ""}
    </section>
    <section class="card">
      <div class="section-head">
        <div><h2>${t("pipeline")}</h2><p class="muted">${esc(primary?.provider || "")}</p></div>
        <a class="quiet-link" href="#/studio">${t("studio")} →</a>
      </div>
      <div class="pipeline">
        ${(primary?.stages || []).map((stage, index) => `<div class="stage"><strong>${index + 1}. ${esc(stage)}</strong><span>${pipelineCaption(stage)}</span></div>`).join("")}
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <h2>${t("architecture")}</h2>
        <a class="quiet-link" href="#/vendors">${t("vendors")} →</a>
      </div>
      <div class="architecture">
        ${ARCHITECTURE.map(
          ([label, copy], index) => `<div class="arch-node">
            <span class="node-index">${index + 1}</span>
            <div><strong>${esc(label)}</strong><p class="muted">${esc(copy)}</p></div>
          </div>`,
        ).join("")}
      </div>
    </section>
  `;
}

const ARCHITECTURE = [
  ["Input stream", "Text, TTS audio, uploaded audio, or live voice after approval."],
  ["Reasoning or script", "LLM answer, support macro, product script, or human-approved copy."],
  ["TTS / voice", "Vendor voice, cloned voice with consent, or existing audio stream."],
  ["Avatar renderer", "2D service for speed; UE/Unity for custom brand character."],
  ["RTC / web player", "Embed as live stream, clip, WebRTC track, or controlled demo player."],
  ["QA and fallback", "Block unsafe claims, missing consent, stream failure, and bad lip sync."],
];

function pathPanel(title, pipeline, copy) {
  return `<article class="card path-panel">
    <div class="path-head">
      <h2>${esc(title)}</h2>
      ${pathBadge(pipeline.path)}
    </div>
    <p>${esc(copy)}</p>
    <dl>
      <dt>${t("latency")}</dt><dd>${pipeline.latency_ms}ms</dd>
      <dt>${t("integration")}</dt><dd>${esc(pipeline.output)}</dd>
      <dt>${t("providerMode")}</dt><dd>${esc(pipeline.label)}</dd>
    </dl>
  </article>`;
}

function pipelineCaption(stage) {
  const captions = {
    text: "script / LLM / support macro",
    tts: "voice model or vendor voice",
    "vendor avatar": "2D face and lip renderer",
    "RTC/video stream": "WebRTC, RTC, HLS, or clip",
    "web player": "customer-facing demo UI",
  };
  return captions[stage] || "handoff stage";
}

export async function submitDecision(checkId, action, card) {
  const note = card.querySelector('[data-field="note"]')?.value || "";
  if (state.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.saveDecision(checkId, action, note);
    delete state.edits[checkId];
    // Without write access the decision is a ChangeRequest, and the check keeps
    // its old verdict until someone who has it approves: say that, not "Saved".
    state.notice = result?.pending ? t("savedForReview") : t("saved");
    await loadState();
  } catch (error) {
    state.notice = `${t("decisionFailed")}: ${error?.message || error}`;
    render();
  } finally {
    state.busy = false;
  }
}

function startAnimation() {
  if (animationId) cancelAnimationFrame(animationId);
  const tick = (time) => {
    if (streamStore.running) {
      streamStore.audioLevel = 0.18 + Math.abs(Math.sin(time / 128)) * 0.46 + Math.abs(Math.sin(time / 47)) * 0.18;
    } else {
      streamStore.audioLevel *= 0.92;
    }
    updateMouth();
    drawWave(time);
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

export function updateMouth() {
  const avatar = document.querySelector("#dhAvatar");
  if (avatar) avatar.style.setProperty("--mouth-open", String(Math.max(0.08, Math.min(1, streamStore.audioLevel))));
}

function drawWave(time) {
  if (!streamStore.waveContext) return;
  const canvas = streamStore.waveContext.canvas;
  const width = canvas.width;
  const height = canvas.height;
  streamStore.waveContext.clearRect(0, 0, width, height);
  streamStore.waveContext.fillStyle = "rgba(255,255,255,0.06)";
  streamStore.waveContext.fillRect(0, 0, width, height);
  streamStore.waveContext.lineWidth = 3;
  streamStore.waveContext.strokeStyle = "rgba(45, 212, 191, 0.95)";
  streamStore.waveContext.beginPath();
  for (let x = 0; x < width; x += 4) {
    const y =
      height / 2 +
      Math.sin((x + time / 4) / 25) * 18 * streamStore.audioLevel +
      Math.sin((x + time / 2) / 9) * 8 * streamStore.audioLevel;
    if (x === 0) streamStore.waveContext.moveTo(x, y);
    else streamStore.waveContext.lineTo(x, y);
  }
  streamStore.waveContext.stroke();
}

// ── Events ─────────────────────────────────────────────────────────────────
// Delegated on containers that are never re-rendered, so a re-render never
// leaves a control without its listener.
els.listPanel.addEventListener("click", (event) => {
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
els.listPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest("tr[data-id]");
  if (row) row.click();
});
els.viewFilters.addEventListener("click", (event) => {
  const segment = event.target.closest("[data-status]");
  if (!segment) return;
  replaceRoute(`#/qa${routeQuery({ peek: state.route.peek }, { ...state.route, status: segment.dataset.status })}`);
});
els.statusSelect.addEventListener("change", (event) => {
  replaceRoute(`#/qa${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
});
els.detailBody.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  const card = field?.closest("[data-check]");
  if (card) state.edits[card.dataset.check] = { ...state.edits[card.dataset.check], [field.dataset.field]: field.value };
});
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-check]");
  submitDecision(card.dataset.check, button.dataset.action, card);
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
els.studioBody.addEventListener("change", (event) => {
  const control = event.target.closest("[data-control]");
  if (control?.dataset.control === "persona") streamStore.currentPersona = control.value;
  else if (control?.dataset.control === "provider") streamStore.currentProvider = control.value;
  else return;
  renderStudio();
});
els.studioBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stream-action]");
  if (!button) return;
  if (button.dataset.streamAction === "reset") streamStore.audioLevel = 0.24;
  streamStore.running = button.dataset.streamAction === "reset" ? true : !streamStore.running;
  renderStudio();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.language.addEventListener("change", () => {
  state.lang = els.language.value;
  const url = new URL(location.href);
  url.searchParams.set("lang", state.lang);
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  render();
});

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();

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

boot();
