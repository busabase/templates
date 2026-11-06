// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import {
  attentionItems, averageProgress, expectedProgress, isOverdueAction, krProgress, linkedFrom,
  overviewMetrics, relationIds, safeDisplay, teamOf, worstStatus,
} from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };

export function createContext({ locale, messages, records, asOf, route, totals }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const peekUrl = (row) => (row.baseKey === 'objectives' ? `#/objectives/${encodeURIComponent(row.id)}` : `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`);
  const dateFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const date = (iso) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '-';
    const value = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return (iso.slice(0, 4) === asOf.slice(0, 4) ? dateFormat : longDate).format(value);
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  // A key result's value in its own unit: $1.38M, 64%, 2x, 9 stores.
  const amount = (value, unit) => {
    if (value === '' || value == null || Number.isNaN(Number(value))) return '-';
    const n = Number(value);
    const body = Math.abs(n) >= 10000 ? compact.format(n) : number.format(n);
    if (unit === '$') return `$${body}`;
    if (unit === '%') return `${body}%`;
    if (unit === 'x') return `${body}x`;
    if (unit === '/5') return `${body} / 5`;
    return unit ? `${body} ${unit}` : body;
  };
  const percent = (value) => (value == null ? '-' : `${Math.round(value * 100)}%`);
  const choice = (base, slug, value) => fieldOf(base, slug)?.options.choices?.find((item) => item.id === value);
  const choiceText = (base, slug, value) => local(choice(base, slug, value)?.localizedName) || safeDisplay(value);
  const badge = (base, slug, value) => (value ? `<span class="badge ${TONE_CLASS[choice(base, slug, value)?.tone] || ''}">${esc(choiceText(base, slug, value))}</span>` : '-');
  const light = (value) => badge(baseByKey('key-results'), 'status', value);
  const teamText = (value) => choiceText(baseByKey('key-results'), 'team', value);
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
  const expected = expectedProgress(appConfig.quarter, asOf);
  // A bar with a tick where the quarter says the result should be by now.
  const bar = (progress, status) => {
    const width = progress == null ? 0 : Math.min(100, Math.max(0, progress * 100));
    return `<span class="okr-bar ${status || ''}" title="${esc(t.progressVsExpected(percent(progress), percent(expected)))}"><span class="okr-fill" style="width:${width.toFixed(1)}%"></span><span class="okr-expected" style="left:${(expected * 100).toFixed(1)}%"></span></span>`;
  };
  const progressCell = (progress, status) => `<span class="okr-progress">${bar(progress, status)}<span class="okr-pct">${esc(percent(progress))}</span></span>`;
  const cell = (row, slug) => {
    const base = baseByKey(row.baseKey);
    const declared = fieldOf(base, slug);
    const value = row.fields[slug];
    if (!declared) return '-';
    if (declared.type === 'select') return badge(base, slug, value);
    if (declared.type === 'relation') return esc(relationText(value));
    if (declared.type === 'date') return esc(date(value));
    if (declared.type === 'url') return urlLink(value);
    if (declared.type === 'number' && row.baseKey === 'check-ins') return esc(amount(value, krUnit(row)));
    if (declared.type === 'number' && row.baseKey === 'key-results') return esc(amount(value, row.fields.unit));
    if (declared.type === 'markdown') return esc(markdownText(value).slice(0, 140) || '-');
    return esc(safeDisplay(value));
  };
  const krUnit = (row) => {
    const kr = relationIds(row.fields['key-result']).map((id) => index.get(id)).find(Boolean);
    return kr?.fields.unit || '';
  };
  return { locale, t, local, records, index, asOf, route, totals, title, peekUrl, date, amount, percent, expected, bar, progressCell, choiceText, badge, light, teamText, relationLinks, relationText, urlLink, cell, krUnit };
}

const reasonTone = (reason) => ({ 'at-risk': 'danger', watch: 'warning', overdue: 'danger', draft: 'active' })[reason] || '';

