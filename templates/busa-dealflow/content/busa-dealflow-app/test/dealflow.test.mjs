import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import { connectionPrompt } from '../app/js/messages.js';
import { dealTimeline, findingsIn, followupsDue, hasSyntheticData, isoWeekLabel, projectsSeen, relationIds, weekFromLabel, weekMetrics, weekRange } from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const deal = (name) => rows.find((row) => row.baseKey === 'deals' && row.fields.name === name);
const AS_OF = appConfig.asOf; // 2026-11-05, a Thursday

test('markdown escapes stored HTML and only links http(s)', () => {
  const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com/a)');
  assert.doesNotMatch(html, /<script|href="javascript/);
  assert.match(html, /<a href="https:\/\/example\.com\/a"/);
});

test('ISO weeks: Monday start, labels round-trip, year boundaries', () => {
  assert.deepEqual(weekRange(AS_OF), { from: '2026-11-02', to: '2026-11-08', label: '2026-W45' });
  assert.equal(weekRange(AS_OF, -1).label, '2026-W44');
  assert.equal(weekFromLabel('2026-W45'), '2026-11-02');
  assert.equal(isoWeekLabel('2027-01-01'), '2026-W53');
  assert.equal(isoWeekLabel('2026-01-01'), '2026-W01');
  assert.equal(weekFromLabel('2026-W99'), null);
});

test('this week: projects seen, meetings and findings come from meetings in the week only', () => {
  const week = weekRange(AS_OF);
  const seen = projectsSeen(rows, week).map((entry) => rows.find((row) => row.id === entry.dealId).fields.name).sort();
  assert.deepEqual(seen, ['Clearview Data', 'Polaris Compute', 'Starplan Software', 'Wavecraft Health']);
  const xingce = projectsSeen(rows, week).find((entry) => entry.dealId === deal('Starplan Software').id);
  assert.equal(xingce.meetings.length, 2, 'a meeting and a filed board pack in the same week count once as a project');
  assert.ok(findingsIn(rows, week).length >= 6);
  // Last week only Yunshan and Qimu were met.
  assert.equal(projectsSeen(rows, weekRange(AS_OF, -1)).length, 2);
});

test('follow-ups due: overdue first, closed ones and far-off ones left out', () => {
  const due = followupsDue(rows, AS_OF, 7);
  assert.ok(due.length >= 5);
  assert.ok(due[0].overdue && due[1].overdue, 'two sample follow-ups are overdue and lead the list');
  assert.ok(due.every((item) => !['done', 'dropped'].includes(item.record.fields.status)));
  assert.ok(due.every((item) => item.record.fields['due-on'] <= '2026-11-12'));
  const metrics = weekMetrics(rows, weekRange(AS_OF), AS_OF, 7);
  assert.equal(metrics.overdue, 2);
  assert.equal(metrics.projects, 4);
});

test('a project page is one timeline across pre, during and post investment', () => {
  const lanzhou = dealTimeline(rows, deal('Wavecraft Health').id);
  assert.deepEqual(lanzhou.map((group) => group.phase), ['during']);
  const yunshan = dealTimeline(rows, deal('Spruce Robotics').id);
  assert.deepEqual(yunshan[0].meetings.map((row) => row.fields['held-on']), ['2026-10-14', '2026-10-28']);
  const xingce = dealTimeline(rows, deal('Starplan Software').id);
  assert.deepEqual(xingce.map((group) => group.phase), ['post']);
  assert.equal(xingce[0].meetings.length, 3);
});

test('every sample company is marked as invented, and no figures leak into the sample', () => {
  assert.ok(hasSyntheticData(rows));
  for (const row of rows.filter((item) => item.baseKey === 'deals')) assert.match(row.fields.company, /fictional/);
  const text = JSON.stringify(rows.map((row) => row.fields));
  assert.doesNotMatch(text, /[¥$€]|万元|亿元|估值\s*\d|IRR|DPI|TVPI|回报率\s*\d/);
});

test('member preview hides the leadership-only table entirely', async () => {
  globalThis.window = { location: { search: '?demo=1&as=member' } };
  const { demoProvider } = await import('../app/js/providers/demo-provider.js?member');
  const state = await demoProvider.getState();
  assert.ok(!state.visibleBases.includes('ic-notes'));
  assert.ok(state.records.every((row) => row.baseKey !== 'ic-notes'));
  globalThis.window = { location: { search: '' } };
});

// A fake client that answers like the server: the leadership-only Base is
// absent from the node tree for a member, present for a manager.
function fakeClient({ member }) {
  const children = appConfig.bases.filter((base) => !(member && base.restricted)).map((base, index) => ({ id: `nod${index}`, type: 'base', slug: base.slug, baseId: `bse${index}`, metadata: { appId: appConfig.appId, resourceKey: base.key } }));
  const listed = [];
  return {
    listed,
    nodes: {
      list: async () => [{ id: 'nodroot', type: 'folder', slug: 'deal-flow-demo', name: 'Deal Flow', metadata: { appId: appConfig.appId, resourceKey: 'app-root' }, children }],
      get: async () => ({ node: { id: 'nodroot', slug: 'deal-flow-demo', name: 'Deal Flow 演示' }, children }),
    },
    records: {
      list: async (input) => { listed.push(input.baseId); return { records: [], nextCursor: null }; },
      count: async () => ({ total: 0 }),
    },
  };
}
const inspectAll = async (_client, binding) => ({ folder: {}, missing: [], conflicts: [], repairs: [], bases: binding.bases.map((base, index) => ({ ...base, baseId: `bse-${base.key}`, nodeId: `nod${index}` })) });

