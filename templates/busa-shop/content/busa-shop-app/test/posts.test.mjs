// The blog's pure parts: which Posts rows are on the site and where, legacy
// redirects, the Markdown they are written in, the feed, the JSON-LD, and the
// merchant data (shipping, returns) and Google settings the pages carry.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ga4IdOf, normalizeSettings, verificationOf } from "../src/catalog.js";
import { renderMarkdown } from "../src/policies.js";
import { buildPosts, legacyPathsOf, mentionedProducts, postAddress, postSummary, resolvePostRequest } from "../src/posts.js";
import { buildFeed, buildSitemap, deliveryDays, postJsonLd, returnPolicyFor, shippingDetailsFor } from "../src/seo.js";
import { buildShippingRates } from "../src/shipping.js";

const origin = "https://shop.example";
const row = (id, fields) => ({ id, updatedAt: "2026-11-06T10:00:00.000Z", fields: { locale: "en", "schema-version": 1, body: "Text.", ...fields } });

describe("which posts are on the site", () => {
  const records = [
    row("rec_old", { title: "Old", path: "/blog/old", slug: "old", status: "published", "published-at": "2026-10-01" }),
    row("rec_new", { title: "New", path: "/blog/new", slug: "new", status: "published", "published-at": "2026-11-05T00:00:00.000Z" }),
    row("rec_draft", { title: "Draft", path: "/blog/draft", slug: "draft", status: "draft", "published-at": "2026-12-01" }),
    row("rec_review", { title: "Review", path: "/blog/review", slug: "review", status: "in-review" }),
    row("rec_archived", { title: "Gone", path: "/blog/gone", slug: "gone", status: "archived" }),
    row("rec_slug", { title: "By slug", path: "best-phones", slug: "Best-Phones", status: "published", "published-at": "2026-10-15" }),
    row("rec_bad", { title: "No address", path: "/guides/x y", slug: "", status: "published" }),
    row("rec_dupe", { title: "Twice", path: "/blog/new", slug: "new", status: "published" }),
    row("rec_empty", { title: "Empty", path: "/blog/empty", slug: "empty", status: "published", body: "  " }),
    row("rec_untitled", { title: "", path: "/blog/untitled", slug: "untitled", status: "published" }),
  ];
  const { posts, problems } = buildPosts(records, { busabaseOrigin: "https://busabase.example" });

  it("keeps only published rows with a title, a body and an address, newest Published at first", () => {
    assert.deepEqual(
      posts.map((post) => [post.path, post.publishedAt]),
      [
        ["/blog/new", "2026-11-05"],
        ["/blog/best-phones", "2026-10-15"],
        ["/blog/old", "2026-10-01"],
      ],
    );
    assert.deepEqual(
      problems.map((problem) => [problem.code, problem.post]),
      [
        ["bad-path", "No address"],
        ["duplicate-path", "Twice"],
        ["no-body", "Empty"],
        ["no-title", "untitled"],
      ],
    );
  });

  it("serves a post at its Path when it is /blog/<slug>, else at /blog/<Slug>", () => {
    assert.deepEqual(postAddress({ path: "/Blog/Redmi-13C-Thailand/", slug: "x" }), { path: "/blog/redmi-13c-thailand", slug: "redmi-13c-thailand" });
    assert.deepEqual(postAddress({ path: "/guides/redmi", slug: "redmi-guide" }), { path: "/blog/redmi-guide", slug: "redmi-guide" });
    assert.deepEqual(postAddress({ path: "/blog/a/b", slug: "b" }), { path: "/blog/b", slug: "b" });
    assert.equal(postAddress({ path: "/blog/rss.xml", slug: "" }), null, "the feed's address is never a post");
    assert.equal(postAddress({ path: "", slug: "bad slug" }), null);
  });

  it("reads Legacy paths as a JSON list, a JSON string or lines, never over the site's own routes", () => {
    assert.deepEqual(legacyPathsOf(["/blog/Old-Name/", "https://old.example/2024/phones?x", "/blog/now"], "/blog/now"), ["/blog/old-name", "/2024/phones"]);
    assert.deepEqual(legacyPathsOf('["/old-blog/phones"]', "/blog/now"), ["/old-blog/phones"]);
    assert.deepEqual(legacyPathsOf("/a\n/b", "/blog/now"), ["/a", "/b"]);
    assert.deepEqual(legacyPathsOf(["/", "/order", "/products/x", "/api/status", "/pages/terms", "/blog", "//evil.example"], "/blog/now"), []);
  });

  it("redirects legacy paths and other spellings of the address, and serves the address itself", () => {
    const list = buildPosts([row("r", { title: "T", path: "/blog/now", slug: "now", status: "published", "legacy-paths": ["/blog/then", "/2024/old-post"] })]).posts;
    assert.equal(resolvePostRequest(list, "/blog/now").post.path, "/blog/now");
    assert.deepEqual(resolvePostRequest(list, "/blog/then"), { redirect: "/blog/now" });
    assert.deepEqual(resolvePostRequest(list, "/2024/old-post/"), { redirect: "/blog/now" });
    assert.deepEqual(resolvePostRequest(list, "/Blog/Now"), { redirect: "/blog/now" });
    assert.deepEqual(resolvePostRequest(list, "/blog/now/"), { redirect: "/blog/now" });
    assert.equal(resolvePostRequest(list, "/blog/other"), null);
  });

  it("reads the cover from an attachment (the SDK's shape) or a link, and fetches a Busabase asset through the site", () => {
    const [attachment] = buildPosts([row("a", { title: "A", slug: "a", path: "/blog/a", status: "published", "cover-image": [{ id: "att", url: "https://busabase.example/api/assets/x/raw" }] })], { busabaseOrigin: "https://busabase.example" }).posts;
    assert.deepEqual(attachment.cover, { kind: "busabase", url: "https://busabase.example/api/assets/x/raw" });
    const [link] = buildPosts([row("b", { title: "B", slug: "b", path: "/blog/b", status: "published", "cover-image": "https://cdn.example/b.webp" })]).posts;
    assert.deepEqual(link.cover, { kind: "direct", url: "https://cdn.example/b.webp" });
    const [none] = buildPosts([row("c", { title: "C", slug: "c", path: "/blog/c", status: "published", "cover-image": "javascript:alert(1)" })]).posts;
    assert.equal(none.cover, null);
  });

  it("summarises a post by its Excerpt, else by its text, and finds the listed products it links to", () => {
    const post = { description: "", body: "# Hi\n\nRead about [the robot](/products/tt-robot) and [the kite](/products/tt-kite), [again](/products/tt-robot) and [a draft](/products/tt-draft).\n\n| a | b |\n| --- | --- |\n| 1 | 2 |" };
    assert.equal(postSummary(post), "Hi Read about the robot and the kite, again and a draft. a b 1 2");
    assert.equal(postSummary({ ...post, description: "Short." }), "Short.");
    const listed = [{ id: "tt-kite" }, { id: "tt-robot" }];
    assert.deepEqual(mentionedProducts(post, listed).map((product) => product.id), ["tt-robot", "tt-kite"]);
  });
});