// ── Overview ───────────────────────────────────────────────────────────────
export function overviewHtml(ctx) {
  const { t, records, asOf } = ctx;
  const days = appConfig.ui.recentDays;
  const metrics = overviewMetrics(records, asOf, days, appConfig.quarter);
  const tile = (label, value, detail = '', tone = '') => `<div class="${tone}"><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const band = [
    tile(t.overall, `${ctx.percent(metrics.progress)} / ${ctx.percent(metrics.expected)}`),
    tile(t.onTrack, `${metrics.onTrack} / ${metrics.total}`),
    tile(t.watch, metrics.watch, '', metrics.watch ? 'tile-warning' : ''),
    tile(t.atRisk, metrics.atRisk, '', metrics.atRisk ? 'tile-danger' : ''),
  ].join('');

  const items = attentionItems(records, asOf);
  const attention = items.length
    ? `<ul class="attention-list">${items.slice(0, 6).map((item) => `<li><a href="#/attention?peek=${encodeURIComponent(item.record.id)}"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span><span class="attention-title">${esc(ctx.title(item.record))}</span><span class="muted">${esc(ctx.teamText(teamOf(records, item.record)))}</span></a></li>`).join('')}</ul>${items.length > 6 ? `<a class="card-link" href="#/attention">${esc(t.seeAll(items.length))} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingWaiting)}</p>`;

  const feedRows = records.filter((row) => row.baseKey === 'check-ins').sort((a, b) => String(b.fields['checked-on'] || '').localeCompare(String(a.fields['checked-on'] || ''))).slice(0, 7);
  const checkIns = baseByKey('check-ins');
  const feed = feedRows.length
    ? `<ul class="feed-list">${feedRows.map((row) => `<li><a href="${ctx.peekUrl(row)}"><span class="feed-title">${esc(ctx.title(row))}</span><span class="feed-meta">${ctx.badge(checkIns, 'writer', row.fields.writer)}<span>${esc(safeDisplay(row.fields['written-by']))}</span><span>${esc(ctx.date(row.fields['checked-on']))}</span></span></a></li>`).join('')}</ul><a class="card-link" href="#/check-ins">${esc(t.allCheckIns)} →</a>`
    : `<p class="muted">${esc(t.noCheckIns)}</p>`;

  const objectives = records.filter((row) => row.baseKey === 'objectives');
  const companies = objectives.filter((row) => row.fields.level === 'company');
  const childrenOf = (id) => objectives.filter((row) => relationIds(row.fields.parent).includes(id));
  const placed = new Set();
  const objectiveRow = (row, child) => {
    placed.add(row.id);
    const krs = linkedFrom(records, 'key-results', 'objective', row.id);
    const status = row.fields.confidence || worstStatus(krs.map((kr) => kr.fields.status));
    return `<tr class="${child ? 'okr-child' : 'okr-parent'}"><td class="cell-primary"><a href="${ctx.peekUrl(row)}">${esc(ctx.title(row))}</a></td><td>${esc(ctx.teamText(row.fields.team))}</td><td>${esc(safeDisplay(row.fields.owner))}</td><td class="col-progress">${ctx.progressCell(averageProgress(krs), status)}</td><td class="col-status">${ctx.light(status)}</td><td class="ws-col-num">${krs.length}</td></tr>`;
  };
  const rows = companies.map((company) => objectiveRow(company, false) + childrenOf(company.id).map((child) => objectiveRow(child, true)).join('')).join('')
    + objectives.filter((row) => !placed.has(row.id)).map((row) => objectiveRow(row, row.fields.level !== 'company')).join('');
  const objectiveTable = objectives.length
    ? `<table class="ws-table okr-tree"><thead><tr><th>${esc(t.objective)}</th><th>${esc(t.team)}</th><th>${esc(t.owner)}</th><th class="col-progress">${esc(t.progress)}</th><th class="col-status">${esc(t.light)}</th><th class="ws-col-num">${esc(t.krs)}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.empty)}</strong><span>${esc(t.askForOkrs)}</span></div>`;

  return { band, attention, attentionCount: items.length, feed, objectiveTable, metrics };
}

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  objectives: ['title', 'confidence', 'team', 'level', 'owner', ':progress'],
  'key-results': ['title', 'status', 'team', ':progress', ':value', 'updated-by', 'updated-on'],
  'check-ins': ['title', 'writer', 'written-by', 'checked-on', 'key-result'],
  actions: ['title', 'status', 'owner', 'due-date', 'key-result'],
  reviews: ['title', 'status', 'period-start', 'period-end', 'headline'],
};

