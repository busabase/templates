import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, healthFor, healthParts, healthScore, overviewMetrics, relationIds, safeDisplay, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const accounts = rows.filter((row) => row.baseKey === 'accounts');
const byName = (prefix) => accounts.find((row) => String(row.fields.name).startsWith(prefix));
const account = (fields) => ({ id: 'x', baseKey: 'accounts', fields });
const WINDOW = appConfig.renewalWindowDays;

test('each part of the score follows its bands', () => {
  const full = account({ 'seats-licensed': 10, 'seats-active': 7, 'seats-active-prior': 7, 'urgent-tickets': 0, nps: 9, 'days-overdue': 0 });
  assert.equal(healthScore(full), 100);
  const harbor = Object.fromEntries(healthParts(byName('Harbor Point')).map((part) => [part.key, part.points]));
  assert.deepEqual(harbor, { usage: 6, trend: 0, support: 6, sentiment: 0, billing: 20 });
  assert.equal(weakestPart(byName('Harbor Point')).key, 'trend');
});

test('a signal with no reading counts half, not zero', () => {
  const unknown = account({});
  assert.equal(healthScore(unknown), 50);
  assert.equal(healthFor(healthScore(unknown)), 'watch');
  const fairway = healthParts(byName('Fairway')).find((part) => part.key === 'sentiment');
  assert.equal(fairway.reading, null);
  assert.equal(fairway.points, 10);
});

test('the light boundaries are 70 and 50', () => {
  assert.equal(healthFor(70), 'healthy');
  assert.equal(healthFor(69), 'watch');
  assert.equal(healthFor(50), 'watch');
  assert.equal(healthFor(49), 'at-risk');
  assert.equal(healthFor(null), null);
});

test('every sample score and light follows the rule', () => {
  for (const row of accounts) {
    assert.equal(row.fields['health-score'], healthScore(row), row.fields.name);
    assert.equal(row.fields.health, healthFor(healthScore(row)), row.fields.name);
  }
});

test('each account field holds its latest numeric signal', () => {
  const FIELD = { support: 'urgent-tickets', sentiment: 'nps', billing: 'days-overdue', usage: 'seats-active' };
  for (const row of accounts) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.account).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
    }
  }
});

test('overview: revenue at risk, counts and attention order', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, WINDOW);
  assert.deepEqual([metrics.healthy, metrics.watch, metrics.atRisk, metrics.total], [8, 3, 3, 14]);
  assert.equal(metrics.arrAtRisk, 184000);
  assert.equal(metrics.totalArr, 754000);
  assert.equal(metrics.renewing, 5);
  const items = attentionItems(rows, appConfig.asOf, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.name), ['Harbor Point Logistics', 'Cedar & Pine Property Group', 'Brightline HVAC'], 'at risk, soonest renewal first');
  assert.ok(items.some((item) => item.reason === 'renewal' && item.record.fields.name === 'Summit Dental Partners'));
  assert.ok(!items.some((item) => item.record.fields.name === 'Northgate Facilities'), 'watch but renewing in May');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the Brightline invoice call is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('demo pages honour sort and limit', () => {
  const source = appConfig.sources.find((item) => item.key === 'signals');
  const page = demoPage(rows, { ...source, limit: 5 }, appConfig.asOf);
  assert.equal(page.records.length, 5);
  assert.equal(page.nextCursor, 'demo');
  const dates = page.records.map((row) => row.fields['recorded-on']);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('display never shows a raw id and markdown escapes HTML', () => {
  assert.equal(safeDisplay('see recabc123def456ghi'), 'see -');
  assert.doesNotMatch(renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1))'), /<script|href="javascript/);
});

test('live provider refuses to guess when the install is incomplete', async () => {
  const client = { nodes: { list: async () => [] } };
  await assert.rejects(createLiveProvider(client).getState(), /SETUP_CONFLICT|SCHEMA/);
});
