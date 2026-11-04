#!/usr/bin/env node
// Import a product list (CSV) into the Busa Product Hub installed in this
// workspace: Products, their photos, and Certificates, in one run.
//
//   npm i busabase-sdk
//   BUSABASE_BASE_URL=https://busabase.com BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… \
//     node import-catalog.mjs toy-catalog.csv --certificates toy-certificates.csv --images images/
//
// Add --dry-run to see what would change without writing or uploading anything.
//
// Self-contained on purpose: it needs only Node 20+ and `busabase-sdk`, so an
// agent can copy this one file out of the busa-shop skill into an empty
// directory and run it. It does not need a checkout of busabase/templates.
//
// What it does, and does not do:
// - Finds the product hub's Products and Certificates tables the way the shop
//   website does: by the stamp the template installer writes
//   ({ appId: "busa-product-hub", resourceKey: "products" | "certificates" }),
//   then by the default slugs, otherwise it stops with a clear error.
//   --products-base <id or slug> names the Products table explicitly.
// - Upserts each product by `product-id`, uploads its photos through the SDK
//   (`uploadAsset`) and writes their public URLs; links each certificate to its
//   product in the same run.
// - Idempotent: a value already stored is not written again, a photo already
//   uploaded (same file name and SHA-256, remembered in `content.image_files`)
//   is not uploaded again, so a second run changes nothing.
// - Never invents a value: an empty cell is "not provided" and leaves the
//   stored value alone; it never clears one. A missing price stays missing (the
//   shop then hides that product and the daily check reports it).
// - Never passes `autoMerge`: with write access a change lands at once; without
//   it, it waits for review, and the summary says so.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT_HUB_APP_ID = "busa-product-hub";
export const IMPORTER_ID = "busa-shop-import";
export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PAGE = 100;
const MAX_PAGES = 50; // 5,000 rows: far beyond a small seller's catalogue; refuse rather than half-read
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" };

// ---------------------------------------------------------------- CSV ----

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. Header row → objects. */
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  const names = header.map((name) => name.trim());
  return body.map((cells, index) => ({
    __line: index + 2,
    ...Object.fromEntries(names.map((name, column) => [name, (cells[column] ?? "").trim()])),
  }));
};

const list = (value) =>
  String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const number = (value) => {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && Number.isFinite(Date.parse(value)) ? value : "");

// ----------------------------------------------------------- planning ----

export const REQUIRED_CATALOG_COLUMNS = ["product_id", "name", "price", "currency"];
export const REQUIRED_CERTIFICATE_COLUMNS = ["product_id", "cert_type", "cert_number"];

/**
 * What each catalogue row says, before anything is read from Busabase.
 * Returns `{ products, skipped, notes }`; a product is
 * `{ productId, line, text, numbers, attributes, tags, description, bullets, imageRefs }`.
 */
