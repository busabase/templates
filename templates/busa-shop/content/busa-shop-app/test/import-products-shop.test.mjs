// scripts/import-products.mjs into the shop's OWN Products and Certificates
// (busa-shop 0.5.0 and later), with the real busabase-sdk and the toy list in
// assets/demo, against the fake Busabase API: plain columns an owner reads in
// the grid, the second run that changes nothing, the owner's own edits kept,
// the preview, which table it writes when a product hub is installed too, and
// that busa-product-hub carries the same file.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createBusabaseClient, uploadAsset } from "busabase-sdk";
import { createAirAppRecords } from "busabase-sdk/airapp";
import { formatMoveSummary, formatSummary, mergeLines, resolveTarget, runImport, runMovePhotos, SHOP_SPEC_LABELS, shopStatusFor } from "../../../scripts/import-products.mjs";
import { MESSAGES } from "../src/i18n.js";
import { specKeyFor } from "../src/details.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { BLOG_NODES, DEMO_DIR, NODES, SHOP_NODES, SHOP_ONLY_NODES, sampleRows, sampleSettingsFields } from "./fixtures.mjs";

const templates = new URL("../../../../", import.meta.url);
const readBase = async (template, name) => JSON.parse(await readFile(new URL(`${template}/content/${name}/base.json`, templates), "utf8"));
const shopProductsBase = await readBase("busa-shop", "products");
const shopCertificatesBase = await readBase("busa-shop", "certificates");
const hubProductsBase = await readBase("busa-product-hub", "products");
const hubCertificatesBase = await readBase("busa-product-hub", "certificates");
const SETTINGS = await sampleSettingsFields();
const sdk = { createBusabaseClient, uploadAsset, createAirAppRecords };
const CATALOG = `${DEMO_DIR}toy-catalog.csv`;
const CERTIFICATES = `${DEMO_DIR}toy-certificates.csv`;
const IMAGES = `${DEMO_DIR}images`;

