import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = ["admin", "finance", "cashier", "hr", "recruiting", "legal"];
const json = async (file) => JSON.parse(await readFile(file, "utf8"));

for (const domain of names) {
  const name = `busa-office-${domain}`;
  const root = path.join(repository, "templates", name);
  const manifest = await json(path.join(root, "busabase.json"));
  assert.equal(manifest.name, name);
  const app = path.join(root, "content", manifest.template.airapp);
  const ignore = await readFile(path.join(app, ".busabaseignore"), "utf8");
  assert.ok(ignore.includes(".env*") && ignore.includes("*.log"), `${name}: exclude local credentials and logs`);
  const { appConfig } = await import(pathToFileURL(path.join(app, "app/js/config.js")).href);
  assert.equal(appConfig.appId, name);
  assert.equal(appConfig.readOnly, true, `${name}: the public desk is read-only`);
  assert.ok(!appConfig.spaceId, `${name}: no author space binding`);
  assert.ok(!appConfig.folder.nodeId, `${name}: no author folder binding`);
  assert.ok(manifest.template.agentPrompts.length >= 2);
  assert.equal(manifest.template.screenshots[0], "assets/screenshots/cover.webp");

  let sampleCount = 0;
  for (const declaration of appConfig.bases) {
    assert.ok(!declaration.baseId && !declaration.nodeId);
    assert.ok(Number.isInteger(declaration.readLimit));
    assert.ok(declaration.readLimit >= 1 && declaration.readLimit <= 50);
    const baseRoot = path.join(root, "content", declaration.key);
    const base = await json(path.join(baseRoot, "base.json"));
    assert.deepEqual(
      base.fields.map(({ slug, type }) => ({ slug, type })),
      declaration.fields.map(({ slug, type }) => ({ slug, type })),
      `${name}/${declaration.key}: installation and runtime declarations agree`,
    );
    assert.ok(base.agentPrompts?.length >= 2, `${name}/${declaration.key}: specific prompts`);
    assert.ok(base.views?.length, `${name}/${declaration.key}: native workflow views`);
    const rows = (await readFile(path.join(baseRoot, "records.ndjson"), "utf8"))
      .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(rows.length >= 3 && rows.length <= 50);
    assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
    const fields = new Map(base.fields.map((field) => [field.slug, field]));
    for (const { fields: values } of rows) {
      for (const field of base.fields) {
        if (field.required) assert.ok(values[field.slug] !== undefined && values[field.slug] !== "");
      }
      for (const [key, value] of Object.entries(values)) {
        assert.ok(fields.has(key), `${name}/${declaration.key}: undeclared sample field ${key}`);
        const field = fields.get(key);
        if (value === null || value === "") continue;
        if (field.type === "number") assert.ok(typeof value === "number" && Number.isFinite(value));
        if (field.type === "checkbox") assert.equal(typeof value, "boolean");
        if (field.type === "date") assert.ok(typeof value === "string" && Number.isFinite(Date.parse(value)));
        if (field.type === "select") {
          assert.ok(field.options.choices.some((choice) => choice.id === value), `${name}: invalid choice ${value}`);
        }
      }
    }
    sampleCount += rows.length;
  }
  for (const sidecar of ["_folder.json", `${manifest.template.airapp}/_node.json`]) {
    const node = await json(path.join(root, "content", sidecar));
    assert.ok(node.agentPrompts?.length >= 2, `${name}/${sidecar}: specific prompts`);
  }
  console.log(`${name}: ${appConfig.bases.length} Bases, ${sampleCount} schema-valid sample rows`);
}
