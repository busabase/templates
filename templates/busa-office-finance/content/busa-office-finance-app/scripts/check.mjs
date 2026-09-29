import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { appConfig } from "../app/js/config.js";
import { samples } from "../app/js/samples.js";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const pkg = JSON.parse(await read("package.json"));
const blueprint = JSON.parse(await read("airapp-blueprint.json"));
for (const base of appConfig.bases) {
  const declared = blueprint.workspace.bases.find((b) => b.key === base.key);
  assert.equal(declared.read_limit, base.readLimit);
  assert.deepEqual(declared.fields, base.fields);
  assert.deepEqual(declared.views, base.views);
}
assert.equal(pkg.dependencies["busabase-sdk"], "0.90.2");
assert.equal(pkg.scripts.dev, "node server.js");
assert.equal(appConfig.binding, "runtime");
assert.equal(appConfig.spaceId, undefined);
assert.equal(appConfig.permissions.writeProcedures.length, 0);
for (const base of appConfig.bases) {
  assert(!base.baseId && !base.nodeId);
  assert(base.slug && base.resourceKey === base.key);
  assert(base.readLimit >= 1 && base.readLimit <= 50);
  assert(samples[base.key].length >= 3 && samples[base.key].length <= 5);
  for (const row of samples[base.key]) {
    for (const [key, value] of Object.entries(row.fields)) {
      const field = base.fields.find((f) => f.slug === key);
      assert(field, "Unknown sample field " + key);
      if (field.type === "number")
        assert(value === null || Number.isFinite(value));
      if (field.type === "relation" && value)
        assert(
          Object.values(samples)
            .flat()
            .some((r) => r.key === value),
        );
    }
    for (const f of base.fields.filter((f) => f.required))
      assert(row.fields[f.slug]);
  }
  for (const f of base.fields.filter((f) => f.type === "relation"))
    assert(appConfig.bases.some((b) => b.slug === f.options.targetBaseSlug));
}
const app = await read("app/js/app.js"),
  provider = await read("app/js/providers/busabase-provider.js"),
  client = await read("app/js/busabase-client.js"),
  server = await read("server.js"),
  html = await read("app/index.html");
assert(client.includes("window.location.origin"));
assert(provider.includes("inspectProvisionedResources"));
assert(/limit:\s*base\.readLimit/.test(provider));
assert(!/while\s*\(/.test(provider));
assert(/normalize\(r,\s*base\.key\)/.test(provider));
assert(app.includes("createAirAppConnectGate"));
assert(server.includes("describeBusabaseAirAppRuntime"));
assert(server.includes("createBusabaseAirAppLocalGateway"));
assert(!(app + provider + client).includes("BUSABASE_API_KEY"));
assert(
  !/location.hostname|localStorage|sessionStorage/.test(
    app + provider + client,
  ),
);
assert(!/(src|href)="\//.test(html));
console.log(
  "Runtime, data budget, sample schema, relation and security checks passed.",
);
