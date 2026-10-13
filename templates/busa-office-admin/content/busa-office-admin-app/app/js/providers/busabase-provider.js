import { inspectProvisionedResources } from '../../vendor/busabase-airapp.js';
import { appConfig } from '../config.js';
import { createRuntimeClient } from '../busabase-client.js';
import { normalizeRecord } from '../office-model.js';
import { bindInstalledResources } from '../resource-binding.js';

export function createLiveProvider(client = null, inspect = inspectProvisionedResources) {
  let bases;
  async function resources() {
    if (bases) return bases;
    client ||= createRuntimeClient();
    const binding = await bindInstalledResources(client, appConfig);
    const resolution = await inspect(client, binding);
    if (!resolution.folder || resolution.missing.length || resolution.conflicts?.length || resolution.repairs?.length) {
      throw new Error('SCHEMA_INCOMPLETE: Install this complete template in its own folder; check resource ownership.');
    }
    bases = resolution.bases;
    return bases;
  }
  async function page(base, cursor) {
    const result = await client.records.list({ baseId: base.baseId, limit: base.readLimit, ...(cursor ? { cursor } : {}) });
    return { records: (result.records || []).map((row) => normalizeRecord(row, base.key)), nextCursor: result.nextCursor || null };
  }
  return {
    name: 'Busabase',
    async getState() {
      const resolved = await resources();
      const results = await Promise.all(resolved.map(async (base) => {
        const [records, count] = await Promise.allSettled([page(base), client.records.count({ baseId: base.baseId })]);
        return { base, records, count };
      }));
      const records = [], pageInfo = {}, totalCount = {}, failures = [];
      for (const item of results) {
        if (item.records.status === 'fulfilled') { records.push(...item.records.value.records); pageInfo[item.base.key] = { nextCursor: item.records.value.nextCursor }; }
        else failures.push(item.base.key);
        totalCount[item.base.key] = item.count.status === 'fulfilled' ? item.count.value.total : null;
      }
      if (failures.length === resolved.length) throw new Error('SESSION_REQUIRED: No workflow records could be read. Check your Busabase session and permissions.');
      return { records, pageInfo, totalCount, failures, refreshedAt: new Date().toISOString(), asOf: new Date().toISOString().slice(0, 10) };
    },
    // Exact server-side count for an Overview figure. `valueFilters` are the
    // exact comparison form, so this stays one SQL COUNT. Null (never 0) when
    // the read is denied or fails, so the band shows "—" instead of a guess.
    async count(key, valueFilters = []) {
      try {
        const base = (await resources()).find((item) => item.key === key);
        if (!base) return null;
        const result = await client.records.count({ baseId: base.baseId, ...(valueFilters.length ? { valueFilters } : {}) });
        return typeof result?.total === 'number' ? result.total : null;
      } catch {
        return null;
      }
    },
    // A record named by the URL (?peek= or /<id>) that is not in the loaded
    // page: one records.get, accepted only if it belongs to this Base.
    async getRecord(key, recordId) {
      const base = (await resources()).find((item) => item.key === key);
      if (!base) return null;
      const row = await client.records.get({ recordId });
      const rowBase = row?.baseId || row?.base?.id;
      if (!row || (rowBase && rowBase !== base.baseId)) return null;
      return normalizeRecord(row, base.key);
    },
    async loadMore(key, cursor) {
      const base = (await resources()).find((item) => item.key === key);
      if (!base) throw new Error('PROCEDURE_DENIED: Unconfigured resource.');
      return page(base, cursor);
    },
  };
}
export const busabaseProvider = createLiveProvider();
