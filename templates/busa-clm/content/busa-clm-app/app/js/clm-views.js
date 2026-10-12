import {
  DETAIL_MODES,
  date,
  datetime,
  detailUrl,
  e,
  els,
  enumLabel,
  isMobileLayout,
  isPartial,
  pageCount,
  recordById,
  recordUrl,
  state,
  t,
  VIEW_BASE,
} from "../app.js";
import { isObligationDueSoon, isRenewalDueSoon, RISK_LEVELS, STAGES } from "./clm-model.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${e(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${e(title)}</strong>${detail ? `<p>${e(detail)}</p>` : ""}</div>`;
const badge = (value) => (value ? `<span class="badge ${e(value)}">${e(enumLabel(value))}</span>` : "");
const noticeBanner = () => (state.notice ? `<div class="notice-banner" role="alert">${e(state.notice)}</div>` : "");
const disabled = () => (state.busy ? "disabled" : "");
const scope = (base, loaded) => (isPartial(base) ? ` · ${t("loadedScope").replace("{n}", loaded)}` : "");

// A relation is a business id (`ct-…`). Resolve it to the contract's name;
// when that contract is not on the loaded page, say so — never print the id.
function contractLink(contractId) {
  if (!contractId) return "";
  const contract = recordById("contracts", contractId);
  if (!contract) return `<span class="muted-inline">${t("notLoaded")}</span>`;
  return `<a class="record-link" href="${detailUrl(contract.id, "contracts")}">${e(contract.name || t("contract"))}</a>`;
}

