// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import {
  attentionItems, auditOverdue, byConcern, daysSinceAudit, isOverdueAction, linkedFrom,
  overviewMetrics, relationIds, safeDisplay, scoreParts, storeOf,
} from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };
const PERCENT_FIELDS = new Set(['sales-pct', 'staffing-pct']);
const MONEY_FIELDS = new Set(['revenue-30d', 'revenue-at-risk']);
// A signal's was/now are in the unit of the measure it moved.
const KIND_UNIT = { audit: '', sales: '%', rating: '', staffing: '%', fixes: '' };

/** The area manager a row belongs to: the store's own, or its store's. */
export const areaOf = (records, row) => storeOf(records, row)?.fields['area-manager'] || '';

export function createContext({ locale, messages, records, asOf, route, totals }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const peekUrl = (row) => (row.baseKey === 'stores' ? `#/stores/${encodeURIComponent(row.id)}` : `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`);
  const dateFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const date = (iso) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '-';
    const value = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return (iso.slice(0, 4) === asOf.slice(0, 4) ? dateFormat : longDate).format(value);
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const moneyFull = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  const moneyShort = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 });
  const money = (value, compact = false) => (value === '' || value == null || Number.isNaN(Number(value)) ? '-' : (compact ? moneyShort : moneyFull).format(Number(value)));
  const choice = (base, slug, value) => fieldOf(base, slug)?.options.choices?.find((item) => item.id === value);
  const choiceText = (base, slug, value) => local(choice(base, slug, value)?.localizedName) || safeDisplay(value);
  const badge = (base, slug, value) => (value ? `<span class="badge ${TONE_CLASS[choice(base, slug, value)?.tone] || ''}">${esc(choiceText(base, slug, value))}</span>` : '-');
  const light = (value) => badge(baseByKey('stores'), 'status', value);
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
  // A 0–100 bar, coloured by the store's status.
  const bar = (score, status) => {
    const width = score == null || score === '' ? 0 : Math.min(100, Math.max(0, Number(score)));
    return `<span class="hc-bar ${status || ''}"><span class="hc-fill" style="width:${width.toFixed(1)}%"></span></span>`;
  };
  const scoreCell = (row) => `<span class="hc-score">${bar(row.fields.score, row.fields.status)}<span class="hc-num">${esc(safeDisplay(row.fields.score))}</span></span>`;
  // "Nov 12 · 4 days ago"; overdue audits are marked.
  const auditText = (row) => {
    const since = daysSinceAudit(row, asOf);
    if (since == null) return t.neverAudited;
    return `${date(row.fields['audited-on'])} · ${t.auditedAgo(since)}`;
  };
  const auditCell = (row) => `<span class="hc-audit${auditOverdue(row, asOf, appConfig.auditWindowDays) ? ' overdue' : ''}">${esc(auditText(row))}</span>`;
  // Revenue, coloured by how the store is selling against target.
  const revenueCell = (row) => {
    const value = row.fields['revenue-30d'];
    if (value == null || value === '') return '-';
    const pct = Number(row.fields['sales-pct']);
    const tone = Number.isNaN(pct) ? '' : pct >= 100 ? 'up' : pct >= 95 ? 'down' : 'down-hard';
    return `<span class="hc-gmv ${tone}">${esc(money(value, true))}</span>`;
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
    if (declared.type === 'number' && PERCENT_FIELDS.has(slug)) return esc(value === '' || value == null ? '-' : `${number.format(Number(value))}%`);
    if (declared.type === 'number' && MONEY_FIELDS.has(slug)) return esc(money(value));
    if (declared.type === 'number' && row.baseKey === 'signals' && ['previous-value', 'new-value'].includes(slug)) return esc(value === '' || value == null ? '-' : `${number.format(Number(value))}${KIND_UNIT[row.fields.kind] ?? ''}`);
    if (declared.type === 'number') return esc(value === '' || value == null ? '-' : number.format(Number(value)));
    if (declared.type === 'markdown') return esc(markdownText(value).slice(0, 140) || '-');
    return esc(safeDisplay(value));
  };
  return { locale, t, local, records, index, asOf, route, totals, title, peekUrl, date, number, money, bar, scoreCell, auditText, auditCell, revenueCell, choiceText, badge, light, relationLinks, relationText, urlLink, cell };
}

const reasonTone = (reason) => ({ 'at-risk': 'danger', 'audit-overdue': 'warning', overdue: 'danger', draft: 'active' })[reason] || '';

