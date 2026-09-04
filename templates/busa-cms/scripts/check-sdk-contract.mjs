#!/usr/bin/env node
/**
 * Prove this template still matches the busabase-cms-sdk SDK.
 *
 * `app/js/schema.js` is a hand-kept copy of the SDK's `standard` profile — it has
 * to be a copy, because an installed AirApp is a self-contained Node project and
 * cannot resolve a package only the consuming website has. A copy nobody checks is
 * just undetected drift, so this script resolves the real `busabase-cms-sdk` and
 * compares against it in two independent ways:
 *
 *   schema  — the four Base definitions the SDK would provision, field for field
 *   content — every seeded row, parsed by the SDK's own DTO schemas
 *
 * The second check is the one that catches a demo that installs beautifully and
 * then does not show up on the site: a `path` without a leading slash, a missing
 * `schema-version`, a `status` the reader does not serve.
 *
 * What a failure means: a Folder installed from this template is no longer the
 * schema `createBusabaseCms({ folderId })` expects. Depending on the difference the
 * site throws `BusabaseCmsSchemaDriftError` on its first render, or silently
 * provisions the missing field against a live workspace.
 *
 *   npm install && node scripts/check-sdk-contract.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let sdk;
try {
  sdk = await import("busabase-cms-sdk");
} catch (cause) {
  console.error(
    "busabase-cms-sdk is not resolvable from this template.\n" +
      "Run `npm install` in templates/busa-cms first — the check needs the real\n" +
      "package to compare against, and refusing to run beats reporting a pass it\n" +
      "never made.\n",
  );
  console.error(cause.message);
  process.exit(2);
}

const sdkDir = path.join(root, "node_modules/busabase-cms-sdk");
const sdkVersion = await readFile(path.join(sdkDir, "package.json"), "utf8")
  .then((raw) => JSON.parse(raw).version)
  .catch(() => "unknown");

/**
 * `getBusabaseCmsBaseDefinition` is the SDK's own answer to "what does a CMS Base
 * look like" — the single thing worth diffing against. Every published
 * `busabase-cms-sdk` exports it.
 *
 * The SDK was called `busabase-cms` before 0.1.3, and its 0.1.1 built this into
 * the bundle without re-exporting it; this script used to carry a workaround that
 * re-emitted the chunk to reach it. That is gone: the template pins a version that
 * exports it, so the workaround only added a second path nobody takes. If the
 * export ever disappears again, this fails loudly rather than silently checking
 * less.
 */
const resolveBaseDefinition = () =>
  typeof sdk.getBusabaseCmsBaseDefinition === "function"
    ? { fn: sdk.getBusabaseCmsBaseDefinition, via: "package export" }
    : null;

const { CMS_BASES } = await import(path.join(root, "content/busa-cms-app/app/js/schema.js"));
const { sampleRecords } = await import(
  path.join(root, "content/busa-cms-app/lib/sample-content.js")
);

const problems = [];
const show = (value) => JSON.stringify(value);

// ── schema ───────────────────────────────────────────────────────────────────

const definition = resolveBaseDefinition();
if (!definition) {
  console.error(
    `busabase-cms-sdk@${sdkVersion} does not export getBusabaseCmsBaseDefinition, so the\n` +
      "schema half of this check cannot run. Refusing to pass on the content check\n" +
      "alone — pin a busabase-cms-sdk that exports it.",
  );
  process.exit(2);
}

/**
 * The SDK returns relation targets as `targetBaseId`; the template ships
 * `targetBaseSlug`, because it has no ids until install resolves them. Feeding the
 * slug in as the id makes the two comparable without weakening the comparison.
 */
const baseIds = { categories: "categories", tags: "tags" };

const normalizeField = (field) => ({
  slug: field.slug,
  name: field.name,
  type: field.type,
  required: Boolean(field.required),
  options: {
    ...(field.options?.choices
      ? { choices: field.options.choices.map(({ id, name }) => ({ id, name })) }
      : {}),
    ...(field.options?.multiple !== undefined ? { multiple: field.options.multiple } : {}),
    ...(field.options?.attachment ? { attachment: field.options.attachment } : {}),
    // One side calls it a slug, the other an id; the value under comparison is the same.
    ...(field.options?.targetBaseId ? { target: field.options.targetBaseId } : {}),
    ...(field.options?.targetBaseSlug ? { target: field.options.targetBaseSlug } : {}),
  },
});

