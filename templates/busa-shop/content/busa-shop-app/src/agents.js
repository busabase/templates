// Agent commerce: what an AI assistant (Claude, ChatGPT, an agent) reads to
// find this shop's products and hand the buyer a link to buy them. Pure
// (test/agents.test.mjs); src/mcp.js carries the tools over MCP and
// src/handler.js serves the documents.
//
//   /mcp                the four tools below, over MCP (Streamable HTTP, src/mcp.js)
//   /agents.md          how an agent uses this shop (Shopify's agent discovery file, adapted)
//   /.well-known/ucp    the Universal Commerce Protocol business profile (catalog search + lookup over MCP)
//   /feeds/google.xml   the products as a Google Merchant Center feed (RSS 2.0, g: attributes)
//
// The tools take the Universal Commerce Protocol's tool names and argument
// shapes (https://ucp.dev/2026-08-25/specification/shopping/catalog/mcp/):
// search_catalog, lookup_catalog, get_product, and create_checkout as a
// handoff. Two deliberate departures: the UCP `meta` object is optional
// (Claude's and ChatGPT's custom connectors never send it), and there is no
// checkout session to update or complete. create_checkout always answers
// `requires_escalation` with a `continue_url`: this shop's own /order page,
// prefilled. The buyer types the address and pays there (PayPal, or an order
// request), because both Anthropic and OpenAI forbid purchases inside a
// third-party connector, and because the order form is the only place this
// shop writes an order.
//
// Everything here reads `state` as src/shop.js loads it: listed products only
// (a draft, archived or off-sale product is not in `catalog.listed`),
// published pages only. Nothing writes; nothing needs the Vault.

import { COUNTRY_CODES, countryName, formatPrice, text } from "./catalog.js";
import { productDetails } from "./details.js";
import { pagePath } from "./policies.js";
import { absoluteImages, absoluteUrl, deliveryDays, plainSummary, productBrand, productPath, xmlEscape } from "./seo.js";
import { checkoutCountries, shippingFor } from "./shipping.js";

export const MCP_PATH = "/mcp";
export const AGENTS_PATH = "/agents.md";
export const GOOGLE_FEED_PATH = "/feeds/google.xml";
export const UCP_PROFILE_PATH = "/.well-known/ucp";
export const UCP_VERSION = "2026-08-25";

export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 20;
export const LOOKUP_MAX_IDS = 10;
export const CHECKOUT_MAX_LINES = 10;
export const QUERY_MAX_CHARS = 200;
const FEED_MAX_SHIPPING = 100; // Google reads the shipping attribute at most 100 times per product
const FEED_MAX_IMAGES = 10; // additional_image_link: up to 10

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// ---- Money in minor units (UCP prices are integers: 2400 = 24.00 USD) ----

export const currencyDigits = (currency) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
};

export const toMinor = (amount, currency) => Math.round(amount * 10 ** currencyDigits(currency));
export const fromMinor = (minor, currency) => minor / 10 ** currencyDigits(currency);
const money = (amount, currency) => formatPrice(amount, currency, "en");
const ucpPrice = (amount, currency) => ({ amount: toMinor(amount, currency), currency });

// ---- Countries ----

const NAME_TO_CODE = (() => {
  const map = new Map();
  for (const code of COUNTRY_CODES) map.set(countryName(code, "en").toLowerCase(), code);
  for (const [name, code] of [
    ["usa", "US"],
    ["united states of america", "US"],
    ["uk", "GB"],
    ["england", "GB"],
    ["great britain", "GB"],
  ]) {
    map.set(name, code);
  }
  return map;
})();

/** "TH", "th", "Thailand" → "TH"; anything else → "". */
export const countryCodeOf = (value) => {
  const raw = text(value);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && COUNTRY_CODES.includes(upper)) return upper;
  return NAME_TO_CODE.get(raw.toLowerCase()) ?? "";
};

const countryLabel = (code) => `${countryName(code, "en")} (${code})`;

/** The countries checkout offers, as a short phrase for a description. */
const shipsToPhrase = (countries) =>
  countries.length > 12 ? `${countries.length} countries` : countries.map((code) => countryName(code, "en")).join(", ");

// ---- What one product looks like to an agent ----

/** The shop's view of shipping one product (one unit) to one country. */
export const shippingTo = (state, country, subtotal) => {
  const { settings, shipping } = state;
  if (!country) return null;
  const offered = checkoutCountries(settings, shipping);
  if (!offered.includes(country)) return { country, ships: false };
  const rate = shippingFor(shipping, country, subtotal);
  if (!rate.ok) return { country, ships: false };
  if (rate.unknown) return { country, ships: true, cost: null, free: false, estimate: "", freeOver: null };
  return { country, ships: true, cost: rate.cost, free: rate.free, estimate: rate.estimate, zone: rate.zone, freeOver: shipping.rates.get(country)?.freeOver ?? null };
};

const shippingSentence = (line, currency) => {
  if (!line) return "";
  if (!line.ships) return `Does NOT ship to ${countryLabel(line.country)}.`;
  const cost = line.cost === null ? "shipping cost confirmed by the shop by email" : line.cost === 0 ? "free shipping" : `shipping ${money(line.cost, currency)}`;
  const parts = [cost, ...(line.estimate ? [`delivery ${line.estimate}`] : [])];
  if (line.cost && line.freeOver !== null) parts.push(`free from an items total of ${money(line.freeOver, currency)}`);
  return `Ships to ${countryLabel(line.country)}: ${parts.join(", ")}.`;
};

const shippingJson = (line, currency) =>
  line
    ? {
        country: line.country,
        ships: line.ships,
        ...(line.ships && line.cost !== null ? { cost: ucpPrice(line.cost, currency), free: line.free } : {}),
        ...(line.ships && line.estimate ? { delivery: line.estimate } : {}),
        ...(line.ships && line.cost && line.freeOver !== null ? { free_from_items_total: ucpPrice(line.freeOver, currency) } : {}),
      }
    : undefined;

