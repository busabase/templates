import { appConfig } from "../config.js";
import { analyze } from "../content-model.js";
import { CMS_BASES } from "../schema.js";
import { diffSchema } from "../schema-health.js";

/**
 * The gallery preview and the install seed are the same content.
 *
 * The rows come from `lib/sample-content.js` over `/api/demo-records` — the same
 * declaration `scripts/sync-content.mjs` writes out as the `records.ndjson` that
 * install merges. A preview showing different content from the install would be a
 * lie told at exactly the moment someone is deciding whether to install.
 *
 * It is fetched rather than imported because one seeded post's body is a code
 * sample naming an API-key env var, and `busabase-sdk/airapp-check` fails any app
 * whose browser bundle mentions one. That rule cannot tell a variable name from a
 * leaked value, and it is right not to try.
 *
 * Writes are applied to this in-memory copy for the life of the page, so the loop
 * is demonstrable — save a post, it appears; publish it, it moves — without any of
 * it reaching a workspace.
 */

const DEMO_FOLDER_ID = "nod_demo_busa_cms_folder";
const DEMO_TIME = "2026-08-22T15:10:00.000Z";

let records = null;
let sequence = 1;

/** Package-local relation keys become record ids, exactly as install rewrites them. */
const recordIdFor = (baseKey, key) => `rec_demo_${baseKey}_${key}`;

const linked = (baseKey, value) =>
  (Array.isArray(value) ? value : value ? [value] : []).map((key) => recordIdFor(baseKey, String(key)));

const materialize = (baseKey, row) => {
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

const load = async () => {
  if (records) return records;
  const seed = await fetch("api/demo-records").then((response) => response.json());
  records = Object.fromEntries(
    appConfig.schema.bases.map((base) => [
      base.key,
      (seed[base.key] ?? []).map((row) => materialize(base.key, row)),
    ]),
  );
  return records;
};

const findRecord = (recordId) => {
  for (const rows of Object.values(records ?? {})) {
    const found = rows.find((row) => row.id === recordId);
    if (found) return found;
  }
  return null;
};

// The demo's Bases are the declaration itself, so the health check is clean by
// construction — which is exactly what a correctly installed Space looks like.
const demoSchemaHealth = () =>
  diffSchema(
    CMS_BASES.map((base) => ({
      key: base.role,
      slug: `busa-cms-${base.role}`,
      name: base.name,
      fields: base.fields,
    })),
  );

export const demoProvider = {
  name: "demo",

  async getState() {
    const scenario = new URLSearchParams(window.location.search).get("state") || "ready";
    const connection = {
      baseUrl: window.location.origin,
      folderId: DEMO_FOLDER_ID,
      folderSlug: "busa-cms",
      spaceId: "spc_demo_workspace",
      profile: appConfig.cms.profile,
      sdkPackage: appConfig.cms.sdkPackage,
      bases: appConfig.schema.bases.map((base) => ({ key: base.key, slug: base.slug })),
    };

    if (scenario === "error") {
      return {
        records: {},
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
    const loaded = await load();
    const rows = empty
      ? Object.fromEntries(appConfig.schema.bases.map((base) => [base.key, []]))
      : loaded;
    const analysis = analyze(rows);

    return {
      records: rows,
      connection,
      schemaHealth: demoSchemaHealth(),
      provider_status: { ok: true, provider: "demo", mode: "deterministic_local_demo" },
      setup: {
        connection: {
          folderId: DEMO_FOLDER_ID,
          basesFound: 4,
          basesExpected: 4,
          baseUrl: connection.baseUrl,
          schemaOk: true,
        },
        onboarding: empty
          ? { configured: false, state: "needs_content", publishedCount: 0 }
          : { configured: true, state: "ready", publishedCount: analysis.counts.live },
      },
    };
  },

  async save({ kind, recordId, fields }) {
    const payload = { ...fields, "schema-version": 1 };
    const existing = recordId ? findRecord(recordId) : null;
    if (existing) {
      Object.assign(existing.fields, payload, { "updated-at": DEMO_TIME });
      return { id: existing.id };
    }
    const id = `rec_demo_new_${String(sequence).padStart(3, "0")}`;
    sequence += 1;
    records[kind === "pages" ? "pages" : "posts"].unshift({
      id,
      updatedAt: DEMO_TIME,
      headCommit: { id: `cmt_${id}` },
      fields: { status: "draft", categories: [], tags: [], ...payload, "updated-at": DEMO_TIME },
    });
    return { id };
  },

  async setStatus({ recordId, status, publishedAt }) {
    const record = findRecord(recordId);
    if (!record) return { id: "" };
    record.fields.status = status;
    if (status === "published") record.fields["published-at"] ||= publishedAt || "2026-08-26";
    record.fields["updated-at"] = DEMO_TIME;
    return { id: record.id };
  },
};
