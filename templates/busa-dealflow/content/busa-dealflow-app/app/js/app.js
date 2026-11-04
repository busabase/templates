import { createAirAppConnectGate } from '../vendor/busabase-airapp-gate.js';
import { detectAirAppRuntime } from '../vendor/busabase-airapp.js';
import { renderIcons } from '../vendor/icons.js';
import { appConfig } from './config.js';
import { markdownText } from './markdown.js';
import { connectionPrompt, messages } from './messages.js';
import { followupsDue, hasSyntheticData, mergeById, weekFromLabel, weekRange } from './model.js';
import { getProvider } from './providers/index.js';
import { connectionHintKey, runtimeLabel } from './runtime.js';
import { baseByKey, boardHtml, connectHtml, createContext, detailHtml, esc, overviewHtml, tableHtml } from './screens.js';

// Where a record opens, per view. Chosen by what people do with the record:
//   deals → page: a project is a workplace of its own (timeline, follow-ups).
//   meetings, digests, ic-notes → split: read one after another.
//   followups → drawer over the board: scan many, touch one.
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = ['deals', 'meetings', 'followups', 'digests', 'ic-notes'];
const ALL_VIEWS = ['overview', ...RECORD_VIEWS, 'connect'];
const ICONS = { overview: 'layout-dashboard', deals: 'briefcase-business', meetings: 'messages-square', followups: 'list-checks', digests: 'file-text', 'ic-notes': 'lock-keyhole', connect: 'plug-zap' };

const browserLocale = () => ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
const queryLocale = new URLSearchParams(location.search).get('lang');
const state = {
  locale: queryLocale === 'zh-CN' || queryLocale === 'en' ? queryLocale : browserLocale(),
  route: null, payload: null, runtime: null, provider: null, generation: 0, morePending: false, copied: false,
  baseUrl: '',
};
const $ = (id) => document.getElementById(id);
const tr = (key) => messages[state.locale][key];
const local = (value) => (value && typeof value === 'object' ? value[state.locale] || value.en : value);
const all = () => state.payload?.records || [];
const asOf = () => state.payload?.asOf || appConfig.asOf;
const visible = () => new Set(state.payload?.visibleBases || appConfig.bases.filter((base) => !base.restricted).map((base) => base.key));
const views = () => ALL_VIEWS.filter((view) => !RECORD_VIEWS.includes(view) || visible().has(view));
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
const viewName = (view) => (view === 'overview' ? tr('overview') : view === 'connect' ? tr('connect') : local(baseByKey(view).localizedName));
const context = () => createContext({ locale: state.locale, messages, records: all(), asOf: asOf(), route: state.route, totals: state.payload?.totalCount, visible: visible() });

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&owner=…&week=…&peek=…]`. Search, filters,
// the week and the open record live in the URL, so refresh, shared links and
// Back restore the same screen.
function parseRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const view = ALL_VIEWS.includes(parts[0]) ? parts[0] : 'overview';
  let id = '';
  try { id = RECORD_VIEWS.includes(view) && parts[1] ? decodeURIComponent(parts[1]) : ''; } catch { id = ''; }
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== 'page' && !id ? params.get('peek') || '' : '';
  return { view, id, peek, selectedId: id || peek, presentation: id ? 'page' : mode || null, query: params.get('q') || '', status: params.get('status') || '', owner: params.get('owner') || '', week: params.get('week') || '' };
}
const routeQuery = (route, extra = {}) => {
  const params = new URLSearchParams();
  for (const [key, name] of [['query', 'q'], ['status', 'status'], ['owner', 'owner'], ['week', 'week']]) if (route[key]) params.set(name, route[key]);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};
const listUrl = (route = state.route) => `#/${route.view}${routeQuery(route)}`;
const detailUrl = (id, route = state.route) => `#/${route.view}/${encodeURIComponent(id)}${routeQuery(route)}`;
const recordUrl = (id, route = state.route) => (DETAIL_MODES[route.view] === 'page' ? detailUrl(id, route) : `#/${route.view}${routeQuery(route, { peek: id })}`);

