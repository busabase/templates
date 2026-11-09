// Search basics the Worker serves itself: sitemap.xml, robots.txt, llms.txt,
// the blog's RSS feed, the schema.org JSON-LD blocks, and the description text
// for <meta> tags. Pure (test/seo.test.mjs, test/posts.test.mjs).

import { countryName, formatPrice, imageSrc } from "./catalog.js";
import { markdownText, pagePath } from "./policies.js";
import { BLOG_PATH, canonicalElsewhere, coverSrc, FEED_ITEMS, FEED_PATH, mentionedProducts, postSummary } from "./posts.js";
import { checkoutCountries } from "./shipping.js";

const xmlEscape = (value) =>
  String(value).replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);

export const productPath = (product) => `/products/${encodeURIComponent(product.id)}`;

export const absoluteUrl = (origin, pathOrUrl) => new URL(pathOrUrl, origin).href;

/** Absolute URLs of a product's images, as a crawler or a link preview will fetch them. */
export const absoluteImages = (origin, product) =>
  product.images.map((image, index) => absoluteUrl(origin, imageSrc(product, image, index)));

/** One line of plain text, at most `max` characters, cut at a word. */
export const plainSummary = (value, max = 160) => {
  const flat = String(value ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
};

const isoDay = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
};

const urlEntry = (origin, path, lastmod = "") =>
  `  <url><loc>${xmlEscape(absoluteUrl(origin, path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;

/** Posts whose own address is the canonical one: the sitemap, llms.txt and the feed list these. */
export const indexablePosts = (origin, posts = []) => posts.filter((post) => !canonicalElsewhere(post, origin));

export const buildSitemap = (origin, products, pages = [], posts = []) => {
  const blog = indexablePosts(origin, posts);
  const urls = [
    urlEntry(origin, "/"),
    ...products.map((product) => urlEntry(origin, productPath(product), isoDay(product.updatedAt))),
    ...pages.map((page) => urlEntry(origin, `/pages/${page.slug}`)),
    ...(blog.length ? [urlEntry(origin, BLOG_PATH, isoDay(blog[0].updatedAt) || blog[0].publishedAt)] : []),
    ...blog.map((post) => urlEntry(origin, post.path, isoDay(post.updatedAt) || post.publishedAt)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
};

/**
 * Search engines and AI assistants' crawlers, named so a reader of robots.txt
 * sees they are welcome. `User-agent: *` already lets every one of them in;
 * naming them in the same group changes nothing for any other crawler.
 * OpenAI (GPTBot, OAI-SearchBot, ChatGPT-User), Anthropic (ClaudeBot,
 * Claude-SearchBot, Claude-User), Perplexity, Google, Bing, Apple, DuckDuckGo.
 */
export const NAMED_CRAWLERS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
];

export const buildRobots = (origin) =>
  [
    "# Search engines and AI assistants are welcome. A summary for them: /llms.txt",
    "User-agent: *",
    ...NAMED_CRAWLERS.map((name) => `User-agent: ${name}`),
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /order",
    "Disallow: /pay/",
    "",
    `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`,
    "",
  ].join("\n");

export const productDescription = (product) =>
  plainSummary([product.subtitle, typeof product.content.description === "string" ? product.content.description : ""]
    .filter(Boolean)
    .join(". "));

/** The maker's brand from the product's details (a shop reselling REDMI phones is not their brand); empty when not given. */
const productBrand = (product) => {
  const brand = product.content?.attributes?.brand;
  return typeof brand === "string" ? brand.trim() : "";
};

// Merchant listing structured data: shippingDetails (OfferShippingDetails) and
// hasMerchantReturnPolicy, as Google reads them:
// https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
// Both are written only from what the tables say. A zone whose Delivery time
// does not read as days ("6–10 business days") is left out, because Google
// requires a deliveryTime; a return policy is written only when the product's
// Returns says a number of days ("30-day returns") or that it cannot be returned.

/** "6–10 business days" → { min: 6, max: 10 }; "5 days" → { min: 5, max: 5 }; anything else → null. */
export const deliveryDays = (estimate) => {
  const match = /(\d{1,3})(?:\s*(?:–|—|-|to|bis|à|a)\s*(\d{1,3}))?\s*(?:business\s+|working\s+|calendar\s+)?(?:days?|tage|jours|días|dias|天|日)/i.exec(String(estimate ?? ""));
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  return max >= min ? { min, max } : null;
};

/** One OfferShippingDetails per Shipping zone, for the countries checkout offers. */
export const shippingDetailsFor = (product, settings, shipping) => {
  if (!shipping || shipping.status !== "ready") return [];
  const zones = new Map();
  for (const code of checkoutCountries(settings, shipping)) {
    const rate = shipping.rates.get(code);
    if (!zones.has(rate.zone)) zones.set(rate.zone, { rate, countries: [] });
    zones.get(rate.zone).countries.push(code);
  }
  const details = [];
  for (const { rate, countries } of zones.values()) {
    const days = deliveryDays(rate.estimate);
    if (!days) continue;
    // One unit of this product: free when the zone is free or the price reaches its threshold.
    const free = rate.cost === 0 || (rate.freeOver !== null && product.price >= rate.freeOver);
    details.push({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: free ? 0 : rate.cost, currency: rate.currency },
      shippingDestination: countries.map((code) => ({ "@type": "DefinedRegion", addressCountry: code })),
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        transitTime: { "@type": "QuantitativeValue", minValue: days.min, maxValue: days.max, unitCode: "DAY" },
      },
    });
  }
  return details;
};

const MAX_RETURN_COUNTRIES = 50; // Google reads at most 50 applicableCountry values

/** The product's Returns text as a MerchantReturnPolicy, or null when it says neither a number of days nor "no returns". */
export const returnPolicyFor = (product, settings, shipping) => {
  const returns = product.content?.attributes?.returns;
  if (typeof returns !== "string" || !returns.trim()) return null;
  const countries = shipping?.status === "ready" ? checkoutCountries(settings, shipping) : [];
  if (!countries.length || countries.length > MAX_RETURN_COUNTRIES) return null;
  const applicableCountry = countries.length === 1 ? countries[0] : countries;
  if (/\bno returns?\b|non-returnable|not returnable|keine rückgabe|不退|不支持退/i.test(returns)) {
    return { "@type": "MerchantReturnPolicy", applicableCountry, returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" };
  }
  const days = /(\d{1,3})\s*-?\s*(?:days?|tage|jours|días|dias|天|日)/i.exec(returns);
  if (!days || Number(days[1]) < 1) return null;
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: Number(days[1]),
    // An online shop: what comes back comes back by post.
    returnMethod: "https://schema.org/ReturnByMail",
  };
};

export const productJsonLd = ({ origin, product, settings, shipping = null }) => {
  const url = absoluteUrl(origin, productPath(product));
  const shippingDetails = shippingDetailsFor(product, settings, shipping);
  const returnPolicy = returnPolicyFor(product, settings, shipping);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    ...(productDescription(product) ? { description: productDescription(product) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.images.length ? { image: absoluteImages(origin, product) } : {}),
    brand: { "@type": "Brand", name: productBrand(product) || settings.storeName },
    offers: {
      "@type": "Offer",
      url,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: product.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: settings.storeName },
      ...(shippingDetails.length ? { shippingDetails } : {}),
      ...(returnPolicy ? { hasMerchantReturnPolicy: returnPolicy } : {}),
    },
  };
  return data;
};

export const storeJsonLd = ({ origin, settings }) => ({
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  name: settings.storeName,
  url: absoluteUrl(origin, "/"),
  ...(settings.tagline ? { description: settings.tagline } : {}),
  ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
});

/** The absolute URL of a post's picture: its cover, else the first product it links to that has a photo. */
export const postImage = (origin, post, listed = []) => {
  if (post.cover) return absoluteUrl(origin, coverSrc(post));
  const product = mentionedProducts(post, listed).find((item) => item.images.length);
  return product ? absoluteImages(origin, product)[0] : "";
};

export const postUrl = (origin, post) => post.canonicalUrl || absoluteUrl(origin, post.path);

/** BlogPosting and its Home › Blog › post BreadcrumbList. */
export const postJsonLd = ({ origin, post, settings, blogLabel = "Blog", listed = [] }) => {
  const url = postUrl(origin, post);
  const image = postImage(origin, post, listed);
  const description = post.seoDescription || postSummary(post, 300);
  const byShop = !post.author || post.author.toLowerCase().includes(settings.storeName.toLowerCase());
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title.slice(0, 110),
      url,
      mainEntityOfPage: url,
      ...(description ? { description } : {}),
      ...(image ? { image: [image] } : {}),
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
      ...(post.locale ? { inLanguage: post.locale } : {}),
      author: byShop
        ? { "@type": "Organization", name: post.author || settings.storeName, url: absoluteUrl(origin, "/") }
        : { "@type": "Person", name: post.author },
      publisher: { "@type": "Organization", name: settings.storeName, url: absoluteUrl(origin, "/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: settings.storeName, item: absoluteUrl(origin, "/") },
        { "@type": "ListItem", position: 2, name: blogLabel, item: absoluteUrl(origin, BLOG_PATH) },
        { "@type": "ListItem", position: 3, name: post.title, item: absoluteUrl(origin, post.path) },
      ],
    },
  ];
};

const rfc822 = (iso) => {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? new Date(ms).toUTCString() : "";
};

/** RSS 2.0 for the newest posts (/blog/rss.xml). */
export const buildFeed = ({ origin, settings, posts, blogLabel = "Blog" }) => {
  const items = indexablePosts(origin, posts).slice(0, FEED_ITEMS);
  const newest = items[0];
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `<channel>`,
    `<title>${xmlEscape(`${settings.storeName} · ${blogLabel}`)}</title>`,
    `<link>${xmlEscape(absoluteUrl(origin, BLOG_PATH))}</link>`,
    `<description>${xmlEscape(settings.tagline || settings.storeName)}</description>`,
    `<language>${xmlEscape(settings.language || "en")}</language>`,
    `<atom:link href="${xmlEscape(absoluteUrl(origin, FEED_PATH))}" rel="self" type="application/rss+xml"/>`,
    ...(newest ? [`<lastBuildDate>${rfc822(newest.updatedAt || newest.publishedAt)}</lastBuildDate>`] : []),
    ...items.map((post) => {
      const link = absoluteUrl(origin, post.path);
      const date = rfc822(post.publishedAt || post.updatedAt);
      return [
        `<item>`,
        `<title>${xmlEscape(post.title)}</title>`,
        `<link>${xmlEscape(link)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        ...(date ? [`<pubDate>${date}</pubDate>`] : []),
        `<description>${xmlEscape(postSummary(post, 300))}</description>`,
        `</item>`,
      ].join("");
    }),
    `</channel>`,
    `</rss>`,
    "",
  ];
  return lines.join("\n");
};

