// Agent commerce (busa-shop 0.8.0): /mcp with its four tools, /order opened
// from a buy link, the Google Merchant Center feed, /.well-known/ucp,
// /agents.md and the links in /llms.txt, through the DEPLOYED bundle
// (vendor/worker.js) against a fake Busabase holding the toy demo. Plus the
// MCP transport rules of both protocol eras (src/mcp.js) and the pure helpers.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { countryCodeOf, dutiesNote, queryTokens, toMinor } from "../src/agents.js";
import { createHandler } from "../src/handler.js";
import { decodeHeaderValue } from "../src/mcp.js";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
const UNDER_30_IN_STOCK = ["tt-walking-robot", "tt-rainbow-blocks", "tt-cuddle-bear", "tt-ocean-puzzle", "tt-wooden-train", "tt-rainbow-kite", "tt-bubble-machine"];
let api;
let pristine;
let env;
let nextId = 1;

const envFor = (overrides = {}) => ({
  BUSABASE_BASE_URL: api.origin,
  BUSABASE_API_KEY: TEST_KEY,
  BUSABASE_SPACE_ID: "spc_demo",
  BUSABASE_AIRAPP_RUNTIME: "site",
  ...overrides,
});
const send = async (path, init = {}, { useWorker = worker, site = SITE } = {}) => {
  const response = await useWorker.fetch(new Request(new URL(path, site), { redirect: "manual", ...init }), env, { waitUntil: () => {} });
  const text = await response.text();
  return { response, status: response.status, text, headers: response.headers, json: () => JSON.parse(text) };
};
const get = (path) => send(path);
const LEGACY = "2025-11-25";
const MODERN = "2026-07-28";

/** One JSON-RPC request the way a 2025-11-25 client (Claude, ChatGPT, MCP Inspector) sends it. */
const rpc = async (method, params, { headers = {}, useWorker } = {}) => {
  const result = await send(
    "/mcp",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": LEGACY, ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params === undefined ? {} : { params }) }),
    },
    { useWorker },
  );
  return { ...result, body: result.text ? JSON.parse(result.text) : null };
};
const tool = async (name, args) => {
  const { status, body } = await rpc("tools/call", { name, arguments: args });
  assert.equal(status, 200);
  assert.ok(body.result, JSON.stringify(body));
  return body.result;
};
/** A 2026-07-28 request: version in _meta and mirrored in headers. */
const modern = (method, params = {}, headerOverrides = {}) =>
  send("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
      ...(params.name ? { "mcp-name": params.name } : {}),
      ...headerOverrides,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } },
    }),
  });
const settings = () => api.state.records.bas_settings[0].fields;
const product = (id) => api.state.records.bas_shop_products.find((record) => record.fields["product-id"] === id).fields;

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop", blog: true });
});

after(() => api.close());

beforeEach(() => {
  Object.assign(api.state, structuredClone(pristine));
  api.log.length = 0;
  env = envFor();
});

