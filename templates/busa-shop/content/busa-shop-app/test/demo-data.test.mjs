// The template's own files: sample rows against the Bases they install into,
// the toy list conversion, and the live-site probe the daily check runs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { certificateTypeId, parseCsv, planCertificates, planProducts, productFields, shopProductFields } from "../../../scripts/import-products.mjs";
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

  it("the sample report is marked as the sample and agrees with itself", async () => {
    const base = await readJson(`${contentDir}reports/base.json`);
    const choices = new Set(base.fields.find((field) => field.slug === "issue-types").options.choices.map((choice) => choice.id));
    const [sample, ...others] = await readRows(`${contentDir}reports/records.ndjson`);
    assert.equal(others.length, 0);
    assert.equal(sample.fields.sample, true);
    assert.match(sample.fields.title, /\(sample report, fictional\)$/);
    const lines = sample.fields.issues.split("\n");
    assert.equal(sample.fields["issue-count"], lines.length, "issue-count = lines in Issues, waiting orders included");
    const used = new Set(lines.map((line) => /^- \[([a-z-]+)\] /.exec(line)?.[1]));
    assert.ok(!used.has(undefined), "every line starts with - [type]");
    assert.deepEqual([...used].sort(), [...sample.fields["issue-types"]].sort());
    for (const type of used) assert.ok(choices.has(type), type);
    assert.equal(sample.fields["orders-waiting"], lines.filter((line) => line.startsWith("- [orders-waiting]")).length);
    assert.equal(sample.fields.status, "open");
    assert.ok(sample.fields["owner-feedback"].includes("out of stock"));
  });

  it("every issue type SKILL.md tells the check to report is an option of Reports › Issue types, and nothing else", async () => {
    const skill = await readFile(`${contentDir}../SKILL.md`, "utf8");
    const check = skill.slice(skill.indexOf("## Daily shop check"), skill.indexOf("## Honest limits"));
    const named = new Set([
      ...[...check.matchAll(/^\| `([a-z-]+)` \|/gm)].map((match) => match[1]),
      ...[...check.matchAll(/^`([a-z-]+)`: /gm)].map((match) => match[1]),
      ...[...check.matchAll(/^- `([a-z-]+)`(?: if|,)/gm)].map((match) => match[1]),
      ...[...check.matchAll(/`([a-z-]+)` line/g)].map((match) => match[1]),
      ...[...check.matchAll(/is `(other)`/g)].map((match) => match[1]),
    ]);
    const base = await readJson(`${contentDir}reports/base.json`);
    const choices = base.fields.find((field) => field.slug === "issue-types").options.choices.map((choice) => choice.id);
    assert.deepEqual([...named].sort(), [...choices].sort());
    const listed = /Issue types:\n([^]*?)\.\n/.exec(skill.slice(skill.indexOf("### Reports")))[1].match(/`([a-z-]+)`/g).map((item) => item.slice(1, -1));
    assert.deepEqual(listed.sort(), [...choices].sort(), "the Reports section lists the same types");
  });

  it("the website writes only fields the Orders Base has", async () => {
    const base = await readJson(`${contentDir}orders/base.json`);
    const slugs = new Set(base.fields.map((field) => field.slug));
    for (const slug of WEBSITE_ORDER_FIELDS) assert.ok(slugs.has(slug), slug);
    assert.ok(slugs.has("internal-note") && slugs.has("reply-draft"));
  });
});

