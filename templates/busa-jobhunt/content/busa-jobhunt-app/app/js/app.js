import { appConfig } from "./config.js?v=0.4.0";
import { closeConnectGate, connectGateStatus, passConnectGate, renderSetupRequired } from "./connect-gate.js?v=0.4.0";
import {
  assembleCompany,
  buildApprovalFields,
  buildProfileFields,
  confidenceLabel,
  createJobhuntDesk,
  evidenceAgeDays,
  evidenceLabel,
  missingProfileRequirements,
  normalizeCompany,
  normalizeLead,
  nextStep,
  statusLabel,
} from "./jobhunt-model.js?v=0.4.0";
import { getProvider } from "./providers/index.js?v=0.4.0";
import { airAppWriteMessage, detectAirAppRuntime, shouldUseLocalAirAppGateway } from "../vendor/busabase-airapp.js";

const root = document.querySelector("#app");

// Overview first: it is the default route and the only page with a hero and a
// metrics band. The three outreach views are record views over the Companies
// Base; "我的资料" is the one-record profile form.
const viewMeta = {
  overview: { label: "概览", kind: "overview" },
  "to-send": {
    label: "待发送",
    noun: "家待发",
    kind: "records",
    hint: "还没批准的信，按证据强弱、再按匹配度排序。逐封看、改一句、批准。",
  },
  sent: { label: "已发送", noun: "家已发", kind: "records", hint: "已批准（排队等脚本发出）和已经发出的公司。" },
  all: { label: "全部", noun: "家公司", kind: "records", hint: "所有目标公司，按证据强弱、再按匹配度排序。" },
  profile: { label: "我的资料", kind: "profile" },
};
const RECORD_VIEWS = Object.keys(viewMeta).filter((key) => viewMeta[key].kind === "records");
const DETAIL_MODES = appConfig.ui.detail_modes;

let currentState;
let desk;
// Loaded rows of every Base; "加载更多" appends one page of one Base at a time.
let loadedRecords = [];
let pageInfo = {};
let extraPagesLoaded = false;
let route = { view: "overview", id: null, peek: null, query: "" };
let lastContentHash = "#/overview";
let previousRouteWasList = false;
let sidebarCollapsed = false;
let helpTab = "commands";
let authStatus = null;
let onboardingDismissed = false;
let loadingMore = false;
let hasRendered = false;
// Unsaved edits survive re-renders and the refresh timer, keyed by company id.
const draftEdits = new Map();
let profileEdited = false;
// A company named by the URL but not on a loaded page (records.get), and the
// addresses of an opened company whose leads page is not loaded yet.
const extraCompanies = new Map();
const fetchedLeads = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const today = () => new Date().toISOString().slice(0, 10);

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<company>][?peek=<company>&q=<search>]`. A path id is always the
// full page; `?peek=` drives the drawer/split. Search lives in the URL too, so
// Back and reload restore the same list.
const parseHash = () => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "settings") {
    return {
      view: "settings",
      tab: ["commands", "guide", "resources", "connection"].includes(parts[1]) ? parts[1] : "commands",
    };
  }
  const params = new URLSearchParams(query);
  const view = viewMeta[parts[0]] ? parts[0] : "overview";
  const isRecords = RECORD_VIEWS.includes(view);
  let id = null;
  try {
    id = isRecords && parts[1] ? decodeURIComponent(parts[1]) : null;
  } catch {
    id = null;
  }
  return {
    view,
    id,
    peek: isRecords && !id ? params.get("peek") || null : null,
    query: isRecords ? params.get("q") || "" : "",
  };
};

const listHash = (target = route) => {
  const params = new URLSearchParams();
  if (target.query) params.set("q", target.query);
  const text = params.toString();
  return `#/${target.view}${text ? `?${text}` : ""}`;
};

const pageHash = (id, target = route) => {
  const params = new URLSearchParams();
  if (target.query) params.set("q", target.query);
  const text = params.toString();
  return `#/${target.view}/${encodeURIComponent(id)}${text ? `?${text}` : ""}`;
};

const peekHash = (id, target = route) => {
  const params = new URLSearchParams();
  if (target.query) params.set("q", target.query);
  if (id) params.set("peek", id);
  return `#/${target.view}?${params.toString()}`;
};

// What a row opens: the declared mode for the view, a page on phones.
const recordHash = (id, view = route.view) => {
  const target = view === route.view ? route : { view, query: "" };
  if (DETAIL_MODES[view] === "page") return pageHash(id, target);
  return peekHash(id, target);
};

const currentHash = () => {
  if (RECORD_VIEWS.includes(route.view)) {
    if (route.id) return pageHash(route.id);
    if (route.peek) return peekHash(route.peek);
    return listHash();
  }
  return `#/${route.view}`;
};

const replaceHash = (hash) => {
  window.history.replaceState(window.history.state, "", hash);
  applyRoute({ replaced: true });
};

const isMobileLayout = () => window.matchMedia("(max-width: 720px)").matches;

const setMobileSidebarOpen = (open) => {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  const scrim = document.querySelector("#sidebarScrim");
  if (scrim) scrim.hidden = !open;
};

const showToast = (message) => {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
};

const isEditing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

const draftOf = (company) => ({
  subject: draftEdits.get(company.id)?.subject ?? company.emailSubject,
  body: draftEdits.get(company.id)?.body ?? company.emailBody,
  email: draftEdits.get(company.id)?.email ?? company.bestLead?.email ?? "",
});

const itemsForView = (view) => desk.buckets[view] || [];

const matchesQuery = (company, query) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [company.name, company.industry, company.website, company.bestLead?.email, company.sentTo]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
};

const visibleItems = () => itemsForView(route.view).filter((item) => matchesQuery(item, route.query));

// A loaded company, with the addresses fetched for it on its own when its
// leads page was not loaded; otherwise the company a URL named (records.get).
const companyById = (id) => {
  if (!id) return null;
  const loaded = desk.companies.find((item) => item.id === id) || extraCompanies.get(id) || null;
  if (!loaded) return null;
  const leads = fetchedLeads.get(loaded.key);
  if (!leads || loaded.leads.length) return loaded;
  return assembleCompany(loaded, leads, { ref: loaded.ref });
};

const selectedId = () => route.id || route.peek || null;
const selectedCompany = () => companyById(selectedId());

// ── Small pieces ───────────────────────────────────────────────────────────
const scoreClass = (score) => (score >= 85 ? "high" : score >= 70 ? "mid" : "low");

const statusPill = (company) =>
  `<span class="status-pill status-${company.status}">${statusLabel(company.status)}</span>`;

// How old the evidence is, said plainly. An operator deciding whether a role is
// still open needs "37 天前", not a date they have to subtract from today.
// Demo is a fixed snapshot, so its evidence ages are measured from the
// snapshot's own date — otherwise every demo lead grows a day older daily.
const referenceDate = () => {
  const day = currentState?.provider?.today;
  const parsed = day ? new Date(`${day}T00:00:00Z`) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
};

