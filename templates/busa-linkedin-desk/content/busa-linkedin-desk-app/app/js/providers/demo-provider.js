import { appConfig } from "../config.js";

// Standalone preview (`?demo=1`): the package's own fictional sample journey,
// held in appConfig.demoRecords and never written anywhere. Relative-date
// placeholders are resolved against the viewer's clock so the console always
// shows a plausible "today" — a hard-coded demo date would read as stale the
// week after it was written.

const resolveDates = (value) => {
  if (typeof value !== "string") return value;
  const now = Date.now();
  // Relative to the viewer's clock, never a fixed time of day: a fixture
  // stamped "today 09:12" is in the future for anyone who opens it earlier.
  const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();
  const dateOnly = (daysAgo) => {
    const d = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return value
    .replaceAll("__TODAY_0912__", hoursAgo(2))
    .replaceAll("__TODAY_0830__", hoursAgo(3))
    .replaceAll("__STALE__", hoursAgo(9 * 24))
    .replaceAll("__YESTERDAY__", dateOnly(1));
};

const resolveRecord = (record) => ({
  id: record.id,
  baseKey: record.baseKey,
  createdAt: record.baseKey === "replies" ? resolveDates("__TODAY_0912__") : undefined,
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
      // The fixture is small and fully in memory, so its own count is exact
      // by construction — no records.count call needed.
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
  async getRecord(baseKey, recordId) {
    const record = appConfig.demoRecords.map(resolveRecord).find(
      (item) => item.baseKey === baseKey && item.id === recordId,
    );
    if (!record) throw new Error("RECORD_NOT_FOUND");
    return record;
  },
};
