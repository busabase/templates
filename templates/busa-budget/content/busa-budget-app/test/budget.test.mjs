import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../app/js/config.js';
import { renderMarkdown } from '../app/js/markdown.js';
import {
  attentionItems, departmentScore, forecastStale, overviewMetrics, relationIds, safeDisplay, scoreParts, statusFor, weakestPart,
} from '../app/js/model.js';

globalThis.window = { location: { search: '' } };
const { demoRows, demoPage } = await import('../app/js/providers/demo-provider.js');
const { createLiveProvider } = await import('../app/js/providers/busabase-provider.js');

const rows = demoRows();
const departments = rows.filter((row) => row.baseKey === 'departments');
const byName = (prefix) => departments.find((row) => String(row.fields.name).startsWith(prefix));
const department = (fields) => ({ id: 'x', baseKey: 'departments', fields });
const WINDOW = appConfig.forecastWindowDays;
const TODAY = appConfig.asOf;

test('each part of the score follows its bands', () => {
  const full = department({ 'ytd-variance-pct': 0, 'forecast-variance-pct': 0, 'headcount-gap': 0, 'unbudgeted-pos': 0, 'renewals-undecided': 0 });
  assert.equal(departmentScore(full), 100);
  const emea = Object.fromEntries(scoreParts(byName('Sales EMEA')).map((part) => [part.key, part.points]));
  assert.deepEqual(emea, { spend: 0, forecast: 0, headcount: 0, purchasing: 6, renewals: 12 });
  assert.equal(weakestPart(byName('Data & AI')).key, 'forecast');
  // Lower is better for every measure; under budget and under plan score full.
  assert.equal(departmentScore(department({ 'ytd-variance-pct': 7, 'forecast-variance-pct': 6, 'headcount-gap': 3, 'unbudgeted-pos': 3, 'renewals-undecided': 3 })), 0);
  assert.equal(scoreParts(department({ 'ytd-variance-pct': -8 }))[0].points, 20, 'under budget scores full');
  assert.equal(scoreParts(department({ 'ytd-variance-pct': 3 }))[0].points, 12);
  assert.equal(scoreParts(department({ 'forecast-variance-pct': 5 }))[1].points, 6);
  assert.equal(scoreParts(department({ 'headcount-gap': -2 }))[2].points, 20, 'under the headcount plan scores full');
});

test('a measure with no reading counts half, not zero', () => {
  assert.equal(departmentScore(department({})), 50);
  assert.equal(statusFor(departmentScore(department({}))), 'watch');
});

test('the status boundaries are 70 and 50', () => {
  assert.equal(statusFor(70), 'on-track');
  assert.equal(statusFor(69), 'watch');
  assert.equal(statusFor(50), 'watch');
  assert.equal(statusFor(49), 'at-risk');
  assert.equal(statusFor(null), null);
});

test('every sample score and status follows the rule, and the variances match the dollars', () => {
  for (const row of departments) {
    const f = row.fields;
    assert.equal(f.score, departmentScore(row), f.name);
    assert.equal(f.status, statusFor(departmentScore(row)), f.name);
    assert.equal(f['ytd-variance-pct'], Math.round(((f['ytd-actual'] - f['ytd-budget']) / f['ytd-budget']) * 100), `${f.name} spend`);
    assert.equal(f['forecast-variance-pct'], Math.round(((f.forecast - f['annual-budget']) / f['annual-budget']) * 100), `${f.name} forecast`);
  }
});

test('each cost center field holds its latest signal, and the forecast date is the latest forecast signal', () => {
  const FIELD = { spend: 'ytd-variance-pct', forecast: 'forecast-variance-pct', headcount: 'headcount-gap', purchasing: 'unbudgeted-pos', renewals: 'renewals-undecided' };
  for (const row of departments) {
    const signals = rows.filter((item) => item.baseKey === 'signals' && relationIds(item.fields.department).includes(row.id) && FIELD[item.fields.kind]);
    for (const kind of Object.keys(FIELD)) {
      const latest = signals.filter((item) => item.fields.kind === kind).sort((a, b) => b.fields['recorded-on'].localeCompare(a.fields['recorded-on']))[0];
      if (latest) assert.equal(row.fields[FIELD[kind]], latest.fields['new-value'], `${row.fields.name} ${kind}`);
      if (latest && kind === 'forecast') assert.equal(row.fields['forecast-on'], latest.fields['recorded-on'], `${row.fields.name} forecast date`);
    }
  }
});

test('a forecast is stale after 30 days, or when there never was one', () => {
  assert.equal(forecastStale(byName('Legal'), TODAY, WINDOW), true, '38 days');
  assert.equal(forecastStale(byName('Data & AI'), TODAY, WINDOW), true, '33 days');
  assert.equal(forecastStale(byName('Security'), TODAY, WINDOW), false, '14 days');
  assert.equal(forecastStale(department({}), TODAY, WINDOW), true);
});

test('overview: counts, projected overrun, open POs and attention order', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  assert.deepEqual([metrics.onTrack, metrics.watch, metrics.atRisk, metrics.total], [9, 4, 3, 16]);
  assert.deepEqual([metrics.overrun, metrics.value, metrics.committed], [2363000, 65800000, 4440000]);
  assert.equal(metrics.forecastStale, 3);
  const items = attentionItems(rows, TODAY, WINDOW);
  assert.deepEqual(items.slice(0, 3).map((item) => item.record.fields.name), ['Sales EMEA', 'Marketing Demand Gen', 'Data & AI'], 'at risk, lowest score first');
  assert.deepEqual(items.filter((item) => item.reason === 'forecast-stale').map((item) => item.record.fields.name), ['Legal', 'Facilities'], 'oldest first; Data & AI is listed as at risk');
  assert.ok(items.some((item) => item.reason === 'overdue'), 'the Data & AI forecast refresh is overdue');
  assert.equal(items.at(-1).reason, 'draft');
});

test('an under-budget cost center does not offset an overrun', () => {
  const over = department({ 'annual-budget': 1000, forecast: 1200 });
  const under = department({ 'annual-budget': 1000, forecast: 700 });
  assert.equal(overviewMetrics([over, under], TODAY, WINDOW).overrun, 200);
});

test('the latest review agrees with the cost centers', () => {
  const metrics = overviewMetrics(rows, TODAY, WINDOW);
  const latest = rows.filter((row) => row.baseKey === 'reviews').sort((a, b) => b.fields['period-end'].localeCompare(a.fields['period-end']))[0];
  assert.equal(latest.fields['on-track-count'], metrics.onTrack);
  assert.equal(latest.fields['at-risk-count'], metrics.atRisk);
  assert.equal(latest.fields['forecast-stale-count'], metrics.forecastStale);
  assert.equal(latest.fields['projected-overrun'], metrics.overrun);
  assert.equal(latest.fields['committed-total'], metrics.committed);
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
