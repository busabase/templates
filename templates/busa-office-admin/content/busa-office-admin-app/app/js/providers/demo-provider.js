import { appConfig } from '../config.js';
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
};