test('a member whose agent cannot see the IC table still gets a working desk, without that table', async () => {
  const client = fakeClient({ member: true });
  const state = await createLiveProvider(client, inspectAll, () => AS_OF).getState();
  assert.deepEqual(state.visibleBases, ['deals', 'meetings', 'followups', 'digests']);
  assert.ok(!client.listed.includes('bse-ic-notes'), 'never queries a table it cannot see');
  assert.equal(state.folderName, 'Deal Flow 演示');
});

test('a leader sees all five tables', async () => {
  const state = await createLiveProvider(fakeClient({ member: false }), inspectAll, () => AS_OF).getState();
  assert.deepEqual(state.visibleBases, ['deals', 'meetings', 'followups', 'digests', 'ic-notes']);
});

test('a missing shared table is still a broken install, not a permission', async () => {
  const client = fakeClient({ member: true });
  const original = client.nodes.get;
  client.nodes.get = async () => { const folder = await original(); return { ...folder, children: folder.children.filter((node) => node.metadata.resourceKey !== 'meetings') }; };
  await assert.rejects(createLiveProvider(client, inspectAll, () => AS_OF).getState(), /SCHEMA_INCOMPLETE/);
});

test('the connection prompt names the folder and the server, signs in by link, and carries no credential', () => {
  for (const locale of ['zh-CN', 'en']) {
    const text = connectionPrompt(locale, { baseUrl: 'https://busabase.example.cn', folderName: '投资 Deal Flow', space: { id: 'orgTEAM123', name: '示例创投' } });
    assert.match(text, /--space-id orgTEAM123/, 'pins the team space per command');
    assert.doesNotMatch(text, /space use/, 'never changes the person\'s default space');
    assert.match(text, /playbooks search --query "busa-dealflow"/, 'searches by the skill name, which the playbook index matches');
    assert.match(text, /投资 Deal Flow/);
    assert.match(text, /https:\/\/busabase\.example\.cn/);
    assert.match(text, /login --no-wait/);
    assert.match(text, /busa-dealflow/);
    assert.doesNotMatch(text, /Bearer|BUSABASE_API_KEY|api[_-]?key=/i);
  }
});

test('relations resolve however they are shaped', () => {
  assert.deepEqual(relationIds([{ id: 'recccccccccccccccc' }]), ['recccccccccccccccc']);
  assert.deepEqual(relationIds(null), []);
});

test('"today" is the viewer\'s local date, not the UTC date', async () => {
  const { localToday } = await import('../app/js/model.js');
  // 01:50 on 5 Nov in Beijing is still 4 Nov in UTC.
  const beijingEarlyMorning = { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 5 };
  assert.equal(localToday(beijingEarlyMorning), '2026-11-05');
});

test('no app file carries the leadership-only sample content', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const icNotes = (await readFile(new URL('../../ic-notes/records.ndjson', import.meta.url), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(icNotes.length >= 1, 'the package still ships a sample IC row for the restricted table');
  const phrases = icNotes.flatMap((row) => [row.fields['partners-view'], row.fields.conditions]).flatMap((text) => String(text).split('\n')).map((line) => line.replace(/^[-\s（(]+|[）)。\s]+$/g, '')).filter((line) => line.length >= 8);
  const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])))).flat();
  // Everything every member can read: the AirApp, and whatever the template root carries into the Skill node.
  const readable = [...await walk(new URL('../app', import.meta.url).pathname), ...await walk(new URL('../../../scripts', import.meta.url).pathname), new URL('../../../SKILL.md', import.meta.url).pathname];
  for (const file of readable) {
    if (!/\.(js|mjs|md|html|css|json)$/.test(file) || file.includes('/vendor/')) continue;
    const text = await readFile(file, 'utf8');
    for (const phrase of phrases) assert.ok(!text.includes(phrase), `${file} must not contain IC sample text: ${phrase}`);
  }
});

test('people are listed once even when an agent adds their role in brackets', () => {
  const week = weekRange(AS_OF);
  const extra = { id: 'recextrameeting0001', baseKey: 'meetings', fields: { title: 'x', deal: [deal('Clearview Data').id], 'held-on': '2026-11-04', kind: 'follow-up', phase: 'pre', 'recorded-by': 'Zhou Ke (associate)', attendees: 'Zhou Ke and He Jia (analyst); the founders' } };
  const entry = projectsSeen([...rows, extra], week).find((item) => item.dealId === deal('Clearview Data').id);
  assert.deepEqual(entry.people.sort(), ['He Jia', 'Zhou Ke']);
});

test('the prompt names the root Busabase host for any busabase.com origin, and a private host as is', async () => {
  const { defaultServerAddress } = await import('../app/js/model.js');
  assert.equal(defaultServerAddress('https://busabase-demos-gxdzi.busabase.com'), 'https://busabase.com');
  assert.equal(defaultServerAddress('https://busabase.com'), 'https://busabase.com');
  assert.equal(defaultServerAddress('https://busabase.example.cn:8443'), 'https://busabase.example.cn:8443');
  assert.equal(defaultServerAddress('http://localhost:4387'), 'http://localhost:4387');
});

test('the "try saying" examples name a project from the loaded data, not a hard-coded sample', async () => {
  const { trySayExamples } = await import('../app/js/messages.js');
  for (const locale of ['en', 'zh-CN']) assert.ok(trySayExamples[locale].some((line) => line.includes('{project}')) && !trySayExamples[locale].join(' ').includes('Spruce'));
});
