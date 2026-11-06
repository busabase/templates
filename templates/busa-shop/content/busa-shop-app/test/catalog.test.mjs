import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCatalog,
  certificateLabel,
  classifyImageRef,
  formatPrice,
  imagesFor,
  imageSrc,
  listingFor,
  normalizeCertificate,
  normalizeProduct,
  normalizeSettings,
  parseCountryList,
  validCertificatesFor,
} from "../src/catalog.js";

const BUSABASE = "https://busabase.example";
const settings = normalizeSettings({ fields: { "store-name": "Shop", currency: "usd", language: "en" } });

const record = (fields, id = "rec_1") => ({
  id,
  fields: {
    "product-id": "toy-1",
    name: "Toy",
    lifecycle: "active",
    status: "active",
    price: 24,
    currency: "USD",
    pricing: JSON.stringify({ target_price: 24, landed_cost: 9.8 }),
    ...fields,
  },
});

const listing = (fields, overrides = {}) => listingFor(normalizeProduct(record(fields)), { ...settings, ...overrides });

describe("the listing rule", () => {
  it("lists an active, priced product in the store currency", () => {
    const result = listing({});
    assert.equal(result.listed, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.price, 24);
    assert.equal(result.currency, "USD");
  });

  it("lists lifecycle launch and status approved/live, case-insensitively", () => {
    assert.equal(listing({ lifecycle: "Launch", status: " LIVE " }).listed, true);
    assert.equal(listing({ status: "approved" }).listed, true);
  });

  it("hides test/archive lifecycles and draft/blocked/review statuses", () => {
    for (const lifecycle of ["test", "archive", "", "retired"]) {
      assert.deepEqual(listing({ lifecycle }).reasons, ["lifecycle"], lifecycle);
    }
    for (const status of ["draft", "needs_review", "blocked", "retiring", "suppressed", ""]) {
      assert.deepEqual(listing({ status }).reasons, ["status"], status);
    }
  });

  it("uses the Price and Currency columns, not a price left in the Pricing JSON", () => {
    const result = listing({ price: 22, pricing: JSON.stringify({ currency: "EUR", current_price: 30 }) });
    assert.equal(result.listed, true);
    assert.equal(result.price, 22);
    assert.equal(result.currency, "USD");
  });

  it("falls back to pricing.current_price and pricing.currency while the columns are empty (a product hub from before 0.4.0)", () => {
    const legacy = { pricing: JSON.stringify({ currency: "USD", current_price: 19.5, landed_cost: 7 }) };
    for (const empty of [{ price: undefined, currency: undefined }, { price: null, currency: null }, { price: "", currency: " " }]) {
      const result = listing({ ...empty, ...legacy });
      assert.equal(result.listed, true, JSON.stringify(empty));
      assert.equal(result.price, 19.5);
      assert.equal(result.currency, "USD");
    }
    // Each column falls back on its own.
    assert.equal(listing({ currency: "", pricing: JSON.stringify({ currency: "USD" }) }).price, 24);
    assert.deepEqual(listing({ price: null, pricing: JSON.stringify({ current_price: 12 }) }).price, 12);
  });

  it("hides a product with neither a Price column nor a JSON price", () => {
    const result = listing({ price: null, pricing: JSON.stringify({ target_price: 24 }) });
    assert.equal(result.listed, false);
    assert.deepEqual(result.reasons, ["price"]);
    assert.deepEqual(listing({ price: null, currency: null, pricing: "" }).reasons, ["price", "currency"]);
  });

  it("hides a product with a zero or non-numeric price; 0 in the column is not empty, so no fallback", () => {
    assert.deepEqual(listing({ price: 0 }).reasons, ["price"]);
    assert.deepEqual(listing({ price: 0, pricing: JSON.stringify({ current_price: 30 }) }).reasons, ["price"]);
    assert.deepEqual(listing({ price: "abc" }).reasons, ["price"]);
    assert.deepEqual(listing({ price: null, pricing: JSON.stringify({ currency: "USD", current_price: 0 }) }).reasons, ["price"]);
    assert.deepEqual(listing({ price: null, currency: null, pricing: "not json" }).reasons, ["price", "currency"]);
  });

  it("accepts a numeric string price and rounds to cents", () => {
    assert.equal(listing({ price: "18.499" }).price, 18.5);
    assert.equal(listing({ price: null, pricing: JSON.stringify({ currency: "USD", current_price: "18.499" }) }).price, 18.5);
  });

  it("hides a product priced in another currency than the store's", () => {
    assert.deepEqual(listing({ currency: "EUR" }).reasons, ["currency-mismatch"]);
    assert.deepEqual(listing({ price: null, currency: null, pricing: JSON.stringify({ currency: "EUR", current_price: 10 }) }).reasons, [
      "currency-mismatch",
    ]);
    assert.equal(listing({ currency: "usd" }).listed, true, "case-insensitive");
  });

  it("hides a product without a name or with an id that cannot be a URL", () => {
    assert.deepEqual(listing({ name: "" }).reasons, ["name"]);
    assert.deepEqual(listing({ "product-id": "../etc" }).reasons, ["product-id"]);
    assert.deepEqual(listing({ "product-id": "has space" }).reasons, ["product-id"]);
  });

  it("honours Settings › Only list products with this tag", () => {
    assert.deepEqual(listing({ tags: JSON.stringify(["toys"]) }, { listedTag: "Toys" }).reasons, []);
    assert.deepEqual(listing({ tags: JSON.stringify(["lamps"]) }, { listedTag: "toys" }).reasons, ["tag"]);
  });

  it("keeps a sold-out product listed but not orderable", () => {
    const result = listing({ inventory: JSON.stringify({ available: 0 }) });
    assert.equal(result.listed, true);
    assert.equal(result.soldOut, true);
    assert.equal(result.maxQuantity, 0);
  });

  it("caps the quantity at stock, and at 99 when stock is unknown", () => {
    assert.equal(listing({ inventory: JSON.stringify({ available: 4 }) }).maxQuantity, 4);
    assert.equal(listing({ inventory: JSON.stringify({ available: 500 }) }).maxQuantity, 99);
    assert.equal(listing({}).maxQuantity, 99);
    assert.equal(listing({}).soldOut, false);
  });
});

