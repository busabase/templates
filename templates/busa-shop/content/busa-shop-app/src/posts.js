// Blog posts from the Posts table, read the way busabase-cms-sdk reads its
// standard Posts (the same field slugs, so that SDK can read this table too).
// Pure (test/posts.test.mjs).
//
// A row: Path (`path`, the address, `/blog/<slug>`), Title, Slug, Locale,
// Status (`draft` / `in-review` / `published` / `archived`), Excerpt
// (`description`), Body (`body`, simple Markdown, rendered by
// src/policies.js like a policy page), Cover image (an attachment, or a
// link), Author, Published at, Canonical URL, Legacy paths (a JSON list of
// old addresses), SEO title, SEO description, Schema version.
//
// Only a Published row with a title and a body is on the site. Its address is
// its Path when that is `/blog/` plus one lowercase slug (letters, digits,
// hyphens), otherwise `/blog/<Slug>`; a row with neither is left out and
// named in /api/status. A request for one of its Legacy paths, or for its
// Path written with capitals or a trailing slash, is redirected (301) to it.
// Published at is the date shown and the order (newest first); it does not
// schedule anything.

import { classifyImageRef, finiteNumber, text } from "./catalog.js";
import { markdownText } from "./policies.js";

export const POSTS_LIMIT = 100; // the site reads the newest 100 rows by Published at
export const POST_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
export const BLOG_PATH = "/blog";
export const FEED_PATH = "/blog/rss.xml";
export const FEED_ITEMS = 20;
export const MAX_MENTIONED_PRODUCTS = 4;

// Addresses a legacy path may never take over: the site's own routes.
const RESERVED_PREFIXES = ["/api/", "/static/", "/images/", "/blog-covers/", "/pay/", "/products/", "/pages/"];
const RESERVED_PATHS = new Set(["/", "/order", "/blog", "/blog/rss.xml", "/sitemap.xml", "/robots.txt", "/llms.txt", "/favicon.svg"]);

/** `/Blog/Some-Post/` → `/blog/some-post`; anything that is not a plain site path → "". */
export const normalizePath = (value) => {
  let raw = text(value);
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return "";
    }
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.length > 300 || /[\s\\?#]/.test(raw)) return "";
  const path = raw.toLowerCase().replace(/\/+$/, "");
  return path || "/";
};

/** The address a row is served at, or null. */
export const postAddress = (fields) => {
  const path = normalizePath(fields?.path);
  const match = /^\/blog\/([^/]+)$/.exec(path);
  if (match && POST_SLUG_PATTERN.test(match[1])) return { path, slug: match[1] };
  const slug = text(fields?.slug).toLowerCase();
  if (POST_SLUG_PATTERN.test(slug)) return { path: `${BLOG_PATH}/${slug}`, slug };
  return null;
};

/** `2026-11-02`, `2026-11-02T00:00:00.000Z` → `{ day: "2026-11-02", ms }`; anything else → null. */
export const postDate = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isFinite(ms) ? { day: new Date(ms).toISOString().slice(0, 10), ms } : null;
};

const listOf = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // One path per line, for a table edited by hand.
      return value.split(/\n|,/);
    }
  }
  return [];
};

export const legacyPathsOf = (value, ownPath) =>
  [...new Set(listOf(value).map(normalizePath))].filter(
    (path) => path && path !== ownPath && !RESERVED_PATHS.has(path) && !RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );

/** The cover's link: an attachment's `url` (the SDK's shape), a list of them, or a plain link. */
const coverRef = (value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && typeof first.url === "string") return first.url;
  return "";
};

const httpsUrl = (value) => {
  const raw = text(value);
  if (!/^https:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).href;
  } catch {
    return "";
  }
};

/**
 * The Posts table → `{ posts, problems }`: published posts, newest first, and
 * every published row the site leaves out with the reason (`no-title`,
 * `no-body`, `bad-path`, `duplicate-path`).
 */
