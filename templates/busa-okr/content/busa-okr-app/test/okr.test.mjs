import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, averageProgress, expectedProgress, krProgress, overviewMetrics, relationIds, safeDisplay, statusFor, worstStatus,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const byTitle = (prefix) => rows.find((row) => String(row.fields.title).startsWith(prefix));
const expected = expectedProgress(appConfig.quarter, appConfig.asOf);

test('expected progress is the share of the quarter gone', () => {
  assert.equal(expectedProgress(appConfig.quarter, '2026-10-01'), 0);
  assert.equal(expectedProgress(appConfig.quarter, '2027-01-15'), 1);
  assert.ok(Math.abs(expected - 35 / 92) < 0.01);
});

test('progress works for results where lower is better', () => {
  const churn = byTitle('Subscriber 90-day churn');
  assert.ok(krProgress(churn) < 0, 'churn rose, so progress is negative');
  const cost = byTitle('Cost per order');
  assert.ok(Math.abs(krProgress(cost) - 0.375) < 1e-9);
});

test('every sample light follows the rule', () => {
  for (const kr of rows.filter((row) => row.baseKey === 'key-results')) {
    assert.equal(kr.fields.status, statusFor(krProgress(kr), expected), kr.fields.title);
  }
});

test('an objective light is the worst of its own key results', () => {
  for (const objective of rows.filter((row) => row.baseKey === 'objectives')) {
    const krs = rows.filter((row) => row.baseKey === 'key-results' && relationIds(row.fields.objective).includes(objective.id));
    assert.equal(objective.fields.confidence, worstStatus(krs.map((kr) => kr.fields.status)), objective.fields.title);
  }
});

test('overview counts and attention order', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, 7, appConfig.quarter);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [7, 4, 3, 14]);
  assert.ok(metrics.progress > 0 && metrics.progress < expected);
  const items = attentionItems(rows, appConfig.asOf);
  assert.equal(items[0].reason, 'at-risk');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the trade-show follow-up action is overdue');
  assert.equal(averageProgress([]), null);
});

test('demo pages honour sort and limit', () => {
  const source = appConfig.sources.find((item) => item.key === 'check-ins');
  const page = demoPage(rows, { ...source, limit: 5 }, appConfig.asOf);
  assert.equal(page.records.length, 5);
  assert.equal(page.nextCursor, 'demo');
  const dates = page.records.map((row) => row.fields['checked-on']);
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