// ── Overview ───────────────────────────────────────────────────────────────
export function overviewHtml(ctx) {
  const { t, records, asOf } = ctx;
  const windowDays = appConfig.auditWindowDays;
  const metrics = overviewMetrics(records, asOf, windowDays);
  const tile = (label, value, detail = '', tone = '') => `<div class="${tone}"><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const band = [
    tile(t.revenueAtRisk, ctx.money(metrics.revenueAtRisk, true), t.ofRevenue(ctx.money(metrics.revenue, true)), metrics.revenueAtRisk ? 'tile-danger' : 'tile-positive'),
    tile(t.onTrack, `${metrics.onTrack} / ${metrics.total}`, '', 'tile-positive'),
    tile(t.atRisk, metrics.atRisk, t.ofTotal(metrics.atRisk, metrics.total), metrics.atRisk ? 'tile-danger' : ''),
    tile(t.auditOverdue(windowDays), metrics.auditOverdue, t.auditOverdueDetail(metrics.auditOverdue), metrics.auditOverdue ? 'tile-warning' : ''),
  ].join('');

  const items = attentionItems(records, asOf, windowDays);
  const attention = items.length
    ? `<ul class="attention-list">${items.slice(0, 6).map((item) => `<li><a href="#/attention?peek=${encodeURIComponent(item.record.id)}"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span><span class="attention-title">${esc(ctx.title(item.record))}</span><span class="muted">${esc(item.record.baseKey === 'stores' ? (item.reason === 'at-risk' ? ctx.money(item.record.fields['revenue-30d'], true) : ctx.auditText(item.record)) : areaOf(records, item.record))}</span></a></li>`).join('')}</ul>${items.length > 6 ? `<a class="card-link" href="#/attention">${esc(t.seeAll(items.length))} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingWaiting)}</p>`;

  const feedRows = records.filter((row) => row.baseKey === 'signals').sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || ''))).slice(0, 7);
  const signals = baseByKey('signals');
  const feed = feedRows.length
    ? `<ul class="feed-list">${feedRows.map((row) => `<li><a href="${ctx.peekUrl(row)}"><span class="feed-title">${esc(storeOf(records, row) ? `${ctx.title(storeOf(records, row))} — ` : '')}${esc(ctx.title(row))}</span><span class="feed-meta">${ctx.badge(signals, 'writer', row.fields.writer)}<span>${esc(safeDisplay(row.fields['written-by']))}</span><span>${esc(ctx.date(row.fields['recorded-on']))}</span></span></a></li>`).join('')}</ul><a class="card-link" href="#/signals">${esc(t.allSignals)} →</a>`
    : `<p class="muted">${esc(t.noSignals)}</p>`;

  const stores = records.filter((row) => row.baseKey === 'stores').sort(byConcern);
  const base = baseByKey('stores');
  const storeRow = (row) => `<tr><td class="cell-primary"><a href="${ctx.peekUrl(row)}">${esc(ctx.title(row))}</a></td><td>${ctx.badge(base, 'region', row.fields.region)}</td><td>${esc(safeDisplay(row.fields['area-manager']))}</td><td class="hc-start">${ctx.auditCell(row)}</td><td class="col-progress">${ctx.scoreCell(row)}</td><td class="col-status">${ctx.light(row.fields.status)}</td><td class="ws-col-num">${ctx.revenueCell(row)}</td></tr>`;
  const storeTable = stores.length
    ? `<table class="ws-table hc-stores"><thead><tr><th>${esc(t.store)}</th><th>${esc(t.region)}</th><th>${esc(t.areaManager)}</th><th>${esc(t.audited)}</th><th class="col-progress">${esc(t.score)}</th><th class="col-status">${esc(t.status)}</th><th class="ws-col-num">${esc(t.revenue)}</th></tr></thead><tbody>${stores.map(storeRow).join('')}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.empty)}</strong><span>${esc(t.askForStores)}</span></div>`;

  return { band, attention, attentionCount: items.length, feed, storeTable, metrics };
}

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  stores: ['name', 'status', ':score', ':audit', 'region', 'area-manager', ':revenue'],
  signals: ['title', 'store', 'kind', 'written-by', 'recorded-on'],
  actions: ['title', 'status', 'owner', 'due-date', 'store'],
  reviews: ['title', 'status', 'period-end', 'revenue-at-risk', 'headline'],
};

