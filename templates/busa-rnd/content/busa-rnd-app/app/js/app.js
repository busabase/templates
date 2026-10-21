import { createAirAppConnectGate } from '../vendor/busabase-airapp-gate.js';
import { renderIcons } from '../vendor/icons.js';
import { appConfig } from './config.js';
import { markdownText } from './markdown.js';
import { messages } from './messages.js';
import { attentionItems, mergeById } from './model.js';
import { getProvider } from './providers/index.js';
import { connectionHintKey, getRuntime, runtimeLabel } from './runtime.js';
import { baseByKey, boardHtml, createContext, detailHtml, esc, overviewHtml, tableHtml } from './screens.js';

// Where a record opens, per view. Chosen by what people do with the record:
//   products, projects, tasks, changelog → drawer: people scan many and come
//     back to the list (or the board).
//   deliveries, reports, attention → split: a queue worked top to bottom, so
//     the list stays beside the record being read.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
const DETAIL_MODES = { ...appConfig.ui.detail_modes, attention: 'split' };
const VIEWS = ['overview', 'attention', 'reports', 'deliveries', 'tasks', 'projects', 'changelog', 'products'];
const ICONS = { overview: 'layout-dashboard', attention: 'circle-alert', reports: 'file-text', deliveries: 'badge-check', tasks: 'square-kanban', projects: 'folder-kanban', changelog: 'git-merge', products: 'boxes' };

const state = { locale: new URLSearchParams(location.search).get('lang') === 'zh-CN' ? 'zh-CN' : 'en', route: null, payload: null, runtime: null, provider: null, generation: 0, morePending: false };
const $ = (id) => document.getElementById(id);
const tr = (key) => messages[state.locale][key];
const local = (value) => (value && typeof value === 'object' ? value[state.locale] || value.en : value);
const all = () => state.payload?.records || [];
const asOf = () => state.payload?.asOf || appConfig.asOf;
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
const viewName = (view) => (view === 'overview' ? tr('overview') : view === 'attention' ? tr('attention') : local(baseByKey(view).localizedName));
const context = () => createContext({ locale: state.locale, messages, records: all(), asOf: asOf(), route: state.route, totals: state.payload?.totalCount, taskStatusCount: state.payload?.taskStatusCount });

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&product=…&peek=…]`. Search, filters and
// the open record live in the URL, so refresh, shared links and Back restore
// the same list.
function parseRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const view = VIEWS.includes(parts[0]) ? parts[0] : 'overview';
  let id = '';
  try { id = view !== 'overview' && parts[1] ? decodeURIComponent(parts[1]) : ''; } catch { id = ''; }
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get('peek') || '' : '';
  return { view, id, peek, selectedId: id || peek, presentation: id ? 'page' : mode || null, query: params.get('q') || '', status: params.get('status') || '', product: params.get('product') || '' };
}
const routeQuery = (route, extra = {}) => {
  const params = new URLSearchParams();
  for (const [key, name] of [['query', 'q'], ['status', 'status'], ['product', 'product']]) if (route[key]) params.set(name, route[key]);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};
const listUrl = (route = state.route) => `#/${route.view}${routeQuery(route)}`;
const detailUrl = (id, route = state.route) => `#/${route.view}/${encodeURIComponent(id)}${routeQuery(route)}`;
const recordUrl = (id, route = state.route) => `#/${route.view}${routeQuery(route, { peek: id })}`;

let previousRouteWasList = false;
function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A record opened from its own list is marked, so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view) history.replaceState({ fromList: true }, '');
  previousRouteWasList = state.route.view !== 'overview' && !state.route.selectedId;
  $('searchInput').value = state.route.query;
  closeSidebar();
  render();
}
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
function closeSidebar() { document.body.classList.remove('sidebar-open'); $('sidebarScrim').hidden = true; }

// ── What the current view lists ──────────────────────────────────────────────
const narrowed = () => Boolean(state.route.query || state.route.status || state.route.product);
const searchable = (row) => [...Object.values(row.fields).map((value) => (typeof value === 'string' ? markdownText(value) : '')), context().relationText(row.fields.product)].join(' ').toLowerCase();
function rowsForView(ctx) {
  const { view, query, status, product } = state.route;
  const needle = query.toLowerCase();
  const keep = (row) => {
    if (product && !(row.baseKey === 'products' ? row.id === product : (Array.isArray(row.fields.product) ? row.fields.product : [row.fields.product]).includes(product))) return false;
    if (needle && !searchable(row).includes(needle)) return false;
    return true;
  };
  if (view === 'attention') return attentionItems(all(), ctx.asOf).filter((item) => keep(item.record));
  const base = baseByKey(view);
  return all().filter((row) => row.baseKey === view && keep(row) && (!status || row.fields[base.status] === status)
    && (view !== 'tasks' || status === 'canceled' || row.fields.status !== 'canceled'));
}
const sourcesOf = (view) => appConfig.sources.filter((source) => source.base === view);
const moreAvailable = (view) => sourcesOf(view).some((source) => state.payload?.pageInfo[source.key]?.nextCursor);

