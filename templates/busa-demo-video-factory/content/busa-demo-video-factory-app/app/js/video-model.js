// Pure read-side domain logic for Busa Demo Video Factory: normalize
// Busabase record fields into plain video/shot rows, join shots to their
// video client-side (the inverse `shots` relation on a video record is only
// backfilled per-record by scripts/propose_video.mjs --merge, not computed
// live — see config.js's comment), and roll up per-video recording progress.
// Ported from the retired app/server/hono.ts's loadWorkspace()/shotCounts()
// (server-side JSON API) onto plain browser-side functions — same field
// names, same rollup shape, same "pending" default for a shot with no
// recording-status value yet.

export const VIDEO_STATUSES = ["idea", "needs_review", "approved", "recording", "post_production", "done"];
export const SHOT_STATUSES = ["pending", "recorded", "needs_reshoot"];

// Option ids never reach the screen; these are their human labels.
const STATUS_LABELS = {
  idea: "Idea",
  needs_review: "Needs review",
  approved: "Approved",
  recording: "Recording",
  post_production: "Post-production",
  done: "Done",
  pending: "Pending",
  recorded: "Recorded",
  needs_reshoot: "Needs reshoot",
};

export function statusLabel(status) {
  if (!status) return "";
  return STATUS_LABELS[status] || String(status).replaceAll("_", " ");
}

// A relation comes back as a record id, or an array of them. Keep ids only;
// display code resolves them to names.
const relationIds = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : item?.id || item?.recordId || "")).filter(Boolean);
  }
  if (typeof value === "string" && value) return [value];
  if (value && typeof value === "object") return [value.id || value.recordId || ""].filter(Boolean);
  return [];
};

export function normalizeVideoRow(row = {}) {
  return {
    id: row.__recordId || row.id || "",
    title: row.title || "",
    series: row.series || "",
    purpose: row.purpose || "",
    hook: row.hook || "",
    pain_point: row.pain_point || "",
    concept: row.concept || "",
    status: row.status || "idea",
    verified_claims: row.verified_claims || "",
    hyperframe_path: row.hyperframe_path || "",
    final_video_url: row.final_video_url || "",
    owner: row.owner || "",
    shot_ids: relationIds(row.shots),
  };
}

export function normalizeShotRow(row = {}) {
  return {
    id: row.__recordId || row.id || "",
    title: row.title || "",
    video: relationIds(row.video)[0] || "",
    shot_number: Number(row.shot_number) || 0,
    timecode: row.timecode || "",
    scene: row.scene || "",
    code_reference: row.code_reference || "—",
    script_line: row.script_line || "",
    note: row.note || "",
    recording_status: row.recording_status || "pending",
    asset_count: Array.isArray(row.asset) ? row.asset.length : 0,
  };
}

/** Every shot whose `video` field points at videoId, sorted by shot_number. */
export function shotsForVideo(shots, videoId) {
  return shots.filter((shot) => shot.video === videoId).sort((a, b) => a.shot_number - b.shot_number);
}

/** { total, byStatus: {pending: n, recorded: n, needs_reshoot: n} } for one video. */
export function shotCounts(shots, videoId) {
  const mine = shotsForVideo(shots, videoId);
  const byStatus = {};
  for (const shot of mine) {
    byStatus[shot.recording_status] = (byStatus[shot.recording_status] ?? 0) + 1;
  }
  return { total: mine.length, byStatus };
}

/**
 * Videos joined with their shot-recording rollup, ready for the list view.
 * `linked` is the shot count the video's own `shots` relation records — it
 * stays right when the loaded shot page is only part of the Base, where
 * `total` (counted from loaded shots) would undercount.
 */
export function withShotRollup(videos, shots) {
  return videos.map((video) => {
    const counts = shotCounts(shots, video.id);
    return { ...video, shots: { ...counts, linked: Math.max(counts.total, video.shot_ids?.length || 0) } };
  });
}

/** Status → count over a set of rows. */
export function countBy(rows, key, statuses) {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

export function buildState(videos, shots, { demo = false } = {}) {
  return {
    app: "busa-demo-video-factory",
    demo,
    videoCount: videos.length,
    videos: withShotRollup(videos, shots),
    shots,
  };
}
