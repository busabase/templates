import {
  inspectProvisionedResources,
  provisionDeclaredResources,
  createAirAppRecords,
  isAirAppWriteQueued,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.4.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
// Transport pagination belongs to the provider, never to a Base declaration.
// One page per Base per user action: cold load reads page 1 of each Base, and
// every further page is a visible "加载更多" click. Totals come from
// records.count, never from draining the cursor. The API caps a page at 100.
const BUSABASE_RECORD_PAGE_SIZE = 100;

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => ({
    ...record,
    baseKey,
    fields: normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
  }));

// Companies are ranked by match score, so the first page is the best page.
// The desk re-ranks the loaded rows by evidence × score in the browser.
const SORT_BY_BASE = { companies: { fieldSlug: "match-score", fieldType: "number", direction: "desc" } };

const readPage = async (client, base, cursor) => {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const page = await createAirAppRecords(client).readPage({
    baseId: base.baseId,
    limit: BUSABASE_RECORD_PAGE_SIZE,
    sort: SORT_BY_BASE[base.key],
    cursor,
  });
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
    limit: BUSABASE_RECORD_PAGE_SIZE,
  };
};

// An exact server-side count, or null when the procedure is not granted or
// the server cannot answer — the UI then falls back to "loaded N+" rather
// than inventing a total.
const countRecords = async (client, base, filters) => {
  if (!allowedReads.has("records.count")) return null;
  try {
    const result = await client.records.count({ baseId: base.baseId, ...(filters ? { filters } : {}) });
    return Number.isFinite(result?.total) ? result.total : null;
  } catch {
    return null;
  }
};

const statusIs = (value) => [{ fieldSlug: "status", fieldType: "text", operator: "equals", value }];

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

const requireBase = (key) => {
  const base = runtimeBases.get(key);
  if (!base) throw new Error(`SCHEMA_INCOMPLETE: ${key}`);
  return base;
};

const writeOutcome = (result) => {
  const pending = isAirAppWriteQueued(result);
  return { merged: !pending, pending, change_request_id: pending ? result?.id || "" : "" };
};

export const busabaseProvider = {
  name: "busabase",
  async getReadinessState() {
    runtimeClient = createRuntimeClient();
    if (!allowedReads.has("nodes.list")) throw new Error("PROCEDURE_DENIED: nodes.list");
    if (!allowedReads.has("nodes.get")) throw new Error("PROCEDURE_DENIED: nodes.get");
    let resources = await inspectProvisionedResources(runtimeClient, appConfig);
    if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
      if (!allowedReads.has("bases.get")) throw new Error("PROCEDURE_DENIED: bases.get");
      if (!allowedSetup.has("nodes.updateMetadata")) throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
      resources = await provisionDeclaredResources(runtimeClient, appConfig);
    }
    if (!resources.folder || resources.missing.length) {
      if (pendingSetupError) throw new Error(pendingSetupError);
      const names = resources.missing.map((base) => base.name).join("、");
      throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
    }
    pendingSetupError = "";
    runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
    const profilePage = await readPage(runtimeClient, requireBase("profile"));
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
      },
      records: profilePage.records,
      pageInfo: {
        profile: { nextCursor: profilePage.nextCursor, limit: profilePage.limit },
      },
    };
  },
  async getState() {
    if (!runtimeClient || !runtimeBases.size) await this.getReadinessState();
    const pages = await Promise.all(
      [...runtimeBases.values()].map(async (base) => [base.key, await readPage(runtimeClient, base)]),
    );
    const companies = requireBase("companies");
    // Three exact counts, in parallel with nothing after them: everything the
    // nav shows is total − queued − sent arithmetic on these.
    const [total, queued, sent] = await Promise.all([
      countRecords(runtimeClient, companies),
      countRecords(runtimeClient, companies, statusIs("queued")),
      countRecords(runtimeClient, companies, statusIs("sent")),
    ]);
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
      },
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { nextCursor: page.nextCursor, limit: page.limit }]),
      ),
      totals: total === null || queued === null || sent === null ? null : { all: total, queued, sent },
    };
  },
  // One more page of one Base, on an explicit click.
  async loadMore(baseKey, cursor) {
    const base = runtimeBases.get(baseKey);
    if (!runtimeClient || !base || !cursor) throw new Error(`SCHEMA_INCOMPLETE: ${baseKey}`);
    return readPage(runtimeClient, base, cursor);
  },
  // The record a URL names, when it is not on a loaded page: one records.get.
  async getCompany(recordId) {
    if (!allowedReads.has("records.get")) return null;
    const client = runtimeClient || createRuntimeClient();
    try {
      const record = await client.records.get({ recordId });
      return normalizeRecords([record], "companies")[0] || null;
    } catch {
      return null;
    }
  },
  // The contact addresses of the one company on screen, when the leads page
  // that holds them has not been loaded. One request for one opened record;
  // `filters` is a superset, so the caller still narrows by company key.
  async leadsForCompany(companyKey) {
    if (!allowedReads.has("records.list") || !companyKey) return [];
    const base = runtimeBases.get("leads");
    if (!runtimeClient || !base) return [];
    const page = await runtimeClient.records.list({
      baseId: base.baseId,
      limit: BUSABASE_RECORD_PAGE_SIZE,
      filters: [{ fieldSlug: "company-key", fieldType: "text", operator: "equals", value: companyKey }],
    });
    return normalizeRecords(page.records, "leads").filter((record) => record.fields.company_key === companyKey);
  },
  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest");
    }
    if (!allowedSetup.has("nodes.updateMetadata")) throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) pendingSetupError = String(error.message);
      throw error;
    }
  },
  async saveProfile({ recordId, fields, message }) {
    const client = runtimeClient || createRuntimeClient();
    if (recordId) {
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      const result = await client.records.changeRequest({
        recordId,
        operation: "update",
        fields,
        message,
        author: appConfig.appId,
      });
      return writeOutcome(result);
    }
    if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
    const result = await client.bases.createChangeRequest({
      baseId: requireBase("profile").baseId,
      fields,
      message,
      submittedBy: appConfig.appId,
    });
    return writeOutcome(result);
  },
  async updateCompany({ recordId, fields, message }) {
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    if (!recordId) throw new Error("SCHEMA_INCOMPLETE: companies");
    const client = runtimeClient || createRuntimeClient();
    const result = await client.records.changeRequest({
      recordId,
      operation: "update",
      fields,
      message,
      author: appConfig.appId,
    });
    return writeOutcome(result);
  },
};
