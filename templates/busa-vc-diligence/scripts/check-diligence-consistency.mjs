#!/usr/bin/env node
// Drift guard for the Busa VC Diligence package.
//
// `content/<base>/base.json` is the package's single field declaration. Two
// files mirror parts of it for runtime use and must never disagree:
//   - the AirApp config (content/busa-vc-diligence-app/app/js/config.js)
//     mirrors slug/name/type/required per field, in both its top-level
//     `bases` set and its `schema.bases` set;
//   - the AirApp read model (…/app/js/diligence-model.js) addresses enum
//     choices by id and labels them with the choices' declared names.
// This script fails on any drift, and on a manifest that points at an app
// directory which is not a bootable AirApp.
// Run: node scripts/check-diligence-consistency.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "content", "busa-vc-diligence-app");
const failures = [];
const fail = (msg) => failures.push(msg);

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const manifest = await readJson(path.join(root, "busabase.json"));
const appSlug = manifest.template?.airapp;
if (!appSlug) fail("busabase.json template.airapp is missing");
if (appSlug && appSlug !== "busa-vc-diligence-app") {
  fail(`busabase.json template.airapp is "${appSlug}", expected the shipped app directory name`);
}

const { appConfig } = await import(path.join(appDir, "app/js/config.js"));
const model = await import(path.join(appDir, "app/js/diligence-model.js"));

const blueprint = await readJson(path.join(appDir, "airapp-blueprint.json"));
if (blueprint.app?.slug !== appConfig.appSlug) {
  fail(`blueprint app.slug "${blueprint.app?.slug}" != config appSlug "${appConfig.appSlug}"`);
}
if (appConfig.airApp?.resourceKey !== appConfig.appSlug || appConfig.airApp?.slug !== appConfig.appSlug) {
  fail("config airApp slug/resourceKey must equal appSlug (the shipped app directory name)");
}
if (!Array.isArray(appConfig.schema?.bases) || appConfig.schema.bases.length !== appConfig.bases.length) {
  fail("config.schema.bases must mirror the same bases as config.bases");
}
// Runtime binding: a template ships no workspace ids, anywhere.
if (appConfig.spaceId) fail("config spaceId must be empty for a template (runtime binding)");
for (const b of appConfig.schema?.bases ?? []) {
  if (b.nodeId || b.baseId) fail(`config.schema.bases ${b.key} carries a workspace id`);
}

const choicesOf = (base, fieldSlug) => {
  const field = base.fields.find((f) => f.slug === fieldSlug);
  return new Set((field?.options?.choices ?? []).map((c) => c.id));
};

for (const [setLabel, baseSet] of [["config.bases", appConfig.bases], ["config.schema.bases", appConfig.schema?.bases ?? []]]) {
  for (const baseConfig of baseSet) {
    const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
    if (baseConfig.slug !== `busa-vc-diligence-${baseConfig.key}`) {
      fail(`${setLabel} ${baseConfig.key}: slug "${baseConfig.slug}" is not busa-vc-diligence-${baseConfig.key}`);
    }
    if (baseConfig.localizedName?.en !== base.name) {
      fail(`${setLabel} ${baseConfig.key}: localizedName.en is not base.json's name "${base.name}"`);
    }
    const declared = new Map(base.fields.map((f) => [f.slug, f]));
    for (const field of baseConfig.fields) {
      const d = declared.get(field.slug);
      if (!d) {
        fail(`${setLabel} ${baseConfig.key}: field "${field.slug}" is not declared in base.json`);
        continue;
      }
      for (const attr of ["name", "type", "required"]) {
        if (field[attr] !== d[attr]) {
          fail(`${setLabel} ${baseConfig.key}.${field.slug}: ${attr} is "${field[attr]}", base.json says "${d[attr]}"`);
        }
      }
      if (field.localizedName?.en !== d.name) {
        fail(`${setLabel} ${baseConfig.key}.${field.slug}: localizedName.en is not base.json's name "${d.name}"`);
      }
      declared.delete(field.slug);
    }
    for (const slug of declared.keys()) {
      fail(`${setLabel} ${baseConfig.key}: base.json field "${slug}" is missing from the app config`);
    }
  }
}

// Relation targets: base.json names the package-local base key; both config
// sets must declare that base, and the schema set must point at its
// installed-resource slug.
for (const baseConfig of appConfig.bases) {
  const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
  for (const f of base.fields) {
    const target = f.options?.targetBaseSlug;
    if (f.type === "relation" && target && !appConfig.bases.some((b) => b.key === target)) {
      fail(`base ${baseConfig.key}.${f.slug}: targetBaseSlug "${target}" is not a base in the app config`);
    }
  }
}
for (const baseConfig of appConfig.schema?.bases ?? []) {
  for (const field of baseConfig.fields) {
    if (field.type !== "relation") continue;
    const target = field.options?.targetBaseSlug;
    if (!appConfig.schema.bases.some((b) => b.slug === target)) {
      fail(`config.schema.bases ${baseConfig.key}.${field.slug}: relation target "${target}" is not a sibling base slug`);
    }
  }
}

