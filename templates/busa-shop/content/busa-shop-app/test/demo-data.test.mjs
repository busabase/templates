// The template's own files: sample rows against the Bases they install into,
// the toy list conversion, and the live-site probe the daily check runs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { certificateTypeId, parseCsv, planCertificates, planProducts, productFields } from "../../../scripts/import-catalog.mjs";
import { probeSite } from "../../../scripts/probe-site.mjs";
import worker from "../vendor/worker.js";
import { serveWorker } from "../scripts/preview.mjs";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { DEMO_DIR, demoState } from "./fixtures.mjs";
import { EMAIL_PATTERN, ORDER_ID_PATTERN, PHONE_PATTERN, WEBSITE_ORDER_FIELDS } from "../src/orders.js";

const contentDir = fileURLToPath(new URL("../../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const readRows = async (path) =>
  (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

describe("sample rows match their Bases", () => {
  for (const name of ["orders", "settings", "reports"]) {
    it(`${name}: every value fits its field`, async () => {
      const base = await readJson(`${contentDir}${name}/base.json`);
      const rows = await readRows(`${contentDir}${name}/records.ndjson`);
      assert.ok(rows.length >= 1 && rows.length <= 50);
      const fields = new Map(base.fields.map((field) => [field.slug, field]));
      base.fields.forEach((field, index) => assert.equal(field.position, index, `${field.slug} position`));
      for (const row of rows) {
        for (const field of base.fields.filter((item) => item.required)) {
          assert.ok(row.fields[field.slug] !== undefined && row.fields[field.slug] !== "", `${row.key}: ${field.slug} is required`);
        }
        for (const [slug, value] of Object.entries(row.fields)) {
          const field = fields.get(slug);
          assert.ok(field, `${row.key}: unknown field ${slug}`);
          if (value === "" || value === null) continue;
          const choices = new Set((field.options.choices ?? []).map((choice) => choice.id));
          if (field.type === "select") assert.ok(choices.has(value), `${row.key}: ${slug}=${value}`);
          if (field.type === "multiselect") assert.ok(value.every((item) => choices.has(item)), `${row.key}: ${slug}`);
          if (field.type === "number") assert.equal(typeof value, "number", `${row.key}: ${slug}`);
          if (field.type === "checkbox") assert.equal(typeof value, "boolean", `${row.key}: ${slug}`);
          if (field.type === "email") assert.match(value, EMAIL_PATTERN, `${row.key}: ${slug}`);
          if (field.type === "phone") assert.match(value, PHONE_PATTERN, `${row.key}: ${slug}`);
          if (field.type === "date") assert.ok(Number.isFinite(Date.parse(value)), `${row.key}: ${slug}`);
          if (["text", "longtext", "url"].includes(field.type)) assert.equal(typeof value, "string", `${row.key}: ${slug}`);
        }
      }
      for (const view of base.views) {
        for (const filter of view.config.filters) assert.ok(fields.has(filter.fieldSlug), `${view.slug} filter`);
        for (const sort of view.config.sorts) assert.ok(fields.has(sort.fieldSlug), `${view.slug} sort`);
      }
    });
  }

  it("every sample order is labelled fictional and uses reserved example domains", async () => {
    for (const row of await readRows(`${contentDir}orders/records.ndjson`)) {
      assert.match(row.fields["order-id"], ORDER_ID_PATTERN);
      assert.match(row.fields.title, /fictional demo/);
      assert.match(row.fields["internal-note"], /^Fictional demo data/);
      assert.match(row.fields.email, /@example\.(com|net|org)$/);
      const items = JSON.parse(row.fields.items);
      const total = items.reduce((sum, item) => sum + item.line_total, 0);
      assert.equal(Math.round(total * 100) / 100, row.fields.total);
    }
  });

  it("the website writes only fields the Orders Base has", async () => {
    const base = await readJson(`${contentDir}orders/base.json`);
    const slugs = new Set(base.fields.map((field) => field.slug));
    for (const slug of WEBSITE_ORDER_FIELDS) assert.ok(slugs.has(slug), slug);
    assert.ok(slugs.has("internal-note") && slugs.has("reply-draft"));
  });
});

describe("the toy list", () => {
  const hubCertificateChoices = async () => {
    const base = await readJson(`${contentDir}../../busa-product-hub/content/certificates/base.json`);
    return base.fields.find((field) => field.slug === "cert-type").options.choices;
  };

  it("plans 12 products and 39 certificates, every type an option of busa-product-hub's Certificates table", async () => {
    const { products, skipped, notes } = planProducts(parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8")));
    const { certificates } = planCertificates(
      parseCsv(await readFile(`${DEMO_DIR}toy-certificates.csv`, "utf8")),
      new Set(products.map((product) => product.productId)),
    );
    assert.equal(products.length, 12);
    assert.deepEqual(skipped, []);
    assert.equal(certificates.length, 39);
    const choices = await hubCertificateChoices();
    for (const cert of certificates) assert.equal(certificateTypeId(choices, cert.type), cert.type, `${cert.productId} ${cert.type}`);
    assert.ok(certificates.every((cert) => !cert.number.includes("·")), "no standard-prefix convention left");
    assert.deepEqual(
      [...new Set(certificates.map((cert) => cert.type))].sort(),
      ["ASTM F963", "CE", "CPSIA / CPC", "EN 71", "FCC", "UKCA", "UN38.3"],
    );
    assert.deepEqual(notes.filter((note) => /no photo|no price/.test(note)), [
      "tt-xylophone: no price in the list, so the shop will not list it",
      "tt-chef-kitchen: no photo in the list",
      "tt-rainbow-kite: no photo in the list",
    ]);
    for (const product of products) assert.ok(product.text.vendor.includes("(fictional)"));
  });

  it("builds product rows without inventing anything", async () => {
    const { products } = planProducts(parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8")));
    const xylophone = productFields(products.find((product) => product.productId === "tt-xylophone"));
    assert.equal(JSON.parse(xylophone.pricing).current_price, undefined, "an empty price stays empty");
    const robotPlan = products.find((product) => product.productId === "tt-walking-robot");
    const robot = productFields(robotPlan, {}, robotPlan.imageRefs.map((file) => ({ file, sha256: "", url: `https://cdn.example/${file}` })));
    assert.deepEqual(JSON.parse(robot.gallery), ["https://cdn.example/walking-robot.svg", "https://cdn.example/walking-robot-box.svg"]);
    assert.equal(JSON.parse(robot.pricing).gross_margin_pct, 59.2);
    assert.equal(JSON.parse(robot.content).attributes.moq, 48);
    assert.deepEqual(JSON.parse(robot.inventory), { available: 180 }, "only what the list says: no invented on-hand figure");
  });

  it("parses quoted CSV fields with commas, quotes and newlines", () => {
    assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n'), [{ __line: 2, a: "x, y", b: 'say "hi"\nthere' }]);
  });
});

describe("probe-site.mjs against the running site", () => {
  let api;
  let server;
  let site;
  before(async () => {
    api = await startFakeBusabase({ nodes: [], records: {} });
    Object.assign(api.state, await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}` }));
    server = await serveWorker({ worker, port: 0, env: { BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo" } });
    site = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await api.close();
  });

  it("reports what a stranger sees", async () => {
    const result = await probeSite(site);
    assert.equal(result.reachable, true);
    assert.equal(result.home.charset, true);
    assert.equal(result.home.demoNotice, true);
    assert.equal(result.home.setupPage, false);
    assert.equal(result.status.products, 10);
    assert.equal(result.sitemap.productUrls, 10);
    assert.equal(result.robots.status, 200);
    assert.deepEqual([result.image.status, result.image.type], [200, "image/svg+xml"]);
  });

  it("serves the static files from public/", async () => {
    const css = await fetch(`${site}/static/shop.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.equal((await fetch(`${site}/static/nope.css`)).status, 404);
  });

  it("reports an unreachable site as unreachable", async () => {
    const result = await probeSite("http://127.0.0.1:9", { timeoutMs: 2000 });
    assert.equal(result.reachable, false);
    assert.equal(result.home.status, 0);
  });
});
