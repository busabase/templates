// Reads the operator-provisioned Busa Insure Data Busabase workspace (one
// Drive node, four Bases) through js/insure-client.js and normalizes it with
// js/insure-model.js — a faithful port of the retired
// lib/data-provider/busabase-provider.ts's readSnapshot(). Never creates or
// writes anything (see js/config.js's header comment for why); a missing
// Drive or Base degrades to a snapshot warning instead of a blocking setup
// screen, exactly like the original.
import { appConfig } from "../config.js?v=0.1.0";
import {
  countRecords,
  getRecord,
  listBases,
  listDriveFiles,
  listRecordsPage,
  resolveDrive,
} from "../insure-client.js?v=0.1.0";
import {
  metadataFields,
  needsGovernance,
  normalizeFeedback,
  normalizeFile,
  normalizeNews,
  normalizeQa,
  qualityScore,
} from "../insure-model.js?v=0.1.0";

function baseByKey(key) {
  return appConfig.bases.find((base) => base.key === key);
}

function baseSummary(resolved, declared) {
  return {
    base_id: String(resolved?.id || ""),
    name: String(resolved?.name || declared.name),
    slug: String(resolved?.slug || declared.slug),
    fields: Array.isArray(resolved?.fields)
      ? resolved.fields.map((field) => ({
          key: field.slug || field.id,
          value: `${field.name || field.slug} (${field.type})`,
        }))
      : [],
  };
}

function emptySnapshot(message) {
  const drive = appConfig.drive;
  const featured = baseByKey("featured");
  const notices = baseByKey("notices");
  const qa = baseByKey("qa");
  const feedback = baseByKey("feedback");
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    drive: { node_id: "", name: drive.name, slug: drive.slug, metadata: {}, metadata_fields: [] },
    bases: {
      featured: { base_id: "", name: featured.name, slug: featured.slug, fields: [] },
      notices: { base_id: "", name: notices.name, slug: notices.slug, fields: [] },
      qa: { base_id: "", name: qa.name, slug: qa.slug, fields: [] },
      feedback: { base_id: "", name: feedback.name, slug: feedback.slug, fields: [] },
    },
    metrics: {
      file_count: 0,
      metadata_field_count: 0,
      qa_count: 0,
      featured_count: 0,
      notice_count: 0,
      news_count: 0,
      feedback_count: 0,
      total_records: 0,
      data_quality_score: 0,
      needs_governance: 0,
    },
    files: [],
    qa_pairs: [],
    news_items: [],
    featured_items: [],
    notice_items: [],
    feedback_items: [],
    warnings: [{ id: "busabase-error", severity: "warning", message }],
  };
}

