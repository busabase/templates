// The blog, llms.txt, the merchant data on product pages and the Google tags,
// through the DEPLOYED bundle (vendor/worker.js) against a fake Busabase
// holding the toy demo (busa-shop 0.7.0: Posts with the two sample posts).
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
const ROBOT_POST = "/blog/first-robot-toy-for-a-three-year-old";
const SHIPPING_POST = "/blog/shipping-costs-and-delivery-times";
let api;
let pristine;
let env;

const envFor = (overrides = {}) => ({
  BUSABASE_BASE_URL: api.origin,
  BUSABASE_API_KEY: TEST_KEY,
  BUSABASE_SPACE_ID: "spc_demo",
  BUSABASE_AIRAPP_RUNTIME: "site",
  ...overrides,
});
const call = async (path, { site = SITE, useEnv = env, ...init } = {}) => {
  const response = await worker.fetch(new Request(new URL(path, site), { redirect: "manual", ...init }), useEnv, { waitUntil: () => {} });
  const text = await response.text();
  return { response, status: response.status, text, location: response.headers.get("location"), json: () => JSON.parse(text) };
};
const jsonLd = (text) => [...text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
const posts = () => api.state.records.bas_posts;
const settings = () => api.state.records.bas_settings[0].fields;
const draft = (overrides = {}) => ({
  id: "rec_agent_draft",
  fields: {
    path: "/blog/robot-batteries-explained",
    title: "Which batteries does the Walking Robot Buddy take?",
    slug: "robot-batteries-explained",
    locale: "en",
    status: "draft",
    description: "2 × AA, not included.",
    body: "The [Walking Robot Buddy](/products/tt-walking-robot) takes **2 × AA** batteries.",
    "schema-version": 1,
    ...overrides,
  },
});

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop", blog: true });
});

after(() => api.close());

beforeEach(() => {
  Object.assign(api.state, structuredClone(pristine));
  api.log.length = 0;
  env = envFor();
});

