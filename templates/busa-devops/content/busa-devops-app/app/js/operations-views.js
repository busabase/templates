import {
  actionById,
  actions,
  attentionCounts,
  DETAIL_MODES,
  date,
  dateTime,
  daysLeftBadge,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  events,
  filteredActions,
  filteredExpiries,
  filteredServices,
  filteredSpend,
  isPartial,
  loadState,
  metrics,
  money,
  notice,
  pageCount,
  pct,
  recordById,
  recordUrl,
  render,
  services,
  sparkline,
  spend,
  state,
  statusBadge,
  statusDot,
  t,
  typeBadge,
  viewLabel,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const latency = (service) => (service.status === "down" ? t("notAvailable") : `${Number(service.latency_ms || 0)} ms`);
const deltaClass = (value) => (Number(value) > 0 ? "negative" : "positive");
const productDelta = (row) =>
  Number(row.last_month) > 0 ? ((Number(row.mtd) - Number(row.last_month)) / Number(row.last_month)) * 100 : 0;

function actionLink(actionId) {
  const action = actionById(actionId);
  if (!action) return `<span class="muted">${t("notAvailable")}</span>`;
  return `<a class="badge action-link" href="${recordUrl(actionId, "actions")}">${t("actionRef")} #${action.ref} · ${escapeHtml(enumLabel(action.status))}</a>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries "need decision",
// "expiring ≤14d" and "services down"). Spend is summed from the provider
// rows, which is the whole Spend Providers Base (one row per billing source).
function metricsBand() {
  const m = metrics();
  const spendDelta =
    Number(m.spend_last_month) > 0
      ? ((Number(m.spend_mtd) - Number(m.spend_last_month)) / Number(m.spend_last_month)) * 100
      : 0;
  const servicesScope = isPartial("services") ? ` · ${t("loadedOnly")}` : "";
  return [
    [`${t("metricServicesUp")}${servicesScope}`, `${m.services_up || 0} / ${m.services_total || 0}`],
    [
      t("mtdSpend"),
      `${money(m.spend_mtd)} <small class="${deltaClass(spendDelta)}" title="${escapeHtml(`${t("lastMonth")} ${money(m.spend_last_month)}`)}">${escapeHtml(pct(spendDelta))}</small>`,
    ],
    [t("spendAnomalies"), String(m.spend_anomalies || 0)],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const generated =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("empty");
  document.getElementById("overviewSummary").textContent = generated;
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const needsDecision = actions().filter((item) => item.status === "needs_review");
  const expiring = filteredExpiries().filter((item) => Number(item.days_left) <= 14);
  const down = services().filter((item) => item.status !== "up");
  const checks = state.snapshot?.checks || {};
  const { review } = attentionCounts();
  const moreReview = review > needsDecision.length;
  document.getElementById("overviewBody").innerHTML = `
    ${notice()}
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        ${needsDecision
          .map(
            (item) => `
          <a class="attention-row" href="${recordUrl(item.action_id, "actions")}">
            <span><strong>${t("actionRef")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></span>
            ${typeBadge(item.type)}
          </a>
        `,
          )
          .join("")}
        ${moreReview ? `<a class="attention-more" href="#/actions">${t("moreInQueue")}</a>` : ""}
        ${expiring
          .map(
            (item) => `
          <a class="attention-row" href="${recordUrl(item.expiry_id, "expiries")}">
            <span><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.product)} · ${date(item.expires_on)}</small></span>
            ${daysLeftBadge(item.days_left)}
          </a>
        `,
          )
          .join("")}
        ${down
          .map(
            (item) => `
          <a class="attention-row" href="${recordUrl(item.service_id, "services")}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.url)}</small></span>
            ${statusBadge(item.status)}
          </a>
        `,
          )
          .join("")}
        ${!needsDecision.length && !expiring.length && !down.length ? `<div class="empty-inline">${t("allClear")}</div>` : ""}
      </div>
      <div class="card overview-panel">
        <h2>${t("recentEvents")}</h2>
        ${
          events()
            .slice(0, 8)
            .map(
              (event) => `
          <div class="event-row">
            <span class="event-meta">${statusDot(event.severity)}<small>${dateTime(event.at)}</small>${typeBadge(event.kind)}</span>
            <span class="event-message">${escapeHtml(event.message)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("checkFreshness")}</h2>
        <div class="freshness">
          <div class="freshness-item"><span>${t("serviceCheck")}</span><strong>${dateTime(checks.services_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("domainCheck")}</span><strong>${dateTime(checks.domains_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("spendIngest")}</span><strong>${dateTime(checks.spend_ingested_at)}</strong></div>
        </div>
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  services: "servicesHint",
  expiries: "expiriesHint",
  spend: "spendHint",
  actions: "actionsHint",
};

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function servicesTable(items) {
  return `
    <table class="ws-table ops-table services-table">
      ${tableHead([
        [t("service")],
        [t("status")],
        [t("product")],
        [t("url"), "ws-col-wide"],
        [t("latency"), "ws-col-num"],
        [t("uptime7d"), "ws-col-num"],
        [t("certDaysLeft")],
        [t("lastCheck")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.service_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.product), item.product)}
              ${cell(`<span class="mono muted">${escapeHtml(item.url)}</span>`, item.url)}
              ${cell(latency(item), "", "ws-col-num")}
              ${cell(`${Number(item.uptime_7d || 0).toFixed(2)}%`, "", "ws-col-num")}
              ${cell(item.ssl ? daysLeftBadge(item.ssl.days_left) : `<span class="muted">${t("notAvailable")}</span>`)}
              ${cell(`<span class="muted">${dateTime(item.last_check_at)}</span>`)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function expiriesTable(items) {
  return `
    <table class="ws-table ops-table expiries-table">
      ${tableHead([
        [t("item")],
        [t("daysLeft")],
        [t("type")],
        [t("product")],
        [t("expiresOn")],
        [t("autoRenew"), "ws-col-narrow"],
        [t("actions")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.expiry_id)}
              ${cell(`<span class="strong">${escapeHtml(item.item)}</span>`, item.item)}
              ${cell(daysLeftBadge(item.days_left))}
              ${cell(typeBadge(item.type))}
              ${cell(escapeHtml(item.product), item.product)}
              ${cell(date(item.expires_on))}
              ${cell(item.auto_renew ? "✓" : "—", "", "ws-col-narrow")}
              ${cell(item.action_id ? actionLink(item.action_id) : `<span class="muted">—</span>`)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function providersTable(items) {
  return `
    <table class="ws-table ops-table providers-table">
      ${tableHead([
        [t("provider")],
        [t("mtd"), "ws-col-num"],
        [t("lastMonth"), "ws-col-num"],
        [t("delta"), "ws-col-num"],
        [t("providerNote")],
        [t("actions")],
      ])}
      <tbody>
        ${items
          .map(
            (row) => `${rowOpen(row.provider_id)}
              ${cell(`<span class="strong">${escapeHtml(row.name)}</span>${row.anomaly ? ` <span class="days-badge crit">${t("anomaly")}</span>` : ""}`, row.name)}
              ${cell(money(row.mtd, row.currency), "", "ws-col-num")}
              ${cell(money(row.last_month, row.currency), "", "ws-col-num")}
              ${cell(`<span class="${deltaClass(row.delta_pct)}">${pct(row.delta_pct)}</span>`, "", "ws-col-num")}
              ${cell(`<span class="muted">${escapeHtml(row.note || "")}</span>`, row.note)}
              ${cell(row.action_id ? actionLink(row.action_id) : `<span class="muted">—</span>`)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Product rows carry nothing beyond these columns, so they do not open.
function productsTable(items) {
  return `
    <table class="ws-table ops-table products-table">
      ${tableHead([
        [t("product")],
        [t("mtd"), "ws-col-num"],
        [t("lastMonth"), "ws-col-num"],
        [t("delta"), "ws-col-num"],
        [t("share"), "ws-col-num"],
      ])}
      <tbody>
        ${items
          .map((row) => {
            const delta = productDelta(row);
            return `<tr class="static-row">
              ${cell(`<span class="strong">${escapeHtml(row.product)}</span>`, row.product)}
              ${cell(money(row.mtd, row.currency), "", "ws-col-num")}
              ${cell(money(row.last_month, row.currency), "", "ws-col-num")}
              ${cell(`<span class="${deltaClass(delta)}">${pct(delta)}</span>`, "", "ws-col-num")}
              ${cell(`${Number(row.share_pct || 0)}%`, "", "ws-col-num")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table ops-table actions-table">
      ${tableHead([[t("action")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const title = `#${item.ref} · ${item.title}`;
            return `${rowOpen(item.action_id)}
              ${cell(`<span class="queue-ref">#${item.ref}</span> <span class="strong">${escapeHtml(item.title)}</span>`, title)}
              ${cell(statusBadge(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count when known.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null
      ? `${current}`
      : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <nav class="pager" aria-label="${t("pagination")}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${summary}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

function spendTabs() {
  const data = spend();
  return [
    ["providers", t("providers"), data.providers.length],
    ["products", t("products"), data.products.length],
  ]
    .map(
      ([value, label, count]) =>
        `<button type="button" class="segment ${state.route.by === value ? "active" : ""}" data-by="${value}">${escapeHtml(label)} <b>${count}</b></button>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  els.viewFilters.hidden = view !== "spend";
  els.viewFilters.innerHTML = view === "spend" ? spendTabs() : "";
  let items;
  let table;
  let pagerKey = view;
  if (view === "services") {
    items = filteredServices();
    table = servicesTable(items);
  } else if (view === "expiries") {
    items = filteredExpiries();
    table = expiriesTable(items);
  } else if (view === "actions") {
    items = filteredActions();
    table = actionsTable(items);
  } else {
    const data = filteredSpend();
    items = state.route.by === "products" ? data.products : data.providers;
    table = state.route.by === "products" ? productsTable(items) : providersTable(items);
    pagerKey = "";
  }
  els.viewCount.textContent = `${items.length}${pagerKey && isPartial(pagerKey) ? "+" : ""}`;
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${notice()}${view === "actions" ? lockBanner() : ""}${items.length ? table : empty}${pagerKey ? pagerControl(pagerKey) : ""}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectAction"))}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "services"
      ? serviceDetail(item)
      : view === "expiries"
        ? expiryDetail(item)
        : view === "spend"
          ? providerDetail(item)
          : actionDetail(item);
}

const detailHead = (title, meta) => `
  <header class="detail-head">
    <h2>${escapeHtml(title)}</h2>
    ${meta ? `<p class="muted">${escapeHtml(meta)}</p>` : ""}
  </header>
`;

// Snapshot warnings raised about this one service (fleet-wide ones live on
// Overview, not repeated in every drawer).
function serviceWarnings(serviceId) {
  const items = (state.snapshot?.warnings || []).filter((item) => item.service_id === serviceId);
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) =>
        `<div class="${escapeHtml(item.severity || "warning")}"><strong>${escapeHtml(item.message)}</strong>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}

function serviceDetail(service) {
  const linkedAction = actions().find(
    (item) => item.target?.id === service.service_id || item.target?.service_id === service.service_id,
  );
  return `
    ${detailHead(service.name, [service.product, service.url].filter(Boolean).join(" · "))}
    <div class="detail detail-stack">
      ${service.warnings?.length ? `<div class="warnings">${service.warnings.map((message) => `<div class="warning"><strong>${escapeHtml(message)}</strong></div>`).join("")}</div>` : ""}
      ${serviceWarnings(service.service_id)}
      <dl class="detail-fields">
        <dt>${t("status")}</dt><dd>${statusBadge(service.status)}</dd>
        <dt>${t("latency")}</dt><dd class="num-inline">${latency(service)}</dd>
        <dt>${t("uptime7d")}</dt><dd class="num-inline">${Number(service.uptime_7d || 0).toFixed(2)}%</dd>
        <dt>${t("lastCheck")}</dt><dd>${dateTime(service.last_check_at)}</dd>
      </dl>
      <section>
        <h3>${t("checkHistory")}</h3>
        ${sparkline(service.history)}
        <div class="history-list">
          ${(service.history || [])
            .slice(-6)
            .reverse()
            .map(
              (entry) => `
            <div class="history-row">
              <span>${statusDot(entry.status)}${dateTime(entry.at)}</span>
              <span class="num-inline">${entry.status === "down" ? `HTTP ${escapeHtml(entry.http_status || "—")}` : `${Number(entry.latency_ms || 0)} ms`}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>
      ${
        linkedAction
          ? `
        <section>
          <h3>${t("actions")}</h3>
          <a class="attention-row" href="${recordUrl(linkedAction.action_id, "actions")}">
            <span><strong>${t("actionRef")} #${linkedAction.ref} · ${escapeHtml(linkedAction.title)}</strong><small>${escapeHtml(linkedAction.reason)}</small></span>
            ${statusBadge(linkedAction.status)}
          </a>
        </section>
      `
          : ""
      }
      <section>
        <h3>${t("cert")}</h3>
        <dl class="detail-fields">
          <dt>${t("issuer")}</dt><dd>${escapeHtml(service.ssl?.issuer || t("notAvailable"))}</dd>
          <dt>${t("expiresOn")}</dt><dd>${service.ssl?.valid_to ? date(service.ssl.valid_to) : t("notAvailable")}</dd>
          <dt>${t("daysLeft")}</dt><dd>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</dd>
        </dl>
      </section>
      <section>
        <h3>${t("metadata")}</h3>
        <dl class="detail-fields">
          <dt>HTTP</dt><dd>${escapeHtml(String(service.meta?.http_status ?? t("notAvailable")))}</dd>
          <dt>${t("server")}</dt><dd>${escapeHtml(service.meta?.server || t("notAvailable"))}</dd>
          ${service.meta?.note ? `<dt>${t("note")}</dt><dd>${escapeHtml(service.meta.note)}</dd>` : ""}
        </dl>
      </section>
    </div>
  `;
}

function expiryDetail(item) {
  return `
    ${detailHead(item.item, [enumLabel(item.type, "type"), item.product].filter(Boolean).join(" · "))}
    <div class="detail detail-stack">
      <dl class="detail-fields">
        <dt>${t("daysLeft")}</dt><dd>${daysLeftBadge(item.days_left)}</dd>
        <dt>${t("expiresOn")}</dt><dd>${date(item.expires_on)}</dd>
        <dt>${t("type")}</dt><dd>${typeBadge(item.type)}</dd>
        <dt>${t("autoRenew")}</dt><dd>${item.auto_renew ? "✓" : "—"}</dd>
        ${item.registrar ? `<dt>${t("registrar")}</dt><dd>${escapeHtml(item.registrar)}</dd>` : ""}
        ${item.source ? `<dt>${t("source")}</dt><dd>${escapeHtml(item.source)}</dd>` : ""}
        ${item.action_id ? `<dt>${t("actions")}</dt><dd>${actionLink(item.action_id)}</dd>` : ""}
      </dl>
      <section>
        <h3>${t("guidance")}</h3>
        <p class="guidance">${escapeHtml(item.detail || t("notAvailable"))}</p>
      </section>
    </div>
  `;
}

function providerDetail(row) {
  return `
    ${detailHead(row.name, row.anomaly ? t("anomaly") : "")}
    <div class="detail detail-stack">
      <dl class="detail-fields">
        <dt>${t("mtd")}</dt><dd class="num-inline">${money(row.mtd, row.currency)}</dd>
        <dt>${t("lastMonth")}</dt><dd class="num-inline">${money(row.last_month, row.currency)}</dd>
        <dt>${t("delta")}</dt><dd class="num-inline"><span class="${deltaClass(row.delta_pct)}">${pct(row.delta_pct)}</span></dd>
        <dt>${t("currency")}</dt><dd>${escapeHtml(row.currency || "USD")}</dd>
        ${row.action_id ? `<dt>${t("actions")}</dt><dd>${actionLink(row.action_id)}</dd>` : ""}
      </dl>
      ${row.note ? `<section><h3>${t("providerNote")}</h3><p class="guidance">${escapeHtml(row.note)}</p></section>` : ""}
    </div>
  `;
}

function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

const VERDICT_LABEL = { approve: "approved", block: "blocked", note: "note", request_changes: "changes_requested" };

// A target is the agent's pointer at what the action changes. A service
// target links to that service; the rest are plain labelled values.
function targetFields(target) {
  const entries = Object.entries(target || {});
  if (!entries.length) return `<dd>${t("notAvailable")}</dd>`;
  return entries
    .map(([key, value]) => {
      const text = String(value);
      const service = (key === "id" && target.kind === "service") || key === "service_id" ? recordById("services", text) : null;
      const valueHtml = service
        ? `<a href="${recordUrl(service.service_id, "services")}">${escapeHtml(service.name)}</a>`
        : key === "kind"
          ? escapeHtml(enumLabel(text, "targetKind"))
          : `<span class="mono">${escapeHtml(text)}</span>`;
      return `<dt>${escapeHtml(enumLabel(key, "targetKey"))}</dt><dd>${valueHtml}</dd>`;
    })
    .join("");
}

function actionDetail(action) {
  const locked = Boolean(state.settings?.lock) || action.status === "done";
  const disabled = locked ? "disabled" : "";
  const id = escapeHtml(action.action_id);
  return `
    <article class="action-detail">
      <header class="queue-head">
        <span class="queue-ref">${t("actionRef")} #${action.ref}</span>
        ${typeBadge(action.type)}
        ${statusBadge(action.status)}
      </header>
      <h2 class="queue-subject">${escapeHtml(action.title)}</h2>
      <div class="detail detail-stack">
        <section>
          <h3>${t("reason")}</h3>
          <p class="guidance">${escapeHtml(action.reason)}</p>
        </section>
        <section>
          <h3>${t("evidence")}</h3>
          <ul class="evidence-list">
            ${(action.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </section>
        <section>
          <h3>${t("plan")}</h3>
          <ol class="plan-list">
            ${(action.plan || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ol>
        </section>
        <section>
          <h3>${t("target")}</h3>
          <dl class="detail-fields">${targetFields(action.target)}</dl>
        </section>
        ${
          action.decision
            ? `<p class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(VERDICT_LABEL[action.decision.verdict] || "changes_requested"))} · ${dateTime(action.decision.decided_at)}</p>`
            : ""
        }
        <section>
          <label class="queue-label" for="action-note">${t("note")}</label>
          <textarea id="action-note" rows="3" placeholder="${escapeHtml(t("notePlaceholder"))}" ${disabled}>${escapeHtml(action.note || "")}</textarea>
          ${notice()}
          <div class="decision-actions">
            <button type="button" class="primary" data-action="${id}" data-verdict="approve" ${disabled} title="${t("approve")}">${t("approve")}</button>
            <button type="button" data-action="${id}" data-verdict="request_changes" ${disabled} title="${t("requestChanges")}">${t("requestChanges")}</button>
            <button type="button" class="danger" data-action="${id}" data-verdict="block" ${disabled} title="${t("block")}">${t("block")}</button>
            <button type="button" data-action="${id}" data-verdict="note" ${disabled} title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
        </section>
      </div>
    </article>
  `;
}

export async function submitDecision(actionId, verdict) {
  const note = els.detailBody.querySelector("#action-note")?.value || "";
  if (state.settings?.demo) {
    const action = actionById(actionId);
    if (action) {
      if (verdict !== "note") {
        action.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      action.note = note;
      action.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideAction({ action_id: actionId, verdict, note });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  await loadState();
  // Without write access the verdict is a ChangeRequest, and the action card
  // keeps its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("decisionSaved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const thresholds = summary.thresholds || {};
  document.getElementById("settingsBody").innerHTML = `
    ${notice()}
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd class="mono">${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("thresholds")}</h2>
        <dl>
          <dt>${t("expiryWarningDays")}</dt><dd>${escapeHtml(thresholds.expiry_warning_days ?? "")}</dd>
          <dt>${t("expiryCriticalDays")}</dt><dd>${escapeHtml(thresholds.expiry_critical_days ?? "")}</dd>
          <dt>${t("degradedLatency")}</dt><dd>${escapeHtml(thresholds.degraded_latency_ms ?? "")} ms</dd>
          <dt>${t("spendAnomalyPct")}</dt><dd>${escapeHtml(thresholds.spend_anomaly_pct ?? "")}%</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("services")}</h2>
        ${
          (summary.services || [])
            .map(
              (service) => `
          <div class="settings-row">
            <strong>${escapeHtml(service.name)}</strong>
            <span>${escapeHtml(service.product || "")}</span>
            <span class="mono muted">${escapeHtml(service.url || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("domains")}</h2>
        ${
          (summary.domains || [])
            .map(
              (domain) => `
          <div class="settings-row">
            <strong>${escapeHtml(domain.domain)}</strong>
            <span>${escapeHtml(domain.registrar || "")}</span>
            <span>${t("autoRenew")}: ${domain.auto_renew ? "✓" : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("keyRotation")}</h2>
        ${
          (summary.key_rotation || [])
            .map(
              (key) => `
          <div class="settings-row">
            <strong>${escapeHtml(key.name)}</strong>
            <span class="mono muted">${escapeHtml(key.env || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

