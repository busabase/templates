// Page renderers. Overview owns the hero and the ≤3-number band; every record
// view is one toolbar row over a full-bleed `.ws-table`, with its record shown
// in the mode config.js `ui.detail_modes` declares for that view.
import {
  allLedgerEntries,
  beneficiaries,
  byCategory,
  categoryLabel,
  DETAIL_MODES,
  detailUrl,
  els,
  escapeHtml,
  expenseRows,
  families,
  familyName,
  filteredFamilies,
  fund,
  hasData,
  ledgerEntries,
  money,
  months,
  pagination,
  pct,
  signedPct,
  state,
  t,
  totals,
  viewLabel,
} from "../app.js";
import { messages } from "../i18n/messages.js";

// Chart series hues. The dominant first slice follows the ink token (legible in
// both schemes); the rest are a fixed categorical palette (not tokens) because
// each slice must stay distinguishable from its neighbours in both schemes.
const DONUT_COLORS = ["var(--ink-soft)", "#0d9488", "#2563eb", "#9333ea", "#d97706", "#dc2626", "#65a30d", "#0891b2"];
const FAIRNESS_ALERT_PCT = 20;

const lang = () => (document.documentElement.lang.startsWith("zh") ? "zh" : "en");

function emptyRow(colspan, text = t("empty")) {
  return `<tr class="empty-row"><td colspan="${colspan}">${escapeHtml(text)}</td></tr>`;
}

function deviationClass(value) {
  const dev = Number(value) || 0;
  if (Math.abs(dev) >= FAIRNESS_ALERT_PCT) return "negative";
  return dev >= 0 ? "positive" : "muted-num";
}

function isPartialData() {
  return ["income", "expenses", "families"].some((key) => pagination.isPartial(key));
}

// ── Overview ─────────────────────────────────────────────────────────────────
function effectiveMonth() {
  const keys = months().map((m) => m.month);
  return keys.includes(state.month) ? state.month : keys[keys.length - 1] || "";
}

function syncOverviewMonth() {
  const keys = months().map((m) => m.month);
  els.overviewMonth.hidden = !keys.length;
  els.overviewMonth.innerHTML = keys
    .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
    .join("");
  els.overviewMonth.value = effectiveMonth();
}

function donut(rows, labelFn, valueFn) {
  const data = rows.map((row) => ({ row, value: Number(valueFn(row)) || 0 })).filter((item) => item.value > 0);
  const sum = data.reduce((acc, item) => acc + item.value, 0);
  if (!data.length || sum <= 0) return `<div class="empty-inline">${t("empty")}</div>`;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data
    .map((item, index) => {
      const dash = (item.value / sum) * circumference;
      const seg = `<circle r="${radius}" cx="80" cy="80" fill="none" stroke="${DONUT_COLORS[index % DONUT_COLORS.length]}" stroke-width="28" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"></circle>`;
      offset += dash;
      return seg;
    })
    .join("");
  const legend = data
    .map(
      (item, index) => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${DONUT_COLORS[index % DONUT_COLORS.length]}"></span>
        <span>${escapeHtml(labelFn(item.row))}</span>
        <span class="legend-value">${pct((item.value / sum) * 100)}</span>
      </div>`,
    )
    .join("");
  return `
    <div class="alloc-panel">
      <svg class="donut" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(t("headlineAllocation"))}">
        ${segments}
        <circle r="46" cx="80" cy="80" fill="var(--surface)"></circle>
      </svg>
      <div class="legend">${legend}</div>
    </div>`;
}

function balanceTrend() {
  const rows = months();
  if (!rows.length) return `<div class="empty-inline">${t("empty")}</div>`;
  const max = Math.max(...rows.map((row) => Number(row.balance_end) || 0), 1);
  return `
    <div class="alloc-list">
      ${rows
        .map(
          (row) => `
        <div class="alloc-row">
          <span class="alloc-label">${escapeHtml(row.month)}</span>
          <span class="alloc-track"><span class="alloc-fill" style="width:${Math.max(((Number(row.balance_end) || 0) / max) * 100, 2)}%"></span></span>
          <span class="alloc-value">${money(row.balance_end)} · <span class="${(row.net || 0) < 0 ? "negative" : "positive"}">${money(row.net)}</span></span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function insightText(insight) {
  const templates = messages[lang()]?.insightTemplates || messages.en.insightTemplates || {};
  const template = templates[insight.code] || messages.en.insightTemplates?.[insight.code] || insight.code;
  const params = insight.params || {};
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    let value = params[key];
    if (value === undefined || value === null) return "";
    if (key === "amount") value = money(value);
    else if (key === "delta") {
      const n = Number(value) || 0;
      value = `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
    } else if (key === "pct") value = (Number(value) || 0).toFixed(1);
    return escapeHtml(String(value));
  });
}

