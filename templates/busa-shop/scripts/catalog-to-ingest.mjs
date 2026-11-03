#!/usr/bin/env node
// Turn a factory's product list (CSV) into the JSON payload that the
// busa-product-hub template's own importer reads:
//
//   node scripts/catalog-to-ingest.mjs assets/demo/toy-catalog.csv \
//     --certificates assets/demo/toy-certificates.csv \
//     --image-urls image-urls.json \
//     -o toy-catalog.ingest.json
//
// then, from busa-product-hub (see its skill):
//   node scripts/ingest_products.mjs toy-catalog.ingest.json --apply   # products
//   node scripts/ingest_products.mjs toy-catalog.ingest.json --apply   # again: links certificates
//
// Pure file-to-file: it reads two CSVs and an optional image-URL map and writes
// JSON. It never talks to Busabase and never invents a value: an empty price
// stays empty (the shop then hides that product and the daily check reports it).
//
// `--image-urls` is a JSON object { "<image file name>": "<public URL>" }, built
// by uploading each file in assets/demo/images/ (see SKILL.md, "Open the shop").
// `--image-base-url https://host/path/` is the alternative when the images are
// already hosted somewhere public: file name appended to it.
import { readFile, writeFile } from "node:fs/promises";

export const CATALOG_COLUMNS = [
  "product_id",
  "sku",
  "name",
  "subtitle",
  "category",
  "lifecycle",
  "status",
  "price",
  "currency",
  "landed_cost",
  "stock_available",
  "age_grade",
  "materials",
  "batteries",
  "dimensions",
  "weight",
  "carton_qty",
  "moq",
  "lead_time_days",
  "hs_code",
  "country_of_origin",
  "warranty",
  "returns",
  "image_file",
  "gallery_files",
  "tags",
  "description",
  "bullets",
  "vendor",
];

export const CERTIFICATE_COLUMNS = ["product_id", "cert_type", "standard", "cert_number", "issuer", "issued_date", "expiry_date"];

// busa-product-hub's Certificate type select. Anything else is recorded as
// Other with the standard kept in the certificate number ("<standard> · <no.>").
export const HUB_CERT_TYPES = new Set(["CE", "FCC", "RoHS", "UN38.3", "UKCA", "Other"]);

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
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
  return body.map((cells) => Object.fromEntries(names.map((name, index) => [name, (cells[index] ?? "").trim()])));
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

const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : "");