const freshness = (company) => {
  const days = evidenceAgeDays(company.evidenceDate, referenceDate());
  if (days === null) return company.evidenceDate ? "" : "未记日期";
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
};

const isStale = (company) => {
  const days = evidenceAgeDays(company.evidenceDate, referenceDate());
  return !company.evidenceType || days === null || days > 30;
};

const evidencePill = (company) => {
  const stale = evidenceAgeDays(company.evidenceDate, referenceDate());
  const level = !company.evidenceType ? "unknown" : stale !== null && stale > 30 ? "stale" : company.evidenceType;
  const age = freshness(company);
  return `<span class="evidence-pill evidence-${level}">${evidenceLabel(company.evidenceType)}${age ? ` · ${age}` : ""}</span>`;
};

// A count the screen shows: exact when records.count answered, otherwise the
// loaded rows marked as a lower bound.
const countText = (key) => `${desk.counts[key]}${desk.exact ? "" : "+"}`;

// Every command this desk names is rendered through one component: the operator
// should never have to retype something the screen just told them to run, and a
// command that appears as plain prose is a command that gets mistyped.
const commandChip = (command, note = "") =>
  `<button class="command-chip" type="button" data-copy-command="${escapeHtml(command)}" title="点一下复制">
    <code>${escapeHtml(command)}</code>${note ? `<small>${escapeHtml(note)}</small>` : ""}
  </button>`;

const contactCell = (company) => {
  if (company.bestLead) return escapeHtml(company.bestLead.email);
  if (company.leadsUnknown) return '<span class="cell-muted">邮箱未加载</span>';
  return '<em class="row-warn">未找到邮箱</em>';
};

// ── Record table ───────────────────────────────────────────────────────────
// Column order matters: in the split queue and on phones only the first two
// columns (plus `.ws-split-keep`) stay visible.
const COLUMNS = {
  "to-send": [
    { label: "公司", cell: (c) => nameCell(c) },
    { label: "证据", cell: (c) => evidencePill(c), className: "ws-col-wide" },
    { label: "收件人", cell: contactCell, className: "ws-col-wide" },
    { label: "行业", cell: (c) => escapeHtml(c.industry) },
    { label: "匹配度", cell: (c) => scoreCell(c), className: "ws-col-num ws-split-keep" },
  ],
  sent: [
    { label: "公司", cell: (c) => nameCell(c) },
    { label: "状态", cell: (c) => statusPill(c), className: "ws-col-narrow" },
    { label: "实发邮箱", cell: (c) => escapeHtml(c.sentTo || "-"), className: "ws-col-wide" },
    { label: "批准", cell: (c) => escapeHtml(c.approvedAt || "-") },
    { label: "发出", cell: (c) => escapeHtml(c.sentAt || "尚未发出") },
    { label: "匹配度", cell: (c) => scoreCell(c), className: "ws-col-num" },
  ],
  all: [
    { label: "公司", cell: (c) => nameCell(c) },
    { label: "状态", cell: (c) => statusPill(c), className: "ws-col-narrow" },
    { label: "证据", cell: (c) => evidencePill(c), className: "ws-col-wide" },
    { label: "收件人", cell: (c) => (c.status === "draft" ? contactCell(c) : escapeHtml(c.sentTo || "-")) },
    { label: "行业", cell: (c) => escapeHtml(c.industry) },
    { label: "匹配度", cell: (c) => scoreCell(c), className: "ws-col-num" },
  ],
};

const nameCell = (company) =>
  `<span class="cell-ref">${escapeHtml(company.ref)}</span><strong>${escapeHtml(company.name)}</strong>${
    company.leads.length > 1 ? `<span class="lead-count">${company.leads.length} 个邮箱</span>` : ""
  }`;

const scoreCell = (company) => `<span class="score score-${scoreClass(company.matchScore)}">${company.matchScore}</span>`;

const renderEmptyList = () => {
  if (route.query) return `<div class="empty-state"><p>没有匹配「${escapeHtml(route.query)}」的公司。</p></div>`;
  if (route.view === "sent" && desk.counts.all > 0) {
    return '<div class="empty-state"><p>还没有批准过任何一封信。</p><p class="empty-hint">在「待发送」里逐封审阅，点「批准并发送」后会出现在这里。</p></div>';
  }
  const step = nextStep(desk);
  const hint = desk.profile.ready
    ? "回到对话框运行下面这条，它会把公司和联系邮箱写回这个列表。"
    : "资料还没准备好。先交给 Agent 整理，再开始找公司。";
  return `<div class="empty-state"><p>这里还没有公司。</p><p class="empty-hint">${hint}</p>${step?.command ? commandChip(step.command) : ""}</div>`;
};

const renderLoadMore = () => {
  const companiesCursor = pageInfo.companies?.nextCursor;
  const leadsCursor = pageInfo.leads?.nextCursor;
  if (!companiesCursor && !leadsCursor) return "";
  const loaded = desk.loaded.all;
  const scope = desk.exact ? `已加载 ${loaded} / ${desk.counts.all} 家公司` : `已加载 ${loaded} 家公司`;
  const leadsNote = leadsCursor ? "，联系邮箱也只加载了一部分" : "";
  return `<div class="load-more"><span>${scope}${leadsNote}</span><button class="button" type="button" data-load-more ${
    loadingMore ? "disabled" : ""
  }>${loadingMore ? "加载中…" : "加载更多"}</button></div>`;
};

