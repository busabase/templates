// HTML for each screen, built from loaded records. Every function takes the
// render context `ctx` (locale, records, index, route helpers) and returns a
// string; app.js owns state, routing and events.
import { appConfig } from './config.js';
import { renderMarkdown, markdownText } from './markdown.js';
import { connectionPrompt, trySayExamples } from './messages.js';
import { bulletLines, dealTimeline, findingsIn, followupsDue, isOpenFollowup, isOverdue, linkedFrom, projectsSeen, relationIds, safeDisplay, weekMetrics } from './model.js';

export const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const fieldOf = (base, slug) => base.fields.find((item) => item.slug === slug);
const TONE_CLASS = { positive: 'positive', warning: 'warning', danger: 'danger', accent: 'active', neutral: '' };

export function createContext({ locale, messages, records, asOf, route, totals, visible }) {
  const t = messages[locale];
  const local = (value) => (value && typeof value === 'object' ? value[locale] || value.en : value);
  const index = new Map(records.map((row) => [row.id, row]));
  const title = (row) => safeDisplay(row.fields[baseByKey(row.baseKey).primary]);
  const pageOf = (row) => appConfig.ui.detail_modes[row.baseKey] === 'page';
  const peekUrl = (row) => (pageOf(row) ? `#/${row.baseKey}/${encodeURIComponent(row.id)}` : `#/${row.baseKey}?peek=${encodeURIComponent(row.id)}`);
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
    return `<a class="rel-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`;
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
    if (declared.type === 'markdown' || declared.type === 'longtext') return esc(markdownText(value || '').slice(0, 120) || '-');
    if (declared.type === 'attachment') return esc(Array.isArray(value) && value.length ? String(value.length) : '-');
    return esc(safeDisplay(value));
  };
  return { locale, t, local, records, index, asOf, route, totals, visible, title, peekUrl, date, choiceText, badge, relationLinks, relationText, urlLink, cell };
}

const dealOf = (ctx, row) => ctx.index.get(relationIds(row.fields.deal)[0]);
const dealChip = (ctx, row) => {
  const deal = dealOf(ctx, row);
  return deal ? `<a class="deal-chip" href="${ctx.peekUrl(deal)}">${esc(ctx.title(deal))}</a>` : `<span class="muted">${esc(ctx.relationText(row.fields.deal))}</span>`;
};

