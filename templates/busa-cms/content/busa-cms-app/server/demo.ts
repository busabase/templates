import { analyze } from "../app/js/content-model.js";
import { appConfig } from "../app/js/config.js";
import { CMS_BASES } from "../app/js/schema.js";
import { sampleRecords } from "../lib/sample-content.js";
import { connectSnippets } from "../lib/connect-snippets.ts";
import { diffSchema } from "../lib/schema-health.ts";

/**
 * The gallery preview and the install seed are the same content.
 *
 * `sample-content.js` is the single declaration; `scripts/sync-content.mjs` writes
 * it out as the `records.ndjson` install merges, and this module serves it. A
 * preview showing different content from the install would be a lie told at exactly
 * the moment someone is deciding whether to install.
 *
 * Writes are applied to an in-memory copy for the life of the process. That makes
 * the demo honest about the loop — save a post, it appears; publish it, it moves —
 * without any of it reaching a workspace.
 */

const DEMO_FOLDER_ID = "nod_demo_busa_cms_folder";
const DEMO_TIME = "2026-08-22T15:10:00.000Z";

export const isDemoQuery = (query: Record<string, string | undefined>) =>
  Boolean(query?.demo) && query.demo !== "0";

/** Package-local relation keys become record ids, exactly as install rewrites them. */
const recordIdFor = (baseKey: string, key: string) => `rec_demo_${baseKey}_${key}`;

const linked = (baseKey: string, value: unknown) =>
  (Array.isArray(value) ? value : value ? [value] : []).map((key) =>
    recordIdFor(baseKey, String(key)),
  );

const materialize = (baseKey: string, row: any) => {
  const fields = { ...row.fields };
  if (baseKey === "posts") {
    fields.categories = linked("categories", fields.categories);
    fields.tags = linked("tags", fields.tags);
  }
  return {
    id: recordIdFor(baseKey, row.key),
    updatedAt: DEMO_TIME,
    headCommit: { id: `cmt_demo_${baseKey}_${row.key}` },
    fields: { ...fields, "updated-at": DEMO_TIME },
  };
};

const freshRecords = () =>
  Object.fromEntries(
    appConfig.schema.bases.map((base) => [
      base.key,
      (sampleRecords as any)[base.key].map((row: any) => materialize(base.key, row)),
    ]),
  ) as Record<string, any[]>;

let records: Record<string, any[]> | null = null;
let sequence = 1;

const store = () => {
  records ??= freshRecords();
  return records;
};

const findRecord = (recordId: string) => {
  for (const rows of Object.values(store())) {
    const found = rows.find((row) => row.id === recordId);
    if (found) return found;
  }
  return null;
};

const choiceMaps = () => {
  const post = CMS_BASES.find((base) => base.role === "posts");
  const page = CMS_BASES.find((base) => base.role === "pages");
  const named = (base: any, slug: string) =>
    Object.fromEntries(
      (base?.fields.find((field: any) => field.slug === slug)?.options?.choices ?? []).map(
        (choice: any) => [choice.id, choice.name],
      ),
    );
  return {
    locale: named(post, "locale"),
    status: named(post, "status"),
    template: named(page, "template"),
  };
};

// The demo's Bases are the declaration itself, so the health check is clean by
// construction — which is exactly what a correctly installed Space looks like.
const demoSchemaHealth = () =>
  diffSchema(
    CMS_BASES.map((base) => ({
      key: base.role,
      slug: `busa-cms-${base.role}`,
      name: base.name,
      fields: base.fields as any,
    })),
  );

export function demoStatePayload(query: Record<string, string | undefined>) {
  const scenario = query.state || "ready";
  if (scenario === "error") {
    return {
      items: [],
      terms: [],
      counts: {},
      choices: choiceMaps(),
      connection: {},
      schemaHealth: null,
      provider_status: {
        ok: false,
        provider: "demo",
        mode: "deterministic_local_demo",
        message: "The content window could not be loaded.",
      },
      setup: { connection: {}, onboarding: { configured: false, state: "needs_resources" } },
    };
  }

  const empty = scenario === "empty";
  const raw = empty
    ? Object.fromEntries(appConfig.schema.bases.map((base) => [base.key, []]))
    : store();
  const analysis = analyze(raw as any);

  return {
    items: analysis.items,
    terms: analysis.terms,
    counts: analysis.counts,
    choices: choiceMaps(),
    connection: {
      baseUrl: "https://busabase.com",
      folderId: DEMO_FOLDER_ID,
      folderSlug: "busa-cms",
      spaceId: "spc_demo_workspace",
      profile: appConfig.cms.profile,
      sdkPackage: appConfig.cms.sdkPackage,
      bases: appConfig.schema.bases.map((base) => ({ key: base.key, slug: base.slug })),
      snippets: connectSnippets({
        baseUrl: "https://busabase.com",
        spaceId: "spc_demo_workspace",
        folderId: DEMO_FOLDER_ID,
        profile: appConfig.cms.profile,
      }),
    },
    schemaHealth: demoSchemaHealth(),
    provider_status: { ok: true, provider: "demo", mode: "deterministic_local_demo" },
    setup: {
      connection: {
        folderId: DEMO_FOLDER_ID,
        basesFound: 4,
        basesExpected: 4,
        baseUrl: "https://busabase.com",
        schemaOk: true,
      },
      onboarding: empty
        ? { configured: false, state: "needs_content", publishedCount: 0 }
        : { configured: true, state: "ready", publishedCount: analysis.counts.live },
    },
  };
}

export function demoSave(body: any) {
  const kind = body?.kind === "pages" ? "pages" : "posts";
  const fields = { ...(body?.fields || {}), "schema-version": 1 };
  const existing = body?.recordId ? findRecord(String(body.recordId)) : null;

  if (existing) {
    Object.assign(existing.fields, fields, { "updated-at": DEMO_TIME });
    return { id: existing.id, merged: true };
  }

  const id = `rec_demo_new_${String(sequence).padStart(3, "0")}`;
  sequence += 1;
  store()[kind].unshift({
    id,
    updatedAt: DEMO_TIME,
    headCommit: { id: `cmt_${id}` },
    fields: { status: "draft", categories: [], tags: [], ...fields, "updated-at": DEMO_TIME },
  });
  return { id, merged: true };
}

export function demoSetStatus(body: any) {
  const record = findRecord(String(body?.recordId || ""));
  if (!record) return { id: "", merged: false };
  const status = body?.status === "published" ? "published" : "draft";
  record.fields.status = status;
  if (status === "published") {
    record.fields["published-at"] ||= body?.publishedAt || "2026-08-26";
  }
  record.fields["updated-at"] = DEMO_TIME;
  return { id: record.id, merged: true };
}
