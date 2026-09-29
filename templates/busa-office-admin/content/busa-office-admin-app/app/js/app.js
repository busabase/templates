import { createAirAppConnectGate } from '../vendor/busabase-airapp-gate.js';
import { renderIcons } from '../vendor/icons.js';
import { appConfig } from './config.js';
import { messages } from './messages.js';
import { getProvider } from './providers/index.js';
import { getRuntime } from './runtime.js';
import { needsAttention, confirmedNetPay, safeDisplay, mergePage } from './office-model.js';

const state = { locale: new URLSearchParams(location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en', route: location.hash.slice(1) || 'overview', payload: null, query: '', status: '', selected: null, runtime: null, provider: null, period: '', generation: 0, morePending: false };
const $ = (id) => document.getElementById(id);
const tr = (key) => messages[state.locale][key];
const local = (value) => typeof value === 'object' && value ? value[state.locale] || value.en : value;
const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const valueText = safeDisplay;
const baseFor = (record) => appConfig.bases.find((base) => base.key === record.baseKey);
const currentBase = () => appConfig.bases.find((base) => base.key === state.route);
const all = () => state.payload?.records || [];
const attention = (record) => needsAttention(record, baseFor(record), state.payload?.asOf || appConfig.asOf);
const choice = (base, value) => base.fields.find((field) => field.slug === base.status)?.options.choices?.find((option) => option.id === value);
const statusText = (base, value) => local(choice(base, value)?.localizedName) || valueText(value);
const filtered = () => all().filter((record) => {
  if (currentBase() && record.baseKey !== state.route) return false;
  if (['overview', 'attention'].includes(state.route) && !attention(record)) return false;
  if (state.status && record.fields[baseFor(record).status] !== state.status) return false;
  if (state.route === 'payroll' && state.period && record.fields.period !== state.period) return false;
  return !state.query || Object.values(record.fields).some((value) => String(value).toLowerCase().includes(state.query.toLowerCase()));
});
const badge = (record) => `<span class="badge ${attention(record) ? 'warning' : 'positive'}">${esc(statusText(baseFor(record), record.fields[baseFor(record).status]))}</span>`;
function closeSidebar() { document.body.classList.remove('sidebar-open'); $('sidebarScrim').hidden = true; }
function routeTo(route) { state.route = route; state.status = ''; state.query = ''; state.selected = null; $('searchInput').value = ''; document.body.classList.remove('mobile-detail-open'); closeSidebar(); location.hash = route; render(); }
function renderNavigation() {
  const items = [{ key: 'overview', name: tr('overview'), icon: 'layout-dashboard' }, { key: 'attention', name: tr('attention'), icon: 'circle-alert' }, ...appConfig.bases.map((base) => ({ key: base.key, name: local(base.localizedName), icon: base.key === 'employees' ? 'users' : base.key === 'payroll' || base.key === 'salary-changes' ? 'banknote' : base.key === 'sources' ? 'archive' : 'files' }))];
  $('baseNav').innerHTML = items.map((item) => {
    const count = state.payload?.totalCount[item.key];
    const loaded = all().filter((row) => row.baseKey === item.key).length;
    const countText = count == null && state.payload?.failures.includes(item.key) ? '-' : count == null ? `${loaded}${state.payload?.pageInfo[item.key]?.nextCursor ? '+' : ''}` : count;
    return `<button type="button" class="nav-item ${item.key === state.route ? 'active' : ''}" data-route="${item.key}"><span><i data-lucide="${item.icon}"></i>${esc(item.name)}</span>${['overview', 'attention'].includes(item.key) ? '' : `<span>${countText}</span>`}</button>`;
  }).join('');
}
function renderMetrics() {
  let metrics;
  if (appConfig.appId.endsWith('-hr')) {
    const period = state.period || [...new Set(all().filter((row) => row.baseKey === 'payroll').map((row) => row.fields.period))].sort().at(-1) || '';
    const net = confirmedNetPay(all(), period);
    metrics = [[tr('confirmed'), new Intl.NumberFormat(state.locale, { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(net.amount)], [tr('proposed'), all().filter((row) => row.baseKey === 'salary-changes' && row.fields.status === 'proposed').length], [tr('missing'), all().filter((row) => row.baseKey === 'payroll' && ['missing-input', 'review'].includes(row.fields.status)).length]];
  } else {
    const today = Date.parse(state.payload?.asOf || appConfig.asOf);
    metrics = [[tr('due'), all().filter((row) => ['certificates', 'contracts'].includes(row.baseKey) && !['archived'].includes(row.fields.status) && Date.parse(row.fields.expires) - today <= 60 * 86400000).length], [tr('conflicts'), all().filter((row) => row.fields.status === 'conflict').length], [tr('originals'), all().filter((row) => row.baseKey === 'sources' && row.fields.status === 'copy-only').length]];
  }
  $('metrics').innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}
function renderFilters() {
  const base = currentBase();
  const status = base?.fields.find((field) => field.slug === base.status);
  $('statusFilter').hidden = !base;
  $('statusFilter').setAttribute('aria-label', tr('filters'));
  $('statusFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${(status?.options.choices || []).map((option) => `<option value="${esc(option.id)}">${esc(local(option.localizedName))}</option>`).join('')}`;
  $('statusFilter').value = state.status;
  $('periodFilter').hidden = state.route !== 'payroll';
  $('periodFilter').setAttribute('aria-label', tr('period'));
  const periods = [...new Set(all().filter((row) => row.baseKey === 'payroll').map((row) => row.fields.period))].sort();
  $('periodFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${periods.map((period) => `<option>${esc(period)}</option>`).join('')}`;
  $('periodFilter').value = state.period;
}
function renderList() {
  const rows = filtered();
  const base = currentBase();
  $('listTitle').textContent = base ? local(base.localizedName) : tr('attention');
  $('listEyebrow').textContent = tr('scope');
  $('recordCount').textContent = `${rows.length}${base && state.payload?.pageInfo[base.key]?.nextCursor ? '+' : ''}`;
  $('recordList').innerHTML = rows.length ? rows.map((record) => {
    const config = baseFor(record);
    return `<button type="button" class="record-row ${state.selected === record.id ? 'selected' : ''}" data-record="${esc(record.id)}"><strong>${esc(valueText(record.fields[config.primary]))}</strong>${badge(record)}<span class="row-subtitle">${config.secondary.map((slug) => esc(valueText(record.fields[slug]))).join(' · ')}</span>${!base ? `<span class="row-label">${esc(local(config.localizedName))}</span>` : ''}</button>`;
  }).join('') : `<div class="empty-state"><strong>${esc(state.query || state.status ? tr('matches') : ['overview', 'attention'].includes(state.route) ? tr('noAttention') : tr('empty'))}</strong>${state.query || state.status ? `<button class="button" data-clear type="button">${esc(tr('clear'))}</button>` : ''}</div>`;
  $('loadMore').hidden = !base || !state.payload?.pageInfo[base.key]?.nextCursor;
  $('loadMore').disabled = state.morePending;
  $('loadMore').textContent = tr('more');
}
function fieldText(field, value) {
  if (field.type === 'select') return local(field.options.choices?.find((item) => item.id === value)?.localizedName) || valueText(value);
  if (field.type === 'number') return typeof value === 'number' ? new Intl.NumberFormat(state.locale).format(value) : tr('unavailable');
  return valueText(value);
}
function renderDetail() {
  const record = all().find((row) => row.id === state.selected);
  $('detailEmpty').hidden = Boolean(record); $('detailContent').hidden = !record;
  $('detailEmpty').textContent = tr('select');
  if (!record) return;
  const base = baseFor(record);
  $('detailEyebrow').textContent = local(base.localizedName);
  $('detailTitle').textContent = valueText(record.fields[base.primary]);
  $('detailBadge').innerHTML = badge(record);
  $('detailFields').innerHTML = base.fields.filter((field) => ![base.primary, base.status, 'notes'].includes(field.slug)).map((field) => `<div class="field-row"><span>${esc(local(field.localizedName))}</span><strong>${esc(fieldText(field, record.fields[field.slug]))}</strong></div>`).join('');
  if (base.key === 'payroll') {
    const net = confirmedNetPay([record], record.fields.period);
    $('detailFields').innerHTML += `<div class="field-row"><span>${esc(tr('net'))}</span><strong>${esc(net.count ? new Intl.NumberFormat(state.locale).format(net.amount) : tr('unavailable'))}</strong></div>`;
  }
  $('evidenceTitle').textContent = tr('evidence'); $('detailNotes').textContent = valueText(record.fields.notes);
}
function render() {
  document.documentElement.lang = state.locale;
  document.documentElement.style.setProperty('--accent', appConfig.brand.accent);
  document.title = local(appConfig.title);
  $('brandName').textContent = local(appConfig.title); $('brandDescription').textContent = local(appConfig.ui.summary);
  const period = state.period || [...new Set(all().filter((row) => row.baseKey === 'payroll').map((row) => row.fields.period))].sort().at(-1);
  $('viewEyebrow').textContent = `${tr('asOf')} ${state.payload?.asOf || appConfig.asOf} · ${tr('scope')}${period ? ' · ' + period : ''}`;
  $('viewTitle').textContent = state.route === 'overview' ? local(appConfig.title) : currentBase() ? local(currentBase().localizedName) : tr('attention');
  $('mobileTitle').textContent = local(appConfig.title);
  $('viewSummary').textContent = state.route === 'overview' ? local(appConfig.ui.summary) : currentBase() ? local(currentBase().localizedDescription) : tr('scope');
  $('attentionTitle').textContent = tr('attention'); $('attentionValue').textContent = all().filter(attention).length; $('attentionCopy').textContent = tr('scope');
  $('searchLabel').textContent = tr('search'); $('searchInput').placeholder = tr('search'); $('backButton').textContent = tr('back');
  $('guideOpen').textContent = tr('guide'); $('guideTitle').textContent = tr('guide'); $('guideSummary').textContent = local(appConfig.localizedDescription); $('guideBoundary').textContent = local(appConfig.boundary);
  $('locale').value = state.locale; $('locale').setAttribute('aria-label', tr('language'));
  $('baseNav').setAttribute('aria-label', tr('views'));
  $('metrics').setAttribute('aria-label', tr('metrics'));
  $('sidebarScrim').setAttribute('aria-label', tr('close'));
  for (const id of ['refresh', 'refreshMobile']) { $(id).title = tr('refresh'); $(id).setAttribute('aria-label', tr('refresh')); }
  for (const id of ['guideClose', 'sidebarClose']) { $(id).title = tr('close'); $(id).setAttribute('aria-label', tr('close')); }
  $('sidebarOpen').setAttribute('aria-label', tr('open')); $('sidebarOpen').title = tr('open');
  $('partialState').hidden = !state.payload?.failures.length; $('partialState').textContent = tr('partial');
  $('staleState').hidden = !state.payload || Date.now() - Date.parse(state.payload.refreshedAt) < 900000; $('staleState').textContent = tr('stale');
  renderNavigation(); renderFilters(); renderMetrics(); renderList(); renderDetail(); renderIcons();
}
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
    state.selected = filtered()[0]?.id || null;
    render();
  } catch (error) {
    if (generation !== state.generation) return;
    state.payload = null; state.selected = null; render();
    const reason = String(error?.message || error);
    $('errorState').hidden = false; $('errorState').textContent = /DENIED|FORBIDDEN/.test(reason) ? tr('permission') : /SCHEMA|SETUP/.test(reason) ? tr('setup') : tr('error');
    $('retry').hidden = false; $('retry').textContent = tr('retry');
  } finally { if (generation === state.generation) $('loadingState').textContent = ''; }
}
async function loadMore() {
  const key = state.route, cursor = state.payload?.pageInfo[key]?.nextCursor, generation = state.generation;
  if (!cursor || state.morePending) return;
  state.morePending = true; renderList();
  try {
    const page = await state.provider.loadMore(key, cursor);
    if (generation !== state.generation) return;
    state.payload.records = mergePage(state.payload.records, page.records);
    state.payload.pageInfo[key] = { nextCursor: page.nextCursor };
  } catch { $('partialState').hidden = false; $('partialState').textContent = tr('partial'); }
  finally { state.morePending = false; renderList(); renderNavigation(); renderMetrics(); }
}
$('baseNav').addEventListener('click', (event) => { const button = event.target.closest('[data-route]'); if (button) routeTo(button.dataset.route); });
$('attentionOpen').onclick = () => routeTo('attention');
$('recordList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-record]');
  if (row) { state.selected = row.dataset.record; document.body.classList.add('mobile-detail-open'); renderList(); renderDetail(); }
  if (event.target.closest('[data-clear]')) { state.query = ''; state.status = ''; $('searchInput').value = ''; render(); }
});
$('searchInput').oninput = (event) => { state.query = event.target.value; state.selected = null; renderList(); renderDetail(); };
$('statusFilter').onchange = (event) => { state.status = event.target.value; state.selected = null; renderList(); renderDetail(); };
$('periodFilter').onchange = (event) => { state.period = event.target.value; state.selected = null; renderList(); renderMetrics(); renderDetail(); };
$('locale').onchange = (event) => { state.locale = event.target.value; const url = new URL(location.href); url.searchParams.set('lang', state.locale); history.replaceState(null, '', url); render(); };
$('sidebarOpen').onclick = () => { document.body.classList.add('sidebar-open'); $('sidebarScrim').hidden = false; };
$('sidebarClose').onclick = closeSidebar; $('sidebarScrim').onclick = closeSidebar;
$('backButton').onclick = () => { document.body.classList.remove('mobile-detail-open'); };
$('guideOpen').onclick = () => { $('guideDialog').showModal(); $('guideClose').focus(); };
$('guideClose').onclick = () => { $('guideDialog').close(); $('guideOpen').focus(); };
for (const id of ['refresh', 'refreshMobile', 'retry']) $(id).onclick = load;
$('loadMore').onclick = loadMore;
window.addEventListener('hashchange', () => { const route = location.hash.slice(1) || 'overview'; if (route !== state.route) routeTo(route); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSidebar(); document.body.classList.remove('mobile-detail-open'); } });
render(); load();
