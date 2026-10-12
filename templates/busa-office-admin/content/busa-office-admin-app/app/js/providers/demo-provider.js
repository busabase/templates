import { appConfig } from '../config.js';
const scenario = () => new URLSearchParams(window.location.search).get('state');
const rows = (key) => (scenario() === 'empty' ? [] : appConfig.demoRecords.filter((row) => row.baseKey === key));
const compare = { eq: (a, b) => a === b, ne: (a, b) => a !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b };
// Same contract as the live records.count valueFilters: date values compare as
// instants, everything else as stored values; a missing value never matches
// an ordering comparison.
const matches = (row, filter) => {
  const field = appConfig.bases.find((base) => base.key === row.baseKey)?.fields.find((item) => item.slug === filter.fieldSlug);
  const raw = row.fields[filter.fieldSlug];
  if (field?.type === 'date') {
    if (!raw) return filter.operator === 'ne';
    return compare[filter.operator](Date.parse(raw), Date.parse(filter.value));
  }
  return compare[filter.operator](raw ?? null, filter.value);
};
export const demoProvider = {
  name: 'Demo',
  async getState() {
    const scenario = new URLSearchParams(window.location.search).get('state');
    if (scenario === 'error' || scenario === 'permission') throw new Error(scenario === 'permission' ? 'PROCEDURE_DENIED: Access to employee and administrative records is restricted.' : 'BRIDGE_UNAVAILABLE: Data could not be read. Retry the connection.');
    return {
      records: scenario === 'empty' ? [] : structuredClone(appConfig.demoRecords.filter((row) => scenario !== 'partial' || row.baseKey !== appConfig.bases.at(-1).key)),
      totalCount: Object.fromEntries(appConfig.bases.map((base) => [base.key, scenario === 'empty' ? 0 : appConfig.demoRecords.filter((row) => row.baseKey === base.key).length])),
      pageInfo: Object.fromEntries(appConfig.bases.map((base) => [base.key, { nextCursor: null }])),
      failures: scenario === 'partial' ? [appConfig.bases.at(-1).key] : [],
      refreshedAt: scenario === 'stale' ? '2026-01-01T00:00:00Z' : new Date().toISOString(), asOf: appConfig.asOf,
    };
  },
  async count(key, valueFilters = []) {
    if (scenario() === 'partial' && key === appConfig.bases.at(-1).key) return null;
    return rows(key).filter((row) => valueFilters.every((filter) => matches(row, filter))).length;
  },
  async getRecord(key, recordId) {
    const row = rows(key).find((item) => item.id === recordId);
    return row ? structuredClone(row) : null;
  },
};
