// End-to-end through the DEPLOYED bundle (vendor/worker.js, with the real busabase-sdk
// inside) against a fake Busabase HTTP API. These tests prove the request
// shapes the SDK actually sends, not just the logic.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import worker from "../vendor/worker.js";
import { allowedOrigin, createHandler } from "../src/handler.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState, NODES } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
let api;
let foreign;
let pristine;

const envFor = () => ({ BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo", BUSABASE_AIRAPP_RUNTIME: "site" });

// Each test gets a fresh env object, so the Worker builds a fresh shop and cache.
const call = async (path, init = {}, env = envFor()) => {
  const response = await worker.fetch(new Request(new URL(path, SITE), init), env, { waitUntil() {} });
  const text = init.method === "HEAD" ? "" : await response.text();
  return { response, status: response.status, text, type: response.headers.get("content-type") ?? "" };
};

const postJson = (body, headers = {}, env) =>
  call("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: SITE, ...headers }, body: JSON.stringify(body) }, env);

const order = (overrides = {}) => ({
  orderId: "ORD-7K2M9QX4PT",
  name: "Mia Jensen",
  email: "mia.jensen@example.com",
  country: "DK",
  note: "Birthday present.",
  items: [
    { productId: "tt-walking-robot", quantity: 2 },
    { productId: "tt-rainbow-blocks", quantity: 1 },
  ],
  expectedTotal: 66.5,
  ...overrides,
});

const ordersRows = () => api.state.records.bas_orders;

before(async () => {
  foreign = { log: [] };
  foreign.server = http.createServer((req, res) => {
    foreign.log.push({ path: req.url, auth: req.headers.authorization ?? "" });
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  await new Promise((resolve) => foreign.server.listen(0, "127.0.0.1", resolve));
  foreign.origin = `http://127.0.0.1:${foreign.server.address().port}`;
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}` });
});

beforeEach(() => {
  Object.assign(api.state, structuredClone(pristine));
  api.state.records.bas_orders = [];
  Object.assign(api.options, { failCreates: false, queueCreates: false, failReads: false });
  api.log.length = 0;
  api.reset();
  foreign.log.length = 0;
});

after(async () => {
  await api.close();
  await new Promise((resolve) => foreign.server.close(resolve));
});

describe("pages", () => {
  it("home lists exactly the active, priced products, with SEO basics", async () => {
    const { status, text, type, response } = await call("/");
    assert.equal(status, 200);
    assert.equal(type, "text/html; charset=utf-8");
    assert.match(text, /<meta charset="utf-8">/);
    assert.match(text, /<title>Tumbleberry Toys · Colourful, tested toys from our own factory floor<\/title>/);
    assert.match(text, /<meta name="description" content="Tumbleberry Toys is a fictional toy factory/);
    assert.match(text, /<link rel="canonical" href="https:\/\/tumbleberry-toys\.example\/">/);
    assert.match(text, /<meta property="og:image" content="https:\/\/tumbleberry-toys\.example\/images\/tt-walking-robot\/0">/);
    assert.match(text, /"@type":"OnlineStore"/);
    assert.match(text, /class="demo-notice"/);
    const cards = [...text.matchAll(/<li class="card">[\s\S]*?<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
    assert.deepEqual(cards, [
      "Walking Robot Buddy",
      "Rainbow Stacking Blocks",
      "RC Mini Racer",
      "Cuddle Bear Plush",
      "Ocean Floor Puzzle",
      "Wooden Train Set",
      "Mini Chef Kitchen Set",
      "Dino Explorer Figures",
      "Rainbow Diamond Kite",
      "Bubble Machine",
    ]);
    assert.doesNotMatch(text, /Rainbow Xylophone|Magnetic Building Tiles|Aurora Desk Lamp/);
    assert.match(text, /\$24\.00/);
    assert.match(text, /Dino Explorer Figures<\/h3>[\s\S]*?Out of stock/);
    assert.match(text, /Photo coming soon/);
    assert.match(text, /we will contact you|Nothing is charged on this site/i);
    assert.ok(response.headers.get("content-security-policy").includes("script-src 'self'"));
    assert.ok(!text.includes(TEST_KEY));
  });

  it("asks Busabase only for the declared tables, with the key and space", async () => {
    await call("/");
    const paths = api.log.map((entry) => `${entry.method} ${entry.path}`);
    assert.deepEqual(paths.sort(), ["GET /api/v1/nodes", "GET /api/v1/records", "GET /api/v1/records", "GET /api/v1/records"].sort());
    // The SDK sends `types[0]=base&types[1]=airapp` (oRPC bracket notation).
    assert.deepEqual(Object.values(api.log[0].query.types), ["base", "airapp"]);
    const bases = api.log.filter((entry) => entry.path === "/api/v1/records").map((entry) => [entry.query.baseId, entry.query.limit]);
    assert.deepEqual(bases.sort(), [["bas_certificates", "100"], ["bas_products", "100"], ["bas_settings", "5"]]);
    assert.deepEqual(api.log.find((entry) => entry.query.baseId === "bas_products").query.sort, { fieldSlug: "ref", direction: "asc" });
    assert.ok(api.log.every((entry) => entry.auth === `Bearer ${TEST_KEY}` && entry.space === "spc_demo"));
  });

  it("product page carries Product JSON-LD, Open Graph and only valid certificates", async () => {
    const { status, text } = await call("/products/tt-ocean-puzzle");
    assert.equal(status, 200);
    assert.match(text, /<title>Ocean Floor Puzzle · Tumbleberry Toys<\/title>/);
    assert.match(text, /<meta property="og:type" content="product">/);
    assert.match(text, /<link rel="canonical" href="https:\/\/tumbleberry-toys\.example\/products\/tt-ocean-puzzle">/);
    const jsonLd = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(text)[1]);
    assert.equal(jsonLd["@type"], "Product");
    assert.equal(jsonLd.offers.price, "12.00");
    assert.equal(jsonLd.offers.priceCurrency, "USD");
    assert.equal(jsonLd.offers.availability, "https://schema.org/InStock");
    assert.match(text, /<strong>EN 71<\/strong> <span class="muted">valid until 2027-01-20/);
    assert.match(text, /<strong>CPSIA \/ CPC<\/strong>/);
    assert.doesNotMatch(text, /ASTM F963/, "the expired ASTM report is not claimed");
    assert.doesNotMatch(text, /TT-EN71|TT-CPC/, "certificate numbers stay private");
    assert.match(text, /Age<\/dt><dd>3\+/);
    assert.doesNotMatch(text, /9503\.00|MOQ|landed/i, "trade-only fields stay off the public page");
  });

  it("an out-of-stock product cannot be added to an order", async () => {
    const { text } = await call("/products/tt-dino-figures");
    assert.match(text, /"availability":"https:\/\/schema.org\/OutOfStock"/);
    assert.doesNotMatch(text, /data-add-form/);
  });

  it("hidden and unknown products are a 404, not a page", async () => {
    for (const path of ["/products/tt-xylophone", "/products/tt-magnetic-tiles", "/products/prod-aurora-lamp", "/products/nope", "/products/%E0%A4%A"]) {
      const { status, text } = await call(path);
      assert.equal(status, 404, path);
      assert.match(text, /<meta name="robots" content="noindex">/);
    }
  });

  it("order page pre-fills from ?add= and carries an order id and the no-payment line", async () => {
    const { status, text, response } = await call("/order?add=tt-walking-robot&qty=2");
    assert.equal(status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(text, /name="qty\.tt-walking-robot" value="2"/);
    assert.match(text, /name="orderId" value="ORD-[0-9A-HJKMNP-TV-Z]{10}"/);
    assert.match(text, /We will contact you to confirm and arrange payment/);
    assert.match(text, /<meta name="robots" content="noindex">/);
    assert.match(text, /<option value="DK">Denmark<\/option>/);
    assert.doesNotMatch(text, /<option value="CN">/, "only the ship-to countries in Settings");
  });

  it("serves sitemap.xml, robots.txt and a status for the daily check", async () => {
    const sitemap = await call("/sitemap.xml");
    assert.equal(sitemap.type, "application/xml; charset=utf-8");
    assert.equal((sitemap.text.match(/<url>/g) ?? []).length, 11);
    assert.doesNotMatch(sitemap.text, /tt-xylophone/);
    const robots = await call("/robots.txt");
    assert.match(robots.text, /Sitemap: https:\/\/tumbleberry-toys\.example\/sitemap\.xml/);
    const status = await call("/api/status");
    assert.deepEqual(JSON.parse(status.text), { ok: true, setup: "ready", products: 10, ordering: true });
  });

  it("answers HEAD without a body and refuses other methods on pages", async () => {
    const head = await call("/", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.response.body, null);
    assert.equal((await call("/", { method: "DELETE" })).status, 405);
    assert.equal((await call("/api/orders")).status, 405);
  });
});

describe("images", () => {
  it("streams an image of a listed product, fetched with the key from Busabase", async () => {
    const { status, type, text, response } = await call("/images/tt-walking-robot/1");
    assert.equal(status, 200);
    assert.equal(type, "image/svg+xml");
    assert.match(text, /Walking Robot Buddy, gift box/);
    assert.match(response.headers.get("content-security-policy"), /sandbox/);
    const assetCall = api.log.find((entry) => entry.path.startsWith("/assets/"));
    assert.equal(assetCall.path, "/assets/walking-robot-box.svg");
    assert.equal(assetCall.auth, `Bearer ${TEST_KEY}`);
  });

  it("refuses ids and indexes that are not an image of a listed product", async () => {
    for (const path of [
      "/images/tt-xylophone/0", // has an image, but the product is hidden (no price)
      "/images/prod-aurora-lamp/0", // archived product-hub sample
      "/images/tt-walking-robot/7",
      "/images/tt-chef-kitchen/0", // listed, no image
      "/images/rec_settings/0",
      "/images/..%2F..%2Fapi%2Fv1%2Fnodes/0",
      "/images/tt-walking-robot/-1",
    ]) {
      assert.equal((await call(path)).status, 404, path);
    }
    assert.equal(api.log.filter((entry) => entry.path.startsWith("/assets/")).length, 0, "nothing was fetched for a refused id");
  });

  it("reads a Product Hub AirApp image through the API and never sends the key to another host", async () => {
    const lamp = api.state.records.bas_products.find((row) => row.id === "rec_hub_lamp");
    lamp.fields.lifecycle = "active";
    api.state.files = {
      nod_hub_app: {
        "app/assets/product-images/aurora-lamp.png": {
          nodeId: "nod_hub_app",
          path: "app/assets/product-images/aurora-lamp.png",
          encoding: "url",
          content: "",
          mimeType: "image/png",
          assetId: "ast_1",
          displayName: null,
          assetUrl: `${foreign.origin}/cdn/aurora-lamp.png`,
          contentHash: "",
        },
      },
    };
    const { status, type } = await call("/images/prod-aurora-lamp/0");
    assert.equal(status, 200);
    assert.equal(type, "image/png");
    // The SDK percent-encodes the slashes of the file path (`app%2Fassets%2F…`).
    assert.ok(api.log.some((entry) => decodeURIComponent(entry.path) === "/api/v1/file-trees/nod_hub_app/files/app/assets/product-images/aurora-lamp.png"));
    assert.deepEqual(foreign.log, [{ path: "/cdn/aurora-lamp.png", auth: "" }]);
  });

  it("serves an SVG kept as text in the Product Hub AirApp", async () => {
    const lamp = api.state.records.bas_products.find((row) => row.id === "rec_hub_lamp");
    Object.assign(lamp.fields, { lifecycle: "active", image: "./assets/lamp.svg", gallery: "[]" });
    api.state.files = {
      nod_hub_app: {
        "app/assets/lamp.svg": { encoding: "utf8", content: "<svg xmlns='http://www.w3.org/2000/svg'/>", mimeType: "image/svg+xml", assetUrl: null },
      },
    };
    const { status, text } = await call("/images/prod-aurora-lamp/0");
    assert.equal(status, 200);
    assert.match(text, /^<svg/);
  });

  it("links a public https image directly and does not proxy it", async () => {
    const bear = api.state.records.bas_products.find((row) => row.id === "rec_tt-cuddle-bear");
    Object.assign(bear.fields, { image: "https://cdn.example.test/bear.svg", gallery: "[]" });
    const page = await call("/products/tt-cuddle-bear");
    assert.match(page.text, /<img class="" src="https:\/\/cdn\.example\.test\/bear\.svg"/);
    assert.equal((await call("/images/tt-cuddle-bear/0")).status, 404);
  });
});

describe("POST /api/orders", () => {
  it("creates one Orders row with only the website's fields, keyed by the order id", async () => {
    const { status, text } = await postJson(order());
    assert.equal(status, 200);
    assert.deepEqual(JSON.parse(text), { ok: true, orderId: "ORD-7K2M9QX4PT" });
    assert.equal(ordersRows().length, 1);
    const fields = ordersRows()[0].fields;
    assert.deepEqual(Object.keys(fields).sort(), [
      "country",
      "created-at",
      "currency",
      "customer-name",
      "customer-note",
      "email",
      "items",
      "items-summary",
      "order-id",
      "source",
      "status",
      "title",
      "total",
    ]);
    assert.equal(fields.status, "new");
    assert.equal(fields.total, 66.5);
    assert.equal(fields.currency, "USD");
    const create = api.log.find((entry) => entry.method === "POST");
    assert.equal(create.path, "/api/v1/bases/bas_orders/change-requests");
    const body = JSON.parse(create.body);
    assert.equal(body.idempotencyKey, "ORD-7K2M9QX4PT");
    assert.equal(body.submittedBy, "busa-shop");
    assert.equal(body.autoMerge, undefined, "never forces or skips review");
  });

  it("a double click or retry with the same order id is still one order", async () => {
    const env = envFor();
    assert.equal((await postJson(order(), {}, env)).status, 200);
    assert.equal((await postJson(order(), {}, env)).status, 200);
    assert.equal((await postJson(order())).status, 200);
    assert.equal(ordersRows().length, 1);
  });

  it("refuses bad input with field codes and writes nothing", async () => {
    const cases = [
      [{ name: "" }, { name: "required" }],
      [{ email: "not-an-email" }, { email: "invalid_email" }],
      [{ country: "CN" }, { country: "invalid_country" }],
      [{ orderId: "1" }, { orderId: "invalid" }],
      [{ items: [{ productId: "tt-xylophone", quantity: 1 }] }, { items: "not_available" }],
      [{ items: [{ productId: "tt-dino-figures", quantity: 1 }] }, { items: "sold_out" }],
      [{ items: [{ productId: "tt-walking-robot", quantity: 100 }] }, { items: "too_many" }],
      [{ items: [] }, { items: "items_empty" }],
    ];
    for (const [overrides, errors] of cases) {
      const { status, text } = await postJson(order({ expectedTotal: undefined, ...overrides }));
      assert.equal(status, 400, JSON.stringify(overrides));
      assert.deepEqual(JSON.parse(text).errors, errors);
    }
    assert.equal(ordersRows().length, 0);
    assert.equal(api.log.filter((entry) => entry.method === "POST").length, 0);
  });

  it("answers 409 with the current prices when the visitor's total is stale", async () => {
    const { status, text } = await postJson(order({ expectedTotal: 60 }));
    assert.equal(status, 409);
    const body = JSON.parse(text);
    assert.equal(body.total, 66.5);
    assert.equal(body.totalText, "$66.50");
    assert.equal(body.products.find((product) => product.id === "tt-walking-robot").price, 24);
    assert.equal(ordersRows().length, 0);
  });

  it("pretends success to a bot that fills the hidden field, and writes nothing", async () => {
    const { status } = await postJson(order({ website: "http://spam.example" }));
    assert.equal(status, 200);
    assert.equal(ordersRows().length, 0);
  });

  it("says plainly when the order could not be saved, and a retry later is still one order", async () => {
    api.options.failCreates = true;
    const failed = await postJson(order());
    assert.equal(failed.status, 503);
    assert.deepEqual(JSON.parse(failed.text), { ok: false, error: "unavailable" });
    assert.equal(ordersRows().length, 0);
    api.options.failCreates = false;
    assert.equal((await postJson(order())).status, 200);
    assert.equal(ordersRows().length, 1);
  });

  it("still thanks the visitor when the write waits for review", async () => {
    api.options.queueCreates = true;
    const { status, text } = await postJson(order());
    assert.equal(status, 200);
    assert.equal(JSON.parse(text).ok, true);
  });

  it("accepts a post from the members-only preview, which Busabase proxies from its own origin", async () => {
    assert.equal((await postJson(order(), { origin: api.origin })).status, 200);
    assert.equal(ordersRows().length, 1);
  });

  it("judges origins: this site, Busabase and its subdomains pass; look-alikes do not", () => {
    const site = "https://shop.example";
    const busabase = "https://busabase.com";
    assert.equal(allowedOrigin(null, site, busabase), true);
    assert.equal(allowedOrigin(site, site, busabase), true);
    assert.equal(allowedOrigin("https://busabase.com", site, busabase), true);
    assert.equal(allowedOrigin("https://kelly.busabase.com", site, busabase), true);
    assert.equal(allowedOrigin("https://evilbusabase.com", site, busabase), false);
    assert.equal(allowedOrigin("http://busabase.com", site, busabase), false);
    assert.equal(allowedOrigin("https://busabase.com.evil.example", site, busabase), false);
    assert.equal(allowedOrigin("null", site, busabase), false);
  });

  it("refuses cross-site posts, other content types and oversized bodies", async () => {
    assert.equal((await postJson(order(), { origin: "https://evil.example" })).status, 403);
    assert.equal((await call("/api/orders", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" })).status, 415);
    assert.equal((await postJson(order({ note: "x".repeat(20_000) }))).status, 413);
    assert.equal((await call("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
    assert.equal(ordersRows().length, 0);
  });

  it("works as a plain HTML form without JavaScript", async () => {
    const form = new URLSearchParams({
      orderId: "ORD-3H8VQ2N6RA",
      expectedTotal: "29.00",
      "qty.tt-wooden-train": "1",
      name: "Lucas Moreau",
      email: "lucas@example.org",
      country: "FR",
      note: "",
      company_url: "",
    });
    const ok = await call("/api/orders", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Thank you, we have your order request/);
    assert.match(ok.text, /ORD-3H8VQ2N6RA/);
    assert.equal(ordersRows().length, 1);

    form.set("orderId", "ORD-9D4TB7W1XE");
    form.set("email", "nope");
    const bad = await call("/api/orders", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /Please enter a valid email address\./);
    assert.match(bad.text, /value="Lucas Moreau"/, "what the visitor typed is kept");
    assert.equal(ordersRows().length, 1);
  });
});

describe("setup and failure states", () => {
  const withNodes = (filter) => {
    api.state.nodes = api.state.nodes.filter(filter);
  };

  it("shows the owner what to install when there is no Products table", async () => {
    withNodes((node) => node.metadata.appId !== "busa-product-hub");
    const { status, text, response } = await call("/");
    assert.equal(status, 503);
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
    assert.match(text, /<meta charset="utf-8">/);
    assert.match(text, /This shop is not open yet/);
    assert.match(text, /Install the Busa Product Hub template/);
    assert.match(text, /products-missing/);
    assert.deepEqual(JSON.parse((await call("/api/status")).text), { ok: false, setup: "products-missing", products: 0, ordering: false });
    const post = await postJson(order());
    assert.equal(post.status, 503);
    assert.equal(JSON.parse(post.text).setup, "products-missing");
    assert.equal((await call("/sitemap.xml")).status, 503);
  });

  it("refuses to guess between two product hubs, and follows Settings when told", async () => {
    api.state.nodes.push({ ...NODES.products, id: "nod_hub2_products", parentId: "nod_hub2", baseId: "bas_products_2", slug: "busa-product-hub-2-products" });
    api.state.records.bas_products_2 = [];
    assert.match((await call("/")).text, /products-ambiguous/);
    api.state.records.bas_settings[0].fields["products-base"] = "busa-product-hub-2-products";
    const { status, text } = await call("/");
    assert.equal(status, 200);
    assert.match(text, /No products are listed yet/);
  });

  it("names the Settings problems", async () => {
    api.state.records.bas_settings[0].fields["products-base"] = "missing-table";
    assert.match((await call("/")).text, /products-override-not-found/);
    api.state.records.bas_settings[0].fields["products-base"] = "";
    api.state.records.bas_settings[0].fields.currency = "";
    assert.match((await call("/")).text, /currency-missing/);
    api.state.records.bas_settings = [];
    assert.match((await call("/")).text, /settings-empty/);
    withNodes((node) => node !== NODES.settings && node.id !== NODES.settings.id);
    assert.match((await call("/")).text, /settings-missing/);
  });

  it("keeps showing products but not the form when Orders is missing", async () => {
    withNodes((node) => node.id !== NODES.orders.id);
    assert.equal((await call("/")).status, 200);
    assert.match((await call("/order")).text, /Ordering is not available on this site yet/);
    assert.equal((await postJson(order())).status, 503);
  });

  it("an unreachable workspace is an honest 503, never a crash or a key in the page", async () => {
    api.options.failReads = true;
    const { status, text } = await call("/");
    assert.equal(status, 503);
    assert.match(text, /The shop is temporarily unavailable/);
    assert.ok(!text.includes(TEST_KEY) && !text.includes(api.origin));
    const json = await call("/api/status");
    assert.equal(json.status, 503);
  });

  it("a revoked key reads the same as an outage", async () => {
    const { status } = await call("/", {}, { ...envFor(), BUSABASE_API_KEY: "revoked-key" });
    assert.equal(status, 503);
  });

  it("serves the last good catalog for a short outage, then says it is unavailable", async () => {
    let clock = Date.parse("2026-11-05T10:00:00Z");
    const handler = createHandler({ now: () => clock, log: { error() {}, warn() {} } });
    const env = envFor();
    const get = async () => (await handler(new Request(`${SITE}/`), env, { waitUntil() {} })).status;
    assert.equal(await get(), 200);
    api.options.failReads = true;
    clock += 2 * 60_000;
    assert.equal(await get(), 200, "stale but served");
    clock += 15 * 60_000;
    assert.equal(await get(), 503);
  });

  it("reads the workspace at most once a minute", async () => {
    let clock = Date.parse("2026-11-05T10:00:00Z");
    const handler = createHandler({ now: () => clock });
    const env = envFor();
    for (let index = 0; index < 5; index += 1) await handler(new Request(`${SITE}/products/tt-walking-robot`), env, {});
    assert.equal(api.log.filter((entry) => entry.path === "/api/v1/nodes").length, 1);
    clock += 61_000;
    await handler(new Request(`${SITE}/`), env, {});
    assert.equal(api.log.filter((entry) => entry.path === "/api/v1/nodes").length, 2);
  });

  it("without its Busabase bindings the site says it is unavailable", async () => {
    assert.equal((await call("/", {}, {})).status, 503);
  });
});
