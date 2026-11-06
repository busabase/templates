// Can an Agent find the two manuals with the words a shop owner uses?
//
// Busabase's `playbooks search` lowercases every phrasing the Agent sends and
// matches it as a substring of a Skill node's name, slug and SKILL.md
// `description`, and of a node prompt's label (every locale) and the first 500
// characters of its body. Display names ("Busa 产品枢纽") are not searched. In
// the 2026-11-06 lesson rehearsal 「产品枢纽」, 「下架」, "import Excel" and
// "import products from Excel" found nothing, so the Agent nearly answered
// 「找不到手册」. These tests keep those words where search looks.
//
// They sit with busa-shop's tests, like busa-product-hub's importer tests.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const BODY_PREFIX_CHARS = 500; // busabase-contract PLAYBOOK_SEARCH_LIMITS.bodyPrefixChars
const DESCRIPTION_MAX_CHARS = 1024; // the Agent Skills spec's limit on `description`

const templateUrl = (template, path = "") => new URL(`../../../../${template}/${path}`, import.meta.url);

/** `name` and `description` from SKILL.md's frontmatter, read the way YAML reads a one-line plain scalar. */
const skillOf = async (template) => {
  const text = await readFile(templateUrl(template, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  const field = (key) => frontmatter.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1].trim();
  return { name: field("name"), description: field("description") };
};

const localeValues = (value) => (typeof value === "string" ? [value] : Object.values(value ?? {}));

/** Every node prompt a template installs: its labels in every locale, and the searched part of its bodies. */
const promptsOf = async (template) => {
  const content = templateUrl(template, "content/");
  const files = (await readdir(content, { recursive: true })).filter(
    (path) => !path.includes("node_modules") && /(^|\/)(_folder|_node|base)\.json$/.test(path),
  );
  const prompts = [];
  for (const path of files) {
    const json = JSON.parse(await readFile(new URL(path, content), "utf8"));
    for (const prompt of json.agentPrompts ?? []) {
      prompts.push({
        where: `${path} › ${prompt.key}`,
        labels: localeValues(prompt.label),
        bodies: localeValues(prompt.body).map((body) => body.slice(0, BODY_PREFIX_CHARS)),
      });
    }
  }
  return prompts;
};

const matches = (texts, query) => texts.some((text) => text.toLowerCase().includes(query.trim().toLowerCase()));

const skillMatches = (skill, query) => matches([skill.name, skill.description], query);

test("both descriptions are one-line plain YAML scalars within the Agent Skills limit", async () => {
  for (const template of ["busa-product-hub", "busa-shop"]) {
    const { name, description } = await skillOf(template);
    assert.equal(name, template);
    assert.ok(description, `${template}: no description`);
    // A ": " or " #" would make YAML read a different value than this test does.
    assert.doesNotMatch(description, /: | #|^['"]/, `${template}: description is not a plain scalar`);
    assert.ok(
      description.length <= DESCRIPTION_MAX_CHARS,
      `${template}: description is ${description.length} characters, over ${DESCRIPTION_MAX_CHARS}`,
    );
  }
});

test("busa-product-hub is found by the words a shop owner uses", async () => {
  const skill = await skillOf("busa-product-hub");
  const queries = [
    // Failed in the rehearsal.
    "产品枢纽",
    "下架",
    "import Excel",
    "import products from Excel",
    // Found in the rehearsal; keep it.
    "导入 Excel 商品表",
    // What an owner says about their product list.
    "Busa 产品枢纽",
    "商品表",
    "商品管理",
    "导入商品",
    "导入 Excel",
    "把商品放进店",
    "上架",
    "归档商品",
    "import products",
    "product list",
    "product hub",
    "spreadsheet",
    "CSV",
    "catalog",
  ];
  const missed = queries.filter((query) => !skillMatches(skill, query));
  assert.deepEqual(missed, [], `busa-product-hub's description does not contain: ${missed.join(" / ")}`);
});

test("busa-shop is found by the words an owner uses about their shop", async () => {
  const skill = await skillOf("busa-shop");
  const queries = ["产品枢纽", "把商品放进店", "上架", "下架", "商品表", "独立站", "网店", "import products", "product list", "online shop"];
  const missed = queries.filter((query) => !skillMatches(skill, query));
  assert.deepEqual(missed, [], `busa-shop's description does not contain: ${missed.join(" / ")}`);
});

test("the import and take-down prompts have Chinese labels search can find", async () => {
  const hub = await promptsOf("busa-product-hub");
  const shop = await promptsOf("busa-shop");
  const labelled = (prompts, query) => prompts.filter((prompt) => matches(prompt.labels, query)).map((p) => p.where);
  assert.ok(labelled(hub, "导入商品表").length > 0, "no busa-product-hub prompt label says 导入商品表");
  assert.ok(labelled(hub, "导入商品").length >= 2, "the Products and app import prompts both say 导入商品");
  assert.ok(labelled(hub, "下架").length > 0, "no busa-product-hub prompt label says 下架");
  assert.ok(labelled(shop, "把商品放进店").length > 0, "no busa-shop prompt label says 把商品放进店");
  // A searched body must still name the skill to read, inside the searched prefix.
  for (const prompt of [...hub, ...shop].filter((p) => matches(p.labels, "导入商品") || matches(p.labels, "下架"))) {
    assert.ok(matches(prompt.bodies, "skill in this folder"), `${prompt.where}: the body does not say which skill to read`);
  }
});