// ── Render ─────────────────────────────────────────────────────────────────
function renderNavigation() {
  $('baseNav').innerHTML = VIEWS.map((view) => {
    let count = '';
    if (state.payload && !['overview', 'attention'].includes(view)) {
      const total = state.payload.totalCount[view];
      const failed = sourcesOf(view).some((source) => state.payload.failures.includes(source.key));
      count = total == null ? (failed ? '-' : `${all().filter((row) => row.baseKey === view).length}${moreAvailable(view) ? '+' : ''}`) : total;
    }
    return `<a class="nav-item ${view === state.route.view ? 'active' : ''}" href="#/${view}"><span><i data-lucide="${ICONS[view]}"></i>${esc(viewName(view))}</span>${count === '' ? '' : `<span>${esc(count)}</span>`}</a>`;
  }).join('');
}
function renderOverview() {
  const ctx = context();
  const html = overviewHtml(ctx);
  $('overviewContext').textContent = `${tr('asOf')} ${asOf()} · ${tr('recent')(appConfig.ui.recentDays)}`;
  $('overviewTitle').textContent = local(appConfig.title);
  $('overviewSummary').textContent = local(appConfig.localizedDescription);
  $('refreshLabel').textContent = tr('refresh');
  $('metrics').innerHTML = html.band;
  $('attentionCardTitle').textContent = tr('needsYou'); $('attentionCard').innerHTML = html.attention;
  $('reportCardTitle').textContent = tr('latestReport'); $('reportCard').innerHTML = html.reportCard;
  $('productCardTitle').textContent = tr('products'); $('productCard').innerHTML = html.productTable;
}
function renderToolbar() {
  const { view } = state.route;
  const base = baseByKey(view);
  $('viewTitle').textContent = viewName(view);
  const products = all().filter((row) => row.baseKey === 'products');
  $('productFilter').hidden = view === 'products' || !products.length;
  $('productFilter').innerHTML = `<option value="">${esc(tr('allProducts'))}</option>${products.map((row) => `<option value="${esc(row.id)}">${esc(context().title(row))}</option>`).join('')}`;
  $('productFilter').value = state.route.product;
  const status = base?.fields.find((field) => field.slug === base.status);
  $('statusFilter').hidden = !status;
  $('statusFilter').innerHTML = `<option value="">${esc(tr('all'))}</option>${(status?.options.choices || []).map((option) => `<option value="${esc(option.id)}">${esc(local(option.localizedName))}</option>`).join('')}`;
  $('statusFilter').value = state.route.status;
  $('searchLabel').textContent = tr('search'); $('searchInput').placeholder = tr('search');
}
function renderList() {
  const ctx = context();
  const rows = rowsForView(ctx);
  const { view } = state.route;
  const more = view !== 'attention' && moreAvailable(view);
  $('recordCount').textContent = `${rows.length}${more ? '+' : ''}`;
  if (!rows.length && view !== 'tasks') {
    $('recordList').innerHTML = `<div class="empty-state"><strong>${esc(narrowed() ? tr('matches') : view === 'attention' ? tr('nothingWaiting') : tr('empty'))}</strong>${narrowed() ? `<button class="button" data-clear type="button">${esc(tr('clear'))}</button>` : ''}</div>`;
  } else {
    $('recordList').innerHTML = view === 'tasks' ? boardHtml(ctx, rows) : tableHtml(ctx, view, rows);
  }
  $('loadMore').hidden = !more;
  $('loadMore').disabled = state.morePending;
  $('loadMore').textContent = tr('more');
}
function renderDetail() {
  const { selectedId, presentation, view } = state.route;
  const ctx = context();
  const item = view === 'attention' ? attentionItems(all(), ctx.asOf).find((entry) => entry.record.id === selectedId) : null;
  const record = item?.record || (selectedId ? all().find((row) => row.id === selectedId && row.baseKey === view) : null);
  $('detailBar').hidden = !selectedId;
  $('backButton').textContent = presentation === 'page' || isMobile() ? tr('back') : tr('close');
  $('detailExpand').hidden = !selectedId || presentation === 'page';
  if (selectedId) $('detailExpand').href = detailUrl(selectedId);
  $('detailExpand').textContent = tr('openFull');
  $('detailEmpty').hidden = Boolean(record);
  $('detailEmpty').textContent = selectedId ? tr('notLoaded') : tr('select');
  $('detailContent').hidden = !record;
  $('detailContent').innerHTML = record ? detailHtml(ctx, record, item?.reason) : '';
}
function renderGuide() {
  const hint = state.runtime ? tr(connectionHintKey(state.runtime)) : '';
  $('guideTitle').textContent = tr('guideTitle');
  $('guideBody').innerHTML = `<p>${esc(local(appConfig.localizedDescription))}</p>
    <section><h3>${esc(tr('loopTitle'))}</h3><ol>${tr('loop').map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section>
    <section><h3>${esc(tr('askTitle'))}</h3><ul>${appConfig.folderPrompts.map((item) => `<li>${esc(local(item.label))}</li>`).join('')}</ul></section>
    <section><h3>${esc(tr('boundaryTitle'))}</h3><p>${esc(local(appConfig.boundary))}</p></section>
    <section><h3>${esc(tr('runtimeTitle'))}</h3><div class="settings-grid"><div class="field-row"><span>${esc(tr('provider'))}</span><strong>${esc(state.provider?.name || '-')}</strong></div><div class="field-row"><span>${esc(tr('runtime'))}</span><strong>${esc(state.runtime ? runtimeLabel(state.runtime) : '-')}</strong></div></div>${hint ? `<p class="muted">${esc(hint)}</p>` : ''}</section>`;
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
  body.toggle('view-board', onView && view === 'tasks');
  document.documentElement.lang = state.locale;
  document.title = local(appConfig.title);
  $('brandName').textContent = local(appConfig.title); $('brandDescription').textContent = local(appConfig.ui.summary);
  $('mobileTitle').textContent = view === 'overview' ? local(appConfig.title) : viewName(view);
  $('attentionTitle').textContent = tr('attention');
  $('attentionValue').textContent = ready ? attentionItems(all(), asOf()).length : '-';
  $('attentionCopy').textContent = tr('reasonSummary');
  $('guideOpen').textContent = tr('guide');
  $('locale').value = state.locale; $('locale').setAttribute('aria-label', tr('language'));
  $('baseNav').setAttribute('aria-label', tr('views'));
  $('productFilter').setAttribute('aria-label', tr('product')); $('statusFilter').setAttribute('aria-label', tr('statusFilter'));
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
  renderGuide();
  renderIcons();
}

