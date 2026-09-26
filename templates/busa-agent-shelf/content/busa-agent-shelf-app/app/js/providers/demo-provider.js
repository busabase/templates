// Deterministic demo provider (?demo=1). Serves the template's own sample rows
// (generated into ./demo-data.js from content/*/records.ndjson) through the
// same contract as the Busabase provider: bounded pages with a cursor, raw
// API-shaped rows run through the same normalizers. Nothing leaves the tab;
// a decision only changes this in-memory copy until the page reloads.
import { appConfig } from "../config.js?v=0.1.0";
import { NORMALIZERS, decideFix } from "../shelf-model.js?v=0.1.0";
import { demoRows } from "./demo-data.js?v=0.1.0";

const BROWSED_KEYS = ["questions", "observations", "competitors", "fixes"];
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

  async decideFix(fix, action, note) {
    const change = decideFix(fix, action, note);
    const target = rows.fixes.find((row) => row.__recordId === fix.id);
    if (!target) throw new Error("This fix is not loaded");
    Object.assign(target, change);
    return { outcome: "demo", changeRequestId: "" };
  },

  async provisionResources() {
    throw new Error("Demo mode does not create resources.");
  },
};