function severityLabel(severity) {
  if (severity === "high") return t("sevHigh");
  if (severity === "watch") return t("sevWatch");
  return t("sevInfo");
}

function insightsPanel() {
  const items = state.snapshot?.insights || [];
  const body = items.length
    ? items
        .map(
          (insight) => `
      <div class="insight-row">
        <span class="badge sev-${escapeHtml(insight.severity || "info")}">${escapeHtml(severityLabel(insight.severity))}</span>
        <span class="insight-text">${insightText(insight)}</span>
      </div>`,
        )
        .join("")
    : `<div class="muted">${t("noFlags")}</div>`;
  return `
    <section class="overview-panel wide">
      <h2 title="${escapeHtml(t("insightsNote"))}">${t("insights")}</h2>
      <div class="insight-list">${body}</div>
    </section>`;
}

export function renderOverview() {
  els.overviewTitle.textContent = t("overview");
  const keys = months().map((m) => m.month);
  const summary = hasData()
    ? `${fund().name || t("fund")} · ${t("statsAsOf")} ${keys[keys.length - 1] || ""}`
    : t("needsEntry");
  els.overviewSummary.textContent = isPartialData() ? `${summary} · ${t("partialNote")}` : summary;
  syncOverviewMonth();
  // The balance is the sidebar's headline and the family/entry counts sit next
  // to it, so the band carries only the chosen month's flow.
  const row = months().find((m) => m.month === effectiveMonth()) || {};
  const net = row.net || 0;
  els.overviewMetrics.innerHTML = `
    <div><span>${t("monthIncome")}</span><strong>${money(row.income_total)}</strong></div>
    <div><span>${t("monthExpense")}</span><strong>${money(row.expense_total)}</strong></div>
    <div><span>${t("monthNet")}</span><strong class="${net < 0 ? "negative" : "positive"}">${money(net)}</strong></div>`;
  els.overviewBody.innerHTML = `
    <div class="overview-grid">
      <section class="overview-panel">
        <h2><a href="#/category">${t("headlineAllocation")}</a></h2>
        ${donut(
          byCategory(),
          (r) => categoryLabel(r.category),
          (r) => r.amount,
        )}
      </section>
      <section class="overview-panel">
        <h2><a href="#/ledger">${t("balanceTrend")}</a></h2>
        ${balanceTrend()}
      </section>
      ${insightsPanel()}
    </div>`;
}

// ── Record views ─────────────────────────────────────────────────────────────
function entryTypeBadge(entry) {
  if (entry.kind === "income") return `<span class="badge sev-info">${t("income")}</span>`;
  return `<span class="badge">${escapeHtml(categoryLabel(entry.category))}</span>`;
}

function directedTo(entry) {
  if (entry.kind === "income") return t("fundPool");
  if (entry.category === "care") return t("care");
  if (entry.shared) return t("sharedTag");
  if (entry.family_id) return familyName(entry.family_id);
  return "";
}

function signedAmount(entry) {
  return `${entry.kind === "income" ? "+" : "-"}${money(entry.amount)}`;
}

const ledgerHref = (id) => `#/ledger?month=all&peek=${encodeURIComponent(id)}`;

function ledgerList() {
  const entries = ledgerEntries();
  const rows = entries.length
    ? entries
        .map(
          (entry) => `
      <tr data-id="${escapeHtml(entry.id)}" class="${entry.id === state.route.selectedId ? "ws-selected" : ""}">
        <td class="strong">${escapeHtml(entry.label || entry.occasion)}</td>
        <td class="ws-col-narrow">${escapeHtml(entry.date)}</td>
        <td>${entryTypeBadge(entry)}</td>
        <td class="ws-col-wide">${escapeHtml(entry.occasion)}</td>
        <td>${escapeHtml(directedTo(entry))}</td>
        <td class="ws-col-num ws-split-keep ${entry.kind === "income" ? "positive" : ""}">${signedAmount(entry)}</td>
      </tr>`,
        )
        .join("")
    : emptyRow(6);
  return {
    count: entries.length,
    html: `
    <table class="ws-table ledger-table">
      <thead><tr>
        <th>${t("payee")}</th><th class="ws-col-narrow">${t("date")}</th><th>${t("type")}</th>
        <th class="ws-col-wide">${t("occasion")}</th><th>${t("directedTo")}</th><th class="ws-col-num ws-split-keep">${t("amount")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${pagination.control("expenses")}`,
  };
}