export const planProducts = (rows) => {
  const products = [];
  const skipped = [];
  const notes = [];
  const seen = new Set();
  for (const row of rows) {
    const id = row.product_id ?? "";
    if (!PRODUCT_ID_PATTERN.test(id)) {
      skipped.push({ kind: "product", key: id || `line ${row.__line}`, reason: `line ${row.__line}: product_id "${id}" is missing or not usable in a web address` });
      continue;
    }
    if (seen.has(id)) {
      skipped.push({ kind: "product", key: id, reason: `line ${row.__line}: product_id appears twice; the first row was used` });
      continue;
    }
    seen.add(id);
    const price = number(row.price);
    const currency = (row.currency ?? "").toUpperCase();
    if (row.price && price === null) notes.push(`${id}: price "${row.price}" is not a number, left out`);
    if (price === null) notes.push(`${id}: no price in the list, so the shop will not list it`);
    if (currency && !/^[A-Z]{3}$/.test(currency)) notes.push(`${id}: currency "${row.currency}" is not a 3-letter code, left out`);
    const imageRefs = [row.image_file, ...list(row.gallery_files)].filter(Boolean);
    if (!imageRefs.length) notes.push(`${id}: no photo in the list`);
    products.push({
      productId: id,
      line: row.__line,
      text: {
        sku: row.sku ?? "",
        name: row.name ?? "",
        subtitle: row.subtitle ?? "",
        category: row.category ?? "",
        lifecycle: (row.lifecycle ?? "").toLowerCase(),
        status: (row.status ?? "").toLowerCase(),
        vendor: row.vendor ?? "",
      },
      price,
      landedCost: number(row.landed_cost),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
      available: number(row.stock_available),
      attributes: Object.fromEntries(
        [
          ["age_grade", row.age_grade],
          ["materials", row.materials],
          ["batteries", row.batteries],
          ["dimensions", row.dimensions],
          ["weight", row.weight],
          ["warranty", row.warranty],
          ["returns", row.returns],
          ["carton_qty", number(row.carton_qty)],
          ["moq", number(row.moq)],
          ["lead_time_days", number(row.lead_time_days)],
          ["hs_code", row.hs_code],
          ["country_of_origin", row.country_of_origin],
        ].filter(([, value]) => value !== "" && value !== null && value !== undefined),
      ),
      tags: list(row.tags),
      description: row.description ?? "",
      bullets: list(row.bullets),
      imageRefs,
    });
  }
  return { products, skipped, notes };
};

/** `{ certificates, skipped }`; a certificate is `{ productId, line, type, issuer, number, issued, expiry }`. */
export const planCertificates = (rows, productIds) => {
  const certificates = [];
  const skipped = [];
  for (const row of rows) {
    const key = `${row.product_id ?? ""} ${row.cert_type ?? ""} ${row.cert_number ?? ""}`.trim();
    if (!productIds.has(row.product_id)) {
      skipped.push({ kind: "certificate", key, reason: `line ${row.__line}: product_id "${row.product_id}" is not in the product list` });
      continue;
    }
    if (!row.cert_number) {
      skipped.push({ kind: "certificate", key, reason: `line ${row.__line}: cert_number is empty` });
      continue;
    }
    if (!row.cert_type) {
      skipped.push({ kind: "certificate", key, reason: `line ${row.__line}: cert_type is empty` });
      continue;
    }
    certificates.push({
      productId: row.product_id,
      line: row.__line,
      type: row.cert_type,
      issuer: row.issuer ?? "",
      number: row.cert_number,
      issued: isoDate(row.issued_date),
      expiry: isoDate(row.expiry_date),
      badExpiry: Boolean(row.expiry_date) && !isoDate(row.expiry_date),
    });
  }
  return { certificates, skipped };
};

// ------------------------------------------------- finding the tables ----

const stamped = (node, resourceKey) => node?.metadata?.appId === PRODUCT_HUB_APP_ID && node?.metadata?.resourceKey === resourceKey;

/**
 * The product hub's Products and Certificates Bases from one `nodes.list`
 * answer, by installer stamp, then default slug; `override` (a base id, node
 * id or slug) names the Products table. Throws a readable Error otherwise.
 */
export const resolveProductHub = (nodes, override = "") => {
  const bases = nodes.filter((node) => node.type === "base");
  let products;
  if (override) {
    products = bases.find((node) => node.baseId === override || node.id === override || node.slug === override);
    if (!products) throw new Error(`No Base "${override}" in this workspace (--products-base). Check the id or slug.`);
  } else {
    let matches = bases.filter((node) => stamped(node, "products"));
    if (!matches.length) matches = bases.filter((node) => node.slug === "busa-product-hub-products");
    if (!matches.length) {
      throw new Error(
        "Busa Product Hub is not installed in this workspace: no Products table found. Install the Busa Product Hub template first, then run this again.",
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `This workspace has ${matches.length} Busa Product Hub Products tables (${matches.map((node) => node.slug).join(", ")}). Name one with --products-base <slug>.`,
      );
    }
    products = matches[0];
  }
  const siblings = bases.filter((node) => node.parentId === products.parentId);
  const certificates =
    siblings.find((node) => stamped(node, "certificates")) ??
    siblings.find((node) => node.slug === products.slug.replace(/-products$/, "-certificates"));
  return { productsBaseId: products.baseId, productsSlug: products.slug, certificatesBaseId: certificates?.baseId ?? null };
};

