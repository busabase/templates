import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, dayNumber, hireScore, overviewMetrics, relationIds, safeDisplay, scoreParts, statusFor, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const hires = rows.filter((row) => row.baseKey === 'hires');
const byName = (prefix) => hires.find((row) => String(row.fields.name).startsWith(prefix));
const hire = (fields) => ({ id: 'x', baseKey: 'hires', fields });
const WINDOW = appConfig.startWindowDays;

test('each part of the score follows its bands', () => {
  const full = hire({ 'access-pct': 100, 'paperwork-pct': 100, 'training-pct': 95, 'checkins-missed': 0, pulse: 4.5 });
  assert.equal(hireScore(full), 100);
  const ethan = Object.fromEntries(scoreParts(byName('Ethan')).map((part) => [part.key, part.points]));
  assert.deepEqual(ethan, { access: 6, paperwork: 20, training: 0, checkins: 0, pulse: 0 });
  assert.equal(weakestPart(byName('Ethan')).key, 'training');
  // Higher is better for the three rates and the pulse; lower for missed 1:1s.
  assert.equal(hireScore(hire({ 'access-pct': 74, 'paperwork-pct': 74, 'training-pct': 59, 'checkins-missed': 3, pulse: 2.9 })), 0);
});

test('before day one, what is not due yet counts half, not zero', () => {
  const unknown = hire({});
  assert.equal(hireScore(unknown), 50);
  assert.equal(statusFor(hireScore(unknown)), 'watch');
  // Ready on every count that is due: on track before the first day.
  const priya = scoreParts(byName('Priya'));
  assert.deepEqual(priya.map((part) => part.points), [20, 20, 10, 10, 10]);
  assert.equal(statusFor(hireScore(byName('Priya'))), 'on-track');
});

test('the status boundaries are 70 and 50', () => {
  assert.equal(statusFor(70), 'on-track');
  assert.equal(statusFor(69), 'watch');
  assert.equal(statusFor(50), 'watch');
  assert.equal(statusFor(49), 'at-risk');
  assert.equal(statusFor(null), null);
});

test('every sample score and status follows the rule', () => {
  for (const row of hires) {
    assert.equal(row.fields.score, hireScore(row), row.fields.name);
    assert.equal(row.fields.status, statusFor(hireScore(row)), row.fields.name);
  }
});

test('each new hire field holds its latest signal', () => {
  const FIELD = { access: 'access-pct', paperwork: 'paperwork-pct', training: 'training-pct', checkins: 'checkins-missed', pulse: 'pulse' };
  for (const row of hires) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.hire).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
    }
  }
});

test('day numbers count the start date as day 1', () => {
  assert.equal(dayNumber(byName('Ethan'), appConfig.asOf), 22);
  assert.equal(dayNumber(byName('Priya'), appConfig.asOf), null, 'not started yet');
  assert.ok(hires.every((row) => (dayNumber(row, appConfig.asOf) ?? 0) <= 90), 'everyone is inside the first 90 days');
});

test('overview: counts, starts and attention order', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, WINDOW);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [10, 3, 3, 16]);
  assert.equal(metrics.starting, 3);
  assert.equal(metrics.notReady, 2);
  const items = attentionItems(rows, appConfig.asOf, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.name), ['Daniel Osei', 'Ethan Cole', 'Hana Sato'], 'at risk, earliest start first');
  assert.equal(items.filter((item) => item.record.fields.name === 'Hana Sato').length, 1, 'at risk and not ready is listed once');
  assert.ok(items.some((item) => item.reason === 'not-ready' && item.record.fields.name === 'Lucas Ferreira'));
  assert.ok(!items.some((item) => item.record.fields.name === 'Omar Haddad'), 'starts in three weeks, outside the window');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'Ethan’s reset is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('the latest review agrees with the new hires', () => {
  const metrics = overviewMetrics(rows, appConfig.asOf, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['on-track-count'], metrics.onTrack);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
  assert.equal(latest.fields['not-ready-count'], metrics.notReady);
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
