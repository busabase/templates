import { appConfig } from "../config.js";

export const demoProvider = {
  name: "demo",
  async getState() {
    return {
      provider: { ok: true, name: "demo", mode: "deterministic_local_demo", readOnly: true },
      bases: appConfig.bases.map((base) => ({
        id: `demo-base-${base.key}`,
        slug: base.slug,
        name: base.name,
        fields: base.fields,
      })),
      records: appConfig.bases.flatMap((base) =>
        (base.sampleRecords || []).map((record) => ({
          id: record.key,
          headCommitId: `demo-head-${record.key}`,
          baseKey: base.key,
          fields: structuredClone(record.fields),
        })),
      ),
      pageInfo: Object.fromEntries(
        appConfig.bases.map((base) => [base.key, { nextCursor: null, limit: base.readLimit }]),
      ),
      changeRequests: [],
      changeRequestPageInfo: { nextCursor: null, limit: 0 },
    };
  },
  async updateRecord({ recordId }) {
    return { id: `demo-change-${recordId}`, materialized: false, demo: true };
  },
  async readRecord() {
    return null;
  },
  async findRecord() {
    return null;
  },
  async createRecord({ baseKey, fields }) {
    return { id: `demo-${baseKey}-${Date.now()}`, materialized: false, demo: true, fields };
  },
  async provisionResources() {
    return { demo: true };
  },
};
