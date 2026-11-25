import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, checkinOverdue, overviewMetrics, projectScore, relationIds, safeDisplay, scoreParts, statusFor, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const projects = rows.filter((row) => row.baseKey === 'projects');
const byName = (prefix) => projects.find((row) => String(row.fields.name).startsWith(prefix));
const project = (fields) => ({ id: 'x', baseKey: 'projects', fields });
const WINDOW = appConfig.checkinWindowDays;
const TODAY = appConfig.asOf;

test('each part of the score follows its bands', () => {
  const full = project({ 'burn-gap': 0, 'slip-days': 0, 'wip-days': 30, 'unsigned-changes': 0, 'client-pulse': 4.5 });
  assert.equal(projectScore(full), 100);
  const harlow = Object.fromEntries(scoreParts(byName('Harlow')).map((part) => [part.key, part.points]));
  assert.deepEqual(harlow, { budget: 0, schedule: 0, billing: 12, scope: 0, client: 0 });
  assert.equal(weakestPart(byName('Kestrel')).key, 'schedule');
  // Lower is better for burn gap, slip, unbilled age and unsigned changes; higher for client pulse.
  assert.equal(projectScore(project({ 'burn-gap': 11, 'slip-days': 11, 'wip-days': 61, 'unsigned-changes': 3, 'client-pulse': 3.4 })), 0);
  assert.equal(scoreParts(project({ 'burn-gap': -8 }))[0].points, 20, 'under budget scores full');
  assert.equal(scoreParts(project({ 'wip-days': 45 }))[2].points, 12);
});

test('a measure with no reading counts half, not zero', () => {
  assert.equal(projectScore(project({})), 50);
  assert.equal(statusFor(projectScore(project({}))), 'watch');
});

test('the status boundaries are 70 and 50', () => {
  assert.equal(statusFor(70), 'on-track');
  assert.equal(statusFor(69), 'watch');
  assert.equal(statusFor(50), 'watch');
  assert.equal(statusFor(49), 'at-risk');
  assert.equal(statusFor(null), null);
});

test('every sample score and status follows the rule, and burn gap is budget used minus work done', () => {
  for (const row of projects) {
    assert.equal(row.fields.score, projectScore(row), row.fields.name);
    assert.equal(row.fields.status, statusFor(projectScore(row)), row.fields.name);
    assert.equal(row.fields['burn-gap'], row.fields['budget-used-pct'] - row.fields['complete-pct'], row.fields.name);
  }
});

test('each project field holds its latest signal, and the check-in date is the latest client pulse', () => {
  const FIELD = { budget: 'burn-gap', schedule: 'slip-days', billing: 'wip-days', scope: 'unsigned-changes', client: 'client-pulse' };
  for (const row of projects) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.project).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
      if (latest && kind === 'client') assert.equal(row.fields['checked-in-on'], latest.fields['recorded-on'], `${row.fields.name} check-in date`);
    }
  }
});

test('a check-in is overdue after 14 days, or when there never was one', () => {
  assert.equal(checkinOverdue(byName('Elmstead'), TODAY, WINDOW), true, '25 days');
  assert.equal(checkinOverdue(byName('Juno'), TODAY, WINDOW), true, '18 days');
  assert.equal(checkinOverdue(byName('Granite'), TODAY, WINDOW), false, '11 days');
  assert.equal(checkinOverdue(project({}), TODAY, WINDOW), true);
});

test('overview: counts, contract value at risk, unbilled and attention order', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [9, 4, 3, 16]);
  assert.deepEqual([metrics.valueAtRisk, metrics.value, metrics.unbilled], [1312000, 4102000, 560000]);
  assert.equal(metrics.checkinOverdue, 3);
  const items = attentionItems(rows, TODAY, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.client), ['Harlow Hotels', 'Kestrel Air', 'Brightwater Credit Union'], 'at risk, lowest score first');
  assert.deepEqual(items.filter((item) => item.reason === 'checkin-overdue').map((item) => item.record.fields.client), ['Elmstead College', 'Juno Pet Care'], 'longest quiet first; Brightwater is listed as at risk');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the Brightwater change order is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('the latest review agrees with the projects', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['on-track-count'], metrics.onTrack);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
  assert.equal(latest.fields['checkin-overdue-count'], metrics.checkinOverdue);
  assert.equal(latest.fields['value-at-risk'], metrics.valueAtRisk);
  assert.equal(latest.fields['unbilled-total'], metrics.unbilled);
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
