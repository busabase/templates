// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Busa App-in-Skills.
// The rows mirror the package's sample records (see demo-data.js).
import { buildSnapshot } from "../reporting-model.js?v=0.1.0";
import { DEMO_ROWS } from "../demo-data.js?v=0.1.0";

const BASE_KEYS = ["clients", "projects", "deliverables", "metrics", "milestones", "reports"];

export const demoProvider = {
  kind: "demo",
  async getState() {
    const snapshot = buildSnapshot(DEMO_ROWS);
    const totals = Object.fromEntries(BASE_KEYS.map((key) => [key, DEMO_ROWS[key].length]));
    return {
      app: "busa-client-reporting",
      demo: true,
      data_provider: "demo",
      lock: null,
      pagination: Object.fromEntries(BASE_KEYS.map((key) => [key, null])),
      totals,
      snapshot,
    };
  },
  async fetchPage() {
    return { rows: [], nextCursor: null };
  },
  async getRecord(key, recordId) {
    const rows = DEMO_ROWS[key] || [];
    return rows.find((row) => row.__recordId === recordId) || null;
  },
  async applyDecision() {
    throw new Error("Busa Client Reporting is read-only: the report desk never writes from the app.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
