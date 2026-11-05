// Workspace state for tests and the local preview, built from the template's
// own demo files: the toy list in assets/demo, as scripts/import-catalog.mjs
// writes it into busa-product-hub, and the Settings row this template installs.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseCsv, planCertificates, planProducts, productFields } from "../../../scripts/import-catalog.mjs";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const DEMO_DIR = `${templateRoot}assets/demo/`;

const readNdjson = async (path) =>
  (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const sampleSettingsFields = async () =>
  (await readNdjson(`${templateRoot}content/settings/records.ndjson`))[0].fields;

/** A product row the way busa-product-hub stores one (its own sample lamp uses this). */
const productRecordFields = (product, ref) => ({
  "product-id": product.product_id,
  ref,
  sku: product.sku,
  name: product.name,
  subtitle: product.subtitle,
  category: product.category,
  lifecycle: product.lifecycle,
  status: product.status,
  owner: "",
  vendor: product.vendor,
  "launch-date": "",
  image: product.image,
  gallery: JSON.stringify(product.gallery),
  tags: JSON.stringify(product.tags),
  pricing: JSON.stringify(product.pricing),
  inventory: JSON.stringify(product.inventory),
  content: JSON.stringify(product.content),
  compliance: JSON.stringify(product.compliance),
  "created-at": "2026-11-01T08:00:00.000Z",
  "updated-at": "2026-11-02T08:00:00.000Z",
  ...(product.price === undefined ? {} : { price: product.price, currency: product.currency }),
});

export const NODES = {
  products: {
    id: "nod_hub_products",
    type: "base",
    slug: "busa-product-hub-products",
    parentId: "nod_hub",
    baseId: "bas_products",
    metadata: { appId: "busa-product-hub", resourceKey: "products", schemaVersion: 1 },
  },
  certificates: {
    id: "nod_hub_certificates",
    type: "base",
    slug: "busa-product-hub-certificates",
    parentId: "nod_hub",
    baseId: "bas_certificates",
    metadata: { appId: "busa-product-hub", resourceKey: "certificates", schemaVersion: 1 },
  },
  hubApp: {
    id: "nod_hub_app",
    type: "airapp",
    slug: "busa-product-hub-app",
    parentId: "nod_hub",
    baseId: null,
    metadata: { appId: "busa-product-hub", resourceKey: "busa-product-hub-app", schemaVersion: 1, version: "3" },
  },
  settings: {
    id: "nod_shop_settings",
    type: "base",
    slug: "busa-shop-settings",
    parentId: "nod_shop",
    baseId: "bas_settings",
    metadata: { appId: "busa-shop", resourceKey: "settings", schemaVersion: 1 },
  },
  orders: {
    id: "nod_shop_orders",
    type: "base",
    slug: "busa-shop-orders",
    parentId: "nod_shop",
    baseId: "bas_orders",
    metadata: { appId: "busa-shop", resourceKey: "orders", schemaVersion: 1 },
  },
  reports: {
    id: "nod_shop_reports",
    type: "base",
    slug: "busa-shop-reports",
    parentId: "nod_shop",
    baseId: "bas_reports",
    metadata: { appId: "busa-shop", resourceKey: "reports", schemaVersion: 1 },
  },
  unrelated: {
    id: "nod_crm_contacts",
    type: "base",
    slug: "crm-contacts",
    parentId: "nod_crm",
    baseId: "bas_crm",
    metadata: { appId: "busa-crm", resourceKey: "contacts", schemaVersion: 1 },
  },
};

/**
 * The demo workspace after the lesson's import: the 12 toys (images uploaded
 * as assets on the Busabase server, so they need the key) plus busa-product-hub's
 * own sample lamp, archived as SKILL.md tells the owner to do. `priceColumn:
 * false` is a product hub installed before 0.4.0: prices in the Pricing JSON.
 */
export const demoState = async ({ imageUrl, priceColumn = true }) => {
  const planned = planProducts(parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8"))).products;
  const certificates = planCertificates(
    parseCsv(await readFile(`${DEMO_DIR}toy-certificates.csv`, "utf8")),
    new Set(planned.map((product) => product.productId)),
  ).certificates;
  const productRecords = [
    {
      id: "rec_hub_lamp",
      fields: productRecordFields(
        {
          product_id: "prod-aurora-lamp",
          sku: "AUR-LAMP-01",
          name: "Aurora Desk Lamp",
          subtitle: "Adjustable ambient light for focused work",
          category: "Home office",
          lifecycle: "archive",
          status: "active",
          vendor: "Northstar Lighting",
          image: "./assets/product-images/aurora-lamp.png",
          gallery: ["./assets/product-images/aurora-lamp.png"],
          tags: ["lighting"],
          price: 79,
          currency: "USD",
          pricing: { landed_cost: 28 },
          inventory: { available: 210 },
          content: {},
          compliance: {},
        },
        1,
      ),
    },
    ...planned.map((product, index) => ({
      id: `rec_${product.productId}`,
      fields: {
        ...productFields(
          product,
          {},
          product.imageRefs.length ? product.imageRefs.map((file) => ({ file, sha256: "", url: imageUrl(file) })) : null,
          { priceColumn },
        ),
        ref: index + 2,
        "created-at": "2026-11-01T08:00:00.000Z",
        "updated-at": "2026-11-02T08:00:00.000Z",
      },
    })),
  ];
  const certificateRecords = certificates.map((certificate, index) => ({
    id: `rec_cert_${index + 1}`,
    fields: {
      product: [`rec_${certificate.productId}`],
      "cert-type": certificate.type,
      issuer: certificate.issuer,
      "cert-number": certificate.number,
      "issued-date": certificate.issued,
      "expiry-date": certificate.expiry,
      "source-note": `toy-certificates.csv line ${certificate.line}`,
    },
  }));
  return {
    nodes: Object.values(NODES),
    records: {
      bas_products: productRecords,
      bas_certificates: certificateRecords,
      bas_settings: [{ id: "rec_settings", fields: await sampleSettingsFields() }],
      bas_orders: [],
      bas_reports: [],
    },
    files: {},
    assets: Object.fromEntries(
      planned
        .flatMap((product) => product.imageRefs)
        .map((file) => [file, { type: "image/svg+xml", path: `${DEMO_DIR}images/${file}` }]),
    ),
  };
};
