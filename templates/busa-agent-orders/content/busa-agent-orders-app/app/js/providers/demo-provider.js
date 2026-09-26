// Deterministic demo provider (?demo=1). Serves the template's own sample rows
// (generated into ./demo-data.js from content/*/records.ndjson) through the
// same contract as the Busabase provider: bounded pages with a cursor, raw
// API-shaped rows run through the same normalizers. Nothing leaves the tab;
// a decision only changes this in-memory copy until the page reloads.
import { appConfig } from "../config.js?v=0.1.0";
import { NORMALIZERS, decisionFields } from "../orders-model.js?v=0.1.0";
import { demoRows } from "./demo-data.js?v=0.1.0";

const BROWSED_KEYS = ["orders", "guardrails", "proposals", "exceptions"];
const limitFor = (key) => appConfig.bases.find((base) => base.key === key)?.readLimit || 50;
const rows = structuredClone(demoRows);

const page = (key, cursor) => {
  const offset = cursor ? Number(String(cursor).replace("demo:", "")) || 0 : 0;
  const limit = limitFor(key);
  const slice = rows[key].slice(offset, offset + limit);
  const next = offset + limit < rows[key].length ? `demo:${offset + limit}` : null;
  return { rows: slice.map(NORMALIZERS[key]), nextCursor: next };
};

export const demoProvider = {
  kind: "demo",

  async getState() {
    const pages = Object.fromEntries(BROWSED_KEYS.map((key) => [key, page(key)]));
    return {
      demo: true,
      data_provider: "demo",
      rows: Object.fromEntries(BROWSED_KEYS.map((key) => [key, pages[key].rows])),
      cursors: Object.fromEntries(BROWSED_KEYS.map((key) => [key, pages[key].nextCursor])),
      totals: Object.fromEntries(BROWSED_KEYS.map((key) => [key, rows[key].length])),
      settings: NORMALIZERS.settings(rows.settings[0]),
      loaded_at: new Date().toISOString(),
    };
  },

  async fetchPage(key, cursor) {
    return page(key, cursor);
  },

  // key is "proposals" or "exceptions"; the model decides which fields change.
  async decide(key, row, action, note) {
    const change = decisionFields(key, row, action, note);
    const target = rows[key]?.find((raw) => raw.__recordId === row.id);
    if (!target) throw new Error("This record is not loaded");
    Object.assign(target, change);
    return { outcome: "demo", changeRequestId: "" };
  },

  async provisionResources() {
    throw new Error("Demo mode does not create resources.");
  },
};
