import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRobots, buildSitemap, jsonLdScript, plainSummary, productJsonLd, storeJsonLd } from "../src/seo.js";

const origin = "https://shop.example";
const product = {
  id: "tt-walking-robot",
  name: "Walking Robot Buddy",
  subtitle: "Walks & blinks",
  sku: "TT-ROB-01",
  category: "Robots",
  price: 24,
  currency: "USD",
  soldOut: false,
  updatedAt: "2026-11-02T08:00:00.000Z",
  content: { description: "A first robot." },
  images: [{ kind: "busabase", url: "https://busabase.example/a.svg" }, { kind: "direct", url: "https://cdn.example/b.svg" }],
};
const settings = { storeName: "Tumbleberry Toys", tagline: "Toys", contactEmail: "hello@tumbleberry.example" };

describe("sitemap.xml and robots.txt", () => {
  it("lists home and every product with absolute, escaped URLs", () => {
    const xml = buildSitemap(origin, [product, { ...product, id: "a&b", updatedAt: "" }]);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<loc>https:\/\/shop\.example\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/shop\.example\/products\/tt-walking-robot<\/loc><lastmod>2026-11-02<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/shop\.example\/products\/a%26b<\/loc><\/url>/);
    assert.equal((xml.match(/<url>/g) ?? []).length, 3);
  });

  it("keeps crawlers out of the API, the order form and the pay pages, and points at the sitemap", () => {
    assert.equal(
      buildRobots(origin),
      "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /order\nDisallow: /pay/\nSitemap: https://shop.example/sitemap.xml\n",
    );
  });
});

describe("JSON-LD", () => {
  it("describes a product with an Offer schema.org understands", () => {
    const data = productJsonLd({ origin, product, settings });
    assert.equal(data["@type"], "Product");
    assert.equal(data.sku, "TT-ROB-01");
    assert.deepEqual(data.image, ["https://shop.example/images/tt-walking-robot/0", "https://cdn.example/b.svg"]);
    assert.deepEqual(data.offers, {
      "@type": "Offer",
      url: "https://shop.example/products/tt-walking-robot",
      price: "24.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Tumbleberry Toys" },
    });
    assert.equal(productJsonLd({ origin, product: { ...product, soldOut: true }, settings }).offers.availability, "https://schema.org/OutOfStock");
  });

  it("describes the store", () => {
    assert.deepEqual(storeJsonLd({ origin, settings }), {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      name: "Tumbleberry Toys",
      url: "https://shop.example/",
      description: "Toys",
      email: "hello@tumbleberry.example",
    });
  });

  it("cannot be broken out of by a product name", () => {
    const script = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    assert.equal((script.match(/<\/script>/g) ?? []).length, 1);
    assert.match(script, /\\u003c\/script>/);
  });
});

describe("plainSummary", () => {
  it("cuts at a word and stays under the limit", () => {
    const text = plainSummary("word ".repeat(80), 160);
    assert.ok(text.length <= 160);
    assert.ok(text.endsWith("…"));
    assert.equal(plainSummary("  short \n text "), "short text");
  });
});