function ledgerDetail(id) {
  const entry = allLedgerEntries().find((item) => item.id === id);
  if (!entry) return { html: `<div class="ws-detail-empty">${t("notOnPage")}</div>` };
  const numFamilies = families().length || 1;
  const facts = [
    [t("date"), entry.date],
    [t("month"), entry.month],
    [t("type"), entry.kind === "income" ? t("income") : categoryLabel(entry.category)],
    [entry.kind === "income" ? t("beneficiary") : t("payee"), entry.label],
    [t("occasion"), entry.occasion],
    [t("directedTo"), directedTo(entry)],
    [t("amount"), signedAmount(entry)],
  ];
  if (entry.kind === "expense" && entry.shared) {
    facts.push([t("sharedShare"), `${money(entry.amount / numFamilies)} (${money(entry.amount)} ÷ ${numFamilies})`]);
  }
  if (entry.note) facts.push([t("note"), entry.note]);
  return {
    html: `
    <header class="detail-head">
      <h2>${escapeHtml(entry.label || entry.occasion)}</h2>
      <p>${entryTypeBadge(entry)} <span class="muted">${escapeHtml(entry.date)}</span></p>
    </header>
    <dl class="facts">${facts
      .filter(([, value]) => value !== "" && value != null)
      .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
      .join("")}</dl>`,
  };
}

function familyList() {
  const rows = filteredFamilies();
  const maxBenefit = Math.max(...rows.map((row) => row.benefit_total || 0), 1);
  const body = rows.length
    ? rows
        .map((row) => {
          const family = families().find((f) => f.id === row.family_id) || {};
          return `
      <tr data-id="${escapeHtml(row.family_id)}">
        <td class="strong">${escapeHtml(row.name)}</td>
        <td>${escapeHtml(family.head || "")}</td>
        <td class="ws-col-narrow num">${escapeHtml(String(family.members_count || 0))}</td>
        <td class="ws-col-num">${money(row.benefit_total)}</td>
        <td class="ws-col-num">${pct(row.share_pct)}</td>
        <td class="ws-col-num ws-split-keep ${deviationClass(row.deviation_pct)}">${signedPct(row.deviation_pct)}</td>
        <td class="ws-col-wide"><span class="bar-track"><span class="bar-fill" style="width:${Math.max(((row.benefit_total || 0) / maxBenefit) * 100, 2)}%"></span></span></td>
      </tr>`;
        })
        .join("")
    : emptyRow(7);
  return {
    count: rows.length,
    html: `
    <table class="ws-table family-table">
      <thead><tr>
        <th>${t("colFamily")}</th><th>${t("head")}</th><th class="ws-col-narrow num">${t("members")}</th>
        <th class="ws-col-num">${t("benefit")}</th><th class="ws-col-num">${t("sharePct")}</th>
        <th class="ws-col-num ws-split-keep">${t("deviation")}</th><th class="ws-col-wide" aria-label="${escapeHtml(t("benefit"))}"></th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <td>${t("avgBenefit")}</td><td></td><td class="ws-col-narrow"></td>
        <td class="ws-col-num">${money(totals().avg_family_benefit)}</td><td class="ws-col-num"></td>
        <td class="ws-col-num ws-split-keep"></td><td class="ws-col-wide"></td>
      </tr></tfoot>
    </table>
    ${pagination.control("families")}`,
  };
}

