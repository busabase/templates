// Server-rendered HTML. Every value that came from the workspace or the
// visitor goes through `esc`; nothing is concatenated raw. Every page carries
// <meta charset="utf-8"> (Cloudflare serves text/html without a charset).

import { FORM_TIME_FIELD, HONEYPOT_FIELD } from "./account.js";
import { countryName, formatPrice, imageSrc, localeTag } from "./catalog.js";
import { detailValue, productDetails } from "./details.js";
import { CLIENT_MESSAGE_KEYS, PAY_MESSAGE_KEYS, translator } from "./i18n.js";
import { addressRules } from "./orders.js";
import { fillPlaceholders, markdownText, pagePath, renderMarkdown } from "./policies.js";
import { BLOG_PATH, coverSrc, FEED_PATH, mentionedProducts, postSummary } from "./posts.js";
import { clientRates, shippingFor } from "./shipping.js";
import {
  absoluteImages,
  absoluteUrl,
  jsonLdScript,
  plainSummary,
  productDescription,
  productJsonLd,
  postImage,
  postJsonLd,
  postUrl,
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
  site = {},
  lang: pageLang = "",
  extraMeta = [],
}) => {
  const lang = pageLang || settings?.language || "en";
  const footerPages = (site.pages ?? []).filter((page) => page.inFooter);
  const hasBlog = (site.posts ?? []).length > 0;
  const analytics = site.analytics ?? {};
  const paypal = site.payment === "paypal";
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
    ...extraMeta,
    hasBlog ? `<link rel="alternate" type="application/rss+xml" title="${esc(`${storeName} · ${t("nav_blog")}`)}" href="${FEED_PATH}">` : "",
    analytics.googleVerification ? `<meta name="google-site-verification" content="${esc(analytics.googleVerification)}">` : "",
    analytics.bingVerification ? `<meta name="msvalidate.01" content="${esc(analytics.bingVerification)}">` : "",
    // Google Analytics 4: only when Settings names an ID, and only on the public site (src/handler.js decides).
    analytics.ga4 ? `<meta name="busa-shop-ga4" content="${esc(analytics.ga4)}">` : "",
    analytics.ga4 ? `<script type="module" src="/static/analytics.js"></script>` : "",
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="/static/shop.css">`,
    ...jsonLd.map(jsonLdScript),
  ].filter(Boolean);
  const initials = (storeName || "Shop").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("");
  const shippingPage = footerPages.find((page) => /shipping/i.test(page.slug ?? page.path ?? ""));
  const shippingHref = shippingPage ? pagePath(shippingPage) : "/#shipping";
  const header = settings
    ? `<a class="skip-link" href="#main-content">${esc(t("storefront_skip"))}</a>
<header class="site-header"><div class="wrap header-row">
  <a class="brand" href="/" aria-label="${esc(storeName)}"><span class="brand-mark" aria-hidden="true">${esc(initials)}</span><span>${esc(storeName)}</span></a>
  <nav class="site-nav" aria-label="${esc(t("storefront_footer_explore"))}"><a class="nav-shop" href="/#products">${esc(t("storefront_shop"))}</a><a href="${esc(shippingHref)}">${esc(t("storefront_shipping"))}</a><a href="/#how-we-work">${esc(t("storefront_about"))}</a>${hasBlog ? `<a href="${BLOG_PATH}">${esc(t("nav_blog"))}</a>` : ""}</nav>
  <nav class="header-actions" aria-label="${esc(t("storefront_footer_account"))}"><a class="icon-link search-link" data-header-search href="/#products" aria-label="${esc(t("storefront_search"))}">${icon("search")}</a>${site.account ? `<a class="icon-link account-link" href="/account">${icon("user")}<span>${esc(t("nav_account"))}</span></a>` : ""}<a class="icon-link order-link" href="/order" aria-label="${esc(t(site.payment === "paypal" ? "nav_checkout" : "nav_order"))}">${icon("bag")}<span class="cart-label">${esc(t(site.payment === "paypal" ? "nav_checkout" : "nav_order"))}</span><span class="cart-count" data-cart-count hidden></span></a></nav>
</div></header>`
    : "";
  const notice = settings?.demoNotice ? `<div class="demo-notice" role="note">${esc(t("demo_notice"))}</div>` : "";
  const footer = settings
    ? `<footer class="site-footer"><div class="wrap footer-grid">
  <div class="footer-brand"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${esc(initials)}</span><span>${esc(storeName)}</span></a><p>${esc(settings.tagline || t("storefront_footer_line"))}</p>${settings.contactEmail ? `<a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>` : ""}</div>
  <div><h2>${esc(t("storefront_footer_explore"))}</h2><nav class="footer-links"><a href="/#products">${esc(t("storefront_shop"))}</a><a href="/#how-we-work">${esc(t("storefront_how"))}</a>${hasBlog ? `<a href="${BLOG_PATH}">${esc(t("nav_blog"))}</a><a href="${FEED_PATH}">${esc(t("blog_feed"))}</a>` : ""}</nav></div>
  ${footerPages.length ? `<div><h2>${esc(t("storefront_footer_help"))}</h2><nav class="footer-links" aria-label="${esc(t("footer_policies"))}">${footerPages.map((page) => `<a href="${esc(pagePath(page))}">${esc(page.title)}</a>`).join("")}</nav></div>` : ""}
  <div><h2>${esc(t("storefront_footer_account"))}</h2><nav class="footer-links">${site.account ? `<a href="/account">${esc(t("nav_account"))}</a>` : ""}<a href="/order">${esc(t(site.payment === "paypal" ? "nav_checkout" : "nav_order"))}</a><a href="${esc(shippingHref)}">${esc(t("storefront_shipping"))}</a></nav></div>
</div><div class="wrap footer-bottom"><span>© ${new Date().getUTCFullYear()} ${esc(storeName)}</span><span>${esc(t(paypal ? "footer_paypal" : "footer_orders"))}</span></div></footer>`
    : "";
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
${meta.join("\n")}
</head>
<body>
${notice}
${header}
<main class="wrap" id="main-content">
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

const icon = (name) => {
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.2 4.2"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8.5 8V5a3.5 3.5 0 0 1 7 0v3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    truck: '<path d="M3 6h11v11H3V6Zm11 4h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`;
};

