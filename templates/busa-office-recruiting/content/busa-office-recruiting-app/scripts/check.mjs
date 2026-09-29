import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { appConfig } from "../app/js/config.js";
import { seedRecords } from "../app/js/demo-data.js";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(pkg.dependencies["busabase-sdk"], "0.90.2");
assert.equal(appConfig.binding, "runtime");
assert.equal(appConfig.readOnly, true);
assert(!appConfig.spaceId);
for (const b of appConfig.bases) {
  assert(!b.baseId && !b.nodeId);
  assert(b.slug && b.key);
  assert(b.readLimit > 0 && b.readLimit <= 50);
  assert(seedRecords[b.key].length <= 50);
  for (const r of seedRecords[b.key])
    for (const k of Object.keys(r.fields))
      assert(
        b.fields.some((f) => f.slug === k),
        k,
      );
}
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) {
      if (e.name !== "vendor") await walk(p);
    } else if (/\.(js|html)$/.test(p)) {
      const s = await readFile(p, "utf8");
      assert(
        !/location\.hostname|__busabase_api__|autoMerge|records\.changeRequest|Bearer /.test(
          s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
        ),
        p,
      );
      if (p.endsWith(".html")) assert(!/(?:src|href)="\//.test(s), p);
    }
  }
}
await walk("app");
assert(
  (await readFile("app/js/busabase-client.js", "utf8")).includes(
    "window.location.origin",
  ),
);
assert(
  (await readFile("app/js/providers/busabase-provider.js", "utf8")).includes(
    "inspectProvisionedResources",
  ),
);
console.log("Runtime, isolation, seed and budget checks passed");
