import { appConfig } from "../config.js";
import { demoNow, demoRecords } from "../demo-data.js";

const DEMO_ACTOR = {
  id: "demo-user-kelvin",
  name: "Kelvin",
  email: "kelvin@example.com",
  image: null,
  role: "owner",
};

let pendingRequests = [];
let requestSequence = 1;

const copyRecord = (record) => ({
  ...record,
  fields: { ...record.fields },
  createdAt: "2026-08-18T09:30:00.000Z",
  updatedAt: "2026-08-22T15:10:00.000Z",
  createdBy: DEMO_ACTOR.id,
  createdByUser: DEMO_ACTOR,
});

const baseByKey = (baseKey) => appConfig.schema.bases.find((base) => base.key === baseKey);

const demoOverviewCounts = (records = demoRecords) => {
  const companies = records.filter((record) => record.baseKey === "companies");
  const deals = records.filter((record) => record.baseKey === "deals");
  const stages = baseByKey("deals")?.fields.find((field) => field.slug === "stage")?.options?.choices || [];
  return {
    exact: true,
    customerAccounts: companies.filter((record) => record.fields?.["relationship-type"] === "customer").length,
    prospects: companies.filter((record) => record.fields?.["relationship-type"] === "prospect").length,
    dealStages: Object.fromEntries(stages.map((stage) => [
      stage.id,
      deals.filter((record) => record.fields?.stage === stage.id).length,
    ])),
  };
};

const filterRecords = ({ baseKey, query = "", filter = null }) => {
  const base = baseByKey(baseKey);
  const primarySlug = base?.fields?.[0]?.slug;
  const normalizedQuery = query.trim().toLowerCase();
  return demoRecords
    .filter((record) => record.baseKey === baseKey)
    .filter((record) => {
      if (!normalizedQuery) return true;
      return String(record.fields?.[primarySlug] || "").toLowerCase().includes(normalizedQuery);
    })
    .filter((record) => !filter || String(record.fields?.[filter.fieldSlug] || "") === filter.value)
    .map(copyRecord);
};

export const demoProvider = {
  name: "demo",
  async getState() {
    const demoState = new URLSearchParams(window.location.search).get("state") || "ready";
    if (demoState === "error") throw new Error("DEMO_ERROR: the CRM data window could not be loaded.");
    if (demoState === "permission") throw new Error("PROCEDURE_DENIED: records.listPaged");
    const records = demoState === "empty" ? [] : demoRecords.map(copyRecord);
    const partial = demoState === "partial";
    return {
      provider: {
        ok: true,
        name: "demo",
        mode: "deterministic_local_demo",
        readOnly: false,
        stale: demoState === "stale",
        now: demoNow,
      },
      bases: appConfig.schema.bases,
      records,
      pageInfo: Object.fromEntries(
        appConfig.schema.bases.map((base) => [
          base.key,
          { nextCursor: partial ? `demo-next-${base.key}` : null, limit: base.readLimit },
        ]),
      ),
      changeRequests: [...pendingRequests],
      changeRequestPageInfo: { nextCursor: null, limit: 20 },
      overviewCounts: demoOverviewCounts(records),
    };
  },
  async queryBase(baseKey, options = {}) {
    return {
      records: filterRecords({ baseKey, ...options }),
      nextCursor: null,
      limit: baseByKey(baseKey)?.readLimit || 50,
    };
  },
  async loadMore(baseKey) {
    return { records: [], nextCursor: null, limit: baseByKey(baseKey)?.readLimit || 50 };
  },
  async createActivity(fields) {
    const id = `cr_demo_activity_${String(requestSequence).padStart(3, "0")}`;
    requestSequence += 1;
    const request = {
      id,
      baseId: baseByKey("activities")?.baseId,
      status: "in_review",
      createdAt: new Date("2026-08-25T12:00:00.000Z").toISOString(),
      submittedByUser: DEMO_ACTOR,
      fields,
    };
    pendingRequests = [request, ...pendingRequests];
    return request;
  },
  async createDeal(fields) {
    const id = `cr_demo_deal_${String(requestSequence).padStart(3, "0")}`;
    requestSequence += 1;
    const request = {
      id,
      baseId: baseByKey("deals")?.baseId,
      status: "in_review",
      createdAt: new Date("2026-08-26T12:00:00.000Z").toISOString(),
      submittedByUser: DEMO_ACTOR,
      fields,
    };
    pendingRequests = [request, ...pendingRequests];
    return request;
  },
  async updateDealStage({ recordId, stage }) {
    const id = `cr_demo_stage_${String(requestSequence).padStart(3, "0")}`;
    requestSequence += 1;
    const request = {
      id,
      baseId: baseByKey("deals")?.baseId,
      recordId,
      status: "in_review",
      createdAt: new Date("2026-08-26T12:00:00.000Z").toISOString(),
      submittedByUser: DEMO_ACTOR,
      fields: { stage },
    };
    pendingRequests = [request, ...pendingRequests];
    return request;
  },
  async refreshPending() {
    return { changeRequests: [...pendingRequests], nextCursor: null };
  },
};
