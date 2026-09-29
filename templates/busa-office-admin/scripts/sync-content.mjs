import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(await readFile(resolve(root, 'references/workflow.json'), 'utf8'));
const check = process.argv.includes('--check');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const localized = (en, zh) => ({ en, 'zh-CN': zh });
const prompts = (jobs) => jobs.map((job, index) => ({
  key: `scenario-${index + 1}`,
  label: job.en.length <= 80 ? job : spec.name.endsWith('-hr')
    ? (index === 0 ? localized('Review salary and payroll inputs', '复核薪酬与工资输入') : localized('Review labor contract renewals', '复核劳动合同续签'))
    : (index === 0 ? localized('Review certificate and contract renewals', '复核证照与合同续期') : localized('Trace conflicting source evidence', '追溯冲突的原件证据')),
  intent: 'read-only',
  body: localized(`Read the ${spec.name} skill in this folder and follow its workflow.\n\n{target}\n\n${job.en}. Identify evidence gaps and draft proposed changes only when requested.`, `先阅读本文件夹的 ${spec.name} Skill，遵循其流程。\n\n{target}\n\n${job['zh-CN']}。指出证据缺口，只有用户要求时才拟定变更申请。`),
}));
const bases = spec.bases.map((base) => ({
  key: base.key, name: base.name.en, localizedName: base.name,
  slug: `${spec.name}-${base.key}`, description: base.job.en, localizedDescription: base.job,
  readLimit: 50, primary: base.primary, secondary: base.secondary, status: base.status,
  attention: base.attention, date: base.date, agentPrompts: prompts(base.prompts),
  fields: base.fields.map(([slug, en, zh, type, choices], position) => ({
    slug, name: en, localizedName: localized(en, zh), type, required: position === 0, position,
    options: choices ? { choices: choices.map(([id, name, chinese]) => ({ id, name, localizedName: localized(name, chinese) })) } : {},
  })),
  views: [
    { slug: 'all', name: `${base.name.en} / ${base.name['zh-CN']}`, description: base.job.en, type: 'table', config: { filters: [], sorts: [{ fieldSlug: base.date, direction: 'asc' }], visibleFieldSlugs: [base.primary, ...base.secondary, base.status] } },
    { slug: 'review', name: 'Priority queue / 优先处理', description: `Focus on the ${base.attention[0]} state`, type: 'table', config: { filters: [{ fieldSlug: base.status, operator: 'equals', value: base.attention[0] }], sorts: [{ fieldSlug: base.date, direction: 'asc' }], visibleFieldSlugs: [base.primary, ...base.secondary, base.status] } },
  ],
}));
const demoRecords = spec.bases.flatMap((base, index) => base.rows.map((fields, row) => ({ id: `recdemo${String(index).padStart(6, '0')}${String(row).padStart(6, '0')}`, baseKey: base.key, fields })));
const config = {
  appId: spec.name, appSlug: spec.name, appName: spec.title.en, title: spec.title,
  description: spec.description.en, localizedDescription: spec.description,
  deployment: 'cloud', binding: 'runtime', readOnly: true, schemaVersion: 1,
  locale: 'en', brand: { accent: spec.accent }, asOf: spec.asOf,
  folder: { name: spec.title.en, slug: spec.name, description: spec.description.en },
  airApp: { name: spec.title.en, slug: `${spec.name}-app`, resourceKey: `${spec.name}-app` },
  bases, schema: { bases },
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; installed Bases are the workflow.' },
  ui: { summary: spec.summary, primary_base: bases[0].key }, boundary: spec.boundary, demoRecords,
};
const targets = new Map();
targets.set(`content/${spec.name}-app/app/js/config.js`, `export const appConfig = ${JSON.stringify(config, null, 2)};\n`);
targets.set(`content/${spec.name}-app/airapp-blueprint.json`, json({ app: { slug: spec.name }, route: 'package-first', binding: 'runtime', workspace: { bases: bases.map((base) => ({ key: base.key, slug: base.slug, read_limit: base.readLimit })) }, dataBudgets: 'One 50-row page per Base; one continuation page on explicit action. No unrequested background scans.', actions: [], onboarding: config.onboarding }));
targets.set('content/_folder.json', json({ name: `${spec.title.en} / ${spec.title['zh-CN']}`, description: spec.description.en, agentPrompts: prompts(spec.prompts) }));
targets.set(`content/${spec.name}-app/_node.json`, json({ type: 'airapp', name: `${spec.title.en} / ${spec.title['zh-CN']}`, description: spec.description.en, position: bases.length, agentPrompts: prompts(spec.prompts) }));
for (const [index, base] of bases.entries()) {
  const fields = base.fields.map(({ localizedName, ...field }) => ({
    ...field, name: `${field.name} / ${localizedName['zh-CN']}`,
    options: { ...field.options, ...(field.options.choices ? { choices: field.options.choices.map(({ localizedName: _locale, ...choice }) => choice) } : {}) },
  }));
  targets.set(`content/${base.key}/base.json`, json({ name: `${base.name} / ${base.localizedName['zh-CN']}`, description: base.description, position: index, fields, views: base.views, agentPrompts: base.agentPrompts }));
  targets.set(`content/${base.key}/records.ndjson`, spec.bases[index].rows.map((fields, row) => JSON.stringify({ key: `${base.key}-${row + 1}`, fields })).join('\n') + '\n');
}
const stale = [];
for (const [relative, content] of targets) {
  const target = resolve(root, relative);
  if (check) { if (await readFile(target, 'utf8').catch(() => '') !== content) stale.push(relative); }
  else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); }
}
if (stale.length) throw new Error(`Generated files drifted: ${stale.join(', ')}. Run node scripts/sync-content.mjs.`);
console.log(`${spec.name}: ${check ? 'verified' : 'generated'} ${targets.size} files, ${demoRecords.length} sample records.`);
