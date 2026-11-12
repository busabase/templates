// Pure catalog rules: which products the shop lists, how a price is shown, and
// which image references a stranger's browser can load. No I/O here, so every
// rule is unit-tested directly (test/catalog.test.mjs).
//
// The shop reads one Products table (see src/resources.js), in one of two shapes:
//
// - its own (busa-shop 0.5.0 and later): plain columns an owner edits in the
//   grid. Status (active / draft / archive), Price, Currency, Stock, Main photo
//   and More photos (attachment cells, busa-shop 0.9.0 and later; a shop from
//   before keeps links in Image and Gallery, one per line), Description,
//   Highlights (one per line), Specs ("Label: value" per line, src/details.js),
//   Brand, Model, Warranty, Returns, Tags (comma-separated). Cost, Source and
//   Notes are the owner's and never read.
// - a busa-product-hub table (a shop installed before 0.5.0, or Settings ›
//   "Products table" pointing at one): Lifecycle + Status, and JSON-in-longtext
//   blocks (`pricing`, `inventory`, `content`, `compliance`). The selling price
//   is its `price` (number) and `currency` (text) columns since
//   busa-product-hub 0.4.0; a table made by an earlier install keeps it in
//   `pricing.current_price` / `pricing.currency`, read only while the column
//   is empty.
//
// `normalizeProduct` turns either into one shape, so the pages never know which
// table they came from. The JSON blocks are parsed here and nowhere else.

import { parseDetailKeys, parseSpecs } from "./details.js";
import { SHOP_SHAPE } from "./resources.js";

export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

// The listing rule, in full. A product is on the website only when ALL hold:
//   1. status is `active` (the shop's own table: active|draft|archive), or, in a
//      busa-product-hub table, status is `active`, `approved` or `live` AND
//      lifecycle is `active` or `launch` (launch|active|test|archive)
//   2. it has a name and a URL-safe product id
//   3. the price is a number above 0: the `price` column, or pricing.current_price while it is empty
//   4. the currency equals the store currency in Settings: `currency`, or pricing.currency while it is
//      empty; in the shop's own table an empty Currency is the store currency
//   5. Settings › "Only list products with this tag" is empty, or the product has that tag
// Anything else is hidden, and `listingFor` says why, so the daily check can
// report it. Stock does not hide a product: 0 available shows "Out of stock"
// and it cannot be ordered.
export const LISTED_LIFECYCLES = new Set(["active", "launch"]);
export const LISTED_STATUSES = new Set(["active", "approved", "live"]);

export const MAX_IMAGES = 8;
export const MAX_ORDER_QUANTITY = 99;

const IMAGE_FILE = /\.(?:png|jpe?g|webp|gif|svg|avif)$/i;

export const parseJson = (value, fallback) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const lower = (value) => text(value).toLowerCase();

export const finiteNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asObject = (value) => {
  const parsed = parseJson(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const isBlank = (value) => value === null || value === undefined || (typeof value === "string" && !value.trim());

/** A column's value, or the same fact in the JSON of a table made before that column existed. */
const columnOr = (column, legacy) => (isBlank(column) ? legacy : column);

/**
 * A list cell: a JSON array (busa-product-hub), or plain text split on
 * `separators` (the shop's own table: one link per line, tags by commas).
 */
const asStringList = (value, separators = null) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  if (typeof value !== "string" || !value.trim()) return [];
  const parsed = parseJson(value, null);
  if (Array.isArray(parsed)) return asStringList(parsed);
  if (!separators) return [];
  return value
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);
};

const LINES = /\r?\n/;
const LINKS = /[\s|]+/;
const TAGS = /[,，;；|\n]+/;

/**
 * The links of an attachment cell, in its order: each file's `url` (the shape
 * the API returns: `{ attachmentId, url, fileName, mimeType, size }`). A plain
 * string is taken as a link too, so a cell that held one before still reads.
 */
export const attachmentUrls = (value) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => (typeof item === "string" ? item.trim() : item && typeof item === "object" && typeof item.url === "string" ? item.url.trim() : ""))
    .filter(Boolean);

/**
 * A product's pictures, main one first. Main photo and More photos (the
 * shop's attachment cells) win; Image and Gallery (links: a busa-product-hub
 * table, or a shop from before busa-shop 0.9.0 not yet moved over) are read
 * only while both photo cells are empty, so a half-moved row never shows a
 * picture twice.
 */