/** "Label: value" rows the product page shows, in its order. */
const detailRows = (product, settings) =>
  productDetails(product.content?.attributes, { extraKeys: [...(product.specKeys ?? []), ...settings.showDetails], language: "en" });

const descriptionOf = (product) => (typeof product.content?.description === "string" ? product.content.description.trim() : "");

/** The policy pages as UCP links (a page's address decides its type), then every other published page. */
const policyLinks = (origin, pages) => {
  const typeOf = (slug) =>
    ({ privacy: "privacy_policy", terms: "terms_of_service", returns: "refund_policy", shipping: "shipping_policy" })[slug] ?? "";
  return pages.map((page) => ({ type: typeOf(page.slug) || "policy", title: page.title, url: absoluteUrl(origin, pagePath(page)) }));
};

/** Sentences of Settings › Shipping note about duties and taxes ("Import duty is paid by the buyer on delivery."), or "". */
export const dutiesNote = (settings) => {
  const note = text(settings.shippingNote);
  if (!note) return "";
  const sentences = note.split(/(?<=[.!?。！？])\s*|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.filter((sentence) => /\b(dut(y|ies)|customs|import tax(es)?|vat|gst|tariffs?)\b|关税|进口税|税费|清关/i.test(sentence)).join(" ");
};

const NO_DUTIES = "The total is the price plus shipping; it includes no import duties or taxes.";

/** A UCP Product for one listed product; `detail` adds everything get_product returns. */
export const productForAgent = (product, state, { origin, country = "", detail = false } = {}) => {
  const { settings } = state;
  const currency = product.currency;
  const price = ucpPrice(product.price, currency);
  const rows = detailRows(product, settings);
  const ship = shippingTo(state, country, product.price);
  const pages = state.pages ?? [];
  const description = detail ? descriptionOf(product) || product.subtitle || product.name : plainSummary(product.subtitle || descriptionOf(product) || product.name, 200);
  const metadata = {
    ...(product.subtitle ? { subtitle: product.subtitle } : {}),
    price_text: product.priceText,
    in_stock: !product.soldOut,
    specs: Object.fromEntries((detail ? rows : rows.slice(0, 5)).map(([label, value]) => [label, value])),
    ...(ship ? { shipping: shippingJson(ship, currency) } : {}),
  };
  if (detail) {
    if (product.content?.bullets?.length) metadata.highlights = product.content.bullets;
    if (product.certificates?.length) metadata.certificates = product.certificates.map((item) => ({ type: item.label, valid_until: item.expires }));
    metadata.shipping_by_country = zonesFor(state).map((zone) => ({
      zone: zone.zone,
      countries: zone.countries,
      ...(zone.cost === null ? { cost: null } : { cost: ucpPrice(unitShipping(zone, product.price), currency) }),
      ...(zone.estimate ? { delivery: zone.estimate } : {}),
    }));
    if (settings.shippingNote) metadata.shipping_note = settings.shippingNote;
    metadata.duties = dutiesNote(settings) || NO_DUTIES;
  }
  return {
    id: product.id,
    handle: product.id,
    title: product.name,
    description: { plain: description },
    url: absoluteUrl(origin, productPath(product)),
    ...(product.category ? { categories: [{ value: product.category, taxonomy: "merchant" }] } : {}),
    price_range: { min: price, max: price },
    media: absoluteImages(origin, product).map((url) => ({ type: "image", url, alt_text: product.name })),
    variants: [
      {
        id: product.id,
        ...(product.sku ? { sku: product.sku } : {}),
        title: product.name,
        price,
        availability: { available: !product.soldOut },
        seller: { name: settings.storeName, ...(pages.length ? { links: policyLinks(origin, pages).map(({ type, url }) => ({ type, url })) } : {}) },
      },
    ],
    metadata,
  };
};

/** Shipping zones for the countries checkout offers: `{ zone, countries, cost, freeOver, estimate }`. */
const zonesFor = (state) => {
  const { settings, shipping } = state;
  const countries = checkoutCountries(settings, shipping);
  if (shipping.status !== "ready") return countries.length ? [{ zone: "Shipping", countries, cost: null, freeOver: null, estimate: "" }] : [];
  const zones = new Map();
  for (const code of countries) {
    const rate = shipping.rates.get(code);
    if (!zones.has(rate.zone)) zones.set(rate.zone, { zone: rate.zone, countries: [], cost: rate.cost, freeOver: rate.freeOver, estimate: rate.estimate });
    zones.get(rate.zone).countries.push(code);
  }
  return [...zones.values()];
};

const unitShipping = (zone, price) => (zone.cost === 0 || (zone.freeOver !== null && Math.round(price * 100) >= Math.round(zone.freeOver * 100)) ? 0 : zone.cost);

const productLines = (product, state, { origin, country, index = null, detail = false }) => {
  const rows = detailRows(product, state.settings);
  const head = `${index === null ? "" : `${index}. `}${product.name} — ${product.priceText} ${product.currency}${product.soldOut ? " — OUT OF STOCK" : ""} — id: ${product.id}`;
  const lines = [head];
  if (product.subtitle) lines.push(`   ${product.subtitle}`);
  const ship = shippingSentence(shippingTo(state, country, product.price), product.currency);
  if (ship) lines.push(`   ${ship}`);
  const shownRows = detail ? rows : rows.slice(0, 4);
  if (shownRows.length) lines.push(`   ${shownRows.map(([label, value]) => `${label}: ${value}`).join(" · ")}`);
  lines.push(`   Page: ${absoluteUrl(origin, productPath(product))}`);
  const image = absoluteImages(origin, product)[0];
  if (image) lines.push(`   Photo: ${image}`);
  return lines;
};

// ---- Search ----

const STOP_WORDS = new Set(
  (
    "a an and any are at be best buy can cheap cheaper cheapest cost costs country deliver delivered delivers delivery do does dollar dollars " +
    "find for from get give good i in is it item items less like me more my need of on one or over please price priced product products " +
    "send shop show ship ships shipping some something than that the them this to under up usd want what which with would you your below above"
  ).split(" "),
);

/** The words of a query worth matching: lower case, no stop words, no bare numbers. */
export const queryTokens = (query) =>
  text(query)
    .slice(0, QUERY_MAX_CHARS)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token && !STOP_WORDS.has(token) && !/^\d+([.,]\d+)?$/.test(token) && (token.length > 1 || /\p{Script=Han}/u.test(token)));

