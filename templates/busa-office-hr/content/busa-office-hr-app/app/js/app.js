import { createAirAppConnectGate } from '../vendor/busabase-airapp-gate.js';
import { renderIcons } from '../vendor/icons.js';
import { appConfig } from './config.js';
import { messages } from './messages.js';
import { getProvider } from './providers/index.js';
import { getRuntime } from './runtime.js';
import { needsAttention, confirmedNetPay, safeDisplay, mergePage } from './office-model.js';

// Where a record opens, per view. Chosen by what people do with the record:
//   employees, labor-contracts, salary-changes → drawer: each row is a fact
//     people scan many of, read one or two fields of, and return to the list.
//   payroll → split: before a pay run every payroll line is checked top to
//     bottom, one after the next, so the queue stays beside the record.
//   attention (cross-ledger "Needs review") → split: it is literally a queue.
// No record here is a workplace of its own (no related lists, no long content),
// so none defaults to `page`; drawer and split still carry "Open full page".
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Base modes are declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = { ...appConfig.ui.detail_modes, attention: 'split' };
const VIEWS = ['overview', 'attention', ...appConfig.bases.map((base) => base.key)];

const state = { locale: new URLSearchParams(location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en', route: null, payload: null, runtime: null, provider: null, period: '', generation: 0, morePending: false };
const $ = (id) => document.getElementById(id);
const tr = (key) => messages[state.locale][key];
const local = (value) => typeof value === 'object' && value ? value[state.locale] || value.en : value;
const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const valueText = safeDisplay;
const baseFor = (record) => appConfig.bases.find((base) => base.key === record.baseKey);
const baseByKey = (key) => appConfig.bases.find((base) => base.key === key);
const currentBase = () => baseByKey(state.route.view);
const all = () => state.payload?.records || [];
const attention = (record) => needsAttention(record, baseFor(record), state.payload?.asOf || appConfig.asOf);
const choice = (base, value) => base.fields.find((field) => field.slug === base.status)?.options.choices?.find((option) => option.id === value);
const statusText = (base, value) => local(choice(base, value)?.localizedName) || valueText(value);
const periods = () => [...new Set(all().filter((row) => row.baseKey === 'payroll').map((row) => row.fields.period).filter(Boolean))].sort();
const activePeriod = () => state.period || periods().at(-1) || '';
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&period=…&peek=…]`. Search, filters and the
// peeked record live in the URL so refresh, shared links and Back restore the
// same list context. The pre-migration `#employees` form still resolves.
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const view = VIEWS.includes(parts[0]) ? parts[0] : 'overview';
  let id = '';
  try { id = view !== 'overview' && parts[1] ? decodeURIComponent(parts[1]) : ''; } catch { id = ''; }
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get('peek') || '' : '';
  if (view === 'payroll' && params.has('period')) state.period = params.get('period') || '';
  return { view, id, peek, selectedId: id || peek, presentation: id ? 'page' : mode || null, query: params.get('q') || '', status: params.get('status') || '' };
}
const routeQuery = (route, extra = {}) => {
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.status) params.set('status', route.status);
  if (route.view === 'payroll' && state.period) params.set('period', state.period);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};
const listUrl = (route = state.route) => `#/${route.view}${routeQuery(route)}`;
const detailUrl = (id, route = state.route) => `#/${route.view}/${encodeURIComponent(id)}${routeQuery(route)}`;
const recordUrl = (id, route = state.route) => DETAIL_MODES[route.view] === 'page' ? detailUrl(id, route) : `#/${route.view}${routeQuery(route, { peek: id })}`;

let previousRouteWasList = false;
function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list is marked, so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view) history.replaceState({ fromList: true }, '');
  previousRouteWasList = state.route.view !== 'overview' && !state.route.selectedId;
  $('searchInput').value = state.route.query;
  closeSidebar();
  render();
}
// Search keystrokes and filter changes replace the entry instead of each
// becoming a Back step.
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

