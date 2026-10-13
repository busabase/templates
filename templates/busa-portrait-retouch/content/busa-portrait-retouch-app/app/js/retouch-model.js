export const DECISIONS = new Set(["approve", "request_changes", "block"]);

const parseJson = (value, fallback) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value || fallback;
  } catch {
    return fallback;
  }
};

export function statusForDecision(action) {
  return { approve: "approved", request_changes: "changes_requested", block: "blocked" }[action] || "needs_review";
}

// The candidate statuses, in queue order. `needs_review` and
// `changes_requested` are both "waiting for a human"; the rest are verdicts.
export const STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

const number = (value, fallback) => {
  const parsed = Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(parsed) ? fallback : parsed;
};

// The CLI writes `{ texture, identity, tone }`; the packaged sample row (and
// older syncs) wrote `{ skin_texture, identity, skin_tone }`. Read both, so
// the review panel never shows an empty check.
export function normalizeChecks(value) {
  const checks = parseJson(value, {}) || {};
  return {
    texture: checks.texture ?? checks.skin_texture ?? "",
    identity: checks.identity ?? "",
    tone: checks.tone ?? checks.skin_tone ?? "",
  };
}

// How many of the three naturalness checks did not pass (an unset check is
// not counted as a failure — it was never run).
export function flaggedChecks(candidate = {}) {
  return Object.values(candidate.checks || {}).filter((value) => value && value !== "pass").length;
}

export function candidateFromRow(row = {}) {
  return {
    candidate_id: row.candidate_id || "",
    job_id: row.job_id || "",
    ref: number(row.ref, 0),
    title: row.title || "Untitled portrait",
    status: row.status || "needs_review",
    preset: row.preset || "natural",
    // `?? 35` semantics: a deliberate strength of 0 is a real value.
    strength: number(row.strength, 35),
    face_count: number(row.face_count, 0),
    source_label: row.source_label || "Source portrait",
    output_label: row.output_label || "Retouched candidate",
    source_asset_id: row.source_asset_id || "",
    output_asset_id: row.output_asset_id || "",
    comparison_asset_id: row.comparison_asset_id || "",
    source_url: row.source_url || "",
    output_url: row.output_url || "",
    checks: normalizeChecks(row.checks),
    review_version: number(row.review_version, 1),
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
  };
}

export function candidateFields(candidate = {}) {
  return {
    candidate_id: candidate.candidate_id || "",
    job_id: candidate.job_id || "",
    ref: candidate.ref || 0,
    title: candidate.title || "Untitled portrait",
    status: candidate.status || "needs_review",
    preset: candidate.preset || "natural",
    strength: candidate.strength ?? 35,
    face_count: candidate.face_count || 0,
    source_label: candidate.source_label || "",
    output_label: candidate.output_label || "",
    source_asset_id: candidate.source_asset_id || "",
    output_asset_id: candidate.output_asset_id || "",
    comparison_asset_id: candidate.comparison_asset_id || "",
    checks: JSON.stringify(candidate.checks || {}),
    review_version: candidate.review_version || 1,
    decision_action: candidate.decision_action || "",
    decision_comment: candidate.decision_comment || "",
    decided_at: candidate.decided_at || "",
  };
}

export function metrics(candidates = []) {
  return candidates.reduce(
    (result, candidate) => {
      result.total += 1;
      result[candidate.status] = (result[candidate.status] || 0) + 1;
      return result;
    },
    { total: 0, needs_review: 0, approved: 0, done: 0, blocked: 0, changes_requested: 0 },
  );
}

const DEMO_IMAGES = {
  source_label: "unsplash-demo-source.jpg",
  source_url: "./assets/demo/portrait-source.jpg",
  output_url: "./assets/demo/portrait-retouched.jpg",
};
const PASS = { texture: "pass", identity: "pass", tone: "pass" };

export function demoSnapshot() {
  const candidates = [
    ["Natural studio portrait", "needs_review", "natural", 35, PASS, "unsplash-demo-retouched.jpg"],
    ["Team page headshot", "needs_review", "fresh", 28, PASS, "team-headshot-v1.jpg"],
    ["Speaker bio photo", "needs_review", "natural", 42, { ...PASS, tone: "review" }, "speaker-bio-v1.jpg"],
    ["Founder profile, softer light", "changes_requested", "studio", 30, PASS, "founder-profile-v2.jpg", "Keep the freckles on the left cheek."],
    ["Studio detail candidate", "approved", "studio", 24, PASS, "studio-detail-v2.jpg", "", "2026-10-08T09:30:00.000Z"],
    ["Newsletter avatar", "approved", "natural", 20, PASS, "newsletter-avatar-v1.jpg", "", "2026-10-07T15:10:00.000Z"],
    ["Conference badge photo", "done", "fresh", 32, PASS, "badge-photo-final.jpg", "Exported for print.", "2026-10-05T11:00:00.000Z"],
    ["Press kit close-up", "blocked", "studio", 64, { texture: "fail", identity: "review", tone: "pass" }, "press-kit-v1.jpg", "Too smooth; skin texture lost.", "2026-10-06T08:45:00.000Z"],
  ].map(([title, status, preset, strength, checks, output_label, decision_comment = "", decided_at = ""], index) => ({
    candidate_id: `candidate-${String(index + 1).padStart(3, "0")}`,
    job_id: `job-${String(Math.floor(index / 2) + 1).padStart(3, "0")}`,
    ref: index + 1,
    title,
    status,
    preset,
    strength,
    face_count: 1,
    output_label,
    checks,
    decision_comment,
    decided_at,
    ...DEMO_IMAGES,
  }));
  return {
    candidates,
    metrics: metrics(candidates),
    settings: { default_preset: "natural", default_strength: 35 },
  };
}

export function onboardingFromRows(rows = []) {
  const row = rows.find((item) => item.record_id === "config");
  if (!row) return { state: "not_started", version: 0, settings: {} };
  const version = Number(row.onboarding_version || 0);
  const complete =
    version === 1 &&
    ["natural", "fresh", "studio"].includes(row.default_preset) &&
    Number(row.default_strength) >= 0 &&
    Number(row.default_strength) <= 100 &&
    row.metadata_policy === "strip" &&
    row.external_upload_policy === "explicit-only" &&
    row.overwrite_policy === "explicit-only" &&
    Boolean(row.completed_at);
  return {
    state: complete ? "complete" : version > 1 ? "needs_review" : "in_progress",
    version,
    settings: {
      default_preset: row.default_preset || "natural",
      default_strength: Number(row.default_strength || 35),
      metadata_policy: row.metadata_policy || "strip",
      external_upload_policy: row.external_upload_policy || "explicit-only",
      overwrite_policy: row.overwrite_policy || "explicit-only",
    },
  };
}
