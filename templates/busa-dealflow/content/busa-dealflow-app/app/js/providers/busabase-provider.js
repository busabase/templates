import { inspectProvisionedResources, createAirAppRecords } from '../../vendor/busabase-airapp.js';
import { appConfig } from '../config.js';
import { createRuntimeClient } from '../busabase-client.js';
import { localToday, mergeById, normalizeRecord, resolveFilters } from '../model.js';
import { bindInstalledResources } from '../resource-binding.js';

/**
 * Reads the installed desk through the viewer's own session. Every source in
 * `appConfig.sources` is one bounded page with server-side filters and sort;
 * nothing here pages on its own. Failures are reported per source, never
 * replaced with demo rows. A restricted Base the viewer cannot see is simply
 * absent: its sources are skipped and its screens are not offered.
 */
export function createLiveProvider(client = null, inspect = inspectProvisionedResources, today = () => localToday()) {
  let bound;
  async function resources() {
    if (bound) return bound;
    client ||= createRuntimeClient();
    const binding = await bindInstalledResources(client, appConfig);
    const resolution = await inspect(client, binding);
    if (!resolution.folder || resolution.missing.length || resolution.conflicts?.length || resolution.repairs?.length) {
      throw new Error('SCHEMA_INCOMPLETE: Install this template whole, in its own folder, and check that its tables still belong to it.');
    }
    bound = { bases: resolution.bases, folderName: binding.folder.name };
    return bound;
  }
  const baseOf = (key) => bound.bases.find((base) => base.key === key);
  async function page(source, cursor) {
    const base = baseOf(source.base);
    const result = await createAirAppRecords(client).readPage({
      baseId: base.baseId,
      limit: Math.min(source.limit, base.readLimit),
      sort: source.sort,
      valueFilters: source.valueFilters ? resolveFilters(source.valueFilters, today()) : undefined,
      cursor,
    });
    return { records: (result.records || []).map((row) => normalizeRecord(row, base.key)), nextCursor: result.nextCursor || null };
  }
  return {
    name: 'Busabase',
    async getState() {
      const { bases, folderName } = await resources();
      const sources = appConfig.sources.filter((source) => baseOf(source.base));
      const [pages, counts, auth] = await Promise.all([
        Promise.allSettled(sources.map((source) => page(source))),
        Promise.allSettled(bases.map((base) => client.records.count({ baseId: base.baseId }))),
        // Only used to name the space in the connection prompt; optional.
        client.auth?.verify?.().catch(() => null) ?? null,
      ]);
      let records = [];
      const pageInfo = {}, failures = [];
      sources.forEach((source, index) => {
        const result = pages[index];
        if (result.status === 'fulfilled') { records = mergeById(records, result.value.records); pageInfo[source.key] = { nextCursor: result.value.nextCursor }; }
        else failures.push(source.key);
      });
      if (failures.length === sources.length) throw new Error('SESSION_REQUIRED: No table could be read. Check your Busabase session and permissions.');
      const totalCount = Object.fromEntries(bases.map((base, index) => [base.key, counts[index].status === 'fulfilled' ? counts[index].value.total : null]));
      return { records, pageInfo, totalCount, failures, visibleBases: bases.map((base) => base.key), folderName, space: auth?.space ? { id: auth.space.id, name: auth.space.name } : null, refreshedAt: new Date().toISOString(), asOf: today() };
    },
    async loadMore(sourceKey, cursor) {
      await resources();
      const source = appConfig.sources.find((item) => item.key === sourceKey);
      if (!source || !baseOf(source.base)) throw new Error('PROCEDURE_DENIED: Unconfigured source.');
      return page(source, cursor);
    },
  };
}
export const busabaseProvider = createLiveProvider();