export function tableHtml(ctx, baseKey, rows) {
  const { t } = ctx;
  if (baseKey === 'attention') {
    const head = `<th>${esc(t.item)}</th><th class="col-status">${esc(t.whyHere)}</th><th>${esc(t.table)}</th><th>${esc(t.team)}</th>`;
    const body = rows.map((item) => `<tr data-record="${esc(item.record.id)}"${item.record.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}><td class="cell-primary">${esc(ctx.title(item.record))}</td><td class="col-status"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span></td><td>${esc(ctx.local(baseByKey(item.record.baseKey).localizedName))}</td><td>${esc(ctx.teamText(teamOf(ctx.records, item.record)) || '-')}</td></tr>`).join('');
    return `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const label = (slug) => (slug === ':progress' ? t.progress : slug === ':value' ? t.currentOfTarget : ctx.local(fieldOf(base, slug).localizedName));
  const klass = (slug) => (slug === base.primary ? 'cell-primary' : slug === ':progress' ? 'col-progress' : slug === ':value' ? 'ws-col-num' : slug === base.status || fieldOf(base, slug)?.type === 'select' ? 'col-status' : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : '');
  const computed = (row, slug) => {
    if (slug === ':progress' && row.baseKey === 'key-results') return ctx.progressCell(krProgress(row), row.fields.status);
    if (slug === ':progress') return ctx.progressCell(averageProgress(linkedFrom(ctx.records, 'key-results', 'objective', row.id)), row.fields.confidence);
    if (slug === ':value') return esc(`${ctx.amount(row.fields['current-value'], row.fields.unit)} / ${ctx.amount(row.fields['target-value'], row.fields.unit)}`);
    return '';
  };
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(label(slug))}</th>`).join('');
  const body = rows.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${slug.startsWith(':') ? computed(row, slug) : ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
export function detailHtml(ctx, row, attentionReason) {
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const hidden = new Set([base.primary, base.status, ...(row.baseKey === 'key-results' ? ['start-value', 'target-value', 'current-value', 'unit'] : [])]);
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
  const head = row.baseKey === 'key-results' ? krHeadline(ctx, row) : row.baseKey === 'objectives' ? objectiveHeadline(ctx, row) : '';
  const order = row.baseKey === 'reviews' ? `${sections}<div class="detail-fields">${factRows}</div>` : `${head}<div class="detail-fields">${factRows}</div>${sections}`;
  return `<h2>${esc(ctx.title(row))}</h2>${why}<div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>${order}${relatedHtml(ctx, row)}`;
}

function krHeadline(ctx, row) {
  const progress = krProgress(row);
  const unit = row.fields.unit;
  return `<section class="kr-head"><div class="kr-numbers"><strong>${esc(ctx.amount(row.fields['current-value'], unit))}</strong><span class="muted">${esc(ctx.t.fromTo(ctx.amount(row.fields['start-value'], unit), ctx.amount(row.fields['target-value'], unit)))}</span></div>${ctx.bar(progress, row.fields.status)}<p class="muted">${esc(ctx.t.progressVsExpected(ctx.percent(progress), ctx.percent(ctx.expected)))}</p></section>`;
}

function objectiveHeadline(ctx, row) {
  const progress = averageProgress(linkedFrom(ctx.records, 'key-results', 'objective', row.id));
  return `<section class="kr-head">${ctx.bar(progress, row.fields.confidence)}<p class="muted">${esc(ctx.t.progressVsExpected(ctx.percent(progress), ctx.percent(ctx.expected)))}</p></section>`;
}

function relatedHtml(ctx, row) {
  const { t, records } = ctx;
  const list = (heading, rows, meta) => (rows.length ? `<section class="detail-section"><h3>${esc(heading)}</h3><ul class="related-list">${rows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${meta(item)}</span></li>`).join('')}</ul></section>` : '');
  const actions = baseByKey('actions');
  const newestFirst = (rows) => [...rows].sort((a, b) => String(b.fields['checked-on'] || '').localeCompare(String(a.fields['checked-on'] || '')));
  switch (row.baseKey) {
    case 'objectives': return list(t.keyResults, linkedFrom(records, 'key-results', 'objective', row.id), (item) => `${ctx.progressCell(krProgress(item), item.fields.status)}${ctx.light(item.fields.status)}`)
      + list(t.supportedBy, linkedFrom(records, 'objectives', 'parent', row.id), (item) => ctx.light(item.fields.confidence));
    case 'key-results': {
      const timeline = newestFirst(linkedFrom(records, 'check-ins', 'key-result', row.id));
      const history = timeline.length ? `<section class="detail-section"><h3>${esc(t.history)}</h3><ol class="timeline">${timeline.map((item) => `<li><div class="timeline-head"><strong>${esc(ctx.amount(item.fields['new-value'], row.fields.unit))}</strong><span class="muted">${esc(ctx.date(item.fields['checked-on']))} · ${esc(safeDisplay(item.fields['written-by']))}</span></div><p>${esc(safeDisplay(item.fields.evidence))}</p></li>`).join('')}</ol></section>` : '';
      return history + list(t.actions, linkedFrom(records, 'actions', 'key-result', row.id), (item) => ctx.badge(actions, 'status', item.fields.status));
    }
    default: return '';
  }
}
