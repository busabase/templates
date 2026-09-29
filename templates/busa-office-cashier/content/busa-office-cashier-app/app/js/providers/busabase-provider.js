import { resolveOwnedConfig } from "../binding.js";
import { inspectProvisionedResources } from "../../vendor/busabase-airapp.js";
import { appConfig } from "../config.js";
import { createRuntimeClient } from "../busabase-client.js";
import { normalize, readIndependentRegisters } from "../model.js";
const allowed = new Set(appConfig.permissions.readProcedures);
/** @type {import('busabase-sdk').BusabaseClient} */
let client;
let bases;
const requireProcedure = (p) => {
  if (!allowed.has(p)) throw Error("PROCEDURE_DENIED: " + p);
};
async function page(base, cursor) {
  requireProcedure("records.list");
  const data = await client.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  return {
    records: (data.records || []).map((r) => {
      const row = normalize(r, base.key);
      if (!row.fields.title || typeof row.fields.title !== "string")
        throw Error("SCHEMA_INCOMPLETE: record title missing");
      return row;
    }),
    nextCursor: data.nextCursor || null,
  };
}
async function count(base) {
  requireProcedure("records.count");
  try {
    return (await client.records.count({ baseId: base.baseId })).total;
  } catch {
    return null;
  }
}
export const busabaseProvider = {
  async getState() {
    client = createRuntimeClient();
    requireProcedure("nodes.list");
    requireProcedure("nodes.get");
    const resources = await inspectProvisionedResources(
      client,
      await resolveOwnedConfig(client, appConfig),
    );
    if (!resources.folder || resources.missing.length)
      throw Error(
        "SCHEMA_INCOMPLETE: " + resources.missing.map((b) => b.key).join(", "),
      );
    bases = new Map(resources.bases.map((b) => [b.key, b]));
    const { loaded, failures } = await readIndependentRegisters(
      appConfig.bases,
      async (declaration) => {
        const base = { ...declaration, ...bases.get(declaration.key) };
        const [p, total] = await Promise.all([page(base), count(base)]);
        return { key: declaration.key, ...p, total };
      },
    );
    return {
      failures,
      records: loaded.flatMap((p) => p.records),
      pageInfo: Object.fromEntries(
        loaded.map((p) => [p.key, { nextCursor: p.nextCursor }]),
      ),
      totalCount: Object.fromEntries(loaded.map((p) => [p.key, p.total])),
      provider: "busabase_sdk_openapi",
      reviewTime: Date.now(),
    };
  },
  async loadMore(key, cursor) {
    const base = bases?.get(key),
      declared = appConfig.bases.find((b) => b.key === key);
    if (!base || !cursor) throw Error("SCHEMA_INCOMPLETE");
    return page({ ...declared, ...base }, cursor);
  },
};
