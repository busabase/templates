// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import {
  attentionItems, byConcern, daysToContractEnd, isOverdueAction, linkedFrom,
  overviewMetrics, relationIds, safeDisplay, scoreParts, supplierOf,
} from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };
const MONEY_FIELDS = new Set(['annual-spend', 'spend-at-risk']);
const PERCENT_FIELDS = new Set(['on-time-pct', 'defect-pct', 'price-variance-pct', 'invoice-match-pct']);
// A signal's was/now are in the unit of the measure it moved.
const KIND_UNIT = { delivery: '%', quality: '%', price: '%', invoice: '%', response: '' };

/** The buyer a row belongs to: the supplier's own, or its supplier's. */
export const buyerOf = (records, row) => supplierOf(records, row)?.fields.buyer || '';

export function createContext({ locale, messages, records, asOf, route, totals }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const peekUrl = (row) => (row.baseKey === 'suppliers' ? `#/suppliers/${encodeURIComponent(row.id)}` : `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`);
  const dateFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const date = (iso) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '-';
    const value = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return (iso.slice(0, 4) === asOf.slice(0, 4) ? dateFormat : longDate).format(value);
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const compactMoney = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });
  const money = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? '-' : compactMoney.format(Number(value)));
  const choice = (base, slug, value) => fieldOf(base, slug)?.options.choices?.find((item) => item.id === value);
  const choiceText = (base, slug, value) => local(choice(base, slug, value)?.localizedName) || safeDisplay(value);
  const badge = (base, slug, value) => (value ? `<span class="badge ${TONE_CLASS[choice(base, slug, value)?.tone] || ''}">${esc(choiceText(base, slug, value))}</span>` : '-');
  const light = (value) => badge(baseByKey('suppliers'), 'rating', value);
  const relationLinks = (value) => {
    const ids = relationIds(value);
    if (!ids.length) return '-';
    return ids.map((id) => (index.has(id) ? `<a class="rel-link" href="${peekUrl(index.get(id))}">${esc(title(index.get(id)))}</a>` : `<span class="muted">${esc(t.notLoaded)}</span>`)).join(', ');
  };
  const relationText = (value) => relationIds(value).map((id) => (index.has(id) ? title(index.get(id)) : t.notLoaded)).join(', ') || '-';
  const urlLink = (value) => {
    if (!value || !/^https?:\/\//.test(value)) return '-';
    return `<a class="rel-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value.replace(/^https?:\/\//, ''))}</a>`;
  };
  // A 0–100 bar, coloured by the supplier's rating.
  const bar = (score, health) => {
    const width = score == null || score === '' ? 0 : Math.min(100, Math.max(0, Number(score)));
    return `<span class="hc-bar ${health || ''}"><span class="hc-fill" style="width:${width.toFixed(1)}%"></span></span>`;
  };
  const scoreCell = (row) => `<span class="hc-score">${bar(row.fields.score, row.fields.rating)}<span class="hc-num">${esc(safeDisplay(row.fields.score))}</span></span>`;
  const contractText = (row) => {
    const left = daysToContractEnd(row, asOf);
    if (left == null) return '-';
    // Within a year the year is noise: "May 30 · in 206 days".
    const day = left >= 0 && left < 365 ? dateFormat.format(new Date(`${row.fields['contract-end']}T00:00:00Z`)) : date(row.fields['contract-end']);
    return `${day} · ${left < 0 ? t.endPassed : t.inDays(left)}`;
  };
  const onTimeCell = (row) => {
    const value = row.fields['on-time-pct'];
    if (value == null || value === '') return '-';
    const tone = value >= 95 ? 'up' : value >= 80 ? 'down' : 'down-hard';
    return `<span class="hc-ontime ${tone}">${esc(number.format(Number(value)))}%</span>`;
  };
  const cell = (row, slug) => {
    const base = baseByKey(row.baseKey);
    const declared = fieldOf(base, slug);
    const value = row.fields[slug];
    if (!declared) return '-';
    if (declared.type === 'select') return badge(base, slug, value);
    if (declared.type === 'relation') return esc(relationText(value));
    if (declared.type === 'date') return esc(date(value));
    if (declared.type === 'url') return urlLink(value);
    if (declared.type === 'number' && MONEY_FIELDS.has(slug)) return esc(money(value));
    if (declared.type === 'number' && PERCENT_FIELDS.has(slug)) return esc(value === '' || value == null ? '-' : `${number.format(Number(value))}%`);
    if (declared.type === 'number' && row.baseKey === 'signals' && ['previous-value', 'new-value'].includes(slug)) return esc(value === '' || value == null ? '-' : `${number.format(Number(value))}${KIND_UNIT[row.fields.kind] ?? ''}`);
    if (declared.type === 'number') return esc(value === '' || value == null ? '-' : number.format(Number(value)));
    if (declared.type === 'markdown') return esc(markdownText(value).slice(0, 140) || '-');
    return esc(safeDisplay(value));
  };
  return { locale, t, local, records, index, asOf, route, totals, title, peekUrl, date, money, number, bar, scoreCell, contractText, onTimeCell, choiceText, badge, light, relationLinks, relationText, urlLink, cell };
}

