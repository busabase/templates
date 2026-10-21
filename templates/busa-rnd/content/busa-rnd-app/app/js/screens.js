// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import { attentionItems, isOverdue, linkedFrom, overviewMetrics, productSummary, projectProgress, relationIds, safeDisplay, waitingDays } from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };

export function createContext({ locale, messages, records, asOf, route, totals, taskStatusCount }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const peekUrl = (row) => `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`;
  const dateFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const date = (iso) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '-';
    const value = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return (iso.slice(0, 4) === asOf.slice(0, 4) ? dateFormat : longDate).format(value);
  };
  const choice = (base, slug, value) => fieldOf(base, slug)?.options.choices?.find((item) => item.id === value);
  const choiceText = (base, slug, value) => local(choice(base, slug, value)?.localizedName) || safeDisplay(value);
  const badge = (base, slug, value) => (value ? `<span class="badge ${TONE_CLASS[choice(base, slug, value)?.tone] || ''}">${esc(choiceText(base, slug, value))}</span>` : '-');
  const relationLinks = (value) => {
    const ids = relationIds(value);
    if (!ids.length) return '-';
    return ids.map((id) => (index.has(id) ? `<a class="rel-link" href="${peekUrl(index.get(id))}">${esc(title(index.get(id)))}</a>` : `<span class="muted">${esc(t.notLoaded)}</span>`)).join(', ');
  };
  const relationText = (value) => relationIds(value).map((id) => (index.has(id) ? title(index.get(id)) : t.notLoaded)).join(', ') || '-';
  const urlLink = (value) => {
    if (!value || !/^https?:\/\//.test(value)) return '-';
    const label = value.replace(/^https?:\/\/[^/]+\//, '').replace(/\/pull\/(\d+)$/, '#$1').replace(/\/merge_requests\/(\d+)$/, '!$1').replace(/\/commit\/([0-9a-f]{7})[0-9a-f]*$/, '@$1');
    return `<a class="rel-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
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
    if (declared.type === 'markdown') return esc(markdownText(value).slice(0, 140) || '-');
    return esc(safeDisplay(value));
  };
  return { locale, t, local, records, index, asOf, route, totals, taskStatusCount, title, peekUrl, date, choiceText, badge, relationLinks, relationText, urlLink, cell };
}

// ── Overview ───────────────────────────────────────────────────────────────
export function overviewHtml(ctx) {
  const { t, records, asOf } = ctx;
  const days = appConfig.ui.recentDays;
  const metrics = overviewMetrics(records, asOf, days);
  const backlog = ctx.taskStatusCount?.backlog ?? metrics.backlog;
  const band = [[t.mergedRecent(days), metrics.merged], [t.acceptedRecent(days), metrics.accepted], [t.backlog, backlog]]
    .map(([label, value]) => `<div><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

  const items = attentionItems(records, asOf);
  const attention = items.length
    ? `<ul class="attention-list">${items.slice(0, 5).map((item) => `<li><a href="#/attention?peek=${encodeURIComponent(item.record.id)}"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span><span class="attention-title">${esc(ctx.title(item.record))}</span><span class="muted">${esc(productName(ctx, item.record))}</span></a></li>`).join('')}</ul>${items.length > 5 ? `<a class="card-link" href="#/attention">${esc(t.seeAll(items.length))} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingWaiting)}</p>`;

  const report = records.filter((row) => row.baseKey === 'reports' && row.fields.kind === 'weekly').sort((a, b) => String(b.fields['period-end'] || '').localeCompare(String(a.fields['period-end'] || '')))[0];
  const reports = baseByKey('reports');
  const reportCard = report
    ? `<div class="report-head"><strong>${esc(ctx.title(report))}</strong>${ctx.badge(reports, 'status', report.fields.status)}</div><p class="muted">${esc(ctx.date(report.fields['period-start']))} – ${esc(ctx.date(report.fields['period-end']))}</p><p class="report-summary">${esc(safeDisplay(report.fields.summary))}</p><a class="card-link" href="${ctx.peekUrl(report)}">${esc(t.readReport)} →</a>`
    : `<div class="empty-state"><strong>${esc(t.noReport)}</strong><span>${esc(t.askForReport)}</span></div>`;

  const products = records.filter((row) => row.baseKey === 'products' && row.fields.status !== 'retired');
  const projectsBase = baseByKey('projects');
  const rows = products.map((product) => {
    const summary = productSummary(records, product.id, asOf, days);
    const projects = summary.projects.length
      ? summary.projects.map((project) => `<a class="project-chip" href="${ctx.peekUrl(project)}">${ctx.badge(projectsBase, 'health', project.fields.health)}<span>${esc(ctx.title(project))}</span></a>`).join('')
      : `<span class="muted">${esc(t.noProjects)}</span>`;
    const num = (value, tone = '') => `<td class="ws-col-num${value && tone ? ` ${tone}` : ''}">${value}</td>`;
    return `<tr><td class="cell-primary"><a href="${ctx.peekUrl(product)}">${esc(ctx.title(product))}</a></td><td><div class="projects-cell">${projects}</div></td>${num(summary.inProgress)}${num(summary.inReview)}${num(summary.overdue, 'num-danger')}${num(summary.merged)}${num(summary.awaiting, 'num-warning')}</tr>`;
  }).join('');
  const productTable = products.length
    ? `<table class="ws-table product-table"><thead><tr><th>${esc(t.products)}</th><th>${esc(t.liveProjects)}</th><th class="ws-col-num">${esc(t.inProgress)}</th><th class="ws-col-num">${esc(t.inReview)}</th><th class="ws-col-num">${esc(t.overdue)}</th><th class="ws-col-num">${esc(t.mergedShort(days))}</th><th class="ws-col-num">${esc(t.toAccept)}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.empty)}</strong></div>`;

  return { band, attention, attentionCount: items.length, reportCard, productTable };
}

const reasonTone = (reason) => ({ acceptance: 'warning', finalise: 'active', 'off-track': 'danger', 'at-risk': 'warning', overdue: 'danger' })[reason] || '';
const productName = (ctx, row) => (row.baseKey === 'products' ? '' : ctx.relationText(row.fields.product).replace(/^-$/, ''));

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  reports: ['title', 'status', 'kind', 'period-start', 'period-end'],
  deliveries: ['title', 'status', 'product', 'acceptor', 'submitted-on'],
  projects: ['title', 'health', 'status', 'product', 'owner', 'target-date', ':progress'],
  changelog: ['title', 'kind', 'product', 'merged-on', 'version', 'author', 'pr-url'],
  products: ['title', 'status', 'product-key', 'owner', ':open-tasks'],
};

export function tableHtml(ctx, baseKey, rows) {
  const { t } = ctx;
  if (baseKey === 'attention') {
    const head = `<th>${esc(t.item)}</th><th class="col-status">${esc(t.whyHere)}</th><th>${esc(t.table)}</th><th>${esc(t.product)}</th><th class="ws-col-narrow">${esc(t.waiting)}</th>`;
    const body = rows.map((item) => `<tr data-record="${esc(item.record.id)}"${item.record.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}><td class="cell-primary">${esc(ctx.title(item.record))}</td><td class="col-status"><span class="badge ${reasonTone(item.reason)}">${esc(t.reason[item.reason])}</span></td><td>${esc(ctx.local(baseByKey(item.record.baseKey).localizedName))}</td><td>${esc(productName(ctx, item.record) || '-')}</td><td class="ws-col-narrow">${waitingDays(item, ctx.asOf) == null ? '-' : esc(t.days(waitingDays(item, ctx.asOf)))}</td></tr>`).join('');
    return `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const label = (slug) => (slug === ':progress' ? t.progress : slug === ':open-tasks' ? t.inProgress : ctx.local(fieldOf(base, slug).localizedName));
  const klass = (slug) => (slug === base.primary ? 'cell-primary' : slug === base.status || fieldOf(base, slug)?.type === 'select' ? 'col-status' : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : slug.startsWith(':') ? 'ws-col-num' : '');
  const computed = (row, slug) => {
    if (slug === ':progress') { const { done, total } = projectProgress(ctx.records, row.id); return total ? `${done}/${total}` : '-'; }
    if (slug === ':open-tasks') return String(ctx.records.filter((item) => item.baseKey === 'tasks' && relationIds(item.fields.product).includes(row.id) && ['in-progress', 'in-review'].includes(item.fields.status)).length);
    return '';
  };
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(label(slug))}</th>`).join('');
  const body = rows.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${slug.startsWith(':') ? esc(computed(row, slug)) : ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Task board ─────────────────────────────────────────────────────────────
const BOARD = ['backlog', 'todo', 'in-progress', 'in-review', 'done'];
export function boardHtml(ctx, rows) {
  const tasks = baseByKey('tasks');
  const statuses = ctx.route.status ? [ctx.route.status] : BOARD;
  const columns = statuses.map((status) => {
    const cards = rows.filter((row) => row.fields.status === status);
    const exact = ctx.taskStatusCount?.[status];
    const count = status === 'done' || exact == null || ctx.route.query || ctx.route.product ? cards.length : exact;
    return `<section class="board-column" aria-label="${esc(ctx.choiceText(tasks, 'status', status))}"><header>${ctx.badge(tasks, 'status', status)}<span class="board-count">${esc(count)}</span></header><div class="board-cards">${cards.map((row) => cardHtml(ctx, tasks, row)).join('') || `<p class="board-empty muted">-</p>`}</div></section>`;
  }).join('');
  return `<div class="board" data-columns="${statuses.length}">${columns}</div>`;
}
function cardHtml(ctx, tasks, row) {
  const overdue = isOverdue(row, ctx.asOf);
  const due = row.fields['due-date'] ? `<span class="${overdue ? 'due overdue' : 'due'}">${esc(ctx.t.due)} ${esc(ctx.date(row.fields['due-date']))}</span>` : '';
  const done = row.fields['completed-on'] ? `<span class="due">${esc(ctx.date(row.fields['completed-on']))}</span>` : '';
  return `<button class="task-card${row.id === ctx.route.selectedId ? ' selected' : ''}" type="button" data-record="${esc(row.id)}"><span class="task-title">${esc(ctx.title(row))}</span><span class="task-meta">${esc(ctx.relationText(row.fields.product))} · ${esc(safeDisplay(row.fields.assignee) === '-' ? ctx.t.unassigned : safeDisplay(row.fields.assignee))}</span><span class="task-foot">${ctx.badge(tasks, 'priority', row.fields.priority)}${ctx.badge(tasks, 'type', row.fields.type)}${row.fields.status === 'done' ? done : due}</span></button>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
