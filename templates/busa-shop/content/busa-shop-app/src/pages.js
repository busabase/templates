// Server-rendered HTML. Every value that came from the workspace or the
// visitor goes through `esc`; nothing is concatenated raw. Every page carries
// <meta charset="utf-8"> (Cloudflare serves text/html without a charset).

import { countryName, formatPrice, imageSrc } from "./catalog.js";
import { CLIENT_MESSAGE_KEYS, translator } from "./i18n.js";
import {
  absoluteImages,
  absoluteUrl,
  jsonLdScript,
  plainSummary,
  productDescription,
  productJsonLd,
  productPath,
  storeJsonLd,
} from "./seo.js";

export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const paragraphs = (value) =>
  String(value ?? "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

const layout = ({
  settings,
  t,
  title,
  description,
  canonical,
  ogType = "website",
  ogImage = "",
  jsonLd = [],
  noindex = false,
  body,
}) => {
  const lang = settings?.language ?? "en";
  const storeName = settings?.storeName ?? "";
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : "",
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : "",
    noindex ? `<meta name="robots" content="noindex">` : "",
    `<meta property="og:type" content="${esc(ogType)}">`,
    storeName ? `<meta property="og:site_name" content="${esc(storeName)}">` : "",
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : "",
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : "",
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : "",
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="/static/shop.css">`,
    ...jsonLd.map(jsonLdScript),
  ].filter(Boolean);
  const header = settings
    ? `<header class="site-header"><div class="wrap header-row">
  <a class="brand" href="/">${esc(storeName)}</a>
  <nav class="site-nav"><a href="/#products">${esc(t("nav_products"))}</a><a class="order-link" href="/order">${esc(t("nav_order"))}<span class="cart-count" data-cart-count hidden></span></a></nav>
</div></header>`
    : "";
  const notice = settings?.demoNotice ? `<div class="demo-notice" role="note">${esc(t("demo_notice"))}</div>` : "";
  const footer = settings
    ? `<footer class="site-footer"><div class="wrap footer-row">
  <p><strong>${esc(storeName)}</strong>${settings.tagline ? ` · ${esc(settings.tagline)}` : ""}</p>
  ${settings.contactEmail ? `<p>${esc(t("contact"))}: <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a></p>` : ""}
  <p class="muted">${esc(t("footer_orders"))}</p>
</div></footer>`
    : "";
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
${meta.join("\n")}
</head>
<body>
${notice}
${header}
<main class="wrap">
${body}
</main>
${footer}
<script type="module" src="/static/shop.js"></script>
</body>
</html>
`;
};

const productImage = (product, t, { index = 0, className = "", eager = false } = {}) => {
  const image = product.images[index];
  if (!image) {
    return `<div class="placeholder ${className}"><img src="/static/placeholder.svg" alt="" width="96" height="96"><span>${esc(t("photo_coming"))}</span></div>`;
  }
  return `<img class="${className}" src="${esc(imageSrc(product, image, index))}" alt="${esc(product.name)}" width="800" height="800"${eager ? "" : ` loading="lazy"`} decoding="async" referrerpolicy="no-referrer">`;
};

const card = (product, t) => `<li class="card">
  <a class="card-link" href="${esc(productPath(product))}">
    <div class="card-media">${productImage(product, t)}</div>
    <div class="card-body">
      <h3>${esc(product.name)}</h3>
      ${product.subtitle ? `<p class="subtitle">${esc(product.subtitle)}</p>` : ""}
      <p class="price">${esc(product.priceText)}${product.soldOut ? ` <span class="badge">${esc(t("sold_out"))}</span>` : ""}</p>
    </div>
  </a>
</li>`;

export const homePage = ({ origin, settings, catalog }) => {
  const t = translator(settings.language);
  const title = settings.tagline ? `${settings.storeName} · ${settings.tagline}` : settings.storeName;
  const description = plainSummary(settings.about || settings.tagline || settings.storeName);
  const firstImage = catalog.listed.find((product) => product.images.length);
  const grid = catalog.listed.length
    ? `<ul class="grid">${catalog.listed.map((product) => card(product, t)).join("\n")}</ul>`
    : `<p class="empty">${esc(t("products_empty"))}</p>`;
  const body = `<section class="hero">
  <h1>${esc(settings.storeName)}</h1>
  ${settings.tagline ? `<p class="tagline">${esc(settings.tagline)}</p>` : ""}
</section>
<section id="products" aria-labelledby="products-heading">
  <h2 id="products-heading">${esc(t("products_heading"))}</h2>
  ${grid}
</section>
<section class="how" aria-labelledby="how-heading">
  <h2 id="how-heading">${esc(t("how_heading"))}</h2>
  <ol><li>${esc(t("how_1"))}</li><li>${esc(t("how_2"))}</li><li>${esc(t("how_3"))}</li></ol>
</section>
${settings.about ? `<section class="about" aria-labelledby="about-heading"><h2 id="about-heading">${esc(t("about_heading"))}</h2>${paragraphs(settings.about)}</section>` : ""}`;
  return layout({
    settings,
    t,
    title,
    description,
    canonical: absoluteUrl(origin, "/"),
    ogImage: firstImage ? absoluteImages(origin, firstImage)[0] : "",
    jsonLd: [storeJsonLd({ origin, settings })],
    body,
  });
};

const SPEC_KEYS = ["age_grade", "materials", "batteries", "dimensions", "weight", "warranty", "returns"];

const specValue = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
};