const tokenForms = (token) => {
  const forms = [token];
  if (token.length > 4 && token.endsWith("ies")) forms.push(`${token.slice(0, -3)}y`);
  else if (token.length > 4 && token.endsWith("es")) forms.push(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) forms.push(token.slice(0, -1));
  return forms;
};

const haystackOf = (product) => {
  const attributes = product.content?.attributes ?? {};
  return [
    product.name,
    product.subtitle,
    product.category,
    product.id,
    product.sku,
    ...(product.tags ?? []),
    descriptionOf(product),
    ...(product.content?.bullets ?? []),
    ...Object.entries(attributes).flatMap(([key, value]) => [key, typeof value === "string" || typeof value === "number" ? String(value) : ""]),
  ]
    .join(" \n ")
    .toLowerCase();
};

/** How many of the query's words a product contains (0 = none). */
export const matchScore = (product, tokens) => {
  const haystack = haystackOf(product);
  return tokens.filter((token) => tokenForms(token).some((form) => haystack.includes(form))).length;
};

const ucpEnvelope = (capability) => ({ version: UCP_VERSION, capabilities: { [capability]: [{ version: UCP_VERSION }] } });

const encodeCursor = (offset) => btoa(`offset:${offset}`);
const decodeCursor = (cursor) => {
  try {
    const match = /^offset:(\d{1,4})$/.exec(atob(text(cursor)));
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
};

const intOrNull = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : null);

/** The UCP `catalog` argument, or the arguments themselves when an assistant left the wrapper out. */
const catalogArg = (args) => (isObject(args?.catalog) ? args.catalog : isObject(args) ? args : {});

/** Answer the tools' shared "this shop" line. */
const shopLine = (state, origin) => {
  const { settings, catalog, shipping } = state;
  const countries = checkoutCountries(settings, shipping);
  return `${settings.storeName} (${absoluteUrl(origin, "/")}): ${catalog.listed.length} product${catalog.listed.length === 1 ? "" : "s"} on sale, prices in ${settings.currency}, ships to ${shipsToPhrase(countries) || "no country yet"}.${settings.demoNotice ? " NOTE: this is a demo store; its products and prices are fictional." : ""}`;
};

export const searchCatalog = (args, state, { origin }) => {
  const { settings, catalog } = state;
  const input = catalogArg(args);
  const context = isObject(input.context) ? input.context : {};
  const filters = isObject(input.filters) ? input.filters : {};
  const pagination = isObject(input.pagination) ? input.pagination : {};
  const messages = [];
  const query = text(input.query).slice(0, QUERY_MAX_CHARS);
  // A word in the store's own name or tagline ("toys" for Tumbleberry Toys, "phone" for China Phones)
  // describes everything it sells, so it does not narrow the search.
  const shopWords = `${settings.storeName} ${settings.tagline}`.toLowerCase();
  const queryWords = queryTokens(query);
  const broad = queryWords.filter((token) => tokenForms(token).some((form) => shopWords.includes(form)));
  const tokens = queryWords.filter((token) => !broad.includes(token));

  const rawCountry = text(context.address_country ?? input.address_country ?? input.country);
  const country = countryCodeOf(rawCountry);
  if (rawCountry && !country) messages.push({ type: "warning", code: "unknown_country", content: `"${rawCountry.slice(0, 60)}" is not a country this shop knows: send a 2-letter ISO code such as TH or US.` });
  const offered = checkoutCountries(settings, state.shipping);
  if (country && !offered.includes(country)) {
    messages.push({
      type: "warning",
      code: "region_restricted",
      content: `${settings.storeName} does not ship to ${countryLabel(country)}. It ships to: ${offered.map(countryLabel).join(", ") || "no country yet"}.`,
    });
  }

  let candidates = catalog.listed;
  if (filters.available !== false) candidates = candidates.filter((product) => !product.soldOut);
  const categories = Array.isArray(filters.categories) ? filters.categories.map((item) => text(item).toLowerCase()).filter(Boolean) : [];
  if (categories.length) candidates = candidates.filter((product) => categories.includes(product.category.toLowerCase()));

  const price = isObject(filters.price) ? filters.price : {};
  const filterCurrency = text(context.currency || price.currency).toUpperCase();
  let max = intOrNull(price.max);
  let min = intOrNull(price.min);
  if ((max !== null || min !== null) && filterCurrency && filterCurrency !== settings.currency) {
    messages.push({
      type: "warning",
      code: "currency_not_supported",
      content: `This shop prices in ${settings.currency} only, so the ${filterCurrency} price filter was not applied. Convert it to ${settings.currency} minor units and search again.`,
    });
    max = null;
    min = null;
  }
  if (max !== null) candidates = candidates.filter((product) => toMinor(product.price, product.currency) <= max);
  if (min !== null) candidates = candidates.filter((product) => toMinor(product.price, product.currency) >= min);
  const priceText = [
    ...(min !== null ? [`at least ${money(fromMinor(min, settings.currency), settings.currency)}`] : []),
    ...(max !== null ? [`at most ${money(fromMinor(max, settings.currency), settings.currency)}`] : []),
  ].join(" and ");

  let matched = candidates;
  if (tokens.length) {
    const scored = candidates.map((product, order) => ({ product, order, score: matchScore(product, tokens) })).filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    if (scored.length) matched = scored.map((entry) => entry.product);
    else if (candidates.length) {
      // A shop of phones may never say "phone": rather than an empty answer, list what fits the other filters and say so.
      messages.push({
        type: "info",
        code: "no_text_match",
        content: `No product mentions "${tokens.join(" ")}", so these are all the products that fit the other filters.`,
      });
    }
  }

  const limit = Math.max(1, Math.min(SEARCH_MAX_LIMIT, intOrNull(pagination.limit) ?? SEARCH_DEFAULT_LIMIT));
  const offset = Math.min(decodeCursor(pagination.cursor), matched.length);
  const page = matched.slice(offset, offset + limit);
  const hasNext = offset + limit < matched.length;
  const products = page.map((product) => productForAgent(product, state, { origin, country }));

  const lines = [shopLine(state, origin)];
  const asked = [query ? `"${query}"` : "everything on sale", ...(priceText ? [`price ${priceText} (filters.price is in minor units)`] : []), ...(country ? [`shipping to ${countryLabel(country)}`] : [])];
  lines.push(`Search: ${asked.join(", ")}. ${matched.length} match${matched.length === 1 ? "" : "es"}${matched.length > page.length ? `, showing ${offset + 1}–${offset + page.length}` : ""}.`);
  // Notes go into `messages` too: some clients (Claude Code) hand the model structuredContent instead of the text.
  if (broad.length) messages.unshift({ type: "info", code: "broad_query", content: `"${broad.join(" ")}" describes everything ${settings.storeName} sells, so it did not narrow the search.` });
  if (!page.length && priceText) {
    messages.push({ type: "info", code: "price_in_minor_units", content: `Nothing on sale at that price. filters.price.max is in minor units: 20000 means ${money(200, settings.currency)}.` });
  }
  for (const message of messages) lines.push(`${message.type === "warning" ? "Warning" : "Note"}: ${message.content}`);
  if (!page.length && !priceText) lines.push("Nothing on sale matches.");
  page.forEach((product, index) => lines.push(...productLines(product, state, { origin, country, index: offset + index + 1 })));
  if (hasNext) lines.push(`More results: call search_catalog again with catalog.pagination.cursor = "${encodeCursor(offset + limit)}".`);
  if (page.length) {
    lines.push(
      "To buy: call create_checkout with the product id and the buyer's country. It returns a link to this shop's own checkout page, where the buyer enters the delivery address and pays. Never collect payment or card details in the chat.",
    );
  }

  return {
    text: lines.join("\n"),
    structured: {
      ucp: ucpEnvelope("dev.ucp.shopping.catalog.search"),
      products,
      pagination: { ...(hasNext ? { cursor: encodeCursor(offset + limit) } : {}), has_next_page: hasNext, total_count: matched.length },
      ...(messages.length ? { messages } : {}),
    },
  };
};