// ── This week ──────────────────────────────────────────────────────────────
export function overviewHtml(ctx, range) {
  const { t, records, asOf } = ctx;
  const soon = appConfig.ui.soonDays;
  const metrics = weekMetrics(records, range, asOf, soon);
  const band = [
    [t.mProjects, metrics.projects, ''],
    [t.mMeetings, metrics.meetings, ''],
    [t.mFindings, metrics.findings, ''],
    [t.mDue(soon), metrics.due, metrics.overdue ? t.mOverdue(metrics.overdue) : ''],
  ].map(([label, value, note]) => `<div><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<em class="metric-note">${esc(note)}</em>` : ''}</div>`).join('');

  const deals = baseByKey('deals'), meetings = baseByKey('meetings');
  const seen = projectsSeen(records, range);
  const seenHtml = seen.length
    ? `<table class="ws-table seen-table"><thead><tr><th>${esc(t.project)}</th><th class="col-status">${esc(t.stage)}</th><th>${esc(t.latestMeeting)}</th><th>${esc(t.by)}</th><th class="ws-col-num">${esc(t.mMeetings)}</th></tr></thead><tbody>${seen.map((entry) => {
      const deal = ctx.index.get(entry.dealId);
      const name = deal ? `<a href="${ctx.peekUrl(deal)}">${esc(ctx.title(deal))}</a>` : esc(t.notLoaded);
      return `<tr><td class="cell-primary">${name}</td><td class="col-status">${deal ? ctx.badge(deals, 'stage', deal.fields.stage) : '-'}</td><td><a class="rel-link" href="${ctx.peekUrl(entry.latest)}">${ctx.badge(meetings, 'kind', entry.latest.fields.kind)} ${esc(ctx.date(entry.latest.fields['held-on']))}</a></td><td>${esc(entry.people.join('、') || '-')}</td><td class="ws-col-num">${esc(entry.meetings.length)}</td></tr>`;
    }).join('')}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(t.weekEmpty)}</strong><span>${esc(t.weekEmptyHint)}</span></div>`;

  const findings = findingsIn(records, range);
  const findingsHtml = findings.length
    ? `<ul class="finding-list">${findings.slice(0, 8).map(({ meeting, text }) => `<li>${dealChip(ctx, meeting)}<span class="finding-text">${esc(text)}</span><a class="finding-src muted" href="${ctx.peekUrl(meeting)}">${esc(ctx.date(meeting.fields['held-on']))}</a></li>`).join('')}</ul>`
    : `<p class="muted">${esc(t.weekEmpty)}</p>`;

  const due = followupsDue(records, asOf, soon);
  const dueHtml = due.length
    ? `<ul class="due-list">${due.slice(0, 8).map(({ record, overdue }) => `<li><a href="${ctx.peekUrl(record)}"><span class="due-title">${esc(ctx.title(record))}</span><span class="due-meta">${esc(ctx.relationText(record.fields.deal))} · ${esc(safeDisplay(record.fields.owner))}</span></a><span class="badge ${overdue ? 'danger' : 'warning'}">${esc(overdue ? t.overdueBadge : t.dueOn)} ${esc(ctx.date(record.fields['due-on']))}</span></li>`).join('')}</ul>${due.length > 8 ? `<a class="card-link" href="#/followups">${esc(t.all)} ${due.length} →</a>` : ''}`
    : `<p class="muted">${esc(t.nothingDue)}</p>`;

  const digest = records.filter((row) => row.baseKey === 'digests').sort((a, b) => String(b.fields['period-end'] || '').localeCompare(String(a.fields['period-end'] || '')))[0];
  const digestHtml = digest
    ? `<div class="report-head"><strong>${esc(ctx.title(digest))}</strong>${ctx.badge(baseByKey('digests'), 'status', digest.fields.status)}</div><p class="muted">${esc(ctx.date(digest.fields['period-start']))} – ${esc(ctx.date(digest.fields['period-end']))}</p><p class="report-summary">${esc(markdownText(digest.fields['for-leadership'] || digest.fields.body || '').slice(0, 160))}</p><a class="card-link" href="${ctx.peekUrl(digest)}">${esc(t.readDigest)} →</a>`
    : `<div class="empty-state"><strong>${esc(t.noDigest)}</strong><span>${esc(t.askDigest)}</span></div>`;

  return { band, seenHtml, findingsHtml, dueHtml, digestHtml };
}

// ── Lists ──────────────────────────────────────────────────────────────────
// Which columns each table shows, chosen for what people scan for — not the
// declaration order. In the narrow split queue only the first two survive.
const COLUMNS = {
  deals: ['name', 'stage', 'sector', 'round', 'owner', 'last-meeting-on', 'next-step', 'next-step-due'],
  meetings: ['title', 'kind', 'phase', 'deal', 'held-on', 'recorded-by', 'logged-via'],
  digests: ['title', 'status', 'period-start', 'period-end', 'projects-seen'],
  'ic-notes': ['title', 'decision', 'deal', 'decided-on'],
};

export function tableHtml(ctx, baseKey, rows) {
  const base = baseByKey(baseKey);
  const columns = COLUMNS[baseKey];
  const klass = (slug) => (slug === base.primary ? 'cell-primary' : fieldOf(base, slug)?.type === 'select' ? 'col-status' : fieldOf(base, slug)?.type === 'date' ? 'ws-col-narrow' : fieldOf(base, slug)?.type === 'number' ? 'ws-col-num' : '');
  const head = columns.map((slug) => `<th class="${klass(slug)}">${esc(ctx.local(fieldOf(base, slug).localizedName))}</th>`).join('');
  const body = rows.map((row) => `<tr data-record="${esc(row.id)}"${row.id === ctx.route.selectedId ? ' class="ws-selected"' : ''}>${columns.map((slug) => `<td class="${klass(slug)}">${ctx.cell(row, slug)}</td>`).join('')}</tr>`).join('');
  return `<table class="ws-table table-${baseKey}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Follow-up board ────────────────────────────────────────────────────────
const BOARD = ['open', 'in-progress', 'done'];
export function boardHtml(ctx, rows) {
  const base = baseByKey('followups');
  const statuses = ctx.route.status ? [ctx.route.status] : BOARD;
  const columns = statuses.map((status) => {
    const cards = rows.filter((row) => row.fields.status === status);
    return `<section class="board-column" aria-label="${esc(ctx.choiceText(base, 'status', status))}"><header>${ctx.badge(base, 'status', status)}<span class="board-count">${esc(cards.length)}</span></header><div class="board-cards">${cards.map((row) => cardHtml(ctx, base, row)).join('') || `<p class="board-empty muted">-</p>`}</div></section>`;
  }).join('');
  return `<div class="board" data-columns="${statuses.length}">${columns}</div>`;
}
function cardHtml(ctx, base, row) {
  const overdue = isOverdue(row, ctx.asOf);
  const due = row.fields.status === 'done'
    ? (row.fields['done-on'] ? `<span class="due">${esc(ctx.date(row.fields['done-on']))}</span>` : '')
    : (row.fields['due-on'] ? `<span class="${overdue ? 'due overdue' : 'due'}">${esc(overdue ? ctx.t.overdueBadge : ctx.t.dueOn)} ${esc(ctx.date(row.fields['due-on']))}</span>` : '');
  return `<button class="task-card${row.id === ctx.route.selectedId ? ' selected' : ''}" type="button" data-record="${esc(row.id)}"><span class="task-title">${esc(ctx.title(row))}</span><span class="task-meta">${esc(ctx.relationText(row.fields.deal))} · ${esc(safeDisplay(row.fields.owner))}</span><span class="task-foot">${row.fields.priority === 'high' ? ctx.badge(base, 'priority', 'high') : ''}${due}</span></button>`;
}