const renderList = () => {
  const items = visibleItems();
  const columns = COLUMNS[route.view];
  const current = selectedId();
  if (!items.length) return renderEmptyList() + renderLoadMore();
  return `<table class="ws-table company-table">
    <thead><tr>${columns.map((column) => `<th class="${column.className || ""}">${column.label}</th>`).join("")}</tr></thead>
    <tbody>${items
      .map(
        (company) =>
          `<tr data-id="${escapeHtml(company.id)}" class="${company.id === current ? "ws-selected" : ""}">${columns
            .map((column) => `<td class="${column.className || ""}">${column.cell(company)}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>${renderLoadMore()}`;
};

// ── Detail ─────────────────────────────────────────────────────────────────
const renderLeadOptions = (company, selectedEmail) => {
  if (!company.leads.length) {
    return `<select class="lead-select" data-lead disabled><option>${company.leadsUnknown ? "邮箱加载中…" : "未找到邮箱"}</option></select>`;
  }
  return `<select class="lead-select" data-lead>${company.leads
    .map(
      (lead) =>
        `<option value="${escapeHtml(lead.email)}" ${lead.email === selectedEmail ? "selected" : ""}>${escapeHtml(lead.email)} · ${escapeHtml(lead.role)} · 置信度${confidenceLabel(lead.confidence)}</option>`,
    )
    .join("")}</select>`;
};

const renderTextField = (attribute, key, label, value, hint = "") =>
  `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="text" ${attribute}="${key}" value="${escapeHtml(value)}" /></label>`;

const renderCompanyDetail = (company) => {
  const draft = draftOf(company);
  const editable = company.status === "draft";
  const approvalReady = Boolean(company.bestLead) && desk.profile.ready;
  const attachment = desk.profile.resumeFile || "尚未设置简历文件";
  const sourceLine = company.sourceUrl
    ? `<a class="text-link" href="${escapeHtml(company.sourceUrl)}" target="_blank" rel="noreferrer noopener">来源页面</a>`
    : "来源未记录";
  const contactHint = company.bestLead
    ? desk.profile.ready
      ? ""
      : `<div class="detail-hint warn"><p class="detail-note warn">求职档案还缺 ${escapeHtml(desk.profile.missing.join("、"))}，暂时不能批准发送。</p>${commandChip("/busa-jobhunt profile", "交给 Agent 补齐资料后再回来确认")}</div>`
    : company.leadsUnknown
      ? '<p class="detail-note">正在读取这家公司的联系邮箱…</p>'
      : `<div class="detail-hint warn"><p class="detail-note warn">这家公司还没有可用邮箱，下面的发送按钮先锁着。回到对话框补一次线索：</p>${commandChip("/busa-jobhunt research", "补线索，已批准和已发出的公司不会被覆盖")}</div>`;
  return `<div class="detail-heading">
      <div><h2>${escapeHtml(company.name)}</h2><p class="detail-meta">${escapeHtml([company.ref, company.industry].filter(Boolean).join(" · "))}</p></div>
      ${statusPill(company)}
    </div>
    <div class="detail-facts">
      <div class="detail-fact"><span>匹配度</span><strong class="score-${scoreClass(company.matchScore)}">${company.matchScore}</strong></div>
      <div class="detail-fact"><span>官网</span><strong>${escapeHtml(company.website || "-")}</strong></div>
      <div class="detail-fact"><span>线索来源</span><strong>${sourceLine}</strong></div>
      <div class="detail-fact"><span>证据</span><strong>${evidencePill(company)}</strong></div>
    </div>
    ${
      editable
        ? `<section class="detail-section compose">
      <label class="field"><span>收件人${company.leads.length > 1 ? `（共 ${company.leads.length} 个候选邮箱）` : ""}</span>${renderLeadOptions(company, draft.email)}</label>
      <label class="field"><span>主题</span><input type="text" data-subject value="${escapeHtml(draft.subject)}" /></label>
      <label class="field"><span>正文</span><textarea data-body rows="8">${escapeHtml(draft.body)}</textarea></label>
      <div class="attachment-line"><span>附件</span><strong>${escapeHtml(attachment)}</strong></div>
    </section>
    ${contactHint}
    <div class="detail-actions">
      <button class="primary-button" type="button" data-approve ${approvalReady ? "" : "disabled"}>批准并发送</button>
      <button class="ghost-button" type="button" data-save-draft>保存草稿</button>
    </div>`
        : `<section class="detail-section">
      <h3>投递记录</h3>
      <dl class="detail-list">
        <div><dt>收件人</dt><dd>${escapeHtml(company.sentTo || "-")}</dd></div>
        <div><dt>批准时间</dt><dd>${escapeHtml(company.approvedAt || "-")}</dd></div>
        <div><dt>发出时间</dt><dd>${escapeHtml(company.sentAt || "尚未发出")}</dd></div>
      </dl>
      ${
        company.status === "queued"
          ? `<div class="detail-hint"><p class="detail-note">你已经批准了，但信还没发——真正发信的是可信脚本，它拿得到授权码，这个页面拿不到。回到命令行：</p>${commandChip("node scripts/send_emails.mjs", "先预演看清单，确认后再加 --apply")}</div>`
          : ""
      }
    </section>
    <section class="detail-section"><h3>邮件主题</h3><p class="detail-copy">${escapeHtml(company.emailSubject)}</p></section>
    <section class="detail-section"><h3>邮件正文</h3><pre class="mail-body">${escapeHtml(company.emailBody)}</pre></section>`
    }
    <section class="detail-section"><h3>匹配理由</h3><p class="detail-copy">${escapeHtml(company.matchReason)}</p></section>
    ${
      company.leads.length
        ? `<section class="detail-section"><h3>邮箱池</h3><div class="lead-table">${company.leads
            .map(
              (lead) =>
                `<div class="lead-row"><span><strong>${escapeHtml(lead.email)}</strong><small>${escapeHtml(lead.role)}</small></span><span class="confidence confidence-${lead.confidence}">${confidenceLabel(lead.confidence)}</span></div>`,
            )
            .join("")}</div></section>`
        : ""
    }`;
};

const renderDetail = () => {
  const id = selectedId();
  const mode = route.id ? "page" : DETAIL_MODES[route.view];
  if (!id) {
    return mode === "split"
      ? '<div class="ws-detail-empty">从左侧选一家公司，逐封审阅邮件。</div>'
      : "";
  }
  const company = selectedCompany();
  // On a phone every mode is already a page: Back to list, no "open full page".
  const asPage = mode === "page" || isMobileLayout();
  const closeLabel = asPage ? `← 返回${viewMeta[route.view].label}` : "关闭";
  const bar = `<div class="ws-detail-bar"><button class="button" type="button" data-close-detail>${closeLabel}</button>${
    !asPage && company ? `<a class="button" href="${pageHash(id)}" data-open-full>打开整页</a>` : ""
  }</div>`;
  if (!company) {
    const pending = extraCompanies.has(id) && extraCompanies.get(id) === undefined;
    return `${bar}<div class="ws-detail-empty">${pending ? "正在读取这家公司…" : "没有找到这家公司，它可能已被删除，或不在当前 Space 里。"}</div>`;
  }
  return `${bar}<div class="detail-body">${renderCompanyDetail(company)}</div>`;
};

// ── Pages ──────────────────────────────────────────────────────────────────
const renderRecordView = () => {
  const meta = viewMeta[route.view];
  const statusChip =
    currentState.provider.name === "demo"
      ? '<span class="snapshot-badge" title="固定演示数据，不写入 Busabase">DEMO</span>'
      : "";
  const shown = visibleItems().length;
  return `<section class="ws-view">
    <header class="ws-toolbar">
      <div class="ws-title"><h1 title="${escapeHtml(meta.hint)}">${meta.label}</h1><span class="ws-count" data-view-count>${
        route.query ? shown : countText(route.view)
      }</span></div>
      <div class="ws-actions">
        ${statusChip}
        <input class="search-input" type="search" data-search placeholder="搜索公司、行业、邮箱" value="${escapeHtml(route.query)}" aria-label="搜索公司" autocomplete="off" />
        <button class="button" type="button" data-refresh>刷新</button>
      </div>
    </header>
    <div class="ws-workspace">
      <div class="ws-list" data-list>${renderList()}</div>
      <aside class="ws-detail" aria-live="polite" data-detail>${renderDetail()}</aside>
    </div>
  </section>`;
};

const renderPipeline = () => {
  const steps = [
    ["profile", "填资料", desk.profile.ready ? "已就绪" : `缺 ${desk.profile.missing.length} 项`, desk.profile.ready],
    ["all", "找公司", `${countText("all")} 家已入库`, desk.counts.all > 0],
    ["sent", "发邮件", `${countText("sent")} 家已批准或发出`, desk.counts.sent > 0],
  ];
  return `<div class="pipeline" aria-label="投递流程">
    ${steps
      .map(
        ([view, label, meta, done], index) =>
          `<button class="pipeline-step ${done ? "done" : ""}" type="button" data-view="${view}"><i aria-hidden="true">${index + 1}</i><span><strong>${label}</strong><small>${escapeHtml(meta)}</small></span>${index < 2 ? '<b aria-hidden="true">›</b>' : ""}</button>`,
      )
      .join("")}
  </div>`;
};

// Three numbers nothing else on screen shows: the nav already carries the
// per-view totals and the sidebar the missing-address and queued counts.
const renderMetrics = () => {
  const queue = desk.buckets["to-send"];
  const scope = desk.partial.companies ? "（已加载）" : "";
  const official = queue.filter((company) => company.evidenceType === "official-site" && !isStale(company)).length;
  const stale = queue.filter(isStale).length;
  const average = queue.length
    ? Math.round(queue.reduce((sum, company) => sum + company.matchScore, 0) / queue.length)
    : null;
  return `<div class="ws-metrics" aria-label="待发送的质量">
    <div title="待发送里，岗位就挂在公司自己官网上、且 30 天内抓到的"><span>官网在招${scope}</span><strong>${official}</strong></div>
    <div title="待发送里，证据超过 30 天、没记日期或没标来源的——发之前值得再确认岗位还在"><span>证据待复核${scope}</span><strong>${stale}</strong></div>
    <div title="待发送公司的平均匹配度"><span>平均匹配度${scope}</span><strong>${average ?? "-"}</strong></div>
  </div>`;
};

const renderTopQueue = () => {
  const top = desk.buckets["to-send"].slice(0, 5);
  if (!top.length) return "";
  return `<section class="card flush overview-queue">
    <div class="overview-queue-head"><h2>最值得先发的 ${top.length} 家</h2><button class="button" type="button" data-view="to-send">打开待发送</button></div>
    <table class="ws-table">
      <thead><tr><th>公司</th><th class="ws-col-wide">证据</th><th class="ws-col-wide">收件人</th><th class="ws-col-num">匹配度</th></tr></thead>
      <tbody>${top
        .map(
          (company) =>
            `<tr data-open-peek="${escapeHtml(company.id)}"><td>${nameCell(company)}</td><td class="ws-col-wide">${evidencePill(company)}</td><td class="ws-col-wide">${contactCell(company)}</td><td class="ws-col-num">${scoreCell(company)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
  </section>`;
};

const renderOverview = () => {
  const profile = desk.profile;
  const summary = profile.ready
    ? [profile.name, profile.targetRole, profile.locations].filter(Boolean).join(" · ")
    : `资料还缺 ${profile.missing.join("、")}，补齐后才能批准发送。`;
  const statusChip =
    currentState.provider.name === "demo"
      ? '<span class="snapshot-badge" title="固定演示数据，不写入 Busabase">DEMO</span>'
      : "";
  return `<section class="ws-overview">
    <header class="page-hero">
      <div><h1>今天的投递</h1><p>${escapeHtml(summary)}</p></div>
      <div class="page-actions">${statusChip}<span class="as-of">${escapeHtml(currentState.provider.asOf || "Busabase 当前数据")}</span><button class="button" type="button" data-refresh>刷新</button></div>
    </header>
    ${renderMetrics()}
    ${renderMobileNextStep()}
    <section class="card flush">${renderPipeline()}</section>
    ${renderTopQueue()}
  </section>`;
};

const renderProfile = () => {
  const profile = desk.profile;
  return `<section class="ws-view">
    <header class="ws-toolbar">
      <div class="ws-title"><h1 title="这份资料决定 Agent 搜什么公司、写什么邮件">我的资料</h1>${
        profile.ready
          ? '<span class="status-pill status-sent">已就绪</span>'
          : `<span class="status-pill status-draft">缺 ${profile.missing.length} 项</span>`
      }</div>
    </header>
    <div class="ws-workspace profile-workspace"><div class="profile-scroll">
      <p class="detail-note">这份资料决定 Agent 搜什么公司、写什么邮件。你可以在这里直接改，也可以把简历丢给 Agent 让它填。</p>
      <div class="detail-hint">${commandChip("/busa-jobhunt profile", "读你的简历自动填这一屏，并排版出 PDF 简历")}</div>
      ${profile.ready ? "" : `<div class="setup-notice">还缺：${escapeHtml(profile.missing.join("、"))}</div>`}
      <section class="detail-section compose">
        ${renderTextField("data-profile", "name", "求职人", profile.name)}
        ${renderTextField("data-profile", "targetRole", "目标岗位", profile.targetRole, "搜索公司时的主关键词")}
        ${renderTextField("data-profile", "locations", "意向城市", profile.locations)}
        ${renderTextField("data-profile", "industries", "意向行业", profile.industries)}
        <label class="field"><span>自我介绍<small>写实一点，邮件正文会引用它</small></span><textarea data-profile="highlights" rows="5">${escapeHtml(profile.highlights)}</textarea></label>
        ${renderTextField("data-profile", "jobBoards", "招聘渠道", profile.jobBoards, "research 会优先在这些渠道上找线索")}
        ${renderTextField("data-profile", "resumeFile", "简历文件（可选）", profile.resumeFile, "需要附件时由 /busa-jobhunt profile 生成，放在 skill 的 resume/ 目录")}
        ${renderTextField("data-profile", "fromEmail", "发件邮箱", profile.fromEmail, "发送脚本用这个邮箱发出")}
        <div class="attachment-line"><span>SMTP 凭据</span><strong>${
          profile.mailReady ? `已配置 · 存在 Vault（${escapeHtml(profile.smtpVaultKey)}）` : "未配置"
        }</strong></div>
      </section>
      ${profile.mailReady ? "" : `<div class="detail-hint">${commandChip("/busa-jobhunt send", "配置发件邮箱，授权码写进 Vault")}</div>`}
      <p class="detail-note">授权码只存在 Busabase Vault 里，这个页面既读不到也不显示它。</p>
      <div class="detail-actions">
        <button class="primary-button" type="button" data-save-profile>保存资料</button>
        <button class="ghost-button" type="button" data-view="to-send">去看待发送</button>
      </div>
    </div></div>
  </section>`;
};

// Everything this desk cannot do itself happens back in the conversation, so
// the command to run next is part of the UI, not something to look up.
const renderNextStep = () => {
  const step = nextStep(desk);
  if (!step) return "";
  return `<section class="next-step" aria-label="下一步">
    <div class="next-step-title">${escapeHtml(step.title)}</div>
    <div class="next-step-detail">${escapeHtml(step.detail)}</div>
    ${step.command ? commandChip(step.command) : ""}
  </section>`;
};

// The sidebar is an off-canvas drawer at phone widths, so the phone Overview
// repeats the next command there instead of above every list.
const renderMobileNextStep = () => {
  const step = nextStep(desk);
  if (!step?.command) return "";
  return `<div class="mobile-next-step"><span>${escapeHtml(step.title)}</span>${commandChip(step.command)}</div>`;
};

const navCount = (key) => {
  if (key === "profile") return desk.profile.ready ? "✓" : "!";
  if (key === "overview") return "";
  return countText(key);
};

const renderSidebar = () => {
  const attention = desk.attention;
  const primary = attention.profileReady
    ? `<button class="human-work-primary" type="button" data-view="to-send"><span><strong>${countText("to-send")}</strong><span>待你确认发送</span></span></button>`
    : `<button class="human-work-primary warn" type="button" data-view="profile"><span><strong>${attention.profileMissing.length}</strong><span>请先补全资料</span></span></button>`;
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">KJ</div><div class="brand-copy"><div class="brand-title">Busa 求职直投</div><div class="brand-subtitle">目标公司直投台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">今天的投递</div>${primary}<div class="human-work-secondary"><button type="button" data-view="to-send" title="缺邮箱，需要 Agent 补线索${desk.partial.companies ? "（按已加载的公司计）" : ""}"><strong>${attention.blocked}${desk.partial.companies ? "+" : ""}</strong><span>缺邮箱</span></button><button type="button" data-view="sent" title="已批准，等发送脚本发出"><strong>${countText("queued")}</strong><span>排队待发出</span></button></div></section>
    ${renderNextStep()}
    <div class="sidebar-separator"></div>
    <nav class="filters" aria-label="工作流导航">${Object.entries(viewMeta)
      .map(
        ([key, meta]) =>
          `<button class="${route.view === key ? "active" : ""}" type="button" data-view="${key}" title="打开${meta.label}"><span>${meta.label}</span><span>${navCount(key)}</span></button>`,
      )
      .join("")}</nav>
    <div class="help-box"><div class="virtual-only"><span></span>发送由可信脚本执行</div><button class="help-button" type="button" data-open-help>帮助与设置</button></div>
  </aside>`;
};

const renderHelp =
  () => `<div class="modal-backdrop" id="helpModal" aria-hidden="false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <div class="modal-head"><div><div id="helpTitle" class="modal-title">帮助与设置</div><div class="modal-subtitle">Busa 求职直投 · 目标公司直投台</div></div><button class="icon-button" type="button" data-close-help aria-label="关闭帮助">关闭</button></div>
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "commands" ? "active" : ""}" type="button" data-help-tab="commands">命令</button><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">指南</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
    <section class="help-tab-panel ${helpTab === "commands" ? "active" : ""}"><h2>回到对话框能做什么</h2>
      <p class="detail-note">这个页面负责让你看清楚和拍板。搜集、起草、发送这些活在对话框那边，点一下命令即可复制。</p>
      <div class="command-list">
        ${commandChip("/busa-jobhunt profile", "读你的简历，填好这份档案，并排版出 PDF 简历")}
        ${commandChip("/busa-jobhunt research", "按你的招聘渠道找公司和邮箱，每家写一封定制信")}
        ${commandChip("/busa-jobhunt send", "配置发件邮箱，授权码写进 Vault，不进这个页面")}
        ${commandChip("node scripts/send_emails.mjs", "把你批准的信发出去，默认预演，加 --apply 才真发")}
        ${commandChip("node scripts/build_resume.mjs", "只重排简历 PDF，不动其他资料")}
      </div>
      <p class="detail-note">全部命令默认都是预演：先打印它要做什么，你看过再加 <code>--apply</code>。</p>
    </section>
    <section class="help-tab-panel ${helpTab === "guide" ? "active" : ""}"><h2>三步走</h2><dl class="settings-list">
      <div><dt>1 整理资料</dt><dd>把已有简历或经历交给 Agent，由 <code>/busa-jobhunt profile</code> 提取目标岗位和真实亮点。简历附件可选。</dd></div>
      <div><dt>2 找公司</dt><dd>让 Agent 按资料上网搜索，公司与邮箱会写回这里，一家公司可以有多个候选邮箱。</dd></div>
      <div><dt>3 发邮件</dt><dd>在「待发送」里逐条审阅主题和正文，点「批准并发送」。一家公司只发一封，避免被判成骚扰。</dd></div>
      <div><dt>谁在发</dt><dd>浏览器只记录批准动作。真正的 SMTP 发送由 skill 的可信脚本执行，授权码不会进入页面。</dd></div>
      <div><dt>读多少</dt><dd>每次打开只读每张表的第一页（最多 100 行），总数由服务器直接统计。公司更多时，列表底部的「加载更多」再读下一页。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "resources" ? "active" : ""}"><h2>Busabase 资源</h2><dl class="settings-list">
      <div><dt>应用根节点</dt><dd><code>${escapeHtml(appConfig.folder.slug)}</code></dd></div>
      <div><dt>结构化数据</dt><dd>${appConfig.bases.map((base) => escapeHtml(base.name)).join("、")}</dd></div>
      <div><dt>简历附件</dt><dd>可选。需要随邮件附上时，由 Agent 生成到 skill 的 <code>resume/</code> 目录，档案里只记文件名。</dd></div>
      <div><dt>秘密数据</dt><dd>SMTP 授权码存 Vault，只有发送脚本读取；页面永远看不到值。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "connection" ? "active" : ""}"><h2>连接状态</h2><dl class="settings-list">
      <div><dt>数据提供方</dt><dd>${currentState.provider.name === "demo" ? "固定演示数据（不写入）" : "Busabase SDK"}</dd></div>
      <div><dt>Space</dt><dd>${authStatus?.space ? escapeHtml(authStatus.space.name || "当前 Space") : currentState.provider.name === "demo" ? "演示模式" : "由 Busabase 当前环境提供"}</dd></div>
      <div><dt>写入方式</dt><dd>按你的权限：有写权限直接生效，没有则提交审核</dd></div>
      <div><dt>资源版本</dt><dd>Schema v${appConfig.schemaVersion}</dd></div>
      <div><dt>运行边界</dt><dd>本地与 AirApp 使用同一份 Hono 应用源码。</dd></div>
    </dl></section>
  </div>
</section></div>`;

const mobileMeta = () => {
  const meta = viewMeta[route.view];
  if (meta.kind === "records") return `${countText(route.view)} ${meta.noun}`;
  if (meta.kind === "profile") return desk.profile.ready ? "已就绪" : `缺 ${desk.profile.missing.length} 项`;
  return desk.profile.ready ? `${countText("to-send")} 家待你确认` : "请先补全资料";
};

const syncBodyState = () => {
  const onRecords = RECORD_VIEWS.includes(route.view);
  const id = selectedId();
  const mode = DETAIL_MODES[route.view];
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", onRecords && Boolean(id));
  body.toggle("ws-detail-page", onRecords && Boolean(route.id));
  body.toggle("ws-detail-drawer", onRecords && !route.id && mode === "drawer");
  body.toggle("ws-layout-split", onRecords && !route.id && mode === "split");
  body.toggle("ws-searching", onRecords && Boolean(route.query));
};

const renderApp = () => {
  const meta = viewMeta[route.view];
  const page =
    meta.kind === "records" ? renderRecordView() : meta.kind === "profile" ? renderProfile() : renderOverview();
  syncBodyState();
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}">${renderSidebar()}<main class="main">
    <div class="mobile-topbar"><button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar aria-controls="appSidebar" aria-label="打开侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><div class="mobile-view-title">${meta.label}</div><div class="mobile-view-meta">${escapeHtml(mobileMeta())}</div></div><button class="mobile-help-button" type="button" data-open-help aria-label="帮助与设置">帮助</button></div>
    ${page}
  </main></div><div id="sidebarScrim" class="sidebar-scrim" hidden></div>${parseHash().view === "settings" ? renderHelp() : ""}<div class="toast" role="status" aria-live="polite" hidden></div>`;
  bindEvents();
  root.querySelector("tr.ws-selected")?.scrollIntoView({ block: "nearest" });
};

// Search re-renders the list and count only, so the field keeps its focus.
const renderListOnly = () => {
  const list = root.querySelector("[data-list]");
  if (!list) return;
  list.innerHTML = renderList();
  const count = root.querySelector("[data-view-count]");
  if (count) count.textContent = route.query ? String(visibleItems().length) : countText(route.view);
  syncBodyState();
  bindListEvents();
};

// ── Onboarding (unchanged product step) ────────────────────────────────────
const profileInputFrom = (selector = "[data-onboarding]") => {
  const input = {};
  root.querySelectorAll(selector).forEach((element) => {
    input[element.dataset.onboarding || element.dataset.profile] = element.value;
  });
  return input;
};

const renderOnboarding = () => {
  const profile = desk.profile;
  const onboardingField = (key, label, value, hint = "") => renderTextField("data-onboarding", key, label, value, hint);
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal onboarding-modal" role="dialog" aria-labelledby="onboardingTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">下一步 · 交给 AGENT</p><h1 id="onboardingTitle">先让 Agent 整理求职档案</h1></div></div><form id="onboardingForm" class="setup-body onboarding-form" data-onboarding-form><div class="onboarding-agent-first"><p>把现有简历、个人主页或几段经历直接交给 Agent。它会提取真实信息、确认求职方向，并把结果写回这里，不需要你先填一遍表单。</p>${commandChip("/busa-jobhunt profile", "读取你的材料，整理求职档案；需要时再生成 PDF 简历")}</div><details class="onboarding-manual"><summary>没有材料，改为手动补充</summary><div class="onboarding-manual-fields"><div class="onboarding-grid">${onboardingField("name", "怎么称呼你", profile.name)}${onboardingField("targetRole", "目标岗位", profile.targetRole, "必填，例如：B 端产品经理")}${onboardingField("locations", "意向城市", profile.locations)}${onboardingField("industries", "意向行业", profile.industries)}</div><label class="field"><span>经验亮点<small>必填，只写真实、可验证的经历</small></span><textarea data-onboarding="highlights" rows="5">${escapeHtml(profile.highlights)}</textarea></label>${onboardingField("jobBoards", "招聘渠道", profile.jobBoards, "例如：BOSS 直聘、公司官网")}${onboardingField("resumeFile", "简历文件（可选）", profile.resumeFile, "需要附件时填写 skill/resume/ 下的文件名")}${onboardingField("fromEmail", "发件邮箱", profile.fromEmail, "必填，只记录地址；授权码另存 Vault")}</div></details><div class="setup-error" data-onboarding-error role="alert" hidden></div></form><div class="setup-footer onboarding-footer"><span class="setup-security">资料不完整也可以先进入，稍后再交给 Agent</span><div class="onboarding-footer-actions"><button class="ghost-button" type="button" data-skip-onboarding>暂时跳过</button><button class="connect-button secondary-onboarding-action" type="submit" form="onboardingForm" data-complete-onboarding>保存手动填写内容</button></div></div></section></div>`;
  root.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    const command = event.currentTarget.dataset.copyCommand;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // The visible command remains available when clipboard access is denied.
    }
  });
  root.querySelector("[data-onboarding-form]")?.addEventListener("submit", completeOnboarding);
  root.querySelector("[data-skip-onboarding]")?.addEventListener("click", skipOnboarding);
};