describe("the toy list", () => {
  const certificateChoices = async (template) => {
    const base = await readJson(`${contentDir}../../${template}/content/certificates/base.json`);
    return base.fields.find((field) => field.slug === "cert-type").options.choices;
  };

  it("the shop's Certificates table has the product hub's fields and types, so one importer writes both", async () => {
    const shop = await readJson(`${contentDir}certificates/base.json`);
    const hub = await readJson(`${contentDir}../../busa-product-hub/content/certificates/base.json`);
    assert.deepEqual(shop.fields, hub.fields);
    assert.equal(shop.fields.find((field) => field.slug === "product").options.targetBaseSlug, "products", "linked to this folder's Products");
  });

  it("every field the importer writes, and the website reads, is a column of the shop's Products", async () => {
    const base = await readJson(`${contentDir}products/base.json`);
    const fields = new Map(base.fields.map((field) => [field.slug, field]));
    base.fields.forEach((field, index) => assert.equal(field.position, index, `${field.slug} position`));
    const { products } = planProducts(parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8")), { source: "toy-catalog.csv" });
    for (const product of products) {
      const written = { ...shopProductFields(product, {}, [{ file: "a.svg", sha256: "", url: "https://cdn.example/a.svg" }, { file: "b.svg", sha256: "", url: "https://cdn.example/b.svg" }]), ref: 1 };
      for (const [slug, value] of Object.entries(written)) {
        const field = fields.get(slug);
        assert.ok(field, `${product.productId}: ${slug} is not a column`);
        if (field.type === "number") assert.equal(typeof value, "number", `${slug}`);
        if (field.type === "select") assert.ok(field.options.choices.some((choice) => choice.id === value), `${slug}=${value}`);
      }
    }
    for (const slug of ["product-id", "name", "status", "price", "currency", "stock", "image", "gallery", "description", "highlights", "specs", "brand", "model", "warranty", "returns", "tags", "ref"]) {
      assert.ok(fields.has(slug), `the website reads ${slug}`);
    }
    assert.deepEqual(fields.get("status").options.choices.map((choice) => choice.id), ["active", "draft", "archive"]);
    for (const view of base.views) {
      for (const filter of view.config.filters) assert.ok(fields.has(filter.fieldSlug), `${view.slug} filter`);
      for (const sort of view.config.sorts) assert.ok(fields.has(sort.fieldSlug), `${view.slug} sort`);
      for (const slug of view.config.visibleFieldSlugs) assert.ok(fields.has(slug), `${view.slug} shows ${slug}`);
    }
  });

  it("plans 12 products and 39 certificates, every type an option of the shop's (and busa-product-hub's) Certificates table", async () => {
    const { products, skipped, notes } = planProducts(parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8")));
    const { certificates } = planCertificates(
      parseCsv(await readFile(`${DEMO_DIR}toy-certificates.csv`, "utf8")),
      new Set(products.map((product) => product.productId)),
    );
    assert.equal(products.length, 12);
    assert.deepEqual(skipped, []);
    assert.equal(certificates.length, 39);
    for (const template of ["busa-shop", "busa-product-hub"]) {
      const choices = await certificateChoices(template);
      for (const cert of certificates) assert.equal(certificateTypeId(choices, cert.type), cert.type, `${template}: ${cert.productId} ${cert.type}`);
    }
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
    assert.equal(xylophone.price, undefined, "an empty price stays empty");
    assert.equal(JSON.parse(xylophone.pricing).current_price, undefined, "and no price hides in the JSON");
    const robotPlan = products.find((product) => product.productId === "tt-walking-robot");
    const robot = productFields(robotPlan, {}, robotPlan.imageRefs.map((file) => ({ file, sha256: "", url: `https://cdn.example/${file}` })));
    assert.deepEqual(JSON.parse(robot.gallery), ["https://cdn.example/walking-robot.svg", "https://cdn.example/walking-robot-box.svg"]);
    assert.equal(robot.price, 24, "the price is the Price column");
    assert.equal(robot.currency, "USD");
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
    Object.assign(api.state, await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop" }));
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
    // Every photo of every listed product: 8 listed products have photos, the robot two.
    assert.deepEqual(result.productPages, { checked: 10, failed: [] });
    assert.equal(result.images.checked, 9);
    assert.deepEqual(result.images.failed, []);
  });

  it("names each listed product photo that does not load", async () => {
    const asset = api.state.assets["walking-robot-box.svg"];
    delete api.state.assets["walking-robot-box.svg"];
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = await probeSite(site);
      assert.equal(result.images.checked, 9);
      assert.deepEqual(
        result.images.failed.map((photo) => [photo.product, photo.status, photo.url.endsWith("/images/tt-walking-robot/1")]),
        [["tt-walking-robot", 404, true]],
      );
    } finally {
      api.state.assets["walking-robot-box.svg"] = asset;
    }
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