export function tableHtml(ctx, baseKey, rows) {
  const { t } = ctx;
  if (baseKey === 'attention') {
    const head = `<th>${esc(t.item)}</th><th class="col-status">${esc(t.whyHere)}</th><th>${esc(t.table)}</th><th>${esc(t.areaManager)}</th>`;
    const body = rows.map((item) => `<tr data-record="${esc(item.record.id)}"${item.record.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}><td class="cell-primary">${esc(ctx.title(item.record))}</td><td class="col-status"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span></td><td>${esc(ctx.local(baseByKey(item.record.baseKey).localizedName))}</td><td>${esc(areaOf(ctx.records, item.record) || '-')}</td></tr>`).join('');
    return `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const labels = { ':score': t.score, ':audit': t.audited, ':revenue': t.revenue };
  const label = (slug) => labels[slug] || ctx.local(fieldOf(base, slug).localizedName);
  const klass = (slug) => (slug === base.primary ? 'cell-primary'
    : slug === ':score' ? 'col-progress'
      : slug === ':revenue' || slug === 'revenue-at-risk' ? 'ws-col-num'
        : slug === ':audit' ? 'hc-start'
          : slug === base.status || fieldOf(base, slug)?.type === 'select' ? 'col-status'
            : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : '');
  const computed = (row, slug) => {
    if (slug === ':score') return ctx.scoreCell(row);
    if (slug === ':audit') return ctx.auditCell(row);
    if (slug === ':revenue') return ctx.revenueCell(row);
    return '';
  };
  const ordered = baseKey === 'stores' ? [...rows].sort(byConcern) : rows;
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(label(slug))}</th>`).join('');
  const body = ordered.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${slug.startsWith(':') ? computed(row, slug) : ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
// The five measures are shown once, in the score breakdown, not again as facts.
const MEASURE_FIELDS = ['audit-score', 'sales-pct', 'rating', 'staffing-pct', 'overdue-fixes', 'score'];

export function detailHtml(ctx, row, attentionReason) {
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const hidden = new Set([base.primary, base.status, ...(row.baseKey === 'stores' ? MEASURE_FIELDS : [])]);
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
  reason ||= row.baseKey === 'stores' && row.fields.status !== 'at-risk' && auditOverdue(row, ctx.asOf, appConfig.auditWindowDays) ? 'audit-overdue' : '';
  const why = reason ? `<p class="why"><span class="badge ${reasonTone(reason)}">${esc(t.reason[reason])}</span></p>` : '';
  const head = row.baseKey === 'stores' ? storeHeadline(ctx, row) : '';
  const order = row.baseKey === 'reviews' ? `${sections}<div class="detail-fields">${factRows}</div>` : `${head}${sections}<div class="detail-fields">${factRows}</div>`;
  return `<h2>${esc(ctx.title(row))}</h2>${why}<div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>${order}${relatedHtml(ctx, row)}`;
}

/** The score, the store's revenue and last audit, and the five parts that make the score. */
function storeHeadline(ctx, row) {
  const { t } = ctx;
  const f = row.fields;
  const fmt = (value) => ctx.number.format(value);
  const reading = (part) => (part.reading == null ? t.noReading : t[`${part.key}Reading`](fmt(part.reading)));
  const parts = scoreParts(row).map((part) => `<tr><td>${esc(t.part[part.key])}</td><td>${esc(reading(part))}</td><td class="hc-points"><span class="hc-mini ${part.points >= 20 ? 'full' : part.points >= 12 ? 'mid' : 'low'}"><span style="width:${part.points * 5}%"></span></span><strong>${part.points}</strong><span class="muted"> / 20</span></td></tr>`).join('');
  const region = ctx.choiceText(baseByKey('stores'), 'region', f.region);
  const meta = [f.region ? region : '', f['revenue-30d'] != null ? `${ctx.money(f['revenue-30d'], true)} · 30d` : '', ctx.auditText(row)].filter(Boolean).map((item) => esc(safeDisplay(item))).join(' · ');
  return `<section class="hc-head"><div class="hc-numbers"><strong>${esc(safeDisplay(f.score))}</strong><span class="muted">/ 100</span><span class="hc-meta">${meta}</span></div>${ctx.bar(f.score, f.status)}
    <table class="hc-parts"><thead><tr><th>${esc(t.measure)}</th><th>${esc(t.reading)}</th><th class="hc-points">${esc(t.points)}</th></tr></thead><tbody>${parts}</tbody></table></section>`;
}

function relatedHtml(ctx, row) {
  const { t, records } = ctx;
  if (row.baseKey !== 'stores') return '';
  const actions = baseByKey('actions');
  const signals = baseByKey('signals');
  const timeline = linkedFrom(records, 'signals', 'store', row.id).sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || '')));
  const history = timeline.length ? `<section class="detail-section"><h3>${esc(t.history)}</h3><ol class="timeline">${timeline.map((item) => `<li><div class="timeline-head"><a href="${ctx.peekUrl(item)}"><strong>${esc(ctx.title(item))}</strong></a>${ctx.badge(signals, 'kind', item.fields.kind)}<span class="muted">${esc(ctx.date(item.fields['recorded-on']))} · ${esc(safeDisplay(item.fields['written-by']))}</span></div><p>${esc(safeDisplay(item.fields.evidence))}</p></li>`).join('')}</ol></section>` : '';
  const actionRows = linkedFrom(records, 'actions', 'store', row.id);
  const actionList = actionRows.length ? `<section class="detail-section"><h3>${esc(t.actions)}</h3><ul class="related-list">${actionRows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${esc(ctx.date(item.fields['due-date']))} ${ctx.badge(actions, 'status', item.fields.status)}</span></li>`).join('')}</ul></section>` : '';
  return actionList + history;
}