// ── Writes ─────────────────────────────────────────────────────────────────
const writeNotice = (result) => {
  if (result?.demo) return "演示模式：没有写入 Busabase，也没有真的发出邮件。";
  if (result?.pending) return airAppWriteMessage({ status: "queued" }, { locale: "zh-CN" });
  return "";
};

const captureDraft = (company) => {
  const subject = root.querySelector("[data-subject]");
  const body = root.querySelector("[data-body]");
  const lead = root.querySelector("[data-lead]");
  if (!subject && !body && !lead) return draftOf(company);
  const draft = {
    subject: subject ? subject.value : draftOf(company).subject,
    body: body ? body.value : draftOf(company).body,
    email: lead && !lead.disabled ? lead.value : draftOf(company).email,
  };
  draftEdits.set(company.id, draft);
  return draft;
};

const runWrite = async (action) => {
  try {
    const provider = await getProvider();
    return await action(provider);
  } catch (error) {
    const message = String(error?.message || error);
    showToast(message.startsWith("MISSING_") ? message.split(": ")[1] : `写入失败：${message}`);
    return null;
  }
};

const approveCompany = async () => {
  const company = selectedCompany();
  if (!company) return;
  const draft = captureDraft(company);
  let fields;
  try {
    fields = {
      "email-subject": draft.subject,
      "email-body": draft.body,
      ...buildApprovalFields({ ...company, emailSubject: draft.subject, emailBody: draft.body }, draft.email, today()),
    };
  } catch (error) {
    showToast(String(error.message).split(": ")[1] || String(error.message));
    return;
  }
  // In the review queue the approved letter leaves the list; move on to the
  // next one rather than dropping the operator back to an empty pane.
  const queue = visibleItems();
  const index = queue.findIndex((item) => item.id === company.id);
  const nextInQueue = route.view === "to-send" && index >= 0 ? queue[index + 1] || queue[index - 1] || null : null;
  const result = await runWrite((provider) =>
    provider.updateCompany({
      recordId: company.recordId || company.id,
      fields,
      message: `Approve outreach to ${company.name} — send resume to ${draft.email}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(company.id);
  if (route.view === "to-send" && !route.id) {
    window.history.replaceState(window.history.state, "", nextInQueue ? peekHash(nextInQueue.id) : listHash());
    route = parseHash();
  }
  await load({ keepRoute: true });
  // load() replaces the whole shell, toast element included, so confirm after
  // the re-render rather than before it.
  showToast(writeNotice(result) || `已批准发送给 ${company.name}，运行发送脚本即可发出。`);
};

const saveDraft = async () => {
  const company = selectedCompany();
  if (!company) return;
  const draft = captureDraft(company);
  const result = await runWrite((provider) =>
    provider.updateCompany({
      recordId: company.recordId || company.id,
      fields: { "email-subject": draft.subject, "email-body": draft.body },
      message: `Update outreach draft for ${company.name}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(company.id);
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "草稿已保存。");
};

const saveProfile = async () => {
  const input = profileInputFrom("[data-profile]");
  const onboardingVersion = missingProfileRequirements(input).length ? undefined : appConfig.onboardingVersion;
  const result = await runWrite((provider) =>
    provider.saveProfile({
      recordId: desk.profile.recordId,
      fields: buildProfileFields(input, today(), { onboardingVersion }),
      message: `Update job-search profile for ${input.targetRole || "job hunt"}`,
    }),
  );
  if (!result) return;
  profileEdited = false;
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "资料已保存。");
};

const completeOnboarding = async (event) => {
  event.preventDefault();
  const input = profileInputFrom();
  const missing = missingProfileRequirements(input);
  const error = root.querySelector("[data-onboarding-error]");
  if (missing.length) {
    error.textContent = `请先补全：${missing.join("、")}`;
    error.hidden = false;
    return;
  }
  const button = root.querySelector("[data-complete-onboarding]");
  button.disabled = true;
  const result = await runWrite((provider) =>
    provider.saveProfile({
      recordId: desk.profile.recordId,
      fields: buildProfileFields(input, today(), { onboardingVersion: appConfig.onboardingVersion }),
      message: `Complete JobHunt onboarding v${appConfig.onboardingVersion} for ${input.targetRole}`,
    }),
  );
  if (!result) {
    button.disabled = false;
    return;
  }
  if (result.pending) {
    error.className = "setup-notice";
    error.textContent = "已提交审核：你在这里没有写权限，需要有写权限的人批准。批准后刷新页面即可进入投递台。";
    error.hidden = false;
    button.textContent = "等待审批";
    return;
  }
  profileEdited = false;
  await load();
  showToast(writeNotice(result) || "求职方向已保存。");
};

const skipOnboarding = async () => {
  onboardingDismissed = true;
  await load();
  showToast("已跳过引导，资料可以稍后补充。");
};

// ── Reads beyond page 1 ────────────────────────────────────────────────────
const rebuildDesk = () => {
  desk = createJobhuntDesk(loadedRecords, {
    totals: currentState.totals || null,
    partial: { companies: Boolean(pageInfo.companies?.nextCursor), leads: Boolean(pageInfo.leads?.nextCursor) },
  });
};

// One click, one more page of each Base that still has one.
const loadMore = async () => {
  if (loadingMore) return;
  loadingMore = true;
  renderListOnly();
  try {
    const provider = await getProvider();
    const keys = ["companies", "leads"].filter((key) => pageInfo[key]?.nextCursor);
    const pages = await Promise.all(keys.map(async (key) => [key, await provider.loadMore(key, pageInfo[key].nextCursor)]));
    const seen = new Set(loadedRecords.map((record) => record.id));
    for (const [key, page] of pages) {
      loadedRecords.push(...page.records.filter((record) => !seen.has(record.id)));
      pageInfo[key] = { ...pageInfo[key], nextCursor: page.nextCursor || null };
    }
    extraPagesLoaded = true;
    rebuildDesk();
  } catch (error) {
    showToast(`加载失败：${String(error?.message || error)}`);
  } finally {
    loadingMore = false;
    renderApp();
  }
};

// The company a URL names but no loaded page holds: one records.get, plus its
// addresses. Also fills in the addresses of a loaded company whose leads page
// has not been read yet. Never pages through a Base to find either.
const ensureSelectedCompany = async () => {
  const id = selectedId();
  if (!id || !RECORD_VIEWS.includes(route.view) || !desk) return;
  const provider = await getProvider();
  let company = desk.companies.find((item) => item.id === id) || extraCompanies.get(id);
  if (company === undefined && !extraCompanies.has(id)) {
    extraCompanies.set(id, undefined);
    let record = null;
    try {
      record = typeof provider.getCompany === "function" ? await provider.getCompany(id) : null;
    } catch {
      record = null;
    }
    company = record ? assembleCompany(normalizeCompany(record), [], { leadsUnknown: true }) : null;
    extraCompanies.set(id, company);
    if (selectedId() === id) renderApp();
  }
  if (!company || company.leads.length || !company.leadsUnknown || fetchedLeads.has(company.key)) return;
  fetchedLeads.set(company.key, []);
  try {
    const records = typeof provider.leadsForCompany === "function" ? await provider.leadsForCompany(company.key) : [];
    fetchedLeads.set(company.key, records.map(normalizeLead));
  } catch {
    fetchedLeads.delete(company.key);
    return;
  }
  if (selectedId() === id && !isEditing()) renderApp();
};

// ── Events ─────────────────────────────────────────────────────────────────
const closeDetail = () => {
  if (window.history.state?.fromList) window.history.back();
  else window.location.hash = listHash();
};

const openRow = (id) => {
  const hash = isMobileLayout() && DETAIL_MODES[route.view] !== "page" ? peekHash(id) : recordHash(id);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (route.peek) replaceHash(hash);
  else window.location.hash = hash;
};

const bindListEvents = () => {
  root.querySelectorAll("[data-list] tbody tr[data-id]").forEach((row) =>
    row.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      openRow(row.dataset.id);
    }),
  );
  root.querySelector("[data-load-more]")?.addEventListener("click", loadMore);
  bindCopyButtons(root.querySelector("[data-list]"));
};

