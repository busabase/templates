import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const requireProcedure = (procedures, procedure) => {
  if (!procedures.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => ({
    ...record,
    baseKey,
    headCommitId: record.headCommitId || record.headCommit?.id,
    fields: record.headCommit?.payload || record.headCommit?.fields || record.fields || {},
  }));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  requireProcedure(allowedReads, "nodes.list");
  requireProcedure(allowedReads, "nodes.get");
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    requireProcedure(allowedReads, "bases.get");
    requireProcedure(allowedSetup, "nodes.updateMetadata");
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const missing = resources.missing.map((base) => base.name).join("、");
    throw new Error(`SETUP_REQUIRED: ${missing || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

const resolvedBase = (key) => {
  const runtime = runtimeBases.get(key);
  const declared = appConfig.bases.find((base) => base.key === key);
  if (!runtime || !declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return { ...declared, ...runtime };
};

const readPage = async (base, cursor) => {
  requireProcedure(allowedReads, "records.list");
  const page = await runtimeClient.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(page) ? page : page.records || [];
  return {
    records: normalizeRecords(records, base.key),
    nextCursor: Array.isArray(page) ? null : page.nextCursor || null,
    limit: base.readLimit,
  };
};

export const busabaseProvider = {
  name: "busabase",

  async getState() {
    const resources = await ensureResources();
    const bases = appConfig.bases.map((base) => resolvedBase(base.key));
    const pages = await Promise.all(bases.map(async (base) => [base.key, await readPage(base)]));
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        deployment: appConfig.deployment,
        readOnly: false,
      },
      resources: { folder: resources.folder, airApp: resources.airApp },
      bases,
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { nextCursor: page.nextCursor, limit: page.limit }]),
      ),
      changeRequests: [],
      changeRequestPageInfo: { nextCursor: null, limit: 0 },
    };
  },

  async loadMore(baseKey, cursor) {
    if (!runtimeClient || !cursor) throw new Error(`SETUP_REQUIRED: ${baseKey}`);
    return readPage(resolvedBase(baseKey), cursor);
  },

  async readRecord(recordId) {
    requireProcedure(allowedReads, "records.get");
    const record = await runtimeClient.records.get({ recordId });
    return normalizeRecords([record], "")[0];
  },

  async findRecord({ baseKey, fieldSlug, valueText }) {
    requireProcedure(allowedReads, "records.getByField");
    const base = resolvedBase(baseKey);
    const record = await runtimeClient.records.getByField({ baseId: base.baseId, fieldSlug, valueText });
    return record ? normalizeRecords([record], baseKey)[0] : null;
  },

  async updateRecord({ baseKey, recordId, headCommitId, fields, message }) {
    requireProcedure(allowedWrites, "records.changeRequest");
    if (!recordId || !baseKey || !runtimeBases.has(baseKey)) throw new Error("RECORD_TARGET_REQUIRED");
    return runtimeClient.records.changeRequest({
      recordId,
      operation: "update",
      fields,
      message,
      author: appConfig.appId,
      ...(headCommitId ? { baseCommitId: headCommitId } : {}),
      autoMerge: true,
    });
  },

  async createRecord({ baseKey, fields, message, idempotencyKey }) {
    requireProcedure(allowedWrites, "bases.createChangeRequest");
    const base = resolvedBase(baseKey);
    return runtimeClient.bases.createChangeRequest({
      baseId: base.baseId,
      fields,
      message,
      submittedBy: appConfig.appId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      autoMerge: true,
    });
  },

  async provisionResources() {
    requireProcedure(allowedSetup, "nodes.createChangeRequest");
    requireProcedure(allowedSetup, "nodes.updateMetadata");
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) pendingSetupError = String(error.message);
      throw error;
    }
  },
};