let previousRouteWasList = false;
function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view) history.replaceState({ fromList: true }, '');
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
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
const narrowed = () => Boolean(state.route.query || state.route.status || state.route.owner);
const searchable = (row) => [...Object.values(row.fields).map((value) => (typeof value === 'string' ? markdownText(value) : '')), context().relationText(row.fields.deal)].join(' ').toLowerCase();
function rowsForView() {
  const { view, query, status, owner } = state.route;
  const base = baseByKey(view);
  const needle = query.toLowerCase();
  return all().filter((row) => row.baseKey === view
    && (!status || row.fields[base.status] === status)
    && (!owner || row.fields.owner === owner)
    && (!needle || searchable(row).includes(needle)));
}
const sourcesOf = (view) => appConfig.sources.filter((source) => source.base === view);
const moreAvailable = (view) => sourcesOf(view).some((source) => state.payload?.pageInfo[source.key]?.nextCursor);
const currentWeek = () => {
  const monday = weekFromLabel(state.route.week);
  return weekRange(monday || asOf());
};

// ── Render ─────────────────────────────────────────────────────────────────
function renderNavigation() {
  $('baseNav').innerHTML = views().map((view) => {
    let count = '';
    if (state.payload && RECORD_VIEWS.includes(view)) {
      const total = state.payload.totalCount[view];
      const failed = sourcesOf(view).some((source) => state.payload.failures.includes(source.key));
      count = total == null ? (failed ? '-' : `${all().filter((row) => row.baseKey === view).length}${moreAvailable(view) ? '+' : ''}`) : total;
    }
    const restricted = baseByKey(view)?.restricted ? ' nav-restricted' : '';
    return `<a class="nav-item${view === state.route.view ? ' active' : ''}${restricted}" href="#/${view}"><span><i data-lucide="${ICONS[view]}"></i>${esc(viewName(view))}</span>${count === '' ? '' : `<span>${esc(count)}</span>`}</a>`;
  }).join('');
}
function renderOverview() {
  const ctx = context();
  const range = currentWeek();
  const html = overviewHtml(ctx, range);
  const thisWeek = weekRange(asOf());
  $('overviewContext').textContent = tr('week')(range.label, ctx.date(range.from), ctx.date(range.to));
  $('overviewTitle').textContent = range.label === thisWeek.label ? tr('thisWeek') : range.label;
  $('overviewSummary').textContent = local(appConfig.localizedDescription);
  $('refreshLabel').textContent = tr('refresh');
  $('weekPrev').title = tr('prevWeek'); $('weekPrev').setAttribute('aria-label', tr('prevWeek'));
  $('weekNext').title = tr('nextWeek'); $('weekNext').setAttribute('aria-label', tr('nextWeek'));
  $('weekNext').disabled = range.label === thisWeek.label;
  $('metrics').innerHTML = html.band;
  $('seenTitle').textContent = tr('seenTitle'); $('seenCard').innerHTML = html.seenHtml;
  $('findingsTitle').textContent = tr('findingsTitle'); $('findingsCard').innerHTML = html.findingsHtml;
  $('dueTitle').textContent = tr('dueTitle'); $('dueCard').innerHTML = html.dueHtml;
  $('digestTitle').textContent = tr('digestTitle'); $('digestCard').innerHTML = html.digestHtml;
}
function renderConnect() {
  const folderName = state.payload?.folderName || local(appConfig.title);
  $('connectPage').innerHTML = connectHtml(context(), { baseUrl: state.baseUrl, folderName, space: state.payload?.space, copied: state.copied });
}
function renderToolbar() {
  const { view } = state.route;
  const base = baseByKey(view);
  $('viewTitle').textContent = viewName(view);
  const status = base?.fields.find((field) => field.slug === base.status);
  $('statusFilter').hidden = !status;
  $('statusFilter').innerHTML = `<option value="">${esc(view === 'deals' ? tr('allStages') : tr('all'))}</option>${(status?.options.choices || []).map((option) => `<option value="${esc(option.id)}">${esc(local(option.localizedName))}</option>`).join('')}`;
  $('statusFilter').value = state.route.status;
  const owners = [...new Set(all().filter((row) => row.baseKey === view).map((row) => row.fields.owner).filter(Boolean))].sort();
  $('ownerFilter').hidden = !base?.fields.some((field) => field.slug === 'owner') || !owners.length;
  $('ownerFilter').innerHTML = `<option value="">${esc(tr('allOwners'))}</option>${owners.map((owner) => `<option value="${esc(owner)}">${esc(owner)}</option>`).join('')}`;
  $('ownerFilter').value = state.route.owner;
  $('searchLabel').textContent = tr('search'); $('searchInput').placeholder = tr('search');
}
function renderList() {
  const ctx = context();
  const rows = rowsForView();
  const { view } = state.route;
  const more = moreAvailable(view);
  $('recordCount').textContent = `${rows.length}${more ? '+' : ''}`;
  if (!rows.length && view !== 'followups') {
    $('recordList').innerHTML = `<div class="empty-state"><strong>${esc(narrowed() ? tr('matches') : tr('empty'))}</strong>${narrowed() ? `<button class="button" data-clear type="button">${esc(tr('clear'))}</button>` : ''}</div>`;
  } else {
    $('recordList').innerHTML = view === 'followups' ? boardHtml(ctx, rows) : tableHtml(ctx, view, rows);
  }
  $('loadMore').hidden = !more;
  $('loadMore').disabled = state.morePending;
  $('loadMore').textContent = tr('more');
}
function renderDetail() {
  const { selectedId, presentation, view } = state.route;
  const ctx = context();
  ctx.route = { ...ctx.route, meetingsTruncated: Boolean(state.payload?.pageInfo.meetings?.nextCursor) };
  const record = selectedId ? all().find((row) => row.id === selectedId && row.baseKey === view) : null;
  $('detailBar').hidden = !selectedId;
  $('backButton').textContent = presentation === 'page' || isMobile() ? tr('back') : tr('close');
  $('detailExpand').hidden = !selectedId || presentation === 'page';
  if (selectedId) $('detailExpand').href = detailUrl(selectedId);
  $('detailExpand').textContent = tr('openFull');
  $('detailEmpty').hidden = Boolean(record);
  $('detailEmpty').textContent = selectedId ? tr('notLoaded') : tr('select');
  $('detailContent').hidden = !record;
  $('detailContent').innerHTML = record ? detailHtml(ctx, record) : '';
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
  if (!views().includes(state.route.view)) state.route = { ...state.route, view: 'overview', id: '', peek: '', selectedId: '' };
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.payload);
  const onView = ready && RECORD_VIEWS.includes(view);
  const mode = DETAIL_MODES[view];
  const body = document.body.classList;
  body.toggle('ws-detail-open', onView && Boolean(selectedId));
  body.toggle('ws-detail-page', onView && presentation === 'page' && Boolean(selectedId));
  body.toggle('ws-detail-drawer', onView && mode === 'drawer' && presentation !== 'page');
  body.toggle('ws-layout-split', onView && mode === 'split' && presentation !== 'page');
  body.toggle('ws-searching', onView && narrowed());
  body.toggle('view-board', onView && view === 'followups');
  body.toggle('view-deal-page', onView && view === 'deals' && Boolean(selectedId));
  document.documentElement.lang = state.locale;
  document.title = local(appConfig.title);
  $('brandName').textContent = local(appConfig.title); $('brandDescription').textContent = local(appConfig.ui.summary);
  $('mobileTitle').textContent = view === 'overview' ? local(appConfig.title) : viewName(view);
  const due = ready ? followupsDue(all(), asOf(), appConfig.ui.soonDays) : [];
  $('attentionTitle').textContent = tr('dueTitle');
  $('attentionValue').textContent = ready ? due.length : '-';
  $('attentionCopy').textContent = ready && due.some((item) => item.overdue) ? tr('mOverdue')(due.filter((item) => item.overdue).length) : tr('mDue')(appConfig.ui.soonDays);
  $('guideOpen').textContent = tr('guide');
  $('locale').value = state.locale; $('locale').setAttribute('aria-label', tr('language'));
  $('baseNav').setAttribute('aria-label', tr('views'));
  $('statusFilter').setAttribute('aria-label', view === 'deals' ? tr('stageFilter') : tr('statusFilter'));
  $('ownerFilter').setAttribute('aria-label', tr('ownerFilter'));
  $('sidebarScrim').setAttribute('aria-label', tr('close'));
  for (const id of ['refresh', 'refreshView', 'refreshMobile']) { $(id).title = tr('refresh'); $(id).setAttribute('aria-label', tr('refresh')); }
  for (const id of ['guideClose', 'sidebarClose']) { $(id).title = tr('close'); $(id).setAttribute('aria-label', tr('close')); }
  $('sidebarOpen').setAttribute('aria-label', tr('open')); $('sidebarOpen').title = tr('open');
  $('syntheticState').hidden = !ready || !hasSyntheticData(all()); $('syntheticState').textContent = tr('synthetic');
  $('partialState').hidden = !state.payload?.failures.length; $('partialState').textContent = tr('partial');
  $('staleState').hidden = !state.payload || Date.now() - Date.parse(state.payload.refreshedAt) < 900000; $('staleState').textContent = tr('stale');
  $('overviewPage').hidden = !ready || view !== 'overview';
  $('connectPage').hidden = view !== 'connect';
  $('viewPage').hidden = !onView;
  renderNavigation();
  if (ready && view === 'overview') renderOverview();
  if (view === 'connect') renderConnect();
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
    state.runtime = await detectAirAppRuntime();
    if (!isDemo() && !state.runtime.determined) throw new Error('BRIDGE_UNAVAILABLE: Runtime could not be determined.');
    if (!(await gate.pass({ onReady: load }))) { $('loadingState').textContent = ''; return; }
    state.provider = await getProvider();
    const payload = await state.provider.getState();
    if (generation !== state.generation) return;
    state.payload = payload;
    state.baseUrl ||= payload.baseUrl || location.origin;
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
async function copyPrompt() {
  const folderName = state.payload?.folderName || local(appConfig.title);
  const text = connectionPrompt(state.locale, { baseUrl: state.baseUrl, folderName, space: state.payload?.space });
  try { await navigator.clipboard.writeText(text); }
  catch {
    // Some embedded frames refuse the async clipboard; select the text instead.
    const range = document.createRange(); range.selectNodeContents($('promptText'));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.execCommand?.('copy');
  }
  state.copied = true; renderConnect(); renderIcons();
  setTimeout(() => { state.copied = false; if (state.route.view === 'connect') { renderConnect(); renderIcons(); } }, 2400);
}

