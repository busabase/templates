import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, overviewMetrics, ratingFor, relationIds, safeDisplay, scoreParts, supplierScore, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const suppliers = rows.filter((row) => row.baseKey === 'suppliers');
const byName = (prefix) => suppliers.find((row) => String(row.fields.name).startsWith(prefix));
const supplier = (fields) => ({ id: 'x', baseKey: 'suppliers', fields });
const WINDOW = appConfig.contractWindowDays;

test('each part of the score follows its bands', () => {
  const full = supplier({ 'on-time-pct': 95, 'defect-pct': 0.5, 'price-variance-pct': 0, 'invoice-match-pct': 95, 'response-days': 1 });
  assert.equal(supplierScore(full), 100);
  const pacific = Object.fromEntries(scoreParts(byName('Pacific Pulp')).map((part) => [part.key, part.points]));
  assert.deepEqual(pacific, { delivery: 0, quality: 0, price: 6, invoice: 12, response: 12 });
  assert.equal(weakestPart(byName('Pacific Pulp')).key, 'delivery');
  // Lower is better for rejects, price and response; higher for the two rates.
  assert.equal(supplierScore(supplier({ 'on-time-pct': 79, 'defect-pct': 2.1, 'price-variance-pct': 5.1, 'invoice-match-pct': 79, 'response-days': 8 })), 0);
});

test('a measure with no reading counts half, not zero', () => {
  const unknown = supplier({});
  assert.equal(supplierScore(unknown), 50);
  assert.equal(ratingFor(supplierScore(unknown)), 'watch');
  const ironleaf = scoreParts(byName('Ironleaf')).find((part) => part.key === 'invoice');
  assert.equal(ironleaf.reading, null);
  assert.equal(ironleaf.points, 10);
});

test('the rating boundaries are 70 and 50', () => {
  assert.equal(ratingFor(70), 'preferred');
  assert.equal(ratingFor(69), 'watch');
  assert.equal(ratingFor(50), 'watch');
  assert.equal(ratingFor(49), 'at-risk');
  assert.equal(ratingFor(null), null);
});

test('every sample score and rating follows the rule', () => {
  for (const row of suppliers) {
    assert.equal(row.fields.score, supplierScore(row), row.fields.name);
    assert.equal(row.fields.rating, ratingFor(supplierScore(row)), row.fields.name);
  }
});

test('each supplier field holds its latest signal', () => {
  const FIELD = { delivery: 'on-time-pct', quality: 'defect-pct', price: 'price-variance-pct', invoice: 'invoice-match-pct', response: 'response-days' };
  for (const row of suppliers) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.supplier).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
    }
  }
});

test('overview: spend at risk, counts and attention order', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, WINDOW);
  assert.deepEqual([metrics.preferred, metrics.watch, metrics.atRisk, metrics.total], [8, 3, 3, 14]);
  assert.equal(metrics.spendAtRisk, 2970000);
  assert.equal(metrics.totalSpend, 7150000);
  assert.equal(metrics.ending, 5);
  assert.equal(metrics.endingSpend, 2580000);
  const items = attentionItems(rows, appConfig.asOf, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.name), ['Pacific Pulp Packaging', 'Northline Refrigerated Freight', 'Altura Green Coffee Importers'], 'at risk, soonest contract end first');
  assert.ok(items.some((item) => item.reason === 'contract' && item.record.fields.name === 'Valley Oat Co.'));
  assert.ok(!items.some((item) => item.record.fields.name === 'Bellweather Dairy'), 'watch but contract runs to June');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the lid credit is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('the latest review agrees with the suppliers', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['spend-at-risk'], metrics.spendAtRisk);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
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