const displayProduct = (product, t) => {
  const attributes = product.content?.attributes ?? {};
  const model = detailValue(attributes.model) || product.name;
  const brand = detailValue(attributes.brand);
  const variant = [
    detailValue(attributes.memory) ? t("storefront_ram", { value: detailValue(attributes.memory) }) : "",
    detailValue(attributes.storage), detailValue(attributes.color),
    detailValue(attributes.age_grade) ? `${t("spec_age_grade")}: ${detailValue(attributes.age_grade)}` : "",
  ].filter(Boolean).join(" · ");
  const highlights = [detailValue(attributes.screen).split(",")[0], detailValue(attributes.battery), detailValue(attributes.materials)].filter(Boolean).slice(0, 2);
  // A manufacturing country is not an edition. Only an explicit product name or edition/software description qualifies.
  const chinaEdition = /\bchina[- ](?:version|edition)\b/i.test([product.name, detailValue(attributes.edition), detailValue(attributes.version), detailValue(attributes.os)].join(" "));
  return { attributes, model, brand, variant, highlights, chinaEdition };
};

const card = (product, t) => {
  const view = displayProduct(product, t);
  return `<li class="card" data-catalog-product data-brand="${esc(view.brand)}" data-price="${product.price}" data-search="${esc([product.name, view.brand, view.model, view.variant].join(" ").toLowerCase())}" data-name="${esc(view.model)}">
  <a class="card-link" href="${esc(productPath(product))}">
    <div class="card-media">${product.soldOut ? `<span class="availability">${esc(t("sold_out"))}</span>` : ""}${productImage(product, t)}<span class="card-arrow">${icon("arrow")}</span></div>
    <div class="card-body">
      ${view.brand ? `<p class="product-brand">${esc(view.brand)}</p>` : ""}
      <h3>${esc(view.model)}</h3>
      ${view.model !== product.name ? `<span class="visually-hidden">${esc(product.name)}</span>` : ""}
      ${view.variant ? `<p class="variant">${esc(view.variant)}</p>` : product.subtitle ? `<p class="subtitle">${esc(product.subtitle)}</p>` : ""}
      ${view.highlights.length ? `<p class="card-highlights">${view.highlights.map(esc).join("<span aria-hidden=\"true\"> / </span>")}</p>` : ""}
      <div class="card-bottom"><p class="price">${esc(product.priceText)} <span class="currency-code">${esc(product.currency)}</span></p><span class="card-details">${esc(t("storefront_view"))}</span></div>
    </div>
  </a>
</li>`;
};

