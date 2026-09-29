import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.BUSABASE_BASE_URL;
assert.ok(origin && process.env.BUSABASE_SPACE_ID, "Select the validation server and space in the environment.");
// Exercise the shipped browser providers in Node against the real API. Secrets stay in the environment.
globalThis.window = { location: { origin } };
const originalFetch = globalThis.fetch;
let requests = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.equal(url.origin, new URL(origin).origin);
  assert.equal(request.method, "GET", "The office desks must never mutate the workspace.");
  const limit = url.searchParams.get("limit");
  if (url.pathname === "/api/v1/records") {
    assert.ok(url.searchParams.get("baseId"), "Record reads must name an owned Base.");
    assert.ok(Number(limit) >= 1 && Number(limit) <= 50);
  }
  requests.push({ path: url.pathname, limit: limit ? Number(limit) : null });
  return originalFetch(request);
};

const domains = process.argv.slice(2);
for (const domain of domains.length ? domains : ["admin", "finance", "cashier", "hr", "recruiting", "legal"]) {
  const root = path.join(repository, "templates", `busa-office-${domain}`);
  const manifest = JSON.parse(await readFile(path.join(root, "busabase.json"), "utf8"));
  const app = path.join(root, "content", manifest.template.airapp);
  const { appConfig } = await import(pathToFileURL(path.join(app, "app/js/config.js")).href);
  const { busabaseProvider } = await import(pathToFileURL(path.join(app, "app/js/providers/busabase-provider.js")).href);
  const { createBusabaseClient } = await import(pathToFileURL(path.join(app, "app/vendor/busabase-sdk.js")).href);
  requests = [];
  const state = await busabaseProvider.getState();
  assert.ok(!state.failures?.length && !state.errors?.length, "Every declared source must load.");
  let sampleCount = 0;
  const seedGroups = new Map();
  const recordIds = new Map();
  for (const base of appConfig.bases) {
    const samples = (await readFile(path.join(root, "content", base.key, "records.ndjson"), "utf8"))
      .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const actual = state.records.filter((row) => row.baseKey === base.key);
    assert.equal(actual.length, samples.length, `${manifest.name}/${base.key}: canonical seed rows render`);
    assert.equal(state.totalCount[base.key], samples.length, "Authoritative count agrees with the new install.");
    assert.equal(state.pageInfo[base.key].nextCursor, null);
    for (const sample of samples) {
      const matches = actual.filter(({ fields }) => Object.entries(sample.fields).every(([key, value]) =>
        base.fields.find((field) => field.slug === key)?.type === "relation" ||
        JSON.stringify(fields[key]) === JSON.stringify(value)));
      assert.equal(matches.length, 1, `${manifest.name}/${base.key}: preserve unambiguous seed values`);
      recordIds.set(sample.key, matches[0].id);
    }
    seedGroups.set(base.key, { base, samples, actual });
    sampleCount += samples.length;
  }
  for (const { base, samples, actual } of seedGroups.values()) {
    for (const sample of samples) {
      const record = actual.find((row) => row.id === recordIds.get(sample.key));
      for (const field of base.fields.filter((field) => field.type === "relation")) {
        const expected = sample.fields[field.slug];
        if (!expected) continue;
        const keys = Array.isArray(expected) ? expected : [expected];
        const ids = keys.map((key) => {
          assert.ok(recordIds.has(key), `${manifest.name}: relation names a declared seed`);
          return recordIds.get(key);
        });
        const value = record.fields[field.slug];
        assert.deepEqual(Array.isArray(value) ? value : [value], ids,
          `${manifest.name}/${base.key}: relation resolves to the intended canonical record`);
      }
    }
  }
  const providerRequests = [...requests];
  const client = createBusabaseClient({ baseUrl: origin });
  const nodes = await client.nodes.list({ parentId: null, depth: 3 });
  const flatten = (items) => items.flatMap((node) => [node, ...flatten(node.children || [])]);
  const roots = flatten(nodes).filter((node) => node.type === "folder" &&
    node.metadata.appId === manifest.name && node.metadata.resourceKey === "app-root");
  assert.equal(roots.length, 1);
  const folder = await client.nodes.get({ nodeId: roots[0].id, type: "folder" });
  for (const base of appConfig.bases) {
    const owned = folder.children.filter((node) => node.type === "base" &&
      node.metadata.appId === manifest.name && node.metadata.resourceKey === base.key);
    assert.equal(owned.length, 1);
    const native = await client.bases.get({ baseId: owned[0].baseId });
    const fieldShapes = (fields) => fields.map(({ slug, type }) => ({ slug, type }))
      .sort((left, right) => left.slug.localeCompare(right.slug));
    assert.equal(native.fields[0].slug, base.fields[0].slug, "Preserve the primary display field.");
    assert.deepEqual(fieldShapes(native.fields), fieldShapes(base.fields),
      `${manifest.name}/${base.key}: canonical schema agrees`);
    for (const field of base.fields.filter((field) => field.type === "select")) {
      assert.deepEqual(native.fields.find((candidate) => candidate.slug === field.slug).options.choices.map((choice) => choice.id),
        field.options.choices.map((choice) => choice.id));
    }
  }
  console.log(JSON.stringify({
    template: manifest.name,
    bases: appConfig.bases.length,
    canonicalSampleRows: sampleCount,
    readRequests: providerRequests.length,
    recordRequests: providerRequests.filter((request) => request.path === "/api/v1/records").length,
    maxRecordsPerRequest: Math.max(...providerRequests.map((request) => request.limit || 0)),
    canonicalSchemas: appConfig.bases.length,
    mutationRequests: 0,
  }));
}
