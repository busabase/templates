// Static checks for the AirApp contract. Run with `npm run check`.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { appConfig } from '../app/js/config.js';
import { demoRecords } from '../app/js/demo-data.js';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(manifest.dependencies['busabase-sdk'], /^\d+\.\d+\.\d+$/, 'busabase-sdk is pinned to an exact version');
assert.ok(manifest.scripts.dev, 'package.json has a dev script');
assert.equal(appConfig.binding, 'runtime');
assert.equal(appConfig.spaceId, undefined, 'a template never ships a Space id');
assert.equal(appConfig.permissions.change_request_procedures.length, 0, 'read-only app');
assert.equal(appConfig.bases.length, 6);
for (const base of appConfig.bases) {
  assert.ok(base.readLimit >= 1 && base.readLimit <= 50, `${base.key} readLimit within 1–50`);
  assert.equal(base.nodeId, undefined); assert.equal(base.baseId, undefined);
  assert.equal(base.slug, `${appConfig.appId}-${base.key}`, `${base.key} keeps its provisioning slug`);
  assert.ok(base.agentPrompts.length >= 2 && base.agentPrompts.length <= 5, `${base.key} has 2–5 prompts`);
  assert.ok((demoRecords[base.key] || []).length >= 2, `${base.key} has sample rows`);
}
for (const source of appConfig.sources) {
  const base = appConfig.bases.find((item) => item.key === source.base);
  assert.ok(base, `${source.key} reads a declared Base`);
  assert.ok(source.limit <= base.readLimit, `${source.key} stays within ${base.key}'s budget`);
  if (source.sort) assert.equal(source.sort.fieldType, 'date', `${source.key} sorts on a typed date field (untyped sorts are ignored by the server)`);
}
for (const path of ['app/js/app.js', 'app/js/screens.js', 'app/js/providers/busabase-provider.js', 'app/js/busabase-client.js']) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Bearer|location\.hostname|__busabase_api__/, `${path} has no credential or hostname sniffing`);
}
const css = await readFile('app/rnd.css', 'utf8');
assert.doesNotMatch(css, /auto-fit|auto-fill/, 'metrics never wrap');
assert.ok((await readFile('app/vendor/busabase-sdk.js', 'utf8')).length > 10000, 'SDK bundle present');
console.log(`${appConfig.appId}: runtime binding, SDK pin, read budgets, read-only boundary and sample rows passed.`);