function expenseTable(rows, shared, numFamilies) {
  const body = rows.length
    ? rows
        .map(
          (row) => `
      <tr data-href="${escapeHtml(ledgerHref(row.id))}">
        <td class="strong">${escapeHtml(row.occasion || row.payee || "")}</td>
        <td class="ws-col-narrow">${escapeHtml(row.date || row.month)}</td>
        <td><span class="badge">${escapeHtml(categoryLabel(row.category))}</span></td>
        ${shared ? `<td class="ws-col-num">${money(row.amount)} ÷ ${numFamilies}</td>` : ""}
        <td class="ws-col-num ws-split-keep">${money(shared ? (row.amount || 0) / numFamilies : row.amount)}</td>
      </tr>`,
        )
        .join("")
    : emptyRow(shared ? 5 : 4);
  return `
    <table class="ws-table detail-table">
      <thead><tr>
        <th>${t("occasion")}</th><th class="ws-col-narrow">${t("date")}</th><th>${t("type")}</th>
        ${shared ? `<th class="ws-col-num">${t("total")}</th>` : ""}
        <th class="ws-col-num ws-split-keep">${shared ? t("sharedShare") : t("amount")}</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function familyDetail(id) {
  const family = families().find((f) => f.id === id);
  if (!family) return { html: `<div class="ws-detail-empty">${t("notOnPage")}</div>` };
  const roll = state.snapshot?.by_family?.find((row) => row.family_id === family.id) || {};
  const numFamilies = families().length || 1;
  const directed = expenseRows().filter((row) => row.category !== "care" && !row.shared && row.family_id === family.id);
  const shared = expenseRows().filter((row) => row.category !== "care" && row.shared);
  return {
    html: `
    <header class="detail-head">
      <h2>${escapeHtml(family.name)}</h2>
      <p class="muted">${escapeHtml(family.head || "")}${family.members_count ? ` · ${t("members")} ${escapeHtml(String(family.members_count))}` : ""}</p>
    </header>
    <dl class="facts facts-inline">
      <div><dt>${t("benefit")}</dt><dd>${money(roll.benefit_total)}</dd></div>
      <div><dt>${t("sharePct")}</dt><dd>${pct(roll.share_pct)}</dd></div>
      <div><dt>${t("deviation")}</dt><dd class="${deviationClass(roll.deviation_pct)}">${signedPct(roll.deviation_pct)}</dd></div>
      <div><dt>${t("avgBenefit")}</dt><dd>${money(totals().avg_family_benefit)}</dd></div>
    </dl>
    ${family.note ? `<p class="detail-note">${escapeHtml(family.note)}</p>` : ""}
    <h3 class="detail-section">${t("directedExpenses")}</h3>
    ${expenseTable(directed, false, numFamilies)}
    <h3 class="detail-section">${t("sharedShare")}</h3>
    ${expenseTable(shared, true, numFamilies)}`,
  };
}

function categoryList() {
  const rows = byCategory();
  const total = totals();
  const counts = new Map();
  for (const row of expenseRows()) counts.set(row.category, (counts.get(row.category) || 0) + 1);
  const max = Math.max(...rows.map((row) => row.amount || 0), 1);
  const share = (amount) => pct(total.expense_total ? (amount / total.expense_total) * 100 : 0);
  const body = rows.length
    ? rows
        .map(
          (row) => `
      <tr data-id="${escapeHtml(row.category)}" class="${row.category === state.route.selectedId ? "ws-selected" : ""}">
        <td class="strong">${escapeHtml(categoryLabel(row.category))}</td>
        <td class="ws-col-num">${money(row.amount)}</td>
        <td class="ws-col-num ws-split-keep">${pct(row.pct)}</td>
        <td class="ws-col-narrow num">${counts.get(row.category) || 0}</td>
        <td class="ws-col-wide"><span class="bar-track"><span class="bar-fill" style="width:${Math.max(((row.amount || 0) / max) * 100, 2)}%"></span></span></td>
      </tr>`,
        )
        .join("")
    : emptyRow(5);
  const footRow = (label, amount) => `
      <tr>
        <td>${escapeHtml(label)}</td><td class="ws-col-num">${money(amount)}</td>
        <td class="ws-col-num ws-split-keep">${share(amount)}</td><td class="ws-col-narrow"></td><td class="ws-col-wide"></td>
      </tr>`;
  return {
    count: rows.length,
    html: `
    <table class="ws-table category-table">
      <thead><tr>
        <th>${t("colCategory")}</th><th class="ws-col-num">${t("amount")}</th>
        <th class="ws-col-num ws-split-keep">${t("pctOfExpense")}</th><th class="ws-col-narrow num">${t("entries")}</th>
        <th class="ws-col-wide" aria-label="${escapeHtml(t("pctOfExpense"))}"></th>
      </tr></thead>
      <tbody>${body}</tbody>
      ${rows.length ? `<tfoot>${footRow(t("care"), total.care_total || 0)}${footRow(t("familyTotal"), total.family_total || 0)}</tfoot>` : ""}
    </table>
    ${pagination.control("expenses")}`,
  };
}

function categoryDetail(category) {
  const roll = byCategory().find((row) => row.category === category);
  if (!roll) return { html: `<div class="ws-detail-empty">${t("notOnPage")}</div>` };
  const entries = expenseRows()
    .filter((row) => row.category === category)
    .sort((a, b) => String(b.date || b.month).localeCompare(String(a.date || a.month)));
  const sharedTotal = entries.filter((row) => row.shared).reduce((sum, row) => sum + row.amount, 0);
  const body = entries
    .map(
      (row) => `
      <tr data-href="${escapeHtml(ledgerHref(row.id))}">
        <td class="strong">${escapeHtml(row.occasion || row.payee || "")}</td>
        <td class="ws-col-narrow">${escapeHtml(row.date || row.month)}</td>
        <td>${escapeHtml(row.category === "care" ? t("care") : row.shared ? t("sharedTag") : familyName(row.family_id))}</td>
        <td class="ws-col-num ws-split-keep">${money(row.amount)}</td>
      </tr>`,
    )
    .join("");
  return {
    html: `
    <header class="detail-head">
      <h2>${escapeHtml(categoryLabel(category))}</h2>
      <p class="muted">${entries.length} ${t("entryCount")}</p>
    </header>
    <dl class="facts facts-inline">
      <div><dt>${t("amount")}</dt><dd>${money(roll.amount)}</dd></div>
      <div><dt>${t("pctOfExpense")}</dt><dd>${pct(roll.pct)}</dd></div>
      ${category === "care" ? "" : `<div><dt>${t("sharedTag")}</dt><dd>${money(sharedTotal)}</dd></div>`}
    </dl>
    <table class="ws-table detail-table">
      <thead><tr>
        <th>${t("occasion")}</th><th class="ws-col-narrow">${t("date")}</th><th>${t("directedTo")}</th>
        <th class="ws-col-num ws-split-keep">${t("amount")}</th>
      </tr></thead>
      <tbody>${body || emptyRow(4)}</tbody>
    </table>`,
  };
}

const VIEWS = {
  ledger: { list: ledgerList, detail: ledgerDetail, hint: () => t("ledgerTimeline") },
  family: { list: familyList, detail: familyDetail, hint: () => t("fairnessNote") },
  category: { list: categoryList, detail: categoryDetail, hint: () => t("careVsFamilyNote") },
};

function syncMonthSelect(show) {
  const keys = months().map((m) => m.month);
  els.monthSelect.hidden = !show || !keys.length;
  if (els.monthSelect.hidden) return;
  els.monthSelect.innerHTML = [`<option value="">${escapeHtml(t("allMonths"))}</option>`]
    .concat(keys.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`))
    .join("");
  els.monthSelect.value = keys.includes(state.month) ? state.month : "";
}

