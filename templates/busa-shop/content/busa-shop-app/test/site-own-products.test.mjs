// The website selling from the shop's OWN Products and Certificates (busa-shop
// 0.5.0 and later), through the deployed bundle (vendor/worker.js) against the
// fake Busabase API: a workspace with only Busa Shop installed, the plain
// columns an owner edits in the grid, and the product hub as an opt-in source
// named in Settings. A shop from before 0.5.0 (no Products of its own) is
// site.test.mjs.
import assert from "node:assert/strict";
import { before, after, beforeEach, describe, it } from "node:test";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState, NODES, SHOP_NODES } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
let api;
let pristine;

const envFor = () => ({ BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo", BUSABASE_AIRAPP_RUNTIME: "site" });
const call = async (path, init = {}) => {
  const response = await worker.fetch(new Request(new URL(path, SITE), init), envFor(), { waitUntil() {} });
  return { response, status: response.status, text: await response.text() };
};
const cards = (text) => [...text.matchAll(/<li class="card">[\s\S]*?<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
const detailRows = (text) => [...text.matchAll(/<div><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd><\/div>/g)].map((match) => [match[1], match[2]]);
const row = (id) => api.state.records.bas_shop_products.find((record) => record.fields["product-id"] === id);
const settings = () => api.state.records.bas_settings[0].fields;

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop" });
});

beforeEach(() => {
  for (const key of Object.keys(api.state)) delete api.state[key];
  Object.assign(api.state, structuredClone(pristine));
  Object.assign(api.options, { failCreates: false, queueCreates: false, failReads: false, viewerSession: false });
  api.log.length = 0;
  api.reset();
});

after(async () => api.close());

describe("a shop with its own Products, and no product hub anywhere", () => {
  it("lists the toys from its own table, and reads only its own tables", async () => {
    const { status, text } = await call("/");
    assert.equal(status, 200);
    assert.deepEqual(cards(text), [
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
    assert.doesNotMatch(text, /Rainbow Xylophone|Magnetic Building Tiles/, "no price; a draft");
    assert.match(text, /Dino Explorer Figures<\/h3>[\s\S]*?Out of stock/);
    const bases = api.log.filter((entry) => entry.path === "/api/v1/records").map((entry) => entry.query.baseId);
    assert.deepEqual(bases.sort(), ["bas_pages", "bas_settings", "bas_shipping", "bas_shop_certificates", "bas_shop_products"]);
    assert.deepEqual(api.log.find((entry) => entry.query.baseId === "bas_shop_products").query.sort, { fieldSlug: "ref", fieldType: "number", direction: "asc" });
    assert.deepEqual(JSON.parse((await call("/api/status")).text), {
      ok: true,
      setup: "ready",
      products: 10,
      ordering: true,
      productsFrom: "shop",
      payments: "requests",
      paymentsNote: "off",
      shipping: { countries: 22, problems: 0 },
      email: "off",
      pages: 5,
      pagesToFinish: ["shipping", "returns", "privacy", "terms", "contact"],
      // A shop installed before 0.7.0 has no Posts table and no Google settings.
      posts: "missing",
      google: { analytics: false, searchConsole: false, bing: false },
    });
  });

  it("a product page shows the plain columns: description, highlights, Specs lines, warranty, returns and valid certificates", async () => {
    const { status, text } = await call("/products/tt-walking-robot");
    assert.equal(status, 200);
    assert.match(text, /<p class="price price-large">\$24\.00<\/p>/);
    assert.match(text, /Press the button on its back and the robot walks forward/);
    assert.match(text, /<ul class="bullets"><li>Walks forward and turns its head<\/li><li>Light-up eyes<\/li>/);
    assert.deepEqual(detailRows(text), [
      ["Item no.", "TT-ROB-01"],
      ["Age", "3+"],
      ["Materials", "ABS plastic"],
      ["Batteries", "2 × AA (not included)"],
      ["Size", "14 × 9 × 21 cm"],
      ["Weight", "0.32 kg"],
      ["Warranty", "1-year limited warranty"],
      ["Returns", "30-day returns"],
    ]);
    assert.match(text, /<strong>EN 71<\/strong> <span class="muted">valid until 2027-04-10/);
    // Notes, Cost and Source are the owner's: none of them reaches the page.
    for (const hidden of ["MOQ", "9503.00", "Tumbleberry Toy Works", "9.8", "Lead time", "TT-EN71"]) assert.ok(!text.includes(hidden), hidden);
    // Two photos: the main image and the one link in More photos.
    assert.match(text, /\/images\/tt-walking-robot\/0/);
    assert.match(text, /\/images\/tt-walking-robot\/1/);
    assert.equal((await call("/images/tt-walking-robot/1")).status, 200);
  });

  it("Status is the switch: draft and archive hide a product, active lists it", async () => {
    row("tt-walking-robot").fields.status = "archive";
    row("tt-magnetic-tiles").fields.status = "active";
    const { text } = await call("/");
    assert.ok(!cards(text).includes("Walking Robot Buddy"));
    assert.ok(cards(text).includes("Magnetic Building Tiles"));
    assert.equal((await call("/products/tt-walking-robot")).status, 404);
  });

  it("an edited cell shows on the next read: price, stock, specs; an empty Currency is the shop's", async () => {
    const bear = row("tt-cuddle-bear").fields;
    bear.price = 13.5;
    bear.stock = 0;
    bear.currency = "";
    bear.specs = `${bear.specs}\n防水等级: IPX4\n电池: none`;
    const page = await call("/products/tt-cuddle-bear");
    assert.equal(page.status, 200, "an empty Currency means the store's USD");
    assert.match(page.text, /<p class="price price-large">\$13\.50<\/p>/);
    assert.match(page.text, /Out of stock/);
    const rows = detailRows(page.text);
    assert.deepEqual(rows.find(([label]) => label === "Battery"), ["Battery", "none"], "a Chinese label it knows, in the store's words");
    assert.deepEqual(rows.at(-1), ["防水等级", "IPX4"], "an owner's own label, shown as written, after the known ones");
    bear.currency = "EUR";
    assert.equal((await call("/products/tt-cuddle-bear")).status, 404, "another currency than the shop's is not listed");
  });

  it("a row the owner adds by hand, without a Position, goes last", async () => {
    api.state.records.bas_shop_products.push({ id: "rec_hand", fields: { name: "Hand-made Kite", "product-id": "hand-kite", status: "active", price: 9 } });
    const listed = cards((await call("/")).text);
    assert.equal(listed.at(-1), "Hand-made Kite");
  });

  it("takes an order for its own products", async () => {
    const response = await call("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE },
      body: JSON.stringify({
        orderId: "ORD-7K2M9QX4PT",
        name: "Mia Jensen",
        email: "mia.jensen@example.com",
        phone: "+45 12 34 56 78",
        country: "DK",
        address1: "Eksempelvej 7",
        city: "Aarhus",
        postalCode: "8000",
        items: [{ productId: "tt-walking-robot", quantity: 2 }],
        expectedTotal: 59.9,
      }),
    });
    assert.equal(response.status, 200, response.text);
    const [saved] = api.state.records.bas_orders;
    assert.equal(saved.fields.subtotal, 48);
    assert.equal(saved.fields.shipping, 11.9, "the European Union rate from the template's Shipping");
    assert.equal(saved.fields.total, 59.9);
    assert.equal(saved.fields["delivery-estimate"], "7–12 business days");
    assert.match(saved.fields["items-summary"], /Walking Robot Buddy/);
  });

  it("with an empty Products table it is open, with no products yet", async () => {
    api.state.records.bas_shop_products = [];
    const { status, text } = await call("/");
    assert.equal(status, 200);
    assert.match(text, /No products are listed yet/);
  });

  it("without its Products table it tells the owner, and never reaches for another app's table", async () => {
    api.state.nodes = api.state.nodes.filter((node) => node.id !== SHOP_NODES.products.id);
    const { status, text } = await call("/");
    assert.equal(status, 503);
    assert.match(text, /products-missing/);
    assert.match(text, /restore Products from the trash/);
  });
});

describe("a shop pointed at a product hub", () => {
  it("Settings › Products table sells from the hub's table, read in the hub's shape, with the hub's certificates", async () => {
    const hub = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}` });
    api.state.nodes = [...api.state.nodes, NODES.products, NODES.certificates, NODES.hubApp];
    Object.assign(api.state.records, { bas_products: hub.records.bas_products, bas_certificates: hub.records.bas_certificates });
    row("tt-walking-robot").fields.name = "Robot (own copy)";
    // Without the setting, the shop's own table wins even with a hub next to it.
    assert.ok(cards((await call("/")).text).includes("Robot (own copy)"));
    settings()["products-base"] = "busa-product-hub-products";
    api.log.length = 0;
    const page = await call("/");
    assert.equal(page.status, 200);
    assert.ok(cards(page.text).includes("Walking Robot Buddy"), "the hub's row");
    assert.ok(!cards(page.text).includes("Robot (own copy)"));
    assert.equal(JSON.parse((await call("/api/status")).text).productsFrom, "product-hub");
    const bases = api.log.filter((entry) => entry.path === "/api/v1/records").map((entry) => entry.query.baseId);
    assert.ok(bases.includes("bas_products") && bases.includes("bas_certificates") && !bases.includes("bas_shop_products"));
  });
});