const bindCopyButtons = (scope) => {
  scope?.querySelectorAll("[data-copy-command]").forEach((button) =>
    button.addEventListener("click", async (event) => {
      const command = event.currentTarget.dataset.copyCommand;
      try {
        await navigator.clipboard.writeText(command);
        showToast(`已复制：${command}`);
      } catch {
        showToast(`回到对话框运行：${command}`);
      }
    }),
  );
};

const bindEvents = () => {
  root.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      setMobileSidebarOpen(false);
      window.location.hash = `#/${button.dataset.view}`;
    }),
  );
  root.querySelectorAll("[data-open-peek]").forEach((row) =>
    row.addEventListener("click", () => {
      window.location.hash = peekHash(row.dataset.openPeek, { view: "to-send", query: "" });
    }),
  );
  bindListEvents();
  root.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    if (isMobileLayout()) setMobileSidebarOpen(false);
    else {
      sidebarCollapsed = !sidebarCollapsed;
      renderApp();
    }
  });
  root.querySelector("[data-mobile-sidebar]")?.addEventListener("click", () => setMobileSidebarOpen(true));
  root.querySelector("#sidebarScrim")?.addEventListener("click", () => setMobileSidebarOpen(false));
  root.querySelector("[data-close-detail]")?.addEventListener("click", closeDetail);
  root.querySelectorAll("[data-open-help]").forEach((button) =>
    button.addEventListener("click", () => {
      lastContentHash = currentHash();
      window.location.hash = "#/settings/commands";
    }),
  );
  root.querySelector("[data-close-help]")?.addEventListener("click", () => {
    window.location.hash = lastContentHash;
  });
  root.querySelector("#helpModal")?.addEventListener("click", (event) => {
    if (event.target.id === "helpModal") window.location.hash = lastContentHash;
  });
  root.querySelectorAll("[data-help-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      window.location.hash = `#/settings/${button.dataset.helpTab}`;
    }),
  );
  root.querySelectorAll("[data-refresh]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (currentState.provider.name === "demo") showToast("演示数据为 2026-08-11 固定快照。");
      else await load({ keepRoute: true });
    }),
  );
  root.querySelector("[data-search]")?.addEventListener("input", (event) => {
    route = { ...route, query: event.target.value };
    const hash = route.peek ? peekHash(route.peek) : route.id ? pageHash(route.id) : listHash();
    window.history.replaceState(window.history.state, "", hash);
    lastContentHash = hash;
    renderListOnly();
  });
  bindCopyButtons(root.querySelector(".sidebar"));
  bindCopyButtons(root.querySelector("[data-detail]"));
  bindCopyButtons(root.querySelector(".ws-overview"));
  bindCopyButtons(root.querySelector(".profile-scroll"));
  bindCopyButtons(root.querySelector(".modal"));
  root.querySelector("[data-approve]")?.addEventListener("click", approveCompany);
  root.querySelector("[data-save-draft]")?.addEventListener("click", saveDraft);
  root.querySelectorAll("[data-save-profile]").forEach((button) => button.addEventListener("click", saveProfile));
  root.querySelectorAll("[data-subject], [data-body], [data-lead]").forEach((element) =>
    element.addEventListener("input", () => {
      const company = selectedCompany();
      if (company) captureDraft(company);
    }),
  );
  root.querySelectorAll("[data-profile]").forEach((element) =>
    element.addEventListener("input", () => {
      profileEdited = true;
    }),
  );
};