// ---- Lookup and get_product ----

const findListed = (state, id) => {
  const wanted = text(id);
  return wanted ? state.catalog.listed.find((product) => product.id === wanted || (product.sku && product.sku === wanted)) ?? null : null;
};

export const lookupCatalog = (args, state, { origin }) => {
  const input = catalogArg(args);
  const ids = (Array.isArray(input.ids) ? input.ids : typeof input.ids === "string" ? [input.ids] : []).map(text).filter(Boolean);
  if (!ids.length || ids.length > LOOKUP_MAX_IDS) {
    return { invalid: `catalog.ids must list 1 to ${LOOKUP_MAX_IDS} product ids.` };
  }
  const context = isObject(input.context) ? input.context : {};
  const country = countryCodeOf(context.address_country);
  const found = [];
  const missing = [];
  for (const id of ids) {
    const product = findListed(state, id);
    if (!product) missing.push(id);
    else if (!found.includes(product)) found.push(product);
  }
  const messages = missing.map((id) => ({ type: "info", code: "not_found", content: id }));
  const lines = [shopLine(state, origin)];
  found.forEach((product, index) => lines.push(...productLines(product, state, { origin, country, index: index + 1 })));
  if (missing.length) lines.push(`Not on sale here (or no such id): ${missing.join(", ")}.`);
  return {
    text: lines.join("\n"),
    structured: {
      ucp: ucpEnvelope("dev.ucp.shopping.catalog.lookup"),
      products: found.map((product) => productForAgent(product, state, { origin, country })),
      ...(messages.length ? { messages } : {}),
    },
  };
};

const notFound = (state, origin, id, capability) => ({
  isError: true,
  text: `${shopLine(state, origin)}\nNo product with id "${text(id).slice(0, 80)}" is on sale here. Use search_catalog to find the right id; do not retry this one.`,
  structured: {
    ucp: { ...ucpEnvelope(capability), status: "error" },
    messages: [{ type: "error", code: "not_found", content: `No product with id "${text(id).slice(0, 80)}" is on sale.`, severity: "unrecoverable" }],
  },
});

export const getProduct = (args, state, { origin }) => {
  const input = catalogArg(args);
  const id = input.id ?? input.product_id ?? args?.id;
  if (!text(id)) return { invalid: "catalog.id (the product id from search_catalog) is required." };
  const product = findListed(state, id);
  if (!product) return notFound(state, origin, id, "dev.ucp.shopping.catalog.lookup");
  const { settings } = state;
  const context = isObject(input.context) ? input.context : {};
  const country = countryCodeOf(context.address_country);
  const lines = [shopLine(state, origin), ...productLines(product, state, { origin, country, detail: true })];
  const description = descriptionOf(product);
  if (description) lines.push("", `Description: ${description}`);
  if (product.content?.bullets?.length) lines.push("", "Highlights:", ...product.content.bullets.map((item) => `- ${item}`));
  if (product.certificates?.length) {
    lines.push("", `Certificates on record (valid): ${product.certificates.map((item) => `${item.label} until ${item.expires}`).join(", ")}.`);
  }
  const zones = zonesFor(state);
  if (zones.length) {
    lines.push("", "Shipping (for one of this product):");
    for (const zone of zones) {
      const cost = zone.cost === null ? "cost confirmed by the shop by email" : unitShipping(zone, product.price) === 0 ? "free" : money(zone.cost, settings.currency);
      lines.push(`- ${zone.zone} (${zone.countries.join(", ")}): ${cost}${zone.estimate ? `, ${zone.estimate}` : ""}`);
    }
  }
  if (settings.shippingNote) lines.push("", `Shipping note from the shop: ${settings.shippingNote.replace(/\s+/g, " ").trim()}`);
  lines.push(`Duties and taxes: ${dutiesNote(settings) || NO_DUTIES}`);
  const pages = state.pages ?? [];
  if (pages.length) lines.push("", `Policies: ${policyLinks(origin, pages).map((link) => `${link.title} ${link.url}`).join(" · ")}`);
  lines.push("", "To buy: call create_checkout with this id and the buyer's country.");
  return {
    text: lines.join("\n"),
    structured: {
      ucp: ucpEnvelope("dev.ucp.shopping.catalog.lookup"),
      product: productForAgent(product, state, { origin, country, detail: true }),
    },
  };
};

