/**
 * A small Markdown renderer for the preview pane.
 *
 * The point of the preview is to answer "is this what the site will show?", so it
 * covers what a post body actually uses — headings, paragraphs, lists, fenced code,
 * tables, blockquotes, and inline emphasis, code and links. It is deliberately not
 * a CommonMark implementation; the site renders with the SDK's Fumadocs pipeline,
 * and this pane says so rather than pretending to be byte-identical.
 *
 * Every rule below runs on text that has ALREADY been HTML-escaped. A post body is
 * data typed by a person into a workspace, and the preview is not a place to
 * discover that it contained a `<script>`.
 */

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Only http(s) and same-site paths become links; anything else stays literal text. */
const safeHref = (raw) => {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return href;
  return null;
};

const inline = (escaped) =>
  escaped
    // Code spans first: their content must not be re-processed as emphasis.
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, href) => {
      const safe = safeHref(href);
      if (!safe) return whole;
      const external = /^https?:\/\//i.test(safe);
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${safe}"${rel}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

const tableRow = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableDivider = (line) => /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes("-");

export const renderMarkdown = (source) => {
  const lines = escapeHtml(source ?? "").split("\n");
  const html = [];
  let index = 0;

  const flushParagraph = (buffer) => {
    if (buffer.length === 0) return;
    html.push(`<p>${inline(buffer.join(" "))}</p>`);
    buffer.length = 0;
  };

  const paragraph = [];
  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }

    // Fenced code — the content is emitted verbatim, no inline rules applied.
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph(paragraph);
      const language = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence
      const className = language ? ` class="language-${language}"` : "";
      html.push(`<pre><code${className}>${code.join("\n")}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraph);
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownFragment(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(paragraph);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""));
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      flushParagraph(paragraph);
      const head = tableRow(line);
      index += 2; // header + divider
      const body = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
        body.push(tableRow(lines[index]));
        index += 1;
      }
      const headHtml = head.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const bodyHtml = body
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      html.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph(paragraph);
      html.push("<hr>");
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph(paragraph);
  return html.join("\n");
};

/** Used for nested blocks (blockquote bodies) so they get the same treatment. */
const renderMarkdownFragment = (source) => renderMarkdown(source);

/** First paragraph, as plain text — the list rows want a one-line gist. */
export const markdownExcerpt = (source, limit = 160) => {
  const text = String(source ?? "")
    .split("\n")
    .find((line) => line.trim() && !/^[#>`|-]/.test(line.trim()));
  if (!text) return "";
  const plain = text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit - 1)}…` : plain;
};