// ── Detail ─────────────────────────────────────────────────────────────────
export function detailHtml(ctx, row) {
  const base = baseByKey(row.baseKey);
  const { t } = ctx;
  const long = (item) => ['longtext', 'markdown'].includes(item.type);
  const facts = base.fields.filter((item) => item.slug !== base.primary && item.slug !== base.status && !long(item) && item.type !== 'attachment');
  const value = (item) => {
    const raw = row.fields[item.slug];
    if (item.type === 'relation') return ctx.relationLinks(raw);
    if (item.type === 'select') return ctx.badge(base, item.slug, raw);
    if (item.type === 'url') return ctx.urlLink(raw);
    if (item.type === 'date') return esc(ctx.date(raw));
    return esc(safeDisplay(raw));
  };
  const hasValue = (item) => (item.type === 'relation' ? relationIds(row.fields[item.slug]).length > 0 : row.fields[item.slug] != null && row.fields[item.slug] !== '');
  const factRows = facts.filter(hasValue).map((item) => `<div class="field-row"><span>${esc(ctx.local(item.localizedName))}</span><strong>${value(item)}</strong></div>`).join('');
  // The transcript is the raw source: keep it last and collapsed.
  const sections = base.fields.filter((item) => long(item) && row.fields[item.slug] && item.slug !== 'transcript')
    .map((item) => `<section class="detail-section section-${item.slug}"><h3>${esc(ctx.local(item.localizedName))}</h3><div class="md">${renderMarkdown(row.fields[item.slug])}</div></section>`).join('');
  const transcript = row.fields.transcript ? `<details class="detail-section transcript"><summary>${esc(ctx.local(fieldOf(base, 'transcript').localizedName))}</summary><pre>${esc(row.fields.transcript)}</pre></details>` : '';
  const files = Array.isArray(row.fields.files) && row.fields.files.length
    ? `<section class="detail-section"><h3>${esc(ctx.local(fieldOf(base, 'files').localizedName))}</h3><ul class="related-list">${row.fields.files.map((file) => `<li><a href="${esc(file.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(file.fileName || file.name || '-')}</a></li>`).join('')}</ul></section>` : '';
  const head = `<h2>${esc(ctx.title(row))}</h2><div class="detail-badge">${ctx.badge(base, base.status, row.fields[base.status])}</div>`;
  if (row.baseKey === 'deals') return dealHtml(ctx, row, head, factRows, sections);
  if (row.baseKey === 'digests') return `${head}${sections}<div class="detail-fields">${factRows}</div>`;
  const related = row.baseKey === 'meetings' ? followupList(ctx, t.fromThisMeeting, linkedFrom(ctx.records, 'followups', 'meeting', row.id)) : '';
  return `${head}<div class="detail-fields">${factRows}</div>${sections}${related}${files}${transcript}`;
}

