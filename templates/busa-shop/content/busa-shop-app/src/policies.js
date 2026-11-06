// Policy pages (Shipping, Returns & warranty, Privacy, Terms, Contact) from the
// Pages table, and the small Markdown they are written in. Pure
// (test/policies.test.mjs).
//
// A row: Title, Address (`slug`, the page is /pages/<slug>), Status
// (`published` / `draft`), Show in footer, Position (footer order), Text
// (`body`, simple Markdown). Only published pages exist on the site; a draft
// is a 404 and in no footer or sitemap.
//
// The Markdown is deliberately small, and everything is escaped first, so a
// page can never carry HTML or script: `#`/`##`/`###` headings, paragraphs,
// `-`/`*` and `1.` lists, `**bold**`, `*italic*`, `[text](https://… | /path |
// mailto:…)` links and line breaks. `{{store_name}}` and `{{contact_email}}`
// become the Settings values. A 【fill in …】 marker is left as written, so an
// unfinished page looks unfinished; the daily check reports every published
// page that still has one.

import { finiteNumber, text } from "./catalog.js";

export const PAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;
export const FILL_IN_MARKER = /【fill in[^】]*】/i;
export const PAGES_LIMIT = 50;

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

/** The Pages table → published pages, in footer order. Drafts, bad or repeated slugs are left out. */
export const buildPages = (records) => {
  const pages = [];
  const seen = new Set();
  const rows = [...(records ?? [])]
    .map((record, index) => ({ record, index, position: finiteNumber(record?.fields?.position) }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.index - b.index);
  for (const { record } of rows) {
    const fields = record?.fields ?? {};
    const slug = text(fields.slug).toLowerCase();
    const title = text(fields.title);
    const status = text(fields.status).toLowerCase();
    if (status !== "published" || !title || !PAGE_SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    pages.push({
      slug,
      title,
      body: typeof fields.body === "string" ? fields.body : "",
      inFooter: fields["in-footer"] === true || fields["in-footer"] === "true",
      updatedAt: text(record?.updatedAt),
    });
  }
  return pages;
};

/** `{{store_name}}` and `{{contact_email}}` → the Settings values; anything else stays as written. */
export const fillPlaceholders = (body, settings) =>
  String(body ?? "")
    .replace(/\{\{\s*store_name\s*\}\}/g, settings.storeName || "")
    .replace(/\{\{\s*contact_email\s*\}\}/g, settings.contactEmail || "【fill in: contact email】");

const safeHref = (raw) => {
  const href = raw.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(href)) return href;
  if (/^mailto:[^\s"'<>]+$/i.test(href)) return href;
  if (/^\/[A-Za-z0-9._~\-/#?=&%]*$/.test(href) && !href.startsWith("//")) return href;
  return null;
};

/** Inline Markdown on an already-escaped line: links, bold, italic. */
const inline = (escaped) =>
  escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
      // `href` is escaped text; undo the entity for & so a query string survives, then re-check.
      const url = safeHref(href.replace(/&amp;/g, "&"));
      return url ? `<a href="${esc(url)}">${label}</a>` : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1<em>$2</em>");

/** Simple Markdown → HTML. Every character of the source is escaped before any tag is added. */
export const renderMarkdown = (source) => {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null; // { tag, items }
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map((line) => inline(esc(line))).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(esc(item))}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      // A page's own title is its <h1>; Markdown headings start one level below.
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(esc(heading[2]))}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)[1]);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return out.join("\n");
};

/** Plain text of a page, for its meta description. */
export const markdownText = (source) =>
  String(source ?? "")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const pagePath = (page) => `/pages/${page.slug}`;

/** Published pages that still say 【fill in …】, for the daily check and /api/status. */
export const unfinishedPages = (pages) => pages.filter((page) => FILL_IN_MARKER.test(page.body)).map((page) => page.slug);