export const productPage = ({ origin, settings, product }) => {
  const t = translator(settings.language);
  const content = product.content;
  const attributes = content.attributes && typeof content.attributes === "object" ? content.attributes : {};
  const specs = [
    product.sku ? [t("spec_sku"), product.sku] : null,
    ...SPEC_KEYS.map((key) => [t(`spec_${key}`), specValue(attributes[key])]),
  ].filter((row) => row?.[1]);
  const bullets = Array.isArray(content.bullets)
    ? content.bullets.filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
    : [];
  const thumbs =
    product.images.length > 1
      ? `<ul class="thumbs">${product.images
          .map(
            (image, index) =>
              `<li><a href="${esc(imageSrc(product, image, index))}" data-gallery-thumb><img src="${esc(imageSrc(product, image, index))}" alt="" width="120" height="120" loading="lazy" referrerpolicy="no-referrer"></a></li>`,
          )
          .join("")}</ul>`
      : "";
  const buy = product.soldOut
    ? `<p class="badge badge-large">${esc(t("sold_out"))}</p>`
    : `<form class="add-form" action="/order" method="get" data-add-form>
  <input type="hidden" name="add" value="${esc(product.id)}">
  <label class="qty">${esc(t("quantity"))} <input type="number" name="qty" min="1" max="${product.maxQuantity}" value="1" inputmode="numeric"></label>
  <button class="button" type="submit">${esc(t("add_to_order"))}</button>
</form>`;
  const certificates = product.certificates.length
    ? `<h2>${esc(t("certificates_heading"))}</h2>
<ul class="certs">${product.certificates
        .map((cert) => `<li><strong>${esc(cert.label)}</strong> <span class="muted">${esc(t("valid_until", { date: cert.expires }))}</span></li>`)
        .join("")}</ul>`
    : "";
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/#products">${esc(t("nav_products"))}</a> <span aria-hidden="true">/</span> <span>${esc(product.name)}</span></nav>
<article class="product">
  <div class="gallery">
    <div class="gallery-main" data-gallery-main>${productImage(product, t, { eager: true })}</div>
    ${thumbs}
  </div>
  <div class="product-info">
    <h1>${esc(product.name)}</h1>
    ${product.subtitle ? `<p class="subtitle">${esc(product.subtitle)}</p>` : ""}
    <p class="price price-large">${esc(product.priceText)}</p>
    ${buy}
    <p class="note">${esc(t("no_payment_note"))}</p>
    ${typeof content.description === "string" ? `<div class="description">${paragraphs(content.description)}</div>` : ""}
    ${bullets.length ? `<ul class="bullets">${bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
    ${specs.length ? `<h2>${esc(t("details_heading"))}</h2><dl class="specs">${specs.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>` : ""}
    ${certificates}
  </div>
</article>`;
  return layout({
    settings,
    t,
    title: `${product.name} · ${settings.storeName}`,
    description: productDescription(product) || plainSummary(product.name),
    canonical: absoluteUrl(origin, productPath(product)),
    ogType: "product",
    ogImage: product.images.length ? absoluteImages(origin, product)[0] : "",
    jsonLd: [productJsonLd({ origin, product, settings })],
    body,
  });
};

const errorText = (t, code, extra = {}) => (code ? t(`error_${code}`, extra) : "");

/**
 * The order request page. `lines` is what the server can pre-fill without
 * JavaScript (from `?add=` or a failed post); the browser script replaces the
 * rows with the visitor's saved order request when it runs.
 */
export const orderPage = ({
  origin,
  settings,
  catalog,
  lines = [],
  values = {},
  errors = {},
  status = "",
  orderId,
  ordersReady = true,
}) => {
  const t = translator(settings.language);
  const total = lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0) / 100;
  const totalText = formatPrice(total, settings.currency, settings.language);
  const rows = lines.length
    ? lines
        .map(
          ({ product, quantity }) => `<div class="order-row" data-product-id="${esc(product.id)}">
  <span class="order-name">${esc(product.name)}</span>
  <span class="order-unit">${esc(product.priceText)}</span>
  <label class="qty"><span class="visually-hidden">${esc(t("quantity"))}</span><input type="number" name="qty.${esc(product.id)}" value="${quantity}" min="0" max="${product.maxQuantity}" inputmode="numeric"></label>
</div>`,
        )
        .join("\n")
    : `<p class="empty">${esc(t("order_empty"))} <a href="/#products">${esc(t("order_browse"))}</a></p>`;
  const fieldError = (name) =>
    `<p class="field-error" data-error-for="${name}"${errors[name] ? "" : " hidden"}>${esc(errorText(t, errors[name], values.errorValues ?? {}))}</p>`;
  const invalid = (name) => (errors[name] ? ` aria-invalid="true"` : "");
  const countries = settings.shipsTo
    .map((code) => ({ code, name: countryName(code, settings.language) }))
    .sort((a, b) => a.name.localeCompare(b.name, settings.language));
  const form = ordersReady
    ? `<form class="order-form" method="post" action="/api/orders" data-order-form novalidate>
  <input type="hidden" name="orderId" value="${esc(orderId)}">
  <input type="hidden" name="expectedTotal" value="${total.toFixed(2)}">
  <section class="order-items" aria-labelledby="items-heading">
    <h2 id="items-heading">${esc(t("order_items"))}</h2>
    <div data-order-items>${rows}</div>
    ${fieldError("items")}
    <p class="order-total"><span>${esc(t("order_total"))}</span> <strong data-order-total>${esc(totalText)}</strong></p>
  </section>
  <section class="order-details" aria-labelledby="details-heading">
    <h2 id="details-heading">${esc(t("order_details"))}</h2>
    <label>${esc(t("field_name"))}<input name="name" autocomplete="name" maxlength="100" required value="${esc(values.name)}"${invalid("name")}></label>
    ${fieldError("name")}
    <label>${esc(t("field_email"))}<input name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(values.email)}"${invalid("email")}></label>
    ${fieldError("email")}
    <label>${esc(t("field_phone"))}<input name="phone" type="tel" autocomplete="tel" maxlength="40" value="${esc(values.phone)}"${invalid("phone")}></label>
    ${fieldError("phone")}
    <label>${esc(t("field_country"))}<select name="country" autocomplete="country" required${invalid("country")}>
      <option value="">${esc(t("choose_country"))}</option>
      ${countries.map(({ code, name }) => `<option value="${code}"${values.country === code ? " selected" : ""}>${esc(name)}</option>`).join("")}
    </select></label>
    ${fieldError("country")}
    <label>${esc(t("field_note"))}<textarea name="note" rows="4" maxlength="1000"${invalid("note")}>${esc(values.note)}</textarea></label>
    ${fieldError("note")}
    <div class="hp" aria-hidden="true"><label>Company website<input name="company_url" tabindex="-1" autocomplete="off"></label></div>
  </section>
  <div class="order-actions">
    <div class="form-status${status ? " is-error" : ""}" role="alert" data-form-status${status ? "" : " hidden"}>${esc(status)}</div>
    <button class="button" type="submit" data-submit>${esc(t("submit"))}</button>
    <p class="note">${esc(t("no_payment_note"))}</p>
    ${settings.shippingNote ? `<div class="shipping-note note">${paragraphs(settings.shippingNote)}</div>` : ""}
  </div>
</form>
<section class="thanks" data-thanks hidden aria-live="polite"></section>`
    : `<p class="form-status is-error">${esc(t("ordering_unavailable"))}${settings.contactEmail ? ` <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>` : ""}</p>`;
  const clientData = {
    language: settings.language,
    currency: settings.currency,
    contactEmail: settings.contactEmail,
    products: catalog.listed.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      priceText: product.priceText,
      maxQuantity: product.maxQuantity,
      soldOut: product.soldOut,
    })),
    messages: Object.fromEntries(CLIENT_MESSAGE_KEYS.map((key) => [key, t(key)])),
  };
  const body = `<h1>${esc(t("order_title"))}</h1>
<p class="lead">${esc(t("order_intro"))}</p>
${form}
<script type="application/json" id="shop-data">${JSON.stringify(clientData).replace(/</g, "\\u003c")}</script>`;
  return layout({
    settings,
    t,
    title: `${t("order_title")} · ${settings.storeName}`,
    description: plainSummary(t("order_intro")),
    canonical: absoluteUrl(origin, "/order"),
    noindex: true,
    body,
  });
};

