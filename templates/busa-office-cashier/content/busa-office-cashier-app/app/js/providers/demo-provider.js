import { samples } from "../samples.js";
import { appConfig } from "../config.js";
const id = (base, key) =>
  "rec" + base.replaceAll("-", "") + key.replaceAll("-", "") + "0000000000";
const ids = new Map(
  Object.entries(samples).flatMap(([base, rs]) =>
    rs.map((r) => [r.key, id(base, r.key)]),
  ),
);
export const demoProvider = {
  async getState() {
    const records = Object.entries(samples).flatMap(([baseKey, rs]) =>
      rs.map((r) => ({
        id: ids.get(r.key),
        baseKey,
        fields: Object.fromEntries(
          Object.entries(r.fields).map(([k, v]) => [
            k,
            appConfig.bases
              .find((b) => b.key === baseKey)
              .fields.find((f) => f.slug === k)?.type === "relation"
              ? v
                ? ids.get(v)
                : ""
              : v,
          ]),
        ),
      })),
    );
    return {
      records,
      pageInfo: Object.fromEntries(
        appConfig.bases.map((b) => [b.key, { nextCursor: null }]),
      ),
      totalCount: Object.fromEntries(
        Object.entries(samples).map(([k, v]) => [k, v.length]),
      ),
      provider: "demo",
      reviewTime: Date.parse("2026-09-29T10:00:00+08:00"),
    };
  },
  async loadMore() {
    throw Error("Demo has no more pages");
  },
};
