import { createRuntimeClient, resolveRuntimeResources } from "../busabase-client.js";
import { appConfig } from "../config.js";

const allowedReads = new Set(appConfig.permissions.read_procedures);
const allowedWrites = new Set(appConfig.permissions.change_request_procedures);
const PENDING_CHANGE_REQUEST_LIMIT = 20;
const PENDING_STATUSES = ["in_review", "changes_requested", "approved", "conflict"];

const requireRead = (procedure) => {
  if (!allowedReads.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

const requireWrite = (procedure) => {
  if (!allowedWrites.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => {
    const payload = record.headCommit?.payload;
    const fields = record.fields || payload?.fields || payload || {};
    return { ...record, baseKey, fields };
  });

const readPage = async (client, base, options = {}) => {
  requireRead("records.listPaged");
  // The blueprint capability is records.listPaged; SDK 0.19 names the same
  // cursor-paged operation records.list.
  const page = await client.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.filters?.length ? { filters: options.filters } : {}),
  });
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
    limit: base.readLimit,
  };
};

const searchPage = async (client, base, query) => {
  requireRead("records.search");
  const records = await client.records.search({
    baseId: base.baseId,
    fieldSlug: base.fields[0].slug,
    valueText: query,
    limit: base.readLimit,
  });
  return {
    records: normalizeRecords(records, base.key),
    nextCursor: null,
    limit: base.readLimit,
  };
};

const readChangeRequests = async (client) => {
  if (!allowedReads.has("changeRequests.listPaged")) {
    return { changeRequests: [], nextCursor: null };
  }
  // The AirApp capability is named changeRequests.listPaged in the blueprint;
  // SDK 0.19 exposes the same cursor-paged contract as changeRequests.list.
  const page = await client.changeRequests.list({
    limit: PENDING_CHANGE_REQUEST_LIMIT,
    status: PENDING_STATUSES,
  });
  const relevantIds = new Set([
    appConfig.schema.folder.nodeId,
    ...appConfig.schema.bases.flatMap((base) => [base.baseId, base.nodeId]),
  ]);
  return {
    changeRequests: (page.changeRequests || []).filter(
      (request) => relevantIds.has(request.baseId) || relevantIds.has(request.nodeId),
    ),
    nextCursor: page.nextCursor || null,
  };
};

let runtimeClient;
let runtimeBases = new Map();

export const busabaseProvider = {
  name: "busabase",
  async getState() {
    const client = createRuntimeClient();
    const bases = await resolveRuntimeResources(client);
    runtimeClient = client;
    runtimeBases = new Map(bases.map((base) => [base.key, base]));
    const [pages, changeRequestPage] = await Promise.all([
      Promise.all(bases.map(async (base) => [base.key, await readPage(client, base)])),
      readChangeRequests(client),
    ]);
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        deployment: appConfig.deployment,
        readOnly: false,
      },
      bases,
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { nextCursor: page.nextCursor, limit: page.limit }]),
      ),
      changeRequests: changeRequestPage.changeRequests,
      changeRequestPageInfo: {
        nextCursor: changeRequestPage.nextCursor,
        limit: PENDING_CHANGE_REQUEST_LIMIT,
      },
    };
  },
  async queryBase(baseKey, options = {}) {
    const base = runtimeBases.get(baseKey);
    if (!runtimeClient || !base) throw new Error(`SCHEMA_INCOMPLETE: ${baseKey}`);
    const page = options.query
      ? await searchPage(runtimeClient, base, options.query)
      : await readPage(runtimeClient, base, {
          filters: options.filter ? [
            { fieldSlug: options.filter.fieldSlug, operator: "equals", value: options.filter.value },
          ] : [],
        });
    if (!options.query || !options.filter) return page;
    return {
      ...page,
      records: page.records.filter(
        (record) => String(record.fields?.[options.filter.fieldSlug] || "") === options.filter.value,
      ),
    };
  },
  async loadMore(baseKey, cursor) {
    const base = runtimeBases.get(baseKey);
    if (!runtimeClient || !base || !cursor) throw new Error(`SCHEMA_INCOMPLETE: ${baseKey}`);
    return readPage(runtimeClient, base, { cursor });
  },
  async createActivity(fields) {
    requireWrite("bases.createChangeRequest");
    const base = runtimeBases.get("activities");
    if (!runtimeClient || !base) throw new Error("SCHEMA_INCOMPLETE: activities");
    const subject = String(fields["activity-subject"] || "Activity");
    const type = String(fields["activity-type"] || "activity");
    return runtimeClient.bases.createChangeRequest({
      baseId: base.baseId,
      fields,
      message: `Log ${type}: ${subject}`,
      submittedBy: "airapp",
      idempotencyKey: crypto.randomUUID(),
      autoMerge: false,
    });
  },
  async createDeal(fields) {
    requireWrite("bases.createChangeRequest");
    const base = runtimeBases.get("deals");
    if (!runtimeClient || !base) throw new Error("SCHEMA_INCOMPLETE: deals");
    const name = String(fields["deal-name"] || "Deal");
    return runtimeClient.bases.createChangeRequest({
      baseId: base.baseId,
      fields,
      message: `Add deal: ${name}`,
      submittedBy: "airapp",
      idempotencyKey: crypto.randomUUID(),
      autoMerge: false,
    });
  },
  async updateDealStage({ recordId, baseCommitId, stage }) {
    requireWrite("records.changeRequest");
    if (!runtimeClient || !recordId) throw new Error("SCHEMA_INCOMPLETE: deal record");
    return runtimeClient.records.changeRequest({
      recordId,
      operation: "update",
      fields: { stage },
      message: `Move deal to ${stage}`,
      author: "airapp",
      ...(baseCommitId ? { baseCommitId } : {}),
      autoMerge: false,
    });
  },
  async refreshPending() {
    if (!runtimeClient) throw new Error("SESSION_REQUIRED: runtime client is unavailable");
    return readChangeRequests(runtimeClient);
  },
};