export const homePage = ({ origin, settings, catalog, site = {} }) => {
  const paypal = site.payment === "paypal";
  const t = translator(settings.language);
  const title = settings.tagline ? `${settings.storeName} · ${settings.tagline}` : settings.storeName;
  const description = plainSummary(settings.about || settings.tagline || settings.storeName);
  const firstImage = catalog.listed.find((product) => product.images.length);
  const featured = catalog.listed.find((product) => !product.soldOut && product.images.length) || firstImage;
  const featuredView = featured ? displayProduct(featured, t) : null;
  const brands = [...new Set(catalog.listed.map((product) => displayProduct(product, t).brand).filter(Boolean))];
  const grid = catalog.listed.length
    ? `<ul class="grid" data-catalog-grid>${catalog.listed.map((product) => card(product, t)).join("\n")}</ul>`
    : `<p class="empty">${esc(t("products_empty"))}</p>`;
  const destinations = (settings.shipsTo ?? []).map((code) => countryName(code, settings.language));
  const shippingPage = (site.pages ?? []).find((page) => /shipping/i.test(page.slug ?? page.path ?? ""));
  const body = `<section class="hero storefront-hero">
  <div class="hero-copy"><p class="eyebrow">${esc(t("storefront_hero_eyebrow"))}</p><h1>${esc(t("storefront_hero_title"))}</h1><p class="hero-intro">${esc(t("storefront_hero_body"))}</p><div class="hero-actions"><a class="button" href="#products">${esc(t("storefront_explore"))}${icon("arrow")}</a><a class="text-link" href="#how-we-work">${esc(t("storefront_how"))}<span aria-hidden="true">↗</span></a></div><p class="hero-note"><span class="edition-dot" aria-hidden="true"></span>${esc(t("storefront_details_upfront"))}<span aria-hidden="true"> · </span>${esc(t("storefront_before_order"))}</p></div>
  ${featured ? `<a class="hero-product" href="${esc(productPath(featured))}"><div class="hero-product-top"><span>${esc(t("storefront_featured"))}</span>${featured.soldOut || featuredView.chinaEdition ? `<span class="feature-edition">${esc(t(featured.soldOut ? "sold_out" : "storefront_edition"))}</span>` : ""}</div><div class="hero-device">${productImage(featured, t, { eager: true })}</div><div class="hero-product-caption"><div><span class="product-brand">${esc(featuredView.brand)}</span><h2>${esc(featuredView.model)}</h2><p>${esc(featuredView.variant)}</p></div><div class="hero-product-price"><span class="price">${esc(featured.priceText)}</span><span class="currency-code">${esc(featured.currency)}</span><span class="feature-arrow">${icon("arrow")}</span></div></div></a>` : ""}
</section>
${destinations.length ? `<aside class="destination-strip"><span>${icon("truck")}<strong>${esc(t("storefront_destinations"))}</strong></span><p>${destinations.slice(0, 4).map(esc).join('<span aria-hidden="true"> · </span>')}${destinations.length > 4 ? ` <span class="more-destinations">${esc(t("storefront_more_destinations", {count: destinations.length - 4}))}</span>` : ""}</p><a href="#shipping">${esc(t("storefront_shipping"))}<span aria-hidden="true">↗</span></a></aside>` : ""}
<section id="products" class="catalog-section" aria-labelledby="products-heading" data-catalog>
  <div class="section-heading"><div><p class="eyebrow">${esc(t("storefront_catalog_eyebrow"))}</p><h2 id="products-heading">${esc(t("storefront_catalog_title"))}</h2><p class="section-intro">${esc(t("storefront_catalog_intro"))}</p></div><p class="catalog-count" data-catalog-count aria-live="polite" data-template="${esc(t("storefront_count"))}" data-template-one="${esc(t("storefront_count_one"))}">${esc(t(catalog.listed.length === 1 ? "storefront_count_one" : "storefront_count", { count: catalog.listed.length }))}</p></div>
  ${catalog.listed.length ? `<div class="catalog-controls" data-catalog-controls hidden><div class="brand-filters" role="group" aria-label="${esc(t("storefront_filter_label"))}"><button class="filter-chip" type="button" data-brand-filter="" aria-pressed="true">${esc(t("storefront_all_brands"))}</button>${brands.map((brand) => `<button class="filter-chip" type="button" data-brand-filter="${esc(brand)}" aria-pressed="false">${esc(brand)}</button>`).join("")}</div><div class="catalog-tools"><button class="filter-reset" data-catalog-reset type="button" hidden>${esc(t("storefront_reset"))}</button><label class="catalog-search">${icon("search")}<span class="visually-hidden">${esc(t("storefront_search"))}</span><input type="search" id="catalog-search" data-catalog-search placeholder="${esc(t("storefront_search_placeholder"))}" autocomplete="off"></label><label class="catalog-sort"><span class="visually-hidden">${esc(t("storefront_sort"))}</span><select data-catalog-sort><option value="featured">${esc(t("storefront_sort_featured"))}</option><option value="price-asc">${esc(t("storefront_sort_low"))}</option><option value="price-desc">${esc(t("storefront_sort_high"))}</option><option value="name">${esc(t("storefront_sort_name"))}</option></select></label></div></div>` : ""}
  ${grid}
  <div class="catalog-empty" data-catalog-empty hidden><span class="empty-symbol">${icon("search")}</span><h3>${esc(t("storefront_empty_title"))}</h3><p>${esc(t("storefront_empty_body"))}</p><button class="button button-secondary" type="button" data-catalog-reset>${esc(t("storefront_reset"))}</button></div>
</section>
<section class="buying-guide" aria-labelledby="how-heading" id="how-we-work"><div class="section-heading"><div><p class="eyebrow">${esc(t("storefront_buying_eyebrow"))}</p><h2 id="how-heading">${esc(t("storefront_buying_title"))}</h2></div></div><div class="guide-grid"><article><span class="guide-number">01</span><h3>${esc(t("storefront_buying_specs"))}</h3><p>${esc(t("storefront_buying_specs_body"))}</p></article><article><span class="guide-number">02</span><h3>${esc(t("storefront_buying_edition"))}</h3><p>${esc(t("storefront_buying_edition_body"))}</p></article><article><span class="guide-number">03</span><h3>${esc(t("storefront_buying_order"))}</h3><ol>${(paypal ? ["how_paypal_1", "how_paypal_2", "how_paypal_3"] : ["how_1", "how_2", "how_3"]).map((key) => `<li>${esc(t(key))}</li>`).join("")}</ol></article></div></section>
<section class="shipping-feature" id="shipping"><div><p class="eyebrow">${esc(t("storefront_shipping"))}</p><h2>${esc(t("storefront_shipping_title"))}</h2><p>${esc(t("storefront_shipping_body"))}</p>${shippingPage ? `<a class="text-link" href="${esc(pagePath(shippingPage))}">${esc(t("storefront_shipping_policy"))}${icon("arrow")}</a>` : ""}</div><div class="shipping-destinations">${destinations.map((name, index) => `<div><span class="destination-index">0${index + 1}</span><span>${esc(name)}</span>${icon("arrow")}</div>`).join("")}</div></section>
${settings.about ? `<section class="about" id="about" aria-labelledby="about-heading"><p class="eyebrow">${esc(settings.storeName)}</p><h2 id="about-heading">${esc(t("about_heading"))}</h2>${paragraphs(settings.about)}</section>` : ""}`;
  return layout({ settings, t, title, description, canonical: absoluteUrl(origin, "/"), ogImage: firstImage ? absoluteImages(origin, firstImage)[0] : "", jsonLd: [storeJsonLd({ origin, settings })], body, site });
};