function contractName(contractId) {
  if (!contractId) return "";
  return recordById("contracts", contractId)?.name || t("notLoaded");
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show. Stage is a text field, so
// there is no server aggregate for the windows below: they are computed from
// the loaded page and say so when more rows exist than are loaded.
function metricsBand() {
  const now = state.settings?.generated_at;
  const renewalsSoon = state.contracts.filter((item) => isRenewalDueSoon(item, now)).length;
  const obligationsSoon = state.obligations.filter((item) => isObligationDueSoon(item, now)).length;
  const exactHighRisk = state.demo ? null : state.settings?.attention?.high_risk;
  const highRisk = exactHighRisk ?? state.contracts.filter((item) => item.risk === "high").length;
  return [
    [t("renewalsSoon") + scope("contracts", state.contracts.length), renewalsSoon],
    [t("obligationsSoon") + scope("obligations", state.obligations.length), obligationsSoon],
    [t("highRisk") + (exactHighRisk == null ? scope("contracts", state.contracts.length) : ""), highRisk],
  ]
    .map(([label, value]) => `<div><span title="${e(label)}">${e(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function compactItem({ href, title, meta, status }) {
  return `<a class="item-row" href="${href}"><span><strong>${e(title)}</strong>${meta ? `<small>${e(meta)}</small>` : ""}</span>${badge(status)}</a>`;
}

export function renderOverview() {
  const total = state.totals?.contracts ?? state.contracts.length;
  document.getElementById("overviewSummary").textContent = [
    t("contractsCount").replace("{n}", total),
    state.settings?.profile?.company || "",
    state.settings?.generated_at ? `${t("generated")} ${datetime(state.settings.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const stageRows = STAGES.map((stage) => {
    const items = state.contracts.filter((item) => item.stage === stage);
    if (!items.length) return "";
    const names = items.map((item) => item.name).join(", ");
    return `<div class="pipeline-row"><span>${badge(stage)}</span><strong>${items.length}</strong><span title="${e(names)}">${e(names)}</span></div>`;
  }).join("");
  const renewalRows = state.contracts
    .filter((item) => item.notice_deadline)
    .map((item) =>
      compactItem({
        href: recordUrl(item.id, "renewals"),
        title: item.name,
        meta: `${t("notice")}: ${date(item.notice_deadline)}`,
        status: item.stage,
      }),
    )
    .join("");
  const riskRows = state.obligations
    .filter((item) => item.status === "at_risk" || item.status === "blocked")
    .map((item) =>
      compactItem({
        href: recordUrl(item.id, "obligations"),
        title: item.title,
        meta: [contractName(item.contract_id), date(item.due_date)].filter(Boolean).join(" · "),
        status: item.status,
      }),
    )
    .join("");
  const empty = `<div class="empty-inline">${t("empty")}</div>`;
  document.getElementById("overviewBody").innerHTML = `
    ${noticeBanner()}
    <div class="overview-grid">
      <section class="card overview-panel wide"><h2>${t("lifecycle")}</h2><div class="pipeline">${stageRows || empty}</div></section>
      <section class="card overview-panel"><h2>${t("upcoming")}</h2><div class="stack-list">${renewalRows || empty}</div></section>
      <section class="card overview-panel"><h2>${t("atRisk")}</h2><div class="stack-list">${riskRows || empty}</div></section>
    </div>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  contracts: "contractsHint",
  obligations: "obligationsHint",
  renewals: "renewalsHint",
  approvals: "approvalsHint",
};

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${e(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) => `<tr data-id="${e(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function matches(item, query, extra = []) {
  return [...Object.values(item), ...extra].some((value) =>
    typeof value === "string" ? value.toLowerCase().includes(query) : false,
  );
}

function filtered(view) {
  const query = state.route.query.trim().toLowerCase();
  let rows;
  if (view === "contracts") rows = state.contracts;
  else if (view === "obligations") rows = state.obligations;
  else if (view === "renewals") rows = state.contracts.filter((item) => item.renewal_date || item.notice_deadline);
  else {
    // The review inbox is worked top to bottom: undecided first.
    rows = [...state.approvals].sort(
      (a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review"),
    );
  }
  if (!query) return rows;
  return rows.filter((item) =>
    matches(item, query, [enumLabel(item.stage), enumLabel(item.status), item.contract_id ? contractName(item.contract_id) : ""]),
  );
}

function contractsTable(items) {
  return `
    <table class="ws-table clm-table contracts-table">
      ${tableHead([[t("contract")], [t("counterparty")], [t("type")], [t("stage")], [t("owner")], [t("value")], [t("notice")], [t("next")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${e(item.name)}</span>`, item.name)}
              ${cell(e(item.counterparty), item.counterparty)}
              ${cell(e(item.type), item.type)}
              ${cell(badge(item.stage))}
              ${cell(e(item.owner), item.owner)}
              ${cell(e(item.value), item.value)}
              ${cell(date(item.notice_deadline))}
              ${cell(e(item.next_action), item.next_action, "muted-cell")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function obligationAction(item, className = "button row-action") {
  return item.status === "done"
    ? `<button type="button" class="${className}" data-obligation-action="reopen" data-id="${e(item.id)}" ${disabled()}>${t("reopen")}</button>`
    : `<button type="button" class="${className}" data-obligation-action="done" data-id="${e(item.id)}" ${disabled()}>${t("markDone")}</button>`;
}

function obligationsTable(items, { withContract = true } = {}) {
  const now = state.settings?.generated_at;
  return `
    <table class="ws-table clm-table obligations-table">
      ${tableHead([
        [t("obligation")],
        ...(withContract ? [[t("contract")]] : []),
        [t("owner")],
        [t("due")],
        [t("status")],
        ...(withContract ? [[t("evidence")]] : []),
        ["", "action-col ws-split-keep"],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${e(item.title)}</span>`, item.title)}
              ${withContract ? cell(contractLink(item.contract_id), contractName(item.contract_id)) : ""}
              ${cell(e(item.owner), item.owner)}
              ${cell(date(item.due_date), "", isObligationDueSoon(item, now) ? "due-soon" : "")}
              ${cell(badge(item.status))}
              ${withContract ? cell(e(item.evidence), item.evidence, "muted-cell") : ""}
              ${cell(obligationAction(item), "", "action-col ws-split-keep")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function renewalState(item) {
  if (!item.notice_deadline) return "";
  return item.notice_acknowledged_at
    ? `<span class="badge active">${t("acknowledged")}</span>`
    : `<span class="badge needs_review">${t("pending")}</span>`;
}

function renewalsTable(items) {
  return `
    <table class="ws-table clm-table renewals-table">
      ${tableHead([[t("contract")], [t("notice")], [t("status"), "ws-split-keep"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${e(item.name)}</span>`, item.name)}
              ${cell(date(item.notice_deadline) || `<span class="muted-inline">${date(item.renewal_date)}</span>`)}
              ${cell(renewalState(item), "", "ws-split-keep")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function approvalsTable(items) {
  return `
    <table class="ws-table clm-table approvals-table">
      ${tableHead([[t("approvals")], [t("status")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${e(item.title)}</span>`, item.title)}
              ${cell(badge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count when available.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null ? String(current) : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <nav class="pager" aria-label="${e(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${summary}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>`;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  els.newContractBtn.hidden = view !== "contracts";
  const base = VIEW_BASE[view];
  const items = filtered(view);
  els.viewCount.textContent = `${items.length}${isPartial(base) ? "+" : ""}`;
  const table =
    view === "contracts"
      ? contractsTable(items)
      : view === "obligations"
        ? obligationsTable(items)
        : view === "renewals"
          ? renewalsTable(items)
          : approvalsTable(items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${state.route.selectedId ? "" : noticeBanner()}${items.length ? table : empty}${pagerControl(base)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split"
        ? `<div class="ws-detail-empty">${e(t(view === "renewals" ? "selectRenewal" : "selectApproval"))}</div>`
        : "";
    return;
  }
  if (view === "contracts" && selectedId === "new") {
    els.detailBody.innerHTML = `
      <header class="detail-head"><h2>${t("newContract")}</h2></header>
      ${noticeBanner()}
      <div class="form-page">${contractFormHtml()}</div>`;
    return;
  }
  const base = VIEW_BASE[view];
  const item = recordById(base, selectedId);
  if (!item) {
    const pending = state.extra[base]?.has(selectedId) && state.extra[base].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const html =
    view === "contracts"
      ? contractDetail(item)
      : view === "obligations"
        ? obligationDetail(item)
        : view === "renewals"
          ? renewalDetail(item)
          : approvalDetail(item);
  els.detailBody.innerHTML = `${noticeBanner()}${html}`;
}

export function contractFormHtml(item = {}) {
  const off = disabled();
  return `
    <form id="contractForm" class="contract-form" data-contract-id="${e(item.id || "")}">
      <label>${t("name")}<input name="name" required value="${e(item.name || "")}" ${off}></label>
      <label>${t("counterparty")}<input name="counterparty" value="${e(item.counterparty || "")}" ${off}></label>
      <label>${t("type")}<input name="type" value="${e(item.type || "")}" ${off}></label>
      <label>${t("stage")}<select name="stage" ${off}>${STAGES.map((stage) => `<option value="${stage}" ${item.stage === stage ? "selected" : ""}>${e(enumLabel(stage))}</option>`).join("")}</select></label>
      <label>${t("owner")}<input name="owner" value="${e(item.owner || "")}" ${off}></label>
      <label>${t("businessOwner")}<input name="business_owner" value="${e(item.business_owner || "")}" ${off}></label>
      <label>${t("value")}<input name="value" value="${e(item.value || "")}" ${off}></label>
      <label>${t("start")}<input name="start_date" type="date" value="${e(item.start_date || "")}" ${off}></label>
      <label>${t("end")}<input name="end_date" type="date" value="${e(item.end_date || "")}" ${off}></label>
      <label>${t("renewal")}<input name="renewal_date" type="date" value="${e(item.renewal_date || "")}" ${off}></label>
      <label>${t("notice")}<input name="notice_deadline" type="date" value="${e(item.notice_deadline || "")}" ${off}></label>
      <label>${t("next")}<textarea name="next_action" rows="3" ${off}>${e(item.next_action || "")}</textarea></label>
      <label>${t("riskLabel")}<select name="risk" ${off}>${RISK_LEVELS.map((risk) => `<option value="${risk}" ${item.risk === risk ? "selected" : ""}>${e(enumLabel(risk))}</option>`).join("")}</select></label>
      <div class="form-actions">
        <button type="submit" class="button primary" ${off}>${item.id ? t("update") : t("save")}</button>
      </div>
    </form>`;
}

export function readContractForm(form) {
  const data = new FormData(form);
  const text = (key, fallback = "") => String(data.get(key) || fallback);
  return {
    name: text("name"),
    counterparty: text("counterparty"),
    type: text("type"),
    stage: text("stage", "intake"),
    owner: text("owner"),
    business_owner: text("business_owner"),
    value: text("value"),
    start_date: text("start_date"),
    end_date: text("end_date"),
    renewal_date: text("renewal_date"),
    notice_deadline: text("notice_deadline"),
    next_action: text("next_action"),
    risk: text("risk", "low"),
  };
}

// The contract page: its next action, obligations and approvals on the left,
// the edit form (which already shows every field) on the right — so the
// fields are not printed a second time as a read-only list.
function contractDetail(item) {
  const own = state.obligations.filter((row) => row.contract_id === item.id);
  const approvals = state.approvals.filter((row) => row.contract_id === item.id);
  return `
    <header class="detail-head">
      <h2>${e(item.name)}</h2>
      <p class="detail-meta">${[e(item.counterparty), e(item.type), badge(item.stage), item.risk ? `${t("riskLabel")}: ${badge(item.risk)}` : ""].filter(Boolean).join(" · ")}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <section class="card detail-card"><h3>${t("next")}</h3><p>${e(item.next_action) || "—"}</p></section>
        <section class="card flush detail-card">
          <h3 class="card-title">${t("obligations")}${isPartial("obligations") ? ` <small class="muted-inline">${t("loadedScope").replace("{n}", state.obligations.length)}</small>` : ""}</h3>
          ${own.length ? obligationsTable(own, { withContract: false }) : `<div class="empty-inline padded">${t("noObligations")}</div>`}
        </section>
        ${
          approvals.length
            ? `<section class="card detail-card"><h3>${t("relatedApprovals")}</h3><div class="stack-list">${approvals
                .map((row) => compactItem({ href: recordUrl(row.id, "approvals"), title: row.title, meta: row.summary, status: row.status }))
                .join("")}</div></section>`
            : ""
        }
      </div>
      <aside class="card detail-side">
        <h3>${t("editContract")}</h3>
        ${contractFormHtml(item)}
      </aside>
    </section>`;
}

function obligationDetail(item) {
  const now = state.settings?.generated_at;
  return `
    <header class="detail-head">
      <h2>${e(item.title)}</h2>
      <p class="detail-meta">${[contractLink(item.contract_id), e(item.owner)].filter(Boolean).join(" · ")}</p>
    </header>
    <dl class="detail-fields">
      <dt>${t("status")}</dt><dd>${badge(item.status)}</dd>
      <dt>${t("due")}</dt><dd class="${isObligationDueSoon(item, now) ? "due-soon" : ""}">${date(item.due_date) || "—"}</dd>
      <dt>${t("owner")}</dt><dd>${e(item.owner) || "—"}</dd>
      <dt>${t("evidence")}</dt><dd>${e(item.evidence) || "—"}</dd>
    </dl>
    <div class="detail-actions">${obligationAction(item, "button primary")}</div>`;
}

function renewalDetail(item) {
  const action = !item.notice_deadline
    ? ""
    : item.notice_acknowledged_at
      ? `<span class="badge active">${t("acknowledged")}</span>`
      : `<button type="button" class="button primary" data-acknowledge-id="${e(item.id)}" ${disabled()}>${t("acknowledge")}</button>`;
  return `
    <header class="detail-head">
      <h2>${e(item.name)}</h2>
      <p class="detail-meta">${[e(item.counterparty), badge(item.stage)].filter(Boolean).join(" · ")}</p>
    </header>
    <dl class="detail-fields">
      <dt>${t("notice")}</dt><dd>${date(item.notice_deadline) || "—"}</dd>
      <dt>${t("renewal")}</dt><dd>${date(item.renewal_date) || "—"}</dd>
      <dt>${t("acknowledgedAt")}</dt><dd>${datetime(item.notice_acknowledged_at) || "—"}</dd>
      <dt>${t("owner")}</dt><dd>${e(item.owner) || "—"}</dd>
      <dt>${t("next")}</dt><dd>${e(item.next_action) || "—"}</dd>
    </dl>
    <div class="detail-actions">${action}<a class="button" href="${detailUrl(item.id, "contracts")}">${t("openContract")}</a></div>`;
}

function approvalDetail(item) {
  const decided = item.decided_at
    ? `<p class="last-decision"><span class="muted-inline">${t("lastDecision")}:</span> ${badge(item.status)} ${datetime(item.decided_at)}${item.decision_note ? ` — ${e(item.decision_note)}` : ""}</p>`
    : "";
  return `
    <article class="approval-detail" data-approval="${e(item.id)}">
      <header class="detail-head">
        <h2>${e(item.title)}</h2>
        <p class="detail-meta">${[badge(item.status), contractLink(item.contract_id)].filter(Boolean).join(" · ")}</p>
      </header>
      <p class="approval-summary">${e(item.summary)}</p>
      ${decided}
      <label class="field-label" for="note-${e(item.id)}">${t("decisionNote")}</label>
      <textarea id="note-${e(item.id)}" data-decision-note rows="3" placeholder="${e(t("decisionNotePlaceholder"))}" ${disabled()}></textarea>
      <div class="detail-actions">
        <button type="button" class="button primary" data-decision="approve" data-id="${e(item.id)}" ${disabled()}>${t("approve")}</button>
        <button type="button" class="button" data-decision="changes" data-id="${e(item.id)}" ${disabled()}>${t("changes")}</button>
        <button type="button" class="button danger" data-decision="block" data-id="${e(item.id)}" ${disabled()}>${t("block")}</button>
      </div>
    </article>`;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("settingsHint");
  document.getElementById("settingsBody").innerHTML = `
    <section class="settings card">
      <h2>${t("profile")}</h2>
      <dl>
        <dt>${t("appName")}</dt><dd>Busa CLM</dd>
        <dt>${t("source")}</dt><dd>${e(state.settings?.profile?.company || "") || "—"}</dd>
        <dt>${t("dataProvider")}</dt><dd>${e(state.settings?.data_provider || "")}</dd>
        <dt>${t("status")}</dt><dd>${state.settings?.demo ? t("demoMode") : t("localOnly")}</dd>
      </dl>
      <p>${e(state.settings?.profile?.boundary || "")}</p>
      <p class="muted">${t("generated")} ${datetime(state.settings?.generated_at)}</p>
    </section>`;
}