export function detailHtml(ctx, row, attentionReason) {
  let reason = attentionReason;
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const facts = base.fields.filter((item) => item.slug !== base.primary && item.slug !== base.status && !long(item) && !(item.type === 'relation' && item.options.multiple));
  const value = (item) => {
    const raw = row.fields[item.slug];
    if (item.type === 'relation') return ctx.relationLinks(raw);
    if (item.type === 'select') return ctx.badge(base, item.slug, raw);
    if (item.type === 'url') return ctx.urlLink(raw);
    if (item.type === 'date') return esc(ctx.date(raw));
    return esc(safeDisplay(raw));
  };
  const hasValue = (item) => (item.type === 'relation' ? relationIds(row.fields[item.slug]).length > 0 : row.fields[item.slug] != null && row.fields[item.slug] !== '');
  const factRows = facts.filter(hasValue)
    .map((item) => `<div class="field-row"><span>${esc(ctx.local(item.localizedName))}</span><strong>${value(item)}</strong></div>`).join('');
  const sections = base.fields.filter((item) => long(item) && row.fields[item.slug])
    .map((item) => `<section class="detail-section${item.slug === 'body' ? ' report-body' : ''}"><h3>${esc(ctx.local(item.localizedName))}</h3><div class="md">${renderMarkdown(row.fields[item.slug])}</div></section>`).join('');
  const related = relatedHtml(ctx, row);
  reason ||= row.baseKey === 'tasks' && isOverdue(row, ctx.asOf) ? 'overdue' : '';
  const why = reason ? `<p class="why"><span class="badge ${reasonTone(reason)}">${esc(t.reason[reason])}</span></p>` : '';
  const order = row.baseKey === 'reports' ? `${sections}<div class="detail-fields">${factRows}</div>` : `<div class="detail-fields">${factRows}</div>${sections}`;
  return `<h2>${esc(ctx.title(row))}</h2>${why}<div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>${order}${related}`;
}