describe("MCP: connecting", () => {
  it("answers initialize like a stateless 2025-11-25 server: tools only, no session, open CORS", async () => {
    const { status, body, headers } = await rpc("initialize", { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } }, { headers: { "mcp-protocol-version": "" } });
    assert.equal(status, 200);
    assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headers.get("mcp-session-id"), null, "no session is minted");
    assert.equal(headers.get("access-control-allow-origin"), "*");
    assert.equal(body.result.protocolVersion, LEGACY);
    assert.deepEqual(body.result.capabilities, { tools: { listChanged: false } });
    assert.equal(body.result.serverInfo.name, "busa-shop");
    assert.match(body.result.instructions, /Tumbleberry Toys's online shop \(https:\/\/tumbleberry-toys\.example\/\)/);
    assert.match(body.result.instructions, /never place an order or take payment/);
    // An older client gets its own revision back; an unknown one gets the newest legacy revision.
    assert.equal((await rpc("initialize", { protocolVersion: "2025-03-26" })).body.result.protocolVersion, "2025-03-26");
    assert.equal((await rpc("initialize", { protocolVersion: "1999-01-01" })).body.result.protocolVersion, LEGACY);
    // notifications/initialized is accepted with no body.
    const note = await send("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": LEGACY },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    assert.equal(note.status, 202);
    assert.equal(note.text, "");
  });

  it("lists four read-only tools with UCP names, described for this shop", async () => {
    const { body } = await rpc("tools/list");
    const tools = body.result.tools;
    assert.deepEqual(
      tools.map((item) => item.name),
      ["search_catalog", "lookup_catalog", "get_product", "create_checkout"],
    );
    for (const item of tools) {
      assert.equal(item.annotations.readOnlyHint, true, item.name);
      assert.equal(item.annotations.destructiveHint, false, item.name);
      assert.equal(item.inputSchema.type, "object", item.name);
      assert.equal(item.inputSchema.required?.includes("meta") ?? false, false, `${item.name}: the UCP meta object is optional`);
    }
    const search = tools[0].description;
    assert.match(search, /Tumbleberry Toys's online shop \(10 products on sale, prices in USD, ships to 22 countries\)/);
    assert.match(search, /MINOR units of USD \(20000 = \$200\.00\)/);
    assert.match(tools[3].description, /does not place an order or take payment/);
  });

  it("refuses GET, DELETE and HEAD, answers a CORS preflight, and is not a page", async () => {
    for (const method of ["GET", "DELETE", "HEAD"]) {
      const { status, headers } = await send("/mcp", { method });
      assert.equal(status, 405, method);
      assert.equal(headers.get("allow"), "POST, OPTIONS");
    }
    assert.match((await get("/mcp")).text, /MCP endpoint for AI assistants/);
    const preflight = await send("/mcp", {
      method: "OPTIONS",
      headers: { origin: "https://claude.ai", "access-control-request-method": "POST", "access-control-request-headers": "content-type, mcp-protocol-version" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type, mcp-protocol-version");
    assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  });

  it("rejects what is not one JSON-RPC request in JSON", async () => {
    const post = (body, headers = {}) => send("/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
    assert.equal((await post("{", {})).status, 400);
    assert.equal(JSON.parse((await post("{")).text).error.code, -32700);
    const batch = await post(JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }]));
    assert.equal(batch.status, 400);
    assert.match(batch.json().error.message, /Batches are not supported/);
    assert.equal((await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }), { "content-type": "text/plain" })).status, 415);
    assert.equal((await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }), { accept: "text/html" })).status, 406);
    assert.equal((await post("x".repeat(70 * 1024))).status, 413);
    const unknownTool = await rpc("tools/call", { name: "place_order", arguments: {} });
    assert.equal(unknownTool.body.error.code, -32602);
    const unknownMethod = await rpc("resources/list");
    assert.equal(unknownMethod.status, 200, "a legacy client gets a JSON-RPC error, not an HTTP error");
    assert.equal(unknownMethod.body.error.code, -32601);
    assert.deepEqual((await rpc("ping")).body.result, {});
    const unsupported = await rpc("tools/list", undefined, { headers: { "mcp-protocol-version": "2030-01-01" } });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.error.code, -32022);
  });

  it("serves the 2026-07-28 revision too: discover, resultType, headers that must match the body", async () => {
    const discover = await modern("server/discover");
    assert.equal(discover.status, 200);
    const result = discover.json().result;
    assert.equal(result.resultType, "complete");
    assert.ok(result.supportedVersions.includes(MODERN) && result.supportedVersions.includes(LEGACY));
    assert.deepEqual(result.capabilities, { tools: {} });
    assert.equal(result._meta["io.modelcontextprotocol/serverInfo"].name, "busa-shop");

    const list = await modern("tools/list");
    assert.equal(list.json().result.resultType, "complete");
    assert.equal(list.json().result.tools.length, 4);
    const call = await modern("tools/call", { name: "search_catalog", arguments: { catalog: { query: "robot" } } });
    assert.equal(call.json().result.resultType, "complete");
    assert.equal(call.json().result.structuredContent.products[0].id, "tt-walking-robot");
    // Mcp-Name may come Base64-encoded.
    const encoded = await modern("tools/call", { name: "search_catalog", arguments: {} }, { "mcp-name": `=?base64?${btoa("search_catalog")}?=` });
    assert.equal(encoded.status, 200);

    for (const [headers, why] of [
      [{ "mcp-method": "tools/call" }, "Mcp-Method differs from the body"],
      [{ "mcp-method": "" }, "Mcp-Method empty"],
      [{ "mcp-protocol-version": "2025-11-25" }, "version header differs from _meta"],
    ]) {
      const bad = await modern("tools/list", {}, headers);
      assert.equal(bad.status, 400, why);
      assert.equal(bad.json().error.code, -32020, why);
    }
    const wrongName = await modern("tools/call", { name: "search_catalog", arguments: {} }, { "mcp-name": "get_product" });
    assert.equal(wrongName.json().error.code, -32020);
    const unknown = await modern("resources/list");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.json().error.code, -32601);
    // A 2026 header without the _meta it promises.
    const noMeta = await rpc("tools/list", undefined, { headers: { "mcp-protocol-version": MODERN } });
    assert.equal(noMeta.status, 400);
    assert.equal(noMeta.body.error.code, -32020);
  });

  it("limits requests per address, with Retry-After", async () => {
    const limited = createHandler({ mcpRequestsPerMinute: 2 });
    const viaLimited = { fetch: (request, workerEnv, ctx) => limited(request, workerEnv, ctx) };
    const from = (ip) => rpc("ping", undefined, { headers: { "cf-connecting-ip": ip }, useWorker: viaLimited });
    assert.equal((await from("203.0.113.7")).status, 200);
    assert.equal((await from("203.0.113.7")).status, 200);
    const third = await from("203.0.113.7");
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) > 0);
    assert.equal((await from("203.0.113.8")).status, 200, "another address is counted apart");
  });

  it("while the shop is being set up, still lists the tools and says why they cannot answer", async () => {
    settings().currency = "";
    const { body } = await rpc("tools/list");
    assert.equal(body.result.tools.length, 4);
    const result = await tool("search_catalog", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /still being set up/);
    assert.equal((await get("/agents.md")).status, 503);
    assert.equal((await get("/feeds/google.xml")).status, 503);
    assert.equal((await get("/.well-known/ucp")).status, 503);
  });
});

