// Search basics the Worker serves itself: sitemap.xml, robots.txt, the
// schema.org JSON-LD blocks, and the description text for <meta> tags.
// Pure (test/seo.test.mjs).

import { imageSrc } from "./catalog.js";

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

export const buildSitemap = (origin, products) => {
  const urls = [
    `  <url><loc>${xmlEscape(absoluteUrl(origin, "/"))}</loc></url>`,
    ...products.map((product) => {
      const lastmod = isoDay(product.updatedAt);
      return `  <url><loc>${xmlEscape(absoluteUrl(origin, productPath(product)))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
};

export const buildRobots = (origin) =>
  [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /order",
    `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`,
    "",
  ].join("\n");

export const productDescription = (product) =>
  plainSummary([product.subtitle, typeof product.content.description === "string" ? product.content.description : ""]
    .filter(Boolean)
    .join(". "));

export const productJsonLd = ({ origin, product, settings }) => {
  const url = absoluteUrl(origin, productPath(product));
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    ...(productDescription(product) ? { description: productDescription(product) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.images.length ? { image: absoluteImages(origin, product) } : {}),
    brand: { "@type": "Brand", name: settings.storeName },
    offers: {
      "@type": "Offer",
      url,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: product.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: settings.storeName },
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

/** A JSON-LD block that cannot close its own <script> element. */
export const jsonLdScript = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