// Enum labels in the read model are the choices' declared names, and every
// declared choice is labelled (the cockpit and the installed Base must call
// one choice by the same words).
const labelGroups = [
  ["targets", "stage", "stage"],
  ["targets", "source", null],
  ["diligence-requests", "workstream", "workstream"],
  ["diligence-requests", "criticality", "criticality"],
  ["diligence-requests", "status", "requestStatus"],
  ["evidence", "type", "evidenceType"],
  ["evidence", "verification", "verification"],
  ["findings", "severity", "severity"],
  ["findings", "status", "findingStatus"],
  ["interviews", "type", "interviewType"],
  ["interviews", "consistency", "consistency"],
  ["interviews", "credibility", "credibility"],
];
for (const [baseKey, fieldSlug, group] of labelGroups) {
  if (!group) continue;
  const base = await readJson(path.join(root, "content", baseKey, "base.json"));
  const field = base.fields.find((f) => f.slug === fieldSlug);
  for (const choice of field?.options?.choices ?? []) {
    if (model.LABELS.en[group]?.[choice.id] !== choice.name) {
      fail(`diligence-model LABELS.en.${group}["${choice.id}"] is "${model.LABELS.en[group]?.[choice.id]}", base.json says "${choice.name}"`);
    }
  }
  for (const id of Object.keys(model.LABELS.en[group] ?? {})) {
    if (!choicesOf(base, fieldSlug).has(id)) {
      fail(`diligence-model LABELS.en.${group} uses "${id}", not a declared choice of ${baseKey}.${fieldSlug}`);
    }
  }
}

// Installed names are plain English — no CJK in any base.json name,
// description, choice or view.
const CJK = /[一-鿿]/;
const noCjk = (text, where) => {
  if (text && CJK.test(text)) fail(`${where}: "${text}" contains CJK — installed names are plain English`);
};
for (const baseConfig of appConfig.bases) {
  const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
  noCjk(base.name, `base ${baseConfig.key}`);
  noCjk(base.description, `base ${baseConfig.key} description`);
  for (const f of base.fields) {
    noCjk(f.name, `base ${baseConfig.key}.${f.slug}`);
    for (const c of f.options?.choices ?? []) noCjk(c.name, `base ${baseConfig.key}.${f.slug} choice "${c.id}"`);
  }
  for (const v of base.views ?? []) {
    noCjk(v.name, `base ${baseConfig.key} view "${v.slug}"`);
    noCjk(v.description, `base ${baseConfig.key} view "${v.slug}" description`);
  }
}

// Seed rows: at most 50 per Base (validator rule), keys unique, relations
// point at keys that exist in the target Base's rows, and select values are
// declared choices.
const rowsByBase = {};
for (const baseConfig of appConfig.bases) {
  const text = await readFile(path.join(root, "content", baseConfig.key, "records.ndjson"), "utf8").catch(() => "");
  const rows = text.trim() ? text.trim().split("\n").map((line) => JSON.parse(line)) : [];
  if (rows.length > 50) fail(`${baseConfig.key}: ${rows.length} seed rows exceed the 50-row cap`);
  const keys = new Set();
  for (const row of rows) {
    if (keys.has(row.key)) fail(`${baseConfig.key}: duplicate seed key "${row.key}"`);
    keys.add(row.key);
  }
  rowsByBase[baseConfig.key] = rows;
}
for (const baseConfig of appConfig.bases) {
  const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
  const declared = new Map(base.fields.map((f) => [f.slug, f]));
  for (const row of rowsByBase[baseConfig.key]) {
    for (const [slug, value] of Object.entries(row.fields)) {
      const field = declared.get(slug);
      if (!field) {
        fail(`${baseConfig.key} seed "${row.key}": field "${slug}" is not declared`);
        continue;
      }
      if (field.type === "relation") {
        const targetKeys = new Set((rowsByBase[field.options.targetBaseSlug] ?? []).map((r) => r.key));
        for (const k of Array.isArray(value) ? value : [value]) {
          if (!targetKeys.has(k)) fail(`${baseConfig.key} seed "${row.key}": relation ${slug} points at unknown key "${k}"`);
        }
      }
      if (field.type === "select" && !choicesOf(base, slug).has(value)) {
        fail(`${baseConfig.key} seed "${row.key}": ${slug} = "${value}" is not a declared choice`);
      }
    }
    for (const f of base.fields) {
      if (f.required && !(f.slug in row.fields)) {
        fail(`${baseConfig.key} seed "${row.key}": required field "${f.slug}" is missing`);
      }
    }
  }
}

// The app node must exist and be bootable.
const node = await readJson(path.join(appDir, "_node.json"));
if (node.type !== "airapp") fail("app _node.json type is not airapp");
const appPkg = await readJson(path.join(appDir, "package.json"));
if (!appPkg.scripts?.dev) fail("app package.json has no dev script");
if (!/^node server\.js$/.test(appPkg.scripts?.start ?? "")) fail("app package.json start must be exactly `node server.js`");

if (failures.length) {
  console.error(`check-diligence-consistency: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-diligence-consistency: config, read model, base.json, seeds and manifest agree.");