describe("MCP: search_catalog", () => {
  it("finds the toys under $30 in stock that ship to the US, with the shipping cost of each", async () => {
    const result = await tool("search_catalog", { catalog: { query: "toy", context: { address_country: "US" }, filters: { price: { max: 3000 } } } });
    const found = result.structuredContent.products;
    assert.deepEqual(found.map((item) => item.id).sort(), [...UNDER_30_IN_STOCK].sort());
    const robot = found.find((item) => item.id === "tt-walking-robot");
    assert.deepEqual(robot.price_range.min, { amount: 2400, currency: "USD" });
    assert.equal(robot.url, `${SITE}/products/tt-walking-robot`);
    assert.match(robot.media[0].url, /^https:\/\/tumbleberry-toys\.example\/images\/tt-walking-robot\/0$/);
    assert.deepEqual(robot.metadata.shipping, { country: "US", ships: true, cost: { amount: 890, currency: "USD" }, free: false, delivery: "6–10 business days", free_from_items_total: { amount: 7500, currency: "USD" } });
    assert.equal(robot.variants[0].availability.available, true);
    assert.equal(result.structuredContent.ucp.version, "2026-08-25");
    const text = result.content[0].text;
    assert.match(text, /Walking Robot Buddy — \$24\.00 USD — id: tt-walking-robot/);
    assert.match(text, /Ships to United States \(US\): shipping \$8\.90, delivery 6–10 business days, free from an items total of \$75\.00\./);
    assert.match(text, /price at most \$30\.00 \(filters\.price is in minor units\)/);
    assert.match(text, /Note: "toy" describes everything Tumbleberry Toys sells, so it did not narrow the search\./);
    assert.equal(result.structuredContent.messages[0].code, "broad_query", "in structuredContent too, which Claude Code hands the model");
    // A word no product uses falls back to everything that fits the other filters, and says so.
    const kites = await tool("search_catalog", { catalog: { query: "unicorn", filters: { price: { max: 1500 } } } });
    assert.equal(kites.structuredContent.products.length, 3);
    assert.match(kites.content[0].text, /No product mentions "unicorn", so these are all the products that fit the other filters\./);
    assert.match(text, /call create_checkout/);
    assert.doesNotMatch(text, /tt-dino-figures|tt-magnetic-tiles|tt-xylophone/);
  });

  it("never shows a draft, archived, unpriced or sold-out product (sold out only when asked)", async () => {
    const ids = async (args) => (await tool("search_catalog", args)).structuredContent.products.map((item) => item.id);
    assert.deepEqual(await ids({ catalog: { query: "magnetic" } }).then((list) => list.includes("tt-magnetic-tiles")), false, "a draft is never there");
    product("tt-walking-robot").status = "archive";
    product("tt-rainbow-kite").status = "draft";
    env = envFor(); // a fresh Worker: the catalog is cached for a minute
    const everything = await ids({ catalog: { pagination: { limit: 20 } } });
    assert.equal(everything.includes("tt-walking-robot"), false);
    assert.equal(everything.includes("tt-rainbow-kite"), false);
    assert.equal(everything.includes("tt-xylophone"), false, "no price, not on sale");
    assert.equal(everything.includes("tt-dino-figures"), false, "sold out: left out by default");
    assert.equal((await ids({ catalog: { filters: { available: false } } })).includes("tt-dino-figures"), true);
    const lookup = await tool("lookup_catalog", { catalog: { ids: ["tt-walking-robot", "tt-magnetic-tiles"] } });
    assert.deepEqual(lookup.structuredContent.products, []);
    assert.equal((await tool("get_product", { catalog: { id: "tt-rainbow-kite" } })).isError, true);
  });

  it("ranks by the words, and says plainly when the shop does not ship to the buyer's country", async () => {
    const robot = await tool("search_catalog", { catalog: { query: "robot batteries" } });
    assert.equal(robot.structuredContent.products[0].id, "tt-walking-robot");
    const thailand = await tool("search_catalog", { catalog: { query: "robot", context: { address_country: "Thailand" } } });
    assert.equal(thailand.structuredContent.products[0].metadata.shipping.ships, false);
    assert.equal(thailand.structuredContent.messages[0].code, "region_restricted");
    assert.match(thailand.content[0].text, /Tumbleberry Toys does not ship to Thailand \(TH\)\. It ships to: United States \(US\), Canada \(CA\)/);
    assert.match(thailand.content[0].text, /Does NOT ship to Thailand \(TH\)\./);
    const uk = await tool("search_catalog", { catalog: { query: "robot", context: { address_country: "united kingdom" } } });
    assert.equal(uk.structuredContent.products[0].metadata.shipping.cost.amount, 990);
    const nonsense = await tool("search_catalog", { catalog: { context: { address_country: "Atlantis" } } });
    assert.equal(nonsense.structuredContent.messages[0].code, "unknown_country");
  });

  it("filters prices in minor units of the shop currency, and refuses to guess another currency", async () => {
    const cheap = await tool("search_catalog", { catalog: { filters: { price: { max: 1500 } } } });
    assert.deepEqual(cheap.structuredContent.products.map((item) => item.id).sort(), ["tt-cuddle-bear", "tt-ocean-puzzle", "tt-rainbow-kite"]);
    const mistaken = await tool("search_catalog", { catalog: { filters: { price: { max: 30 } } } });
    assert.equal(mistaken.structuredContent.products.length, 0);
    assert.match(mistaken.content[0].text, /20000 means \$200\.00/, "says how to fix a price given in dollars");
    assert.equal(mistaken.structuredContent.messages[0].code, "price_in_minor_units");
    const baht = await tool("search_catalog", { catalog: { context: { currency: "THB" }, filters: { price: { max: 100000 } } } });
    assert.equal(baht.structuredContent.messages[0].code, "currency_not_supported");
    assert.equal(baht.structuredContent.products.length, 9, "the THB filter is not applied");
  });

  it("pages with a cursor, at most 20 at a time, and accepts arguments without the catalog wrapper", async () => {
    const first = await tool("search_catalog", { catalog: { pagination: { limit: 4 } } });
    assert.equal(first.structuredContent.products.length, 4);
    assert.equal(first.structuredContent.pagination.has_next_page, true);
    assert.equal(first.structuredContent.pagination.total_count, 9);
    const second = await tool("search_catalog", { catalog: { pagination: { limit: 4, cursor: first.structuredContent.pagination.cursor } } });
    assert.equal(second.structuredContent.products[0].id === first.structuredContent.products[0].id, false);
    const huge = await tool("search_catalog", { catalog: { pagination: { limit: 500 } } });
    assert.equal(huge.structuredContent.products.length, 9);
    const flat = await tool("search_catalog", { query: "kite", address_country: "US" });
    assert.equal(flat.structuredContent.products[0].id, "tt-rainbow-kite");
    assert.equal(flat.structuredContent.products[0].metadata.shipping.ships, true);
  });
});

