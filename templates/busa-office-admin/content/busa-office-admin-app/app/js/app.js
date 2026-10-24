import { createAirAppConnectGate } from '../vendor/busabase-airapp-gate.js';
import { renderIcons } from '../vendor/icons.js';
import { appConfig } from './config.js';
import { messages } from './messages.js';
import { getProvider } from './providers/index.js';
import { detectAirAppRuntime } from '../vendor/busabase-airapp.js';
import { needsAttention, safeDisplay, mergePage } from './office-model.js';

// Where a record opens, per view. Chosen by what people do with the record:
//   certificates → drawer: a certificate is a fact scanned among many — check
//                  the expiry and evidence, then return to the list.
//   contracts    → drawer: same shape — confirm the end date, owner and review
//                  note, back to the list.
//   sources      → drawer: an archive lookup — find the document, read its
//                  custodian and location, move on.
//   checks       → split:  verification tasks are a queue worked top to bottom.
//   attention    → split:  the cross-ledger review queue, also worked one item
//                  after the next (a derived view, so not in the blueprint).
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// The Base modes are declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = { ...appConfig.ui.detail_modes, attention: 'split' };
const BASE_KEYS = appConfig.bases.map((base) => base.key);
const RECORD_VIEWS = ['attention', ...BASE_KEYS];

const state = { locale: new URLSearchParams(location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en', route: null, payload: null, summary: null, extra: new Map(), runtime: null, provider: null, generation: 0, morePending: false, loading: false };
const $ = (id) => document.getElementById(id);
const tr = (key) => messages[state.locale][key];
const local = (value) => typeof value === 'object' && value ? value[state.locale] || value.en : value;
const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const valueText = safeDisplay;
const baseFor = (record) => appConfig.bases.find((base) => base.key === record.baseKey);
const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const all = () => state.payload?.records || [];
const asOf = () => state.payload?.asOf || appConfig.asOf;
const attention = (record) => needsAttention(record, baseFor(record), asOf());
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
const choice = (base, value) => base.fields.find((field) => field.slug === base.status)?.options.choices?.find((option) => option.id === value);
// An unknown option id is not shown raw: '-' rather than a machine value.
const statusText = (base, value) => local(choice(base, value)?.localizedName) || '-';
const badge = (record) => `<span class="badge ${attention(record) ? 'warning' : 'positive'}">${esc(statusText(baseFor(record), record.fields[baseFor(record).status]))}</span>`;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the status filter and
// the peeked record live in the URL, so refresh, shared links and Back restore
// the same list context. The old `#certificates` form still resolves.
function parseRoute() {
  const raw = (location.hash || '#/overview').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || 'overview';
  let id = '';
  try { id = parts[1] ? decodeURIComponent(parts[1]) : ''; } catch { id = ''; }
  if (!RECORD_VIEWS.includes(view)) { view = 'overview'; id = ''; }
  if (view === 'attention') id = '';
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== 'page' && !id ? params.get('peek') || '' : '';
  const base = baseByKey(view);
  const status = params.get('status') || '';
  return {
    view, id, peek,
    selectedId: mode ? id || peek : '',
    presentation: !mode ? null : id ? 'page' : mode === 'page' ? null : peek ? mode : null,
    query: params.get('q') || '',
    status: base && choice(base, status) ? status : '',
  };
}
const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.status) params.set('status', route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};
const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in its own Base's path, whatever the view's mode.
const detailUrl = (record) => {
  const route = record.baseKey === state.route.view ? state.route : { view: record.baseKey, query: '', status: '' };
  return `#/${record.baseKey}/${encodeURIComponent(record.id)}${routeQuery({}, route)}`;
};
// What a row opens in the current view: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === 'page') return `#/${view}/${encodeURIComponent(id)}${routeQuery()}`;
  const route = view === state.route.view ? state.route : { view, query: '', status: '' };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its list marks the entry, so Back/Close/Escape step
  // back to that exact list entry instead of pushing a new one.
  if (previous && state.route.selectedId && previousRouteWasList && previous.view === state.route.view) history.replaceState({ fromList: true }, '');
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  $('searchInput').value = state.route.query;
  closeSidebar();
  render();
}
// Search keystrokes and filter changes replace the entry: not one Back step each.
function replaceRoute(url) {
  history.replaceState(history.state, '', url);
  const wasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = wasList;
  render();
}
function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Records ────────────────────────────────────────────────────────────────
function matchesQuery(record, query) {
  if (!query) return true;
  const base = baseFor(record);
  const text = [...Object.values(record.fields).map((value) => String(value ?? '')), statusText(base, record.fields[base.status]), local(base.localizedName)].join(' ').toLowerCase();
  return text.includes(query.toLowerCase());
}
function filtered() {
  const { view, query, status } = state.route;
  const rows = all().filter((record) => {
    if (view === 'attention' ? !attention(record) : record.baseKey !== view) return false;
    if (status && record.fields[baseFor(record).status] !== status) return false;
    return matchesQuery(record, query);
  });
  // The review queue is worked most urgent first.
  if (view === 'attention') rows.sort((a, b) => String(a.fields[baseFor(a).date] || '9999').localeCompare(String(b.fields[baseFor(b).date] || '9999')));
  return rows;
}
// The record the URL names: from the loaded page, else from a one-off
// records.get (Base views only — the review queue is built from loaded rows).
function selectedRecord() {
  const { view, selectedId } = state.route;
  if (!selectedId) return null;
  const loaded = all().find((row) => row.id === selectedId && (view === 'attention' || row.baseKey === view));
  if (loaded) return loaded;
  const extra = state.extra.get(selectedId);
  return extra && extra !== 'pending' && extra.baseKey === view ? extra : null;
}
function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.payload || !selectedId || !BASE_KEYS.includes(view) || selectedRecord() || state.extra.has(selectedId) || !state.provider?.getRecord) return;
  state.extra.set(selectedId, 'pending');
  const generation = state.generation;
  state.provider.getRecord(view, selectedId)
    .then((record) => { if (generation === state.generation) state.extra.set(selectedId, record || null); })
    .catch(() => { if (generation === state.generation) state.extra.set(selectedId, null); })
    .finally(() => { if (generation === state.generation) render(); });
}
const partialFor = (key) => Boolean(state.payload?.pageInfo[key]?.nextCursor);