export const photoRefsOf = (fields) => {
  const photos = [...attachmentUrls(fields["main-photo"]), ...attachmentUrls(fields["more-photos"])];
  const refs = photos.length ? photos : [text(fields.image), ...asStringList(fields.gallery, LINKS)];
  const unique = [];
  for (const ref of refs) if (ref && !unique.includes(ref)) unique.push(ref);
  return unique;
};

/**
 * Classify one image reference from the Products table.
 *
 * An attachment's `url`, or a link in busa-product-hub's (or an older
 * shop's) `image` / `gallery`, so a value can be:
 * - an `https://` URL on another host (an uploaded asset's public URL, a CDN):
 *   the browser loads it directly — `direct`;
 * - a URL on the Busabase server itself (or a root-relative `/api/...` path):
 *   it may need the site's key, so the Worker fetches it — `busabase`;
 * - a path inside the Product Hub AirApp (`./assets/product-images/x.png`, the
 *   hub's own sample data): only reachable through the API — `airapp`.
 * Anything else (http on another host, data:, javascript:, `..`) is refused.
 */
export const classifyImageRef = (ref, busabaseOrigin) => {
  const value = text(ref);
  if (!value || value.length > 2000) return null;
  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.username || url.password) return null;
    if (busabaseOrigin && url.origin === busabaseOrigin) return { kind: "busabase", url: url.href };
    if (url.protocol === "https:") return { kind: "direct", url: url.href };
    return null;
  }
  if (value.startsWith("//")) return null;
  if (value.startsWith("/api/")) {
    if (!busabaseOrigin || /[\\\s]/.test(value) || value.split(/[?#]/)[0].split("/").includes("..")) {
      return null;
    }
    return { kind: "busabase", url: new URL(value, busabaseOrigin).href };
  }
  const path = value.replace(/^\.\//, "").replace(/^\//, "");
  if (/[\\?#:\s]/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  if (segments[0] !== "assets" || !IMAGE_FILE.test(path)) return null;
  return { kind: "airapp", path: `app/${path}` };
};

/**
 * One Products row → what the pages need. `shape` is the table's
 * (src/resources.js): the shop's own plain columns, or a product hub's JSON
 * blocks. A plain column wins over the same fact in the JSON, so either table
 * reads the same way.
 */
export const normalizeProduct = (record, { shape = "" } = {}) => {
  const fields = record?.fields ?? {};
  const imageRefs = photoRefsOf(fields);
  const pricing = asObject(fields.pricing);
  const inventory = asObject(fields.inventory);
  const stock = finiteNumber(fields.stock);
  if (stock !== null) inventory.available = stock;
  const content = asObject(fields.content);
  const specs = parseSpecs(fields.specs);
  const attributes = { ...asObject(content.attributes), ...specs.attributes };
  for (const key of ["brand", "model", "warranty", "returns"]) if (text(fields[key])) attributes[key] = text(fields[key]);
  if (Object.keys(attributes).length) content.attributes = attributes;
  if (typeof fields.description === "string" && fields.description.trim()) content.description = fields.description.trim();
  const highlights = asStringList(fields.highlights, LINES);
  if (highlights.length) content.bullets = highlights;
  return {
    shape: shape === SHOP_SHAPE ? SHOP_SHAPE : "product-hub",
    recordId: typeof record?.id === "string" ? record.id : "",
    id: text(fields["product-id"]),
    ref: finiteNumber(fields.ref),
    sku: text(fields.sku),
    name: text(fields.name),
    subtitle: text(fields.subtitle),
    category: text(fields.category),
    lifecycle: lower(fields.lifecycle),
    status: lower(fields.status),
    vendor: text(fields.vendor),
    tags: asStringList(fields.tags, TAGS),
    // The selling price as stored: the column, or the JSON while the column is empty.
    priceValue: columnOr(fields.price, pricing.current_price),
    currencyValue: columnOr(fields.currency, pricing.currency),
    pricing,
    inventory,
    content,
    // Labels the owner wrote in Specs beyond the standard ones: shown, after them.
    specKeys: specs.extraKeys,
    imageRefs,
    updatedAt: text(fields["updated-at"]) || text(record?.updatedAt),
  };
};

/** Why a product is or is not on the website, plus what the page needs to show it. */
export const listingFor = (product, settings) => {
  const reasons = [];
  const own = product.shape === SHOP_SHAPE;
  // The shop's own table has one Status; a product hub's has Lifecycle too.
  if (!own && !LISTED_LIFECYCLES.has(product.lifecycle)) reasons.push("lifecycle");
  if (!LISTED_STATUSES.has(product.status)) reasons.push("status");
  if (!product.name) reasons.push("name");
  if (!PRODUCT_ID_PATTERN.test(product.id)) reasons.push("product-id");
  const price = finiteNumber(product.priceValue);
  if (price === null || price <= 0) reasons.push("price");
  // One shop, one currency: in its own table an empty Currency is the store's.
  const currency = text(product.currencyValue).toUpperCase() || (own ? settings.currency : "");
  if (!currency) reasons.push("currency");
  else if (currency !== settings.currency) reasons.push("currency-mismatch");
  if (settings.listedTag && !product.tags.some((tag) => tag.toLowerCase() === settings.listedTag.toLowerCase())) {
    reasons.push("tag");
  }
  const available = finiteNumber(product.inventory.available);
  return {
    listed: reasons.length === 0,
    reasons,
    price: price === null ? null : Math.round(price * 100) / 100,
    currency,
    available,
    soldOut: available !== null && available <= 0,
    maxQuantity:
      available === null ? MAX_ORDER_QUANTITY : Math.max(0, Math.min(MAX_ORDER_QUANTITY, Math.floor(available))),
  };
};

/**
 * The images the page can show, in order: the hero image first, then the
 * gallery. `airapp` says whether a path inside the Product Hub AirApp can be
 * read (there is one next to the table); without it such a path is left out
 * rather than shown as a broken picture.
 */
export const imagesFor = (product, busabaseOrigin, { airapp = true } = {}) => {
  const images = [];
  for (const ref of product.imageRefs) {
    const image = classifyImageRef(ref, busabaseOrigin);
    if (!image || (image.kind === "airapp" && !airapp)) continue;
    images.push(image);
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
};

/** What `<img src>` gets: a direct URL as is, everything else through the Worker's fixed image route. */
export const imageSrc = (product, image, index) =>
  image.kind === "direct" ? image.url : `/images/${encodeURIComponent(product.id)}/${index}`;

// ---- Certificates (busa-product-hub's Certificates table) ----
//
// busa-product-hub (0.3.0+) records each certificate under its own type: CE,
// FCC, RoHS, UN38.3, UKCA, and for toys EN 71, ASTM F963, CPSIA / CPC. A
// product page shows the type and the expiry date, never the certificate
// number, and only for certificates that have not expired. An expired or
// undated certificate is not shown at all, since showing it would claim more
// than the paperwork supports. Nor is type "Other": it names nothing a buyer
// could check.

export const certificateLabel = (type) => {
  const label = text(type);
  return label && label !== "Other" ? label : "";
};

const relationIds = (value) => {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? item.id : ""))
    .filter((item) => typeof item === "string" && item);
};

export const normalizeCertificate = (record) => {
  const fields = record?.fields ?? {};
  return {
    productRefs: relationIds(fields.product),
    label: certificateLabel(fields["cert-type"]),
    expiryDate: text(fields["expiry-date"]),
  };
};

export const validCertificatesFor = (product, certificates, nowMs) => {
  const keys = new Set([product.recordId, product.id].filter(Boolean));
  const seen = new Map();
  for (const certificate of certificates) {
    if (!certificate.label || !certificate.productRefs.some((ref) => keys.has(ref))) continue;
    const expiry = Date.parse(certificate.expiryDate);
    if (!Number.isFinite(expiry) || expiry <= nowMs) continue;
    const previous = seen.get(certificate.label);
    if (!previous || Date.parse(previous.expiryDate) < expiry) seen.set(certificate.label, certificate);
  }
  return [...seen.values()]
    .map((certificate) => ({ label: certificate.label, expires: certificate.expiryDate.slice(0, 10) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
};

// ---- Settings (this template's own one-row Settings table) ----

export const SUPPORTED_LANGUAGES = ["en", "de", "fr", "es"];

// ISO 3166-1 alpha-2 codes the order form accepts. Names come from
// Intl.DisplayNames in the visitor's language, so the list stays codes only.
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const COUNTRY_SET = new Set(COUNTRY_CODES);

export const parseCountryList = (value) => {
  const codes = [];
  for (const token of text(value).toUpperCase().split(/[\s,;]+/)) {
    if (COUNTRY_SET.has(token) && !codes.includes(token)) codes.push(token);
  }
  return codes;
};

/** A select cell as the API returns it: the choice id, or `{ id, name }`. */
const choice = (value) => (value && typeof value === "object" && !Array.isArray(value) ? lower(value.id ?? value.name) : lower(value));

export const PAYPAL_MODES = ["off", "sandbox", "live"];
export const SMTP_SECURITY_MODES = ["starttls", "tls", "none"];

/** A GA4 measurement ID (`G-…`), also out of a pasted gtag snippet; "" for anything else. */
export const ga4IdOf = (value) => /\bG-[A-Z0-9]{4,20}\b/i.exec(text(value))?.[0].toUpperCase() ?? "";

/**
 * A site-verification code: the `content` of the HTML tag Google Search
 * Console or Bing gives, or the whole tag pasted; "" for anything else.
 */
export const verificationOf = (value) => {
  const raw = text(value);
  const code = /content\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1] ?? raw;
  return /^[A-Za-z0-9_-]{8,100}$/.test(code.trim()) ? code.trim() : "";
};

export const normalizeSettings = (record) => {
  const fields = record?.fields ?? {};
  const language = choice(fields.language);
  const shipsTo = parseCountryList(fields["ships-to"]);
  const paypalMode = choice(fields["paypal-mode"]);
  const smtpSecurity = choice(fields["smtp-security"]);
  const smtpPort = finiteNumber(fields["smtp-port"]);
  return {
    // Payments and email. Only the non-secret half lives here: the PayPal
    // secret and the SMTP password are in the Space Vault (src/vault.js).
    paypalMode: PAYPAL_MODES.includes(paypalMode) ? paypalMode : "off",
    paypalClientId: text(fields["paypal-client-id"]),
    paypalWebhookId: text(fields["paypal-webhook-id"]),
    smtpHost: text(fields["smtp-host"]).toLowerCase(),
    smtpPort: smtpPort === null ? null : Math.trunc(smtpPort),
    smtpSecurity: SMTP_SECURITY_MODES.includes(smtpSecurity) ? smtpSecurity : "starttls",
    smtpUsername: text(fields["smtp-username"]),
    emailFrom: text(fields["email-from"]),
    notifyEmail: text(fields["notify-email"]),
    storeName: text(fields["store-name"]),
    tagline: text(fields.tagline),
    currency: text(fields.currency).toUpperCase(),
    contactEmail: text(fields["contact-email"]),
    language: SUPPORTED_LANGUAGES.includes(language) ? language : "en",
    shipsTo: shipsTo.length ? shipsTo : COUNTRY_CODES,
    about: text(fields.about),
    shippingNote: text(fields["shipping-note"]),
    demoNotice: fields["demo-notice"] === true || fields["demo-notice"] === "true",
    listedTag: text(fields["listed-tag"]),
    productsBase: text(fields["products-base"]),
    showDetails: parseDetailKeys(fields["show-details"]),
    // Google (busa-shop 0.7.0): all optional, all empty in a shop installed before.
    ga4Id: ga4IdOf(fields["ga4-id"]),
    googleVerification: verificationOf(fields["google-site-verification"]),
    bingVerification: verificationOf(fields["bing-site-verification"]),
  };
};

const LOCALE_TAGS = { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES" };
export const localeTag = (language) => LOCALE_TAGS[language] ?? "en-US";

export const formatPrice = (amount, currency, language = "en") => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(localeTag(language), { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export const countryName = (code, language = "en") => {
  try {
    return new Intl.DisplayNames([localeTag(language)], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};

/**
 * Build the catalog the pages render from: every product read from the
 * Products table, split into listed and hidden, each listed one carrying its
 * price, stock state, images and valid certificates.
 */
export const buildCatalog = ({ productRecords, certificateRecords, settings, busabaseOrigin, nowMs, shape = "", airappImages = true }) => {
  const certificates = certificateRecords.map(normalizeCertificate);
  const listed = [];
  const hidden = [];
  const seenIds = new Set();
  for (const record of productRecords) {
    const product = normalizeProduct(record, { shape });
    const listing = listingFor(product, settings);
    if (listing.listed && seenIds.has(product.id)) listing.reasons.push("duplicate-id");
    if (!listing.listed || listing.reasons.length) {
      hidden.push({ id: product.id, name: product.name, reasons: listing.reasons });
      continue;
    }
    seenIds.add(product.id);
    listed.push({
      ...product,
      ...listing,
      priceText: formatPrice(listing.price, listing.currency, settings.language),
      images: imagesFor(product, busabaseOrigin, { airapp: airappImages }),
      certificates: validCertificatesFor(product, certificates, nowMs),
    });
  }
  return { listed, hidden };
};