describe("price display", () => {
  it("formats in the store language", () => {
    assert.equal(formatPrice(24, "USD", "en"), "$24.00");
    assert.match(formatPrice(24, "EUR", "de"), /^24,00\s€$/);
    assert.match(formatPrice(1234.5, "USD", "fr"), /1\s?234,50\s\$US/);
  });

  it("never throws on a bad currency code", () => {
    assert.equal(formatPrice(5, "NOTACODE", "en"), "5.00 NOTACODE");
    assert.equal(formatPrice(null, "USD"), "");
  });
});

describe("image references", () => {
  it("links an https URL on another host directly", () => {
    assert.deepEqual(classifyImageRef("https://cdn.example/toy.svg", BUSABASE), {
      kind: "direct",
      url: "https://cdn.example/toy.svg",
    });
  });

  it("proxies a URL on the Busabase server, absolute or /api/ relative", () => {
    assert.equal(classifyImageRef(`${BUSABASE}/assets/a.png`, BUSABASE).kind, "busabase");
    assert.deepEqual(classifyImageRef("/api/dev/attachment/k.png", BUSABASE), {
      kind: "busabase",
      url: `${BUSABASE}/api/dev/attachment/k.png`,
    });
  });

  it("maps a Product Hub AirApp path to the file inside that AirApp", () => {
    assert.deepEqual(classifyImageRef("./assets/product-images/aurora-lamp.png", BUSABASE), {
      kind: "airapp",
      path: "app/assets/product-images/aurora-lamp.png",
    });
    assert.deepEqual(classifyImageRef("/assets/product-images/aurora-lamp.png", BUSABASE), {
      kind: "airapp",
      path: "app/assets/product-images/aurora-lamp.png",
    });
  });

  it("refuses everything else", () => {
    for (const ref of [
      "http://cdn.example/toy.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/x.png",
      "./assets/../server.js",
      "assets/x.js",
      "app/assets/x.png",
      "https://user:pass@cdn.example/x.png",
      "/api/../../x.png",
      "",
    ]) {
      assert.equal(classifyImageRef(ref, BUSABASE), null, ref);
    }
  });

  it("orders hero then gallery, drops duplicates and refused entries", () => {
    const product = normalizeProduct(
      record({
        image: "https://cdn.example/a.png",
        gallery: JSON.stringify(["https://cdn.example/a.png", "javascript:x", "./assets/b.png"]),
      }),
    );
    const images = imagesFor(product, BUSABASE);
    assert.deepEqual(
      images.map((image) => image.kind),
      ["direct", "airapp"],
    );
    assert.equal(imageSrc(product, images[0], 0), "https://cdn.example/a.png");
    assert.equal(imageSrc(product, images[1], 1), "/images/toy-1/1");
  });
});