const mdText = (value) => String(value ?? "").replace(/\s+/g, " ").replace(/([[\]])/g, "\\$1").trim();

/**
 * /llms.txt (https://llmstxt.org): what an AI assistant needs to answer "where
 * can I buy …, what does it cost, do they ship to me" from this shop, written
 * from the tables: listed products, published policy pages and posts only.
 */
export const buildLlmsTxt = ({ origin, settings, catalog, shipping, pages = [], posts = [], payment = "request" }) => {
  const money = (amount) => formatPrice(amount, settings.currency, "en");
  const listed = catalog.listed;
  const categories = [...new Set(listed.map((product) => product.category).filter(Boolean))];
  const countries = shipping?.status === "ready" ? checkoutCountries(settings, shipping) : settings.shipsTo;
  const countryNames = countries.map((code) => countryName(code, "en"));
  const shipsLine =
    countries.length > 40 ? "most countries (the checkout lists them)" : countryNames.join(", ");
  const summary = [
    settings.tagline ? `${settings.tagline.replace(/[.\s]+$/, "")}.` : "",
    `An online shop with ${listed.length} product${listed.length === 1 ? "" : "s"} on sale${categories.length ? ` (${categories.join(", ")})` : ""}, priced in ${settings.currency}${countries.length ? `, shipping to ${shipsLine}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const out = [`# ${mdText(settings.storeName)}`, "", `> ${summary}`, ""];
  if (settings.demoNotice) out.push("Note: this is a demo store. Its products, prices and orders are fictional.", "");
  if (settings.about) out.push(markdownText(settings.about), "");
  out.push(
    `- Website: ${absoluteUrl(origin, "/")}`,
    `- Currency: ${settings.currency}`,
    ...(countries.length ? [`- Ships to: ${shipsLine}`] : []),
    `- Payment: ${payment === "paypal" ? "online with PayPal at checkout" : "order requests: the shop confirms the order and payment by email"}`,
    ...(settings.contactEmail ? [`- Contact: ${settings.contactEmail}`] : []),
    "",
  );
  if (shipping?.status === "ready" && countries.length) {
    const zones = new Map();
    for (const code of countries) {
      const rate = shipping.rates.get(code);
      if (!zones.has(rate.zone)) zones.set(rate.zone, { rate, codes: [] });
      zones.get(rate.zone).codes.push(code);
    }
    out.push("## Shipping", "");
    for (const { rate, codes } of zones.values()) {
      const parts = [
        rate.cost === 0 ? "free shipping" : `shipping ${money(rate.cost)}`,
        ...(rate.cost !== 0 && rate.freeOver !== null ? [`free from an items total of ${money(rate.freeOver)}`] : []),
        ...(rate.estimate ? [`delivery ${rate.estimate}`] : []),
      ];
      out.push(`- ${mdText(rate.zone)} (${codes.join(", ")}): ${parts.join(", ")}`);
    }
    if (settings.shippingNote) out.push("", markdownText(settings.shippingNote));
    out.push("");
  }
  if (listed.length) {
    out.push("## Products", "");
    for (const product of listed) {
      const notes = [product.priceText, ...(product.soldOut ? ["out of stock"] : []), ...(product.subtitle ? [product.subtitle] : [])];
      out.push(`- [${mdText(product.name)}](${absoluteUrl(origin, productPath(product))}): ${mdText(notes.join(". "))}`);
    }
    out.push("");
  }
  if (pages.length) {
    out.push("## Policies", "");
    for (const page of pages) out.push(`- [${mdText(page.title)}](${absoluteUrl(origin, pagePath(page))})`);
    out.push("");
  }
  const blog = indexablePosts(origin, posts);
  if (blog.length) {
    out.push("## Blog", "");
    for (const post of blog) {
      const summaryText = postSummary(post, 200);
      out.push(`- [${mdText(post.title)}](${absoluteUrl(origin, post.path)})${summaryText ? `: ${mdText(summaryText)}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
};

/** A JSON-LD block that cannot close its own <script> element. */
export const jsonLdScript = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
