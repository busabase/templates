import test from 'node:test';
import assert from 'node:assert/strict';
import { appConfig } from '../app/js/config.js';
import { needsAttention, confirmedNetPay, mergePage, safeDisplay, normalizeRecord } from '../app/js/office-model.js';
import { bindInstalledResources } from '../app/js/resource-binding.js';
import { createLiveProvider } from '../app/js/providers/busabase-provider.js';

test('record text preserves separators and reconciliation prose while masking opaque references', () => {
  assert.equal(safeDisplay('Supplier A / Supplier B'), 'Supplier A / Supplier B');
  assert.equal(safeDisplay('Monthly reconciliation pending.'), 'Monthly reconciliation pending.');
  assert.equal(safeDisplay('Related recmtu6jct9xgoq405 awaiting evidence'), 'Related - awaiting evidence');
});

function fixture({ duplicate = false, missing = false, fail = '' } = {}) {
  const calls = [];
  const root = { id: 'nodtestroot000001', slug: 'custom-installed-office', type: 'folder', metadata: { appId: appConfig.appId, resourceKey: 'app-root', schemaVersion: 1 } };
  const bases = appConfig.bases.map((base) => ({ id: `nodtest${base.key}`, baseId: `bsetest${base.key}`, slug: `custom-prefix-${base.key}`, type: 'base', metadata: { appId: appConfig.appId, resourceKey: base.key, schemaVersion: 1 } }));
  if (missing) bases.pop();
  const client = {
    nodes: {
      async list(input) { calls.push(['metadata', input]); return [{ type: 'folder', children: duplicate ? [root, { ...root, id: 'nodtestroot000002' }] : [root] }]; },
      async get() { return { node: root, children: bases }; },
    },
    records: {
      async list(input) { calls.push(['records', input]); if (input.baseId === fail) throw new Error('FORBIDDEN'); return { records: [{ id: `recpage${input.baseId}`, headCommit: { payload: { title: 'Fixture', status: 'open' } } }], nextCursor: input.cursor ? null : 'page-two' }; },
      async count(input) { calls.push(['count', input]); return { total: 87 }; },
    },
  };
  return { client, calls };
}
test('date alerts include overdue renewals and exclude archived contracts', () => {
  const base = { key: 'contracts', attention: ['renewal'], status: 'status', date: 'expires' };
  assert.equal(needsAttention({ fields: { status: 'signed', expires: '2026-09-01' } }, base, '2026-09-29'), true);
  assert.equal(needsAttention({ fields: { status: 'archived', expires: '2026-09-01' } }, base, '2026-09-29'), false);
  assert.equal(needsAttention({ fields: { status: 'signed', expires: '2026-11-29' } }, base, '2026-09-29'), false);
});
test('net pay uses selected month and approved or paid finite explicit inputs only', () => {
  const row = (status, gross, deductions, period = '2026-09') => ({ baseKey: 'payroll', fields: { status, 'gross-pay': gross, deductions, period } });
  const result = confirmedNetPay([row('approved', 12000, 2100), row('paid', 18000, 3100), row('draft', 99999, 0), row('approved', 5, undefined), row('approved', 100, 0, '2026-10')], '2026-09');
  assert.deepEqual(result, { amount: 24800, count: 2, missing: 1 });
});
if (appConfig.appId.endsWith('-hr')) test('salary proposals cannot change payroll snapshot and missing salary is not zero', () => {
  assert.equal(confirmedNetPay(appConfig.demoRecords, '2026-09').amount, 24800);
  const employee = appConfig.demoRecords.find((row) => row.baseKey === 'employees' && row.fields['employee-code'] === 'EMP-101');
  assert.equal(employee.fields['confirmed-salary'], 12000);
  const incomplete = appConfig.demoRecords.find((row) => row.baseKey === 'employees' && row.fields.status === 'incomplete');
  assert.equal(incomplete.fields['confirmed-salary'], undefined);
});
if (appConfig.appId.endsWith('-admin')) test('source date conflict retains both conflicting dates', () => {
  const source = appConfig.demoRecords.find((row) => row.baseKey === 'sources' && row.fields.status === 'conflict');
  assert.match(source.fields.notes, /2026-10-31/); assert.match(source.fields.notes, /2027-10-31/);
});
test('renamed nested installation is bound only by ownership metadata', async () => {
  const { client, calls } = fixture();
  const bound = await bindInstalledResources(client, appConfig);
  assert.equal(bound.folder.slug, 'custom-installed-office');
  assert.equal(bound.bases[0].slug, `custom-prefix-${appConfig.bases[0].key}`);
  assert.deepEqual(calls, [['metadata', { parentId: null, depth: 3 }]]);
});
test('ambiguous or missing installations fail before reading records', async () => {
  for (const options of [{ duplicate: true }, { missing: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(createLiveProvider(client).getState(), /SETUP_CONFLICT|SCHEMA_INCOMPLETE/);
    assert.equal(calls.some(([kind]) => kind === 'records'), false);
  }
});
test('provider initially reads one configured page per Base then one page on explicit continuation', async () => {
  const { client, calls } = fixture();
  const provider = createLiveProvider(client);
  const payload = await provider.getState();
  assert.equal(payload.records.length, 4);
  assert.equal(payload.totalCount[appConfig.bases[0].key], 87);
  assert.equal(calls.filter(([kind]) => kind === 'records').length, 4);
  assert.ok(calls.filter(([kind]) => kind === 'records').every(([, args]) => args.limit === 50 && !args.cursor));
  const page = await provider.loadMore(appConfig.bases[0].key, 'page-two');
  assert.equal(page.nextCursor, null);
  assert.equal(calls.filter(([kind]) => kind === 'records').length, 5);
  assert.equal(calls.filter(([kind]) => kind === 'metadata').length, 1);
});
test('one forbidden Base remains a visible partial state without fabricated data', async () => {
  const key = appConfig.bases[0].key;
  const provider = createLiveProvider(fixture({ fail: `bsetest${key}` }).client);
  const payload = await provider.getState();
  assert.deepEqual(payload.failures, [key]);
  assert.equal(payload.records.some((record) => record.baseKey === key), false);
});
test('every page normalizes canonical API payload and deduplicates records', () => {
  const row = normalizeRecord({ id: 'a', headCommit: { payload: { title: 'Next page' } } }, 'sources');
  assert.deepEqual(mergePage([{ id: 'a', fields: { title: 'Old' } }, { id: 'b' }], [row]), [row, { id: 'b' }]);
  assert.equal(safeDisplay('recmtu6jct9xgoq405'), '-');
});
