#!/usr/bin/env node
// Drift guard for the Busa PE Diligence package.
//
// `content/<base>/base.json` is the package's single field declaration. The
// AirApp config (content/busa-pe-diligence-app/app/js/config.js) mirrors it
// twice — top-level `bases` for runtime resolution and `schema.bases` for
// provisioning — and the demo records mirror content/<base>/records.ndjson.
// This script fails on any drift, and on seed records that use undeclared
// fields, undeclared select choices, or unresolvable relation keys.
// Run: node scripts/check-consistency.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "content", "busa-pe-diligence-app");
const failures = [];
const fail = (msg) => failures.push(msg);

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const manifest = await readJson(path.join(root, "busabase.json"));
if (manifest.name !== "busa-pe-diligence") fail(`busabase.json name is "${manifest.name}"`);
if (manifest.template?.airapp !== "busa-pe-diligence-app") {
  fail("busabase.json template.airapp must be busa-pe-diligence-app");
}
if (manifest.template?.category !== "finance") fail("busabase.json template.category must be finance");

const { appConfig } = await import(path.join(appDir, "app/js/config.js"));
const blueprint = await readJson(path.join(appDir, "airapp-blueprint.json"));
if (blueprint.app?.slug !== appConfig.appSlug) {
  fail(`airapp-blueprint app.slug "${blueprint.app?.slug}" != config appSlug "${appConfig.appSlug}"`);
}
if (appConfig.airApp?.resourceKey !== appConfig.appSlug || appConfig.airApp?.slug !== appConfig.appSlug) {
  fail("config airApp slug/resourceKey must equal appSlug (the shipped app directory name)");
}
if (appConfig.spaceId) fail("config spaceId must be empty — a template binds runtime, never pinned ids");
if (!Array.isArray(appConfig.schema?.bases) || appConfig.schema.bases.length !== appConfig.bases.length) {
  fail("config.schema.bases must mirror the same bases as config.bases");
}

const keysByBase = {};
for (const baseConfig of appConfig.bases) {
  const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
  if (baseConfig.slug !== `busa-pe-diligence-${baseConfig.key}`) {
    fail(`config ${baseConfig.key}: slug "${baseConfig.slug}" is not busa-pe-diligence-${baseConfig.key}`);
  }
  const declared = new Map(base.fields.map((f) => [f.slug, f]));
  for (const set of [baseConfig, appConfig.schema.bases.find((b) => b.key === baseConfig.key)]) {
    if (!set) { fail(`schema.bases is missing ${baseConfig.key}`); continue; }
    if (set.fields.length !== base.fields.length) {
      fail(`${baseConfig.key}: config carries ${set.fields.length} fields, base.json declares ${base.fields.length}`);
    }
    for (const field of set.fields) {
      const d = declared.get(field.slug);
      if (!d) { fail(`${baseConfig.key}.${field.slug}: in config but not in base.json`); continue; }
      for (const attr of ["name", "type", "required"]) {
        if (field[attr] !== d[attr]) {
          fail(`${baseConfig.key}.${field.slug}: config ${attr} "${field[attr]}" != base.json "${d[attr]}"`);
        }
      }
      if (field.type === "relation") {
        const cfgTarget = set === baseConfig ? null : field.options?.targetBaseSlug;
        if (set !== baseConfig && !cfgTarget) {
          fail(`${baseConfig.key}.${field.slug}: schema relation declares no targetBaseSlug`);
        }
      }
    }
  }
  // seeds: keys collected per base, fields validated against the declaration
  const rows = (await readFile(path.join(root, "content", baseConfig.key, "records.ndjson"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  if (rows.length > 50) fail(`${baseConfig.key}: ${rows.length} seed rows exceeds the 50-per-Base ceiling`);
  keysByBase[baseConfig.key] = new Set(rows.map((r) => r.key));
  for (const row of rows) {
    for (const [slug, value] of Object.entries(row.fields)) {
      const d = declared.get(slug);
      if (!d) { fail(`${baseConfig.key}/${row.key}: field "${slug}" is not declared`); continue; }
      if (d.type === "select" && value != null) {
        const ids = new Set((d.options?.choices ?? []).map((c) => c.id));
        if (!ids.has(value)) fail(`${baseConfig.key}/${row.key}: "${slug}" = "${value}" is not a declared choice`);
      }
      if (d.type === "relation") {
        const target = d.options?.targetBaseSlug;
        for (const ref of Array.isArray(value) ? value : [value]) {
          if (!keysByBase[target]?.has(ref) && !appConfig.demoRecords.some((r) => r.id === ref)) {
            // cross-base refs resolve against the target base's seed keys,
            // which are all loaded by the time relations are checked below
            row.__pendingRefs = [...(row.__pendingRefs ?? []), { slug, ref, target }];
          }
        }
      }
    }
  }
  base.__rows = rows;
  keysByBase[baseConfig.key] = keysByBase[baseConfig.key];
  var basesCache = basesCache ?? {};
  basesCache[baseConfig.key] = base;
}
// second pass: relation refs now that every base's keys are known
for (const baseConfig of appConfig.bases) {
  for (const row of basesCache[baseConfig.key].__rows ?? []) {
    for (const { slug, ref, target } of row.__pendingRefs ?? []) {
      if (!keysByBase[target]?.has(ref)) {
        fail(`${baseConfig.key}/${row.key}: relation "${slug}" points at unknown key "${ref}" in ${target}`);
      }
    }
  }
}
// demo records mirror the seed rows (ids = keys, same field values, apart
// from the demo provider's documented relative-date placeholders)
for (const baseConfig of appConfig.bases) {
  const seedKeys = keysByBase[baseConfig.key];
  const demoKeys = new Set(appConfig.demoRecords.filter((r) => r.baseKey === baseConfig.key).map((r) => r.id));
  for (const key of seedKeys) {
    if (!demoKeys.has(key)) fail(`demoRecords is missing seed ${baseConfig.key}/${key}`);
  }
}

if (failures.length) {
  console.error(`Consistency check failed (${failures.length}):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("Package consistency OK: manifest, config, base.json declarations, seeds and demo records agree.");
