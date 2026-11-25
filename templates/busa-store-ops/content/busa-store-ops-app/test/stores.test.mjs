import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, auditOverdue, overviewMetrics, relationIds, safeDisplay, scoreParts, statusFor, storeScore, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const stores = rows.filter((row) => row.baseKey === 'stores');
const byName = (prefix) => stores.find((row) => String(row.fields.name).startsWith(prefix));
const store = (fields) => ({ id: 'x', baseKey: 'stores', fields });
const WINDOW = appConfig.auditWindowDays;
const TODAY = appConfig.asOf;

test('each part of the score follows its bands', () => {
  const full = store({ 'audit-score': 90, 'sales-pct': 100, rating: 4.5, 'staffing-pct': 98, 'overdue-fixes': 0 });
  assert.equal(storeScore(full), 100);
  const mission = Object.fromEntries(scoreParts(byName('Mission')).map((part) => [part.key, part.points]));
  assert.deepEqual(mission, { audit: 6, sales: 6, rating: 6, staffing: 6, fixes: 0 });
  assert.equal(weakestPart(byName('Mission')).key, 'fixes');
  // Higher is better for audit, sales, rating and staffing; lower for overdue fixes.
  assert.equal(storeScore(store({ 'audit-score': 69, 'sales-pct': 89, rating: 3.9, 'staffing-pct': 89, 'overdue-fixes': 3 })), 0);
  assert.equal(scoreParts(store({ 'overdue-fixes': 2 }))[4].points, 6);
});

test('a measure with no reading counts half, not zero', () => {
  assert.equal(storeScore(store({})), 50);
  assert.equal(statusFor(storeScore(store({}))), 'watch');
});

test('the status boundaries are 70 and 50', () => {
  assert.equal(statusFor(70), 'on-track');
  assert.equal(statusFor(69), 'watch');
  assert.equal(statusFor(50), 'watch');
  assert.equal(statusFor(49), 'at-risk');
  assert.equal(statusFor(null), null);
});

test('every sample score and status follows the rule', () => {
  for (const row of stores) {
    assert.equal(row.fields.score, storeScore(row), row.fields.name);
    assert.equal(row.fields.status, statusFor(storeScore(row)), row.fields.name);
  }
});

test('each store field holds its latest signal, and the audit date is the latest audit', () => {
  const FIELD = { audit: 'audit-score', sales: 'sales-pct', rating: 'rating', staffing: 'staffing-pct', fixes: 'overdue-fixes' };
  for (const row of stores) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.store).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
      if (latest && kind === 'audit') assert.equal(row.fields['audited-on'], latest.fields['recorded-on'], `${row.fields.name} audit date`);
    }
  }
});

test('an audit is overdue after 30 days, or when there never was one', () => {
  assert.equal(auditOverdue(byName('Ballard'), TODAY, WINDOW), true, '45 days');
  assert.equal(auditOverdue(byName('Hawthorne'), TODAY, WINDOW), true, '39 days');
  assert.equal(auditOverdue(byName('Capitol Hill'), TODAY, WINDOW), false, '19 days');
  assert.equal(auditOverdue(store({}), TODAY, WINDOW), true);
});

test('overview: counts, revenue at risk and attention order', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [10, 3, 3, 16]);
  assert.deepEqual([metrics.revenueAtRisk, metrics.revenue], [391000, 2137000]);
  assert.equal(metrics.auditOverdue, 2);
  const items = attentionItems(rows, TODAY, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.name), ['Mission Street', 'Capitol Hill', 'Venice Boulevard'], 'at risk, lowest score first');
  assert.deepEqual(items.filter((item) => item.reason === 'audit-overdue').map((item) => item.record.fields.name), ['Ballard', 'Hawthorne'], 'longest overdue first');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the Venice reset is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('the latest review agrees with the stores', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['on-track-count'], metrics.onTrack);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
  assert.equal(latest.fields['audit-overdue-count'], metrics.auditOverdue);
  assert.equal(latest.fields['revenue-at-risk'], metrics.revenueAtRisk);
});

test('demo pages honour sort and limit', () => {
  const source = appConfig.sources.find((item) => item.key === 'signals');
  const page = demoPage(rows, { ...source, limit: 5 }, TODAY);
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
