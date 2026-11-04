// scripts/import-catalog.mjs with the real busabase-sdk against the fake
// Busabase API: the first run, the idempotent second run, updates that keep the
// owner's own values, dry runs, and every refusal the summary reports.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createBusabaseClient, uploadAsset } from "busabase-sdk";
import { createAirAppRecords } from "busabase-sdk/airapp";
import { formatSummary, resolveProductHub, runImport } from "../../../scripts/import-catalog.mjs";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { DEMO_DIR, NODES } from "./fixtures.mjs";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../../../scripts/import-catalog.mjs", import.meta.url));
const hubCertificatesBase = JSON.parse(
  await readFile(fileURLToPath(new URL("../../../../busa-product-hub/content/certificates/base.json", import.meta.url)), "utf8"),
);
const sdk = { createBusabaseClient, uploadAsset, createAirAppRecords };
const CATALOG = `${DEMO_DIR}toy-catalog.csv`;
const CERTIFICATES = `${DEMO_DIR}toy-certificates.csv`;
const IMAGES = `${DEMO_DIR}images`;

let api;
const env = () => ({ BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo" });
const run = (options = {}) =>
  runImport({ catalogPath: CATALOG, certificatesPath: CERTIFICATES, imagesDir: IMAGES, env: env(), sdk, now: () => new Date("2026-11-05T09:00:00Z"), ...options });
const products = () => api.state.records.bas_products;
const certificates = () => api.state.records.bas_certificates;
const product = (id) => products().find((row) => row.fields["product-id"] === id);
const writes = () => api.log.filter((entry) => entry.method !== "GET");

const freshState = ({ withToyTypes = true } = {}) => {
  const fields = structuredClone(hubCertificatesBase.fields);
  if (!withToyTypes) {
    const type = fields.find((field) => field.slug === "cert-type");
    type.options.choices = type.options.choices.filter((choice) => !["EN 71", "ASTM F963", "CPSIA / CPC"].includes(choice.id));
  }
  return {
    nodes: Object.values(NODES),
    records: { bas_products: [], bas_certificates: [], bas_settings: [], bas_orders: [], bas_reports: [] },
    bases: { bas_certificates: { name: "Certificates", fields } },
    files: {},
    assets: {},
  };
};

before(async () => {
  api = await startFakeBusabase(freshState());
});

beforeEach(() => {
  for (const key of Object.keys(api.state)) delete api.state[key];
  Object.assign(api.state, freshState());
  Object.assign(api.options, { failCreates: false, queueCreates: false, queueUpdates: false, failReads: false });
  api.reset();
  api.log.length = 0;
});

after(async () => api.close());

describe("import-catalog.mjs", () => {
  it("imports products, photos and linked certificates in one run", async () => {
    const summary = await run();
    assert.deepEqual(summary.products, { created: 12, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.certificates, { created: 39, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.images, { uploaded: 11, reused: 0, missing: 0 });
    assert.equal(summary.productsTable, "busa-product-hub-products");

    const robot = product("tt-walking-robot").fields;
    assert.equal(robot.name, "Walking Robot Buddy");
    assert.equal(robot.ref, 1);
    assert.equal(robot.lifecycle, "active");
    assert.match(robot.image, new RegExp(`^${api.origin}/assets/k\\d+-walking-robot\\.svg$`));
    assert.equal(JSON.parse(robot.gallery).length, 2);
    assert.deepEqual(JSON.parse(robot.pricing), { currency: "USD", current_price: 24, target_price: 24, landed_cost: 9.8, gross_margin_pct: 59.2 });
    const content = JSON.parse(robot.content);
    assert.equal(content.images_ready, true);
    assert.deepEqual(content.image_files.map((item) => item.file), ["walking-robot.svg", "walking-robot-box.svg"]);
    assert.match(content.image_files[0].sha256, /^[0-9a-f]{64}$/);
    // The uploaded bytes are the file's bytes, and the URL serves them.
    const stored = api.state.assets[robot.image.split("/assets/")[1]];
    assert.deepEqual(stored.bytes, await readFile(`${IMAGES}/walking-robot.svg`));

    const xylophone = product("tt-xylophone").fields;
    assert.equal(JSON.parse(xylophone.pricing).current_price, undefined, "no price in the list, none written");
    const kitchen = product("tt-chef-kitchen").fields;
    assert.equal(kitchen.image, undefined, "no photo in the list, no image field written");

    const robotCerts = certificates().filter((row) => row.fields.product[0] === product("tt-walking-robot").id);
    assert.deepEqual(robotCerts.map((row) => row.fields["cert-type"]).sort(), ["ASTM F963", "CPSIA / CPC", "EN 71", "UKCA"]);
    assert.deepEqual(robotCerts.find((row) => row.fields["cert-type"] === "EN 71").fields, {
      product: [product("tt-walking-robot").id],
      "cert-type": "EN 71",
      "cert-number": "TT-EN71-25-0101",
      issuer: "Northbridge Test Labs (fictional)",
      "issued-date": "2025-04-10",
      "expiry-date": "2027-04-10",
      "source-note": "toy-certificates.csv line 2",
    });
    assert.ok(writes().every((entry) => entry.method === "PUT" || !JSON.parse(entry.body).autoMerge), "never sends autoMerge");
    assert.ok(api.log.filter((entry) => entry.path.startsWith("/api/")).every((entry) => entry.auth === `Bearer ${TEST_KEY}`));
  });

  it("a second run changes nothing: no writes, no uploads", async () => {
    await run();
    const before = JSON.stringify(api.state.records);
    api.log.length = 0;
    const summary = await run();
    assert.deepEqual(summary.products, { created: 0, updated: 0, unchanged: 12, skipped: 0, queued: 0 });
    assert.deepEqual(summary.certificates, { created: 0, updated: 0, unchanged: 39, skipped: 0, queued: 0 });
    assert.deepEqual(summary.images, { uploaded: 0, reused: 11, missing: 0 });
    assert.deepEqual(writes(), []);
    assert.equal(JSON.stringify(api.state.records), before);
  });

  it("updates only what changed in the list, and keeps what the owner added", async () => {
    await run();
    const bear = product("tt-cuddle-bear");
    // The owner adds things the list does not know about.
    const pricing = JSON.parse(bear.fields.pricing);
    bear.fields.pricing = JSON.stringify({ ...pricing, map_price: 14 });
    bear.fields.content = JSON.stringify({ ...JSON.parse(bear.fields.content), score: 91 });
    bear.fields.owner = "Mia";
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-"));
    try {
      const csv = (await readFile(CATALOG, "utf8")).replace(/(tt-cuddle-bear,TT-PLS-04,[^\n]*?,active,active,)15\.00,/, "$116.50,");
      assert.notEqual(csv, await readFile(CATALOG, "utf8"), "the test edits the bear's price");
      await writeFile(path.join(dir, "toy-catalog.csv"), csv);
      api.log.length = 0;
      const summary = await run({ catalogPath: path.join(dir, "toy-catalog.csv") });
      assert.deepEqual(summary.products, { created: 0, updated: 1, unchanged: 11, skipped: 0, queued: 0 });
      assert.equal(summary.certificates.unchanged, 39);
      const update = writes().find((entry) => entry.path.includes("/records/"));
      assert.deepEqual(Object.keys(JSON.parse(update.body).fields).sort(), ["pricing", "updated-at"]);
      assert.equal(JSON.parse(update.body).baseCommitId, `cmt_${bear.id}_0`);
      const after = product("tt-cuddle-bear").fields;
      assert.deepEqual(JSON.parse(after.pricing), { ...pricing, current_price: 16.5, target_price: 16.5, gross_margin_pct: 69.1, map_price: 14 });
      assert.equal(JSON.parse(after.content).score, 91);
      assert.equal(after.owner, "Mia");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("an empty cell means not provided: it never clears a stored value", async () => {
    await run();
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-"));
    try {
      const csv = (await readFile(CATALOG, "utf8")).replace("Soft 30 cm bear with embroidered eyes", "");
      assert.notEqual(csv, await readFile(CATALOG, "utf8"));
      await writeFile(path.join(dir, "toy-catalog.csv"), csv);
      api.log.length = 0;
      const summary = await run({ catalogPath: path.join(dir, "toy-catalog.csv") });
      assert.equal(summary.products.unchanged, 12);
      assert.deepEqual(writes(), []);
      assert.equal(product("tt-cuddle-bear").fields.subtitle, "Soft 30 cm bear with embroidered eyes");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("--dry-run reads, writes nothing and uploads nothing", async () => {
    const summary = await run({ dryRun: true });
    assert.deepEqual(summary.products, { created: 12, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.certificates, { created: 39, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.equal(summary.images.uploaded, 11);
    assert.deepEqual(writes(), []);
    assert.equal(products().length, 0);
    assert.match(formatSummary(summary), /^Dry run, nothing was written or uploaded\./);
    assert.match(formatSummary(summary), /Products: 12 would be created/);
  });

  it("a dry run after a real run reports nothing to do", async () => {
    await run();
    api.log.length = 0;
    const summary = await run({ dryRun: true });
    assert.deepEqual([summary.products.unchanged, summary.certificates.unchanged, summary.images.uploaded], [12, 39, 0]);
    assert.deepEqual(writes(), []);
  });

  it("skips toy certificate types an older product hub does not offer, and says why", async () => {
    Object.assign(api.state, freshState({ withToyTypes: false }));
    const summary = await run();
    assert.equal(summary.products.created, 12);
    // UKCA, CE, FCC, UN38.3 still land; EN 71 / ASTM F963 / CPSIA / CPC cannot.
    assert.equal(summary.certificates.created, 7); // 4 UKCA, 1 CE, 1 FCC, 1 UN38.3
    assert.equal(summary.certificates.skipped, 32);
    const reason = summary.skipped.find((item) => item.kind === "certificate").reason;
    assert.match(reason, /type "EN 71" is not an option of the Certificates table .* Update Busa Product Hub \(0\.3\.0/);
    assert.ok(certificates().every((row) => ["UKCA", "CE", "FCC", "UN38.3"].includes(row.fields["cert-type"])));
  });

  it("leaves a missing photo out, imports the product, and notes it", async () => {
    const summary = await run({ imagesDir: path.join(appDir, "public/static") });
    assert.equal(summary.products.created, 12);
    assert.equal(summary.images.missing, 11);
    assert.ok(summary.notes.some((note) => note === `tt-walking-robot: photo walking-robot.svg not found in ${path.join(appDir, "public/static")}, left out`));
    assert.equal(product("tt-walking-robot").fields.image, undefined);
  });

  it("uses an https photo URL in the list as it is, without uploading", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-"));
    try {
      const csv = (await readFile(CATALOG, "utf8")).replace("cuddle-bear.svg", "https://cdn.example/bear.png");
      await writeFile(path.join(dir, "toy-catalog.csv"), csv);
      const summary = await run({ catalogPath: path.join(dir, "toy-catalog.csv") });
      assert.equal(summary.images.uploaded, 10);
      assert.equal(product("tt-cuddle-bear").fields.image, "https://cdn.example/bear.png");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips bad rows with reasons and imports the rest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-"));
    try {
      const catalog = await readFile(CATALOG, "utf8");
      const lines = catalog.trimEnd().split("\n");
      await writeFile(path.join(dir, "catalog.csv"), [...lines, lines[1], lines[2].replace("tt-rainbow-blocks", "bad id!")].join("\n"));
      await writeFile(
        path.join(dir, "certs.csv"),
        "product_id,cert_type,cert_number,issuer,issued_date,expiry_date\ntt-walking-robot,EN 71,N-1,Lab,2025-01-01,2027-01-01\nnope,EN 71,N-2,Lab,,\ntt-cuddle-bear,EN 71,,Lab,,\ntt-cuddle-bear,Made Up,N-3,Lab,,2027-13-40\n",
      );
      const summary = await run({ catalogPath: path.join(dir, "catalog.csv"), certificatesPath: path.join(dir, "certs.csv") });
      assert.equal(summary.products.created, 12);
      assert.equal(summary.products.skipped, 2);
      assert.equal(summary.certificates.created, 1);
      assert.equal(summary.certificates.skipped, 3);
      const reasons = summary.skipped.map((item) => item.reason);
      assert.ok(reasons.some((reason) => /line 14: product_id appears twice/.test(reason)));
      assert.ok(reasons.some((reason) => /line 15: product_id "bad id!" is missing or not usable/.test(reason)));
      assert.ok(reasons.some((reason) => /product_id "nope" is not in the product list/.test(reason)));
      assert.ok(reasons.some((reason) => /cert_number is empty/.test(reason)));
      assert.ok(reasons.some((reason) => /type "Made Up" is not an option/.test(reason)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("without write access, reports products waiting for review and links no certificates to them", async () => {
    api.options.queueCreates = true;
    const summary = await run();
    assert.equal(summary.products.queued, 12);
    assert.equal(summary.products.created, 0);
    assert.equal(summary.certificates.skipped, 39);
    assert.match(summary.skipped.at(-1).reason, /was not saved \(waiting for review or skipped\)/);
    assert.match(formatSummary(summary), /12 waiting for review/);
  });

  it("stops with a clear error when Busa Product Hub is not installed or there are two", async () => {
    api.state.nodes = api.state.nodes.filter((node) => node.metadata.appId !== "busa-product-hub");
    await assert.rejects(run(), /Busa Product Hub is not installed in this workspace: no Products table found\. Install the Busa Product Hub template first/);
    assert.deepEqual(writes(), []);
    const second = { ...NODES.products, id: "nod_hub2_products", parentId: "nod_hub2", baseId: "bas_products_2", slug: "busa-product-hub-2-products" };
    assert.throws(() => resolveProductHub([NODES.products, second], ""), /2 Busa Product Hub Products tables .* --products-base/);
    assert.equal(resolveProductHub([NODES.products, NODES.certificates, second], "busa-product-hub-2-products").productsBaseId, "bas_products_2");
    assert.equal(resolveProductHub([{ ...NODES.products, metadata: {} }], "").productsBaseId, "bas_products", "default slug when unstamped");
  });

  it("needs BUSABASE_BASE_URL and the catalogue's columns", async () => {
    await assert.rejects(run({ env: {} }), /Set BUSABASE_BASE_URL/);
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-"));
    try {
      await writeFile(path.join(dir, "c.csv"), "product_id,name\ntt-a,A\n");
      await assert.rejects(run({ catalogPath: path.join(dir, "c.csv"), certificatesPath: "" }), /missing column\(s\): price, currency/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("import-catalog.mjs is self-contained", () => {
  it("imports only Node built-ins and busabase-sdk", async () => {
    const source = await readFile(scriptPath, "utf8");
    const specifiers = [...source.matchAll(/(?:^import\s[^"']*["']([^"']+)["']|import\(["']([^"']+)["']\))/gm)].map((match) => match[1] ?? match[2]);
    assert.ok(specifiers.length > 0);
    for (const specifier of specifiers) assert.match(specifier, /^(node:|busabase-sdk(\/airapp)?$)/, specifier);
  });

  it("runs as one file in an otherwise empty directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-import-alone-"));
    try {
      await copyFile(scriptPath, path.join(dir, "import-catalog.mjs"));
      await copyFile(CATALOG, path.join(dir, "toy-catalog.csv"));
      await copyFile(CERTIFICATES, path.join(dir, "toy-certificates.csv"));
      await symlink(IMAGES, path.join(dir, "images"));
      const exec = promisify(execFile);
      // Without busabase-sdk installed it says what to do.
      const missing = await exec(process.execPath, ["import-catalog.mjs", "toy-catalog.csv"], { cwd: dir, env: { ...process.env, ...env() } }).catch((error) => error);
      assert.match(missing.stderr, /busabase-sdk is not installed next to this script\. Run `npm i busabase-sdk`/);
      // "npm i busabase-sdk": here, the app's own installed copy.
      await symlink(path.join(appDir, "node_modules"), path.join(dir, "node_modules"));
      const { stdout } = await exec(process.execPath, ["import-catalog.mjs", "toy-catalog.csv", "--certificates", "toy-certificates.csv"], {
        cwd: dir,
        env: { ...process.env, ...env() },
      });
      assert.match(stdout, /Products: 12 created, 0 updated, 0 unchanged, 0 skipped/);
      assert.match(stdout, /Certificates: 39 created/);
      assert.match(stdout, /Photos: 11 uploaded/);
      const again = await exec(process.execPath, ["import-catalog.mjs", "toy-catalog.csv", "--certificates", "toy-certificates.csv"], {
        cwd: dir,
        env: { ...process.env, ...env() },
      });
      assert.match(again.stdout, /Products: 0 created, 0 updated, 12 unchanged/);
      assert.match(again.stdout, /Certificates: 0 created, 0 updated, 39 unchanged/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
