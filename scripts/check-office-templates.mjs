import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = ["admin", "finance", "cashier", "hr", "recruiting", "legal"];
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const bilingual = (value, label) => {
  assert.ok(typeof value === "string" && /[A-Za-z]/.test(value) && /[\u3400-\u9fff]/.test(value),
    `${label}: English and Simplified Chinese copy required`);
};
const localizedPrompts = (prompts, label) => {
  for (const prompt of prompts) {
    for (const part of ["label", "body"]) {
      assert.ok(typeof prompt[part]?.en === "string" && prompt[part].en.trim(), `${label}/${prompt.key}: English ${part}`);
      assert.ok(typeof prompt[part]?.["zh-CN"] === "string" && /[\u3400-\u9fff]/.test(prompt[part]["zh-CN"]),
        `${label}/${prompt.key}: Chinese ${part}`);
    }
  }
};

for (const domain of names) {
  const name = `busa-office-${domain}`;
  const root = path.join(repository, "templates", name);
  const manifest = await json(path.join(root, "busabase.json"));
  assert.equal(manifest.name, name);
  const app = path.join(root, "content", manifest.template.airapp);
  const ignore = await readFile(path.join(app, ".busabaseignore"), "utf8");
  assert.ok(ignore.includes(".env*") && ignore.includes("*.log"), `${name}: exclude local credentials and logs`);
  const { appConfig } = await import(pathToFileURL(path.join(app, "app/js/config.js")).href);
  const messageModule = await import(pathToFileURL(path.join(app, "app/js/messages.js")).href);
  const messages = messageModule.messages || messageModule.copy;
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages["zh-CN"]).sort(), `${name}: message locale key parity`);
  for (const locale of ["en", "zh-CN"]) {
    for (const [key, value] of Object.entries(messages[locale])) {
      assert.ok(typeof value === "string" && value.trim(), `${name}/${locale}/${key}: nonempty message`);
    }
  }
  assert.equal(appConfig.appId, name);
  assert.equal(appConfig.readOnly, true, `${name}: the public desk is read-only`);
  assert.ok(!appConfig.spaceId, `${name}: no author space binding`);
  assert.ok(!appConfig.folder.nodeId, `${name}: no author folder binding`);
  assert.ok(manifest.template.agentPrompts.length >= 2);
  for (const prompt of manifest.template.agentPrompts) bilingual(prompt, `${name}: catalog prompt`);
  for (const property of ["displayName", "description"]) {
    assert.ok(manifest[property].en?.trim() && manifest[property]["zh-CN"]?.trim(), `${name}: localized ${property}`);
  }
  const manual = await readFile(path.join(root, "SKILL.md"), "utf8");
  assert.ok(/^## English$/m.test(manual) && /^## 简体中文$/m.test(manual), `${name}: complete bilingual manual sections`);
  assert.equal(manifest.template.screenshots[0], "assets/screenshots/cover.webp");

  let sampleCount = 0;
  for (const declaration of appConfig.bases) {
    assert.ok(!declaration.baseId && !declaration.nodeId);
    assert.ok(Number.isInteger(declaration.readLimit));
    assert.ok(declaration.readLimit >= 1 && declaration.readLimit <= 50);
    const baseRoot = path.join(root, "content", declaration.key);
    const base = await json(path.join(baseRoot, "base.json"));
    bilingual(base.name, `${name}/${declaration.key}: native Base name`);
    bilingual(base.description, `${name}/${declaration.key}: native Base description`);
    for (const field of base.fields) {
      bilingual(field.name, `${name}/${declaration.key}/${field.slug}: native field name`);
      for (const choice of field.options?.choices || []) bilingual(choice.name, `${name}/${field.slug}/${choice.id}: native choice name`);
    }
    for (const view of base.views) bilingual(view.name, `${name}/${declaration.key}: native view name`);
    localizedPrompts(base.agentPrompts, `${name}/${declaration.key}`);
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
    bilingual(node.name, `${name}/${sidecar}: native node name`);
    bilingual(node.description, `${name}/${sidecar}: native node description`);
    assert.ok(node.agentPrompts?.length >= 2, `${name}/${sidecar}: specific prompts`);
    localizedPrompts(node.agentPrompts, `${name}/${sidecar}`);
  }
  console.log(`${name}: ${appConfig.bases.length} Bases, ${sampleCount} schema-valid sample rows`);
}