let api;
const env = () => ({ BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo" });
const run = (options = {}) => runImport({ catalogPath: CATALOG, certificatesPath: CERTIFICATES, imagesDir: IMAGES, env: env(), sdk, ...options });
const products = () => api.state.records.bas_shop_products;
const product = (id) => products().find((row) => row.fields["product-id"] === id);
const writes = () => api.log.filter((entry) => entry.method !== "GET");
const withCsv = async (edit, fn) => {
  const dir = await mkdtemp(path.join(tmpdir(), "busa-shop-own-import-"));
  try {
    const original = await readFile(CATALOG, "utf8");
    const csv = edit(original);
    assert.notEqual(csv, original, "the test edits the list");
    await writeFile(path.join(dir, "toy-catalog.csv"), csv);
    return await fn(path.join(dir, "toy-catalog.csv"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// Only Busa Shop installed, as on a Free space after ONE install. `withHub` adds a product hub next to it.
const freshState = ({ withHub = false, settings = {} } = {}) => ({
  nodes: [...SHOP_ONLY_NODES, ...(withHub ? [NODES.products, NODES.certificates, NODES.hubApp] : [])],
  records: {
    bas_shop_products: [],
    bas_shop_certificates: [],
    bas_settings: [{ id: "rec_settings", fields: { ...SETTINGS, ...settings } }],
    bas_orders: [],
    bas_reports: [],
    ...(withHub ? { bas_products: [], bas_certificates: [] } : {}),
  },
  bases: {
    bas_shop_products: { name: "Products", fields: structuredClone(shopProductsBase.fields) },
    bas_shop_certificates: { name: "Certificates", fields: structuredClone(shopCertificatesBase.fields) },
    ...(withHub
      ? { bas_products: { name: "Products", fields: hubProductsBase.fields }, bas_certificates: { name: "Certificates", fields: hubCertificatesBase.fields } }
      : {}),
  },
  files: {},
  assets: {},
});
const reset = (options) => {
  for (const key of Object.keys(api.state)) delete api.state[key];
  Object.assign(api.state, freshState(options));
  api.reset();
  api.log.length = 0;
};

before(async () => {
  api = await startFakeBusabase(freshState());
});
beforeEach(() => {
  Object.assign(api.options, { failCreates: false, queueCreates: false, queueUpdates: false, failReads: false });
  reset();
});
after(async () => api.close());

describe("import-products.mjs into the shop's own Products", () => {
  it("imports the toys into plain columns, photos and linked certificates in one run, with no product hub installed", async () => {
    const summary = await run();
    assert.deepEqual([summary.target, summary.from, summary.productsTable], ["shop", "shop", "busa-shop-products"]);
    assert.deepEqual(summary.products, { created: 12, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.certificates, { created: 39, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.images, { uploaded: 11, reused: 0, missing: 0 });
    assert.match(formatSummary(summary), /^Products table: busa-shop-products \(the shop's own Products\)/);

    const robot = product("tt-walking-robot").fields;
    // Pictures are the shop's own files in the two attachment cells, as uploadAsset returned them.
    assert.equal(robot["main-photo"].length, 1);
    assert.match(robot["main-photo"][0].url, new RegExp(`^${api.origin}/assets/k\\d+-walking-robot\\.svg$`));
    assert.deepEqual(Object.keys(robot["main-photo"][0]).sort(), ["assetId", "attachmentId", "fileName", "mimeType", "size", "url"]);
    assert.deepEqual([robot["main-photo"][0].fileName, robot["main-photo"][0].mimeType], ["walking-robot.svg", "image/svg+xml"]);
    assert.deepEqual(
      robot["more-photos"].map((file) => file.fileName),
      ["walking-robot-box.svg"],
      "More photos: the rest, the main photo not repeated",
    );
    assert.equal(robot.image, undefined, "no links written");
    const { "main-photo": main, "more-photos": more, ...rest } = robot;
    assert.deepEqual(rest, {
      "product-id": "tt-walking-robot",
      sku: "TT-ROB-01",
      name: "Walking Robot Buddy",
      subtitle: "Walks, turns its head and blinks its light-up eyes",
      category: "Robots & STEM",
      status: "active",
      price: 24,
      currency: "USD",
      stock: 180,
      cost: 9.8,
      warranty: "1-year limited warranty",
      returns: "30-day returns",
      description:
        "Press the button on its back and the robot walks forward, turns its head and blinks its eyes. Rounded edges, no small parts, and a battery door that closes with a screw.",
      highlights: "Walks forward and turns its head\nLight-up eyes\nScrew-secured battery door\nComes in a gift box",
      tags: "robot, stem, battery",
      specs: "Age: 3+\nMaterials: ABS plastic\nBatteries: 2 × AA (not included)\nSize: 14 × 9 × 21 cm\nWeight: 0.32 kg",
      notes: "Carton qty: 24\nMOQ: 48\nLead time (days): 25\nHS code: 9503.00\nCountry of origin: China\nSupplier: Tumbleberry Toy Works (fictional)",
      source: "toy-catalog.csv",
      ref: 1,
    });
    const slugs = new Set(shopProductsBase.fields.map((field) => field.slug));
    for (const row of products()) for (const slug of Object.keys(row.fields)) assert.ok(slugs.has(slug), `${slug} is a column of the shop's Products`);
    assert.equal(product("tt-magnetic-tiles").fields.status, "draft", "launch + draft in the list is a draft");
    assert.equal(product("tt-xylophone").fields.price, undefined, "no price in the list, none written");
    assert.equal(product("tt-chef-kitchen").fields["main-photo"], undefined);

    const robotCerts = api.state.records.bas_shop_certificates.filter((row) => row.fields.product[0] === product("tt-walking-robot").id);
    assert.deepEqual(robotCerts.map((row) => row.fields["cert-type"]).sort(), ["ASTM F963", "CPSIA / CPC", "EN 71", "UKCA"]);
    // Says who wrote it, never forces a merge, and the key only goes to Busabase.
    const creates = writes().filter((entry) => entry.path.endsWith("/change-requests"));
    assert.ok(creates.length >= 51);
    assert.ok(creates.every((entry) => JSON.parse(entry.body).submittedBy === "busa-shop-import" && !JSON.parse(entry.body).autoMerge));
  });

  it("a second run changes nothing: no record written, no picture uploaded", async () => {
    await run();
    const stored = JSON.stringify(api.state.records);
    api.log.length = 0;
    const summary = await run();
    assert.deepEqual(summary.products, { created: 0, updated: 0, unchanged: 12, skipped: 0, queued: 0 });
    assert.deepEqual(summary.certificates, { created: 0, updated: 0, unchanged: 39, skipped: 0, queued: 0 });
    assert.deepEqual(summary.images, { uploaded: 0, reused: 11, missing: 0 }, "each stored photo is read back and recognised by its bytes");
    assert.deepEqual(writes(), []);
    assert.equal(JSON.stringify(api.state.records), stored);
    const dry = await run({ dryRun: true });
    assert.deepEqual([dry.products.unchanged, dry.images.uploaded, dry.images.reused], [12, 0, 11]);
  });

  it("keeps what the owner edited in the grid: their Specs and Notes lines, their label, their price when the list has none", async () => {
    await run();
    const bear = product("tt-cuddle-bear").fields;
    bear.specs = bear.specs.replace("Weight: 0.25 kg", "重量: 0.25 kg") + "\nWashable: 30 °C";
    bear.notes = `${bear.notes}\nCall the factory before Christmas`;
    bear.price = 13.5;
    await withCsv(
      (csv) => csv.replace(/(tt-cuddle-bear,TT-PLS-04,[^\n]*?,active,active,)15\.00,/, "$1,").replace("0.25 kg", "0.3 kg"),
      async (catalogPath) => {
        api.log.length = 0;
        const summary = await run({ catalogPath });
        assert.deepEqual([summary.products.updated, summary.products.unchanged], [1, 11]);
        const update = writes().find((entry) => entry.path.includes("/records/"));
        assert.deepEqual(Object.keys(JSON.parse(update.body).fields), ["specs"]);
      },
    );
    const after = product("tt-cuddle-bear").fields;
    assert.equal(after.price, 13.5, "the list left the price empty: the owner's price stays");
    assert.match(after.specs, /^重量: 0\.3 kg$/m, "the new weight, under the owner's own label");
    assert.match(after.specs, /^Washable: 30 °C$/m);
    assert.match(after.notes, /Call the factory before Christmas$/);
  });

  it("the preview names what the shop would not list, in its own rule and currency", async () => {
    const summary = await run({ dryRun: true });
    assert.deepEqual(writes(), []);
    const text = formatSummary(summary);
    assert.match(
      text,
      /Busa Shop lists a product only with Status active, a price above 0 and the shop's currency \(USD, Settings › Currency\)\. 2 of 12 would not be listed as they are: no price \(Rainbow Xylophone\); status "draft" \(Magnetic Building Tiles\)\./,
    );
    assert.match(text, /- column 12 "age_grade" → Specs line "Age" \(shown on the product page\)/);
    assert.match(text, /- column 22 "warranty" → Warranty \(shown on the product page\)/);
    assert.match(text, /- column 18 "moq" → Notes line "MOQ" \(for you and trade buyers; never on the website\)/);
    assert.match(text, /- column 10 "landed_cost" → landed cost \(Cost when there is no cost column, else a Notes line\)/);
    assert.doesNotMatch(text, /content\.attributes|pricing\.|inventory\./, "no JSON in the shop's words");
    await withCsv(
      (csv) => csv.replaceAll(",USD,", ",EUR,"),
      async (catalogPath) => {
        const eur = formatSummary(await run({ catalogPath, dryRun: true }));
        assert.match(eur, /12 of 12 would not be listed as they are: .*currency EUR, the shop sells in USD \(12 products\)/);
      },
    );
  });

  it("a list with no Status column goes on sale only with the owner's --fill status=active; an unknown status word is left out", async () => {
    await withCsv(
      (csv) => csv.replace("lifecycle,status,", "").replaceAll(",active,active,", ",").replace(",launch,draft,", ","),
      async (catalogPath) => {
        const without = await run({ catalogPath, dryRun: true });
        assert.match(formatSummary(without), /no status \(12 products\).*--fill status=active/);
        await run({ catalogPath, fill: { status: "active" } });
        assert.ok(products().every((row) => row.fields.status === "active"));
      },
    );
    assert.equal(shopStatusFor("blocked", ""), "archive", "下架 in a sheet takes the product off sale");
    assert.equal(shopStatusFor("", "archive"), "archive");
    assert.equal(shopStatusFor("active", "test"), "draft");
    assert.equal(shopStatusFor("pending", "active"), "", "a status word it does not know is not a yes");
  });

  it("a column the owner deleted from the table is left out, and the preview says so", async () => {
    api.state.bases.bas_shop_products.fields = api.state.bases.bas_shop_products.fields.filter((field) => field.slug !== "tags");
    const summary = await run();
    assert.equal(summary.products.created, 12);
    assert.ok(products().every((row) => !("tags" in row.fields)));
    assert.ok(summary.notes.includes('busa-shop-products has no "tags" column, so those values were left out.'));
  });
});

describe("pictures are the shop's own files (busa-shop 0.9.0)", () => {
  // A 1 × 1 PNG, served by a supplier's CDN under a link with no file extension.
  const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f00000000049454e44ae426082",
    "hex",
  );
  const cdn = (url, init) => {
    if (!String(url).startsWith("https://cdn.example/")) return fetch(url, init);
    if (String(url).endsWith("/front")) return Promise.resolve(new Response(PNG, { headers: { "content-type": "image/png" } }));
    return Promise.resolve(new Response("gone", { status: 404 }));
  };
  const linkSdk = { ...sdk, fetch: cdn };
  // Products as busa-shop 0.8.0 installed it: links in Image URL and More photos, no photo cells.
  const oldShopFields = () => [
    ...structuredClone(shopProductsBase.fields).filter((field) => field.type !== "attachment"),
    { slug: "image", name: "Image URL", type: "text", options: {} },
    { slug: "gallery", name: "More photos (one link per line)", type: "longtext", options: {} },
  ];

  it("downloads a link in the list and keeps it as the shop's own file; a dead link is left out and named", async () => {
    await withCsv(
      (csv) => csv.replace("walking-robot.svg,walking-robot-box.svg", "https://cdn.example/robot/front,https://cdn.example/robot/gone.png"),
      async (catalogPath) => {
        const summary = await run({ catalogPath, sdk: linkSdk });
        const robot = product("tt-walking-robot").fields;
        assert.deepEqual(
          robot["main-photo"].map((file) => [file.fileName, file.mimeType]),
          [["front.png", "image/png"]],
          "named from the link, its type from the download",
        );
        assert.match(robot["main-photo"][0].url, new RegExp(`^${api.origin}/assets/`), "the shop's own copy, not the supplier's link");
        assert.equal(robot["more-photos"], undefined);
        assert.ok(summary.notes.some((note) => note.includes("could not download https://cdn.example/robot/gone.png")));
        api.log.length = 0;
        const again = await run({ catalogPath, sdk: linkSdk });
        assert.deepEqual([again.products.unchanged, again.images.uploaded], [12, 0], "the same picture is recognised by its bytes");
        assert.ok(!writes().some((entry) => entry.path.includes("/records/")));
      },
    );
  });

  it("a shop from before 0.9.0, without the photo columns, still gets links in Image URL and More photos", async () => {
    api.state.bases.bas_shop_products.fields = oldShopFields();
    const summary = await run();
    assert.equal(summary.photoColumns, false);
    const robot = product("tt-walking-robot").fields;
    assert.match(robot.image, new RegExp(`^${api.origin}/assets/k\\d+-walking-robot\\.svg$`));
    assert.match(robot.gallery, new RegExp(`^${api.origin}/assets/k\\d+-walking-robot-box\\.svg$`));
    assert.equal(robot["main-photo"], undefined);
  });

  it("--move-photos moves an older shop's links into Main photo and More photos, once, and names what it could not use", async () => {
    api.state.bases.bas_shop_products.fields = oldShopFields();
    await run();
    product("tt-walking-robot").fields.gallery += "\nhttps://cdn.example/robot/gone.png";
    const links = JSON.stringify(api.state.records.bas_shop_products.map((row) => [row.fields.image, row.fields.gallery]));
    await assert.rejects(runMovePhotos({ env: env(), sdk: linkSdk }), /add the two columns first/);

    // The upgrade adds the two photo columns next to the old link columns.
    api.state.bases.bas_shop_products.fields = [...oldShopFields(), ...structuredClone(shopProductsBase.fields).filter((field) => field.type === "attachment")];
    api.log.length = 0;
    const dry = await runMovePhotos({ env: env(), sdk: linkSdk, dryRun: true });
    assert.deepEqual(dry.products, { moved: 10, alreadyMoved: 0, noLinks: 2, queued: 0 });
    assert.deepEqual(writes(), [], "a dry run writes and uploads nothing");
    assert.match(formatMoveSummary(dry), /^Dry run, nothing was written or uploaded\. Products table: busa-shop-products/);

    const moved = await runMovePhotos({ env: env(), sdk: linkSdk });
    assert.deepEqual(moved.products, { moved: 10, alreadyMoved: 0, noLinks: 2, queued: 0 });
    assert.deepEqual(moved.images, { uploaded: 11, reused: 0, failed: 1 });
    const robot = product("tt-walking-robot").fields;
    assert.deepEqual(
      [...robot["main-photo"], ...robot["more-photos"]].map((file) => file.fileName),
      ["tt-walking-robot-1.svg", "tt-walking-robot-2.svg"],
      "named after the product, main photo first",
    );
    assert.ok([...robot["main-photo"], ...robot["more-photos"]].every((file) => file.attachmentId && file.url.startsWith(`${api.origin}/assets/`)));
    assert.match(formatMoveSummary(moved), /could not download: https:\/\/cdn\.example\/robot\/gone\.png/);
    assert.equal(
      JSON.stringify(api.state.records.bas_shop_products.map((row) => [row.fields.image, row.fields.gallery])),
      links,
      "the old link cells are left as they were",
    );
    const updates = writes().filter((entry) => entry.path.includes("/records/"));
    assert.equal(updates.length, 10);
    assert.ok(updates.every((entry) => Object.keys(JSON.parse(entry.body).fields).join() === "main-photo,more-photos"));

    api.log.length = 0;
    const again = await runMovePhotos({ env: env(), sdk: linkSdk });
    assert.deepEqual(again.products, { moved: 0, alreadyMoved: 10, noLinks: 2, queued: 0 });
    assert.deepEqual(writes(), []);
  });
});

describe("the shop's blog (busa-shop 0.7.0)", () => {
  it("is never read or written by the importer", async () => {
    api.state.nodes.push(BLOG_NODES.posts);
    api.state.records.bas_posts = await sampleRows("posts");
    const before = structuredClone(api.state.records.bas_posts);
    const summary = await run();
    assert.equal(summary.products.created, 12);
    assert.ok(!api.log.some((entry) => entry.query.baseId === "bas_posts" || entry.path.includes("bas_posts")), "no request names Posts");
    assert.deepEqual(api.state.records.bas_posts, before);
  });
});

describe("which table it writes", () => {
  it("the shop's own Products, even with a product hub installed next to it", async () => {
    reset({ withHub: true });
    const summary = await run();
    assert.equal(summary.productsTable, "busa-shop-products");
    assert.equal(products().length, 12);
    assert.equal(api.state.records.bas_products.length, 0);
  });

  it("the table the shop's Settings › Products table names: a product hub, written in the hub's shape", async () => {
    reset({ withHub: true, settings: { "products-base": "busa-product-hub-products" } });
    const summary = await run();
    assert.deepEqual([summary.target, summary.from, summary.productsTable], ["product-hub", "settings", "busa-product-hub-products"]);
    assert.match(formatSummary(summary), /^Products table: busa-product-hub-products \(named in the shop's Settings › Products table\)/);
    assert.equal(products().length, 0);
    const robot = api.state.records.bas_products.find((row) => row.fields["product-id"] === "tt-walking-robot").fields;
    assert.equal(robot.lifecycle, "active");
    assert.equal(JSON.parse(robot.content).attributes.moq, 48, "the hub keeps every column in its Content JSON");
    assert.equal(api.state.records.bas_certificates.length, 39);
  });

  it("--products-base wins over both, and a Settings value that names nothing stops the run", async () => {
    reset({ withHub: true, settings: { "products-base": "busa-product-hub-products" } });
    assert.equal((await run({ productsBase: "busa-shop-products", dryRun: true })).productsTable, "busa-shop-products");
    reset({ settings: { "products-base": "no-such-table" } });
    await assert.rejects(run(), /The shop's Settings › Products table says "no-such-table", which is not a Base in this workspace/);
    assert.deepEqual(writes(), []);
  });

  it("decides from the stamps, and refuses to guess between two shops", () => {
    const shopFolderId = NODES.settings.parentId;
    assert.equal(resolveTarget(SHOP_ONLY_NODES, { shopFolderId }).productsBaseId, "bas_shop_products");
    assert.equal(resolveTarget(SHOP_ONLY_NODES, { shopFolderId }).certificatesBaseId, "bas_shop_certificates");
    assert.equal(resolveTarget([...Object.values(NODES)], { shopFolderId }).shape, "product-hub", "an old shop with no Products of its own");
    assert.equal(resolveTarget([...Object.values(NODES)], {}).shape, "product-hub", "the product hub alone");
    const twoShops = [...SHOP_ONLY_NODES, { ...NODES.settings, id: "nod_2", baseId: "bas_settings_2", slug: "busa-shop-2-settings", parentId: "nod_shop_2" }];
    api.state.nodes = twoShops;
    return assert.rejects(run(), /2 Busa Shop Settings tables .* more than one shop\. Name the Products table with --products-base/);
  });

  it("an own Products table outside the shop's folder is not the shop's", () => {
    const elsewhere = [...Object.values(NODES), { ...SHOP_NODES.products, parentId: "nod_elsewhere" }];
    assert.equal(resolveTarget(elsewhere, { shopFolderId: NODES.settings.parentId }).productsBaseId, "bas_products");
  });
});

describe("one importer, two templates", () => {
  it("busa-product-hub's scripts/import-products.mjs is byte-identical to busa-shop's", async () => {
    const shop = await readFile(new URL("busa-shop/scripts/import-products.mjs", templates));
    const hub = await readFile(new URL("busa-product-hub/scripts/import-products.mjs", templates));
    assert.ok(shop.equals(hub), "copy it: cp templates/busa-shop/scripts/import-products.mjs templates/busa-product-hub/scripts/");
  });

  it("writes each Specs line in the website's own English words, and the website reads each back as its key", () => {
    for (const [key, label] of Object.entries(SHOP_SPEC_LABELS)) {
      assert.equal(label, MESSAGES.en[`spec_${key}`], key);
      assert.equal(specKeyFor(label), key, label);
    }
  });

  it("merges Specs and Notes lines without ever removing one", () => {
    assert.equal(mergeLines("", [["Battery", "5000 mAh"], ["RAM", "8 GB"]]), "Battery: 5000 mAh\nRAM: 8 GB");
    assert.equal(mergeLines("电池: 4000 mAh\nMy note", [["Battery", "5000 mAh"]]), "电池: 5000 mAh\nMy note");
    assert.equal(mergeLines("Battery：4000", [["Battery", "5000 mAh"], ["Weight", "0.2 kg"]]), "Battery：5000 mAh\nWeight: 0.2 kg");
  });
});