const reasonTone = (reason) => ({ 'at-risk': 'danger', contract: 'warning', overdue: 'danger', draft: 'active' })[reason] || '';

// ── Overview ───────────────────────────────────────────────────────────────
export function overviewHtml(ctx) {
  const { t, records, asOf } = ctx;
  const windowDays = appConfig.contractWindowDays;
  const metrics = overviewMetrics(records, asOf, windowDays);
  const tile = (label, value, detail = '', tone = '') => `<div class="${tone}"><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const band = [
    tile(t.spendAtRisk, ctx.money(metrics.spendAtRisk), t.suppliersOf(metrics.atRisk, metrics.total), metrics.atRisk ? 'tile-danger' : ''),
    tile(t.preferred, `${metrics.preferred} / ${metrics.total}`),
    tile(t.watch, metrics.watch, '', metrics.watch ? 'tile-warning' : ''),
    tile(t.ending(windowDays), metrics.ending, ctx.money(metrics.endingSpend)),
  ].join('');

  const items = attentionItems(records, asOf, windowDays);
  const attention = items.length
    ? `<ul class="attention-list">${items.slice(0, 6).map((item) => `<li><a href="#/attention?peek=${encodeURIComponent(item.record.id)}"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span><span class="attention-title">${esc(ctx.title(item.record))}</span><span class="muted">${esc(item.record.baseKey === 'suppliers' ? ctx.money(item.record.fields['annual-spend']) : buyerOf(records, item.record))}</span></a></li>`).join('')}</ul>${items.length > 6 ? `<a class="card-link" href="#/attention">${esc(t.seeAll(items.length))} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingWaiting)}</p>`;

  const feedRows = records.filter((row) => row.baseKey === 'signals').sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || ''))).slice(0, 7);
  const signals = baseByKey('signals');
  const feed = feedRows.length
    ? `<ul class="feed-list">${feedRows.map((row) => `<li><a href="${ctx.peekUrl(row)}"><span class="feed-title">${esc(supplierOf(records, row) ? `${ctx.title(supplierOf(records, row))} — ` : '')}${esc(ctx.title(row))}</span><span class="feed-meta">${ctx.badge(signals, 'writer', row.fields.writer)}<span>${esc(safeDisplay(row.fields['written-by']))}</span><span>${esc(ctx.date(row.fields['recorded-on']))}</span></span></a></li>`).join('')}</ul><a class="card-link" href="#/signals">${esc(t.allSignals)} →</a>`
    : `<p class="muted">${esc(t.noSignals)}</p>`;

  const suppliers = records.filter((row) => row.baseKey === 'suppliers').sort(byConcern);
  const supplierRow = (row) => `<tr><td class="cell-primary"><a href="${ctx.peekUrl(row)}">${esc(ctx.title(row))}</a></td><td>${esc(safeDisplay(row.fields.buyer))}</td><td class="ws-col-num">${esc(ctx.money(row.fields['annual-spend']))}</td><td class="hc-contract">${esc(ctx.contractText(row))}</td><td class="col-progress">${ctx.scoreCell(row)}</td><td class="col-status">${ctx.light(row.fields.rating)}</td><td class="ws-col-num">${ctx.onTimeCell(row)}</td></tr>`;
  const supplierTable = suppliers.length
    ? `<table class="ws-table hc-suppliers"><thead><tr><th>${esc(t.supplier)}</th><th>${esc(t.buyer)}</th><th class="ws-col-num">${esc(t.spend)}</th><th>${esc(t.contractEnd)}</th><th class="col-progress">${esc(t.score)}</th><th class="col-status">${esc(t.rating)}</th><th class="ws-col-num">${esc(t.onTime)}</th></tr></thead><tbody>${suppliers.map(supplierRow).join('')}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.empty)}</strong><span>${esc(t.askForSuppliers)}</span></div>`;

  return { band, attention, attentionCount: items.length, feed, supplierTable, metrics };
}

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  suppliers: ['name', 'rating', ':score', 'annual-spend', ':contract', 'buyer', 'category', ':ontime'],
  signals: ['title', 'supplier', 'kind', 'written-by', 'recorded-on'],
  actions: ['title', 'status', 'owner', 'due-date', 'supplier'],
  reviews: ['title', 'status', 'period-end', 'spend-at-risk', 'headline'],
};

