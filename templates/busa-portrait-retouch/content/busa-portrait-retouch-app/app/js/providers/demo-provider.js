import { STATUSES, demoSnapshot } from "../retouch-model.js?v=0.1.0";

// The demo holds every row, so its per-status totals are exact.
const demoCounts = (snapshot) => ({
  ...snapshot,
  counts: Object.fromEntries(STATUSES.map((status) => [status, snapshot.metrics[status] || 0])),
  next_cursor: null,
});

export const demoProvider = {
  kind: "demo",
  async getState() {
    return {
      app: "busa-portrait-retouch",
      demo: true,
      data_provider: "demo",
      readiness: {
        runtime: "ready",
        onboarding: "complete",
        action: "none",
        change_request_id: null,
        safe_context: { mode: "read-only-demo" },
      },
      snapshot: demoCounts(demoSnapshot()),
    };
  },
  async loadMoreCandidates() {
    return { candidates: [], next_cursor: null };
  },
  async getCandidate(candidate_id) {
    return demoSnapshot().candidates.find((item) => item.candidate_id === candidate_id) || null;
  },
  async submitDecision() {
    throw new Error("Demo mode is read-only.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
  async saveOnboarding() {
    throw new Error("Demo mode is read-only.");
  },
};