describe("MCP: lookup_catalog and get_product", () => {
  it("looks up several ids and names the ones not on sale", async () => {
    const result = await tool("lookup_catalog", { catalog: { ids: ["tt-walking-robot", "tt-rc-racer", "nope"] } });
    assert.deepEqual(result.structuredContent.products.map((item) => item.id), ["tt-walking-robot", "tt-rc-racer"]);
    assert.deepEqual(result.structuredContent.messages, [{ type: "info", code: "not_found", content: "nope" }]);
    const tooMany = await rpc("tools/call", { name: "lookup_catalog", arguments: { catalog: { ids: Array.from({ length: 11 }, (_, index) => `id-${index}`) } } });
    assert.equal(tooMany.body.error.code, -32602);
  });

  it("gives one product in full: specs, warranty and returns, certificates, shipping per country, duties", async () => {
    const result = await tool("get_product", { catalog: { id: "tt-walking-robot", context: { address_country: "CA" } } });
    const detail = result.structuredContent.product;
    assert.equal(detail.title, "Walking Robot Buddy");
    assert.equal(detail.metadata.specs.Warranty, "1-year limited warranty");
    assert.match(detail.metadata.specs.Returns, /30-day returns/);
    assert.deepEqual(detail.metadata.certificates.map((item) => item.type), ["ASTM F963", "CPSIA / CPC", "EN 71", "UKCA"]);
    assert.equal(detail.metadata.shipping_by_country.length, 7);
    assert.deepEqual(detail.metadata.shipping_by_country[0], { zone: "United States", countries: ["US"], cost: { amount: 890, currency: "USD" }, delivery: "6–10 business days" });
    assert.deepEqual(detail.metadata.shipping, { country: "CA", ships: true, cost: { amount: 1290, currency: "USD" }, free: false, delivery: "8–14 business days", free_from_items_total: { amount: 10000, currency: "USD" } });
    assert.match(detail.metadata.duties, /includes no import duties or taxes/);
    const text = result.content[0].text;
    assert.match(text, /Certificates on record \(valid\): ASTM F963 until 2027-04-12/);
    assert.match(text, /- European Union \(IE, DE, FR, ES, IT, NL, BE, AT, SE, DK, FI, PL, PT\): \$11\.90, 7–12 business days/);
    assert.match(text, /Policies: Shipping https:\/\/tumbleberry-toys\.example\/pages\/shipping/);
  });

  it("says a product is not found, once, without a retry", async () => {
    const result = await tool("get_product", { catalog: { id: "tt-magnetic-tiles" } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.ucp.status, "error");
    assert.deepEqual(result.structuredContent.messages[0].severity, "unrecoverable");
    assert.match(result.content[0].text, /do not retry/);
    assert.equal((await rpc("tools/call", { name: "get_product", arguments: { catalog: {} } })).body.error.code, -32602);
  });
});

describe("MCP: create_checkout and the page it opens", () => {
  it("makes the buy link: the shop's own /order, prefilled, with price + shipping = total", async () => {
    const result = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-walking-robot" }, quantity: 2 }], context: { address_country: "US" } } });
    const checkout = result.structuredContent;
    assert.equal(checkout.status, "requires_escalation");
    assert.equal(checkout.continue_url, `${SITE}/order?product=tt-walking-robot&qty=2&country=US`);
    assert.deepEqual(
      checkout.totals.map((total) => [total.type, total.amount]),
      [
        ["subtotal", 4800],
        ["fulfillment", 890],
        ["total", 5690],
      ],
    );
    assert.equal(checkout.messages[0].severity, "requires_buyer_input");
    assert.match(checkout.id, /^chk_[a-z0-9]+$/);
    assert.equal((await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-walking-robot" }, quantity: 2 }], context: { address_country: "US" } } })).structuredContent.id, checkout.id);
    const text = result.content[0].text;
    assert.match(text, /https:\/\/tumbleberry-toys\.example\/order\?product=tt-walking-robot&qty=2&country=US/);
    assert.match(text, /- Walking Robot Buddy × 2: \$48\.00\n- Shipping to United States: \$8\.90 \(delivery 6–10 business days\)\n- Total: \$56\.90 USD/);
    assert.match(text, /this shop takes order requests/, "PayPal is off in the demo: the link leads to an order request");
    assert.match(text, /includes no import duties or taxes/);

    // The page the link opens, as a logged-out buyer sees it before any JavaScript.
    const page = await get(new URL(checkout.continue_url).pathname + new URL(checkout.continue_url).search);
    assert.equal(page.status, 200);
    assert.match(page.text, /<div class="order-row" data-product-id="tt-walking-robot">[\s\S]*?value="2"/);
    assert.match(page.text, /<option value="US" selected>United States<\/option>/);
    assert.match(page.text, /<dd data-order-shipping>\$8\.90<\/dd>/);
    assert.match(page.text, /<strong data-order-total>\$56\.90<\/strong>/);
    assert.match(page.text, /<input type="hidden" name="expectedTotal" value="56\.90">/);
    assert.equal(api.log.filter((entry) => entry.method === "POST").length, 0, "nothing was written");
  });

  it("ships free past the zone's threshold, says PayPal when PayPal is set up, and passes on the shop's duty note", async () => {
    Object.assign(settings(), {
      "paypal-mode": "sandbox",
      "paypal-client-id": "sb-client-id",
      "shipping-note": "We ship within 5 working days. Import duty and taxes, if any, are paid by the buyer on delivery.",
    });
    // Without the secret in the Vault the page takes order requests, and the link says so.
    const noSecret = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-walking-robot" } }], context: { address_country: "US" } } });
    assert.match(noSecret.content[0].text, /this shop takes order requests/);
    api.state.vault = { BUSA_SHOP_PAYPAL_CLIENT_SECRET: "sandbox-secret-1" };
    env = envFor();
    const result = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-walking-robot" }, quantity: 4 }], context: { address_country: "US" } } });
    assert.deepEqual(result.structuredContent.totals.map((total) => total.amount), [9600, 0, 9600]);
    const text = result.content[0].text;
    assert.match(text, /Shipping to United States: free/);
    assert.match(text, /Payment: with PayPal on that page\. Nothing is charged in this chat\./);
    assert.match(text, /Duties and taxes: Import duty and taxes, if any, are paid by the buyer on delivery\./);
    assert.equal(result.structuredContent.messages.find((message) => message.code === "duties").content, "Import duty and taxes, if any, are paid by the buyer on delivery.");
  });

  it("works with UCP's fulfillment destination, without a country, and for several products", async () => {
    const viaFulfillment = await tool("create_checkout", {
      meta: { "ucp-agent": { profile: "https://agent.example/profile.json" } },
      checkout: { line_items: [{ item: { id: "tt-rc-racer" } }], fulfillment: { methods: [{ type: "shipping", destinations: [{ address_country: "GB" }] }] } },
    });
    assert.equal(viaFulfillment.structuredContent.continue_url, `${SITE}/order?product=tt-rc-racer&qty=1&country=GB`);
    const noCountry = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-rc-racer" } }] } });
    assert.equal(noCountry.structuredContent.continue_url, `${SITE}/order?product=tt-rc-racer&qty=1`);
    assert.equal(noCountry.structuredContent.totals.at(-1).display_text, "Total before shipping");
    const two = await tool("create_checkout", {
      checkout: { line_items: [{ item: { id: "tt-rc-racer" }, quantity: 1 }, { item: { id: "tt-cuddle-bear" }, quantity: 3 }], context: { address_country: "DE" } },
    });
    assert.equal(two.structuredContent.continue_url, `${SITE}/order?product=tt-rc-racer&qty=1&product=tt-cuddle-bear&qty=3&country=DE`);
    const page = await get("/order?product=tt-rc-racer&qty=1&product=tt-cuddle-bear&qty=3&country=DE");
    assert.match(page.text, /data-product-id="tt-rc-racer"[\s\S]*data-product-id="tt-cuddle-bear"/);
    assert.match(page.text, /<strong data-order-total>\$88\.90<\/strong>/, "32 + 3 × 15 + 11.90 shipping to the EU");
  });

  it("refuses what it cannot sell: no shipping there, sold out, not on sale, too many", async () => {
    const thailand = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-walking-robot" } }], context: { address_country: "TH" } } });
    assert.equal(thailand.isError, true);
    assert.equal(thailand.structuredContent.messages[0].code, "region_restricted");
    assert.equal(thailand.structuredContent.continue_url, `${SITE}/`);
    const soldOut = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-dino-figures" } }] } });
    assert.equal(soldOut.structuredContent.messages[0].code, "out_of_stock");
    const draft = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-magnetic-tiles" } }] } });
    assert.equal(draft.structuredContent.messages[0].code, "not_found");
    const mixed = await tool("create_checkout", { checkout: { line_items: [{ item: { id: "tt-dino-figures" } }, { item: { id: "tt-rc-racer" }, quantity: 500 }] } });
    assert.equal(mixed.structuredContent.continue_url, `${SITE}/order?product=tt-rc-racer&qty=95`, "clamped to the stock, the sold-out one left out");
    assert.deepEqual(mixed.structuredContent.messages.filter((message) => message.type === "warning").map((message) => message.code).sort(), ["out_of_stock", "quantity_adjusted"]);
    assert.equal((await rpc("tools/call", { name: "create_checkout", arguments: { checkout: { line_items: [] } } })).body.error.code, -32602);
  });

  it("a buy link for a product no longer on sale opens an empty order, and an unknown country picks none", async () => {
    const page = await get("/order?product=tt-magnetic-tiles&qty=1&country=ZZ");
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /data-product-id="tt-magnetic-tiles"/);
    assert.doesNotMatch(page.text, /<option value="[A-Z]{2}" selected>/);
    // The old ?add= link still works.
    assert.match((await get("/order?add=tt-rc-racer&qty=2")).text, /data-product-id="tt-rc-racer"[\s\S]*?value="2"/);
  });
});

describe("machine-readable data", () => {
  it("serves a Google Merchant Center feed of the listed products, shipping per country included", async () => {
    const { status, text, headers } = await get("/feeds/google.xml");
    assert.equal(status, 200);
    assert.equal(headers.get("content-type"), "application/xml; charset=utf-8");
    assert.match(headers.get("cache-control"), /public, max-age=300/);
    assert.match(headers.get("etag"), /^W\/"/);
    assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/);
    const items = [...text.matchAll(/<item>(.*?)<\/item>/g)].map((match) => match[1]);
    assert.equal(items.length, 10, "every listed product, sold out included; no draft, no unpriced one");
    for (const item of items) {
      for (const field of ["id", "title", "description", "link", "availability", "price", "condition", "brand"]) {
        assert.match(item, new RegExp(`<g:${field}>[^<]+</g:${field}>`), `${field} in ${item.slice(0, 80)}`);
      }
    }
    // Google requires a photo: the two demo products without one go in without image_link, and Merchant Center will say so.
    assert.equal(items.filter((item) => /<g:image_link>https:\/\/[^<]+<\/g:image_link>/.test(item)).length, 8);
    assert.doesNotMatch(text, /tt-magnetic-tiles|tt-xylophone/);
    const robot = items.find((item) => item.includes("<g:id>tt-walking-robot</g:id>"));
    assert.match(robot, /<g:price>24\.00 USD<\/g:price>/);
    assert.match(robot, /<g:availability>in_stock<\/g:availability>/);
    assert.match(robot, /<g:condition>new<\/g:condition>/);
    assert.match(robot, /<g:brand>Tumbleberry Toys<\/g:brand>/);
    assert.match(robot, /<g:identifier_exists>no<\/g:identifier_exists>/);
    assert.match(robot, /<g:link>https:\/\/tumbleberry-toys\.example\/products\/tt-walking-robot<\/g:link>/);
    assert.match(robot, /<g:image_link>https:\/\/tumbleberry-toys\.example\/images\/tt-walking-robot\/0<\/g:image_link><g:additional_image_link>https:\/\/tumbleberry-toys\.example\/images\/tt-walking-robot\/1<\/g:additional_image_link>/);
    const shipping = [...robot.matchAll(/<g:shipping>(.*?)<\/g:shipping>/g)].map((match) => match[1]);
    assert.equal(shipping.length, 22, "one per country checkout offers");
    assert.equal(shipping[0], "<g:country>US</g:country><g:service>United States</g:service><g:price>8.90 USD</g:price><g:min_transit_time>6</g:min_transit_time><g:max_transit_time>10</g:max_transit_time>");
    assert.match(items.find((item) => item.includes("<g:id>tt-dino-figures</g:id>")), /<g:availability>out_of_stock<\/g:availability>/);
    // A price past a zone's free-shipping threshold ships free in the feed too.
    product("tt-chef-kitchen").price = 80;
    env = envFor();
    const kitchen = [...(await get("/feeds/google.xml")).text.matchAll(/<item>(.*?)<\/item>/g)].map((match) => match[1]).find((item) => item.includes("tt-chef-kitchen"));
    assert.match(kitchen, /<g:country>US<\/g:country><g:service>United States<\/g:service><g:price>0\.00 USD<\/g:price>/);
  });

  it("publishes a UCP business profile: catalog search and lookup over this site's MCP endpoint", async () => {
    const { status, headers, json } = await get("/.well-known/ucp");
    assert.equal(status, 200);
    assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
    assert.match(headers.get("cache-control"), /^public, max-age=(\d+)$/);
    assert.ok(Number(/max-age=(\d+)/.exec(headers.get("cache-control"))[1]) >= 60);
    const { ucp } = json();
    assert.equal(ucp.version, "2026-08-25");
    assert.deepEqual(ucp.services["dev.ucp.shopping"][0].transport, "mcp");
    assert.equal(ucp.services["dev.ucp.shopping"][0].endpoint, `${SITE}/mcp`);
    assert.deepEqual(Object.keys(ucp.capabilities), ["dev.ucp.shopping.catalog.search", "dev.ucp.shopping.catalog.lookup"]);
    assert.deepEqual(ucp.payment_handlers, {});
    assert.equal((await get("/.well-known/ucp/")).status, 200, "no redirect for a trailing slash");
  });

  it("serves /agents.md, and /llms.txt points assistants at the MCP server, the feed and the profile", async () => {
    const agents = await get("/agents.md");
    assert.equal(agents.status, 200);
    assert.equal(agents.headers.get("content-type"), "text/markdown; charset=utf-8");
    assert.match(agents.text, /^# Agent Instructions — Tumbleberry Toys\n/);
    assert.match(agents.text, /Connect to `https:\/\/tumbleberry-toys\.example\/mcp`: MCP over Streamable HTTP, no sign-in, read-only/);
    for (const name of ["search_catalog", "lookup_catalog", "get_product", "create_checkout"]) assert.match(agents.text, new RegExp(`\`${name}\``));
    assert.match(agents.text, /Claude: Customize → Connectors → \+ Add → Add custom connector/);
    assert.match(agents.text, /Never ask the buyer for card, PayPal or password details/);
    assert.match(agents.text, /- \*\*Returns & warranty\*\*: https:\/\/tumbleberry-toys\.example\/pages\/returns/);
    assert.match(agents.text, /Note: this is a demo store/);
    const llms = (await get("/llms.txt")).text;
    assert.match(llms, /## For AI assistants and agents\n\n- MCP server \(no sign-in, read-only\): https:\/\/tumbleberry-toys\.example\/mcp\./);
    assert.match(llms, /- How to use this shop as an agent: https:\/\/tumbleberry-toys\.example\/agents\.md/);
    assert.match(llms, /- Product feed \(Google Merchant Center format\): https:\/\/tumbleberry-toys\.example\/feeds\/google\.xml/);
  });

  it("a blog post's legacy path cannot take over the agent addresses", async () => {
    api.state.records.bas_posts[0].fields["legacy-paths"] = JSON.stringify(["/agents.md", "/mcp", "/feeds/google.xml", "/.well-known/ucp"]);
    assert.match((await get("/agents.md")).text, /^# Agent Instructions/);
    assert.equal((await get("/feeds/google.xml")).status, 200);
    assert.equal((await get("/.well-known/ucp")).status, 200);
  });
});

describe("pure helpers", () => {
  it("reads countries, query words, minor units and the duty sentence", () => {
    assert.equal(countryCodeOf("th"), "TH");
    assert.equal(countryCodeOf("Philippines"), "PH");
    assert.equal(countryCodeOf("Viet Nam"), "");
    assert.equal(countryCodeOf("Vietnam"), "VN");
    assert.equal(countryCodeOf("UK"), "GB");
    assert.deepEqual(queryTokens("Find me a phone under $200 that ships to Thailand"), ["phone", "thailand"]);
    assert.deepEqual(queryTokens("小米 手机 5G"), ["小米", "手机", "5g"]);
    assert.equal(toMinor(24, "USD"), 2400);
    assert.equal(toMinor(1500, "JPY"), 1500);
    assert.equal(dutiesNote({ shippingNote: "Ships in 2 days. Import duty is paid by the buyer on delivery. Thanks!" }), "Import duty is paid by the buyer on delivery.");
    assert.equal(dutiesNote({ shippingNote: "关税由买家在收货时支付。" }), "关税由买家在收货时支付。");
    assert.equal(dutiesNote({ shippingNote: "We ship fast." }), "");
    assert.equal(decodeHeaderValue(`=?base64?${btoa("get_product")}?=`), "get_product");
    assert.equal(decodeHeaderValue("plain"), "plain");
  });
});
