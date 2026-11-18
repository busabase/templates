// A product page must fit a phone screen. Before this, 10 of 13 real phone
// pages (a China-version phone store, 2026-11-09) were 451–623 px wide on a
// 390 px screen: the Network spec's 5G band list ("n1/n3/n5/…/n78") is one
// unbreakable word, the spec value had no break rule, and the one-column
// mobile grid used `1fr`, whose minimum is the longest word. The page then
// scrolled sideways. These tests keep the rules that stop it in shop.css, and
// check the spec value is rendered where those rules apply.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { buildCatalog, normalizeSettings } from "../src/catalog.js";
import { productPage } from "../src/pages.js";

const css = await readFile(new URL("../public/static/shop.css", import.meta.url), "utf8");
const BANDS = "5G: n1/n3/n5/n8/n20/n28/n38/n40/n41/n48/n77/n78";

/** The CSS outside and inside `@media (max-width: 760px)`, comments removed. */
const split = (source) => {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let top = "";
  let phone = "";
  let cursor = 0;
  const media = /@media\s*([^{}]+)\{/g;
  let match;
  while ((match = media.exec(text))) {
    top += text.slice(cursor, match.index);
    let depth = 1;
    let end = media.lastIndex;
    for (; end < text.length && depth; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}") depth--;
    }
    if (/max-width:\s*760px/.test(match[1])) phone += text.slice(media.lastIndex, end - 1);
    cursor = end;
    media.lastIndex = end;
  }
  top += text.slice(cursor);
  assert.ok(phone, "shop.css has the phone media query");
  return { top, phone };
};

/** Every declaration of `property` in rules whose selector list includes `selector`. */
const declarations = (block, selector, property) =>
  [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((item) => item.trim() === selector))
    .flatMap(([, , body]) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim()));

const { top, phone } = split(css);

describe("a product page fits a phone screen", () => {
  it("a spec value breaks a long unbroken word instead of widening the page", () => {
    assert.deepEqual(declarations(top, ".specs dd", "overflow-wrap"), ["anywhere"]);
    assert.deepEqual(declarations(top, ".specs dd", "min-width"), ["0"]);
    const columns = declarations(top + phone, ".specs div", "grid-template-columns");
    assert.ok(columns.length > 0, "specifications declare their column layout");
    assert.ok(columns.every((value) => /^\d+px minmax\(0, 1fr\)$/.test(value)), "each specification layout keeps its value column shrinkable");
  });

  it("the product text, policy pages and posts wrap long words (URLs, emails, band lists)", () => {
    for (const selector of [".product-info", ".policy", ".post"]) {
      assert.deepEqual(declarations(top, selector, "overflow-wrap"), ["anywhere"], selector);
    }
  });

  it("the one-column phone layout cannot be pushed wider than the screen", () => {
    for (const selector of [".product", ".order-form"]) {
      const columns = declarations(phone, selector, "grid-template-columns");
      assert.ok(columns.length > 0, `${selector} declares a phone layout`);
      assert.ok(columns.every((value) => value === "minmax(0, 1fr)"));
    }
  });

  it("a wide table scrolls inside its own box, not the page", () => {
    assert.deepEqual(declarations(top, ".table-wrap", "overflow-x"), ["auto"]);
    assert.deepEqual(declarations(top, ".table-wrap", "max-width"), ["100%"]);
  });

  it("renders a long band list as a spec value inside .product-info, where those rules apply", () => {
    const settings = normalizeSettings({ fields: { "store-name": "Shop", currency: "usd", language: "en" } });
    const { listed } = buildCatalog({
      productRecords: [{ id: "rec_1", fields: { "product-id": "test-phone", name: "Test Phone", price: 199, status: "active", specs: `Network: ${BANDS}` } }],
      certificateRecords: [],
      settings,
      busabaseOrigin: "https://busabase.example",
      nowMs: Date.now(),
      shape: "shop",
    });
    assert.equal(listed.length, 1);
    const html = productPage({ origin: "https://shop.example", settings, product: listed[0] });
    const info = html.slice(html.indexOf('<div class="product-info">'));
    assert.ok(info.length < html.length, "the page has a .product-info column");
    assert.match(info, new RegExp(`<dl class="specs">[\\s\\S]*<dd>${BANDS.replace(/[/]/g, "\\/")}</dd>`));
  });
});

describe("the header fits a phone screen", () => {
  it("desktop nav can wrap, and the phone navigation scrolls inside its own row", () => {
    assert.deepEqual(declarations(top, ".site-nav", "flex-wrap"), ["wrap"]);
    assert.deepEqual(declarations(top, ".site-nav", "min-width"), ["0"]);
    assert.ok(declarations(phone, ".site-nav", "overflow-x").includes("auto"));
  });
});
