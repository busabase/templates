// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import {
  attentionItems, byConcern, daysToLive, isOverdueAction, linkedFrom,
  overviewMetrics, relationIds, safeDisplay, scoreParts, sessionOf,
} from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };
const PERCENT_FIELDS = new Set(['stock-pct', 'prep-pct', 'gmv-pct', 'conversion-pct', 'refund-pct']);
const MONEY_FIELDS = new Set(['target-gmv', 'gmv', 'week-gmv']);
// A signal's was/now are in the unit of the measure it moved.
const KIND_UNIT = { stock: '%', prep: '%', gmv: '%', conversion: '%', refund: '%' };

/** The producer a row belongs to: the session's own, or its session's. */
export const producerOf = (records, row) => sessionOf(records, row)?.fields.producer || '';

export function createContext({ locale, messages, records, asOf, route, totals }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const peekUrl = (row) => (row.baseKey === 'sessions' ? `#/sessions/${encodeURIComponent(row.id)}` : `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`);
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
  const light = (value) => badge(baseByKey('sessions'), 'status', value);
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
  // A 0–100 bar, coloured by the session's status.
  const bar = (score, status) => {
    const width = score == null || score === '' ? 0 : Math.min(100, Math.max(0, Number(score)));
    return `<span class="hc-bar ${status || ''}"><span class="hc-fill" style="width:${width.toFixed(1)}%"></span></span>`;
  };
  const scoreCell = (row) => `<span class="hc-score">${bar(row.fields.score, row.fields.status)}<span class="hc-num">${esc(safeDisplay(row.fields.score))}</span></span>`;
  // Before it airs: "Nov 11 · live in 2 days". After: "Nov 4 · 5 days ago".
  const liveText = (row) => {
    const left = daysToLive(row, asOf);
    if (left == null) return '-';
    const day = Math.abs(left) < 365 ? dateFormat.format(new Date(`${row.fields['live-date']}T00:00:00Z`)) : date(row.fields['live-date']);
    return `${day} · ${left >= 0 ? t.liveIn(left) : t.daysAgo(-left)}`;
  };
  // GMV once it aired, coloured by how it did against target; the target before.
  const gmvCell = (row) => {
    const value = row.fields.gmv;
    if (value == null || value === '') return row.fields['target-gmv'] ? `<span class="muted">${esc(t.targetOnly(money(row.fields['target-gmv'], true)))}</span>` : '-';
    const pct = Number(row.fields['gmv-pct']);
    const tone = pct >= 100 ? 'up' : pct >= 85 ? 'down' : 'down-hard';
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
  return { locale, t, local, records, index, asOf, route, totals, title, peekUrl, date, number, money, bar, scoreCell, liveText, gmvCell, choiceText, badge, light, relationLinks, relationText, urlLink, cell };
}

const reasonTone = (reason) => ({ 'at-risk': 'danger', 'not-ready': 'warning', overdue: 'danger', draft: 'active' })[reason] || '';

// ── Overview ───────────────────────────────────────────────────────────────
export function overviewHtml(ctx) {
  const { t, records, asOf } = ctx;
  const windowDays = appConfig.readyWindowDays;
  const gmvDays = appConfig.gmvWindowDays;
  const metrics = overviewMetrics(records, asOf, windowDays, gmvDays);
  const tile = (label, value, detail = '', tone = '') => `<div class="${tone}"><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const pct = metrics.target ? Math.round((metrics.gmv / metrics.target) * 100) : null;
  const band = [
    tile(t.gmvTile(gmvDays), metrics.target ? ctx.money(metrics.gmv, true) : '-', pct == null ? t.noGmv : t.ofTarget(pct), pct == null ? '' : pct >= 100 ? 'tile-positive' : 'tile-warning'),
    tile(t.onTrack, `${metrics.onTrack} / ${metrics.total}`, '', 'tile-positive'),
    tile(t.atRisk, metrics.atRisk, t.ofTotal(metrics.atRisk, metrics.total), metrics.atRisk ? 'tile-danger' : ''),
    tile(t.upcoming(windowDays), metrics.upcoming, t.notReadyCount(metrics.notReady), metrics.notReady ? 'tile-warning' : ''),
  ].join('');

  const items = attentionItems(records, asOf, windowDays);
  const attention = items.length
    ? `<ul class="attention-list">${items.slice(0, 6).map((item) => `<li><a href="#/attention?peek=${encodeURIComponent(item.record.id)}"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span><span class="attention-title">${esc(ctx.title(item.record))}</span><span class="muted">${esc(item.record.baseKey === 'sessions' ? ctx.liveText(item.record) : producerOf(records, item.record))}</span></a></li>`).join('')}</ul>${items.length > 6 ? `<a class="card-link" href="#/attention">${esc(t.seeAll(items.length))} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingWaiting)}</p>`;

  const feedRows = records.filter((row) => row.baseKey === 'signals').sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || ''))).slice(0, 7);
  const signals = baseByKey('signals');
  const feed = feedRows.length
    ? `<ul class="feed-list">${feedRows.map((row) => `<li><a href="${ctx.peekUrl(row)}"><span class="feed-title">${esc(sessionOf(records, row) ? `${ctx.title(sessionOf(records, row))} — ` : '')}${esc(ctx.title(row))}</span><span class="feed-meta">${ctx.badge(signals, 'writer', row.fields.writer)}<span>${esc(safeDisplay(row.fields['written-by']))}</span><span>${esc(ctx.date(row.fields['recorded-on']))}</span></span></a></li>`).join('')}</ul><a class="card-link" href="#/signals">${esc(t.allSignals)} →</a>`
    : `<p class="muted">${esc(t.noSignals)}</p>`;

  const sessions = records.filter((row) => row.baseKey === 'sessions').sort(byConcern);
  const base = baseByKey('sessions');
  const sessionRow = (row) => `<tr><td class="cell-primary"><a href="${ctx.peekUrl(row)}">${esc(ctx.title(row))}</a></td><td>${ctx.badge(base, 'channel', row.fields.channel)}</td><td>${esc(safeDisplay(row.fields.host))}</td><td class="hc-start">${esc(ctx.liveText(row))}</td><td class="col-progress">${ctx.scoreCell(row)}</td><td class="col-status">${ctx.light(row.fields.status)}</td><td class="ws-col-num">${ctx.gmvCell(row)}</td></tr>`;
  const sessionTable = sessions.length
    ? `<table class="ws-table hc-sessions"><thead><tr><th>${esc(t.session)}</th><th>${esc(t.channel)}</th><th>${esc(t.host)}</th><th>${esc(t.live)}</th><th class="col-progress">${esc(t.score)}</th><th class="col-status">${esc(t.status)}</th><th class="ws-col-num">${esc(t.gmv)}</th></tr></thead><tbody>${sessions.map(sessionRow).join('')}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.empty)}</strong><span>${esc(t.askForSessions)}</span></div>`;

  return { band, attention, attentionCount: items.length, feed, sessionTable, metrics };
}

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  sessions: ['title', 'status', ':score', ':live', 'channel', 'host', 'producer', ':gmv'],
  signals: ['title', 'session', 'kind', 'written-by', 'recorded-on'],
  actions: ['title', 'status', 'owner', 'due-date', 'session'],
  reviews: ['title', 'status', 'period-end', 'week-gmv', 'headline'],
};

