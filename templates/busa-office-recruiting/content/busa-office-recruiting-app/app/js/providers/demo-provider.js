import { appConfig } from "../config.js";
import { seedRecords } from "../demo-data.js";
export const demoProvider = {
  name: "demo",
  async getState() {
    const mode = new URLSearchParams(location.search).get("state");
    if (mode === "error" || mode === "permission")
      throw new Error(
        mode === "permission"
          ? "Permission denied. Verify access to the installed folder."
          : "Preview read failed.",
      );
    const records =
      mode === "empty"
        ? []
        : appConfig.bases.flatMap((b) =>
            (seedRecords[b.key] || []).map((r, i) => ({
              id: "recfictional" + b.key + i.toString().padStart(10, "0"),
              baseKey: b.key,
              fields: r.fields,
            })),
          );
    return {
      records,
      pageInfo: Object.fromEntries(
        appConfig.bases.map((b) => [
          b.key,
          { nextCursor: mode === "partial" ? "demo-next" : null },
        ]),
      ),
      totalCount: Object.fromEntries(
        appConfig.bases.map((b) => [
          b.key,
          mode === "partial"
            ? null
            : records.filter((r) => r.baseKey === b.key).length,
        ]),
      ),
      errors:
        mode === "partial" ? ["Preview demonstrates a partial result"] : [],
      loadedAt:
        mode === "stale" ? "2026-01-01T00:00:00Z" : new Date().toISOString(),
    };
  },
  async loadMore() {
    return { records: [], nextCursor: null };
  },
};