// -------------------------------------------------- building the rows ----

const asObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const asList = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Key-sorted JSON, so "the same object" compares equal whatever order it was written in. */
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

const JSON_FIELDS = new Set(["pricing", "inventory", "content", "gallery", "tags"]);

/** True when `next` would store the same thing as `current` for that field. */
const sameValue = (slug, current, next) => {
  if (JSON_FIELDS.has(slug)) {
    const parse = (value) => (typeof value === "string" ? (value.trim() ? JSON.parse(value) : null) : value ?? null);
    try {
      return canonical(parse(current)) === canonical(parse(next));
    } catch {
      return false;
    }
  }
  if (typeof next === "number") return Number(current) === next;
  return String(current ?? "") === String(next ?? "");
};

/**
 * The Products fields this import writes for one product, merged over what is
 * stored. `images` is `[{ file, sha256, url }]` for the photos it could find,
 * or null when the list names none (stored photos are then left alone).
 */
export const productFields = (planned, existing = {}, images = null) => {
  const fields = { "product-id": planned.productId };
  for (const [slug, value] of Object.entries(planned.text)) if (value) fields[slug] = value;

  const pricing = { ...asObject(existing.pricing) };
  if (planned.currency) pricing.currency = planned.currency;
  if (planned.price !== null) {
    pricing.current_price = planned.price;
    pricing.target_price = planned.price;
  }
  if (planned.landedCost !== null) pricing.landed_cost = planned.landedCost;
  if (typeof pricing.current_price === "number" && typeof pricing.landed_cost === "number" && pricing.current_price > 0) {
    pricing.gross_margin_pct = Math.round(((pricing.current_price - pricing.landed_cost) / pricing.current_price) * 1000) / 10;
  }
  fields.pricing = JSON.stringify(pricing);

  if (planned.available !== null) fields.inventory = JSON.stringify({ ...asObject(existing.inventory), available: planned.available });

  const content = { ...asObject(existing.content) };
  if (planned.description) content.description = planned.description;
  if (planned.bullets.length) content.bullets = planned.bullets;
  if (Object.keys(planned.attributes).length) content.attributes = { ...asObject(content.attributes), ...planned.attributes };
  if (images?.length) {
    content.image_files = images.map(({ file, sha256, url }) => ({ file, sha256, url }));
    content.images_ready = true;
    fields.image = images[0].url;
    fields.gallery = JSON.stringify(images.map((image) => image.url));
  }
  fields.content = JSON.stringify(content);
  if (planned.tags.length) fields.tags = JSON.stringify(planned.tags);
  return fields;
};

/** Only the fields whose stored value would change. */
export const changedFields = (existing, next) =>
  Object.fromEntries(Object.entries(next).filter(([slug, value]) => !sameValue(slug, existing[slug], value)));

const relationIds = (value) => {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);
};

/** The option id of `type` in the Certificates table's Certificate type field, or null. */
export const certificateTypeId = (choices, type) => {
  const normalize = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim();
  const wanted = normalize(type);
  return choices.find((choice) => normalize(choice.id) === wanted || normalize(choice.name) === wanted)?.id ?? null;
};

// ------------------------------------------------------------- running ----

const readAll = async (records, baseId) => {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await records.readPage({ baseId, limit: PAGE, cursor });
    rows.push(...result.records);
    cursor = result.nextCursor;
    if (!cursor) return rows;
  }
  throw new Error(`More than ${PAGE * MAX_PAGES} rows in ${baseId}; this importer is built for a small catalogue.`);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const loadSdk = async () => {
  try {
    const [main, airapp] = await Promise.all([import("busabase-sdk"), import("busabase-sdk/airapp")]);
    return { createBusabaseClient: main.createBusabaseClient, uploadAsset: main.uploadAsset, createAirAppRecords: airapp.createAirAppRecords };
  } catch {
    throw new Error("busabase-sdk is not installed next to this script. Run `npm i busabase-sdk` in this directory first.");
  }
};