export function tableHtml(ctx, baseKey, rows) {
  const { t } = ctx;
  if (baseKey === 'attention') {
    const head = `<th>${esc(t.item)}</th><th class="col-status">${esc(t.whyHere)}</th><th>${esc(t.table)}</th><th>${esc(t.producer)}</th>`;
    const body = rows.map((item) => `<tr data-record="${esc(item.record.id)}"${item.record.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}><td class="cell-primary">${esc(ctx.title(item.record))}</td><td class="col-status"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span></td><td>${esc(ctx.local(baseByKey(item.record.baseKey).localizedName))}</td><td>${esc(producerOf(ctx.records, item.record) || '-')}</td></tr>`).join('');
    return `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const labels = { ':score': t.score, ':live': t.live, ':gmv': t.gmv };
  const label = (slug) => labels[slug] || ctx.local(fieldOf(base, slug).localizedName);
  const klass = (slug) => (slug === base.primary ? 'cell-primary'
    : slug === ':score' ? 'col-progress'
      : slug === ':gmv' || slug === 'week-gmv' ? 'ws-col-num'
        : slug === ':live' ? 'hc-start'
          : slug === base.status || fieldOf(base, slug)?.type === 'select' ? 'col-status'
            : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : '');
  const computed = (row, slug) => {
    if (slug === ':score') return ctx.scoreCell(row);
    if (slug === ':live') return esc(ctx.liveText(row));
    if (slug === ':gmv') return ctx.gmvCell(row);
    return '';
  };
  const ordered = baseKey === 'sessions' ? [...rows].sort(byConcern) : rows;
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(label(slug))}</th>`).join('');
  const body = ordered.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${slug.startsWith(':') ? computed(row, slug) : ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
// The five measures are shown once, in the score breakdown, not again as facts.
const MEASURE_FIELDS = ['stock-pct', 'prep-pct', 'gmv-pct', 'conversion-pct', 'refund-pct', 'score'];

export function detailHtml(ctx, row, attentionReason) {
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const hidden = new Set([base.primary, base.status, ...(row.baseKey === 'sessions' ? MEASURE_FIELDS : [])]);
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
  const head = row.baseKey === 'sessions' ? sessionHeadline(ctx, row) : '';
  const order = row.baseKey === 'reviews' ? `${sections}<div class="detail-fields">${factRows}</div>` : `${head}${sections}<div class="detail-fields">${factRows}</div>`;
  return `<h2>${esc(ctx.title(row))}</h2>${why}<div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>${order}${relatedHtml(ctx, row)}`;
}

/** The score, when the session airs, and the five parts that make the score. */
function sessionHeadline(ctx, row) {
  const { t } = ctx;
  const f = row.fields;
  const fmt = (value) => ctx.number.format(value);
  const reading = (part) => {
    if (part.reading == null) return t.noReading;
    return t[`${part.key}Reading`](fmt(part.reading));
  };
  const parts = scoreParts(row).map((part) => `<tr><td>${esc(t.part[part.key])}</td><td>${esc(reading(part))}</td><td class="hc-points"><span class="hc-mini ${part.points >= 20 ? 'full' : part.points >= 12 ? 'mid' : 'low'}"><span style="width:${part.points * 5}%"></span></span><strong>${part.points}</strong><span class="muted"> / 20</span></td></tr>`).join('');
  const channel = ctx.choiceText(baseByKey('sessions'), 'channel', f.channel);
  const meta = [f.channel ? channel : '', ctx.liveText(row)].filter(Boolean).map((item) => esc(safeDisplay(item))).join(' · ');
  return `<section class="hc-head"><div class="hc-numbers"><strong>${esc(safeDisplay(f.score))}</strong><span class="muted">/ 100</span><span class="hc-meta">${meta}</span></div>${ctx.bar(f.score, f.status)}
    <table class="hc-parts"><thead><tr><th>${esc(t.measure)}</th><th>${esc(t.reading)}</th><th class="hc-points">${esc(t.points)}</th></tr></thead><tbody>${parts}</tbody></table></section>`;
}

function relatedHtml(ctx, row) {
  const { t, records } = ctx;
  if (row.baseKey !== 'sessions') return '';
  const actions = baseByKey('actions');
  const signals = baseByKey('signals');
  const timeline = linkedFrom(records, 'signals', 'session', row.id).sort((a, b) => String(b.fields['recorded-on'] || '').localeCompare(String(a.fields['recorded-on'] || '')));
  const history = timeline.length ? `<section class="detail-section"><h3>${esc(t.history)}</h3><ol class="timeline">${timeline.map((item) => `<li><div class="timeline-head"><a href="${ctx.peekUrl(item)}"><strong>${esc(ctx.title(item))}</strong></a>${ctx.badge(signals, 'kind', item.fields.kind)}<span class="muted">${esc(ctx.date(item.fields['recorded-on']))} · ${esc(safeDisplay(item.fields['written-by']))}</span></div><p>${esc(safeDisplay(item.fields.evidence))}</p></li>`).join('')}</ol></section>` : '';
  const actionRows = linkedFrom(records, 'actions', 'session', row.id);
  const actionList = actionRows.length ? `<section class="detail-section"><h3>${esc(t.actions)}</h3><ul class="related-list">${actionRows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${esc(ctx.date(item.fields['due-date']))} ${ctx.badge(actions, 'status', item.fields.status)}</span></li>`).join('')}</ul></section>` : '';
  return actionList + history;
}