// ── Events ─────────────────────────────────────────────────────────────────
$('baseNav').addEventListener('click', (event) => { if (event.target.closest('a')) closeSidebar(); });
$('recordList').addEventListener('click', (event) => {
  if (event.target.closest('[data-clear]')) { $('searchInput').value = ''; replaceRoute(`#/${state.route.view}`); return; }
  if (event.target.closest('a')) return;
  const row = event.target.closest('[data-record]');
  if (!row) return;
  const url = recordUrl(row.dataset.record);
  if (state.route.peek) { history.replaceState(history.state, '', url); setRoute(); } else location.hash = url;
});
$('connectPage').addEventListener('click', (event) => { if (event.target.closest('#copyPrompt')) copyPrompt(); });
$('connectPage').addEventListener('change', (event) => {
  if (event.target.id !== 'serverInput') return;
  const value = event.target.value.trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s]+$/.test(value)) { state.baseUrl = value; renderConnect(); renderIcons(); }
});
$('searchInput').oninput = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, query: event.target.value }, { peek: state.route.peek })}`);
$('statusFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, status: event.target.value })}`);
$('ownerFilter').onchange = (event) => replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, owner: event.target.value })}`);
$('weekPrev').onclick = () => replaceRoute(`#/overview${routeQuery({ ...state.route, week: weekRange(currentWeek().from, -1).label })}`);
$('weekNext').onclick = () => {
  const next = weekRange(currentWeek().from, 1);
  replaceRoute(`#/overview${routeQuery({ ...state.route, week: next.label === weekRange(asOf()).label ? '' : next.label })}`);
};
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
  if (event.target.closest?.('input, select')) { event.target.blur(); return; }
  if (state.route.selectedId && (state.route.presentation !== 'page' || isMobile())) closeDetail();
});
state.route = parseRoute();
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
$('searchInput').value = state.route.query;
render(); load();