// ---- create_checkout: the handoff link ----

/** The buy link: /order prefilled with the products, quantities and the buyer's country. */
export const orderLink = (origin, lines, country) => {
  const params = new URLSearchParams();
  for (const { product, quantity } of lines) {
    params.append("product", product.id);
    params.append("qty", String(quantity));
  }
  if (country) params.set("country", country);
  return `${absoluteUrl(origin, "/order")}?${params}`;
};

/** A short, stable id for a handoff (the same items and country give the same id). */
const handoffId = (link) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < link.length; index += 1) {
    hash ^= link.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `chk_${hash.toString(36)}`;
};

const lineItemsArg = (args) => {
  const checkout = isObject(args?.checkout) ? args.checkout : isObject(args) ? args : {};
  const raw = Array.isArray(checkout.line_items) ? checkout.line_items : [];
  const items = raw
    .filter(isObject)
    .map((item) => ({ id: text(isObject(item.item) ? item.item.id : item.id ?? item.product_id), quantity: intOrNull(item.quantity) ?? 1 }));
  if (!items.length && text(args?.product_id ?? checkout.product_id)) items.push({ id: text(args?.product_id ?? checkout.product_id), quantity: intOrNull(args?.quantity) ?? 1 });
  const destinations = (Array.isArray(checkout.fulfillment?.methods) ? checkout.fulfillment.methods : []).flatMap((method) => (Array.isArray(method?.destinations) ? method.destinations : []));
  const rawCountry = text(
    (isObject(checkout.context) ? checkout.context.address_country : "") ||
      destinations.find((destination) => text(destination?.address_country))?.address_country ||
      args?.country ||
      checkout.country,
  );
  return { items, rawCountry };
};

export const createCheckout = (args, state, { origin, payment }) => {
  const { settings } = state;
  const { items, rawCountry } = lineItemsArg(args);
  if (!items.length) return { invalid: "checkout.line_items needs at least one { item: { id }, quantity }." };
  if (items.length > CHECKOUT_MAX_LINES) return { invalid: `At most ${CHECKOUT_MAX_LINES} line items.` };
  const capability = "dev.ucp.shopping.checkout";
  const messages = [];
  const lines = [];
  const unavailable = [];
  for (const item of items) {
    const product = findListed(state, item.id);
    if (!product) {
      unavailable.push({ id: item.id, code: "not_found", content: `No product with id "${item.id.slice(0, 80)}" is on sale.` });
      continue;
    }
    if (product.soldOut || product.maxQuantity < 1) {
      unavailable.push({ id: item.id, code: "out_of_stock", content: `${product.name} is out of stock.` });
      continue;
    }
    const quantity = Math.max(1, Math.min(product.maxQuantity, item.quantity));
    if (quantity !== item.quantity) messages.push({ type: "warning", code: "quantity_adjusted", content: `${product.name}: quantity set to ${quantity} (at most ${product.maxQuantity} per order).` });
    const existing = lines.find((line) => line.product === product);
    if (existing) existing.quantity = Math.min(product.maxQuantity, existing.quantity + quantity);
    else lines.push({ product, quantity });
  }
  const errorResult = (problems, extraText = "") => ({
    isError: true,
    text: [shopLine(state, origin), ...problems.map((problem) => problem.content), extraText, "No link was made. Use search_catalog to find products this shop can sell to the buyer."].filter(Boolean).join("\n"),
    structured: {
      ucp: { ...ucpEnvelope(capability), status: "error" },
      messages: problems.map((problem) => ({ type: "error", code: problem.code, content: problem.content, severity: "unrecoverable" })),
      continue_url: absoluteUrl(origin, "/"),
    },
  });
  if (!lines.length) return errorResult(unavailable);
  for (const problem of unavailable) messages.push({ type: "warning", code: problem.code, content: `${problem.content} Left out of the link.` });

  const country = countryCodeOf(rawCountry);
  const offered = checkoutCountries(settings, state.shipping);
  if (rawCountry && !country) {
    return errorResult([{ code: "invalid_country", content: `"${rawCountry.slice(0, 60)}" is not a country: send a 2-letter ISO code such as TH or US.` }]);
  }
  if (country && !offered.includes(country)) {
    return errorResult([{ code: "region_restricted", content: `${settings.storeName} does not ship to ${countryLabel(country)}. It ships to: ${offered.map(countryLabel).join(", ") || "no country yet"}.` }]);
  }

  const currency = settings.currency;
  const subtotalCents = lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0);
  const subtotal = subtotalCents / 100;
  const ship = country ? shippingTo(state, country, subtotal) : null;
  const shippingKnown = Boolean(ship?.ships && ship.cost !== null);
  const total = (subtotalCents + (shippingKnown ? Math.round(ship.cost * 100) : 0)) / 100;
  const link = orderLink(origin, lines, country);
  const duties = dutiesNote(settings);
  const paypal = payment === "paypal";

  messages.unshift({
    type: "error",
    code: "buyer_handoff",
    content: paypal
      ? "The buyer enters the delivery address and pays with PayPal on the shop's own checkout page: open continue_url."
      : "The buyer enters the delivery address and sends an order request on the shop's own checkout page (continue_url); the shop then confirms the order and how to pay by email.",
    severity: "requires_buyer_input",
  });
  if (!country) messages.push({ type: "info", code: "country_needed", content: "No country given: the shipping cost appears once the buyer picks a country on the page. Ask for the country to quote the total." });
  messages.push({ type: "info", code: "duties", content: duties || NO_DUTIES });

  const totals = [
    { type: "subtotal", display_text: "Items", amount: toMinor(subtotal, currency) },
    ...(shippingKnown ? [{ type: "fulfillment", display_text: `Shipping to ${countryName(country, "en")}`, amount: toMinor(ship.cost, currency) }] : []),
    { type: "total", display_text: shippingKnown ? "Total" : "Total before shipping", amount: toMinor(total, currency) },
  ];

  const textLines = [
    shopLine(state, origin),
    `Buy link (the shop's own checkout page, already filled in with ${lines.length === 1 ? "this product" : "these products"}${country ? ` and ${countryName(country, "en")}` : ""}):`,
    link,
    ...lines.map((line) => `- ${line.product.name} × ${line.quantity}: ${money(line.product.price * line.quantity, currency)}`),
    country
      ? shippingKnown
        ? `- Shipping to ${countryName(country, "en")}: ${ship.cost === 0 ? "free" : money(ship.cost, currency)}${ship.estimate ? ` (delivery ${ship.estimate})` : ""}`
        : `- Shipping to ${countryName(country, "en")}: the shop confirms the cost by email`
      : "- Shipping: shown once the buyer picks a country on the page",
    `- ${shippingKnown ? "Total" : "Total before shipping"}: ${money(total, currency)} ${currency}`,
    paypal
      ? "Payment: with PayPal on that page. Nothing is charged in this chat."
      : "Payment: this shop takes order requests. The buyer sends the request on that page and the shop replies by email with how to pay. Nothing is charged in this chat.",
    `Duties and taxes: ${duties || NO_DUTIES}`,
    ...messages.filter((message) => message.type === "warning").map((message) => `Warning: ${message.content}`),
    "Give the buyer the link. Do not ask for the address, card or PayPal details in the chat, and do not fill in the order form for them.",
  ];

  return {
    text: textLines.join("\n"),
    structured: {
      ucp: { ...ucpEnvelope(capability), payment_handlers: {} },
      id: handoffId(link),
      status: "requires_escalation",
      currency,
      line_items: lines.map((line, index) => ({
        id: `li_${index + 1}`,
        item: { id: line.product.id, title: line.product.name, price: toMinor(line.product.price, currency) },
        quantity: line.quantity,
        totals: [
          { type: "subtotal", amount: toMinor(line.product.price * line.quantity, currency) },
          { type: "total", amount: toMinor(line.product.price * line.quantity, currency) },
        ],
      })),
      ...(country ? { context: { address_country: country } } : {}),
      totals,
      messages,
      links: policyLinks(origin, state.pages ?? []).map(({ type, url }) => ({ type, url })),
      continue_url: link,
    },
  };
};

