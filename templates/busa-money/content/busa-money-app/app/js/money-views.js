import {
  accountName,
  accounts,
  DETAIL_MODES,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredAccounts,
  filteredInvoices,
  filteredTransactions,
  invoiceNeedsReview,
  invoiceNumber,
  invoiceStates,
  invoiceStatusKey,
  invoices,
  isPartial,
  matchForInvoice,
  matchForTransaction,
  money,
  recordById,
  recordUrl,
  reviewInvoices,
  state,
  t,
  totalLabel,
  transactions,
  VIEW_BASE,
} from "../app.js";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const signed = (value, currency) =>
  `<span class="${Number(value) < 0 ? "negative" : "positive"}">${money(value, currency)}</span>`;

const STATUS_TONE = {
  ok: "positive",
  active: "positive",
  posted: "positive",
  paid: "positive",
  matched: "positive",
  auto_accepted: "positive",
  human_approved: "positive",
  warning: "warning",
  pending: "warning",
  open: "warning",
  needs_review: "warning",
  amount_mismatch: "warning",
  date_mismatch: "warning",
  suggested: "warning",
  error: "danger",
  missing: "danger",
  rejected: "danger",
};

export function badge(value, group = "status", label = "") {
  if (!value) return "";
  const tone = STATUS_TONE[value] || "";
  return `<span class="badge${tone ? ` ${tone}` : ""}">${escapeHtml(label || enumLabel(value, group))}</span>`;
}

// The match cell for an invoice or transaction: matched / exception / missing,
// or a muted "not loaded" when the match page did not cover it.
function matchBadge(match) {
  if (match === undefined) return `<span class="muted">${t("notLoaded")}</span>`;
  if (!match) return badge("missing");
  return badge(match.status);
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner" role="alert">${escapeHtml(state.notice)}</div>`;
}

function sideErrorBanner() {
  const errors = state.settings?.side_errors || {};
  const parts = [];
  if (errors["invoice-matches"]) parts.push(t("matchesUnavailable"));
  if (errors.settings) parts.push(t("settingsUnavailable"));
  return parts.length ? `<div class="notice-banner">${escapeHtml(parts.join(" "))}</div>` : "";
}

