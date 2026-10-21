import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import { attentionItems, overviewMetrics, projectProgress, relationIds, resolveFilters, safeDisplay } from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const byTitle = (prefix) => rows.find((row) => String(row.fields.title).startsWith(prefix));
const source = (key) => appConfig.sources.find((item) => item.key === key);

test('markdown escapes stored HTML and only links http(s)', () => {
  const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://git.example.com/a/pull/1) ![i](data:image/png;base64,AA)');
  assert.doesNotMatch(html, /<script|href="javascript|src="data/);
  assert.match(html, /<a href="https:\/\/git\.example\.com\/a\/pull\/1" target="_blank" rel="noopener noreferrer">ok<\/a>/);
});

test('markdown renders tables and keeps indented lines inside their list item', () => {
  const html = renderMarkdown('1. Open checkout.\n   **Expect:** a coupon field.\n2. Pay.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.match(html, /<ol><li>Open checkout\.<br><strong>Expect:<\/strong> a coupon field\.<\/li><li>Pay\.<\/li><\/ol>/);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
});

test('relations come back as id arrays and resolve the same way however they are shaped', () => {
  assert.deepEqual(relationIds(['recaaaaaaaaaaaaaaa']), ['recaaaaaaaaaaaaaaa']);
  assert.deepEqual(relationIds('recbbbbbbbbbbbbbbb'), ['recbbbbbbbbbbbbbbb']);
  assert.deepEqual(relationIds([{ id: 'recccccccccccccccc' }]), ['recccccccccccccccc']);
  assert.deepEqual(relationIds(null), []);
});

test('demo rows look like the API: real-shaped unique ids, relations as id arrays, no package keys', () => {
  const ids = new Set(rows.map((row) => row.id));
  assert.equal(ids.size, rows.length);
  for (const row of rows) assert.match(row.id, /^rec[a-z0-9]{15}$/);
  const task = byTitle('Apply coupon codes');
  assert.ok(Array.isArray(task.fields.product) && ids.has(task.fields.product[0]));
  for (const row of rows) {
    const base = appConfig.bases.find((item) => item.key === row.baseKey);
    for (const field of base.fields.filter((item) => item.type === 'relation' && row.fields[item.slug])) {
      assert.ok(row.fields[field.slug].every((id) => ids.has(id)), `${row.id}.${field.slug} holds record ids, not package keys`);
    }
  }
  assert.equal(safeDisplay(task.fields.product[0]), '-', 'a leaked id never renders');
  assert.equal(safeDisplay('Month-end reconciliation totals'), 'Month-end reconciliation totals', 'ordinary words that start like an id survive');
  assert.equal(safeDisplay('see recmvhp4a2xnt2vdpl'), 'see -');
});

test('sources read open work and the recent past, not the oldest rows', () => {
  const today = appConfig.asOf;
  const open = demoPage(rows, source('tasks-open'), today).records;
  assert.ok(open.every((row) => !['done', 'canceled'].includes(row.fields.status)));
  assert.equal(open[0].fields['due-date'], '2026-10-17', 'earliest due date first');
  const done = demoPage(rows, source('tasks-done'), today).records;
  assert.deepEqual(done.map((row) => row.fields['completed-on']), ['2026-10-20', '2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13']);
  const changes = demoPage(rows, source('changelog'), today).records;
  assert.equal(changes[0].fields['merged-on'], '2026-10-20');
  assert.deepEqual(resolveFilters(source('tasks-done').valueFilters, '2026-10-21')[1], { fieldSlug: 'completed-on', operator: 'gte', value: '2026-09-23' });
});

test('attention lists what only a person can do, most decisive first', () => {
  const items = attentionItems(rows, appConfig.asOf);
  assert.deepEqual(items.map((item) => item.reason), ['acceptance', 'acceptance', 'finalise', 'off-track', 'at-risk', 'overdue']);
  assert.ok(items.find((item) => item.reason === 'overdue').record.fields.title.startsWith('Rate-limit'));
});

test('overview metrics count the last seven days, inclusive of today', () => {
  assert.deepEqual(overviewMetrics(rows, appConfig.asOf, 7), { merged: 7, accepted: 1, backlog: 5 });
});

test('project progress counts loaded tasks and ignores canceled ones', () => {
  const checkout = byTitle('Checkout revamp');
  assert.deepEqual(projectProgress(rows, checkout.id), { done: 2, total: 6 });
});

test('the live provider asks the server for one bounded, filtered, typed-sort page per source', async () => {
  const calls = [];
  const bases = appConfig.bases.map((base) => ({ ...base, nodeId: `nod${base.key}`, baseId: `bse${base.key}` }));
  const client = {
    nodes: {
      list: async () => [{ id: 'nodroot', type: 'folder', metadata: { appId: 'busa-rnd', resourceKey: 'app-root' }, children: [] }],
      get: async () => ({ node: { slug: 'busa-rnd' }, children: bases.map((base) => ({ id: base.nodeId, type: 'base', baseId: base.baseId, slug: base.key, metadata: { appId: 'busa-rnd', resourceKey: base.key } })) }),
    },
    records: {
      list: async (input) => { calls.push(input); return { records: [], nextCursor: null }; },
      count: async () => ({ total: 0 }),
      groupBy: async () => ({ groups: [{ value: 'backlog', count: 3 }], total: 3 }),
    },
  };
  const inspect = async () => ({ folder: { nodeId: 'nodroot' }, bases, missing: [], repairs: [] });
  const provider = createLiveProvider(client, inspect, () => '2026-10-21');
  const state = await provider.getState();
  assert.equal(calls.length, appConfig.sources.length);
  const done = calls.find((call) => call.baseId === 'bsetasks' && call.sort?.fieldSlug === 'completed-on');
  assert.deepEqual(done.valueFilters[1], { fieldSlug: 'completed-on', operator: 'gte', value: '2026-09-23' });
  assert.deepEqual(done.sort, { fieldSlug: 'completed-on', fieldType: 'date', direction: 'desc' });
  assert.ok(calls.every((call) => call.limit <= 50 && !call.cursor));
  assert.deepEqual(state.taskStatusCount, { backlog: 3 });
});