const applyRoute = ({ replaced = false } = {}) => {
  const parsed = parseHash();
  if (parsed.view === "settings") {
    helpTab = parsed.tab;
    if (currentState) renderApp();
    return;
  }
  const previous = route;
  // Mark a record opened from its list so Back / Close / Escape step back to
  // that exact list entry instead of pushing a new one.
  if (!replaced && (parsed.id || parsed.peek) && previousRouteWasList && previous.view === parsed.view) {
    window.history.replaceState({ fromList: true }, "");
  }
  route = parsed;
  previousRouteWasList = RECORD_VIEWS.includes(route.view) && !route.id && !route.peek;
  // The review queue is worked top to bottom: on a desktop, entering it with
  // nothing selected opens the first letter beside the list. Closing the
  // letter (Escape / 关闭) stays closed — that is not "entering".
  const entering = previous.view !== route.view || !hasRendered;
  if (
    desk &&
    entering &&
    DETAIL_MODES[route.view] === "split" &&
    !route.id &&
    !route.peek &&
    !isMobileLayout()
  ) {
    const first = visibleItems()[0];
    if (first) {
      window.history.replaceState(window.history.state, "", peekHash(first.id));
      route = parseHash();
    }
  }
  lastContentHash = currentHash();
  setMobileSidebarOpen(false);
  if (currentState) {
    hasRendered = true;
    renderApp();
    ensureSelectedCompany();
  }
};