function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !accountId || !item.account_id || item.account_id === accountId,
  );
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="warning-item ${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not already show. Each account row carries its
// provider-side totals, so the sum is whole once every account is loaded; the
// label says so when it is not.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const scope = isPartial("accounts") ? ` · ${t("loadedAccounts").replace("{n}", accounts().length)}` : "";
  return [
    [t("grossIn"), money(metrics.gross_inflow)],
    [t("grossOut"), money(metrics.gross_outflow)],
    [t("net"), money(metrics.net), Number(metrics.net) < 0 ? "negative" : ""],
  ]
    .map(
      ([label, value, tone = ""]) =>
        `<div><span>${escapeHtml(label + scope)}</span><strong${tone ? ` class="${tone}"` : ""}>${value}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  const generated = state.snapshot?.generated_at ? date(state.snapshot.generated_at, true) : "";
  document.getElementById("overviewSummary").textContent = [
    `${t("fees")} ${money(metrics.fees)}`,
    `${totalLabel("accounts", accounts().length)} ${t("accountsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const recent = transactions()
    .slice()
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, 6);
  const exceptions = reviewInvoices().slice(0, 6);
  const matchedCount = invoices().filter((invoice) => invoiceStatusKey(invoice) === "matched").length;
  const invoicedTotal = invoices().reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const invoiceLine = t("invoiceSummary")
    .replace("{matched}", matchedCount)
    .replace("{total}", `${invoices().length}${isPartial("invoices") ? "+" : ""}`)
    .replace("{amount}", money(invoicedTotal));

  document.getElementById("overviewBody").innerHTML = `
    ${noticeBanner()}
    ${sideErrorBanner()}
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("accountHealth")}</h2>
        ${
          accounts()
            .map(
              (account) => `
          <a class="overview-row" href="${recordUrl(account.account_id, "accounts")}">
            <span><strong>${escapeHtml(account.display_name || t("notLoaded"))}</strong><small>${escapeHtml(account.provider)} · ${escapeHtml(account.currency)}</small></span>
            <span class="num">${money(account.balance?.current, account.currency)}</span>
            ${badge(account.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("recentMoneyMovement")}</h2>
        ${
          recent
            .map(
              (tx) => `
          <a class="overview-row" href="${recordUrl(tx.transaction_id, "ledger")}">
            <span><strong>${escapeHtml(tx.description)}</strong><small>${escapeHtml(tx.counterparty || tx.provider)} · ${date(tx.occurred_at)}</small></span>
            <span class="num">${signed(tx.net, tx.currency)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <div class="panel-head">
          <h2>${t("invoiceExceptions")}</h2>
          <a href="#/invoices?status=review">${escapeHtml(invoiceLine)}</a>
        </div>
        ${
          exceptions
            .map((invoice) => {
              const match = matchForInvoice(invoice.invoice_id);
              return `
          <a class="overview-row" href="${recordUrl(invoice.invoice_id, "invoices")}">
            <span><strong>${escapeHtml(invoice.invoice_number)}</strong><small>${escapeHtml(invoice.vendor || invoice.customer || "")} · ${date(invoice.issue_date)}</small></span>
            <span class="num">${money(invoice.total, invoice.currency)}</span>
            ${matchBadge(match)}
          </a>
        `;
            })
            .join("") || `<div class="empty-inline">${t("noExceptions")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { ledger: "ledgerHint", accounts: "accountsHint", invoices: "invoicesHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id, attr = "data-id") =>
  `<tr ${attr}="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function transactionInvoiceCell(tx) {
  const match = matchForTransaction(tx.transaction_id);
  if (!match) return matchBadge(match);
  const number = invoiceNumber(match.invoice_id);
  return `<a class="badge ${STATUS_TONE[match.status] || ""}" href="${recordUrl(match.invoice_id, "invoices")}" title="${escapeHtml(enumLabel(match.status))}">${escapeHtml(number)}</a>`;
}

// Ledger columns. `rowAttr` lets the account page reuse it with links into the
// ledger drawer instead of the list's own row selection.
function ledgerTable(items, { rowAttr = "data-id", hrefFor = null, showAccount = true } = {}) {
  return `
    <table class="ws-table money-table ledger-table">
      ${tableHead([
        [t("description")],
        [t("date"), "col-date"],
        [t("counterparty")],
        ...(showAccount ? [[t("account")]] : []),
        [t("status"), "col-status"],
        [t("invoice"), "col-match"],
        [t("net"), "ws-col-num col-money ws-split-keep"],
      ])}
      <tbody>
        ${items
          .map((tx) => {
            const account = accountName(tx.account_id);
            return `${hrefFor ? rowOpen(hrefFor(tx), "data-href") : rowOpen(tx.transaction_id, rowAttr)}
              ${cell(`<span class="strong">${escapeHtml(tx.description)}</span>`, tx.description)}
              ${cell(date(tx.occurred_at))}
              ${cell(escapeHtml(tx.counterparty || ""), tx.counterparty)}
              ${showAccount ? cell(`<a href="${recordUrl(tx.account_id, "accounts")}">${escapeHtml(account)}</a>`, account) : ""}
              ${cell(badge(tx.status))}
              ${cell(transactionInvoiceCell(tx))}
              ${cell(signed(tx.net, tx.currency), "", "ws-col-num ws-split-keep")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function accountsTable(items) {
  return `
    <table class="ws-table money-table accounts-table">
      ${tableHead([
        [t("account")],
        [t("provider"), "ws-col-narrow"],
        [t("entity")],
        [t("status"), "col-status"],
        [t("current"), "ws-col-num col-money ws-split-keep"],
        [t("grossIn"), "ws-col-num col-money"],
        [t("grossOut"), "ws-col-num col-money"],
        [t("net"), "ws-col-num col-money"],
        [t("lastSync"), "col-date"],
      ])}
      <tbody>
        ${items
          .map(
            (account) => `${rowOpen(account.account_id)}
              ${cell(`<span class="strong">${escapeHtml(account.display_name || t("notLoaded"))}</span>`, account.display_name)}
              ${cell(escapeHtml(account.provider), "", "ws-col-narrow")}
              ${cell(escapeHtml(account.entity || ""), account.entity)}
              ${cell(badge(account.status))}
              ${cell(money(account.balance?.current, account.currency), "", "ws-col-num ws-split-keep")}
              ${cell(money(account.totals?.gross_inflow, account.currency), "", "ws-col-num")}
              ${cell(money(account.totals?.gross_outflow, account.currency), "", "ws-col-num")}
              ${cell(signed(account.totals?.net, account.currency), "", "ws-col-num")}
              ${cell(date(account.last_sync_at))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// The split queue shows the first two columns plus the amount; the rest of the
// invoice lives in the record beside it (and in the full page).
function invoicesTable(items) {
  return `
    <table class="ws-table money-table invoices-table">
      ${tableHead([
        [t("invoice")],
        [t("match"), "col-match"],
        [t("amount"), "ws-col-num col-money ws-split-keep"],
        [t("vendorCustomer")],
        [t("issueDate"), "col-date"],
        [t("dueDate"), "col-date"],
        [t("status"), "col-status"],
      ])}
      <tbody>
        ${items
          .map((invoice) => {
            const party = invoice.vendor || invoice.customer || "";
            return `${rowOpen(invoice.invoice_id)}
              ${cell(`<span class="strong">${escapeHtml(invoice.invoice_number)}</span>${party ? `<span class="row-sub">${escapeHtml(party)}</span>` : ""}`, [invoice.invoice_number, party].filter(Boolean).join(" · "))}
              ${cell(matchBadge(matchForInvoice(invoice.invoice_id)))}
              ${cell(money(invoice.total, invoice.currency), "", "ws-col-num ws-split-keep")}
              ${cell(escapeHtml(party), party)}
              ${cell(date(invoice.issue_date))}
              ${cell(date(invoice.due_date))}
              ${cell(badge(invoice.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Load more appends one page per click; a drawer/split beside the list stays
// valid because nothing it shows is paged away.
function loadMoreControl(key) {
  if (!isPartial(key)) return "";
  const loading = Boolean(state.loadingMore[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-load-more="${key}" ${loading ? "disabled" : ""}>${loading ? t("loadingMore") : t("loadMore")}</button>
    </div>
  `;
}

function invoiceStateCount(value) {
  if (value === "all") return invoices().length;
  if (value === "review") return reviewInvoices().length;
  return invoices().filter((invoice) => invoiceStatusKey(invoice) === "matched").length;
}

const invoiceStateLabel = (value) =>
  value === "all" ? t("all") : value === "review" ? t("needsReviewFilter") : t("matchedFilter");

export function renderRecordView() {
  const { view } = state.route;
  const key = VIEW_BASE[view];
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "ledger" ? filteredTransactions() : view === "accounts" ? filteredAccounts() : filteredInvoices();
  els.viewCount.textContent = `${items.length}${isPartial(key) ? "+" : ""}`;

  const showFilters = view === "invoices";
  els.viewFilters.hidden = !showFilters;
  els.statusSelect.hidden = !showFilters;
  els.viewFilters.innerHTML = showFilters
    ? invoiceStates()
        .map(
          (value) =>
            `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(invoiceStateLabel(value))} <b>${invoiceStateCount(value)}</b></button>`,
        )
        .join("")
    : "";
  els.statusSelect.innerHTML = showFilters
    ? invoiceStates()
        .map(
          (value) =>
            `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(invoiceStateLabel(value))} (${invoiceStateCount(value)})</option>`,
        )
        .join("")
    : "";

  const table = view === "ledger" ? ledgerTable(items) : view === "accounts" ? accountsTable(items) : invoicesTable(items);
  const empty = emptyState(
    state.route.query || state.route.status !== "all" ? t("noMatches") : view === "invoices" ? t("noInvoices") : t("empty"),
  );
  els.listPanel.innerHTML = `${noticeBanner()}${items.length ? table : empty}${loadMoreControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const key = VIEW_BASE[view];
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectInvoice")) : "";
    return;
  }
  const item = recordById(key, selectedId);
  if (!item) {
    const pending = state.extra[key]?.has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "ledger" ? transactionDetail(item) : view === "accounts" ? accountDetail(item) : invoiceDetail(item);
}

const fact = (label, value) => `<dt>${escapeHtml(label)}</dt><dd>${value || `<span class="muted">—</span>`}</dd>`;

function transactionDetail(tx) {
  const match = matchForTransaction(tx.transaction_id);
  const account = accountName(tx.account_id);
  return `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(tx.description)}</h2>
        <p>${escapeHtml([tx.counterparty, date(tx.occurred_at)].filter(Boolean).join(" · "))}</p>
      </div>
      <strong class="detail-amount">${signed(tx.net, tx.currency)}</strong>
    </div>
    <div class="detail-stack">
      <section>
        <h3>${t("amounts")}</h3>
        <dl>
          ${fact(t("gross"), money(tx.gross, tx.currency))}
          ${fact(t("fee"), money(tx.fee, tx.currency))}
          ${fact(t("net"), signed(tx.net, tx.currency))}
          ${fact(t("currency"), escapeHtml(tx.currency))}
          ${fact(t("direction"), escapeHtml(enumLabel(tx.direction, "direction")))}
        </dl>
      </section>
      <section>
        <h3>${t("transaction")}</h3>
        <dl>
          ${fact(t("account"), `<a href="${recordUrl(tx.account_id, "accounts")}">${escapeHtml(account)}</a>`)}
          ${fact(t("provider"), escapeHtml(tx.provider))}
          ${fact(t("type"), escapeHtml(enumLabel(tx.type, "type")))}
          ${fact(t("status"), badge(tx.status))}
          ${fact(t("date"), escapeHtml(date(tx.occurred_at, true)))}
          ${fact(t("availableAt"), escapeHtml(date(tx.available_at, true)))}
          ${fact(t("providerTxId"), escapeHtml(tx.provider_transaction_id))}
          ${fact(t("tags"), escapeHtml((tx.tags || []).join(", ")))}
          ${tx.source_url ? fact(t("source"), `<a href="${escapeHtml(tx.source_url)}" target="_blank" rel="noreferrer">${t("openSource")}</a>`) : ""}
        </dl>
      </section>
      <section>
        <h3>${t("invoiceMatching")}</h3>
        <dl>
          ${fact(t("matchStatus"), matchBadge(match))}
          ${match ? fact(t("invoice"), `<a href="${recordUrl(match.invoice_id, "invoices")}">${escapeHtml(invoiceNumber(match.invoice_id))}</a>`) : ""}
          ${match ? fact(t("confidence"), `${Math.round(Number(match.confidence || 0) * 100)}%`) : ""}
        </dl>
      </section>
    </div>
  `;
}

function accountDetail(account) {
  const ledger = filteredTransactions(account.account_id);
  const scope = isPartial("transactions") ? t("loadedLedgerOnly") : "";
  return `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(account.display_name || t("notLoaded"))}</h2>
        <p>${escapeHtml([account.provider, account.entity, account.currency].filter(Boolean).join(" · "))}</p>
      </div>
      ${badge(account.status)}
    </div>
    ${warnings(account.account_id)}
    <div class="detail-stack detail-columns">
      <section>
        <h3>${t("balance")}</h3>
        <dl>
          ${fact(t("current"), money(account.balance?.current, account.currency))}
          ${fact(t("available"), money(account.balance?.available, account.currency))}
          ${fact(t("pending"), money(account.balance?.pending, account.currency))}
          ${fact(t("balanceAsOf"), escapeHtml(date(account.balance?.as_of, true)))}
        </dl>
      </section>
      <section>
        <h3>${t("totals")}</h3>
        <dl>
          ${fact(t("grossIn"), money(account.totals?.gross_inflow, account.currency))}
          ${fact(t("grossOut"), money(account.totals?.gross_outflow, account.currency))}
          ${fact(t("fees"), money(account.totals?.fees, account.currency))}
          ${fact(t("net"), signed(account.totals?.net, account.currency))}
        </dl>
      </section>
      <section>
        <h3>${t("sync")}</h3>
        <dl>
          ${fact(t("provider"), escapeHtml(account.provider))}
          ${fact(t("providerAccountId"), escapeHtml(account.provider_account_id))}
          ${fact(t("lastSync"), escapeHtml(date(account.last_sync_at, true)))}
          ${account.notes ? fact(t("notes"), escapeHtml(account.notes)) : ""}
        </dl>
      </section>
    </div>
    <section class="detail-section">
      <div class="panel-head">
        <h3>${t("accountTransactions")}</h3>
        ${scope ? `<span class="muted">${escapeHtml(scope)}</span>` : ""}
      </div>
      ${
        ledger.length
          ? `<div class="detail-table">${ledgerTable(ledger, { hrefFor: (tx) => recordUrl(tx.transaction_id, "ledger"), showAccount: false })}</div>`
          : `<div class="empty-inline">${t("noAccountTransactions")}</div>`
      }
    </section>
  `;
}

function invoiceDetail(invoice) {
  const match = matchForInvoice(invoice.invoice_id);
  const tx = match?.transaction_id ? recordById("transactions", match.transaction_id) : null;
  const party = invoice.vendor || invoice.customer || "";
  const needsReview = invoiceNeedsReview(invoice);
  return `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(invoice.invoice_number)}</h2>
        <p>${escapeHtml([party, enumLabel(invoice.direction), date(invoice.issue_date)].filter(Boolean).join(" · "))}</p>
      </div>
      <strong class="detail-amount">${money(invoice.total, invoice.currency)}</strong>
    </div>
    ${
      match?.notes?.length
        ? `<div class="warnings">${match.notes.map((note) => `<div class="warning-item ${needsReview ? "warning" : "info"}"><strong>${escapeHtml(note)}</strong></div>`).join("")}</div>`
        : ""
    }
    <div class="detail-stack">
      <section>
        <h3>${t("matchStatus")}</h3>
        <dl>
          ${fact(t("match"), matchBadge(match))}
          ${match ? fact(t("confidence"), `${Math.round(Number(match.confidence || 0) * 100)}%`) : ""}
          ${match ? fact(t("amountDelta"), signed(match.amount_delta || 0, invoice.currency)) : ""}
          ${match ? fact(t("dateDelta"), `${match.date_delta_days || 0} ${t("days")}`) : ""}
          ${match ? fact(t("tolerance"), `${money(match.amount_tolerance || 0, invoice.currency)} / ${match.date_tolerance_days || 0} ${t("days")}`) : ""}
          ${match ? fact(t("method"), escapeHtml(enumLabel(match.matching_method))) : ""}
          ${match?.matching_rule ? fact(t("rule"), escapeHtml(enumLabel(match.matching_rule, "rule"))) : ""}
          ${match ? fact(t("review"), badge(match.review_status)) : ""}
        </dl>
      </section>
      <section>
        <h3>${t("transaction")}</h3>
        ${
          tx
            ? `<dl>
          ${fact(t("description"), `<a href="${recordUrl(tx.transaction_id, "ledger")}">${escapeHtml(tx.description)}</a>`)}
          ${fact(t("date"), escapeHtml(date(tx.occurred_at)))}
          ${fact(t("account"), escapeHtml(accountName(tx.account_id)))}
          ${fact(t("gross"), money(tx.gross, tx.currency))}
          ${fact(t("net"), signed(tx.net, tx.currency))}
        </dl>`
            : `<p class="muted">${match?.transaction_id ? t("transactionNotLoaded") : t("noMatchingTransaction")}</p>`
        }
      </section>
      <section>
        <h3>${t("invoiceDetail")}</h3>
        <dl>
          ${fact(t("vendorCustomer"), escapeHtml(party))}
          ${fact(t("direction"), escapeHtml(enumLabel(invoice.direction)))}
          ${fact(t("status"), badge(invoice.status))}
          ${fact(t("issueDate"), escapeHtml(date(invoice.issue_date)))}
          ${fact(t("dueDate"), escapeHtml(date(invoice.due_date)))}
          ${fact(t("subtotal"), money(invoice.subtotal, invoice.currency))}
          ${fact(t("tax"), money(invoice.tax, invoice.currency))}
          ${fact(t("total"), money(invoice.total, invoice.currency))}
          ${fact(t("source"), escapeHtml(invoice.source))}
          ${invoice.notes ? fact(t("notes"), escapeHtml(invoice.notes)) : ""}
        </dl>
      </section>
      ${
        match?.audit_events?.length
          ? `<section>
        <h3>${t("matchAuditTrail")}</h3>
        ${match.audit_events
          .map(
            (event) => `
          <div class="audit-row">
            <strong>${escapeHtml(enumLabel(event.event || ""))}</strong>
            <span>${escapeHtml([event.actor, date(event.at, true)].filter(Boolean).join(" · "))}</span>
            ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
          </div>
        `,
          )
          .join("")}
      </section>`
          : ""
      }
    </div>
  `;
}

// ── Settings ───────────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const container = document.getElementById("settingsContent");
  const accent = container.querySelector("[data-accent-settings]");
  container.innerHTML = `
    ${sideErrorBanner()}
    <section class="card settings-card">
      <h2>${t("configuration")}</h2>
      <p class="muted">${t("localFilesOnly")}</p>
      <dl>
        ${fact(t("provider"), escapeHtml(state.settings?.demo ? t("demoData") : t("liveData")))}
        ${fact(t("configPath"), escapeHtml(summary.config_path || ""))}
        ${fact(t("onboarding"), state.settings?.onboarding?.completed ? t("completed") : t("incomplete"))}
      </dl>
    </section>
    <section class="card settings-card">
      <h2>${t("accounts")}</h2>
      ${
        (summary.accounts || [])
          .map(
            (account) => `
        <div class="settings-account">
          <strong>${escapeHtml(account.display_name || account.provider)}</strong>
          <span>${escapeHtml([account.provider, account.currency].filter(Boolean).join(" · "))}</span>
          ${account.secrets_ready ? badge("ok", "status", t("secretsReady")) : badge("warning", "status", t("missingSecrets"))}
        </div>
      `,
          )
          .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
      }
    </section>
  `;
  // accent-theme.js mounts its picker here; keep it across re-renders.
  if (accent) container.append(accent);
}
