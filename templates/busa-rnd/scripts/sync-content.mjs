#!/usr/bin/env node
/**
 * Regenerate this template's `content/` from the AirApp's own declaration, or
 * verify it is current.
 *
 *   node scripts/sync-content.mjs           # rewrite the generated files
 *   node scripts/sync-content.mjs --check   # exit non-zero if anything drifted
 *
 * Source: `content/busa-rnd-app/app/js/config.js` (Bases, fields, views, node
 * prompts) and `app/js/demo-data.js` (sample rows). Generated:
 * `content/<base>/base.json`, `content/<base>/records.ndjson`,
 * `content/_folder.json` and the AirApp's `_node.json`. Never hand-edit those —
 * install reads them while the app reads its config, and drift between the two
 * is silent.
 *
 * Every sample row is validated against the schema before anything is
 * written: unknown fields, choice values that are not a declared id, relations
 * that point at no row, and malformed dates all fail the run.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, 'content/busa-rnd-app');
const { appConfig } = await import(pathToFileURL(resolve(app, 'app/js/config.js')).href);
const { demoRecords } = await import(pathToFileURL(resolve(app, 'app/js/demo-data.js')).href);
const check = process.argv.includes('--check');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Busabase's select palette, by the tone the app gives each choice.
const COLOR = { positive: 'emerald', warning: 'amber', danger: 'rose', accent: 'cyan', neutral: 'slate' };
const keyBySlug = new Map(appConfig.bases.map((base) => [base.slug, base.key]));

// ── Validate the sample rows against the declaration ─────────────────────────
const problems = [];
const keysByBase = new Map(appConfig.bases.map((base) => [base.key, new Set((demoRecords[base.key] || []).map((row) => row.key))]));
const allKeys = new Set();
for (const base of appConfig.bases) {
  const rows = demoRecords[base.key] || [];
  if (rows.length > 50) problems.push(`${base.key}: ${rows.length} rows (max 50)`);
  const fields = new Map(base.fields.map((item) => [item.slug, item]));
  for (const row of rows) {
    if (allKeys.has(row.key)) problems.push(`${base.key}: duplicate key ${row.key}`);
    allKeys.add(row.key);
    for (const item of base.fields) if (item.required && !row.fields[item.slug]) problems.push(`${row.key}: required ${item.slug} is empty`);
    for (const [slug, value] of Object.entries(row.fields)) {
      const declared = fields.get(slug);
      if (!declared) { problems.push(`${row.key}: unknown field ${slug}`); continue; }
      if (declared.type === 'select' && !declared.options.choices.some((choice) => choice.id === value)) problems.push(`${row.key}.${slug}: "${value}" is not a choice id`);
      if (declared.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push(`${row.key}.${slug}: "${value}" is not YYYY-MM-DD`);
      if (declared.type === 'url' && !/^https:\/\//.test(value)) problems.push(`${row.key}.${slug}: not an https URL`);
      if (declared.type === 'relation') {
        const targets = keysByBase.get(keyBySlug.get(declared.options.targetBaseSlug));
        const values = Array.isArray(value) ? value : [value];
        if (Array.isArray(value) !== Boolean(declared.options.multiple)) problems.push(`${row.key}.${slug}: ${declared.options.multiple ? 'multiple relation needs an array' : 'single relation needs one key'}`);
        for (const target of values) if (!targets?.has(target)) problems.push(`${row.key}.${slug}: no row "${target}" in ${declared.options.targetBaseSlug}`);
      }
    }
  }
}
if (problems.length) {
  console.error(`Sample rows do not match the schema:\n${problems.map((item) => `  ${item}`).join('\n')}`);
  process.exit(1);
}

// ── Generate ─────────────────────────────────────────────────────────────────
const targets = new Map();
const packageField = (item, position) => {
  const options = { ...item.options };
  if (item.type === 'relation') {
    const target = keyBySlug.get(options.targetBaseSlug);
    if (!target) throw new Error(`${item.slug} targets ${options.targetBaseSlug}, which is not a Base in this package.`);
    options.targetBaseSlug = target;
  }
  if (options.choices) options.choices = options.choices.map(({ id, name, tone }) => ({ id, name, color: COLOR[tone] || COLOR.neutral }));
  return { slug: item.slug, name: item.name, type: item.type, required: Boolean(item.required), position, options };
};
for (const [position, base] of appConfig.bases.entries()) {
  targets.set(`content/${base.key}/base.json`, json({
    name: base.name,
    description: base.description,
    position,
    agentPrompts: base.agentPrompts,
    fields: base.fields.map(packageField),
    views: base.views,
  }));
  targets.set(`content/${base.key}/records.ndjson`, (demoRecords[base.key] || []).map((row) => JSON.stringify({ key: row.key, fields: row.fields })).join('\n') + '\n');
}
targets.set('content/_folder.json', json({ name: appConfig.folder.name, description: appConfig.folder.description, agentPrompts: appConfig.folderPrompts }));
targets.set('content/busa-rnd-app/_node.json', json({ type: 'airapp', name: appConfig.airApp.name, description: appConfig.folder.description, position: appConfig.bases.length, agentPrompts: appConfig.folderPrompts }));

const stale = [];
for (const [relative, content] of targets) {
  const target = resolve(root, relative);
  if (check) {
    if ((await readFile(target, 'utf8').catch(() => '')) !== content) stale.push(relative);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
if (stale.length) {
  console.error(`Generated files drifted from config.js:\n${stale.map((item) => `  ${item}`).join('\n')}\nRun: node scripts/sync-content.mjs`);
  process.exit(1);
}
const rows = Object.values(demoRecords).reduce((sum, list) => sum + list.length, 0);
console.log(`busa-rnd: ${check ? 'verified' : 'generated'} ${targets.size} files from config.js; ${rows} sample rows match the schema.`);