function followupList(ctx, heading, rows) {
  if (!rows.length) return '';
  const base = baseByKey('followups');
  return `<section class="detail-section"><h3>${esc(heading)}</h3><ul class="related-list">${rows.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${esc(safeDisplay(item.fields.owner))} · ${isOverdue(item, ctx.asOf) ? `<span class="badge danger">${esc(ctx.t.overdueBadge)}</span>` : ctx.badge(base, 'status', item.fields.status)}</span></li>`).join('')}</ul></section>`;
}

/** A project's page: the single entry point for everything about the company. */
function dealHtml(ctx, row, head, factRows, sections) {
  const { t } = ctx;
  const meetings = baseByKey('meetings');
  const timeline = dealTimeline(ctx.records, row.id);
  const timelineHtml = timeline.length
    ? timeline.map((group) => `<div class="phase-group phase-${group.phase}"><h4>${esc(t.phase[group.phase])}<span>${esc(t.meetingsCount(group.meetings.length))}</span></h4><ol class="timeline">${group.meetings.map((meeting) => {
      const finding = bulletLines(meeting.fields.highlights)[0];
      // Titles follow `date · project · type`; on the project's own page only what is left is news.
      const rest = ctx.title(meeting).replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, '').replace(`${ctx.title(row)} · `, '');
      const label = rest === ctx.choiceText(meetings, 'kind', meeting.fields.kind) ? '' : rest;
      return `<li><a href="${ctx.peekUrl(meeting)}"><span class="tl-date">${esc(ctx.date(meeting.fields['held-on']))}</span>${ctx.badge(meetings, 'kind', meeting.fields.kind)}${label ? `<span class="tl-title">${esc(label)}</span>` : ''}</a>${finding ? `<p class="tl-finding">${esc(finding)}</p>` : ''}<p class="tl-meta muted">${esc(safeDisplay(meeting.fields['recorded-by']))}${meeting.fields['logged-via'] ? ` · ${esc(meeting.fields['logged-via'])}` : ''}</p></li>`;
    }).join('')}</ol></div>`).join('')
    : `<p class="muted">${esc(t.noMeetings)}</p>`;
  const followups = linkedFrom(ctx.records, 'followups', 'deal', row.id);
  const open = followups.filter(isOpenFollowup).sort((a, b) => String(a.fields['due-on'] || '9').localeCompare(String(b.fields['due-on'] || '9')));
  const done = followups.filter((item) => item.fields.status === 'done');
  const ic = ctx.visible.has('ic-notes') ? linkedFrom(ctx.records, 'ic-notes', 'deal', row.id) : [];
  const icHtml = ic.length
    ? `<section class="detail-section ic-section"><h3>${esc(t.icTitle)}</h3><ul class="related-list">${ic.map((item) => `<li><a href="${ctx.peekUrl(item)}">${esc(ctx.title(item))}</a><span>${ctx.badge(baseByKey('ic-notes'), 'decision', item.fields.decision)}</span></li>`).join('')}</ul></section>`
    : '';
  const partial = ctx.route.meetingsTruncated ? `<p class="muted small">${esc(t.partialTimeline)}</p>` : '';
  return `<div class="deal-page"><div class="deal-main">${head}<p class="deal-oneliner">${esc(safeDisplay(row.fields['one-liner']))}</p><section class="detail-section"><h3>${esc(t.timeline)}</h3>${timelineHtml}${partial}</section></div>
    <aside class="deal-side">${followupList(ctx, t.openFollowups, open) || `<section class="detail-section"><h3>${esc(t.openFollowups)}</h3><p class="muted">${esc(t.noFollowups)}</p></section>`}${icHtml}${sections.replace(/<section class="detail-section section-one-liner">[\s\S]*?<\/section>/, '')}<div class="detail-fields">${factRows}</div>${followupList(ctx, t.doneFollowups, done)}</aside></div>`;
}

// ── Connect your agent ─────────────────────────────────────────────────────
export function connectHtml(ctx, { baseUrl, folderName, space, copied }) {
  const { t, locale } = ctx;
  const text = connectionPrompt(locale, { baseUrl, folderName, space });
  const steps = [[t.stepCopy, t.stepCopyBody], [t.stepPaste, t.stepPasteBody], [t.stepApprove, t.stepApproveBody], [t.stepUse, t.stepUseBody]];
  return `<header class="page-hero"><div><span class="page-hero-context">${esc(folderName)}</span><h1>${esc(t.connectTitle)}</h1><p>${esc(t.connectLead)}</p></div></header>
    <ol class="connect-steps">${steps.map(([title, body], index) => `<li><span class="step-no">${index + 1}</span><strong>${esc(title)}</strong><span>${esc(body)}</span></li>`).join('')}</ol>
    <div class="connect-grid">
      <section class="card prompt-card"><div class="prompt-head"><h2 class="card-title">${esc(t.promptLabel)}</h2><button class="button primary" id="copyPrompt" type="button"><i data-lucide="${copied ? 'check' : 'copy'}"></i><span>${esc(copied ? t.copied : t.copy)}</span></button></div>
        <label class="server-field"><span>${esc(t.serverLabel)}</span><input id="serverInput" type="url" value="${esc(baseUrl)}" spellcheck="false"><small class="muted">${esc(t.serverHint)}</small></label>
        <pre class="prompt-text" id="promptText">${esc(text)}</pre>
        <p class="muted small">${esc(t.mcpNote)} <code>${esc(baseUrl.replace(/\/$/, ''))}/api/mcp</code></p></section>
      <div class="connect-side">
        <section class="card"><h2 class="card-title">${esc(t.trySay)}</h2><ul class="say-list">${trySayExamples[locale].map((line) => `<li>${locale === 'zh-CN' ? `「${esc(line)}」` : `“${esc(line)}”`}</li>`).join('')}</ul></section>
        <section class="card"><h2 class="card-title">${esc(t.permissionTitle)}</h2><p>${esc(t.permissionBody)}</p></section>
      </div>
    </div>`;
}
export const promptText = connectionPrompt;