describe("Markdown tables (posts and policy pages)", () => {
  it("renders a header row and body rows, escaping every cell", () => {
    const html = renderMarkdown("| Model | Price |\n| :--- | ---: |\n| Redmi <b>13C</b> | **$129** |\n| [A15](/products/a15) |");
    assert.equal(
      html,
      '<div class="table-wrap"><table><thead><tr><th>Model</th><th>Price</th></tr></thead><tbody><tr><td>Redmi &lt;b&gt;13C&lt;/b&gt;</td><td><strong>$129</strong></td></tr><tr><td><a href="/products/a15">A15</a></td><td></td></tr></tbody></table></div>',
    );
  });

  it("leaves pipes without a rule row as text", () => {
    assert.equal(renderMarkdown("| not | a table |"), "<p>| not | a table |</p>");
  });
});

describe("feed and JSON-LD", () => {
  const settings = { storeName: "China Phones", tagline: "Budget phones", language: "en" };
  const posts = buildPosts([
    row("p1", { title: "Redmi 13C in Thailand", path: "/blog/redmi-13c-thailand", slug: "redmi-13c-thailand", status: "published", "published-at": "2026-11-08", description: "Price & shipping.", author: "China Phones" }),
    row("p2", { title: "Syndicated", path: "/blog/syndicated", slug: "syndicated", status: "published", "published-at": "2026-11-01", "canonical-url": "https://medium.example/post" }),
  ]).posts;

  it("lists posts in an RSS 2.0 feed with absolute links, escaped", () => {
    const xml = buildFeed({ origin, settings, posts });
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
    assert.match(xml, /<atom:link href="https:\/\/shop\.example\/blog\/rss\.xml" rel="self"/);
    assert.match(xml, /<item><title>Redmi 13C in Thailand<\/title><link>https:\/\/shop\.example\/blog\/redmi-13c-thailand<\/link><guid isPermaLink="true">https:\/\/shop\.example\/blog\/redmi-13c-thailand<\/guid><pubDate>Sun, 08 Nov 2026 00:00:00 GMT<\/pubDate><description>Price &amp; shipping\.<\/description><\/item>/);
    assert.doesNotMatch(xml, /syndicated/, "a post whose canonical address is elsewhere stays out");
  });

  it("puts the blog and its own posts in the sitemap, never a post canonical elsewhere", () => {
    const xml = buildSitemap(origin, [], [], posts);
    assert.match(xml, /<loc>https:\/\/shop\.example\/blog<\/loc>/);
    assert.match(xml, /<loc>https:\/\/shop\.example\/blog\/redmi-13c-thailand<\/loc><lastmod>2026-11-06<\/lastmod>/);
    assert.doesNotMatch(xml, /syndicated/);
    assert.doesNotMatch(buildSitemap(origin, [], [], []), /\/blog/);
  });

  it("describes a post as a BlogPosting with a breadcrumb", () => {
    const [posting, crumbs] = postJsonLd({ origin, post: posts[0], settings });
    assert.deepEqual(posting, {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "Redmi 13C in Thailand",
      url: "https://shop.example/blog/redmi-13c-thailand",
      mainEntityOfPage: "https://shop.example/blog/redmi-13c-thailand",
      description: "Price & shipping.",
      datePublished: "2026-11-08",
      dateModified: "2026-11-06T10:00:00.000Z",
      inLanguage: "en",
      author: { "@type": "Organization", name: "China Phones", url: "https://shop.example/" },
      publisher: { "@type": "Organization", name: "China Phones", url: "https://shop.example/" },
    });
    assert.deepEqual(crumbs.itemListElement.map((item) => item.item), ["https://shop.example/", "https://shop.example/blog", "https://shop.example/blog/redmi-13c-thailand"]);
    assert.equal(postJsonLd({ origin, post: { ...posts[0], author: "Somchai" }, settings })[0].author["@type"], "Person");
    assert.equal(postJsonLd({ origin, post: posts[1], settings })[0].url, "https://medium.example/post");
  });
});