// ---- The tools as MCP lists them ----

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const META_SCHEMA = {
  type: "object",
  description: 'Optional UCP request metadata (meta["ucp-agent"].profile). Not needed.',
};
const CONTEXT_SCHEMA = {
  type: "object",
  description: "Buyer signals.",
  properties: {
    address_country: { type: "string", description: "The buyer's country, ISO 3166-1 alpha-2 (TH, PH, VN, US…)." },
  },
};

export const toolDefinitions = (state) => {
  const ready = state?.setup === "ready";
  const shop = ready ? state.settings.storeName : "this shop";
  const currency = ready ? state.settings.currency : "the shop's currency";
  const example = ready && currencyDigits(currency) === 0 ? `20000 = ${money(20000, currency)}` : ready ? `20000 = ${money(200, currency)}` : "20000 = 200.00";
  const countries = ready ? checkoutCountries(state.settings, state.shipping) : [];
  const about = ready
    ? ` (${state.catalog.listed.length} products on sale, prices in ${currency}, ships to ${shipsToPhrase(countries) || "no country yet"})`
    : "";
  return [
    {
      name: "search_catalog",
      title: `Search ${shop}'s products`,
      description:
        `Search the products on sale in ${shop}'s online shop${about}. Use it for requests like "find me a phone under $200 that ships to Thailand". ` +
        "Every argument is optional. Put the buyer's country in catalog.context.address_country to learn whether the shop ships there and the shipping cost of each product. " +
        `catalog.filters.price.max is in MINOR units of ${currency} (${example}). ` +
        "Returns each product's id, name, price, stock, a few specs, its web page and a photo. To buy, call create_checkout: it gives a link to the shop's own checkout page. Payment never happens in the chat. (Universal Commerce Protocol catalog search.)",
      inputSchema: {
        type: "object",
        properties: {
          meta: META_SCHEMA,
          catalog: {
            type: "object",
            description: "What to search for.",
            properties: {
              query: { type: "string", maxLength: QUERY_MAX_CHARS, description: 'Free text: a product type, brand, model or feature ("phone", "robot toy"). Leave it out to list everything on sale.' },
              context: {
                ...CONTEXT_SCHEMA,
                properties: {
                  ...CONTEXT_SCHEMA.properties,
                  currency: { type: "string", description: `ISO 4217 currency of the price filter. This shop prices in ${currency} only.` },
                },
              },
              filters: {
                type: "object",
                properties: {
                  price: {
                    type: "object",
                    properties: {
                      min: { type: "integer", minimum: 0, description: `Lowest price, in minor units of ${currency}.` },
                      max: { type: "integer", minimum: 0, description: `Highest price, in minor units of ${currency} (${example}).` },
                    },
                  },
                  categories: { type: "array", items: { type: "string" }, description: "Only these categories (as the shop names them)." },
                  available: { type: "boolean", default: true, description: "Only products in stock (default true)." },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  limit: { type: "integer", minimum: 1, maximum: SEARCH_MAX_LIMIT, default: SEARCH_DEFAULT_LIMIT },
                  cursor: { type: "string", description: "The cursor a previous search returned, for the next page." },
                },
              },
            },
          },
        },
      },
      annotations: { title: `Search ${shop}'s products`, ...READ_ONLY },
    },
    {
      name: "lookup_catalog",
      title: "Look up products by id",
      description: `Look up to ${LOOKUP_MAX_IDS} of ${shop}'s products by id at once (the ids search_catalog returns). Same fields as search_catalog. (Universal Commerce Protocol catalog lookup.)`,
      inputSchema: {
        type: "object",
        properties: {
          meta: META_SCHEMA,
          catalog: {
            type: "object",
            properties: {
              ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: LOOKUP_MAX_IDS, description: "Product ids." },
              context: CONTEXT_SCHEMA,
            },
            required: ["ids"],
          },
        },
        required: ["catalog"],
      },
      annotations: { title: "Look up products by id", ...READ_ONLY },
    },
    {
      name: "get_product",
      title: "Get one product in full",
      description:
        `Everything ${shop} says about one product: description, highlights, all specs, warranty and returns, valid certificates, the shipping cost and delivery time for every country it ships to, the shop's shipping note and policies. ` +
        "Give catalog.context.address_country to have that country's shipping spelled out. (Universal Commerce Protocol get_product.)",
      inputSchema: {
        type: "object",
        properties: {
          meta: META_SCHEMA,
          catalog: {
            type: "object",
            properties: {
              id: { type: "string", description: "The product id from search_catalog." },
              context: CONTEXT_SCHEMA,
            },
            required: ["id"],
          },
        },
        required: ["catalog"],
      },
      annotations: { title: "Get one product in full", ...READ_ONLY },
    },
    {
      name: "create_checkout",
      title: "Get the buy link",
      description:
        `Make the link to buy products on ${shop}'s own website: its checkout page, already filled in with the products, quantities and the buyer's country, plus the total (price + shipping). ` +
        "It does not place an order or take payment, and nothing is saved: the buyer opens the link, types the delivery address and pays there. Give the link to the buyer as it is. " +
        "Put the buyer's country in checkout.context.address_country. (Universal Commerce Protocol create_checkout; always answers requires_escalation with continue_url.)",
      inputSchema: {
        type: "object",
        properties: {
          meta: META_SCHEMA,
          checkout: {
            type: "object",
            properties: {
              line_items: {
                type: "array",
                minItems: 1,
                maxItems: CHECKOUT_MAX_LINES,
                items: {
                  type: "object",
                  properties: {
                    item: { type: "object", properties: { id: { type: "string", description: "The product id." } }, required: ["id"] },
                    quantity: { type: "integer", minimum: 1, default: 1 },
                  },
                  required: ["item"],
                },
              },
              context: CONTEXT_SCHEMA,
            },
            required: ["line_items"],
          },
        },
        required: ["checkout"],
      },
      annotations: { title: "Get the buy link", ...READ_ONLY },
    },
  ];
};