export const rowsToPayload = ({ catalogRows, certificateRows = [], imageUrl = () => "", catalogName = "toy-catalog.csv", certificatesName = "toy-certificates.csv" }) => {
  const warnings = [];
  const ids = new Set();
  const products = catalogRows.map((row, index) => {
    const line = index + 2;
    const id = row.product_id;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id ?? "")) throw new Error(`${catalogName} line ${line}: product_id "${id}" is missing or not URL-safe`);
    if (ids.has(id)) throw new Error(`${catalogName} line ${line}: product_id "${id}" appears twice`);
    ids.add(id);
    const price = number(row.price);
    const landed = number(row.landed_cost);
    const available = number(row.stock_available);
    const currency = String(row.currency ?? "").trim().toUpperCase();
    if (price === null) warnings.push(`${id}: no price (the shop will not list it)`);
    if (!/^[A-Z]{3}$/.test(currency)) warnings.push(`${id}: currency "${row.currency}" is not a 3-letter code`);
    const image = row.image_file ? imageUrl(row.image_file) : "";
    if (row.image_file && !image) warnings.push(`${id}: no URL for image ${row.image_file}`);
    if (!row.image_file) warnings.push(`${id}: no image`);
    const gallery = [image, ...list(row.gallery_files).map((file) => imageUrl(file))].filter(Boolean);
    const pricing = {
      currency,
      ...(price !== null ? { current_price: price, target_price: price } : {}),
      ...(landed !== null ? { landed_cost: landed } : {}),
      ...(price !== null && landed !== null && price > 0
        ? { gross_margin_pct: Math.round(((price - landed) / price) * 1000) / 10 }
        : {}),
    };
    const attributes = Object.fromEntries(
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
    );
    return {
      product_id: id,
      sku: row.sku ?? "",
      name: row.name ?? "",
      subtitle: row.subtitle ?? "",
      category: row.category ?? "",
      lifecycle: (row.lifecycle || "active").toLowerCase(),
      status: (row.status || "active").toLowerCase(),
      vendor: row.vendor ?? "",
      image,
      gallery,
      tags: list(row.tags),
      pricing,
      inventory: available === null ? {} : { on_hand: available, available },
      content: {
        images_ready: Boolean(image),
        ...(row.description ? { description: row.description } : {}),
        ...(list(row.bullets).length ? { bullets: list(row.bullets) } : {}),
        attributes,
      },
      compliance: { notes: [`Imported from ${catalogName} line ${line}.`] },
    };
  });

  const certificates = certificateRows.map((row, index) => {
    const line = index + 2;
    if (!ids.has(row.product_id)) throw new Error(`${certificatesName} line ${line}: unknown product_id "${row.product_id}"`);
    if (!row.cert_number) throw new Error(`${certificatesName} line ${line}: cert_number is required`);
    const type = HUB_CERT_TYPES.has(row.cert_type) ? row.cert_type : "Other";
    const standard = row.standard || (type === "Other" && row.cert_type !== "Other" ? row.cert_type : "");
    const issued = isoDate(row.issued_date);
    const expiry = isoDate(row.expiry_date);
    if (!expiry) warnings.push(`${row.product_id}: certificate ${row.cert_number} has no valid expiry date`);
    return {
      product_id: row.product_id,
      cert_type: type,
      issuer: row.issuer ?? "",
      cert_number: standard ? `${standard} · ${row.cert_number}` : row.cert_number,
      issued_date: issued,
      expiry_date: expiry,
      source_note: `${certificatesName} line ${line}`,
    };
  });

  return { payload: { products, certificates }, warnings };
};

const argValue = (argv, name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const main = async () => {
  const argv = process.argv.slice(2);
  const catalogPath = argv.find((arg, index) => !arg.startsWith("-") && !["--certificates", "--image-urls", "--image-base-url", "-o"].includes(argv[index - 1]));
  if (!catalogPath || argv.includes("--help")) {
    console.log("Usage: node scripts/catalog-to-ingest.mjs <catalog.csv> [--certificates <certificates.csv>] [--image-urls <map.json> | --image-base-url <url>] [-o <payload.json>]");
    process.exitCode = catalogPath ? 0 : 1;
    return;
  }
  const certificatesPath = argValue(argv, "--certificates");
  const imageMapPath = argValue(argv, "--image-urls");
  const imageBase = argValue(argv, "--image-base-url");
  const output = argValue(argv, "-o");
  const imageMap = imageMapPath ? JSON.parse(await readFile(imageMapPath, "utf8")) : {};
  const imageUrl = (file) => {
    if (typeof imageMap[file] === "string" && imageMap[file]) return imageMap[file];
    return imageBase ? new URL(encodeURIComponent(file), imageBase.endsWith("/") ? imageBase : `${imageBase}/`).href : "";
  };
  const { payload, warnings } = rowsToPayload({
    catalogRows: parseCsv(await readFile(catalogPath, "utf8")),
    certificateRows: certificatesPath ? parseCsv(await readFile(certificatesPath, "utf8")) : [],
    imageUrl,
    catalogName: catalogPath.split("/").at(-1),
    certificatesName: certificatesPath ? certificatesPath.split("/").at(-1) : "",
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (output) await writeFile(output, json);
  else process.stdout.write(json);
  for (const warning of warnings) console.error(`note: ${warning}`);
  console.error(`${payload.products.length} products, ${payload.certificates.length} certificates${output ? ` → ${output}` : ""}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