// ── Shell ──────────────────────────────────────────────────────────────────
function closeSidebar() { document.body.classList.remove('sidebar-open'); $('sidebarScrim').hidden = true; }
const viewName = (view) => view === 'overview' ? tr('overview') : view === 'attention' ? tr('attention') : local(baseByKey(view).localizedName);
function renderNavigation() {
  const items = [{ key: 'overview', icon: 'layout-dashboard' }, { key: 'attention', icon: 'circle-alert' }, ...appConfig.bases.map((base) => ({ key: base.key, icon: base.key === 'sources' ? 'archive' : base.key === 'checks' ? 'file-check' : 'files' }))];
  $('baseNav').innerHTML = items.map((item) => {
    const count = state.payload?.totalCount[item.key];
    const loaded = all().filter((row) => row.baseKey === item.key).length;
    const countText = !state.payload ? '' : state.payload.failures.includes(item.key) ? '-' : count == null ? `${loaded}${partialFor(item.key) ? '+' : ''}` : count;
    return `<button type="button" class="nav-item ${item.key === state.route.view ? 'active' : ''}" data-route="${item.key}"><span><i data-lucide="${item.icon}"></i>${esc(viewName(item.key))}</span>${['overview', 'attention'].includes(item.key) || !state.payload ? '' : `<span>${countText}</span>`}</button>`;
  }).join('');
}
function renderChrome() {
  document.documentElement.lang = state.locale;
  document.documentElement.style.setProperty('--accent', appConfig.brand.accent);
  document.title = local(appConfig.title);
  $('brandName').textContent = local(appConfig.title); $('brandDescription').textContent = local(appConfig.ui.summary);
  $('mobileTitle').textContent = state.route.view === 'overview' ? local(appConfig.title) : viewName(state.route.view);
  $('attentionTitle').textContent = tr('attention'); $('attentionValue').textContent = state.payload ? all().filter(attention).length : '-'; $('attentionCopy').textContent = tr('scope');
  $('searchLabel').textContent = tr('search'); $('searchInput').placeholder = tr('search');
  $('guideOpen').textContent = tr('guide'); $('guideTitle').textContent = tr('guide'); $('guideSummary').textContent = local(appConfig.localizedDescription); $('guideBoundary').textContent = local(appConfig.boundary);
  $('locale').value = state.locale; $('locale').setAttribute('aria-label', tr('language'));
  $('baseNav').setAttribute('aria-label', tr('views'));
  $('metrics').setAttribute('aria-label', tr('metrics'));
  $('sidebarScrim').setAttribute('aria-label', tr('close'));
  $('refreshLabel').textContent = tr('refresh');
  for (const id of ['refresh', 'refreshMobile', 'refreshView']) { $(id).title = tr('refresh'); $(id).setAttribute('aria-label', tr('refresh')); }
  for (const id of ['guideClose', 'sidebarClose']) { $(id).title = tr('close'); $(id).setAttribute('aria-label', tr('close')); }
  $('sidebarOpen').setAttribute('aria-label', tr('open')); $('sidebarOpen').title = tr('open');
  $('partialState').hidden = !state.payload?.failures.length; $('partialState').textContent = tr('partial');
  $('staleState').hidden = !state.payload || Date.now() - Date.parse(state.payload.refreshedAt) < 900000; $('staleState').textContent = tr('stale');
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three figures nothing else on screen shows. Each is an exact server count
// (records.count with exact valueFilters), not a tally of the loaded page.
const horizon = () => new Date(Date.parse(asOf()) + 60 * 86400000).toISOString().slice(0, 10);
const summaryQueries = () => ({
  due: [['certificates', [{ fieldSlug: 'expires', operator: 'lte', value: `${horizon()}T23:59:59.999Z` }, { fieldSlug: 'status', operator: 'ne', value: 'archived' }]], ['contracts', [{ fieldSlug: 'expires', operator: 'lte', value: `${horizon()}T23:59:59.999Z` }, { fieldSlug: 'status', operator: 'ne', value: 'archived' }]]],
  conflicts: [['certificates', [{ fieldSlug: 'status', operator: 'eq', value: 'conflict' }]], ['sources', [{ fieldSlug: 'status', operator: 'eq', value: 'conflict' }]]],
  originals: [['sources', [{ fieldSlug: 'status', operator: 'eq', value: 'copy-only' }]]],
});
async function loadSummary(provider, generation) {
  if (!provider.count) return;
  const entries = await Promise.all(Object.entries(summaryQueries()).map(async ([key, parts]) => {
    const counts = await Promise.all(parts.map(([base, filters]) => provider.count(base, filters)));
    return [key, counts.some((value) => value == null) ? null : counts.reduce((sum, value) => sum + value, 0)];
  }));
  if (generation !== state.generation) return;
  state.summary = Object.fromEntries(entries);
  if (state.route.view === 'overview') renderOverview();
}
function renderOverview() {
  $('overviewTitle').textContent = local(appConfig.title);
  $('overviewSummary').textContent = `${local(appConfig.localizedDescription)} ${tr('asOf')} ${asOf()}.`;
  const figure = (key) => state.summary?.[key] == null ? '—' : String(state.summary[key]);
  $('metrics').innerHTML = [[tr('due'), figure('due')], [tr('conflicts'), figure('conflicts')], [tr('originals'), figure('originals')]].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  $('metrics').title = tr('overviewScope');
  const queue = all().filter(attention).sort((a, b) => String(a.fields[baseFor(a).date] || '9999').localeCompare(String(b.fields[baseFor(b).date] || '9999')));
  const reviewRows = queue.slice(0, 6).map((record) => {
    const base = baseFor(record);
    return `<a class="overview-row" href="${esc(recordUrl(record.id, 'attention'))}"><span class="overview-row-main"><strong>${esc(valueText(record.fields[base.primary]))}</strong><small>${esc(local(base.localizedName))} · ${esc(valueText(record.fields[base.date]))}</small></span>${badge(record)}</a>`;
  }).join('') || `<div class="empty-inline">${esc(tr('noAttention'))}</div>`;
  const ledgerRows = appConfig.bases.map((base) => {
    // Per-ledger split of the sidebar's review number (loaded rows, like it).
    const waiting = all().filter((row) => row.baseKey === base.key && attention(row)).length;
    const failed = state.payload?.failures.includes(base.key);
    return `<a class="overview-row" href="#/${base.key}"><span class="overview-row-main"><strong>${esc(local(base.localizedName))}</strong><small>${esc(local(base.localizedDescription))}</small></span><span class="overview-row-meta">${failed ? '-' : `${waiting}${partialFor(base.key) ? '+' : ''} ${esc(tr('waiting'))}`}</span></a>`;
  }).join('');
  $('overviewBody').innerHTML = `<section class="card overview-card"><header class="overview-card-head"><h2 title="${esc(tr('scope'))}">${esc(tr('attention'))}</h2><a class="button" href="#/attention">${esc(tr('viewQueue'))}</a></header>${reviewRows}</section><section class="card overview-card"><header class="overview-card-head"><h2>${esc(tr('ledgers'))}</h2></header>${ledgerRows}</section>`;
}

// ── Record views ───────────────────────────────────────────────────────────
function columnsFor(view) {
  if (view === 'attention') {
    return [
      { label: tr('item'), cell: (r) => valueText(r.fields[baseFor(r).primary]) },
      { label: tr('status'), cls: 'col-status', html: badge },
      { label: tr('ledger'), cls: 'col-ledger', cell: (r) => local(baseFor(r).localizedName) },
      { label: local(baseByKey('certificates').fields.find((f) => f.slug === 'owner').localizedName), cell: (r) => valueText(r.fields.owner ?? r.fields.custodian) },
      { label: tr('keyDate'), cls: 'col-date', cell: (r) => valueText(r.fields[baseFor(r).date]) },
    ];
  }
  const base = baseByKey(view);
  const field = (slug) => base.fields.find((item) => item.slug === slug);
  return [
    { label: local(field(base.primary).localizedName), cell: (r) => valueText(r.fields[base.primary]) },
    { label: local(field(base.status).localizedName), cls: 'col-status', html: badge },
    ...base.secondary.map((slug) => ({ label: local(field(slug).localizedName), cls: field(slug).type === 'date' ? 'col-date' : '', cell: (r) => valueText(r.fields[slug]) })),
  ];
}
function renderFilters() {
  const base = baseByKey(state.route.view);
  const status = base?.fields.find((field) => field.slug === base.status);
  $('statusFilter').hidden = !base;
  $('statusFilter').setAttribute('aria-label', tr('filters'));
  $('statusFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${(status?.options.choices || []).map((option) => `<option value="${esc(option.id)}">${esc(local(option.localizedName))}</option>`).join('')}`;
  $('statusFilter').value = state.route.status;
}
function renderList() {
  const { view, query, status, selectedId } = state.route;
  const rows = filtered();
  const base = baseByKey(view);
  $('viewTitle').textContent = viewName(view);
  $('viewTitle').title = base ? local(base.localizedDescription) : tr('scope');
  $('recordCount').textContent = `${rows.length}${base && partialFor(base.key) ? '+' : ''}`;
  const columns = columnsFor(view);
  // A ledger whose page could not be read is not an empty ledger.
  const failed = base && state.payload?.failures.includes(base.key);
  $('recordList').innerHTML = failed ? `<div class="empty-state"><strong>${esc(tr('ledgerFailed'))}</strong></div>` : rows.length
    ? `<table class="ws-table office-table"><thead><tr>${columns.map((col) => `<th scope="col" class="${col.cls || ''}">${esc(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((record) => `<tr data-record="${esc(record.id)}"${record.id === selectedId ? ' class="ws-selected"' : ''}>${columns.map((col) => `<td class="${col.cls || ''}">${col.html ? col.html(record) : esc(col.cell(record))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<div class="empty-state"><strong>${esc(query || status ? tr('matches') : view === 'attention' ? tr('noAttention') : tr('empty'))}</strong>${query || status ? `<button class="button" data-clear type="button">${esc(tr('clear'))}</button>` : ''}</div>`;
  $('loadMore').hidden = !base || !partialFor(base.key);
  $('loadMore').disabled = state.morePending;
  $('loadMore').textContent = tr('more');
}
function fieldText(field, value) {
  if (field.type === 'select') return local(field.options.choices?.find((item) => item.id === value)?.localizedName) || '-';
  if (field.type === 'number') return typeof value === 'number' ? new Intl.NumberFormat(state.locale).format(value) : tr('unavailable');
  return valueText(value);
}
function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const record = selectedRecord();
  $('detailBar').hidden = !selectedId;
  $('backButton').textContent = presentation === 'page' || isPhone() ? tr('back') : tr('closeDetail');
  $('openFull').hidden = !record || presentation === 'page';
  $('openFull').textContent = tr('openFull');
  if (record) $('openFull').href = detailUrl(record);
  const pending = selectedId && state.extra.get(selectedId) === 'pending';
  $('detailEmpty').hidden = Boolean(record) || (!selectedId && DETAIL_MODES[view] !== 'split');
  $('detailEmpty').textContent = !selectedId ? (view === 'attention' ? tr('selectQueue') : tr('select')) : pending || !state.payload ? tr('recordLoading') : tr('notLoaded');
  $('detailContent').hidden = !record;
  if (!record) return;
  const base = baseFor(record);
  // The view name is already in the toolbar; only the cross-ledger queue
  // labels which ledger a record came from.
  $('detailEyebrow').hidden = view !== 'attention';
  $('detailEyebrow').textContent = local(base.localizedName);
  $('detailTitle').textContent = valueText(record.fields[base.primary]);
  $('detailBadge').innerHTML = badge(record);
  $('detailFields').innerHTML = base.fields.filter((field) => ![base.primary, base.status, 'notes'].includes(field.slug)).map((field) => `<div class="field-row"><span>${esc(local(field.localizedName))}</span><strong>${esc(fieldText(field, record.fields[field.slug]))}</strong></div>`).join('');
  $('evidenceTitle').textContent = tr('evidence'); $('detailNotes').textContent = valueText(record.fields.notes);
}

function render() {
  const { view, selectedId, presentation, query, status } = state.route;
  const ready = Boolean(state.payload);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle('ws-detail-open', onRecordView && Boolean(selectedId));
  body.toggle('ws-detail-page', onRecordView && presentation === 'page' && Boolean(selectedId));
  body.toggle('ws-detail-drawer', onRecordView && presentation === 'drawer');
  body.toggle('ws-layout-split', onRecordView && DETAIL_MODES[view] === 'split' && presentation !== 'page');
  body.toggle('ws-searching', onRecordView && Boolean(query || status));
  renderChrome();
  renderNavigation();
  $('overviewPage').hidden = !ready || view !== 'overview';
  $('viewPage').hidden = !onRecordView;
  if (ready && view === 'overview') renderOverview();
  if (onRecordView) { renderFilters(); renderList(); renderDetail(); ensureSelectedRecord(); }
  renderIcons();
}

// ── Data ───────────────────────────────────────────────────────────────────
const isDemo = () => new URLSearchParams(location.search).get('demo') === '1';
const gate = createAirAppConnectGate({ appName: appConfig.appName, demoHref: '?demo=1', shouldGate: () => !isDemo() && !state.runtime?.hosted, onProvision: () => { throw new Error('Install the template package to initialize its resources.'); } });
async function load() {
  const generation = ++state.generation;
  $('loadingState').textContent = tr('loading'); $('errorState').hidden = true; $('retry').hidden = true;
  try {
    state.runtime = await detectAirAppRuntime();
    if (!isDemo() && !state.runtime.determined) throw new Error('BRIDGE_UNAVAILABLE: Runtime could not be determined.');
    if (!(await gate.pass({ onReady: load }))) { $('loadingState').textContent = ''; return; }
    state.provider = await getProvider();
    const payload = await state.provider.getState();
    if (generation !== state.generation) return;
    state.payload = payload;
    state.summary = null;
    state.extra = new Map();
    render();
    loadSummary(state.provider, generation);
  } catch (error) {
    if (generation !== state.generation) return;
    state.payload = null; render();
    const reason = String(error?.message || error);
    $('errorState').hidden = false; $('errorState').textContent = /DENIED|FORBIDDEN/.test(reason) ? tr('permission') : /SCHEMA|SETUP/.test(reason) ? tr('setup') : tr('error');
    $('retry').hidden = false; $('retry').textContent = tr('retry');
  } finally { if (generation === state.generation) $('loadingState').textContent = ''; }
}
async function loadMore() {
  const key = state.route.view, cursor = state.payload?.pageInfo[key]?.nextCursor, generation = state.generation;
  if (!cursor || state.morePending) return;
  state.morePending = true; renderList();
  try {
    const page = await state.provider.loadMore(key, cursor);
    if (generation !== state.generation) return;
    state.payload.records = mergePage(state.payload.records, page.records);
    state.payload.pageInfo[key] = { nextCursor: page.nextCursor };
  } catch { $('partialState').hidden = false; $('partialState').textContent = tr('partial'); }
  finally { state.morePending = false; if (generation === state.generation) render(); }
}

// ── Events ─────────────────────────────────────────────────────────────────
$('baseNav').addEventListener('click', (event) => { const button = event.target.closest('[data-route]'); if (button) location.hash = `#/${button.dataset.route}`; closeSidebar(); });
$('attentionOpen').onclick = () => { location.hash = '#/attention'; closeSidebar(); };
$('recordList').addEventListener('click', (event) => {
  if (event.target.closest('[data-clear]')) { $('searchInput').value = ''; replaceRoute(`#/${state.route.view}`); return; }
  const row = event.target.closest('tr[data-record]');
  if (!row) return;
  const url = recordUrl(row.dataset.record);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) { history.replaceState(history.state, '', url); setRoute(); } else location.hash = url;
});
$('searchInput').oninput = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: event.target.value })}`);
$('statusFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, status: event.target.value })}`);
$('locale').onchange = (event) => { state.locale = event.target.value; const url = new URL(location.href); url.searchParams.set('lang', state.locale); history.replaceState(history.state, '', url); render(); };
$('sidebarOpen').onclick = () => { document.body.classList.add('sidebar-open'); $('sidebarScrim').hidden = false; };
$('sidebarClose').onclick = closeSidebar; $('sidebarScrim').onclick = closeSidebar;
$('backButton').onclick = closeDetail;
$('guideOpen').onclick = () => { $('guideDialog').showModal(); $('guideClose').focus(); };
$('guideClose').onclick = () => { $('guideDialog').close(); $('guideOpen').focus(); };
for (const id of ['refresh', 'refreshMobile', 'refreshView', 'retry']) $(id).onclick = load;
$('loadMore').onclick = loadMore;
window.addEventListener('hashchange', setRoute);
window.addEventListener('resize', () => { if (state.route.selectedId) renderDetail(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('guideDialog').open) return;
  if (document.body.classList.contains('sidebar-open')) { closeSidebar(); return; }
  if (event.target.closest?.('input, select')) { event.target.blur(); return; }
  const { selectedId, presentation } = state.route;
  if (selectedId && presentation && presentation !== 'page') closeDetail();
});
state.route = parseRoute();
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
$('searchInput').value = state.route.query;
render(); load();