/**
 * Run one import. Everything that touches Busabase goes through `sdk`
 * (defaults to the installed busabase-sdk). Returns the summary it prints.
 */
export const runImport = async ({
  catalogPath,
  certificatesPath = "",
  imagesDir = "",
  productsBase = "",
  dryRun = false,
  env = process.env,
  sdk,
  now = () => new Date(),
}) => {
  if (!env.BUSABASE_BASE_URL) throw new Error("Set BUSABASE_BASE_URL (and BUSABASE_API_KEY, BUSABASE_SPACE_ID for Busabase Cloud).");
  const { createBusabaseClient, uploadAsset, createAirAppRecords } = sdk ?? (await loadSdk());

  const catalogRows = parseCsv(await readFile(catalogPath, "utf8"));
  const missingColumns = REQUIRED_CATALOG_COLUMNS.filter((column) => catalogRows.length && !(column in catalogRows[0]));
  if (!catalogRows.length) throw new Error(`${catalogPath} has no product rows.`);
  if (missingColumns.length) throw new Error(`${catalogPath} is missing column(s): ${missingColumns.join(", ")}`);
  const plan = planProducts(catalogRows);
  let certificatePlan = { certificates: [], skipped: [] };
  if (certificatesPath) {
    const certRows = parseCsv(await readFile(certificatesPath, "utf8"));
    const missing = REQUIRED_CERTIFICATE_COLUMNS.filter((column) => certRows.length && !(column in certRows[0]));
    if (missing.length) throw new Error(`${certificatesPath} is missing column(s): ${missing.join(", ")}`);
    certificatePlan = planCertificates(certRows, new Set(plan.products.map((product) => product.productId)));
  }
  const photoDir = imagesDir || path.join(path.dirname(catalogPath), "images");

  const client = createBusabaseClient({
    baseUrl: env.BUSABASE_BASE_URL,
    ...(env.BUSABASE_API_KEY ? { apiKey: env.BUSABASE_API_KEY } : {}),
    ...(env.BUSABASE_SPACE_ID ? { spaceId: env.BUSABASE_SPACE_ID } : {}),
  });
  const records = createAirAppRecords(client, { appId: IMPORTER_ID });
  const hub = resolveProductHub((await client.nodes.list({ types: ["base"] })) ?? [], productsBase);
  if (certificatePlan.certificates.length && !hub.certificatesBaseId) {
    throw new Error(`No Certificates table next to ${hub.productsSlug}. Install Busa Product Hub completely, or run without --certificates.`);
  }

  const summary = {
    dryRun,
    productsTable: hub.productsSlug,
    products: { created: 0, updated: 0, unchanged: 0, skipped: 0, queued: 0 },
    certificates: { created: 0, updated: 0, unchanged: 0, skipped: 0, queued: 0 },
    images: { uploaded: 0, reused: 0, missing: 0 },
    skipped: [...plan.skipped, ...certificatePlan.skipped],
    notes: [...plan.notes],
  };
  summary.products.skipped = plan.skipped.length;
  summary.certificates.skipped = certificatePlan.skipped.length;

  const existingProducts = new Map();
  let maxRef = 0;
  for (const record of await readAll(records, hub.productsBaseId)) {
    const id = String(record.fields["product-id"] ?? "");
    maxRef = Math.max(maxRef, Number(record.fields.ref) || 0);
    if (id && !existingProducts.has(id)) existingProducts.set(id, record);
  }
  const productRecordIds = new Map();
  const nowIso = () => now().toISOString();

  for (const planned of plan.products) {
    const existing = existingProducts.get(planned.productId);
    const stored = existing?.fields ?? {};
    const known = asList(asObject(stored.content).image_files);

    let images = null;
    if (planned.imageRefs.length) {
      images = [];
      for (const ref of planned.imageRefs) {
        if (/^https:\/\//i.test(ref)) {
          images.push({ file: ref, sha256: "", url: ref });
          continue;
        }
        const file = path.basename(ref);
        const filePath = path.join(photoDir, ref);
        const bytes = await stat(filePath).then((info) => (info.isFile() ? readFile(filePath) : null)).catch(() => null);
        if (!bytes || bytes.byteLength === 0) {
          summary.images.missing += 1;
          summary.notes.push(`${planned.productId}: photo ${ref} not found in ${photoDir}, left out`);
          continue;
        }
        const hash = sha256(bytes);
        const already = known.find((item) => item?.file === file && item?.sha256 === hash && item?.url);
        if (already) {
          summary.images.reused += 1;
          images.push({ file, sha256: hash, url: already.url });
          continue;
        }
        const mimeType = MIME[path.extname(file).toLowerCase()];
        if (!mimeType) {
          summary.images.missing += 1;
          summary.notes.push(`${planned.productId}: ${ref} is not an image type this importer uploads, left out`);
          continue;
        }
        summary.images.uploaded += 1;
        if (dryRun) {
          images.push({ file, sha256: hash, url: `(would upload ${file})` });
          continue;
        }
        const asset = await uploadAsset(client, new Uint8Array(bytes), { fileName: file, mimeType, context: "record-field" });
        images.push({ file, sha256: hash, url: asset.url });
      }
      if (!images.length) images = null;
    }

    const next = productFields(planned, stored, images);
    if (!existing) {
      maxRef += 1;
      const fields = { ...next, ref: maxRef, "created-at": nowIso(), "updated-at": nowIso() };
      if (dryRun) {
        summary.products.created += 1;
        continue;
      }
      const outcome = await records.createRecord({
        baseId: hub.productsBaseId,
        fields,
        message: `Import product ${planned.productId} from ${path.basename(catalogPath)}`,
      });
      if (outcome.status === "queued" || !outcome.recordId) summary.products.queued += 1;
      else {
        summary.products.created += 1;
        productRecordIds.set(planned.productId, outcome.recordId);
      }
      continue;
    }
    productRecordIds.set(planned.productId, existing.id);
    const changes = changedFields(stored, next);
    if (!Object.keys(changes).length) {
      summary.products.unchanged += 1;
      continue;
    }
    if (dryRun) {
      summary.products.updated += 1;
      continue;
    }
    const outcome = await records.updateRecord({
      recordId: existing.id,
      baseCommitId: existing.headCommitId,
      fields: { ...changes, "updated-at": nowIso() },
      message: `Update product ${planned.productId} from ${path.basename(catalogPath)} (${Object.keys(changes).join(", ")})`,
    });
    if (outcome.status === "queued") summary.products.queued += 1;
    else summary.products.updated += 1;
  }

  if (certificatePlan.certificates.length) {
    const base = await client.bases.get({ baseId: hub.certificatesBaseId });
    const choices = base?.fields?.find((field) => field.slug === "cert-type")?.options?.choices ?? [];
    const existingCertificates = await readAll(records, hub.certificatesBaseId);
    const plannedIds = new Set(plan.products.map((product) => product.productId));
    for (const cert of certificatePlan.certificates) {
      const label = `${cert.productId} ${cert.type} ${cert.number}`;
      const skip = (reason) => {
        summary.certificates.skipped += 1;
        summary.skipped.push({ kind: "certificate", key: label, reason });
      };
      const typeId = certificateTypeId(choices, cert.type);
      if (!typeId) {
        skip(`type "${cert.type}" is not an option of the Certificates table (it offers: ${choices.map((choice) => choice.name).join(", ")}). Update Busa Product Hub (0.3.0 adds EN 71, ASTM F963, CPSIA / CPC) or add the option.`);
        continue;
      }
      if (cert.badExpiry) summary.notes.push(`${label}: expiry date is not YYYY-MM-DD, left out`);
      const productRecordId = productRecordIds.get(cert.productId);
      if (!productRecordId) {
        if (dryRun && plannedIds.has(cert.productId) && !existingProducts.has(cert.productId)) {
          summary.certificates.created += 1; // would be linked to the product created in the same run
          continue;
        }
        skip(`product ${cert.productId} was not saved (waiting for review or skipped), so there is nothing to link it to yet. Run the import again after it is approved.`);
        continue;
      }
      const next = {
        product: [productRecordId],
        "cert-type": typeId,
        "cert-number": cert.number,
        ...(cert.issuer ? { issuer: cert.issuer } : {}),
        ...(cert.issued ? { "issued-date": cert.issued } : {}),
        ...(cert.expiry ? { "expiry-date": cert.expiry } : {}),
        "source-note": `${path.basename(certificatesPath)} line ${cert.line}`,
      };
      const existing = existingCertificates.find(
        (record) =>
          relationIds(record.fields.product).includes(productRecordId) &&
          String(record.fields["cert-type"] ?? "") === typeId &&
          String(record.fields["cert-number"] ?? "") === cert.number,
      );
      if (!existing) {
        if (dryRun) {
          summary.certificates.created += 1;
          continue;
        }
        const outcome = await records.createRecord({
          baseId: hub.certificatesBaseId,
          fields: next,
          message: `Import certificate ${typeId} ${cert.number} for ${cert.productId}`,
        });
        if (outcome.status === "queued") summary.certificates.queued += 1;
        else summary.certificates.created += 1;
        continue;
      }
      const { product: _product, ...comparable } = next;
      const changes = changedFields(existing.fields, comparable);
      if (!Object.keys(changes).length) {
        summary.certificates.unchanged += 1;
        continue;
      }
      if (dryRun) {
        summary.certificates.updated += 1;
        continue;
      }
      const outcome = await records.updateRecord({
        recordId: existing.id,
        baseCommitId: existing.headCommitId,
        fields: changes,
        message: `Update certificate ${typeId} ${cert.number} for ${cert.productId} (${Object.keys(changes).join(", ")})`,
      });
      if (outcome.status === "queued") summary.certificates.queued += 1;
      else summary.certificates.updated += 1;
    }
  }
  return summary;
};