// ── Loading ────────────────────────────────────────────────────────────────
const isDemo = () => new URLSearchParams(location.search).get('demo') === '1';
const gate = createAirAppConnectGate({ appName: appConfig.appName, demoHref: '?demo=1', shouldGate: () => !isDemo() && !state.runtime?.hosted, onProvision: () => { throw new Error('Install the template package to create its tables.'); } });
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
    const key = /DENIED|FORBIDDEN/.test(reason) ? 'permission' : /SCHEMA|SETUP/.test(reason) ? 'setup' : 'error';
    $('errorState').hidden = false;
    $('errorState').textContent = `${tr(key)} ${state.runtime ? tr(connectionHintKey(state.runtime)) : ''}`.trim();
    $('retry').hidden = false; $('retry').textContent = tr('retry');
  } finally { if (generation === state.generation) $('loadingState').textContent = ''; }
}
// One more page per source of the current table, on explicit action only.
async function loadMore() {
  const generation = state.generation;
  const pending = sourcesOf(state.route.view).filter((source) => state.payload?.pageInfo[source.key]?.nextCursor);
  if (!pending.length || state.morePending) return;
  state.morePending = true; renderList();
  try {
    const pages = await Promise.all(pending.map((source) => state.provider.loadMore(source.key, state.payload.pageInfo[source.key].nextCursor)));
    if (generation !== state.generation) return;
    pending.forEach((source, index) => {
      state.payload.records = mergeById(state.payload.records, pages[index].records);
      state.payload.pageInfo[source.key] = { nextCursor: pages[index].nextCursor };
    });
  } catch { $('partialState').hidden = false; $('partialState').textContent = tr('partial'); }
  finally { state.morePending = false; render(); }
}

// ── Events ─────────────────────────────────────────────────────────────────
$('baseNav').addEventListener('click', (event) => { if (event.target.closest('a')) closeSidebar(); });
$('recordList').addEventListener('click', (event) => {
  if (event.target.closest('[data-clear]')) { $('searchInput').value = ''; replaceRoute(`#/${state.route.view}`); return; }
  if (event.target.closest('a')) return;
  const row = event.target.closest('[data-record]');
  if (!row) return;
  const url = recordUrl(row.dataset.record);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) { history.replaceState(history.state, '', url); setRoute(); } else location.hash = url;
});
$('searchInput').oninput = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, query: event.target.value }, { peek: state.route.peek })}`);
$('statusFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, status: event.target.value })}`);
$('productFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, product: event.target.value })}`);
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
