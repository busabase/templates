import { connectionFacts, createRuntimeClient, resolveRuntimeResources } from "../busabase-client.js";
import { appConfig } from "../config.js";
import { analyze, LIVE_STATUS } from "../content-model.js";
import { diffSchema, schemaIsClean } from "../schema-health.js";

/**
 * The real workspace, read over `/api/v1` on this app's own origin.
 *
 * Both providers return the same shape, and the analysis that turns rows into
 * what a screen shows runs once, here — so demo and live cannot drift into two
 * implementations of "what counts as published".
 */

const allowedReads = new Set(appConfig.permissions.read_procedures);
const allowedWrites = new Set(appConfig.permissions.change_request_procedures);

const requireRead = (procedure) => {
  if (!allowedReads.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

const requireWrite = (procedure) => {
  if (!allowedWrites.has(procedure)) throw new Error(`PROCEDURE_DENIED: ${procedure}`);
};

const recordFields = (record) =>
  record.fields || record.headCommit?.payload?.fields || record.headCommit?.payload || {};

let client;

const baseFor = (key) => {
  const base = appConfig.schema.bases.find((candidate) => candidate.key === key);
  if (!client || !base?.baseId) throw new Error(`SCHEMA_INCOMPLETE: ${key}`);
  return base;
};

const listRecords = async (base) => {
  requireRead("records.listPaged");
  // The blueprint capability is records.listPaged; the SDK names the same
  // cursor-paged operation records.list.
  const page = await client.records.list({ baseId: base.baseId, limit: base.readLimit });
  return (page.records || []).map((record) => ({
    id: record.id,
    headCommit: record.headCommit,
    updatedAt: record.updatedAt,
    fields: recordFields(record),
  }));
};

/**
 * The Bases as they exist right now, not as the template declared them, so a Base
 * someone edited by hand shows up as the drift it is instead of passing on the
 * manifest's word.
 */
const describeBases = async () => {
  requireRead("bases.get");
  const described = [];
  for (const base of appConfig.schema.bases) {
    if (!base.baseId) {
      described.push({ key: base.key, slug: base.slug, name: base.name, fields: null });
      continue;
    }
    const live = await client.bases.get({ baseId: base.baseId }).catch(() => null);
    described.push({
      key: base.key,
      slug: live?.slug ?? base.slug,
      name: live?.name ?? base.name,
      fields: live?.fields ?? null,
    });
  }
  return described;
};

const onboardingState = (input) => {
  if (input.basesFound < input.basesExpected || !input.schemaOk) {
    return { configured: false, state: "needs_resources", publishedCount: input.publishedCount };
  }
  if (input.publishedCount === 0) return { configured: false, state: "needs_content", publishedCount: 0 };
  return { configured: true, state: "ready", publishedCount: input.publishedCount };
};

export const busabaseProvider = {
  name: "busabase",

  async getState() {
    client = createRuntimeClient();
    const resources = await resolveRuntimeResources(client);
    const connection = { ...connectionFacts(), folderId: resources.folderId };

    if (resources.basesFound < resources.basesExpected) {
      return {
        records: {},
        connection,
        schemaHealth: null,
        provider_status: { ok: true, provider: "busabase", mode: "busabase" },
        setup: {
          connection: { ...resources, baseUrl: connection.baseUrl, schemaOk: false },
          onboarding: { configured: false, state: "needs_resources", publishedCount: 0 },
        },
      };
    }

    const [categories, tags, posts, pages, described] = await Promise.all([
      listRecords(baseFor("categories")),
      listRecords(baseFor("tags")),
      listRecords(baseFor("posts")),
      listRecords(baseFor("pages")),
      describeBases(),
    ]);

    const schemaHealth = diffSchema(described);
    const schemaOk = schemaIsClean(schemaHealth);
    const analysis = analyze({ categories, tags, posts, pages });
    const publishedCount = analysis.items.filter((item) => item.status === LIVE_STATUS).length;

    return {
      records: { categories, tags, posts, pages },
      connection,
      schemaHealth,
      provider_status: { ok: true, provider: "busabase", mode: "busabase" },
      setup: {
        connection: { ...resources, baseUrl: connection.baseUrl, schemaOk },
        onboarding: onboardingState({ ...resources, schemaOk, publishedCount }),
      },
    };
  },

  /**
   * Saving is a save. No `autoMerge` is passed either way, so Busabase's own
   * permission-aware default decides: with write access the change lands, without
   * it the same change becomes a ChangeRequest for someone who has it. The app
   * reports what came back rather than announcing an outcome in advance.
   */
  async save({ kind, recordId, baseCommitId, fields }) {
    const payload = { ...fields, "schema-version": 1 };
    if (recordId) {
      requireWrite("records.changeRequest");
      return client.records.changeRequest({
        recordId,
        operation: "update",
        fields: payload,
        message: `Update: ${payload.title ?? recordId}`,
        author: "airapp",
        ...(baseCommitId ? { baseCommitId } : {}),
      });
    }
    requireWrite("bases.createChangeRequest");
    const base = baseFor(kind === "pages" ? "pages" : "posts");
    return client.bases.createChangeRequest({
      baseId: base.baseId,
      fields: { status: "draft", ...payload },
      message: `New ${kind === "pages" ? "page" : "post"}: ${payload.title || "Untitled"}`,
      submittedBy: "airapp",
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async setStatus({ recordId, baseCommitId, status, title, publishedAt }) {
    requireWrite("records.changeRequest");
    return client.records.changeRequest({
      recordId,
      operation: "update",
      fields: {
        status,
        // A first publish gets today's date; re-publishing keeps the original, so
        // a typo fix does not move the post to the top of the blog index.
        ...(status === "published"
          ? { "published-at": publishedAt || new Date().toISOString().slice(0, 10) }
          : {}),
      },
      message: status === "published" ? `Publish: ${title}` : `Unpublish: ${title}`,
      author: "airapp",
      ...(baseCommitId ? { baseCommitId } : {}),
    });
  },
};