const load = async ({ keepRoute = false } = {}) => {
  const ready = await passConnectGate({ onReady: load });
  if (!ready) return;
  if (!keepRoute) root.innerHTML = '<div class="boot-state">正在读取投递台...</div>';
  try {
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    // Resolved before anything asks where it runs. The local `/auth/*` gateway
    // exists only in a standalone run, so consult it only there — and decide
    // that from the runtime Busabase injected, never from the URL.
    const standaloneLocalRuntime = shouldUseLocalAirAppGateway(await detectAirAppRuntime());
    if (!demo && standaloneLocalRuntime) authStatus = await connectGateStatus();
    const provider = await getProvider();
    currentState = await provider.getReadinessState();
    closeConnectGate();
    desk = createJobhuntDesk(currentState.records);
    if (
      currentState.provider.name !== "demo" &&
      !onboardingDismissed &&
      desk.profile.onboardingVersion < appConfig.onboardingVersion
    ) {
      renderOnboarding();
      return;
    }
    currentState = await provider.getState();
    loadedRecords = [...currentState.records];
    pageInfo = { ...(currentState.pageInfo || {}) };
    extraPagesLoaded = false;
    extraCompanies.clear();
    fetchedLeads.clear();
    rebuildDesk();
    if (!window.location.hash) window.history.replaceState(null, "", "#/overview");
    applyRoute({ replaced: true });
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) console.info("Busabase workspace setup is not complete");
    else console.error("Provider failed", error);
    renderSetupRequired(error, load);
  }
};

window.addEventListener("hashchange", () => applyRoute());
window.addEventListener("resize", () => {
  if (!isMobileLayout()) setMobileSidebarOpen(false);
});
// Crossing the phone breakpoint changes the detail bar (Back vs Close).
window.matchMedia("(max-width: 720px)").addEventListener("change", () => {
  if (currentState && desk && !isEditing()) renderApp();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (parseHash().view === "settings") {
    window.location.hash = lastContentHash;
    return;
  }
  if (document.body.classList.contains("sidebar-open")) {
    setMobileSidebarOpen(false);
    return;
  }
  // Escape inside a draft only leaves the field; a second Escape closes.
  if (event.target.closest?.("input, textarea, select")) {
    event.target.blur();
    return;
  }
  if (RECORD_VIEWS.includes(route.view) && route.peek) closeDetail();
});
// Keep the queue fresh without ever clobbering an email the operator is typing,
// and without dropping pages the operator asked for.
window.setInterval(() => {
  if (!currentState || currentState.provider.name === "demo") return;
  if (isEditing() || profileEdited || draftEdits.size || extraPagesLoaded) return;
  load({ keepRoute: true });
}, 60_000);

load();