describe("merchant listing data", () => {
  const settings = { currency: "USD", shipsTo: ["TH", "PH", "VN", "MY", "SG"] };
  const shipping = {
    status: "ready",
    ...buildShippingRates(
      [
        { fields: { name: "Thailand", countries: "TH", rate: 6.5, "free-over": 150, "delivery-estimate": "5–8 business days", position: 1 } },
        { fields: { name: "Philippines and Vietnam", countries: "PH, VN", rate: 9, "delivery-estimate": "7 to 12 days", position: 2 } },
        { fields: { name: "Malaysia", countries: "MY", rate: 8, "delivery-estimate": "about a week", position: 3 } },
      ],
      settings,
    ),
  };

  it("reads delivery times written as days", () => {
    assert.deepEqual(deliveryDays("6–10 business days"), { min: 6, max: 10 });
    assert.deepEqual(deliveryDays("7 to 12 days"), { min: 7, max: 12 });
    assert.deepEqual(deliveryDays("5 days"), { min: 5, max: 5 });
    assert.deepEqual(deliveryDays("7-12 天"), { min: 7, max: 12 });
    assert.equal(deliveryDays("about a week"), null);
    assert.equal(deliveryDays("10-5 days"), null);
  });

  it("gives one OfferShippingDetails per zone checkout offers, free when the price reaches the zone's threshold", () => {
    const cheap = shippingDetailsFor({ price: 129 }, settings, shipping);
    assert.deepEqual(cheap, [
      {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: 6.5, currency: "USD" },
        shippingDestination: [{ "@type": "DefinedRegion", addressCountry: "TH" }],
        deliveryTime: { "@type": "ShippingDeliveryTime", transitTime: { "@type": "QuantitativeValue", minValue: 5, maxValue: 8, unitCode: "DAY" } },
      },
      {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: 9, currency: "USD" },
        shippingDestination: [
          { "@type": "DefinedRegion", addressCountry: "PH" },
          { "@type": "DefinedRegion", addressCountry: "VN" },
        ],
        deliveryTime: { "@type": "ShippingDeliveryTime", transitTime: { "@type": "QuantitativeValue", minValue: 7, maxValue: 12, unitCode: "DAY" } },
      },
    ], "Malaysia's 'about a week' is not days, and Singapore has no rate: both left out");
    assert.equal(shippingDetailsFor({ price: 199 }, settings, shipping)[0].shippingRate.value, 0);
    assert.deepEqual(shippingDetailsFor({ price: 1 }, settings, { status: "missing", rates: new Map() }), []);
  });

  it("writes a return policy only from a Returns text that says days or no returns", () => {
    const product = (returns) => ({ content: { attributes: { returns } } });
    assert.deepEqual(returnPolicyFor(product("7-day returns"), settings, shipping), {
      "@type": "MerchantReturnPolicy",
      applicableCountry: ["TH", "PH", "VN", "MY"],
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
      returnMethod: "https://schema.org/ReturnByMail",
    });
    assert.equal(returnPolicyFor(product("No returns on opened phones"), settings, shipping).returnPolicyCategory, "https://schema.org/MerchantReturnNotPermitted");
    assert.equal(returnPolicyFor(product("Ask us"), settings, shipping), null);
    assert.equal(returnPolicyFor(product(""), settings, shipping), null);
    assert.equal(returnPolicyFor(product("30 days"), settings, { status: "missing", rates: new Map() }), null);
  });
});

describe("Google settings", () => {
  it("reads a GA4 ID and verification codes, also out of a pasted snippet", () => {
    assert.equal(ga4IdOf(" g-ab12cd34ef "), "G-AB12CD34EF");
    assert.equal(ga4IdOf("<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-XYZ1234567\"></script>"), "G-XYZ1234567");
    assert.equal(ga4IdOf("UA-12345-1"), "");
    assert.equal(verificationOf('<meta name="google-site-verification" content="abcDEF_123-xyz456789" />'), "abcDEF_123-xyz456789");
    assert.equal(verificationOf("0123456789ABCDEF0123456789ABCDEF"), "0123456789ABCDEF0123456789ABCDEF");
    assert.equal(verificationOf('x" onload="alert(1)'), "");
    assert.deepEqual(
      (({ ga4Id, googleVerification, bingVerification }) => ({ ga4Id, googleVerification, bingVerification }))(normalizeSettings({ fields: {} })),
      { ga4Id: "", googleVerification: "", bingVerification: "" },
      "a shop installed before 0.7.0 has none of them",
    );
  });
});