describe("certificates", () => {
  it("labels a certificate by its type, and never shows Other or an empty type", () => {
    assert.equal(certificateLabel("EN 71"), "EN 71");
    assert.equal(certificateLabel("CPSIA / CPC"), "CPSIA / CPC");
    assert.equal(certificateLabel(" UKCA "), "UKCA");
    assert.equal(certificateLabel("Other"), "");
    assert.equal(certificateLabel(""), "");
  });

  it("shows only certificates that have not expired, never the number", () => {
    const product = normalizeProduct(record({}, "rec_toy"));
    const now = Date.parse("2026-11-05T00:00:00Z");
    const certs = [
      { product: ["rec_toy"], "cert-type": "EN 71", "cert-number": "A", "expiry-date": "2027-03-01" },
      { product: ["rec_toy"], "cert-type": "ASTM F963", "cert-number": "B", "expiry-date": "2026-09-30" },
      { product: "rec_toy", "cert-type": "UKCA", "cert-number": "C", "expiry-date": "" },
      { product: ["rec_toy"], "cert-type": "Other", "cert-number": "D", "expiry-date": "2028-01-01" },
      { product: ["rec_other"], "cert-type": "FCC", "cert-number": "E", "expiry-date": "2028-01-01" },
      { product: [{ id: "rec_toy" }], "cert-type": "CPSIA / CPC", "cert-number": "F", "expiry-date": "2027-01-01" },
    ].map((fields) => normalizeCertificate({ fields }));
    assert.deepEqual(validCertificatesFor(product, certs, now), [
      { label: "CPSIA / CPC", expires: "2027-01-01" },
      { label: "EN 71", expires: "2027-03-01" },
    ]);
  });
});

describe("settings", () => {
  it("normalizes currency, language and ship-to countries", () => {
    const value = normalizeSettings({
      fields: { "store-name": " Toys ", currency: "eur", language: "xx", "ships-to": "us, gb;DE  zz", "demo-notice": true },
    });
    assert.equal(value.storeName, "Toys");
    assert.equal(value.currency, "EUR");
    assert.equal(value.language, "en");
    assert.deepEqual(value.shipsTo, ["US", "GB", "DE"]);
    assert.equal(value.demoNotice, true);
  });

  it("ships everywhere when the list is empty", () => {
    assert.ok(normalizeSettings({ fields: {} }).shipsTo.length > 200);
    assert.deepEqual(parseCountryList("XX, YY"), []);
  });
});

describe("buildCatalog", () => {
  it("splits listed and hidden and keeps the first of two rows with one id", () => {
    const catalog = buildCatalog({
      productRecords: [record({}, "a"), record({ name: "Copy" }, "b"), record({ "product-id": "toy-2", status: "draft" }, "c")],
      certificateRecords: [],
      settings,
      busabaseOrigin: BUSABASE,
      nowMs: 0,
    });
    assert.deepEqual(
      catalog.listed.map((product) => product.name),
      ["Toy"],
    );
    assert.deepEqual(
      catalog.hidden.map((item) => [item.id, item.reasons]),
      [
        ["toy-1", ["duplicate-id"]],
        ["toy-2", ["status"]],
      ],
    );
    assert.equal(catalog.listed[0].priceText, "$24.00");
  });
});