describe("the blog", () => {
  it("lists the published posts newest first, with a Blog link in the nav and footer and the feed in <head>", async () => {
    const { status, text } = await call("/blog");
    assert.equal(status, 200);
    assert.match(text, /<h1>Blog<\/h1>/);
    const listed = [...text.matchAll(/<h2><a href="([^"]+)">/g)].map((match) => match[1]);
    assert.deepEqual(listed, [SHIPPING_POST, ROBOT_POST]);
    assert.match(text, /<time datetime="2026-11-05">Published November 5, 2026<\/time>/);
    assert.match(text, /<link rel="canonical" href="https:\/\/tumbleberry-toys\.example\/blog">/);
    const home = (await call("/")).text;
    assert.match(home, /<nav class="site-nav"><a href="\/#products">Products<\/a><a href="\/blog">Blog<\/a>/);
    assert.match(home, /<nav class="footer-links footer-blog" aria-label="Blog"><a href="\/blog">Blog<\/a><a href="\/blog\/rss\.xml">RSS feed<\/a><\/nav>/);
    assert.match(home, /<link rel="alternate" type="application\/rss\+xml" title="Tumbleberry Toys · Blog" href="\/blog\/rss\.xml">/);
    assert.equal(api.log.find((entry) => entry.query.baseId === "bas_posts").query.sort.fieldSlug, "published-at");
  });

  it("shows a post: Markdown body with its table, the products it links to, BlogPosting JSON-LD, canonical and Open Graph", async () => {
    const { status, text } = await call(ROBOT_POST);
    assert.equal(status, 200);
    assert.match(text, /<title>First robot toy for a 3-year-old: what to check<\/title>/, "the SEO title");
    assert.match(text, /<meta name="description" content="Age grade, batteries and safety certificates to check/);
    assert.match(text, /<h1>Choosing a first robot toy for a three-year-old<\/h1>/);
    assert.match(text, /<h2>Is it made for the child&#39;s age\?<\/h2>/, "## is a section of the post, as in busabase-cms-sdk (demoteH1)");
    assert.match(text, /<td>Price<\/td><td>\$24\.00<\/td>/);
    assert.match(text, /<a href="\/products\/tt-walking-robot">Walking Robot Buddy<\/a>/);
    assert.match(text, /<section class="post-products"[^>]*><h2 id="post-products-heading">Products in this post<\/h2><ul class="grid"><li class="card">\s*<a class="card-link" href="\/products\/tt-walking-robot">/);
    assert.match(text, /<link rel="canonical" href="https:\/\/tumbleberry-toys\.example\/blog\/first-robot-toy-for-a-three-year-old">/);
    assert.match(text, /<meta property="og:type" content="article">/);
    assert.match(text, /<meta property="og:image" content="https:\/\/tumbleberry-toys\.example\/images\/tt-walking-robot\/0">/, "no cover: the linked product's photo");
    assert.match(text, /<meta property="article:published_time" content="2026-11-02">/);
    const [posting, crumbs] = jsonLd(text);
    assert.equal(posting["@type"], "BlogPosting");
    assert.equal(posting.headline, "Choosing a first robot toy for a three-year-old");
    assert.equal(posting.datePublished, "2026-11-02");
    assert.deepEqual(posting.image, ["https://tumbleberry-toys.example/images/tt-walking-robot/0"]);
    assert.equal(posting.publisher.name, "Tumbleberry Toys");
    assert.equal(crumbs["@type"], "BreadcrumbList");
    assert.doesNotMatch(text, /<script>|onerror=|javascript:/i);
  });

  it("never serves a draft, then shows it everywhere once its Status is Published", async () => {
    posts().push(draft());
    const path = "/blog/robot-batteries-explained";
    assert.equal((await call(path)).status, 404);
    for (const [route, label] of [["/blog", "blog"], ["/sitemap.xml", "sitemap"], ["/blog/rss.xml", "feed"], ["/llms.txt", "llms.txt"]]) {
      assert.doesNotMatch((await call(route)).text, /robot-batteries-explained/, label);
    }
    posts().at(-1).fields.status = "published";
    posts().at(-1).fields["published-at"] = "2026-11-09";
    assert.equal((await call(path)).status, 404, "the site reads the workspace at most once a minute");
    env = envFor(); // a minute later: a fresh read
    assert.equal((await call(path)).status, 200);
    assert.match((await call("/blog")).text, /<h2><a href="\/blog\/robot-batteries-explained">/);
    assert.match((await call("/sitemap.xml")).text, /<loc>https:\/\/tumbleberry-toys\.example\/blog\/robot-batteries-explained<\/loc>/);
    assert.match((await call("/blog/rss.xml")).text, /<link>https:\/\/tumbleberry-toys\.example\/blog\/robot-batteries-explained<\/link>/);
    assert.match((await call("/llms.txt")).text, /- \[Which batteries does the Walking Robot Buddy take\?\]\(https:\/\/tumbleberry-toys\.example\/blog\/robot-batteries-explained\): 2 × AA, not included\./);
    const first = [...(await call("/blog")).text.matchAll(/<h2><a href="([^"]+)">/g)][0][1];
    assert.equal(first, path, "newest Published at first");
  });

  it("redirects a legacy path, another spelling of the address and a moved post's old address (301)", async () => {
    const legacy = await call("/blog/first-robot-toy");
    assert.equal(legacy.status, 301);
    assert.equal(legacy.location, ROBOT_POST);
    assert.equal((await call("/Blog/First-Robot-Toy-For-A-Three-Year-Old")).location, ROBOT_POST);
    assert.equal((await call(`${ROBOT_POST}/`)).location, ROBOT_POST);
    assert.equal((await call("/blog/")).location, "/blog");
    posts()[0].fields["legacy-paths"] = JSON.stringify(["/blog/first-robot-toy", "/2025/robots.html"]); // Busabase keeps a json field as text
    env = envFor();
    const outside = await call("/2025/robots.html");
    assert.equal(outside.status, 301, "a legacy path outside /blog/ redirects too");
    assert.equal(outside.location, ROBOT_POST);
    assert.equal((await call("/blog/no-such-post")).status, 404);
    assert.equal((await call("/no-such-page")).status, 404);
  });

  it("serves a Busabase cover through the site, with the key, and links any other cover directly", async () => {
    posts()[0].fields["cover-image"] = [{ id: "att_cover", url: `${api.origin}/api/assets/robot-cover/raw`, mimeType: "image/svg+xml" }];
    api.state.assets["robot-cover"] = { type: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" };
    posts()[1].fields["cover-image"] = "https://cdn.example/shipping.webp";
    const page = (await call(ROBOT_POST)).text;
    assert.match(page, /<figure class="post-cover"><img src="\/blog-covers\/first-robot-toy-for-a-three-year-old"/);
    assert.match(page, /<meta property="og:image" content="https:\/\/tumbleberry-toys\.example\/blog-covers\/first-robot-toy-for-a-three-year-old">/);
    const cover = await call("/blog-covers/first-robot-toy-for-a-three-year-old");
    assert.equal(cover.status, 200);
    assert.equal(cover.response.headers.get("content-type"), "image/svg+xml");
    assert.ok(api.log.some((entry) => entry.path === "/api/assets/robot-cover/raw" && entry.auth === `Bearer ${TEST_KEY}`));
    assert.match((await call(SHIPPING_POST)).text, /<img src="https:\/\/cdn\.example\/shipping\.webp"/);
    assert.equal((await call("/blog-covers/shipping-costs-and-delivery-times")).status, 404, "a direct cover is never proxied");
    assert.equal((await call("/blog-covers/nope")).status, 404);
  });

  it("is invisible in a shop installed before 0.7.0 (no Posts table): no Blog link, an empty, unindexed /blog", async () => {
    api.state.nodes = api.state.nodes.filter((node) => node.baseId !== "bas_posts");
    const home = (await call("/")).text;
    assert.doesNotMatch(home, /href="\/blog"/);
    assert.doesNotMatch(home, /rss\+xml/);
    const blog = await call("/blog");
    assert.equal(blog.status, 200);
    assert.match(blog.text, /No posts yet\./);
    assert.match(blog.text, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch((await call("/sitemap.xml")).text, /\/blog/);
    assert.equal((await call("/api/status")).json().posts, "missing");
  });

  it("reports published rows it cannot show in /api/status, and counts the posts", async () => {
    posts().push(draft({ status: "published", path: "", slug: "" }));
    const status = (await call("/api/status")).json();
    assert.equal(status.posts, 2);
    assert.deepEqual(status.postsNotShown, [{ code: "bad-path", post: "Which batteries does the Walking Robot Buddy take?", path: "" }]);
  });
});

describe("llms.txt", () => {
  it("summarises the shop from its tables: what it sells, where it ships, listed products with prices, policies and posts", async () => {
    const { status, text, response } = await call("/llms.txt");
    assert.equal(status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(text, /^# Tumbleberry Toys\n\n> Colourful, tested toys from our own factory floor\. An online shop with 10 products on sale \(Robots & STEM, Wooden toys/);
    assert.match(text, /\nNote: this is a demo store\. Its products, prices and orders are fictional\.\n/);
    assert.match(text, /\n- Ships to: United States, Canada, United Kingdom, Ireland, Germany/);
    assert.match(text, /\n- Payment: order requests: the shop confirms the order and payment by email\n/);
    assert.match(text, /\n## Shipping\n\n- United States \(US\): shipping \$8\.90, free from an items total of \$75\.00, delivery 6–10 business days\n/);
    assert.match(text, /\n- \[Walking Robot Buddy\]\(https:\/\/tumbleberry-toys\.example\/products\/tt-walking-robot\): \$24\.00\. Walks, turns its head and blinks its light-up eyes\n/);
    assert.match(text, /\n- \[Dino Explorer Figures\]\([^)]+\): \$16\.00\. out of stock\./);
    assert.doesNotMatch(text, /Rainbow Xylophone|Magnetic Building Tiles/, "a product without a price or not on sale is not listed");
    assert.match(text, /\n## Policies\n\n- \[Shipping\]\(https:\/\/tumbleberry-toys\.example\/pages\/shipping\)\n/);
    assert.doesNotMatch(text, /Legal notice/, "a draft page is not listed");
    assert.match(text, /\n## Blog\n\n- \[Shipping costs and delivery times, by country\]\(https:\/\/tumbleberry-toys\.example\/blog\/shipping-costs-and-delivery-times\): What shipping costs/);
  });

  it("is allowed in robots.txt, which names the AI assistants' crawlers and links the sitemap", async () => {
    const robots = (await call("/robots.txt")).text;
    assert.match(robots, /User-agent: GPTBot\n/);
    assert.match(robots, /User-agent: ClaudeBot\n/);
    assert.match(robots, /User-agent: PerplexityBot\n/);
    assert.match(robots, /Sitemap: https:\/\/tumbleberry-toys\.example\/sitemap\.xml/);
    assert.doesNotMatch(robots, /Disallow: \/(llms|blog|products)/);
  });
});

describe("product pages for merchant listings", () => {
  it("carry an Offer with price, availability, shipping by zone and the return policy, all from the tables", async () => {
    const [product] = jsonLd((await call("/products/tt-walking-robot")).text);
    assert.equal(product["@type"], "Product");
    const offer = product.offers;
    assert.equal(offer.price, "24.00");
    assert.equal(offer.priceCurrency, "USD");
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.equal(offer.shippingDetails.length, 7, "the seven demo zones");
    assert.deepEqual(offer.shippingDetails[0], {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 8.9, currency: "USD" },
      shippingDestination: [{ "@type": "DefinedRegion", addressCountry: "US" }],
      deliveryTime: { "@type": "ShippingDeliveryTime", transitTime: { "@type": "QuantitativeValue", minValue: 6, maxValue: 10, unitCode: "DAY" } },
    });
    assert.deepEqual(offer.hasMerchantReturnPolicy.merchantReturnDays, 30);
    assert.equal(offer.hasMerchantReturnPolicy.returnPolicyCategory, "https://schema.org/MerchantReturnFiniteReturnWindow");
    assert.equal(offer.hasMerchantReturnPolicy.applicableCountry.length, 22);
    const [dino] = jsonLd((await call("/products/tt-dino-figures")).text);
    assert.equal(dino.offers.availability, "https://schema.org/OutOfStock");
  });
});

describe("Google Analytics and site verification", () => {
  const GA = '<meta name="busa-shop-ga4" content="G-TEST12345">';

  it("adds nothing while Settings leave them empty", async () => {
    const { text, response } = await call("/");
    assert.doesNotMatch(text, /busa-shop-ga4|googletagmanager|google-site-verification|msvalidate/);
    assert.doesNotMatch(response.headers.get("content-security-policy"), /google/);
  });

  it("loads Google's tag on the public site once the ID is set, with a policy that lets it report", async () => {
    Object.assign(settings(), { "ga4-id": "G-TEST12345", "google-site-verification": '<meta name="google-site-verification" content="gsc-Token_1234567890" />', "bing-site-verification": "0123456789ABCDEF0123456789ABCDEF" });
    for (const path of ["/", "/blog", ROBOT_POST, "/products/tt-walking-robot", "/pages/privacy", "/order", "/no-such-page"]) {
      const { text, response } = await call(path);
      assert.ok(text.includes(GA), path);
      assert.ok(text.includes('<script type="module" src="/static/analytics.js"></script>'), path);
      assert.match(response.headers.get("content-security-policy"), /script-src 'self' https:\/\/\*\.googletagmanager\.com; connect-src 'self' https:\/\/\*\.google-analytics\.com/, path);
    }
    const home = (await call("/")).text;
    assert.match(home, /<meta name="google-site-verification" content="gsc-Token_1234567890">/);
    assert.match(home, /<meta name="msvalidate\.01" content="0123456789ABCDEF0123456789ABCDEF">/);
  });

  it("never loads it in the owner's previews: the members-only preview script, or the browser engine (no key)", async () => {
    settings()["ga4-id"] = "G-TEST12345";
    settings()["google-site-verification"] = "gsc-Token_1234567890";
    const preview = await call("/", { site: "https://busabase-site-abc123-preview.sites.example" });
    assert.ok(!preview.text.includes(GA));
    assert.doesNotMatch(preview.response.headers.get("content-security-policy"), /google/);
    assert.match(preview.text, /google-site-verification/, "verification tags are harmless anywhere");
    api.options.viewerSession = true;
    const browser = await call("/", { useEnv: envFor({ BUSABASE_API_KEY: undefined }) });
    api.options.viewerSession = false;
    assert.equal(browser.status, 200);
    assert.ok(!browser.text.includes(GA));
  });

  it("is reported in /api/status as set or not, never by value", async () => {
    settings()["ga4-id"] = "G-TEST12345";
    const status = (await call("/api/status")).text;
    assert.deepEqual(JSON.parse(status).google, { analytics: true, searchConsole: false, bing: false });
    assert.doesNotMatch(status, /G-TEST12345/);
  });
});
