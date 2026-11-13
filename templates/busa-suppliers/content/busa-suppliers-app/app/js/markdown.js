// A small Markdown renderer for what agents write here: weekly reports,
// acceptance steps and evidence. Everything is escaped first and only a fixed
// set of constructs is turned back into HTML, so stored text can never inject
// markup. Links and images must be http(s); anything else renders as text.

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : null);

// Inline: code spans are cut out first so nothing inside them is formatted.
function inline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
      const href = safeUrl(url.replaceAll('&amp;', '&'));
      return href ? `<img src="${escapeHtml(href)}" alt="${alt}" loading="lazy">` : match;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const href = safeUrl(url.replaceAll('&amp;', '&'));
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : match;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
const isTableRule = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null; // { tag, items: [[line, ...continuations]] }

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${item.map(inline).join('<br>')}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flush = () => { flushParagraph(); flushList(); };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      flush();
      const body = [];
      for (index += 1; index < lines.length && !/^```/.test(lines[index].trim()); index += 1) body.push(lines[index]);
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (line.trim().startsWith('|') && isTableRule(lines[index + 1] || '')) {
      flush();
      const head = cells(line);
      const rows = [];
      for (index += 2; index < lines.length && lines[index].trim().startsWith('|'); index += 1) rows.push(cells(lines[index]));
      index -= 1;
      out.push(`<div class="md-table"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { flush(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ||= { tag, items: [] };
      list.items.push([(bullet || ordered)[1]]);
      continue;
    }
    // An indented line right under a list item continues that item.
    if (list && /^\s{2,}\S/.test(line)) { list.items.at(-1).push(line.trim()); continue; }
    flushList();
    paragraph.push(line.trim());
  }
  flush();
  return out.join('');
}

/** Plain text of a Markdown value, for one-line previews and search. */
export const markdownText = (source) => String(source ?? '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>|]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