export const buildPosts = (records, { busabaseOrigin = "" } = {}) => {
  const posts = [];
  const problems = [];
  const seen = new Map();
  for (const record of records ?? []) {
    const fields = record?.fields ?? {};
    if (text(fields.status).toLowerCase() !== "published") continue;
    const title = text(fields.title);
    const label = title || text(fields.slug) || text(record?.id) || "?";
    const body = typeof fields.body === "string" ? fields.body.trim() : "";
    const address = postAddress(fields);
    if (!title) {
      problems.push({ code: "no-title", post: label });
      continue;
    }
    if (!body) {
      problems.push({ code: "no-body", post: label });
      continue;
    }
    if (!address) {
      problems.push({ code: "bad-path", post: label, path: text(fields.path) });
      continue;
    }
    if (seen.has(address.path)) {
      problems.push({ code: "duplicate-path", post: label, path: address.path, kept: seen.get(address.path) });
      continue;
    }
    seen.set(address.path, title);
    const published = postDate(fields["published-at"]);
    const updated = postDate(fields["updated-at"]) ?? postDate(record?.updatedAt);
    const cover = classifyImageRef(coverRef(fields["cover-image"]), busabaseOrigin);
    posts.push({
      recordId: text(record?.id),
      path: address.path,
      slug: address.slug,
      title,
      description: text(fields.description),
      body,
      cover: cover && cover.kind !== "airapp" ? cover : null,
      author: text(fields.author),
      locale: text(fields.locale),
      publishedAt: published?.day ?? "",
      updatedAt: updated ? new Date(updated.ms).toISOString() : "",
      sortMs: published?.ms ?? updated?.ms ?? 0,
      canonicalUrl: httpsUrl(fields["canonical-url"]),
      legacyPaths: legacyPathsOf(fields["legacy-paths"], address.path),
      seoTitle: text(fields["seo-title"]),
      seoDescription: text(fields["seo-description"]),
      schemaVersion: finiteNumber(fields["schema-version"]) ?? 1,
    });
  }
  posts.sort((a, b) => b.sortMs - a.sortMs || a.title.localeCompare(b.title));
  return { posts, problems };
};

/**
 * What a blog request is: `{ post }` to serve, `{ redirect }` (a legacy path,
 * or the address in other capitals or with a trailing slash), or null.
 * `rawPath` is the request path as sent.
 */
export const resolvePostRequest = (posts, rawPath) => {
  const path = normalizePath(rawPath);
  if (!path) return null;
  const post = posts.find((item) => item.path === path);
  if (post) return rawPath === post.path ? { post } : { redirect: post.path };
  const moved = posts.find((item) => item.legacyPaths.includes(path));
  return moved ? { redirect: moved.path } : null;
};

/** The one-line summary of a post: its Excerpt, or the start of its text. */
export const postSummary = (post, max = 200) => {
  if (post.description) return post.description;
  const flat = markdownText(post.body).replace(/【fill in[^】]*】/gi, "").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
};

/** Products the body links to (`/products/<product-id>`), in order, that the site lists. */
export const mentionedProducts = (post, listed) => {
  const byId = new Map(listed.map((product) => [product.id, product]));
  const found = [];
  for (const match of post.body.matchAll(/\(\/products\/([A-Za-z0-9][A-Za-z0-9._%-]{0,119})\)/g)) {
    let id;
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    const product = byId.get(id);
    if (product && !found.includes(product)) found.push(product);
    if (found.length >= MAX_MENTIONED_PRODUCTS) break;
  }
  return found;
};

/** Where the site shows a post's cover: its own link, or the site's image route for a Busabase asset. */
export const coverSrc = (post) => {
  if (!post.cover) return "";
  return post.cover.kind === "direct" ? post.cover.url : `/blog-covers/${encodeURIComponent(post.slug)}`;
};

/** Is this post's canonical address another site's (the post was first published there)? */
export const canonicalElsewhere = (post, origin) => Boolean(post.canonicalUrl) && post.canonicalUrl !== new URL(post.path, origin).href;