export const thanksPage = ({ origin, settings, orderId, email }) => {
  const t = translator(settings.language);
  return layout({
    settings,
    t,
    title: `${t("thanks_title")} · ${settings.storeName}`,
    canonical: absoluteUrl(origin, "/order"),
    noindex: true,
    body: `<section class="thanks">
  <h1>${esc(t("thanks_title"))}</h1>
  <p>${esc(t("thanks_body", { orderId, email }))}</p>
  <p><a class="button" href="/">${esc(t("thanks_continue"))}</a></p>
</section>`,
  });
};

export const notFoundPage = ({ settings }) => {
  const t = translator(settings?.language ?? "en");
  return layout({
    settings,
    t,
    title: settings ? `${t("not_found_title")} · ${settings.storeName}` : t("not_found_title"),
    noindex: true,
    body: `<section class="message"><h1>${esc(t("not_found_title"))}</h1><p>${esc(t("not_found_body"))}</p><p><a class="button" href="/">${esc(t("back_home"))}</a></p></section>`,
  });
};

/** Busabase could not be reached or refused the site's key. Says nothing about why, to a visitor. */
export const unavailablePage = ({ settings } = {}) => {
  const t = translator(settings?.language ?? "en");
  return layout({
    settings: null,
    t,
    title: t("unavailable_title"),
    noindex: true,
    body: `<section class="message"><h1>${esc(t("unavailable_title"))}</h1><p>${esc(t("unavailable_body"))}</p></section>`,
  });
};

