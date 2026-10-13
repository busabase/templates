import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  buildState,
  normalizeShotRow,
  normalizeVideoRow,
  SHOT_STATUSES,
  shotsForVideo,
  VIDEO_STATUSES,
  withShotRollup,
} from "../video-model.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);

// Read-only AirApp: this file never proposes or merges a record write (see
// SKILL.md's Boundary — "The app (app/) is read-only... has no write API.
// All writes go through scripts/*.mjs"). The only writers are the
// skill-root trusted scripts (scripts/ensure_schema.mjs, propose_video.mjs,
// set_shot_status.mjs), which connect with their own BUSABASE_* credentials,
// never this AirApp's ambient session.
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";
let currentShots = [];

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

// `filters` is pushed down to records.list, which treats it as a superset
// hint — the client still narrows, so every caller passes rows through
// `matches` before showing them.
async function readPage(key, cursor, filters, limit) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: limit || declared.readLimit,
    ...(cursor ? { cursor } : {}),
    ...(filters?.length ? { filters } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}

const NORMALIZE = { videos: normalizeVideoRow, "video-shots": normalizeShotRow };

const statusFilter = (key, status) =>
  status && status !== "all"
    ? [{ fieldSlug: key === "videos" ? "status" : "recording-status", fieldType: "select", operator: "equals", value: status }]
    : undefined;

const matchesStatus = (key, row, status) =>
  !status || status === "all" || (key === "videos" ? row.status : row.recording_status) === status;

async function countRecords(key, filters) {
  if (!allowedReads.has("records.count")) return null;
  const declared = base(key);
  try {
    const { total } = await runtimeClient.records.count({ baseId: declared.baseId, ...(filters ? { filters } : {}) });
    return total;
  } catch {
    return null;
  }
}

// Exact per-status totals for the overview and the attention block: one
// records.count per status (the pinned SDK has no records.groupBy). A denied
// or failed count is null, rendered as "—", never as 0.
async function countStatuses(key, statuses) {
  const values = await Promise.all(statuses.map((status) => countRecords(key, statusFilter(key, status))));
  return Object.fromEntries(statuses.map((status, index) => [status, values[index]]));
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    // Videos are the page's subject: if they cannot be read, the page fails.
    // Shots are a side read — a denied or failed shot read leaves the videos
    // usable and says so, instead of failing the whole app.
    const [videoPage, shotResult, videoTotal, shotTotal, videoStatus, shotStatus] = await Promise.all([
      readPage("videos"),
      readPage("video-shots").then(
        (page) => ({ page }),
        (error) => ({ error: error instanceof Error ? error.message : String(error) }),
      ),
      countRecords("videos"),
      countRecords("video-shots"),
      countStatuses("videos", VIDEO_STATUSES),
      countStatuses("video-shots", SHOT_STATUSES),
    ]);
    const videos = videoPage.rows.map(normalizeVideoRow);
    const shots = (shotResult.page?.rows || []).map(normalizeShotRow);
    currentShots = shots;
    return {
      ...buildState(videos, shots, { demo: false }),
      data_provider: "busabase",
      onboarding: { completed: videos.length > 0, config_version: "1" },
      pagination: { videos: videoPage.nextCursor, "video-shots": shotResult.page?.nextCursor ?? null },
      totals: { videos: videoTotal, "video-shots": shotTotal },
      statusCounts: { videos: videoStatus, "video-shots": shotStatus },
      warnings: shotResult.error ? [`Shots could not be loaded: ${shotResult.error}`] : [],
    };
  },

  /** One page of a Base, optionally narrowed to one status. One request. */
  async fetchPage(key, cursor, { status } = {}) {
    await ensureResources();
    const page = await readPage(key, cursor, statusFilter(key, status));
    const rows = page.rows.map(NORMALIZE[key]).filter((row) => matchesStatus(key, row, status));
    return { ...page, rows: key === "videos" ? withShotRollup(rows, currentShots) : rows };
  },

  /** One record by id, for a URL naming a record that is not on the loaded page. */
  async getRecord(key, recordId) {
    if (!allowedReads.has("records.get")) return null;
    await ensureResources();
    const record = await runtimeClient.records.get({ recordId });
    if (record?.baseId && record.baseId !== base(key).baseId) return null;
    const row = NORMALIZE[key]({
      ...normalizeFields(record?.headCommit?.payload || record?.fields),
      __recordId: record?.id,
    });
    return key === "videos" ? withShotRollup([row], currentShots)[0] : row;
  },

  /** A video's storyboard: one filtered page of shots, narrowed client-side. */
  async fetchShotsForVideo(videoId, cursor) {
    await ensureResources();
    const page = await readPage(
      "video-shots",
      cursor,
      [{ fieldSlug: "video", fieldType: "relation", operator: "contains", value: videoId }],
      100,
    );
    return { rows: shotsForVideo(page.rows.map(normalizeShotRow), videoId), nextCursor: page.nextCursor };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
