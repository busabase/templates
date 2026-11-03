// Workspace state for tests and the local preview, built from the template's
// own demo files: the toy list in assets/demo (as busa-product-hub stores it
// after import) and the Settings row this template installs.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseCsv, rowsToPayload } from "../../../scripts/catalog-to-ingest.mjs";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const DEMO_DIR = `${templateRoot}assets/demo/`;

const readNdjson = async (path) =>
  (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

export const sampleSettingsFields = async () =>
  (await readNdjson(`${templateRoot}content/settings/records.ndjson`))[0].fields;

/** busa-product-hub's productToFields, in Busabase's kebab-case slugs. */
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
 * own sample lamp, archived as SKILL.md tells the owner to do.
 */
export const demoState = async ({ imageUrl }) => {
  const { payload } = rowsToPayload({
    catalogRows: parseCsv(await readFile(`${DEMO_DIR}toy-catalog.csv`, "utf8")),
    certificateRows: parseCsv(await readFile(`${DEMO_DIR}toy-certificates.csv`, "utf8")),
    imageUrl,
  });
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
          pricing: { currency: "USD", current_price: 79 },
          inventory: { available: 210 },
          content: {},
          compliance: {},
        },
        1,
      ),
    },
    ...payload.products.map((product, index) => ({
      id: `rec_${product.product_id}`,
      fields: productRecordFields(product, index + 2),
    })),
  ];
  const certificateRecords = payload.certificates.map((certificate, index) => ({
    id: `rec_cert_${index + 1}`,
    fields: {
      product: [`rec_${certificate.product_id}`],
      "cert-type": certificate.cert_type,
      issuer: certificate.issuer,
      "cert-number": certificate.cert_number,
      "issued-date": certificate.issued_date,
      "expiry-date": certificate.expiry_date,
      "source-note": certificate.source_note,
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
      payload.products
        .flatMap((product) => product.gallery)
        .map((url) => url.split("/").at(-1))
        .map((file) => [file, { type: "image/svg+xml", path: `${DEMO_DIR}images/${file}` }]),
    ),
  };
};
