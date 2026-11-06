import { appConfig } from "../config.js";

// Standalone preview (`?demo=1`): the template package's own seed records,
// held in appConfig.demoRecords and never written anywhere. Relative-date
// placeholders are resolved against the viewer's clock so the cockpit
// always shows a plausible "today" — a hard-coded demo due date would read
// as stale the week after it was written.

const resolveDates = (value) => {
  if (typeof value !== "string") return value;
  const dateOnly = (offsetDays) => {
    const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return value
    .replaceAll("__3_DAYS_AGO__", dateOnly(-3))
    .replaceAll("__2_DAYS_AGO__", dateOnly(-2))
    .replaceAll("__IN_6_DAYS__", dateOnly(6));
};

const resolveRecord = (record) => ({
  id: record.id,
  baseKey: record.baseKey,
  fields: Object.fromEntries(
    Object.entries(record.fields).map(([slug, value]) => [slug, resolveDates(value)]),
  ),
});

export const demoProvider = {
  name: "demo",
  async getState() {
    const records = appConfig.demoRecords.map(resolveRecord);
    return {
      provider: { ok: true, name: "demo", mode: "deterministic_local_demo", readOnly: true },
      bases: appConfig.bases,
      records,
      pageInfo: Object.fromEntries(
        appConfig.bases.map((base) => [base.key, { nextCursor: null, limit: base.readLimit }]),
      ),
      // The fixture is the package's seed set, fully in memory, so its own
      // count is exact by construction — no records.count call needed.
      totalCount: Object.fromEntries(
        appConfig.bases.map((base) => [
          base.key,
          records.filter((record) => record.baseKey === base.key).length,
        ]),
      ),
      changeRequests: [],
      changeRequestPageInfo: { nextCursor: null, limit: 20 },
    };
  },
  async loadMore() {
    return { records: [], nextCursor: null, limit: 50 };
  },
  async getRecord(baseKey, recordId) {
    const record = appConfig.demoRecords
      .map(resolveRecord)
      .find((item) => item.baseKey === baseKey && item.id === recordId);
    if (!record) throw new Error("RECORD_NOT_FOUND");
    return record;
  },
};
