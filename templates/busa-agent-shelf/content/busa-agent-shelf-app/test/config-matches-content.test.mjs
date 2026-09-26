// The app provisions its Bases from app/js/config.js; an install reads
// content/<key>/base.json. The two routes must land on the same Base, so every
// field (slug, name, type, required, order, select choices, relation target)
// has to agree. This test is the guard against silent drift between them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { appConfig } from "../app/js/config.js";

const contentDir = path.resolve(import.meta.dirname, "..", "..");
const PREFIX = `${appConfig.folder.slug}-`;

for (const base of appConfig.bases) {
  test(`config base "${base.key}" matches content/${base.key}/base.json`, async () => {
    const declared = JSON.parse(await readFile(path.join(contentDir, base.key, "base.json"), "utf8"));
    assert.equal(base.slug, `${PREFIX}${base.key}`);
    assert.equal(base.name, declared.name);
    assert.equal(base.description, declared.description);
    const fields = [...declared.fields].sort((a, b) => a.position - b.position);
    assert.deepEqual(
      base.fields.map((field) => field.slug),
      fields.map((field) => field.slug),
      "same fields in the same order",
    );
    for (const [index, field] of base.fields.entries()) {
      const other = fields[index];
      assert.equal(field.name, other.name, `${field.slug}.name`);
      assert.equal(field.type, other.type, `${field.slug}.type`);
      assert.equal(field.required, other.required, `${field.slug}.required`);
      if (other.options?.choices) {
        assert.deepEqual(field.options?.choices, other.options.choices, `${field.slug} choices`);
      }
      if (field.type === "relation") {
        // App config names the prefixed Base slug; base.json names the content dir.
        assert.equal(field.options?.targetBaseSlug, `${PREFIX}${other.options?.targetBaseSlug}`, `${field.slug} target`);
        assert.equal(Boolean(field.options?.multiple), Boolean(other.options?.multiple), `${field.slug} multiple`);
      }
    }
  });
}
