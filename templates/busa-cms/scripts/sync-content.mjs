#!/usr/bin/env node
/**
 * Regenerate `content/` from the app's own declaration, or check it is current.
 *
 * The app declares its tables once, in `content/busa-cms-app/app/js/config.js`
 * (fields from `app/js/schema.js`, seed rows from `lib/sample-content.js`) — the
 * files its runtime already reads. The package's `content/_folder.json`,
 * `content/<base>/base.json` and `content/<base>/records.ndjson` are DERIVED from
 * that declaration, never hand-edited.
 *
 * The AirApp cannot read `content/` from inside its installed node, which is why
 * the declaration lives on the app side and the package side is generated. Two
 * hand-maintained copies of the CMS contract would drift, and the drift would be
 * invisible until someone installed the template and their site threw
 * `BusabaseCmsSchemaDriftError` on its first render.
 *
 *   node scripts/sync-content.mjs           # write
 *   node scripts/sync-content.mjs --check   # exit 1 if anything is stale
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const appDir = path.join(root, "content/busa-cms-app/app/js");
const { appConfig } = await import(path.join(appDir, "config.js"));
const { sampleRecords } = await import(path.join(root, "content/busa-cms-app/lib/sample-content.js"));

/** The validator's ceiling; a template seeds a demo, it does not ship a dataset. */
const MAX_SAMPLE_ROWS = 50;

/**
 * The package format carries table views and nothing else (`PackageViewSchema`'s
 * `type` is `z.literal("table")`).
 *
 * This is checked here because of how it fails: a kanban view in `base.json` makes
 * `readPackageTree` throw, and the catalog indexer *skips* a package it cannot
 * read — it is not listed and not reported as rejected either. The template simply
 * vanishes from the gallery with no message anywhere. Ask for a board in the app's
 * own UI instead; a Base view has to be a table.
 */
const PACKAGE_VIEW_TYPES = new Set(["table"]);

const stale = [];

const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== contents) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ndjson = (rows) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

await emit(
  "content/_folder.json",
  json({
    name: appConfig.schema.folder.name,
    description: appConfig.schema.folder.description ?? "",
  }),
);

let position = 0;
for (const base of appConfig.schema.bases) {
  // Checked before the write, not after: a guard that emits the bad file and then
  // refuses leaves content/ stale, which is a second problem to debug.
  for (const view of base.views ?? []) {
    if (!PACKAGE_VIEW_TYPES.has(view.type)) {
      console.error(
        `content/${base.key}: view "${view.key}" is a ${view.type} view. The package format only\n` +
          "carries table views, and the catalog indexer silently skips a package it cannot read.",
      );
      process.exit(1);
    }
  }

  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description ?? "",
      position: position++,
      fields: base.fields.map((field, index) => ({
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        position: index,
        options: field.options ?? {},
      })),
      views: (base.views ?? []).map((view) => ({
        slug: view.key,
        name: view.name,
        type: view.type,
        config: view.config,
      })),
    }),
  );

  const rows = sampleRecords[base.key] ?? [];
  if (rows.length > MAX_SAMPLE_ROWS) {
    console.error(
      `content/${base.key}: ${rows.length} sample rows exceeds the ${MAX_SAMPLE_ROWS}-row ceiling.`,
    );
    process.exit(1);
  }
  if (rows.length > 0) await emit(`content/${base.key}/records.ndjson`, ndjson(rows));
}

/**
 * A relation value in a seed row is the package-local `key` of a row in the target
 * Base. A typo here installs cleanly and silently drops the link, so it is checked
 * rather than trusted.
 */
const keysByBase = Object.fromEntries(
  Object.entries(sampleRecords).map(([key, rows]) => [key, new Set(rows.map((row) => row.key))]),
);
const dangling = [];
for (const base of appConfig.schema.bases) {
  const relations = base.fields.filter((field) => field.type === "relation");
  for (const row of sampleRecords[base.key] ?? []) {
    for (const field of relations) {
      const value = row.fields[field.slug];
      if (value === undefined) continue;
      const target = field.options?.targetBaseSlug;
      for (const referenced of Array.isArray(value) ? value : [value]) {
        if (!keysByBase[target]?.has(referenced)) {
          dangling.push(`${base.key}/${row.key}.${field.slug} -> ${target}/${referenced}`);
        }
      }
    }
  }
}
if (dangling.length > 0) {
  console.error(`Seed rows reference records that do not exist:\n${dangling.join("\n")}`);
  process.exit(1);
}

if (check && stale.length > 0) {
  console.error(
    `content/ is out of date with config.js:\n${stale.map((p) => `  ${p}`).join("\n")}\n\nRun: node scripts/sync-content.mjs`,
  );
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated from config.js.");