// ---- The owner-facing setup page ----
//
// Shown instead of the shop when the workspace is not ready, so the person who
// just opened the app or clicked Go live sees what to fix rather than a blank or a crash.
// A visitor who lands here sees an honest "not open yet". English only: it is
// written for the owner, and the store language may be what is missing.

export const SETUP_MESSAGES = {
  "products-missing": {
    title: "This shop has no product list yet",
    steps: [
      "This shop shows the products from the Products table of the Busa Product Hub template. It does not keep a copy of its own.",
      "Install the Busa Product Hub template in this workspace, add or import your products there, then refresh this page.",
      "Already installed under another folder name? Write the Products table's id or slug into this shop's Settings, field “Products table”.",
    ],
  },
  "products-ambiguous": {
    title: "This shop found more than one product list",
    steps: [
      "This workspace has more than one Busa Product Hub Products table, so the shop will not guess which one to sell from.",
      "Write the id or slug of the one to use into this shop's Settings, field “Products table”, then refresh this page.",
    ],
  },
  "products-override-not-found": {
    title: "The product list named in Settings was not found",
    steps: [
      "This shop's Settings name a Products table that this site cannot find or cannot read.",
      "Check the id or slug in Settings, field “Products table”, or clear it to use the Busa Product Hub Products table automatically.",
    ],
  },
  "settings-missing": {
    title: "This shop's Settings table was not found",
    steps: [
      "The Busa Shop template creates Orders, Settings and Reports tables next to this website. The Settings table is missing or cannot be read.",
      "Install the Busa Shop template again, or restore the Settings table from the trash, then refresh this page.",
    ],
  },
  "settings-ambiguous": {
    title: "This shop found more than one Settings table",
    steps: [
      "More than one Busa Shop Settings table exists in this workspace, so the site will not guess which store to show.",
      "Move the extra Busa Shop folder to the trash, then refresh this page.",
    ],
  },
  "settings-empty": {
    title: "This shop has no settings yet",
    steps: ["Add one row to this shop's Settings table with at least the store name and a currency (for example USD), then refresh this page."],
  },
  "currency-missing": {
    title: "This shop has no currency",
    steps: ["Set Currency in this shop's Settings to a three-letter code such as USD or EUR, then refresh this page."],
  },
};

export const setupPage = ({ code }) => {
  const message = SETUP_MESSAGES[code] ?? SETUP_MESSAGES["settings-missing"];
  const t = translator("en");
  return layout({
    settings: null,
    t,
    title: "This shop is not open yet",
    noindex: true,
    body: `<section class="message setup">
  <h1>This shop is not open yet</h1>
  <p>Please come back soon.</p>
  <div class="owner-box">
    <h2>For the shop owner: ${esc(message.title)}</h2>
    <ol>${message.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
    <p class="muted">Setup code: <code>${esc(code)}</code>. Changes to tables show here within about a minute. No redeploy is needed.</p>
  </div>
</section>`,
  });
};