export function renderRecordView() {
  const { view, selectedId } = state.route;
  const config = VIEWS[view];
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = config.hint();
  syncMonthSelect(view === "ledger");
  els.searchBox.hidden = !["ledger", "family"].includes(view);
  const list = config.list();
  els.viewCount.textContent = String(list.count);
  els.listPanel.innerHTML = list.html;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    els.detailExpand.hidden = true;
    return;
  }
  els.detailBody.innerHTML = config.detail(selectedId).html;
  // Drawer carries "Open full page"; the page itself does not need it.
  const inDrawer = state.route.presentation !== "page";
  els.detailExpand.hidden = !inDrawer || DETAIL_MODES[view] === "page";
  if (inDrawer) els.detailExpand.href = detailUrl(selectedId);
  // On a phone the drawer is a page too, so it steps "back" rather than closing.
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = inDrawer && !phone ? t("close") : t("backToList");
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function renderSettings() {
  els.settingsTitle.textContent = t("settings");
  els.settingsTitle.title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const fundMeta = summary.fund || fund();
  const people = (rows, line) =>
    rows.map((row) => `<div class="settings-account">${line(row)}</div>`).join("") ||
    `<div class="empty-inline">${t("setupNeeded")}</div>`;
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl class="facts">
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "CNY")}</dd>
          <dt>${t("fundName")}</dt><dd>${escapeHtml(fundMeta.name || "")}</dd>
          <dt>${t("steward")}</dt><dd>${escapeHtml(fundMeta.steward || "")}</dd>
          <dt>${t("deviationThreshold")}</dt><dd>${escapeHtml(String(summary.deviation_threshold_pct ?? 20))}%</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("beneficiaries")}</h2>
        ${people(
          summary.beneficiaries || beneficiaries(),
          (b) =>
            `<strong>${escapeHtml(b.name)}</strong><span>${escapeHtml(b.relation || "")}</span><span>${t("pensionMonthly")} ${money(b.pension_monthly)}</span>`,
        )}
      </section>
      <section>
        <h2>${t("families")}</h2>
        ${people(
          summary.families || families(),
          (f) =>
            `<strong>${escapeHtml(f.name)}</strong><span>${escapeHtml(f.head || "")}</span><span>${t("members")} ${escapeHtml(String(f.members_count || 0))}</span>`,
        )}
      </section>
    </div>`;
}
