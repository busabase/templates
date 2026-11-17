import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  airedBetween, attentionItems, daysToLive, gmvTotals, overviewMetrics, relationIds, safeDisplay, scoreParts, sessionScore, statusFor, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const sessions = rows.filter((row) => row.baseKey === 'sessions');
const byTitle = (prefix) => sessions.find((row) => String(row.fields.title).startsWith(prefix));
const session = (fields) => ({ id: 'x', baseKey: 'sessions', fields });
const WINDOW = appConfig.readyWindowDays;
const TODAY = appConfig.asOf;

test('each part of the score follows its bands', () => {
  const full = session({ 'stock-pct': 100, 'prep-pct': 100, 'gmv-pct': 100, 'conversion-pct': 4, 'refund-pct': 5 });
  assert.equal(sessionScore(full), 100);
  const payday = Object.fromEntries(scoreParts(byTitle('Payday')).map((part) => [part.key, part.points]));
  assert.deepEqual(payday, { stock: 20, prep: 6, gmv: 0, conversion: 0, refund: 6 });
  assert.equal(weakestPart(byTitle('Payday')).key, 'gmv');
  // Higher is better for stock, checklist, GMV and conversion; lower for refunds.
  assert.equal(sessionScore(session({ 'stock-pct': 74, 'prep-pct': 74, 'gmv-pct': 69, 'conversion-pct': 1.9, 'refund-pct': 12.1 })), 0);
  assert.equal(scoreParts(session({ 'refund-pct': 12 }))[4].points, 6);
});

test('before a session airs, what is not measured yet counts half, not zero', () => {
  const unknown = session({});
  assert.equal(sessionScore(unknown), 50);
  assert.equal(statusFor(sessionScore(unknown)), 'watch');
  // Stock in and checklist done: on track before it airs.
  const mega = scoreParts(byTitle('Double 11 mega'));
  assert.deepEqual(mega.map((part) => part.points), [20, 20, 10, 10, 10]);
  assert.equal(statusFor(sessionScore(byTitle('Double 11 mega'))), 'on-track');
});

test('the status boundaries are 70 and 50', () => {
  assert.equal(statusFor(70), 'on-track');
  assert.equal(statusFor(69), 'watch');
  assert.equal(statusFor(50), 'watch');
  assert.equal(statusFor(49), 'at-risk');
  assert.equal(statusFor(null), null);
});

test('every sample score and status follows the rule', () => {
  for (const row of sessions) {
    assert.equal(row.fields.score, sessionScore(row), row.fields.title);
    assert.equal(row.fields.status, statusFor(sessionScore(row)), row.fields.title);
  }
});

test('each session field holds its latest signal, and GMV % matches GMV and target', () => {
  const FIELD = { stock: 'stock-pct', prep: 'prep-pct', gmv: 'gmv-pct', conversion: 'conversion-pct', refund: 'refund-pct' };
  for (const row of sessions) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.session).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.title} ${kind}`);
    }
    if (row.fields.gmv != null) assert.equal(row.fields['gmv-pct'], Math.round((row.fields.gmv / row.fields['target-gmv']) * 100), row.fields.title);
  }
});

test('sessions that have not aired have no results yet', () => {
  for (const row of sessions.filter((item) => daysToLive(item, TODAY) > 0)) {
    for (const slug of ['gmv', 'gmv-pct', 'conversion-pct', 'refund-pct']) assert.equal(row.fields[slug], undefined, `${row.fields.title} ${slug}`);
  }
});

test('overview: counts, GMV, upcoming and attention order', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW, appConfig.gmvWindowDays);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [10, 3, 3, 16]);
  assert.deepEqual([metrics.gmv, metrics.target], [864700, 860000]);
  assert.equal(metrics.upcoming, 4);
  assert.equal(metrics.notReady, 2);
  const items = attentionItems(rows, TODAY, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.title), ['Double 11 pre-sale, final hours', 'Serum restock live', 'Payday sale live'], 'at risk, nearest to today first');
  assert.equal(items.filter((item) => item.record.fields.title === 'Double 11 pre-sale, final hours').length, 1, 'at risk and not ready is listed once');
  assert.ok(items.some((item) => item.reason === 'not-ready' && item.record.fields.title === '11.11 flash-sale live'));
  assert.ok(!items.some((item) => item.record.fields.title === 'Holiday gift-guide live'), 'airs in eleven days, outside the window');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the candle carton switch is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('the latest review agrees with the sessions', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['on-track-count'], metrics.onTrack);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
  assert.equal(latest.fields['not-ready-count'], metrics.notReady);
  for (const review of rows.filter((row) => row.baseKey === 'reviews')) {
    assert.equal(review.fields['week-gmv'], gmvTotals(airedBetween(rows, review.fields['period-start'], review.fields['period-end'])).gmv, review.fields.title);
  }
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
