/**
 * An allowlist sanitizer for Page bodies.
 *
 * A Page's `body` is HTML that someone typed into a Base. The site renders it
 * through the SDK's `rehype-sanitize`/`sanitize-html` pipeline; this preview has to
 * do its own equivalent, because the preview runs *inside* a Busabase session — an
 * injected script here would run with the reviewer's cookie, which is a worse
 * outcome than an unrendered page.
 *
 * The rule is allowlist, not blocklist: a tag or attribute that is not named below
 * is dropped, so a construct nobody thought of fails closed. Element content is
 * kept when the element itself is removed, so dropping a `<div>` does not eat the
 * paragraph inside it.
 */

const ALLOWED_TAGS = new Set([
  "section",
  "article",
  "header",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "figure",
  "figcaption",
  "hr",
  "br",
  "small",
  "span",
  "div",
]);

const ALLOWED_ATTRIBUTES = {
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
};

/** `javascript:` and `data:` URLs are the whole reason this function exists. */
const safeUrl = (raw) => {
  const value = String(raw ?? "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  return null;
};

const scrub = (node, dropped) => {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }

    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      dropped.add(tag);
      // `<script>`/`<style>` carry their payload as text, so unwrapping them would
      // paste the payload into the document as visible content. Remove outright.
      if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object") {
        child.remove();
        continue;
      }
      scrub(child, dropped);
      child.replaceWith(...child.childNodes);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];
    for (const attribute of [...child.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!allowed.includes(name)) {
        child.removeAttribute(attribute.name);
        continue;
      }
      if (name === "href" || name === "src") {
        const url = safeUrl(attribute.value);
        if (url === null) {
          dropped.add(`${tag}[${name}]`);
          child.removeAttribute(attribute.name);
        } else {
          child.setAttribute(name, url);
        }
      }
    }
    if (tag === "a" && /^https?:/i.test(child.getAttribute("href") ?? "")) {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
    scrub(child, dropped);
  }
};

/**
 * @returns {{ html: string, dropped: string[] }} `dropped` is surfaced in the UI —
 * a preview that silently removes half a page is a preview that lies.
 */
export const sanitizeHtml = (source) => {
  const parsed = new DOMParser().parseFromString(`<div>${source ?? ""}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return { html: "", dropped: [] };
  const dropped = new Set();
  scrub(root, dropped);
  return { html: root.innerHTML, dropped: [...dropped].sort() };
};

/**
 * Plain text of an HTML body, for list rows and length checks.
 *
 * `textContent` concatenates across element boundaries, so `<h1>Security</h1><p>Draft`
 * reads back as "SecurityDraft". Blocks get an explicit separator first.
 */
const BLOCK_TAGS = "p,div,section,article,header,footer,h1,h2,h3,h4,h5,h6,li,tr,br,blockquote,figcaption";

export const htmlToText = (source) => {
  const parsed = new DOMParser().parseFromString(`<div>${source ?? ""}</div>`, "text/html");
  for (const block of parsed.body.querySelectorAll(BLOCK_TAGS)) {
    block.append(parsed.createTextNode(" "));
  }
  return (parsed.body.textContent ?? "").replace(/\s+/g, " ").trim();
};