// ── Data views ─────────────────────────────────────────────────────────────
const narrowed = () => Boolean(state.route.query || state.route.status || (state.route.view === 'payroll' && state.period));
const filtered = () => all().filter((record) => {
  const base = baseFor(record);
  if (currentBase() && record.baseKey !== state.route.view) return false;
  if (state.route.view === 'attention' && !attention(record)) return false;
  if (state.route.status && record.fields[base.status] !== state.route.status) return false;
  if (state.route.view === 'payroll' && state.period && record.fields.period !== state.period) return false;
  if (!state.route.query) return true;
  const query = state.route.query.toLowerCase();
  return [...Object.values(record.fields), statusText(base, record.fields[base.status])].some((value) => String(value).toLowerCase().includes(query));
});
const badge = (record) => `<span class="badge ${attention(record) ? 'warning' : 'positive'}">${esc(statusText(baseFor(record), record.fields[baseFor(record).status]))}</span>`;
function fieldText(field, value) {
  if (field.type === 'select') return local(field.options.choices?.find((item) => item.id === value)?.localizedName) || valueText(value);
  if (field.type === 'number') return typeof value === 'number' ? new Intl.NumberFormat(state.locale).format(value) : tr('unavailable');
  return valueText(value);
}
const cellText = (field, value) => field.type === 'number' && typeof value !== 'number' ? '-' : fieldText(field, value);
const columnClass = (field) => field.type === 'number' ? 'ws-col-num' : field.type === 'date' || ['employee-code', 'period'].includes(field.slug) ? 'ws-col-narrow' : '';

function closeSidebar() { document.body.classList.remove('sidebar-open'); $('sidebarScrim').hidden = true; }

