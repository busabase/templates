// Which product details a product page shows, in what order, under which
// label. Pure (test/details.test.mjs).
//
// busa-product-hub keeps every column of an imported sheet in
// `content.attributes`: a column it knows under one canonical key (brand,
// battery, moq, …: the PRODUCT_COLUMNS table in its
// scripts/import-products.mjs), any other column under its own header text
// ("防水等级"). A page shows a detail only when it is meant for shoppers:
//
// - SHOPPER_DETAILS, when present, in this order;
// - then a key the owner names in Settings › "Also show these product
//   details", in the owner's order;
// - never TRADE_DETAILS (minimum order, lead time, customs code, carton size,
//   country of origin: for the owner and trade buyers), even when Settings
//   name one;
// - nothing else: a column nobody looked at never reaches a public page.

import { MESSAGES } from "./i18n.js";

export const SHOPPER_DETAILS = [
  "brand",
  "model",
  "color",
  "screen",
  "processor",
  "memory",
  "storage",
  "battery",
  "charging",
  "camera",
  "front_camera",
  "network",
  "os",
  "specs",
  "age_grade",
  "materials",
  "batteries",
  "dimensions",
  "weight",
  "in_the_box",
  "warranty",
  "returns",
];

export const TRADE_DETAILS = ["moq", "lead_time_days", "hs_code", "carton_qty", "country_of_origin"];

/** How a key is compared: NFKC (full-width → plain), lower case, runs of spaces as one. */
const keyOf = (value) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

const SHOPPER = new Set(SHOPPER_DETAILS.map(keyOf));
const TRADE = new Set(TRADE_DETAILS.map(keyOf));

/** Settings › "Also show these product details": keys separated by commas, semicolons, `|` or new lines (Chinese punctuation too). */
export const parseDetailKeys = (value) => {
  const keys = [];
  const seen = new Set();
  for (const part of String(value ?? "").split(/[,;|\n\r，；、]+/)) {
    const key = part.trim();
    if (key && !seen.has(keyOf(key))) {
      seen.add(keyOf(key));
      keys.push(key);
    }
  }
  return keys;
};

/** A value a shopper can read: text, a number, or a list of those. Anything else (an object, true/false) is not shown. */
export const detailValue = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").join(", ").trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value.trim();
  return "";
};

/** The label: the page language's word for a known key, else the key as stored (`refresh_rate` → "Refresh rate"). */
const labelFor = (key, language) => {
  const message = `spec_${keyOf(key)}`;
  const known = MESSAGES[language]?.[message] ?? MESSAGES.en[message];
  if (known) return known;
  const words = key.trim().replace(/_+/g, " ");
  return /^[a-z]/.test(words) ? words[0].toUpperCase() + words.slice(1) : words;
};

/**
 * `[[label, value]]` for one product's `content.attributes`, `extraKeys`
 * being Settings › "Also show these product details" (parsed). Empty values
 * are left out.
 */
export const productDetails = (attributes, { extraKeys = [], language = "en" } = {}) => {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes : {};
  const byKey = new Map();
  for (const key of Object.keys(source)) if (!byKey.has(keyOf(key))) byKey.set(keyOf(key), key);
  const rows = [];
  const add = (wanted) => {
    const stored = byKey.get(keyOf(wanted));
    if (stored === undefined) return;
    const value = detailValue(source[stored]);
    if (value) rows.push([labelFor(stored, language), value]);
  };
  for (const key of SHOPPER_DETAILS) add(key);
  for (const key of extraKeys) {
    const wanted = keyOf(key);
    if (!SHOPPER.has(wanted) && !TRADE.has(wanted)) add(key);
  }
  return rows;
};
