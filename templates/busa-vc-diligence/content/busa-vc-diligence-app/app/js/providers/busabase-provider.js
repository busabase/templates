import {
  airAppRecordFields,
  createAirAppRecords,
  inspectProvisionedResources,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";

// Read-only by construction: this provider requests only the read procedures
// in appConfig.permissions, resolves the package-installed resources with
// the SDK's inspect helper, and exposes no write or provisioning path.
// Approvals happen in agent chat; changes reach the desk through Change
// Requests the agent proposes there — never from this console.

const allowedReads = new Set(appConfig.permissions.readProcedures);
const requireRead = (procedure) => {
  if (!allowedReads.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

let runtimeClient;
let runtimeRecords;
let runtimeBases = new Map();

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  requireRead("nodes.list");
  requireRead("nodes.get");
  const resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (!resources.folder || resources.missing.length) {
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

const runtimeBase = (key) => {
  const resolved = runtimeBases.get(key);
  if (!resolved) throw new Error(`SETUP_REQUIRED: ${key}`);
  return resolved;
};

const recordsApi = () => {
  runtimeRecords = runtimeRecords || createAirAppRecords(runtimeClient, { appId: appConfig.appId });
  return runtimeRecords;
};

// One page per call, cursor returned to the caller — never several pages in
// one function call. The console surfaces `nextCursor` as an honest
// "first page" note instead of hiding a scan behind one loading state.
async function readPage(key, cursor) {
  requireRead("records.list");
  const base = runtimeBase(key);
  const page = await recordsApi().readPage({
    baseId: base.baseId,
    limit: base.readLimit,
    cursor,
  });
  return {
    records: page.records.map((record) => ({ ...record, baseKey: key })),
    nextCursor: page.nextCursor,
    limit: base.readLimit,
  };
}

// A real, exact total for a Base — never `records.length` of what has been
// loaded so far. Null on denial/failure so the UI can say so.
async function countRecords(key) {
  if (!allowedReads.has("records.count")) return null;
  try {
    const { total } = await runtimeClient.records.count({ baseId: runtimeBase(key).baseId });
    return total;
  } catch {
    return null;
  }
}

export const busabaseProvider = {
  name: "busabase",
  async getState() {
    await ensureResources();
    const bases = appConfig.bases;
    const [pages, counts] = await Promise.all([
      Promise.all(bases.map(async (baseConfig) => [baseConfig.key, await readPage(baseConfig.key)])),
      Promise.all(bases.map(async (baseConfig) => [baseConfig.key, await countRecords(baseConfig.key)])),
    ]);
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        deployment: appConfig.deployment,
        readOnly: true,
      },
      bases,
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { nextCursor: page.nextCursor, limit: page.limit }]),
      ),
      totalCount: Object.fromEntries(counts),
      changeRequests: [],
      changeRequestPageInfo: { nextCursor: null, limit: 20 },
    };
  },
  async loadMore(key, cursor) {
    if (!cursor) throw new Error("NO_CURSOR");
    return readPage(key, cursor);
  },
  async getRecord(key, recordId) {
    requireRead("records.get");
    const resolved = runtimeBase(key);
    const record = await runtimeClient.records.get({ recordId });
    if (record.baseId !== resolved.baseId) throw new Error("RECORD_NOT_FOUND");
    return { ...record, fields: airAppRecordFields(record), baseKey: key };
  },
};
