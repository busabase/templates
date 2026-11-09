// Can an Agent find the two manuals with the words a shop owner uses? Since
// busa-shop 0.5.0 the shop has its own product list, so its manual is the one
// a shop owner's words must reach: 商品管理, 导入 Excel, 下架, 改价格…
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
    // What an owner says about their product list. (「把商品放进店」 is the shop's now.)
    "Busa 产品枢纽",
    "商品表",
    "商品管理",
    "导入商品",
    "导入 Excel",
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

test("busa-shop is found by the words an owner uses about their shop and its products", async () => {
  const skill = await skillOf("busa-shop");
  const queries = [
    // The shop.
    "网店",
    "独立站",
    "online shop",
    "storefront",
    // Its product list, built in: the words that found only the product hub before 0.5.0.
    "商品管理",
    "商品表",
    "导入商品",
    "导入 Excel",
    "导入 Excel 商品表",
    "把商品放进店",
    "上架",
    "下架",
    "改价格",
    "import products",
    "import products from Excel",
    "import Excel",
    "product list",
    "Excel",
    "CSV",
    // An owner who still says the course's old name for the product list.
    "产品枢纽",
  ];
  const missed = queries.filter((query) => !skillMatches(skill, query));
  assert.deepEqual(missed, [], `busa-shop's description does not contain: ${missed.join(" / ")}`);
});

test("busa-shop is found by the words of the SEO/GEO lesson: blog, post, 博客, 文章, SEO", async () => {
  // Lesson 4 (2026-11): "plan 3 posts that answer questions buyers really ask". The Agent
  // searches with short words, so each must be a substring of the description.
  const skill = await skillOf("busa-shop");
  const queries = ["blog", "Blog", "post", "posts", "blog post", "博客", "文章", "写博客", "SEO", "GEO", "Google", "Search Console", "Analytics", "AI assistants"];
  const missed = queries.filter((query) => !skillMatches(skill, query));
  assert.deepEqual(missed, [], `busa-shop's description does not contain: ${missed.join(" / ")}`);
  const shop = await promptsOf("busa-shop");
  const labelled = (query) => shop.filter((prompt) => matches(prompt.labels, query)).map((p) => p.where);
  for (const query of ["博客", "blog post", "草稿"]) assert.ok(labelled(query).length > 0, `no busa-shop prompt label says ${query}`);
  assert.ok(labelled("博客").some((where) => where.startsWith("posts/")), "the Posts table itself offers the blog prompts");
  for (const prompt of shop.filter((p) => matches(p.labels, "博客"))) {
    assert.ok(matches(prompt.bodies, "skill in this folder"), `${prompt.where}: the body does not say which skill to read`);
  }
});

test("busa-shop's Products table carries prompts for each thing an owner asks about products", async () => {
  const shop = await promptsOf("busa-shop");
  const labelled = (query) => shop.filter((prompt) => matches(prompt.labels, query)).map((p) => p.where);
  for (const query of ["导入商品", "改价格", "下架", "上架", "商品管理", "把商品放进店", "import products", "Change a price", "Take products off sale"]) {
    assert.ok(labelled(query).length > 0, `no busa-shop prompt label says ${query}`);
  }
  assert.ok(labelled("导入商品").some((where) => where.startsWith("products/")), "the Products table itself offers 导入商品");
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
  for (const prompt of [...hub, ...shop].filter((p) => ["导入商品", "下架", "上架", "改价格", "商品管理"].some((query) => matches(p.labels, query)))) {
    assert.ok(matches(prompt.bodies, "skill in this folder"), `${prompt.where}: the body does not say which skill to read`);
  }
});

test("busa-shop is found by the words of the agent-commerce lesson: MCP, ChatGPT, Claude, AI 助手, Agent 电商", async () => {
  // Lesson 4 (2026-11): a shopper's AI assistant finds the shop's products and hands over a buy link.
  const skill = await skillOf("busa-shop");
  const queries = ["MCP", "mcp", "ChatGPT", "Claude", "AI 助手", "Agent 电商", "AI assistants"];
  const missed = queries.filter((query) => !skillMatches(skill, query));
  assert.deepEqual(missed, [], `busa-shop's description does not contain: ${missed.join(" / ")}`);
  const shop = await promptsOf("busa-shop");
  const labelled = (query) => shop.filter((prompt) => matches(prompt.labels, query)).map((p) => p.where);
  for (const query of ["MCP", "Claude", "ChatGPT", "AI 助手", "Agent 电商"]) assert.ok(labelled(query).length > 0, `no busa-shop prompt label says ${query}`);
  assert.ok(labelled("MCP").some((where) => where.startsWith("busa-shop-app/")), "the Shop Website node itself offers the MCP prompt");
  for (const prompt of shop.filter((p) => matches(p.labels, "MCP"))) {
    assert.ok(matches(prompt.bodies, "skill in this folder"), `${prompt.where}: the body does not say which skill to read`);
  }
  const manual = await readFile(templateUrl("busa-shop", "SKILL.md"), "utf8");
  assert.match(manual, /^## Agent commerce \(AI assistants find and sell your products, Agent 电商\)$/m);
});
