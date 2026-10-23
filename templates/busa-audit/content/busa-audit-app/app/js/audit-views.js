import {
  ANOMALY_FILTERS,
  anomalies,
  anomalyBadges,
  anomalyById,
  DETAIL_MODES,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredAnomalies,
  filteredInvoices,
  filteredOrders,
  invoiceById,
  isPartial,
  loadState,
  money,
  n,
  noticeBanner,
  orderById,
  pageCount,
  paymentById,
  pct,
  recordById,
  recordUrl,
  render,
  ruleBadge,
  severityBadge,
  state,
  statusBadge,
  t,
  warningsPanel,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const muted = (text = "—") => `<span class="muted">${escapeHtml(text)}</span>`;

/* ---------- Overview ---------- */

const AGING_COLORS = ["#dbe3ee", "#f3dfa8", "#f4c48c", "#eb9d80", "#d97b6c"];

function bucketLabel(bucket) {
  if (bucket === "current") return enumLabel("current");
  return `${bucket} ${t("days")}`;
}

function agingBar() {
  const buckets = state.snapshot?.metrics?.aging || [];
  const total = buckets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (!total) return `<div class="empty-inline">${t("empty")}</div>`;
  let x = 0;
  const segments = buckets
    .map((bucket, index) => {
      const width = (Number(bucket.amount || 0) / total) * 100;
      const rect =
        width > 0
          ? `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(width, 0.4).toFixed(2)}" height="8" fill="${AGING_COLORS[index % AGING_COLORS.length]}"><title>${escapeHtml(bucketLabel(bucket.bucket))}: ${money(bucket.amount)}</title></rect>`
          : "";
      x += width;
      return rect;
    })
    .join("");
  const legend = buckets
    .map(
      (bucket, index) => `
    <span><i class="dot" style="background:${AGING_COLORS[index % AGING_COLORS.length]}"></i>${escapeHtml(bucketLabel(bucket.bucket))} <strong>${money(bucket.amount)}</strong></span>
  `,
    )
    .join("");
  return `
    <div class="aging">
      <svg class="aging-svg" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t("agingTitle"))}">${segments}</svg>
      <div class="aging-legend">${legend}</div>
    </div>
  `;
}

// Three numbers nowhere else on screen: the decision count is in the sidebar's
// attention block and the per-Base totals sit next to the nav items. These are
// computed from the loaded pages (they need FX conversion and per-row status,
// which no server aggregate in the pinned SDK answers) and say so whenever a
// Base holds more rows than are loaded.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const scopeOf = (keys) => (keys.some((key) => isPartial(key)) ? ` · ${t("loadedScope")}` : "");
  return [
    [t("atStakeOpen") + scopeOf(["anomalies"]), money(metrics.at_stake_total), "negative"],
    [t("overdueReceivablesTitle") + scopeOf(["invoices", "payments"]), money(metrics.overdue_receivable_total), "negative"],
    [
      t("matchedPct") + scopeOf(["payments", "invoices"]),
      `${pct(metrics.matched_pct)} <small>${n(metrics.matched_payment_count)} / ${n(metrics.payment_count)}</small>`,
      "",
    ],
  ]
    .map(
      ([label, value, tone]) =>
        `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong class="${tone}">${value}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const snapshot = state.snapshot || {};
  const generated = snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleString() : "";
  const company = state.settings?.config_summary?.company?.name || snapshot.company?.name || "";
  document.getElementById("overviewSummary").textContent = [
    company,
    `${n(snapshot.metrics?.payment_count)} ${t("payments").toLowerCase()} ${t("imported")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const queue = anomalies()
    .filter((item) => item.status !== "done")
    .slice(0, 5);
  const importLog = snapshot.import_log || [];
  document.getElementById("overviewBody").innerHTML = `
    ${noticeBanner()}
    ${warningsPanel()}
    <section class="overview-grid">
      <div class="card overview-panel overview-wide">
        <h2>${t("agingTitle")}</h2>
        ${agingBar()}
      </div>
      <div class="card overview-panel">
        <div class="row between">
          <h2>${t("reviewQueue")}</h2>
          <a class="muted" href="#/anomalies">${t("viewAll")} →</a>
        </div>
        ${
          queue
            .map(
              (item) => `
          <a class="health-row" href="${recordUrl(item.id, "anomalies")}">
            <span><strong>${t("anomaly")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.rule, "rule"))}${item.customer ? ` · ${escapeHtml(item.customer)}` : ""}</small></span>
            <span class="num">${money(item.amount_at_stake, item.currency)}</span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noAnomalies")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("importLog")}</h2>
        ${
          importLog
            .slice(0, 5)
            .map(
              (entry) => `
          <div class="import-row">
            <span>
              <strong>${escapeHtml(entry.imported_at ? new Date(entry.imported_at).toLocaleString() : "—")}</strong>
              <small>${escapeHtml(
                Object.values(entry.files || {})
                  .filter(Boolean)
                  .join(" · "),
              )}</small>
              ${(entry.warnings || []).map((warning) => `<small class="import-warning">${escapeHtml(warning)}</small>`).join("")}
            </span>
            <span class="num" title="${escapeHtml(`${t("orders")} / ${t("invoices")} / ${t("payments")}`)}">+${n(entry.added?.orders || 0)} / +${n(entry.added?.invoices || 0)} / +${n(entry.added?.payments || 0)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noImports")}</div>`
        }
      </div>
    </section>
  `;
}

/* ---------- Record views ---------- */

const VIEW_HINT = { orders: "ordersHint", invoices: "invoicesHint", anomalies: "anomaliesHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function ordersTable(items) {
  return `
    <table class="ws-table audit-table orders-table">
      ${tableHead([
        [t("orderNo")],
        [t("customer")],
        [t("date")],
        [t("amount"), "ws-col-num"],
        [t("currency")],
        [t("invoiceStatus")],
        [t("paymentStatus")],
        [t("linkedAnomaly")],
      ])}
      <tbody>
        ${items
          .map(
            (order) => `${rowOpen(order.order_id)}
              ${cell(`<span class="strong">${escapeHtml(order.order_no)}</span>`, order.order_no)}
              ${cell(escapeHtml(order.customer), order.customer)}
              ${cell(date(order.order_date))}
              ${cell(money(order.amount, order.currency), "", "ws-col-num")}
              ${cell(escapeHtml(order.currency))}
              ${cell(statusBadge(order.invoice_status))}
              ${cell(statusBadge(order.payment_status))}
              ${cell(anomalyBadges(order.anomaly_ids))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function invoicesTable(items) {
  return `
    <table class="ws-table audit-table invoices-table">
      ${tableHead([
        [t("invoiceNo")],
        [t("orderRef")],
        [t("customer")],
        [t("issueDate")],
        [t("dueDate")],
        [t("amount"), "ws-col-num"],
        [t("paid"), "ws-col-num"],
        [t("daysOverdue"), "ws-col-num"],
        [t("status")],
      ])}
      <tbody>
        ${items
          .map(
            (invoice) => `${rowOpen(invoice.invoice_id)}
              ${cell(`<span class="strong">${escapeHtml(invoice.invoice_no)}</span>`, invoice.invoice_no)}
              ${cell(invoice.order_id ? `<a href="${detailUrl(invoice.order_id, "orders")}">${escapeHtml(invoice.order_no)}</a>` : muted())}
              ${cell(escapeHtml(invoice.customer), invoice.customer)}
              ${cell(date(invoice.issue_date))}
              ${cell(invoice.due_date ? date(invoice.due_date) : muted())}
              ${cell(money(invoice.amount, invoice.currency), "", "ws-col-num")}
              ${cell(money(invoice.paid_amount, invoice.currency), "", "ws-col-num")}
              ${cell(invoice.days_overdue ? `<span class="negative">${n(invoice.days_overdue)}</span>` : "0", "", "ws-col-num")}
              ${cell(statusBadge(invoice.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// The split queue only has room for what decides the next pick: the anomaly,
// what is at stake, and where it stands.
function anomaliesTable(items) {
  return `
    <table class="ws-table audit-table anomalies-table">
      ${tableHead([[t("anomaly")], [t("atStakeShort"), "ws-col-num ws-split-keep"], [t("status"), "ws-split-keep"]])}
      <tbody>
        ${items
          .map((item) => {
            const label = `#${item.ref} · ${item.title}`;
            return `${rowOpen(item.id)}
              ${cell(`<span class="queue-ref">#${escapeHtml(item.ref)}</span> <span class="strong">${escapeHtml(item.title)}</span>`, label)}
              ${cell(money(item.amount_at_stake, item.currency), "", "ws-col-num ws-split-keep")}
              ${cell(statusBadge(item.status), "", "ws-split-keep")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the page total comes from records.count when known.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  return `
    <nav class="pager" aria-label="${escapeHtml(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>`}
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

function statusCount(status) {
  const all = anomalies();
  return status === "all" ? all.length : all.filter((item) => item.status === status).length;
}

function renderAnomalyFilters() {
  const label = (status) => (status === "all" ? t("all") : enumLabel(status));
  els.viewFilters.innerHTML = ANOMALY_FILTERS.map(
    (status) =>
      `<button type="button" class="segment ${state.route.status === status ? "active" : ""}" data-status="${status}">${escapeHtml(label(status))} <b>${statusCount(status)}</b></button>`,
  ).join("");
  els.statusSelect.innerHTML = ANOMALY_FILTERS.map(
    (status) =>
      `<option value="${status}"${state.route.status === status ? " selected" : ""}>${escapeHtml(label(status))} (${statusCount(status)})</option>`,
  ).join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "orders" ? filteredOrders() : view === "invoices" ? filteredInvoices() : filteredAnomalies();
  els.viewCount.textContent = `${n(items.length)}${isPartial(view) ? "+" : ""}`;
  const anomaliesView = view === "anomalies";
  els.viewFilters.hidden = !anomaliesView;
  els.statusSelect.hidden = !anomaliesView;
  if (anomaliesView) renderAnomalyFilters();

  if (view === "orders") items.sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)));
  if (view === "invoices") items.sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)));
  const table = view === "orders" ? ordersTable(items) : view === "invoices" ? invoicesTable(items) : anomaliesTable(items);
  const empty = anomaliesView
    ? emptyState(t("noAnomalies"))
    : emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(view)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectAnomaly"))}</div>` : "";
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
    view === "orders" ? orderDetail(item) : view === "invoices" ? invoiceDetail(item) : anomalyDetail(item);
}

function relatedAnomalies(ids) {
  const list = (ids || []).map((id) => anomalyById(id)).filter(Boolean);
  if (!list.length) return "";
  return `
    <div class="card overview-panel">
      <h3>${t("anomalies")}</h3>
      ${list
        .map(
          (anomaly) => `
        <a class="health-row" href="${recordUrl(anomaly.id, "anomalies")}">
          <span><strong>${t("anomaly")} #${anomaly.ref} · ${escapeHtml(anomaly.title)}</strong><small>${escapeHtml(enumLabel(anomaly.rule, "rule"))}</small></span>
          <span class="num">${money(anomaly.amount_at_stake, anomaly.currency)}</span>
          ${statusBadge(anomaly.status)}
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function chainRow(tone, title, detail, amountHtml, badgeHtml) {
  return `
    <div class="chain-row ${tone}">
      <span class="chain-dot" aria-hidden="true"></span>
      <span><strong>${title}</strong><small>${detail}</small></span>
      <span class="num">${amountHtml}</span>
      ${badgeHtml}
    </div>
  `;
}

function invoiceTone(status) {
  if (status === "paid" || status === "credit_note") return "ok";
  if (status === "overdue") return "bad";
  return "warn";
}

function orderDetail(order) {
  const linkedInvoices = (order.invoice_ids || []).map((id) => invoiceById(id)).filter(Boolean);
  const chainRows = [
    chainRow(
      "ok",
      `${escapeHtml(t("orderNo"))} ${escapeHtml(order.order_no)}`,
      `${escapeHtml(order.customer)} · ${date(order.order_date)}`,
      money(order.amount, order.currency),
      statusBadge(order.invoice_status),
    ),
  ];
  if (!linkedInvoices.length) {
    chainRows.push(chainRow("bad", escapeHtml(t("invoiceNo")), escapeHtml(t("none")), "—", statusBadge("missing")));
  }
  for (const invoice of linkedInvoices) {
    chainRows.push(
      chainRow(
        invoiceTone(invoice.status),
        `<a href="${recordUrl(invoice.invoice_id, "invoices")}">${escapeHtml(t("invoiceNo"))} ${escapeHtml(invoice.invoice_no)}</a>`,
        `${date(invoice.issue_date)} → ${date(invoice.due_date)}${invoice.days_overdue ? ` · ${invoice.days_overdue} ${t("days")} ${enumLabel("overdue")}` : ""}`,
        money(invoice.amount, invoice.currency),
        statusBadge(invoice.status),
      ),
    );
    for (const paymentId of invoice.payment_ids || []) {
      const payment = paymentById(paymentId);
      if (!payment) continue;
      chainRows.push(
        chainRow(
          "ok",
          `${escapeHtml(t("payments"))} ${escapeHtml(payment.payment_ref)}`,
          `${escapeHtml(enumLabel(payment.method, "method"))} · ${date(payment.paid_date)}`,
          money(payment.amount, payment.currency),
          statusBadge(payment.match_status),
        ),
      );
    }
    if (!(invoice.payment_ids || []).length && invoice.status !== "credit_note") {
      chainRows.push(
        chainRow(
          invoice.days_overdue ? "bad" : "warn",
          escapeHtml(t("payments")),
          escapeHtml(t("none")),
          money(0, invoice.currency),
          statusBadge("unpaid"),
        ),
      );
    }
  }
  return `
    <header class="detail-head">
      <h2>${escapeHtml(order.order_no)}</h2>
      <p class="muted">${escapeHtml([order.customer, date(order.order_date), money(order.amount, order.currency)].filter(Boolean).join(" · "))}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="card overview-panel">
          <h3>${t("documentChain")}</h3>
          <div class="chain">${chainRows.join("")}</div>
        </div>
        ${relatedAnomalies(order.anomaly_ids)}
      </div>
      <aside class="card detail-side">
        <dl>
          <dt>${t("customer")}</dt><dd>${escapeHtml(order.customer)}</dd>
          <dt>${t("date")}</dt><dd>${date(order.order_date)}</dd>
          <dt>${t("amount")}</dt><dd>${money(order.amount, order.currency)}</dd>
          <dt>${t("invoiceStatus")}</dt><dd>${statusBadge(order.invoice_status)}</dd>
          <dt>${t("paymentStatus")}</dt><dd>${statusBadge(order.payment_status)}</dd>
          <dt>${t("files")}</dt><dd>${escapeHtml(order.source_file || "") || "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function invoiceDetail(invoice) {
  const linkedPayments = (invoice.payment_ids || []).map((id) => paymentById(id)).filter(Boolean);
  const order = invoice.order_id ? orderById(invoice.order_id) : null;
  const orderDelta = order ? Number(invoice.amount || 0) - Number(order.amount || 0) : 0;
  const orderRef = invoice.order_id
    ? `<a href="${detailUrl(invoice.order_id, "orders")}">${escapeHtml(invoice.order_no || t("notLoaded"))}</a>`
    : escapeHtml(t("none"));
  return `
    <header class="detail-head">
      <h2>${escapeHtml(invoice.invoice_no)}</h2>
      <p class="muted">${escapeHtml(invoice.customer)} · ${escapeHtml(enumLabel(invoice.status))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("amount")}</dt><dd class="num-left">${money(invoice.amount, invoice.currency)}</dd>
        <dt>${t("paid")}</dt><dd class="num-left">${money(invoice.paid_amount, invoice.currency)}</dd>
        <dt>${t("outstanding")}</dt><dd class="num-left ${Number(invoice.outstanding) > 0 ? "negative" : "positive"}">${money(invoice.outstanding, invoice.currency)}</dd>
        <dt>${t("daysOverdue")}</dt><dd class="${invoice.days_overdue ? "negative" : ""}">${n(invoice.days_overdue)} ${t("days")}</dd>
        <dt>${t("orderRef")}</dt><dd>${orderRef}</dd>
        ${order ? `<dt>${t("orderDelta")}</dt><dd class="num-left ${orderDelta ? "negative" : ""}">${money(orderDelta, invoice.currency)}</dd>` : ""}
        <dt>${t("issueDate")}</dt><dd>${date(invoice.issue_date)}</dd>
        <dt>${t("dueDate")}</dt><dd>${invoice.due_date ? date(invoice.due_date) : escapeHtml(t("none"))}</dd>
        <dt>${t("status")}</dt><dd>${statusBadge(invoice.status)}</dd>
      </dl>
      <section>
        <h3>${t("matchedPayments")}</h3>
        ${
          linkedPayments.length
            ? linkedPayments
                .map(
                  (payment) => `
          <div class="health-row">
            <span><strong>${escapeHtml(payment.payment_ref)}</strong><small>${escapeHtml([payment.payer, enumLabel(payment.method, "method"), date(payment.paid_date)].filter(Boolean).join(" · "))}</small></span>
            <span class="num">${money(payment.amount, payment.currency)}</span>
            ${statusBadge(payment.match_status)}
          </div>
        `,
                )
                .join("")
            : `<div class="empty-inline">${t("none")}</div>`
        }
      </section>
      ${relatedAnomalies(invoice.anomaly_ids)}
      ${invoice.notes ? `<section><h3>${t("notes")}</h3><p class="agent-notes">${escapeHtml(invoice.notes)}</p></section>` : ""}
    </div>
  `;
}

function evidencePanel(evidence) {
  if (!evidence || !(evidence.rows || []).length) return "";
  const rows = evidence.rows
    .map(
      (row) => `
    <div class="evidence-row">
      <span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail || "")}</small></span>
      <span class="num">${money(row.amount, row.currency)}</span>
    </div>
  `,
    )
    .join("");
  return `
    <div>
      <div class="opp-label">${t("evidence")}</div>
      <div class="evidence">
        ${rows}
        ${evidence.computed ? `<div class="evidence-computed">${escapeHtml(evidence.computed)}</div>` : ""}
      </div>
    </div>
  `;
}

function decisionStatus(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "dismiss") return "done";
  return "needs_review";
}

function anomalyDetail(item) {
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  const id = escapeHtml(item.id);
  return `
    <article class="anomaly-detail" data-anomaly-id="${id}">
      <header class="opp-head">
        <span class="opp-ref">${t("anomaly")} #${escapeHtml(item.ref)}</span>
        ${ruleBadge(item.rule)}
        ${severityBadge(item.severity)}
        ${statusBadge(item.status)}
        ${item.customer ? `<span class="muted opp-customer">${escapeHtml(item.customer)}</span>` : ""}
      </header>
      <h2 class="anomaly-title">${escapeHtml(item.title)}</h2>
      <div class="opp-stake">${money(item.amount_at_stake, item.currency)} <span class="muted">${t("atStake")}</span></div>
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      ${evidencePanel(item.evidence)}
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      ${item.proposed_action ? `<div class="opp-label">${t("proposedAction")}: <span class="badge">${escapeHtml(enumLabel(item.proposed_action, "operation"))}</span></div>` : ""}
      ${
        item.decision
          ? `
        <div class="opp-decision">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(decisionStatus(item.decision.action)))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        item.execution
          ? `
        <div class="opp-execution">
          <strong>${t("execution")}: ${escapeHtml(enumLabel(item.execution.operation, "operation"))} · ${escapeHtml(enumLabel(item.execution.status))}</strong>
          ${item.execution.detail ? `<span>${escapeHtml(item.execution.detail)}</span>` : ""}
        </div>
      `
          : ""
      }
      ${locked ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
      <label class="opp-label" for="draft-${id}">${t("draft")}</label>
      <textarea id="draft-${id}" class="opp-draft" rows="8" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
      <label class="opp-label" for="note-${id}">${t("reviewNote")}</label>
      <textarea id="note-${id}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      ${noticeBanner()}
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
      <div class="opp-actions">
        <button type="button" class="primary" data-decision="approve" data-id="${id}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${id}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${id}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${id}" title="${t("block")}" ${disabled}>${t("block")}</button>
        <button type="button" data-decision="dismiss" data-id="${id}" title="${t("dismiss")}" ${disabled}>${t("dismiss")}</button>
      </div>
    </article>
  `;
}

export async function submitDecision(id, action) {
  const note = document.querySelector(`#note-${cssEscape(id)}`)?.value || "";
  const draft = document.querySelector(`#draft-${cssEscape(id)}`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = { action, note, draft: draft ?? null, decided_at: new Date().toISOString() };
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideAnomaly({ anomaly_id: id, action, note, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : t("decisionFailed");
    render();
    return;
  }
  await loadState();
  // Without write access the decision is a ChangeRequest, and the anomaly keeps
  // its old status until someone who has it approves: say so instead of nothing.
  if (result?.pending) {
    state.notice = t("savedForReview");
    render();
  }
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/* ---------- Settings ---------- */

export function renderSettings() {
  document.getElementById("settingsTitle").title = t("busabaseBacked");
  const summary = state.settings?.config_summary || {};
  const rules = summary.rules || {};
  const importCfg = summary.import || {};
  const tableRow = (name, table) => `
    <div class="settings-account">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml((table?.format || "csv").toUpperCase())}</span>
      <span>${escapeHtml(
        Object.entries(table?.columns || {})
          .map(([key, value]) => `${key}←${value}`)
          .join(", ") || t("setupNeeded"),
      )}</span>
    </div>
  `;
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(summary.company?.name || "") || t("setupNeeded")}</dd>
          <dt>${t("contactEmail")}</dt><dd>${escapeHtml(summary.company?.contact_email || "") || "—"}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("rules")}</h2>
        <dl>
          <dt>${t("daysToInvoice")}</dt><dd>${escapeHtml(String(rules.days_to_invoice ?? 14))} ${t("days")}</dd>
          <dt>${t("tolerance")}</dt><dd>${escapeHtml(String(rules.amount_tolerance_pct ?? 1))}%</dd>
          <dt>${t("agingTitle")}</dt><dd>${escapeHtml((rules.aging_buckets || []).join(" / "))} ${t("days")}</dd>
          <dt>${t("duplicateWindow")}</dt><dd>${escapeHtml(String(rules.duplicate_window_days ?? 7))} ${t("days")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("importSources")}</h2>
        ${tableRow(t("orders"), importCfg.orders)}
        ${tableRow(t("invoices"), importCfg.invoices)}
        ${tableRow(t("payments"), importCfg.payments)}
      </section>
    </div>
  `;
}