// Each side read settles on its own: a denied or failing Base becomes a
// warning on that Base, never an empty app (it used to be one Promise.all,
// so a single 403 blanked every view).
const settle = async (label, promise, warnings, view = "") => {
  try {
    return await promise;
  } catch (error) {
    warnings.push({
      id: `read-failed-${label}`,
      severity: "warning",
      view,
      message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  }
};

// Collection key → declared Base, the taxonomy mapping, and its normalizer.
const COLLECTIONS = {
  qa: { base: "qa", normalize: (record) => normalizeQa(record, appConfig.taxonomy.qa_fields) },
  featured: {
    base: "featured",
    normalize: (record) => normalizeNews(record, appConfig.taxonomy.featured_fields, "featured"),
  },
  notices: {
    base: "notices",
    normalize: (record) => normalizeNews(record, appConfig.taxonomy.notices_fields, "notice"),
  },
  feedback: { base: "feedback", normalize: (record) => normalizeFeedback(record, appConfig.taxonomy.feedback_fields) },
};

// Resolved Base ids, kept between getState() and the later fetchPage()/getRecord().
const resolvedBases = {};

async function readSnapshot() {
  const drive = appConfig.drive;
  const warnings = [];
  const limit = appConfig.readLimit || 50;

  const [driveResult, allBases] = await Promise.all([
    settle("drive", resolveDrive("", drive.slug), warnings),
    settle("bases", listBases(), warnings),
  ]);
  const findBase = (key) => {
    const declared = baseByKey(key);
    return (allBases || []).find((base) => base.slug === declared.slug) || null;
  };
  const featuredBase = findBase("featured");
  const noticesBase = findBase("notices");
  const qaBase = findBase("qa");
  const feedbackBase = findBase("feedback");
  for (const [key, base] of Object.entries({ qa: qaBase, featured: featuredBase, notices: noticesBase, feedback: feedbackBase })) {
    resolvedBases[key] = base?.id || "";
  }

  const resolvedDriveNodeId = driveResult?.node?.id || driveResult?.nodeId || driveResult?.id || "";
  // Page 1 of each Base plus its exact total: two requests per Base, bounded.
  const VIEW_OF = { qa: "qa", featured: "news", notices: "news", feedback: "feedback" };
  const readPage = (key, base) =>
    base ? settle(baseByKey(key).name, listRecordsPage(base.id, { limit }), warnings, VIEW_OF[key]) : null;
  const readCount = (base) => (base ? countRecords(base.id) : null);
  const [driveFiles, featuredPage, noticesPage, qaPage, feedbackPage, featuredTotal, noticesTotal, qaTotal, feedbackTotal] =
    await Promise.all([
      Array.isArray(driveResult?.files)
        ? driveResult.files
        : resolvedDriveNodeId
          ? settle("drive files", listDriveFiles(resolvedDriveNodeId), warnings, "files")
          : [],
      readPage("featured", featuredBase),
      readPage("notices", noticesBase),
      readPage("qa", qaBase),
      readPage("feedback", feedbackBase),
      readCount(featuredBase),
      readCount(noticesBase),
      readCount(qaBase),
      readCount(feedbackBase),
    ]);

  const files = (driveFiles || []).map((file) => normalizeFile(file, appConfig.taxonomy.file_metadata_fields));
  const qaPairs = (qaPage?.records || []).map(COLLECTIONS.qa.normalize);
  const featuredItems = (featuredPage?.records || []).map(COLLECTIONS.featured.normalize);
  const noticeItems = (noticesPage?.records || []).map(COLLECTIONS.notices.normalize);
  const newsItems = [...featuredItems, ...noticeItems];
  const feedbackItems = (feedbackPage?.records || []).map(COLLECTIONS.feedback.normalize);
  const allGoverned = [...files, ...qaPairs, ...newsItems, ...feedbackItems];
  const driveMetadata = driveResult?.node?.metadata || {};

  if (!driveResult)
    warnings.push({
      id: "missing-drive",
      severity: "warning",
      message: "Busabase Drive node is not configured or not found.",
    });
  if (allBases && !qaBase)
    warnings.push({
      id: "missing-qa-base",
      severity: "warning",
      message: "Busabase QA Base is not configured or not found.",
    });
  if (allBases && !featuredBase)
    warnings.push({
      id: "missing-featured-base",
      severity: "warning",
      message: "Busabase Featured Information Base is not configured or not found.",
    });
  if (allBases && !noticesBase)
    warnings.push({
      id: "missing-notices-base",
      severity: "warning",
      message: "Busabase Insurer Notices Base is not configured or not found.",
    });
  if (allBases && !feedbackBase)
    warnings.push({
      id: "missing-feedback-base",
      severity: "warning",
      message: "Busabase feedback Base is not configured or not found.",
    });

  // A total is the exact records.count answer, or the loaded length when the
  // Base fit on one page; otherwise null ("—"), never a partial number.
  const total = (count, page, rows) => (count ?? (page && !page.nextCursor ? rows.length : null));
  const featuredCount = total(featuredTotal, featuredPage, featuredItems);
  const noticeCount = total(noticesTotal, noticesPage, noticeItems);
  const newsCount = featuredCount === null || noticeCount === null ? null : featuredCount + noticeCount;

  const snapshot = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    drive: {
      node_id: String(resolvedDriveNodeId || ""),
      name: String(driveResult?.node?.name || drive.name),
      slug: String(driveResult?.node?.slug || drive.slug),
      metadata: driveMetadata,
      metadata_fields: metadataFields(driveMetadata),
    },
    bases: {
      featured: baseSummary(featuredBase, baseByKey("featured")),
      notices: baseSummary(noticesBase, baseByKey("notices")),
      qa: baseSummary(qaBase, baseByKey("qa")),
      feedback: baseSummary(feedbackBase, baseByKey("feedback")),
    },
    metrics: {
      file_count: files.length,
      metadata_field_count: metadataFields(driveMetadata).length,
      qa_count: total(qaTotal, qaPage, qaPairs),
      featured_count: featuredCount,
      notice_count: noticeCount,
      news_count: newsCount,
      feedback_count: total(feedbackTotal, feedbackPage, feedbackItems),
      // Per-row arithmetic (completeness across fields) has no server
      // aggregate: these two cover the loaded rows and the UI says so.
      data_quality_score: qualityScore(allGoverned),
      needs_governance: needsGovernance(allGoverned),
    },
    files,
    qa_pairs: qaPairs,
    news_items: newsItems,
    featured_items: featuredItems,
    notice_items: noticeItems,
    feedback_items: feedbackItems,
    warnings,
  };

  const pagination = {
    qa: qaPage?.nextCursor || "",
    featured: featuredPage?.nextCursor || "",
    notices: noticesPage?.nextCursor || "",
    feedback: feedbackPage?.nextCursor || "",
  };
  return { snapshot, pagination };
}

function configSummary() {
  const drive = appConfig.drive;
  const featured = baseByKey("featured");
  const notices = baseByKey("notices");
  const qa = baseByKey("qa");
  const feedback = baseByKey("feedback");
  return {
    config_path: "busabase:workspace/busa-insure-data",
    is_example: false,
    drive: { slug: drive.slug },
    bases: {
      featured: featured.slug,
      notices: notices.slug,
      qa: qa.slug,
      feedback: feedback.slug,
    },
  };
}

export const busabaseProvider = {
  kind: "busabase",

  // Mirrors the retired lib/data-provider/busabase-provider.ts's getState():
  // readSnapshot() is allowed to throw on ANY single unexpected Busabase
  // error (a network hiccup, an auth/permission error, an endpoint the
  // connected Busabase server version doesn't expose) and this wrapper
  // always still returns a valid, empty-but-labeled snapshot instead of
  // letting the AirApp crash into the generic "workspace not ready" screen.
  // A resource that is simply not found (missing Drive/Base) is handled
  // more precisely inside readSnapshot() as a per-resource warning; this
  // catch is the coarse fallback for everything else.
  async getState() {
    let snapshot;
    let pagination = {};
    try {
      ({ snapshot, pagination } = await readSnapshot());
    } catch (error) {
      snapshot = emptySnapshot(error instanceof Error ? error.message : String(error));
    }
    return {
      app: "busa-insure-data",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: true, source: "busabase" },
      config_summary: configSummary(),
      lock: null,
      snapshot,
      pagination,
    };
  },

  // The next page of one collection (qa | featured | notices | feedback), run
  // through the same normalizer as page 1. One request per "Load more" click.
  async fetchPage(key, cursor) {
    const collection = COLLECTIONS[key];
    const baseId = resolvedBases[key];
    if (!collection || !baseId || !cursor) return { rows: [], nextCursor: "" };
    const page = await listRecordsPage(baseId, { limit: appConfig.readLimit || 50, cursor });
    return { rows: page.records.map(collection.normalize), nextCursor: page.nextCursor };
  },

  // A record named by the URL (a shared ?peek= or /<id> link) that is not on a
  // loaded page: one records.get, normalized by the Base it belongs to.
  async getRecord(view, id) {
    const record = await getRecord(id);
    const raw = record?.record || record;
    if (!raw) return null;
    const keys = view === "news" ? ["featured", "notices"] : [view];
    const key = keys.find((candidate) => resolvedBases[candidate] && raw.baseId === resolvedBases[candidate]);
    return key ? COLLECTIONS[key].normalize(raw) : null;
  },

  async provisionResources() {
    throw new Error(
      "Busa Insure Data reads an operator-provisioned Busabase workspace; there is nothing for the AirApp to provision.",
    );
  },
};