export function tableHtml(ctx, baseKey, rows) {
  const { t } = ctx;
  if (baseKey === 'attention') {
    const head = `<th>${esc(t.item)}</th><th class="col-status">${esc(t.whyHere)}</th><th>${esc(t.table)}</th><th>${esc(t.buyer)}</th>`;
    const body = rows.map((item) => `<tr data-record="${esc(item.record.id)}"${item.record.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}><td class="cell-primary">${esc(ctx.title(item.record))}</td><td class="col-status"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span></td><td>${esc(ctx.local(baseByKey(item.record.baseKey).localizedName))}</td><td>${esc(buyerOf(ctx.records, item.record) || '-')}</td></tr>`).join('');
    return `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const labels = { ':score': t.score, ':contract': t.contractEnd, ':ontime': t.onTime };
  const label = (slug) => labels[slug] || ctx.local(fieldOf(base, slug).localizedName);
  const klass = (slug) => (slug === base.primary ? 'cell-primary'
    : slug === ':score' ? 'col-progress'
      : slug === ':ontime' || MONEY_FIELDS.has(slug) ? 'ws-col-num'
        : slug === ':contract' ? 'hc-contract'
          : slug === base.status || fieldOf(base, slug)?.type === 'select' ? 'col-status'
            : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : '');
  const computed = (row, slug) => {
    if (slug === ':score') return ctx.scoreCell(row);
    if (slug === ':contract') return esc(ctx.contractText(row));
    if (slug === ':ontime') return ctx.onTimeCell(row);
    return '';
  };
  const ordered = baseKey === 'suppliers' ? [...rows].sort(byConcern) : rows;
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(label(slug))}</th>`).join('');
  const body = ordered.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${slug.startsWith(':') ? computed(row, slug) : ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
// The five measures are shown once, in the score breakdown, not again as facts.
const MEASURE_FIELDS = ['on-time-pct', 'defect-pct', 'price-variance-pct', 'invoice-match-pct', 'response-days', 'score'];

export function detailHtml(ctx, row, attentionReason) {
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const hidden = new Set([base.primary, base.status, ...(row.baseKey === 'suppliers' ? MEASURE_FIELDS : [])]);
  const facts = base.fields.filter((item) => !hidden.has(item.slug) && !long(item));
  const value = (item) => {
    const raw = row.fields[item.slug];
    if (item.type === 'relation') return ctx.relationLinks(raw);
    if (item.type === 'select') return ctx.badge(base, item.slug, raw);
    if (item.type === 'url') return ctx.urlLink(raw);
    if (item.type === 'date') return esc(ctx.date(raw));
    if (item.type === 'number') return esc(ctx.cell(row, item.slug));
    return esc(safeDisplay(raw));
  };
  const hasValue = (item) => (item.type === 'relation' ? relationIds(row.fields[item.slug]).length > 0 : row.fields[item.slug] != null && row.fields[item.slug] !== '');
  const factRows = facts.filter(hasValue)
    .map((item) => `<div class="field-row"><span>${esc(ctx.local(item.localizedName))}</span><strong>${value(item)}</strong></div>`).join('');
  const sections = base.fields.filter((item) => long(item) && row.fields[item.slug])
    .map((item) => `<section class="detail-section${item.slug === 'body' ? ' report-body' : ''}"><h3>${esc(ctx.local(item.localizedName))}</h3><div class="md">${renderMarkdown(row.fields[item.slug])}</div></section>`).join('');
  let reason = attentionReason;
  reason ||= row.baseKey === 'actions' && isOverdueAction(row, ctx.asOf) ? 'overdue' : '';
  const why = reason ? `<p class="why"><span class="badge ${reasonTone(reason)}">${esc(t.reason[reason])}</span></p>` : '';
  const head = row.baseKey === 'suppliers' ? supplierHeadline(ctx, row) : '';
  const order = row.baseKey === 'reviews' ? `${sections}<div class="detail-fields">${factRows}</div>` : `${head}${sections}<div class="detail-fields">${factRows}</div>`;
  return `<h2>${esc(ctx.title(row))}</h2>${why}<div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>${order}${relatedHtml(ctx, row)}`;
}

/** The score, the contract, and the five parts that make the score. */
function supplierHeadline(ctx, row) {
  const { t } = ctx;
  const f = row.fields;
  const fmt = (value) => ctx.number.format(value);
  const reading = (part) => {
    if (part.reading == null) return t.noReading;
    switch (part.key) {
      case 'delivery': return t.deliveryReading(fmt(part.reading));
      case 'quality': return t.qualityReading(fmt(part.reading));
      case 'price': return t.priceReading(part.reading <= 0 ? part.reading : fmt(part.reading));
      case 'invoice': return t.invoiceReading(fmt(part.reading));
      default: return t.responseReading(part.reading);
    }
  };
  const parts = scoreParts(row).map((part) => `<tr><td>${esc(t.part[part.key])}</td><td>${esc(reading(part))}</td><td class="hc-points"><span class="hc-mini ${part.points >= 20 ? 'full' : part.points >= 12 ? 'mid' : 'low'}"><span style="width:${part.points * 5}%"></span></span><strong>${part.points}</strong><span class="muted"> / 20</span></td></tr>`).join('');
  return `<section class="hc-head"><div class="hc-numbers"><strong>${esc(safeDisplay(f.score))}</strong><span class="muted">/ 100</span><span class="hc-meta">${esc(ctx.money(f['annual-spend']))} ${esc(t.perYear)} · ${esc(t.ends)} ${esc(ctx.contractText(row))}</span></div>${ctx.bar(f.score, f.rating)}
    <table class="hc-parts"><thead><tr><th>${esc(t.measure)}</th><th>${esc(t.reading)}</th><th class="hc-points">${esc(t.points)}</th></tr></thead><tbody>${parts}</tbody></table></section>`;
}

function relatedHtml(ctx, row) {
  const { t, records } = ctx;
  if (row.baseKey !== 'suppliers') return '';
  const actions = baseByKey('actions');
  const signals = baseByKey('signals');
  const timeline = linkedFrom(records, 'signals', 'supplier', row.id).sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || '')));
  const history = timeline.length ? `<section class="detail-section"><h3>${esc(t.history)}</h3><ol class="timeline">${timeline.map((item) => `<li><div class="timeline-head"><a href="${ctx.peekUrl(item)}"><strong>${esc(ctx.title(item))}</strong></a>${ctx.badge(signals, 'kind', item.fields.kind)}<span class="muted">${esc(ctx.date(item.fields['recorded-on']))} · ${esc(safeDisplay(item.fields['written-by']))}</span></div><p>${esc(safeDisplay(item.fields.evidence))}</p></li>`).join('')}</ol></section>` : '';
  const actionRows = linkedFrom(records, 'actions', 'supplier', row.id);
  const actionList = actionRows.length ? `<section class="detail-section"><h3>${esc(t.actions)}</h3><ul class="related-list">${actionRows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${esc(ctx.date(item.fields['due-date']))} ${ctx.badge(actions, 'status', item.fields.status)}</span></li>`).join('')}</ul></section>` : '';
  return actionList + history;
}