/** What initialize and server/discover say about this server. */
export const serverInstructions = (state, origin) => {
  if (state?.setup !== "ready") return "An online shop built with Busa Shop. It is still being set up: its catalog is not available yet.";
  const { settings } = state;
  return [
    `${settings.storeName}'s online shop (${absoluteUrl(origin, "/")}).${settings.tagline ? ` ${settings.tagline.replace(/[.\s]+$/, "")}.` : ""}`,
    "These tools read the products on sale and make a link to the shop's own checkout page. They never place an order or take payment: the buyer opens the link, enters the delivery address and pays (or sends an order request) on the shop's website.",
    `Prices are in ${settings.currency}; price filters use minor units (cents). Never ask the buyer for card or PayPal details.`,
    ...(settings.demoNotice ? ["This is a demo store: its products and prices are fictional."] : []),
  ].join(" ");
};

/** Run one tool. `{ text, structured, isError? }`, or `{ invalid }` for arguments it cannot use, or null for an unknown tool. */
export const runTool = (name, args, state, { origin, payment }) => {
  const input = isObject(args) ? args : {};
  if (name === "search_catalog") return searchCatalog(input, state, { origin });
  if (name === "lookup_catalog") return lookupCatalog(input, state, { origin });
  if (name === "get_product") return getProduct(input, state, { origin });
  if (name === "create_checkout") return createCheckout(input, state, { origin, payment });
  return null;
};

export const TOOL_NAMES = ["search_catalog", "lookup_catalog", "get_product", "create_checkout"];

// ---- /.well-known/ucp ----

export const buildUcpProfile = (origin) => ({
  ucp: {
    version: UCP_VERSION,
    services: {
      "dev.ucp.shopping": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/overview/`,
          transport: "mcp",
          endpoint: absoluteUrl(origin, MCP_PATH),
          schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`,
        },
      ],
    },
    capabilities: {
      "dev.ucp.shopping.catalog.search": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/shopping/catalog/search`,
          schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_search.json`,
        },
      ],
      "dev.ucp.shopping.catalog.lookup": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/shopping/catalog/lookup`,
          schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_lookup.json`,
        },
      ],
    },
    payment_handlers: {},
  },
});

// ---- /feeds/google.xml (Google Merchant Center, https://support.google.com/merchants/answer/7052112) ----

const feedPrice = (amount, currency) => `${amount.toFixed(currencyDigits(currency))} ${currency}`;
const GTIN = /^\d{8}$|^\d{12,14}$/;