export const formatSummary = (summary) => {
  const verb = summary.dryRun ? "would be " : "";
  const line = (label, counts) =>
    `${label}: ${counts.created} ${verb}created, ${counts.updated} ${verb}updated, ${counts.unchanged} unchanged, ${counts.skipped} skipped${counts.queued ? `, ${counts.queued} waiting for review` : ""}`;
  const out = [
    `${summary.dryRun ? "Dry run, nothing was written or uploaded. " : ""}Products table: ${summary.productsTable}`,
    line("Products", summary.products),
    line("Certificates", summary.certificates),
    `Photos: ${summary.images.uploaded} ${summary.dryRun ? "to upload" : "uploaded"}, ${summary.images.reused} already uploaded, ${summary.images.missing} missing`,
  ];
  if (summary.skipped.length) out.push("Skipped:", ...summary.skipped.map((item) => `  - ${item.kind} ${item.key}: ${item.reason}`));
  if (summary.notes.length) out.push("Notes:", ...summary.notes.map((note) => `  - ${note}`));
  return out.join("\n");
};

const USAGE = `Usage: node import-catalog.mjs <catalog.csv> [--certificates <certificates.csv>] [--images <dir>] [--products-base <id|slug>] [--dry-run]

Imports products, their photos and certificates into the Busa Product Hub installed
in the workspace named by BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID.
Photos are read from --images (default: images/ next to the catalog CSV).
Needs: npm i busabase-sdk`;

const main = async (argv) => {
  const valueOf = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const flagsWithValues = new Set(["--certificates", "--images", "--products-base"]);
  const catalogPath = argv.find((arg, index) => !arg.startsWith("--") && !flagsWithValues.has(argv[index - 1]));
  if (argv.includes("--help") || !catalogPath) {
    console.log(USAGE);
    return argv.includes("--help") ? 0 : 1;
  }
  const summary = await runImport({
    catalogPath,
    certificatesPath: valueOf("--certificates") ?? "",
    imagesDir: valueOf("--images") ?? "",
    productsBase: valueOf("--products-base") ?? "",
    dryRun: argv.includes("--dry-run"),
  });
  console.log(formatSummary(summary));
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`import-catalog: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
