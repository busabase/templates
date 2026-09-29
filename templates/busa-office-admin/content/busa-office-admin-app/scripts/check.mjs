import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { appConfig } from '../app/js/config.js';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(manifest.dependencies['busabase-sdk'], /^\d+\.\d+\.\d+$/);
assert.equal(appConfig.binding, 'runtime');
assert.equal(appConfig.spaceId, undefined);
assert.equal(appConfig.permissions.change_request_procedures.length, 0);
assert.equal(appConfig.bases.length, 4);
for (const base of appConfig.bases) {
  assert.equal(base.readLimit, 50);
  assert.equal(base.nodeId, undefined);
  assert.equal(base.baseId, undefined);
  assert.equal(base.agentPrompts.length, 2);
  const rows = appConfig.demoRecords.filter((row) => row.baseKey === base.key);
  assert.ok(rows.length >= 3 && rows.length <= 5);
  const slugs = new Set(base.fields.map((field) => field.slug));
  for (const row of rows) for (const slug of Object.keys(row.fields)) assert.ok(slugs.has(slug));
}
for (const path of ['app/js/app.js', 'app/js/providers/busabase-provider.js', 'app/js/busabase-client.js']) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Bearer|location\.hostname|__busabase_api__/);
}
assert.ok((await readFile('app/vendor/busabase-sdk.js', 'utf8')).length > 10000);
console.log(`${appConfig.appId}: runtime, SDK pin, 50-row budgets, read-only boundary and 16 schema-valid demo rows passed.`);