for (const base of CMS_BASES) {
  const expected = definition.fn(base.role, baseIds);
  if (base.name !== expected.name) {
    problems.push(`${base.role}: Base name is ${show(base.name)}, SDK says ${show(expected.name)}`);
  }
  if (base.description !== expected.description) {
    problems.push(
      `${base.role}: description is ${show(base.description)}, SDK says ${show(expected.description)}`,
    );
  }

  const ours = base.fields.map(normalizeField);
  const theirs = expected.fields.map(normalizeField);
  const ourSlugs = ours.map((f) => f.slug);
  const theirSlugs = theirs.map((f) => f.slug);

  for (const slug of theirSlugs) {
    if (!ourSlugs.includes(slug)) problems.push(`${base.role}.${slug}: missing from the template`);
  }
  for (const slug of ourSlugs) {
    if (!theirSlugs.includes(slug)) {
      problems.push(`${base.role}.${slug}: template has a field the SDK does not provision`);
    }
  }
  if (ourSlugs.length === theirSlugs.length && ourSlugs.join(",") !== theirSlugs.join(",")) {
    problems.push(
      `${base.role}: field order differs — template ${show(ourSlugs)} vs SDK ${show(theirSlugs)}`,
    );
  }
  for (const field of theirs) {
    const mine = ours.find((candidate) => candidate.slug === field.slug);
    if (!mine) continue;
    if (JSON.stringify(mine) !== JSON.stringify(field)) {
      problems.push(
        `${base.role}.${field.slug} differs:\n      template: ${show(mine)}\n      SDK:      ${show(field)}`,
      );
    }
  }
}

for (const role of sdk.BUSABASE_CMS_ROLES ?? []) {
  if (!CMS_BASES.some((base) => base.role === role)) {
    problems.push(`${role}: the SDK provisions this Base and the template does not ship it`);
  }
}

// ── content ──────────────────────────────────────────────────────────────────

/**
 * Only `published` rows are parsed: the DTO schemas describe what the reader
 * serves, and a draft is *supposed* to fail them. Drafts still have to satisfy the
 * Base's own required fields, which install enforces.
 */
const dtoByBase = {
  posts: sdk.postFieldsDTOSchema,
  pages: sdk.pageFieldsDTOSchema,
  categories: sdk.taxonomyFieldsDTOSchema,
  tags: sdk.taxonomyFieldsDTOSchema,
};

let parsed = 0;
for (const [baseKey, rows] of Object.entries(sampleRecords)) {
  const schema = dtoByBase[baseKey];
  if (!schema) continue;
  for (const row of rows) {
    const isTaxonomy = baseKey === "categories" || baseKey === "tags";
    if (!isTaxonomy && row.fields.status !== "published") continue;
    // Relation columns hold package-local keys here; install rewrites them into the
    // record ids the DTO expects, so they are compared as ids-to-be, not resolved.
    const result = schema.safeParse(row.fields);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      problems.push(`${baseKey}/${row.key}: the SDK would reject this row — ${issues}`);
      continue;
    }
    parsed += 1;
  }
}

// ── report ───────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error(`busa-cms does not match busabase-cms-sdk@${sdkVersion}:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nFix content/busa-cms-app/app/js/schema.js (or sample-content.js), then run\n" +
      "`node scripts/sync-content.mjs` to regenerate content/.",
  );
  process.exit(1);
}

const fieldCount = CMS_BASES.reduce((total, base) => total + base.fields.length, 0);
console.log(
  `busa-cms matches busabase-cms-sdk@${sdkVersion} (definitions via ${definition.via}):\n` +
    `  schema   ${CMS_BASES.length} Bases, ${fieldCount} fields, identical\n` +
    `  content  ${parsed} live rows parse against the SDK's own DTO schemas`,
);