export const productPage = ({ origin, settings, product, site = {}, shipping = null }) => {
  const t = translator(settings.language);
  const content = product.content;
  const view = displayProduct(product, t);
  const overview = ["storage", "memory", "screen", "battery", "age_grade", "materials", "dimensions", "batteries"].filter((key) => detailValue(view.attributes[key])).slice(0, 4);
  const specs = [
    ...(product.sku ? [[t("spec_sku"), product.sku]] : []),
    ...productDetails(content.attributes, { extraKeys: [...(product.specKeys ?? []), ...settings.showDetails], language: settings.language }),
  ];
  const bullets = Array.isArray(content.bullets)
    ? content.bullets.filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
    : [];
  const thumbs =
    product.images.length > 1
      ? `<ul class="thumbs">${product.images
          .map(
            (image, index) =>
              `<li><a href="${esc(imageSrc(product, image, index))}" data-gallery-thumb aria-label="${esc(t("storefront_image", {number:index + 1,total:product.images.length}))}" aria-current="${index === 0 ? "true" : "false"}"><img src="${esc(imageSrc(product, image, index))}" alt="" width="120" height="120" loading="lazy" referrerpolicy="no-referrer"></a></li>`,
          )
          .join("")}</ul>`
      : "";
  const buy = product.soldOut
    ? `<p class="badge badge-large">${esc(t("sold_out"))}</p>`
    : `<form class="add-form" action="/order" method="get" data-add-form data-added-message="${esc(t("storefront_added"))}">
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
  const body = `<nav class="crumbs" aria-label="${esc(t("storefront_breadcrumb"))}"><a href="/#products">${esc(t("nav_products"))}</a> <span aria-hidden="true">/</span> <span>${esc(view.model)}</span></nav>
<article class="product">
  <div class="gallery"><div class="gallery-main" data-gallery-main>${productImage(product, t, { eager: true })}</div>${thumbs}</div>
  <div class="product-info">
    <p class="eyebrow">${esc(view.brand)}</p><h1>${esc(view.model)}</h1>
    ${view.variant ? `<p class="product-variant">${esc(view.variant)}</p>` : ""}
    ${view.model !== product.name ? `<p class="listed-model visually-hidden">${esc(t("storefront_product_full_name"))}: ${esc(product.name)}</p>` : ""}
    ${product.subtitle ? `<p class="subtitle">${esc(product.subtitle)}</p>` : ""}
    <div class="product-price-row"><p class="price price-large">${esc(product.priceText)}</p><span class="currency-code">${esc(product.currency)}</span></div>
    ${overview.length ? `<dl class="spec-overview" aria-label="${esc(t("storefront_product_overview"))}">${overview.map((key) => `<div><dt>${esc(t(`spec_${key}`))}</dt><dd>${esc(detailValue(view.attributes[key]).split(",")[0])}</dd></div>`).join("")}</dl>` : ""}
    <div class="product-purchase">${buy}<p class="note">${esc(t(site.payment === "paypal" ? "paypal_note" : "no_payment_note"))}</p></div>
    <div class="edition-callout"><span class="edition-dot" aria-hidden="true"></span><div><strong>${esc(t(view.chinaEdition ? "storefront_edition" : "storefront_details_upfront"))}</strong><p>${esc(t(view.chinaEdition ? "storefront_edition_note" : "storefront_before_order"))}</p><a href="#model-details">${esc(t("storefront_product_specs_link"))}<span aria-hidden="true"> ↗</span></a></div></div>
  </div>
  <section class="model-story" id="model-details"><div class="model-description"><p class="eyebrow">${esc(t("storefront_product_details"))}</p><h2>${esc(t("storefront_product_description"))}</h2>${typeof content.description === "string" ? `<div class="description">${paragraphs(content.description)}</div>` : ""}${bullets.length ? `<ul class="bullets">${bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}${certificates}</div><div class="model-specifications">${specs.length ? `<h2>${esc(t("details_heading"))}</h2><dl class="specs">${specs.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>` : ""}</div></section>
</article>`;
  return layout({
    settings,
    t,
    title: `${product.name} · ${settings.storeName}`,
    description: productDescription(product) || plainSummary(product.name),
    canonical: absoluteUrl(origin, productPath(product)),
    ogType: "product",
    ogImage: product.images.length ? absoluteImages(origin, product)[0] : "",
    jsonLd: [productJsonLd({ origin, product, settings, shipping })],
    body,
    site,
  });
};

const errorText = (t, code, extra = {}) => (code ? t(`error_${code}`, extra) : "");

/**
 * The checkout page (the order request page when the shop takes no online
 * payment). `lines` is what the server can pre-fill without JavaScript (from
 * `?add=` or a failed post); the browser script replaces the rows with the
 * visitor's saved order when it runs. `checkout` is what the handler worked
 * out: `{ payment: "paypal" | "request", countries, shipping }`.
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
  checkout = { payment: "request", countries: settings.shipsTo, shipping: { status: "missing", rates: new Map() } },
  site = {},
  browserPreview = false,
  buyer = null,
}) => {
  const t = translator(settings.language);
  const paypal = checkout.payment === "paypal";
  // Buyer login on: say whether this order will be under My orders (`buyer` is the signed-in buyer, or null).
  const accountNote = site.account
    ? buyer
      ? `<p class="note account-note">${esc(t("account_checkout_signed_in", { email: buyer.email }))}</p>`
      : `<p class="note account-note"><a href="/account">${esc(t("account_checkout_sign_in"))}</a></p>`
    : "";
  // Only the owner ever sees the browser engine's private preview, so it can say what the plan allows.
  const ownerNote = browserPreview
    ? `<div class="owner-box" role="note"><h2>For the shop owner · 店主可见</h2>
  <p>Online payment with PayPal and the order emails need the Website engine (Busabase Plus and higher): it keeps the PayPal secret and the mail password on the server and can open a mail connection. This private preview in your own browser has neither, so checkout takes order requests here. Nobody else sees this note.</p>
  <p>PayPal 在线付款和订单邮件需要网站引擎（Busabase Plus 及以上）：它在服务器上保管 PayPal 密钥和邮箱授权码，并能连接邮件服务器。你浏览器里的这个私有预览两者都没有，所以这里的结账只收订单请求。这段说明只有你能看到。</p>
</div>`
    : "";
  const subtotal = lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0) / 100;
  const money = (amount) => formatPrice(amount, settings.currency, settings.language);
  const country = checkout.countries.includes(values.country) ? values.country : "";
  const rate = country ? shippingFor(checkout.shipping, country, subtotal) : null;
  const shippingKnown = rate?.ok && rate.cost !== null;
  const total = subtotal + (shippingKnown ? rate.cost : 0);
  const shippingText = !country
    ? checkout.shipping.status === "missing"
      ? t("order_shipping_tbc")
      : t("order_shipping_pick")
    : rate?.ok
      ? rate.cost === null
        ? t("order_shipping_tbc")
        : rate.cost === 0
          ? t("order_shipping_free")
          : money(rate.cost)
      : t(`error_${rate?.code ?? "no_shipping"}`);
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
  const rules = addressRules(country);
  const countries = checkout.countries
    .map((code) => ({ code, name: countryName(code, settings.language) }))
    .sort((a, b) => a.name.localeCompare(b.name, settings.language));
  const input = (name, labelKey, { autocomplete, required = false, maxlength = 300, type = "text", optionalKey = "" } = {}) =>
    `<label><span data-label-for="${name}">${esc(t(required || !optionalKey ? labelKey : optionalKey))}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" maxlength="${maxlength}"${required ? " required" : ""} value="${esc(values[name])}"${invalid(name)}></label>
    ${fieldError(name)}`;
  const noCountries = checkout.countries.length === 0;
  const form = ordersReady && !noCountries
    ? `<form class="order-form" method="post" action="/api/orders" data-order-form novalidate>
  <input type="hidden" name="orderId" value="${esc(orderId)}">
  <input type="hidden" name="expectedTotal" value="${country && rate?.ok ? total.toFixed(2) : ""}">
  <section class="order-items" aria-labelledby="items-heading">
    <p class="cart-feedback" role="status" data-cart-feedback hidden>${esc(t("storefront_added"))}</p>
    <p class="eyebrow">${esc(t("storefront_checkout_step2"))}</p><h2 id="items-heading">${esc(t("order_items"))}</h2>
    <div data-order-items>${rows}</div>
    ${fieldError("items")}
    <dl class="order-sums">
      <div><dt>${esc(t("order_subtotal"))}</dt><dd data-order-subtotal>${esc(money(subtotal))}</dd></div>
      <div><dt>${esc(t("order_shipping"))}</dt><dd data-order-shipping>${esc(shippingText)}</dd></div>
      <div class="order-total"><dt>${esc(t("order_total"))}</dt><dd><strong data-order-total>${esc(money(total))}</strong></dd></div>
    </dl>
    <p class="note" data-order-delivery${rate?.ok && rate.estimate ? "" : " hidden"}>${rate?.ok && rate.estimate ? esc(t("order_delivery", { estimate: rate.estimate })) : ""}</p>
    <p class="note" data-order-free-over hidden></p>
  </section>
  <section class="order-details" aria-labelledby="details-heading">
    <p class="eyebrow">${esc(t("storefront_checkout_step1"))}</p><h2 id="details-heading">${esc(t("order_details"))}</h2>
    ${input("name", "field_name", { autocomplete: "name", required: true, maxlength: 100 })}
    ${input("email", "field_email", { autocomplete: "email", required: true, maxlength: 200, type: "email" })}
    ${input("phone", "field_phone", { autocomplete: "tel", required: true, maxlength: 40, type: "tel" })}
    <h3>${esc(t("order_address"))}</h3>
    <label>${esc(t("field_country"))}<select name="country" autocomplete="country" required${invalid("country")}>
      <option value="">${esc(t("choose_country"))}</option>
      ${countries.map(({ code, name }) => `<option value="${code}"${country === code ? " selected" : ""}>${esc(name)}</option>`).join("")}
    </select></label>
    ${fieldError("country")}
    ${input("address1", "field_address1", { autocomplete: "address-line1", required: true })}
    ${input("address2", "field_address2", { autocomplete: "address-line2" })}
    ${input("city", "field_city", { autocomplete: "address-level2", required: true, maxlength: 120 })}
    ${input("region", "field_region", { autocomplete: "address-level1", required: rules.region, maxlength: 120, optionalKey: "field_region_optional" })}
    ${input("postalCode", "field_postal", { autocomplete: "postal-code", required: rules.postalCode, maxlength: 20, optionalKey: "field_postal_optional" })}
    <label>${esc(t("field_note"))}<textarea name="note" rows="3" maxlength="1000"${invalid("note")}>${esc(values.note)}</textarea></label>
    ${fieldError("note")}
    <div class="hp" aria-hidden="true"><label>Company website<input name="company_url" tabindex="-1" autocomplete="off"></label></div>
  </section>
  <div class="order-actions">
    <div class="form-status${status ? " is-error" : ""}" role="alert" data-form-status${status ? "" : " hidden"}>${esc(status)}</div>
    <button class="button" type="submit" data-submit>${esc(t(paypal ? "submit_paypal" : "submit"))}</button>
    <p class="note">${esc(t(paypal ? "paypal_note" : "no_payment_note"))}</p>
    ${settings.shippingNote ? `<div class="shipping-note note">${paragraphs(settings.shippingNote)}</div>` : ""}
  </div>
</form>
<section class="thanks" data-thanks hidden aria-live="polite"></section>
<a href="/pay/" data-pay-base hidden></a>`
    : `<p class="form-status is-error">${esc(t(noCountries && ordersReady ? "error_shipping_unavailable" : "ordering_unavailable"))}${settings.contactEmail ? ` <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>` : ""}</p>`;
  const clientData = {
    language: settings.language,
    currency: settings.currency,
    contactEmail: settings.contactEmail,
    payment: checkout.payment,
    shipping: checkout.shipping.status,
    rates: clientRates(checkout.shipping, checkout.countries),
    regionRequired: checkout.countries.filter((code) => addressRules(code).region),
    postalOptional: checkout.countries.filter((code) => !addressRules(code).postalCode),
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
  const body = `<p class="eyebrow checkout-eyebrow">${esc(t("storefront_checkout_eyebrow"))}</p><h1 class="checkout-title">${esc(t(paypal ? "checkout_title" : "order_title"))}</h1>
<p class="lead">${esc(t(paypal ? "checkout_intro" : "order_intro"))}</p>
${accountNote}
${ownerNote}
${form}
<script type="application/json" id="shop-data">${JSON.stringify(clientData).replace(/</g, "\\u003c")}</script>`;
  return layout({
    settings,
    t,
    title: `${t(paypal ? "checkout_title" : "order_title")} · ${settings.storeName}`,
    description: plainSummary(t(paypal ? "checkout_intro" : "order_intro")),
    canonical: absoluteUrl(origin, "/order"),
    noindex: true,
    body,
    site,
  });
};

const PAY_STATUS_TEXT = {
  new: "pay_status_request",
  confirmed: "pay_status_request",
  paid: "pay_status_paid",
  shipped: "pay_status_shipped",
  completed: "pay_status_shipped",
  cancelled: "pay_status_cancelled",
  refunded: "pay_status_refunded",
  "payment-problem": "pay_status_problem",
};

/**
 * One order's payment page, /pay/<order id>: what was ordered and the PayPal
 * button while it is awaiting payment, its status otherwise. Shows no name,
 * email or address: the order id in the address is all it takes to open it.
 * `paypal` is `{ clientId, sdkUrl }` when the button can be shown.
 */
export const payPage = ({ origin, settings, order, paypal = null, site = {} }) => {
  const t = translator(settings.language);
  const money = (amount) => formatPrice(amount, order.currency || settings.currency, settings.language);
  const items = order.lines
    .map((line) => `<li><span>${esc(line.quantity)} × ${esc(line.name)}</span> <span>${esc(money(line.lineTotal))}</span></li>`)
    .join("");
  const shipping =
    order.shipping === null ? t("order_shipping_tbc") : order.shipping === 0 ? t("order_shipping_free") : money(order.shipping);
  const awaiting = order.status === "awaiting-payment";
  const state = awaiting
    ? paypal
      ? `<div class="pay-box" data-pay-box><p class="note" data-pay-status>${esc(t("pay_loading"))}</p><div class="paypal-buttons" data-paypal-buttons></div></div>
<noscript><p class="form-status is-error">${esc(t("pay_noscript"))}</p></noscript>
<p class="note">${esc(t("pay_keep_link"))}</p>`
      : `<p class="form-status">${esc(t("pay_offline", { orderId: order.orderId }))}</p>`
    : `<p class="form-status${order.status === "payment-problem" ? " is-error" : ""}" data-pay-final>${esc(t(PAY_STATUS_TEXT[order.status] ?? "pay_status_request"))}</p>`;
  const clientData = awaiting && paypal
    ? {
        orderId: order.orderId,
        clientId: paypal.clientId,
        sdkUrl: paypal.sdkUrl,
        currency: order.currency || settings.currency,
        locale: { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES" }[settings.language] ?? "en-US",
        contactEmail: settings.contactEmail,
        messages: Object.fromEntries(PAY_MESSAGE_KEYS.map((key) => [key, t(key, { orderId: order.orderId })])),
      }
    : null;
  const body = `<h1>${esc(t(awaiting ? "pay_title" : "pay_order", { orderId: order.orderId }))}</h1>
${awaiting ? `<p class="lead">${esc(t("pay_intro", { orderId: order.orderId }))}</p>` : ""}
<section class="pay-summary" aria-label="${esc(t("pay_order", { orderId: order.orderId }))}">
  <ul class="pay-items">${items}</ul>
  <dl class="order-sums">
    <div><dt>${esc(t("order_subtotal"))}</dt><dd>${esc(money(order.subtotal ?? order.total))}</dd></div>
    <div><dt>${esc(t("order_shipping"))}</dt><dd>${esc(shipping)}</dd></div>
    <div class="order-total"><dt>${esc(t(awaiting ? "pay_total" : "order_total"))}</dt><dd><strong>${esc(money(order.total))}</strong></dd></div>
  </dl>
  ${order.deliveryEstimate ? `<p class="note">${esc(t("order_delivery", { estimate: order.deliveryEstimate }))}</p>` : ""}
</section>
${state}
<section class="thanks" data-thanks hidden aria-live="polite"></section>
${clientData ? `<script type="application/json" id="pay-data">${JSON.stringify(clientData).replace(/</g, "\\u003c")}</script>` : ""}`;
  return layout({
    settings,
    t,
    title: `${t("pay_order", { orderId: order.orderId })} · ${settings.storeName}`,
    canonical: absoluteUrl(origin, "/order"),
    noindex: true,
    body,
    site,
  });
};

/** A policy page from the Pages table: its title as the <h1>, its Markdown below. */
export const policyPage = ({ origin, settings, page, site = {} }) => {
  const t = translator(settings.language);
  const body = fillPlaceholders(page.body, settings);
  return layout({
    settings,
    t,
    title: `${page.title} · ${settings.storeName}`,
    description: plainSummary(markdownText(body) || page.title),
    canonical: absoluteUrl(origin, pagePath(page)),
    body: `<article class="policy"><h1>${esc(page.title)}</h1>
${renderMarkdown(body)}
</article>`,
    site,
  });
};

export const thanksPage = ({ origin, settings, orderId, email, site = {} }) => {
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
    site,
  });
};

const formatDay = (day, language) => {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat(localeTag(language), { dateStyle: "long", timeZone: "UTC" }).format(new Date(ms));
};

const postMeta = (post, t, language) => {
  const parts = [
    post.publishedAt ? `<time datetime="${esc(post.publishedAt)}">${esc(t("blog_published", { date: formatDay(post.publishedAt, language) }))}</time>` : "",
    post.author ? `<span>${esc(t("blog_by", { author: post.author }))}</span>` : "",
  ].filter(Boolean);
  return parts.length ? `<p class="post-meta muted">${parts.join(" · ")}</p>` : "";
};

const postThumb = (post, listed, { eager = false } = {}) => {
  if (post.cover) {
    return `<img src="${esc(coverSrc(post))}" alt="" width="1200" height="630"${eager ? "" : ` loading="lazy"`} decoding="async" referrerpolicy="no-referrer">`;
  }
  const product = mentionedProducts(post, listed).find((item) => item.images.length);
  return product ? `<img src="${esc(imageSrc(product, product.images[0], 0))}" alt="" width="800" height="800" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "";
};

/** /blog: every published post, newest first. With none, a short note (and no "Blog" link anywhere else). */
export const blogIndexPage = ({ origin, settings, posts, listed = [], site = {} }) => {
  const t = translator(settings.language);
  const list = posts.length
    ? `<ul class="post-list">${posts
        .map((post) => {
          const thumb = postThumb(post, listed);
          return `<li class="post-card">
  ${thumb ? `<a class="post-card-media" href="${esc(post.path)}" tabindex="-1" aria-hidden="true">${thumb}</a>` : ""}
  <div class="post-card-body">
    <h2><a href="${esc(post.path)}">${esc(post.title)}</a></h2>
    ${postMeta(post, t, settings.language)}
    <p>${esc(postSummary(post))}</p>
  </div>
</li>`;
        })
        .join("\n")}</ul>`
    : `<p class="empty">${esc(t("blog_empty"))}</p>`;
  return layout({
    settings,
    t,
    title: `${t("blog_heading")} · ${settings.storeName}`,
    description: plainSummary(posts.length ? `${settings.storeName}: ${posts.slice(0, 3).map((post) => post.title).join(" · ")}` : settings.tagline || settings.storeName),
    canonical: absoluteUrl(origin, BLOG_PATH),
    noindex: posts.length === 0,
    body: `<section class="blog"><h1>${esc(t("blog_heading"))}</h1>
${list}
</section>`,
    site,
  });
};

/** One published post: Markdown body (rendered like a policy page), its cover, the products it links to. */
export const postPage = ({ origin, settings, post, listed = [], site = {} }) => {
  const t = translator(settings.language);
  const products = mentionedProducts(post, listed);
  const image = postImage(origin, post, listed);
  const cover = post.cover
    ? `<figure class="post-cover"><img src="${esc(coverSrc(post))}" alt="" width="1200" height="630" decoding="async" referrerpolicy="no-referrer"></figure>`
    : "";
  const strip = products.length
    ? `<section class="post-products" aria-labelledby="post-products-heading"><h2 id="post-products-heading">${esc(t("blog_products"))}</h2><ul class="grid">${products.map((product) => card(product, t)).join("\n")}</ul></section>`
    : "";
  return layout({
    settings,
    t,
    title: post.seoTitle || `${post.title} · ${settings.storeName}`,
    description: plainSummary(post.seoDescription || postSummary(post, 300) || post.title),
    canonical: postUrl(origin, post),
    ogType: "article",
    ogImage: image,
    lang: post.locale,
    extraMeta: [
      post.publishedAt ? `<meta property="article:published_time" content="${esc(post.publishedAt)}">` : "",
      post.updatedAt ? `<meta property="article:modified_time" content="${esc(post.updatedAt)}">` : "",
    ],
    jsonLd: postJsonLd({ origin, post, settings, blogLabel: t("blog_heading"), listed }),
    body: `<nav class="crumbs" aria-label="${esc(t("storefront_breadcrumb"))}"><a href="${BLOG_PATH}">${esc(t("blog_heading"))}</a> <span aria-hidden="true">/</span> <span>${esc(post.title)}</span></nav>
<article class="post">
  <h1>${esc(post.title)}</h1>
  ${postMeta(post, t, settings.language)}
  ${cover}
  <div class="post-body">
${renderMarkdown(fillPlaceholders(post.body, settings), { demoteH1: true })}
  </div>
</article>
${strip}
<p class="post-back"><a href="${BLOG_PATH}">← ${esc(t("blog_back"))}</a></p>`,
    site,
  });
};

// ---- /account: buyer login and "My orders" (src/account.js) ----

const formatOrderDate = (iso, language) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat(localeTag(language), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(ms));
};

const accountMessage = (message) =>
  message ? `<div class="form-status${message.error ? " is-error" : ""}" role="${message.error ? "alert" : "status"}">${esc(message.text)}</div>` : "";

/**
 * The account page. `view` is one of:
 *   { kind: "email", email?, message? }            the email form (signed out)
 *   { kind: "code", email, message? }              the code form, after a code was sent
 *   { kind: "orders", user, orders, nextCursor?, message? }   My orders (signed in)
 *   { kind: "unavailable" }                        login is off: a friendly note, nothing to fill in
 * `message` is `{ text, error }`. Every form is a plain POST that works without JavaScript.
 */
// The signed render time (src/account.js createFormGuard) every send-code form posts back.
const formTimeInput = (view) => (view.formTime ? `<input type="hidden" name="${FORM_TIME_FIELD}" value="${esc(view.formTime)}">` : "");

export const accountPage = ({ origin, settings, site = {}, view }) => {
  const t = translator(settings.language);
  const money = (amount, currency) => (amount === null ? "" : formatPrice(amount, currency || settings.currency, settings.language));
  let body;
  if (view.kind === "unavailable") {
    body = `<section class="message account"><h1>${esc(t("account_unavailable_title"))}</h1><p>${esc(t("account_unavailable_body"))}</p>${settings.contactEmail ? `<p>${esc(t("contact"))}: <a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a></p>` : ""}<p><a class="button" href="/">${esc(t("back_home"))}</a></p></section>`;
  } else if (view.kind === "orders") {
    const rows = view.orders
      .map(
        (order) => `<tr>
  <td data-label="${esc(t("col_order"))}"><a href="/pay/${esc(order.orderId)}">${esc(order.orderId)}</a></td>
  <td data-label="${esc(t("col_date"))}">${order.createdAt ? `<time datetime="${esc(order.createdAt)}">${esc(formatOrderDate(order.createdAt, settings.language))}</time>` : ""}</td>
  <td data-label="${esc(t("col_items"))}"><ul class="account-items">${order.items.map((item) => `<li>${item.quantity ? `${esc(item.quantity)} × ` : ""}${esc(item.name)}</li>`).join("")}</ul></td>
  <td data-label="${esc(t("col_total"))}">${esc(money(order.total, order.currency))}</td>
  <td data-label="${esc(t("col_status"))}">${order.status ? esc(t(`status_${order.status}`)) : ""}</td>
</tr>`,
      )
      .join("\n");
    const list = view.orders.length
      ? `<table class="account-orders">
<thead><tr><th scope="col">${esc(t("col_order"))}</th><th scope="col">${esc(t("col_date"))}</th><th scope="col">${esc(t("col_items"))}</th><th scope="col">${esc(t("col_total"))}</th><th scope="col">${esc(t("col_status"))}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${view.nextCursor ? `<p><a href="/account?cursor=${encodeURIComponent(view.nextCursor)}">${esc(t("account_more"))}</a></p>` : ""}`
      : view.unavailable
        ? ""
        : `<p class="empty">${esc(t("account_orders_empty"))}</p>`;
    body = `<section class="account account-history">
  <p class="eyebrow">${esc(t("storefront_account_eyebrow"))}</p><h1>${esc(t("account_orders_heading"))}</h1>
  <div class="account-who">
    <p>${esc(t("account_signed_in_as", { email: view.user.email }))}</p>
    <form method="post" action="/account/sign-out"><button class="link-button" type="submit">${esc(t("account_sign_out"))}</button></form>
  </div>
  ${accountMessage(view.message)}
  ${list}
  <p class="note">${esc(t("account_orders_note"))}</p>
</section>`;
  } else if (view.kind === "code") {
    body = `<section class="account account-sign-in">
  <p class="eyebrow">${esc(t("storefront_account_eyebrow"))}</p><h1>${esc(t("account_code_title"))}</h1>
  ${accountMessage(view.message)}
  <form class="account-form" method="post" action="/account/verify">
    <input type="hidden" name="email" value="${esc(view.email)}">
    <label>${esc(t("account_code_label"))}<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus></label>
    <button class="button" type="submit">${esc(t("account_verify"))}</button>
  </form>
  <div class="account-more">
    <form method="post" action="/account/send-code"><input type="hidden" name="email" value="${esc(view.email)}">${formTimeInput(view)}<button class="link-button" type="submit">${esc(t("account_resend"))}</button></form>
    <a href="/account?change=email">${esc(t("account_other_email"))}</a>
  </div>
</section>`;
  } else {
    body = `<section class="account account-sign-in">
  <p class="eyebrow">${esc(t("storefront_account_eyebrow"))}</p><h1>${esc(t("account_title"))}</h1>
  <p class="lead">${esc(t("account_intro"))}</p>
  ${accountMessage(view.message)}
  <form class="account-form" method="post" action="/account/send-code">
    <label>${esc(t("account_email_label"))}<input name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(view.email ?? "")}"></label>
    ${formTimeInput(view)}
    <div class="account-extra" aria-hidden="true"><label>${esc(t("account_honeypot_label"))}<input name="${HONEYPOT_FIELD}" type="text" tabindex="-1" autocomplete="off" value=""></label></div>
    <button class="button" type="submit">${esc(t("account_send_code"))}</button>
  </form>
</section>`;
  }
  return layout({
    settings,
    t,
    title: `${t(view.kind === "orders" ? "account_orders_heading" : "account_title")} · ${settings.storeName}`,
    canonical: absoluteUrl(origin, "/account"),
    noindex: true,
    body,
    site,
  });
};

export const notFoundPage = ({ settings, site = {} }) => {
  const t = translator(settings?.language ?? "en");
  return layout({
    settings,
    t,
    title: settings ? `${t("not_found_title")} · ${settings.storeName}` : t("not_found_title"),
    noindex: true,
    body: `<section class="message"><h1>${esc(t("not_found_title"))}</h1><p>${esc(t("not_found_body"))}</p><p><a class="button" href="/">${esc(t("back_home"))}</a></p></section>`,
    site,
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
      "This shop sells from the Products table in its own folder, next to Orders and Settings. That table is missing or cannot be read.",
      "Install the Busa Shop template again, or restore Products from the trash, then add or import your products there and refresh this page.",
      "Selling from another table, such as a Busa Product Hub Products table? Write its id or slug into this shop's Settings, field “Products table”.",
    ],
  },
  "products-ambiguous": {
    title: "This shop found more than one product list",
    steps: [
      "This workspace has more than one Products table this shop could sell from, so it will not guess which one.",
      "Write the id or slug of the one to use into this shop's Settings, field “Products table”, then refresh this page.",
    ],
  },
  "products-override-not-found": {
    title: "The product list named in Settings was not found",
    steps: [
      "This shop's Settings name a Products table that this site cannot find or cannot read.",
      "Check the id or slug in Settings, field “Products table”, or clear it to sell from this shop's own Products table.",
    ],
  },
  "settings-missing": {
    title: "This shop's Settings table was not found",
    steps: [
      "The Busa Shop template creates Products, Certificates, Orders, Settings and Reports tables next to this website. The Settings table is missing or cannot be read.",
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
