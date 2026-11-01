#!/usr/bin/env node
// Drift guard for the Busa LinkedIn Desk package.
//
// `content/<base>/base.json` is the package's single field declaration. Two
// files mirror parts of it for runtime use and must never disagree:
//   - the AirApp config (content/busa-linkedin-desk-app/app/js/config.js)
//     mirrors slug/name/type/required per field, plus a `localizedName`
//     carrying the Chinese rendering of every (plain-English) name;
//   - the AirApp read model (…/app/js/desk-model.js) addresses enum choices
//     by id (intent / approval-status / status / type / direction) and
//     labels them with the choices' localized names.
// This script fails on any drift, and on a manifest that points at an app
// directory which is not a bootable AirApp. Run: node scripts/check-desk-consistency.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(root, "content", "busa-linkedin-desk-app");
const failures = [];
const fail = (msg) => failures.push(msg);

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const manifest = await readJson(path.join(root, "busabase.json"));
const appSlug = manifest.template?.airapp;
if (!appSlug) fail("busabase.json template.airapp is missing");
if (appSlug && appSlug !== "busa-linkedin-desk-app") {
  fail(`busabase.json template.airapp is "${appSlug}", expected the shipped app directory name`);
}

const { appConfig } = await import(path.join(appDir, "app/js/config.js"));
const model = await import(path.join(appDir, "app/js/desk-model.js"));

// The config carries the same bases twice: top-level `bases` is what the
// SDK's inspectProvisionedResources resolves at runtime, `schema.bases` is
// the shape the app-creator scaffold check reads. Both must mirror base.json.
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

const choicesOf = (base, fieldSlug) => {
  const field = base.fields.find((f) => f.slug === fieldSlug);
  return new Set((field?.options?.choices ?? []).map((c) => c.id));
};

for (const [setLabel, baseSet] of [["config.bases", appConfig.bases], ["config.schema.bases", appConfig.schema?.bases ?? []]]) {
  for (const baseConfig of baseSet) {
    const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
    if (baseConfig.slug !== `busa-linkedin-desk-${baseConfig.key}`) {
      fail(`${setLabel} ${baseConfig.key}: slug "${baseConfig.slug}" is not busa-linkedin-desk-${baseConfig.key}`);
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
      declared.delete(field.slug);
    }
    for (const slug of declared.keys()) {
      fail(`${setLabel} ${baseConfig.key}: base.json field "${slug}" is missing from the app config`);
    }
  }
}

// Relation targets: base.json names the package-local base key; both config
// sets must declare that base, and the schema set must point at its
// installed-resource slug (the namespace the scaffold check resolves).
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

// Enum ids the read model addresses, checked against the declared choices.
const enumChecks = [
  ["messages", "intent", Object.keys(model.LABELS.en.intent)],
  ["experience", "type", Object.keys(model.LABELS.en.experienceType)],
  ["actions", "type", Object.keys(model.LABELS.en.actionType)],
  ["replies", "approval-status", ["pending"]],
  ["messages", "status", ["pending-triage", "no-action"]],
  ["messages", "direction", ["in", "out"]],
  ["actions", "status", ["open", "in-progress"]],
  ["experience", "status", ["candidate"]],
];
for (const [baseKey, fieldSlug, ids] of enumChecks) {
  const base = await readJson(path.join(root, "content", baseKey, "base.json"));
  const choices = choicesOf(base, fieldSlug);
  for (const id of ids) {
    if (!choices.has(id)) fail(`desk-model uses ${baseKey}.${fieldSlug} = "${id}", not a declared choice`);
  }
}

// Localization completeness. Installed names are plain English — no CJK,
// no slash-bilingual remnant. The Chinese rendering of a name lives only
// in the app config's `localizedName`: its `en` half must be the base.json
// name verbatim, its `zh-CN` half the corresponding Chinese name (CJK,
// or the name itself when it is a language-neutral token). The read
// model's English labels are the choice names themselves; its zh-CN
// labels are the Chinese names, so the console and the installed Base
// can never call one choice by two different English words.
const CJK = /[一-鿿]/;
const pureEnglish = (name, where) => {
  if (CJK.test(name)) fail(`${where}: name "${name}" contains CJK — installed names are plain English`);
  if (String(name).includes(" / ")) fail(`${where}: name "${name}" still has a slash-bilingual separator`);
};
const noCjkText = (text, where) => {
  if (text && CJK.test(text)) fail(`${where}: text contains CJK — installed descriptions are plain English`);
};
const validZh = (zh, en) => typeof zh === "string" && zh.length > 0 && (CJK.test(zh) || zh === en);

for (const baseConfig of appConfig.bases) {
  const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
  pureEnglish(base.name, `base ${baseConfig.key}`);
  noCjkText(base.description, `base ${baseConfig.key} description`);
  for (const f of base.fields) {
    pureEnglish(f.name, `base ${baseConfig.key}.${f.slug}`);
    for (const c of f.options?.choices ?? []) {
      pureEnglish(c.name, `base ${baseConfig.key}.${f.slug} choice "${c.id}"`);
    }
  }
  for (const v of base.views ?? []) {
    pureEnglish(v.name, `base ${baseConfig.key} view "${v.slug}"`);
    noCjkText(v.description, `base ${baseConfig.key} view "${v.slug}" description`);
  }
}

const checkLoc = (loc, enName, where) => {
  if (!loc || loc.en !== enName) {
    fail(`${where}: localizedName.en "${loc?.en}" is not base.json's name "${enName}" verbatim`);
  }
  if (!validZh(loc?.["zh-CN"], enName)) {
    fail(`${where}: localizedName["zh-CN"] "${loc?.["zh-CN"]}" is not the corresponding Chinese name`);
  }
};
for (const [setLabel, baseSet] of [["config.bases", appConfig.bases], ["config.schema.bases", appConfig.schema?.bases ?? []]]) {
  for (const baseConfig of baseSet) {
    const base = await readJson(path.join(root, "content", baseConfig.key, "base.json"));
    checkLoc(baseConfig.localizedName, base.name, `${setLabel} ${baseConfig.key}`);
    const declared = new Map(base.fields.map((f) => [f.slug, f]));
    for (const field of baseConfig.fields) {
      const d = declared.get(field.slug);
      if (d) checkLoc(field.localizedName, d.name, `${setLabel} ${baseConfig.key}.${field.slug}`);
    }
  }
}

const labelChecks = [
  ["messages", "intent", model.LABELS, "intent"],
  ["experience", "type", model.LABELS, "experienceType"],
  ["actions", "type", model.LABELS, "actionType"],
];
for (const [baseKey, fieldSlug, labels, group] of labelChecks) {
  const base = await readJson(path.join(root, "content", baseKey, "base.json"));
  const field = base.fields.find((f) => f.slug === fieldSlug);
  for (const choice of field?.options?.choices ?? []) {
    if (labels.en[group][choice.id] !== choice.name) {
      fail(`desk-model LABELS.en.${group}["${choice.id}"] is "${labels.en[group][choice.id]}", base.json says "${choice.name}"`);
    }
    if (!validZh(labels["zh-CN"][group][choice.id], choice.name)) {
      fail(`desk-model LABELS["zh-CN"].${group}["${choice.id}"] is "${labels["zh-CN"][group][choice.id]}", not the choice's Chinese name`);
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
  console.error(`check-desk-consistency: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-desk-consistency: config, read model, base.json and manifest agree.");
