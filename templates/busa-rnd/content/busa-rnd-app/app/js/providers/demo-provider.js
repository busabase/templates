import { appConfig } from '../config.js';
import { demoRecords } from '../demo-data.js';
import { matchesFilters, resolveFilters, sortRecords } from '../model.js';

// Deterministic ids shaped like real ones (`rec` + 15 characters), so the
// relation-resolution path runs exactly as it does on live data.
const idFor = (key) => {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `rec${hash.toString(36).padStart(7, '0')}demo${key.length.toString(36).padStart(4, '0')}`.slice(0, 18);
};

/** Sample rows in the shape the API returns: ids, and relations as id arrays. */
export function demoRows() {
  const relations = new Map(appConfig.bases.map((base) => [base.key, base.fields.filter((field) => field.type === 'relation').map((field) => field.slug)]));
  return appConfig.bases.flatMap((base) => (demoRecords[base.key] || []).map((row) => {
    const fields = { ...row.fields };
    for (const slug of relations.get(base.key)) if (slug in fields) fields[slug] = [].concat(fields[slug]).map(idFor);
    return { id: idFor(row.key), baseKey: base.key, fields };
  }));
}

/** Answer one source the way the server would: filter, sort, one page. */
export function demoPage(rows, source, today) {
  const matching = sortRecords(rows.filter((row) => row.baseKey === source.base && matchesFilters(row, resolveFilters(source.valueFilters, today))), source.sort);
  return { records: matching.slice(0, source.limit), nextCursor: matching.length > source.limit ? 'demo' : null };
}

export const demoProvider = {
  name: 'Demo',
  async getState() {
    const scenario = new URLSearchParams(window.location.search).get('state');
    if (scenario === 'error' || scenario === 'permission') throw new Error(scenario === 'permission' ? 'PROCEDURE_DENIED: This account cannot read the desk.' : 'BRIDGE_UNAVAILABLE: Data could not be read. Retry the connection.');
    const rows = scenario === 'empty' ? [] : demoRows();
    const failing = scenario === 'partial' ? appConfig.sources.at(-1).key : null;
    const records = [], pageInfo = {};
    for (const source of appConfig.sources) {
      if (source.key === failing) continue;
      const page = demoPage(rows, source, appConfig.asOf);
      for (const row of page.records) if (!records.some((item) => item.id === row.id)) records.push(row);
      pageInfo[source.key] = { nextCursor: page.nextCursor };
    }
    const taskStatusCount = {};
    for (const row of rows) if (row.baseKey === 'tasks') taskStatusCount[row.fields.status] = (taskStatusCount[row.fields.status] || 0) + 1;
    return {
      records, pageInfo, taskStatusCount,
      totalCount: Object.fromEntries(appConfig.bases.map((base) => [base.key, rows.filter((row) => row.baseKey === base.key).length])),
      failures: failing ? [failing] : [],
      refreshedAt: scenario === 'stale' ? '2026-01-01T00:00:00Z' : new Date().toISOString(),
      asOf: appConfig.asOf,
    };
  },
  async loadMore() { return { records: [], nextCursor: null }; },
};