function renderNavigation() {
  const items = [{ key: 'overview', name: tr('overview'), icon: 'layout-dashboard' }, { key: 'attention', name: tr('attention'), icon: 'circle-alert' }, ...appConfig.bases.map((base) => ({ key: base.key, name: local(base.localizedName), icon: base.key === 'employees' ? 'users' : base.key === 'payroll' || base.key === 'salary-changes' ? 'banknote' : base.key === 'sources' ? 'archive' : 'files' }))];
  $('baseNav').innerHTML = items.map((item) => {
    const count = state.payload?.totalCount[item.key];
    const loaded = all().filter((row) => row.baseKey === item.key).length;
    const countText = !state.payload ? '' : count == null && state.payload.failures.includes(item.key) ? '-' : count == null ? `${loaded}${state.payload.pageInfo[item.key]?.nextCursor ? '+' : ''}` : count;
    return `<a class="nav-item ${item.key === state.route.view ? 'active' : ''}" href="#/${esc(item.key)}"><span><i data-lucide="${item.icon}"></i>${esc(item.name)}</span>${['overview', 'attention'].includes(item.key) || countText === '' ? '' : `<span>${esc(countText)}</span>`}</a>`;
  }).join('');
}
function renderOverview() {
  const asOf = state.payload?.asOf || appConfig.asOf;
  $('overviewContext').textContent = `${tr('asOf')} ${asOf} · ${tr('scope')}`;
  $('overviewTitle').textContent = local(appConfig.title);
  $('overviewSummary').textContent = local(appConfig.localizedDescription);
  $('refreshLabel').textContent = tr('refresh');
  let metrics;
  if (appConfig.appId.endsWith('-hr')) {
    const period = activePeriod();
    const net = confirmedNetPay(all(), period);
    metrics = [[`${tr('confirmed')}${period ? ` · ${period}` : ''}`, new Intl.NumberFormat(state.locale, { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(net.amount)], [tr('proposed'), all().filter((row) => row.baseKey === 'salary-changes' && row.fields.status === 'proposed').length], [tr('missing'), all().filter((row) => row.baseKey === 'payroll' && ['missing-input', 'review'].includes(row.fields.status)).length]];
  } else {
    const today = Date.parse(asOf);
    metrics = [[tr('due'), all().filter((row) => ['certificates', 'contracts'].includes(row.baseKey) && !['archived'].includes(row.fields.status) && Date.parse(row.fields.expires) - today <= 60 * 86400000).length], [tr('conflicts'), all().filter((row) => row.fields.status === 'conflict').length], [tr('originals'), all().filter((row) => row.baseKey === 'sources' && row.fields.status === 'copy-only').length]];
  }
  $('metrics').setAttribute('aria-label', tr('metrics'));
  $('metrics').innerHTML = metrics.map(([label, value]) => `<div><span title="${esc(label)}">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  // One card per ledger: what it is for and how many of its loaded rows need
  // review. Totals are already beside each nav item, so they are not repeated.
  $('ledgerGrid').innerHTML = appConfig.bases.map((base) => {
    const failed = state.payload?.failures.includes(base.key);
    const pending = all().filter((row) => row.baseKey === base.key && attention(row)).length;
    return `<a class="card ledger-card" href="#/${esc(base.key)}"><h2>${esc(local(base.localizedName))}</h2><p>${esc(local(base.localizedDescription))}</p><span class="ledger-foot">${failed ? `<span class="badge danger">${esc(tr('unreadable'))}</span>` : `<strong>${pending}</strong><span>${esc(tr('needReview'))}</span>`}<span class="ledger-open">${esc(tr('openLedger'))} →</span></span></a>`;
  }).join('');
}
function renderToolbar() {
  const base = currentBase();
  $('viewTitle').textContent = base ? local(base.localizedName) : tr('attention');
  $('viewTitle').title = `${base ? local(base.localizedDescription) : tr('help')} · ${tr('scope')}`;
  const status = base?.fields.find((field) => field.slug === base.status);
  $('statusFilter').hidden = !base;
  $('statusFilter').setAttribute('aria-label', tr('filters'));
  $('statusFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${(status?.options.choices || []).map((option) => `<option value="${esc(option.id)}">${esc(local(option.localizedName))}</option>`).join('')}`;
  $('statusFilter').value = state.route.status;
  $('periodFilter').hidden = state.route.view !== 'payroll';
  $('periodFilter').setAttribute('aria-label', tr('period'));
  $('periodFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${periods().map((period) => `<option>${esc(period)}</option>`).join('')}`;
  $('periodFilter').value = state.period;
  $('searchLabel').textContent = tr('search'); $('searchInput').placeholder = tr('search');
}
function renderList() {
  const rows = filtered();
  const base = currentBase();
  const more = base && state.payload?.pageInfo[base.key]?.nextCursor;
  $('recordCount').textContent = `${rows.length}${more ? '+' : ''}`;
  if (!rows.length) {
    $('recordList').innerHTML = `<div class="empty-state"><strong>${esc(narrowed() ? tr('matches') : state.route.view === 'attention' ? tr('noAttention') : tr('empty'))}</strong>${state.route.query || state.route.status ? `<button class="button" data-clear type="button">${esc(tr('clear'))}</button>` : ''}</div>`;
  } else {
    const fields = base ? [base.primary, base.status, ...base.fields.map((field) => field.slug).filter((slug) => ![base.primary, base.status, 'notes'].includes(slug))].map((slug) => base.fields.find((field) => field.slug === slug)) : null;
    const head = base
      ? fields.map((field) => `<th class="${columnClass(field)}" title="${esc(local(field.localizedName))}">${esc(local(field.localizedName))}</th>`).join('')
      : `<th>${esc(tr('records'))}</th><th class="col-status">${esc(tr('filters'))}</th><th>${esc(tr('ledger'))}</th><th>${esc(local(appConfig.bases[0].fields.find((field) => field.slug === 'owner')?.localizedName) || '')}</th><th class="ws-col-narrow">${esc(tr('keyDate'))}</th>`;
    const body = rows.map((record) => {
      const config = baseFor(record);
      const cells = base
        ? fields.map((field) => field.slug === base.status ? `<td class="col-status">${badge(record)}</td>` : `<td class="${columnClass(field)}${field.slug === base.primary ? ' cell-primary' : ''}">${esc(cellText(field, record.fields[field.slug]))}</td>`).join('')
        : `<td class="cell-primary">${esc(valueText(record.fields[config.primary]))}</td><td class="col-status">${badge(record)}</td><td>${esc(local(config.localizedName))}</td><td>${esc(valueText(record.fields.owner))}</td><td class="ws-col-narrow">${esc(valueText(record.fields[config.date]))}</td>`;
      return `<tr data-record="${esc(record.id)}"${record.id === state.route.selectedId ? ' class="ws-selected"' : ''}>${cells}</tr>`;
    }).join('');
    $('recordList').innerHTML = `<table class="ws-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  $('loadMore').hidden = !more;
  $('loadMore').disabled = state.morePending;
  $('loadMore').textContent = tr('more');
}
function renderDetail() {
  const { selectedId, presentation } = state.route;
  const record = selectedId ? all().find((row) => row.id === selectedId && (state.route.view === 'attention' || row.baseKey === state.route.view)) : null;
  $('detailBar').hidden = !selectedId;
  $('backButton').textContent = presentation === 'page' || isMobile() ? tr('back') : tr('close');
  $('detailExpand').hidden = !selectedId || presentation === 'page';
  if (selectedId) $('detailExpand').href = detailUrl(selectedId);
  $('detailExpand').textContent = tr('openFull');
  $('detailEmpty').hidden = Boolean(record);
  $('detailEmpty').textContent = selectedId ? tr('notLoaded') : tr('select');
  $('detailContent').hidden = !record;
  if (!record) return;
  const base = baseFor(record);
  $('detailTitle').textContent = valueText(record.fields[base.primary]);
  $('detailBadge').innerHTML = badge(record);
  const rows = base.fields.filter((field) => ![base.primary, base.status, 'notes'].includes(field.slug)).map((field) => [local(field.localizedName), fieldText(field, record.fields[field.slug])]);
  // The cross-ledger queue mixes Bases, so it says which ledger a record is from.
  if (state.route.view === 'attention') rows.unshift([tr('ledger'), local(base.localizedName)]);
  if (base.key === 'payroll') {
    const net = confirmedNetPay([record], record.fields.period);
    rows.push([tr('net'), net.count ? new Intl.NumberFormat(state.locale).format(net.amount) : tr('unavailable')]);
  }
  $('detailFields').innerHTML = rows.map(([label, value]) => `<div class="field-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  $('evidenceTitle').textContent = tr('evidence'); $('detailNotes').textContent = valueText(record.fields.notes);
}
function render() {
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.payload);
  const onView = ready && view !== 'overview';
  const mode = DETAIL_MODES[view];
  const body = document.body.classList;
  body.toggle('ws-detail-open', onView && Boolean(selectedId));
  body.toggle('ws-detail-page', onView && presentation === 'page' && Boolean(selectedId));
  body.toggle('ws-detail-drawer', onView && mode === 'drawer' && presentation !== 'page');
  body.toggle('ws-layout-split', onView && mode === 'split' && presentation !== 'page');
  body.toggle('ws-searching', onView && narrowed());
  document.documentElement.lang = state.locale;
  document.documentElement.style.setProperty('--accent', appConfig.brand.accent);
  document.title = local(appConfig.title);
  $('brandName').textContent = local(appConfig.title); $('brandDescription').textContent = local(appConfig.ui.summary);
  $('mobileTitle').textContent = view === 'overview' ? local(appConfig.title) : currentBase() ? local(currentBase().localizedName) : tr('attention');
  $('attentionTitle').textContent = tr('attention'); $('attentionValue').textContent = ready ? all().filter(attention).length : '-'; $('attentionCopy').textContent = tr('scope');
  $('guideOpen').textContent = tr('guide'); $('guideTitle').textContent = tr('guide'); $('guideSummary').textContent = local(appConfig.localizedDescription); $('guideBoundary').textContent = local(appConfig.boundary);
  $('locale').value = state.locale; $('locale').setAttribute('aria-label', tr('language'));
  $('baseNav').setAttribute('aria-label', tr('views'));
  $('sidebarScrim').setAttribute('aria-label', tr('close'));
  for (const id of ['refresh', 'refreshView', 'refreshMobile']) { $(id).title = tr('refresh'); $(id).setAttribute('aria-label', tr('refresh')); }
  for (const id of ['guideClose', 'sidebarClose']) { $(id).title = tr('close'); $(id).setAttribute('aria-label', tr('close')); }
  $('sidebarOpen').setAttribute('aria-label', tr('open')); $('sidebarOpen').title = tr('open');
  $('partialState').hidden = !state.payload?.failures.length; $('partialState').textContent = tr('partial');
  $('staleState').hidden = !state.payload || Date.now() - Date.parse(state.payload.refreshedAt) < 900000; $('staleState').textContent = tr('stale');
  $('overviewPage').hidden = !ready || view !== 'overview';
  $('viewPage').hidden = !onView;
  renderNavigation();
  if (ready && view === 'overview') renderOverview();
  if (onView) { renderToolbar(); renderList(); renderDetail(); }
  renderIcons();
}

// ── Loading ────────────────────────────────────────────────────────────────
const isDemo = () => new URLSearchParams(location.search).get('demo') === '1';
const gate = createAirAppConnectGate({ appName: appConfig.appName, demoHref: '?demo=1', shouldGate: () => !isDemo() && !state.runtime?.hosted, onProvision: () => { throw new Error('Install the template package to initialize its resources.'); } });
async function load() {
  const generation = ++state.generation;
  $('loadingState').textContent = tr('loading'); $('errorState').hidden = true; $('retry').hidden = true;
  try {
    state.runtime = await getRuntime();
    if (!isDemo() && !state.runtime.determined) throw new Error('BRIDGE_UNAVAILABLE: Runtime could not be determined.');
    if (!(await gate.pass({ onReady: load }))) { $('loadingState').textContent = ''; return; }
    state.provider = await getProvider();
    const payload = await state.provider.getState();
    if (generation !== state.generation) return;
    state.payload = payload;
    render();
  } catch (error) {
    if (generation !== state.generation) return;
    state.payload = null; render();
    const reason = String(error?.message || error);
    $('errorState').hidden = false; $('errorState').textContent = /DENIED|FORBIDDEN/.test(reason) ? tr('permission') : /SCHEMA|SETUP/.test(reason) ? tr('setup') : tr('error');
    $('retry').hidden = false; $('retry').textContent = tr('retry');
  } finally { if (generation === state.generation) $('loadingState').textContent = ''; }
}
// One page, on explicit action only.
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
  finally { state.morePending = false; render(); }
}

// ── Events ─────────────────────────────────────────────────────────────────
$('baseNav').addEventListener('click', (event) => { if (event.target.closest('a')) closeSidebar(); });
$('attentionOpen').onclick = () => { location.hash = '#/attention'; };
$('recordList').addEventListener('click', (event) => {
  if (event.target.closest('[data-clear]')) { replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, query: '', status: '' })}`); $('searchInput').value = ''; return; }
  const row = event.target.closest('tr[data-record]');
  if (!row) return;
  const url = recordUrl(row.dataset.record);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) { history.replaceState(history.state, '', url); setRoute(); } else location.hash = url;
});
$('searchInput').oninput = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, query: event.target.value }, { peek: state.route.peek })}`);
$('statusFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, status: event.target.value })}`);
$('periodFilter').onchange = (event) => { state.period = event.target.value; replaceRoute(`#/${state.route.view}${routeQuery(state.route)}`); };
$('locale').onchange = (event) => { state.locale = event.target.value; const url = new URL(location.href); url.searchParams.set('lang', state.locale); history.replaceState(history.state, '', url); render(); };
$('sidebarOpen').onclick = () => { document.body.classList.add('sidebar-open'); $('sidebarScrim').hidden = false; };
$('sidebarClose').onclick = closeSidebar; $('sidebarScrim').onclick = closeSidebar;
$('backButton').onclick = closeDetail;
$('guideOpen').onclick = () => { $('guideDialog').showModal(); $('guideClose').focus(); };
$('guideClose').onclick = () => { $('guideDialog').close(); $('guideOpen').focus(); };
for (const id of ['refresh', 'refreshView', 'refreshMobile', 'retry']) $(id).onclick = load;
$('loadMore').onclick = loadMore;
window.addEventListener('hashchange', setRoute);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('guideDialog').open) return;
  if (document.body.classList.contains('sidebar-open')) { closeSidebar(); return; }
  // Escape in the search box only leaves it; a second Escape closes the record.
  if (event.target.closest?.('input, select')) { event.target.blur(); return; }
  if (state.route.selectedId && (state.route.presentation !== 'page' || isMobile())) closeDetail();
});
state.route = parseRoute();
previousRouteWasList = state.route.view !== 'overview' && !state.route.selectedId;
$('searchInput').value = state.route.query;
render(); load();