function relatedHtml(ctx, row) {
  const { t, records } = ctx;
  const list = (heading, rows, meta) => (rows.length ? `<section class="detail-section"><h3>${esc(heading)}</h3><ul class="related-list">${rows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${meta(item)}</span></li>`).join('')}</ul></section>` : '');
  const tasks = baseByKey('tasks'), deliveries = baseByKey('deliveries'), projects = baseByKey('projects');
  const taskMeta = (item) => ctx.badge(tasks, 'status', item.fields.status);
  const changeMeta = (item) => esc(ctx.date(item.fields['merged-on']));
  const deliveryMeta = (item) => ctx.badge(deliveries, 'status', item.fields.status);
  const byIds = (ids) => ids.map((id) => ctx.index.get(id)).filter(Boolean);
  switch (row.baseKey) {
    case 'products': return list(t.relatedProjects, linkedFrom(records, 'projects', 'product', row.id), (item) => ctx.badge(projects, 'health', item.fields.health))
      + list(t.recentChanges, linkedFrom(records, 'changelog', 'product', row.id).slice(0, 8), changeMeta);
    case 'projects': {
      const progress = projectProgress(records, row.id);
      return `<p class="progress-line muted">${esc(progress.total ? t.progressOf(progress.done, progress.total) : t.noTasks)}</p>`
        + list(t.relatedTasks, linkedFrom(records, 'tasks', 'project', row.id), taskMeta)
        + list(t.relatedDeliveries, linkedFrom(records, 'deliveries', 'project', row.id), deliveryMeta);
    }
    case 'tasks': return list(t.relatedChanges, linkedFrom(records, 'changelog', 'task', row.id), changeMeta)
      + list(t.relatedDeliveries, linkedFrom(records, 'deliveries', 'tasks', row.id), deliveryMeta);
    case 'changelog': return list(t.relatedDeliveries, linkedFrom(records, 'deliveries', 'changes', row.id), deliveryMeta);
    case 'deliveries': return list(t.relatedTasks, byIds(relationIds(row.fields.tasks)), taskMeta)
      + list(t.relatedChanges, byIds(relationIds(row.fields.changes)), changeMeta);
    default: return '';
  }
}