export const buildGoogleFeed = ({ origin, settings, catalog, shipping }) => {
  const state = { settings, shipping };
  const zones = shipping?.status === "ready" ? zonesFor(state) : [];
  const tag = (name, value) => (value === "" || value === null || value === undefined ? "" : `<g:${name}>${xmlEscape(value)}</g:${name}>`);
  const items = catalog.listed.map((product) => {
    const images = absoluteImages(origin, product);
    const description = plainSummary(descriptionOf(product) || product.subtitle || product.name, 5000);
    const gtin = String(product.content?.attributes?.gtin ?? "").replace(/[\s-]/g, "");
    const shippingTags = [];
    for (const zone of zones) {
      for (const code of zone.countries) {
        if (shippingTags.length >= FEED_MAX_SHIPPING) break;
        const days = deliveryDays(zone.estimate);
        shippingTags.push(
          `<g:shipping>${tag("country", code)}${tag("service", zone.zone)}${tag("price", feedPrice(unitShipping(zone, product.price), product.currency))}${days ? `${tag("min_transit_time", days.min)}${tag("max_transit_time", days.max)}` : ""}</g:shipping>`,
        );
      }
    }
    return [
      "<item>",
      tag("id", product.id.slice(0, 50)),
      tag("title", product.name.slice(0, 150)),
      tag("description", description),
      tag("link", absoluteUrl(origin, productPath(product))),
      tag("image_link", images[0] ?? ""),
      ...images.slice(1, 1 + FEED_MAX_IMAGES).map((url) => tag("additional_image_link", url)),
      tag("availability", product.soldOut ? "out_of_stock" : "in_stock"),
      tag("price", feedPrice(product.price, product.currency)),
      tag("condition", "new"),
      tag("brand", (productBrand(product) || settings.storeName).slice(0, 70)),
      GTIN.test(gtin) ? tag("gtin", gtin) : tag("identifier_exists", "no"),
      ...(product.category ? [tag("product_type", product.category.slice(0, 750))] : []),
      ...shippingTags,
      "</item>",
    ]
      .filter(Boolean)
      .join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${xmlEscape(settings.storeName)}</title>`,
    `<link>${xmlEscape(absoluteUrl(origin, "/"))}</link>`,
    `<description>${xmlEscape(settings.tagline || settings.storeName)}</description>`,
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
};

// ---- /agents.md ----

const mdText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const buildAgentsMd = ({ origin, settings, catalog, shipping, pages = [], payment = "request" }) => {
  const state = { settings, shipping, catalog, pages };
  const mcp = absoluteUrl(origin, MCP_PATH);
  const countries = checkoutCountries(settings, shipping);
  const duties = dutiesNote(settings);
  const out = [
    `# Agent Instructions — ${mdText(settings.storeName)}`,
    "",
    `You can help your user find and buy products from ${mdText(settings.storeName)}'s online shop, ${absoluteUrl(origin, "/")}.${settings.tagline ? ` ${mdText(settings.tagline).replace(/[.\s]+$/, "")}.` : ""} It has ${catalog.listed.length} product${catalog.listed.length === 1 ? "" : "s"} on sale, priced in ${settings.currency}.`,
    ...(settings.demoNotice ? ["", "Note: this is a demo store. Its products, prices and orders are fictional."] : []),
    "",
    "## MCP server — recommended",
    "",
    `Connect to \`${mcp}\`: MCP over Streamable HTTP, no sign-in, read-only. Tools:`,
    "",
    "- `search_catalog`: search the products on sale (free text, the buyer's country for shipping costs, a price limit in minor units).",
    "- `lookup_catalog`: up to 10 products by id.",
    "- `get_product`: one product in full: specs, warranty, returns, shipping cost per country, certificates.",
    "- `create_checkout`: the link to this shop's own checkout page, filled in with the products and the buyer's country, and the total (price + shipping).",
    "",
    `The tools use the [Universal Commerce Protocol](https://ucp.dev) catalog tool names and shapes; its \`meta\` object is optional here. UCP profile: \`${absoluteUrl(origin, UCP_PROFILE_PATH)}\`.`,
    "",
    `- Claude: Customize → Connectors → + Add → Add custom connector → URL \`${mcp}\` → No sign in.`,
    `- ChatGPT (Business, Enterprise and Edu workspaces): Plugins → + → Add custom MCP server → URL \`${mcp}\`.`,
    "",
    "## Buying",
    "",
    `- Every purchase is completed on this shop's own website. The link from \`create_checkout\` opens ${absoluteUrl(origin, "/order")} with the products and the country filled in; the buyer types the delivery address there and ${payment === "paypal" ? "pays with PayPal" : "sends an order request (the shop then confirms the order and how to pay by email)"}.`,
    "- Never ask the buyer for card, PayPal or password details in the chat, and never submit the order form for them.",
    `- Prices are in ${settings.currency}. ${duties || NO_DUTIES}`,
    "",
    "## Shop facts",
    "",
    `- Website: ${absoluteUrl(origin, "/")}`,
    `- Currency: ${settings.currency}`,
    ...(countries.length ? [`- Ships to: ${countries.length > 40 ? "most countries (the checkout lists them)" : countries.map(countryLabel).join(", ")}`] : []),
    `- Payment: ${payment === "paypal" ? "PayPal on the shop's checkout page" : "order requests: the shop confirms the order and payment by email"}`,
    ...(settings.contactEmail ? [`- Contact: ${settings.contactEmail}`] : []),
    "",
  ];
  const zones = zonesFor(state);
  if (shipping?.status === "ready" && zones.length) {
    out.push("## Shipping", "");
    for (const zone of zones) {
      const parts = [zone.cost === 0 ? "free shipping" : `shipping ${money(zone.cost, settings.currency)}`];
      if (zone.cost !== 0 && zone.freeOver !== null) parts.push(`free from an items total of ${money(zone.freeOver, settings.currency)}`);
      if (zone.estimate) parts.push(`delivery ${zone.estimate}`);
      out.push(`- ${mdText(zone.zone)} (${zone.countries.join(", ")}): ${parts.join(", ")}`);
    }
    if (settings.shippingNote) out.push("", mdText(settings.shippingNote));
    out.push("");
  }
  if (pages.length) {
    out.push("## Store policies", "");
    for (const page of pages) out.push(`- **${mdText(page.title)}**: ${absoluteUrl(origin, pagePath(page))}`);
    out.push("");
  }
  out.push(
    "## Read-only browsing",
    "",
    "Prefer the MCP tools above. You may also read the public pages:",
    "",
    `- \`/llms.txt\`: a plain summary with every product, its price and its page.`,
    `- \`${GOOGLE_FEED_PATH}\`: every product as a Google Merchant Center feed (price, stock, shipping per country).`,
    "- `/sitemap.xml`, product pages at `/products/{id}`, the blog at `/blog`.",
    "",
    "## Interaction guidelines",
    "",
    "- Rate limits: back off on `429` and respect `Retry-After`.",
    "- Freshness: a change in the shop shows here within about a minute.",
    "",
    `- Agent discovery: this document (\`${AGENTS_PATH}\`) describes the shop for agents.`,
    "",
  );
  return out.join("\n");
};
