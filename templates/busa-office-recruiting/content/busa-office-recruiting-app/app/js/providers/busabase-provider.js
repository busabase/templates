import { inspectProvisionedResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";
import { resolveOwnedConfig } from "../resource-binding.js";
/** @type {import('busabase-sdk').BusabaseClient} */
let client;
/** @type {Map<string, import('busabase-sdk/airapp').AirAppProvisionedBase>} */
let bases = new Map();
const allowed = new Set(appConfig.permissions.readProcedures);
function requireRead(p) {
  if (!allowed.has(p)) throw new Error("PROCEDURE_DENIED: " + p);
}
export function normalizeRecords(rows, key) {
  return (rows || []).map((r) => ({
    ...r,
    baseKey: key,
    fields: r.headCommit?.payload || r.headCommit?.fields || r.fields || {},
  }));
}
async function readPage(base, cursor) {
  requireRead("records.list");
  const page = await client.records.list({
    baseId: base.baseId,
    limit: Number(base.readLimit),
    ...(cursor ? { cursor } : {}),
    sort: { fieldSlug: "due", fieldType: "date", direction: "asc" },
  });
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
  };
}
async function count(base) {
  requireRead("records.count");
  try {
    return (await client.records.count({ baseId: base.baseId })).total;
  } catch {
    return null;
  }
}
export const busabaseProvider = {
  name: "busabase_sdk_openapi",
  async getState() {
    client = createRuntimeClient();
    requireRead("nodes.list");
    requireRead("nodes.get");
    const ownedConfig = await resolveOwnedConfig(client, appConfig);
    const resources = await inspectProvisionedResources(client, ownedConfig);
    if (!resources.folder || resources.missing.length)
      throw new Error(
        "SCHEMA_INCOMPLETE: install this template and verify its folder resources.",
      );
    bases = new Map(resources.bases.map((b) => [b.key, b]));
    const results = await Promise.all(
      resources.bases.map(async (b) => {
        const [page, total] = await Promise.allSettled([readPage(b), count(b)]);
        return {
          key: b.key,
          page: page.status === "fulfilled" ? page.value : null,
          error: page.status === "rejected" ? b.name : null,
          total: total.status === "fulfilled" ? total.value : null,
        };
      }),
    );
    if (results.every((r) => !r.page))
      throw new Error(
        "No declared ledger could be read. Check permissions and retry.",
      );
    return {
      records: results.flatMap((r) => r.page?.records || []),
      pageInfo: Object.fromEntries(
        results.map((r) => [r.key, { nextCursor: r.page?.nextCursor || null }]),
      ),
      totalCount: Object.fromEntries(results.map((r) => [r.key, r.total])),
      errors: results.filter((r) => r.error).map((r) => r.error),
      loadedAt: new Date().toISOString(),
    };
  },
  async loadMore(key, cursor) {
    const base = bases.get(key);
    if (!base || !cursor)
      throw new Error("Unknown declared resource or cursor");
    return readPage(base, cursor);
  },
};
