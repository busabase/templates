#!/usr/bin/env node
// Import a product list into the Busa Product Hub installed in this workspace:
// Products, their pictures, and Certificates, in one run. The list can be an
// Excel workbook (.xlsx, pictures inside it included) or a CSV file.
//
//   npm i busabase-sdk
//   export BUSABASE_BASE_URL=https://busabase.com BUSABASE_API_KEY=… BUSABASE_SPACE_ID=…
//   node import-products.mjs products.xlsx --dry-run     # the preview the owner reads first
//   node import-products.mjs products.xlsx               # after the owner says yes
//   node import-products.mjs --write-template products-template.xlsx   # the blank bilingual sheet
//
// Self-contained on purpose: it needs only Node 20+ and `busabase-sdk`, so an
// agent can copy this one file out of the busa-product-hub skill into an empty
// directory and run it. It reads .xlsx itself (Node's built-in zlib), because no
// spreadsheet library on npm returns pictures with the row they sit in, and that
// is the part that matters here.
//
// What it does, and does not do:
// - Reads the header row wherever it is (a title row above it is fine) and
//   understands common English and Chinese column names (名称, 售价, 币种, 库存,
//   主图, FCC ID, …). A column it does not know is kept, under its own header, as
//   a product detail in `content.attributes`, and the preview says so. A column
//   with values but no header is reported, never silently dropped.
// - Pictures, three ways: https links in an image column, file names found in an
//   images folder, and pictures inside the workbook: floating pictures placed on
//   a product's row, Excel's "Place in Cell" pictures, and WPS's in-cell
//   pictures (DISPIMG). Uploaded through the SDK (`uploadAsset`); their public
//   URLs go into `image` / `gallery`.
// - Certificates from a Certificates sheet (or a separate file), and from
//   certificate columns on the product sheet ("FCC ID", "CE 证书编号").
// - Finds the product hub's Products and Certificates tables by the stamp the
//   template installer writes ({ appId: "busa-product-hub", resourceKey }), then
//   by the default slugs; --products-base <id or slug> names the table.
// - Upserts each product by `product-id`. Without an ID column the ID is made
//   from the SKU, or from the name and the variant columns (colour, storage…),
//   and the preview says so.
// - Idempotent: a value already stored is not written again, a picture already
//   uploaded (same SHA-256, remembered in `content.image_files`) is not uploaded
//   again, so a second run changes nothing.
// - Never invents a value: an empty cell is "not provided" and leaves the stored
//   value alone; it never clears one. Only what the owner asks for with
//   --currency or --fill is filled in, and only where both the sheet and the
//   table are empty.
// - Records where each product came from in `content.source` (--source, a
//   来源/Source column, or "<file> › <sheet>").
// - Writes the selling price into the Products table's Price and Currency
//   columns (busa-product-hub 0.4.0 and later), or, on an older table without a
//   Price column, into `pricing.current_price` / `pricing.currency`.
// - Never passes `autoMerge`: with write access a change lands at once; without
//   it, it waits for review, and the summary says so.
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

export const PRODUCT_HUB_APP_ID = "busa-product-hub";
export const IMPORTER_ID = "busa-product-hub-import";
export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** The product ID of the example row in the template spreadsheet; that row is never imported. */
export const TEMPLATE_EXAMPLE_ID = "example-phone";
const PAGE = 100;
const MAX_PAGES = 50; // 5,000 rows: far beyond a small seller's catalogue; refuse rather than half-read
const MAX_PICTURES = 12; // per product: the gallery a website can show
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" };

class InputError extends Error {}

// ------------------------------------------------------------ helpers ----

const blank = (value) => value === null || value === undefined || (typeof value === "string" && !value.trim());
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Column number (1-based) → letters: 1 → A, 28 → AB. */
export const columnLetter = (column) => {
  let out = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
};

const parseCellRef = (ref) => {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref ?? "");
  if (!match) return null;
  let column = 0;
  for (const char of match[1].toUpperCase()) column = column * 26 + (char.charCodeAt(0) - 64);
  return { column, row: Number(match[2]) };
};

/** A number written the way a person reads it: 9.8, not 9.8000000000000007. */
const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
  return String(Number(value.toPrecision(15)));
};

// --------------------------------------------------------------- CSV ----

/** RFC 4180 rows: quoted fields, doubled quotes, delimiters and newlines inside quotes. */
const csvGrid = (text, delimiter = ",") => {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
};

/** CSV text → objects keyed by the first non-empty row (the header), with `__line` = the file's line number. */
export const parseCsv = (text) => {
  const rows = csvGrid(text);
  const numbered = rows.map((cells, index) => ({ cells, line: index + 1 })).filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  const [header, ...body] = numbered;
  const names = (header?.cells ?? []).map((name) => name.trim());
  return body.map(({ cells }, index) => ({
    __line: index + 2,
    ...Object.fromEntries(names.map((name, column) => [name, (cells[column] ?? "").trim()])),
  }));
};

/**
 * Bytes of a CSV/TSV file → text. UTF-8 (with or without BOM), UTF-16 with a
 * BOM (Excel's "Unicode Text"), and GB18030/GBK, which is what Excel on a
 * Chinese Windows writes as "CSV".
 */
export const decodeText = (bytes) => {
  const buffer = Buffer.from(bytes);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(buffer.subarray(2)), encoding: "UTF-16" };
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(buffer.subarray(2)), encoding: "UTF-16" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("gb18030").decode(buffer), encoding: "GB18030 (Chinese Windows Excel)" };
  }
};

/** A CSV/TSV file as one sheet: `{ name, rows: [{ number, cells: Map(column → { value }) }] }`. */
export const readDelimited = (bytes, { name = "CSV" } = {}) => {
  const { text, encoding } = decodeText(bytes);
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const counts = [",", ";", "\t"].map((delimiter) => [delimiter, firstLine.split(delimiter).length - 1]);
  const [delimiter] = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0] : [","];
  const rows = csvGrid(text, delimiter).map((cells, index) => ({
    number: index + 1,
    cells: new Map(cells.map((value, column) => [column + 1, { value: value.trim() }]).filter(([, cell]) => cell.value !== "")),
  }));
  const sample = rows.slice(0, 5).flatMap((row) => [...row.cells.values()].map((cell) => cell.value)).join(" ");
  const language = KANA.test(sample) ? "ja" : HAN.test(sample) ? "zh" : "";
  return { name, hidden: false, rows, pictures: [], merges: [], notes: encoding === "UTF-8" ? [] : [`read as ${encoding}`], csv: true, language };
};

// --------------------------------------------------------------- zip ----

/** Entries of a zip archive (an .xlsx is one), read on demand with Node's zlib. */
const readZip = (input) => {
  const bytes = Buffer.from(input.buffer ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : input);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new InputError("this .xlsx file is damaged or not really an Excel workbook (no zip directory). Open it in Excel or WPS and save it again as .xlsx.");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new InputError("this workbook is too large for this importer (zip64). Split it, or save the product sheet as CSV.");
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new InputError("this .xlsx file is damaged (bad zip directory). Save it again as .xlsx.");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name.replace(/^\/+/, "").toLowerCase(), { name, flags, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const read = (part) => {
    const entry = entries.get(String(part).replace(/^\/+/, "").toLowerCase());
    if (!entry) return null;
    if (entry.flags & 1) throw new InputError("this workbook is password-protected. Save a copy without a password.");
    const local = entry.localOffset;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new InputError("this .xlsx file is damaged (bad zip entry). Save it again as .xlsx.");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 256 * 1024 * 1024 });
    throw new InputError(`this workbook uses a zip compression this importer cannot read (method ${entry.method}). Save it again as .xlsx.`);
  };
  return { read, has: (part) => entries.has(String(part).replace(/^\/+/, "").toLowerCase()) };
};

// --------------------------------------------------------------- XML ----

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decodeXml = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code] ?? match;
  });

/**
 * A small non-validating XML reader for the parts of an .xlsx: elements by
 * local name (prefix dropped), `ns` resolved, attributes by local name for
 * unprefixed ones and `{namespace}local` for prefixed ones, and text.
 */
export const parseXml = (source) => {
  const root = { name: "#root", ns: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  const scopes = [{ xml: "http://www.w3.org/XML/1998/namespace" }];
  const appendText = (text) => {
    if (text) stack.at(-1).text += text;
  };
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) {
      appendText(decodeXml(source.slice(index)));
      break;
    }
    if (open > index) appendText(decodeXml(source.slice(index, open)));
    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      index = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const close = source.indexOf("]]>", open + 9);
      appendText(source.slice(open + 9, close < 0 ? source.length : close));
      index = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source[open + 1] === "?" || source[open + 1] === "!") {
      const close = source.indexOf(">", open);
      index = close < 0 ? source.length : close + 1;
      continue;
    }
    let close = open + 1;
    let quote = "";
    for (; close < source.length; close += 1) {
      const char = source[close];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    const tag = source.slice(open + 1, close);
    index = close + 1;
    if (tag[0] === "/") {
      if (stack.length > 1) {
        stack.pop();
        scopes.pop();
      }
      continue;
    }
    const selfClosing = tag.endsWith("/");
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const nameEnd = body.search(/\s|$/);
    const qname = body.slice(0, nameEnd);
    const raw = [];
    const scope = { ...scopes.at(-1) };
    for (const match of body.slice(nameEnd).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const [, attrName, double, single] = match;
      const value = decodeXml(double ?? single ?? "");
      if (attrName === "xmlns") scope[""] = value;
      else if (attrName.startsWith("xmlns:")) scope[attrName.slice(6)] = value;
      else raw.push([attrName, value]);
    }
    const split = (name) => {
      const colon = name.indexOf(":");
      return colon < 0 ? ["", name] : [name.slice(0, colon), name.slice(colon + 1)];
    };
    const [prefix, local] = split(qname);
    const attrs = {};
    for (const [attrName, value] of raw) {
      const [attrPrefix, attrLocal] = split(attrName);
      attrs[attrPrefix ? `{${scope[attrPrefix] ?? attrPrefix}}${attrLocal}` : attrLocal] = value;
    }
    const element = { name: local, ns: scope[prefix] ?? "", attrs, children: [], text: "" };
    stack.at(-1).children.push(element);
    if (!selfClosing) {
      stack.push(element);
      scopes.push(scope);
    }
  }
  return root;
};

const kids = (element, name) => (element?.children ?? []).filter((child) => child.name === name);
const kid = (element, name) => (element?.children ?? []).find((child) => child.name === name);
const findAll = (element, name, out = []) => {
  for (const child of element?.children ?? []) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
};
const find = (element, name) => findAll(element, name)[0];
const textOf = (element) => (element ? element.text + element.children.map(textOf).join("") : "");
/** A relationship-id attribute (`r:id`, `r:embed`, `r:link`) whatever its prefix. */
const relAttr = (element, local) => {
  for (const [key, value] of Object.entries(element?.attrs ?? {})) {
    if (key.endsWith(`}${local}`) && key.toLowerCase().includes("relationships")) return value;
  }
  return undefined;
};

// -------------------------------------------------------------- xlsx ----

const relsPath = (part) => {
  const dir = path.posix.dirname(part);
  return `${dir === "." ? "" : `${dir}/`}_rels/${path.posix.basename(part)}.rels`;
};
const resolvePart = (fromPart, target) =>
  target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(fromPart), target));

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormat = (id, code) => {
  if (BUILTIN_DATE_FORMATS.has(id)) return true;
  if (!code) return false;
  const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").replace(/[_*]./g, "");
  return /[dmyhs]/i.test(bare);
};

/** Excel date serial → "YYYY-MM-DD" (or "YYYY-MM-DD HH:MM" with a time part). */
export const excelDate = (serial, date1904 = false) => {
  if (!Number.isFinite(serial)) return "";
  // 1900 system: day 1 is 1900-01-01 and Excel counts a 29 February 1900 that never was.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : serial < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const ms = Math.round((epoch + serial * 86400000) / 60000) * 60000;
  const iso = new Date(ms).toISOString();
  return iso.slice(11, 16) === "00:00" ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
};

// Currency signs and words, for prices written with one ("¥5,999", "US$999",
// "5999元") and for number formats ("[$€-407]#,##0.00").
const CURRENCY_WORDS = [
  [/^(?:us\$|usd|美元|美金)$/i, "USD"],
  [/^(?:hk\$|hkd|港币|港元|港幣)$/i, "HKD"],
  [/^(?:nt\$|twd|新台币|新台幣|台币|台幣)$/i, "TWD"],
  [/^(?:s\$|sgd|新加坡元|新币)$/i, "SGD"],
  [/^(?:a\$|aud|澳元|澳币)$/i, "AUD"],
  [/^(?:c\$|cad|加元|加币)$/i, "CAD"],
  [/^(?:r\$|brl)$/i, "BRL"],
  [/^(?:rmb|cny|元|人民币|人民幣|块)$/i, "CNY"],
  [/^(?:€|eur|euro|欧元|歐元)$/i, "EUR"],
  [/^(?:£|gbp|英镑|英鎊)$/i, "GBP"],
  [/^(?:jpy|円|日元|日圓)$/i, "JPY"],
  [/^(?:₩|krw|韩元|韓元|원)$/i, "KRW"],
  [/^(?:₫|vnd|越南盾)$/i, "VND"],
  [/^(?:₹|inr)$/i, "INR"],
  [/^(?:฿|thb|泰铢)$/i, "THB"],
];
const LCID_CURRENCY = { "409": "USD", c04: "HKD", "1004": "SGD", "404": "TWD", c09: "AUD", "1009": "CAD", "804": "CNY", "4": "CNY", "411": "JPY", "412": "KRW", "809": "GBP", "42a": "VND" };

/**
 * The currency a sign or word names, or "" when it does not say. `¥` is CNY in
 * a sheet with Chinese headers and JPY in a Japanese one; a bare `$` names no
 * currency (US, HK, Singapore, Australia… all write it).
 */
const currencyOf = (sign, { lcid = "", language = "" } = {}) => {
  const word = clean(sign).replace(/[.\s]/g, "");
  if (!word) return "";
  for (const [pattern, code] of CURRENCY_WORDS) if (pattern.test(word)) return code;
  if (/^[A-Z]{3}$/.test(word)) return word;
  if (word === "¥" || word === "￥") {
    const fromLcid = LCID_CURRENCY[lcid.toLowerCase()];
    if (fromLcid === "CNY" || fromLcid === "JPY") return fromLcid;
    return language === "zh" ? "CNY" : language === "ja" ? "JPY" : "";
  }
  if (word === "$" && lcid) return LCID_CURRENCY[lcid.toLowerCase()] ?? "";
  return "";
};

const currencyOfFormat = (code, language) => {
  if (!code) return "";
  const bracket = /\[\$([^\]-]*)(?:-([0-9a-f]+))?\]/i.exec(code);
  if (bracket?.[1]) return currencyOf(bracket[1], { lcid: bracket[2] ?? "", language });
  const literal = /"([^"]+)"|(US\$|HK\$|NT\$|S\$|A\$|C\$|R\$|[¥￥€£₩₫₹฿$]|元)/.exec(code);
  return literal ? currencyOf(literal[1] ?? literal[2], { language }) : "";
};

/**
 * An .xlsx workbook → `{ sheets, notes }`. Each sheet is `{ name, hidden, rows,
 * pictures, merges, notes }`; a row is `{ number, cells: Map(column → cell) }`
 * and a cell `{ value, numberFormat? }` with `value` as text the way the sheet
 * shows it (dates as YYYY-MM-DD). `pictures` are `{ row, column, cell, kind,
 * bytes?, ext?, url?, name }`, kind one of `floating`, `in-cell` (Excel's Place
 * in Cell), `wps-in-cell` (WPS's DISPIMG) and `image-formula` (=IMAGE("https://…")).
 */
export const readXlsx = (input) => {
  if ((input?.length ?? input?.byteLength ?? 0) < 22) throw new InputError("this file is empty or too short to be an .xlsx workbook.");
  const head = Buffer.from(input.buffer ? new Uint8Array(input.buffer, input.byteOffset, Math.min(input.byteLength, 8)) : input.subarray(0, 8));
  if (head.readUInt32BE(0) === 0xd0cf11e0) {
    throw new InputError("this is an old .xls file or a password-protected workbook. Open it in Excel or WPS and Save As \"Excel Workbook (.xlsx)\" without a password.");
  }
  if (head.readUInt32LE(0) !== 0x04034b50) throw new InputError("this is not an .xlsx workbook. Save it from Excel or WPS as .xlsx, or as CSV.");
  const zip = readZip(input);
  const text = (part) => {
    const data = part ? zip.read(part) : null;
    return data ? data.toString("utf8").replace(/^﻿/, "") : null;
  };
  const xml = (part) => {
    const source = text(part);
    return source === null ? null : parseXml(source);
  };
  const rels = (part) => {
    const doc = xml(relsPath(part));
    const map = new Map();
    for (const rel of findAll(doc, "Relationship")) {
      const external = (rel.attrs.TargetMode ?? "").toLowerCase() === "external";
      map.set(rel.attrs.Id, { type: rel.attrs.Type ?? "", target: external ? rel.attrs.Target : resolvePart(part, rel.attrs.Target ?? ""), external });
    }
    return map;
  };
  const rootRels = rels("");
  const workbookPart = [...rootRels.values()].find((rel) => rel.type.endsWith("/officeDocument"))?.target ?? "xl/workbook.xml";
  const workbook = xml(workbookPart);
  if (!workbook) {
    if (zip.has("content.xml")) throw new InputError("this looks like an OpenDocument (.ods) file. Save it as .xlsx or CSV.");
    throw new InputError("this .xlsx has no workbook inside. Save it again from Excel or WPS.");
  }
  const date1904 = ["1", "true"].includes(String(find(workbook, "workbookPr")?.attrs?.date1904 ?? "").toLowerCase());
  const workbookRels = rels(workbookPart);
  const relOfType = (suffix, fallback) =>
    [...workbookRels.values()].find((rel) => rel.type.toLowerCase().endsWith(suffix.toLowerCase()))?.target ?? (zip.has(fallback) ? fallback : null);
  const notes = [];

  const sharedStrings = findAll(xml(relOfType("/sharedStrings", "xl/sharedStrings.xml")), "si").map((si) =>
    si.children
      .map((child) => (child.name === "t" ? child.text : child.name === "r" ? kids(child, "t").map((t) => t.text).join("") : ""))
      .join(""),
  );

  const styles = xml(relOfType("/styles", "xl/styles.xml"));
  const formats = new Map(findAll(find(styles, "numFmts"), "numFmt").map((format) => [Number(format.attrs.numFmtId), format.attrs.formatCode ?? ""]));
  const cellFormats = kids(find(styles, "cellXfs"), "xf").map((xf) => {
    const id = Number(xf.attrs.numFmtId ?? 0);
    const code = formats.get(id) ?? "";
    return { date: isDateFormat(id, code), code };
  });

  // Excel's "Place in Cell" pictures: cell vm → valueMetadata → futureMetadata → rich value → richValueRel → media.
  const inCellPicture = (() => {
    const metadata = xml(relOfType("/sheetMetadata", "xl/metadata.xml"));
    if (!metadata) return () => null;
    const types = findAll(find(metadata, "metadataTypes"), "metadataType").map((type) => type.attrs.name);
    const future = kids(findAll(metadata, "futureMetadata").find((element) => element.attrs.name === "XLRICHVALUE"), "bk").map(
      (bk) => find(bk, "rvb")?.attrs?.i,
    );
    const valueMetadata = kids(find(metadata, "valueMetadata"), "bk").map((bk) => kid(bk, "rc")?.attrs ?? {});
    const richValues = kids(find(xml(relOfType("/rdRichValue", "xl/richData/rdrichvalue.xml")), "rvData"), "rv");
    const structures = kids(find(xml(relOfType("/rdRichValueStructure", "xl/richData/rdrichvaluestructure.xml")), "rvStructures"), "s");
    const relPart = relOfType("/richValueRel", "xl/richData/richValueRel.xml");
    const relIds = findAll(xml(relPart), "rel").map((rel) => relAttr(rel, "id"));
    const relTargets = relPart ? rels(relPart) : new Map();
    return (vm) => {
      const rc = valueMetadata[Number(vm) - 1];
      if (!rc || types[Number(rc.t) - 1] !== "XLRICHVALUE") return null;
      const rv = richValues[Number(future[Number(rc.v)])];
      const structure = structures[Number(rv?.attrs?.s)];
      if (!rv || !structure) return null;
      const keys = kids(structure, "k").map((k) => k.attrs.n);
      const at = keys.indexOf("_rvRel:LocalImageIdentifier");
      if (at < 0) return { unsupported: structure.attrs.t ?? "rich value" };
      const target = relTargets.get(relIds[Number(kids(rv, "v")[at]?.text)]);
      return target && !target.external ? { part: target.target } : null;
    };
  })();

  // WPS's in-cell pictures: =DISPIMG("ID_…",1) → xl/cellimages.xml → media.
  const wpsPictures = (() => {
    const part = relOfType("/cellimage", "xl/cellimages.xml");
    const doc = xml(part);
    const map = new Map();
    if (!doc) return map;
    const targets = rels(part);
    for (const pic of findAll(doc, "pic")) {
      const name = find(pic, "cNvPr")?.attrs?.name;
      const target = targets.get(relAttr(find(pic, "blip"), "embed"));
      if (name && target && !target.external) map.set(name, target.target);
    }
    return map;
  })();

  const sheets = [];
  for (const sheet of findAll(find(workbook, "sheets"), "sheet")) {
    const target = workbookRels.get(relAttr(sheet, "id"));
    const name = sheet.attrs.name ?? `Sheet${sheets.length + 1}`;
    const hidden = ["hidden", "veryhidden"].includes(String(sheet.attrs.state ?? "").toLowerCase());
    if (!target || target.external) continue;
    if (!/worksheet$/i.test(target.type)) {
      notes.push(`sheet "${name}" is a chart or dialog sheet, not read`);
      continue;
    }
    const doc = xml(target.target);
    if (!doc) continue;
    const language = (() => {
      const sample = findAll(doc, "c").slice(0, 60).map((c) => (c.attrs.t === "s" ? sharedStrings[Number(textOf(kid(c, "v")))] ?? "" : textOf(c))).join(" ");
      return KANA.test(sample) ? "ja" : HAN.test(sample) ? "zh" : "";
    })();
    const rows = [];
    const pictures = [];
    let rowNumber = 0;
    for (const row of findAll(find(doc, "sheetData"), "row")) {
      rowNumber = row.attrs.r ? Number(row.attrs.r) : rowNumber + 1;
      const cells = new Map();
      let columnNumber = 0;
      for (const c of kids(row, "c")) {
        const ref = parseCellRef(c.attrs.r);
        columnNumber = ref ? ref.column : columnNumber + 1;
        const raw = kid(c, "v")?.text ?? "";
        const formula = textOf(kid(c, "f"));
        const format = cellFormats[Number(c.attrs.s ?? 0)] ?? { date: false, code: "" };
        let value = "";
        switch (c.attrs.t) {
          case "s":
            value = sharedStrings[Number(raw)] ?? "";
            break;
          case "inlineStr":
            value = kids(kid(c, "is"), "t").map((t) => t.text).join("") + kids(kid(c, "is"), "r").map((r) => kids(r, "t").map((t) => t.text).join("")).join("");
            break;
          case "str":
            value = raw;
            break;
          case "b":
            value = raw === "1" ? "TRUE" : "FALSE";
            break;
          case "e":
            value = "";
            break;
          case "d":
            value = raw.slice(0, 10);
            break;
          default:
            value = raw === "" ? "" : format.date ? excelDate(Number(raw), date1904) : formatNumber(Number(raw));
        }
        const cellRef = `${columnLetter(columnNumber)}${rowNumber}`;
        if (c.attrs.vm) {
          const found = inCellPicture(c.attrs.vm);
          if (found?.part) pictures.push({ row: rowNumber, column: columnNumber, cell: cellRef, kind: "in-cell", part: found.part });
          else if (found?.unsupported) notes.push(`${name}!${cellRef}: a ${found.unsupported} value Excel keeps in the cell, not a picture this importer can read`);
          value = "";
        }
        const dispimg = /DISPIMG\(\s*"([^"]+)"/i.exec(formula) ?? /DISPIMG\(\s*"([^"]+)"/i.exec(value);
        if (dispimg) {
          const part = wpsPictures.get(dispimg[1]);
          if (part) pictures.push({ row: rowNumber, column: columnNumber, cell: cellRef, kind: "wps-in-cell", part });
          else notes.push(`${name}!${cellRef}: a WPS picture (${dispimg[1]}) that is not inside the file`);
          value = "";
        }
        const imageFormula = /^(?:_xlfn\.)?IMAGE\(\s*"(https?:\/\/[^"]+)"/i.exec(formula);
        if (imageFormula) {
          pictures.push({ row: rowNumber, column: columnNumber, cell: cellRef, kind: "image-formula", url: imageFormula[1] });
          value = "";
        }
        if (value !== "") cells.set(columnNumber, { value, ...(format.code && !format.date && format.code !== "General" ? { numberFormat: format.code } : {}) });
      }
      rows.push({ number: rowNumber, cells });
    }

    const merges = findAll(find(doc, "mergeCells"), "mergeCell")
      .map((merge) => {
        const [from, to] = String(merge.attrs.ref ?? "").split(":").map(parseCellRef);
        return from && to ? { ref: merge.attrs.ref, from, to } : null;
      })
      .filter(Boolean);

    // Floating pictures: the drawing part, each anchored to the cell its top-left corner is in.
    const sheetRels = rels(target.target);
    for (const drawingRef of findAll(doc, "drawing")) {
      const drawing = sheetRels.get(relAttr(drawingRef, "id"));
      if (!drawing || drawing.external) continue;
      const drawingDoc = xml(drawing.target);
      const drawingRels = rels(drawing.target);
      const rowHeights = new Map(findAll(find(doc, "sheetData"), "row").filter((row) => row.attrs.ht).map((row) => [Number(row.attrs.r), Number(row.attrs.ht)]));
      const defaultHeight = Number(find(doc, "sheetFormatPr")?.attrs?.defaultRowHeight ?? 15) || 15;
      const heightOf = (row) => (rowHeights.get(row) ?? defaultHeight) * 12700; // points → EMU
      // The row a picture belongs to: the one its top edge is in, unless that
      // edge is in the lower half of the row, which is what a picture placed on
      // the next row looks like after another program re-measured the rows.
      const rowFor = (row, offset) => (offset > heightOf(row) / 2 ? row + 1 : row);
      const rowAt = (emu) => {
        let top = 0;
        for (let row = 1; row < 1048576; row += 1) {
          if (top + heightOf(row) > emu) return rowFor(row, emu - top);
          top += heightOf(row);
        }
        return 1;
      };
      const picsIn = (element, out = []) => {
        for (const child of element.children) {
          if (child.name === "AlternateContent") {
            const branch = kids(child, "Choice").find((choice) => findAll(choice, "pic").length) ?? kid(child, "Fallback");
            if (branch) picsIn(branch, out);
          } else if (child.name === "pic") out.push(child);
          else picsIn(child, out);
        }
        return out;
      };
      for (const anchor of drawingDoc?.children[0]?.children ?? []) {
        if (!["twoCellAnchor", "oneCellAnchor", "absoluteAnchor"].includes(anchor.name)) continue;
        const from = kid(anchor, "from");
        const rowNumberOf = from
          ? rowFor(Number(textOf(kid(from, "row"))) + 1, Number(textOf(kid(from, "rowOff"))) || 0)
          : rowAt(Number(kid(anchor, "pos")?.attrs?.y ?? 0));
        const columnOf = from ? Number(textOf(kid(from, "col"))) + 1 : 0;
        for (const pic of picsIn(anchor)) {
          const blip = find(pic, "blip");
          const label = find(pic, "cNvPr")?.attrs?.descr || find(pic, "cNvPr")?.attrs?.name || "picture";
          const cellRef = columnOf ? `${columnLetter(columnOf)}${rowNumberOf}` : `row ${rowNumberOf}`;
          const embedded = drawingRels.get(relAttr(blip, "embed"));
          if (embedded && !embedded.external) {
            pictures.push({ row: rowNumberOf, column: columnOf, cell: cellRef, kind: "floating", part: embedded.target, name: label });
          } else if (relAttr(blip, "link")) {
            notes.push(`${name}!${cellRef}: picture "${label}" is linked to a file on the author's computer, not inside the workbook. Insert it again (not as a link)`);
          }
        }
      }
    }
    for (const picture of pictures) {
      if (!picture.part) continue;
      picture.bytes = zip.read(picture.part);
      picture.ext = path.posix.extname(picture.part).toLowerCase();
      delete picture.part;
    }
    sheets.push({ name, hidden, rows, pictures: pictures.filter((picture) => picture.bytes || picture.url), merges, notes: [], language });
  }
  return { sheets, notes };
};

// ----------------------------------------------------- column names ----

/** A header as it is compared: NFKC (full-width → plain), lower case, no spaces, `_`, `-`, `.`, `:` or `*`. */
const squash = (text) =>
  String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-.:·•*#]+/g, "");

// [target, aliases…]. A target is { field }, { attribute } or { certificate }.
const PRODUCT_COLUMNS = [
  [{ ignore: "row numbers" }, "序号", "行号", "row number", "row no"],
  [{ field: "product_id" }, "product_id", "product id", "productid", "id", "商品编号", "商品id", "产品编号", "产品id", "编号", "商品代码", "产品代码", "handle", "slug", "item id"],
  [{ field: "sku" }, "sku", "货号", "商品货号", "sku编码", "sku编号", "款号", "物料编码", "物料号", "item no", "item number", "art no", "article number", "part number", "mpn"],
  [{ field: "name" }, "name", "product name", "product title", "title", "名称", "商品名称", "产品名称", "品名", "商品名", "产品名", "商品标题", "标题", "商品"],
  [{ field: "model" }, "model", "model name", "型号", "机型", "产品型号", "商品型号", "规格型号"],
  [{ field: "subtitle" }, "subtitle", "tagline", "short description", "副标题", "短描述", "一句话介绍"],
  [{ field: "category" }, "category", "product type", "类目", "分类", "类别", "商品分类", "品类", "商品类目", "产品分类", "类型"],
  [{ field: "lifecycle" }, "lifecycle", "生命周期", "阶段", "产品阶段"],
  [{ field: "status" }, "status", "状态", "商品状态", "上架状态", "销售状态"],
  [{ field: "price" }, "price", "selling price", "retail price", "sale price", "unit price", "msrp", "rrp", "售价", "价格", "零售价", "销售价", "单价", "建议零售价", "定价", "现价", "标价", "销售价格", "零售价格"],
  [{ field: "currency" }, "currency", "币种", "货币", "币别", "币制", "结算币种"],
  [{ field: "cogs" }, "cost", "unit cost", "cogs", "purchase price", "factory price", "成本", "进价", "采购价", "成本价", "进货价", "出厂价", "采购成本"],
  [{ field: "landed_cost" }, "landed_cost", "landed cost", "到岸成本", "落地成本", "到岸价"],
  [{ field: "stock_available" }, "stock_available", "stock", "inventory", "qty", "quantity available", "available", "on hand", "库存", "库存数量", "可用库存", "现货", "现货库存", "可售库存"],
  [{ field: "vendor" }, "vendor", "supplier", "manufacturer", "供应商", "厂家", "生产厂家", "制造商", "工厂", "生产商"],
  [{ field: "image" }, "image_file", "image", "image url", "image link", "main image", "picture", "photo", "主图", "图片", "图片链接", "主图链接", "图片地址", "图片url", "图片网址", "照片", "产品图片", "商品图片", "封面", "封面图", "商品主图"],
  [{ field: "gallery" }, "gallery_files", "gallery", "images", "photos", "more images", "additional images", "图集", "附图", "副图", "详情图", "更多图片", "其他图片", "多图"],
  [{ field: "tags" }, "tags", "keywords", "标签", "关键词", "关键字"],
  [{ field: "description" }, "description", "details", "描述", "商品描述", "产品描述", "详情", "商品详情", "产品详情", "介绍", "产品介绍", "商品介绍", "简介"],
  [{ field: "bullets" }, "bullets", "highlights", "features", "key features", "selling points", "卖点", "亮点", "特点", "产品特点", "商品卖点", "核心卖点"],
  [{ field: "source" }, "source", "data source", "来源", "数据来源", "资料来源", "出处", "信息来源"],
  [{ field: "launch_date" }, "launch_date", "launch date", "release date", "上市日期", "上市时间", "发布日期", "发售日期"],
  [{ field: "owner" }, "owner", "负责人"],
  [{ attribute: "brand" }, "brand", "品牌", "牌子"],
  [{ attribute: "color" }, "color", "colour", "颜色", "配色", "颜色分类", "色彩"],
  [{ attribute: "memory" }, "memory", "ram", "内存", "运行内存", "运存"],
  [{ attribute: "storage" }, "storage", "rom", "storage capacity", "存储", "存储容量", "机身存储", "机身内存", "存储空间"],
  [{ attribute: "screen" }, "screen", "screen size", "display", "屏幕", "屏幕尺寸", "显示屏", "屏幕规格", "屏幕大小", "屏幕参数"],
  [{ attribute: "battery" }, "battery", "battery capacity", "电池", "电池容量"],
  [{ attribute: "camera" }, "camera", "cameras", "摄像头", "相机", "后置摄像头", "主摄", "像素"],
  [{ attribute: "processor" }, "processor", "chip", "chipset", "cpu", "soc", "处理器", "芯片", "cpu型号"],
  [{ attribute: "os" }, "os", "operating system", "系统", "操作系统"],
  [{ attribute: "network" }, "network", "网络", "网络制式", "网络类型"],
  [{ attribute: "specs" }, "specs", "spec", "specifications", "specification", "规格", "规格参数", "参数", "技术参数", "产品参数"],
  [{ attribute: "gtin" }, "gtin", "ean", "upc", "barcode", "条码", "条形码", "商品条码", "69码"],
  [{ attribute: "age_grade" }, "age_grade", "age", "age grade", "适用年龄", "年龄"],
  [{ attribute: "materials" }, "materials", "material", "材质", "材料", "面料"],
  [{ attribute: "batteries" }, "batteries", "battery type", "电池规格", "电池型号", "所需电池"],
  [{ attribute: "dimensions" }, "dimensions", "size", "尺寸", "产品尺寸", "外观尺寸", "长宽高", "规格尺寸"],
  [{ attribute: "weight" }, "weight", "net weight", "重量", "净重", "产品重量"],
  [{ attribute: "carton_qty", number: true }, "carton_qty", "carton qty", "pcs/ctn", "装箱数", "箱规", "每箱数量", "装箱量"],
  [{ attribute: "moq", number: true }, "moq", "minimum order", "minimum order quantity", "起订量", "最小起订量", "起批量", "最低起订量"],
  [{ attribute: "lead_time_days", number: true }, "lead_time_days", "lead time", "lead time days", "交期", "交货期", "生产周期", "货期", "交货周期"],
  [{ attribute: "hs_code" }, "hs_code", "hs code", "hs", "海关编码", "hs编码", "税号"],
  [{ attribute: "country_of_origin" }, "country_of_origin", "country of origin", "origin", "原产地", "产地", "原产国"],
  [{ attribute: "warranty" }, "warranty", "保修", "质保", "保修期", "质保期", "保修政策"],
  [{ attribute: "returns" }, "returns", "return policy", "退货", "退换货", "退货政策", "退换政策"],
];

const CERTIFICATE_COLUMNS = [
  [{ field: "product_id" }, "product_id", "product id", "商品编号", "商品id", "产品编号", "产品id"],
  [{ field: "sku" }, "sku", "货号", "商品货号"],
  [{ field: "name" }, "name", "product", "product name", "名称", "商品名称", "产品名称", "品名", "商品", "型号", "model"],
  [{ field: "cert_type" }, "cert_type", "cert type", "certificate type", "certification", "type", "认证类型", "证书类型", "认证", "类型", "认证名称"],
  [{ field: "cert_number" }, "cert_number", "cert number", "certificate number", "cert no", "certificate no", "number", "no", "report no", "report number", "证书编号", "编号", "认证编号", "证书号", "报告编号", "证书号码"],
  [{ field: "issuer" }, "issuer", "issued by", "lab", "test lab", "notified body", "发证机构", "机构", "认证机构", "检测机构", "实验室", "颁发机构"],
  [{ field: "issued_date" }, "issued_date", "issued", "issue date", "date of issue", "发证日期", "签发日期", "颁发日期", "发证时间"],
  [{ field: "expiry_date" }, "expiry_date", "expiry", "expires", "expiry date", "expiration date", "valid until", "valid to", "到期日期", "有效期至", "有效期", "截止日期", "失效日期", "到期时间", "有效期限"],
  [{ field: "note" }, "note", "notes", "remark", "source", "data source", "备注", "说明", "来源", "数据来源", "资料来源", "出处"],
];

const aliasMap = (table) => {
  const map = new Map();
  for (const [target, ...aliases] of table) for (const alias of aliases) if (!map.has(squash(alias))) map.set(squash(alias), target);
  return map;
};
const PRODUCT_ALIASES = aliasMap(PRODUCT_COLUMNS);
const CERTIFICATE_ALIASES = aliasMap(CERTIFICATE_COLUMNS);

// The product hub's certificate types, and how people write them.
const CERTIFICATE_TYPES = [
  ["CE", /^ce$/],
  ["FCC", /^fcc$/],
  ["RoHS", /^rohs$/],
  ["UN38.3", /^un383$/],
  ["UKCA", /^ukca$/],
  ["EN 71", /^en71$/],
  ["ASTM F963", /^astmf963$/],
  ["CPSIA / CPC", /^(?:cpsia\/?cpc|cpsia|cpc|cpcpsia|cpsiacpc)$/],
];
const CERT_SUFFIX = /(?:id|编号|证书编号|证书号|证书|认证编号|认证|号|号码|number|no|certificate|cert|certno|certificateno)$/;

/** "EN71" → "EN 71", "FCC ID" → "FCC", "CE认证" → "CE"; anything else as written. */
export const canonicalCertType = (text) => {
  const raw = clean(text);
  const squashed = squash(raw).replace(/[()（）]/g, "");
  for (const candidate of [squashed, squashed.replace(CERT_SUFFIX, "")]) {
    for (const [name, pattern] of CERTIFICATE_TYPES) if (pattern.test(candidate)) return name;
  }
  return raw;
};

const certificateColumnType = (header) => {
  const squashed = squash(header).replace(/[()（）]/g, "");
  const stripped = squashed.replace(CERT_SUFFIX, "");
  if (stripped === squashed && !CERTIFICATE_TYPES.some(([, pattern]) => pattern.test(squashed))) return null;
  for (const [name, pattern] of CERTIFICATE_TYPES) if (pattern.test(stripped) || pattern.test(squashed)) return name;
  return null;
};

const REQUIRED_MARK = /^(?:必填|选填|可选|非必填|required|optional|必须)$/i;

/**
 * How one header is read: `{ target, hint }`, `hint` being what its brackets
 * say (a currency for a price, a unit for a detail). Bilingual headers
 * ("售价 Price", "名称/Name") match on either half.
 */
export const readHeader = (header, aliases = PRODUCT_ALIASES, { certificates = aliases === PRODUCT_ALIASES } = {}) => {
  const original = clean(String(header ?? "").normalize("NFKC"));
  const hints = [];
  const base = original.replace(/[(\[【]([^)\]】]*)[)\]】]/g, (match, inner) => {
    if (!REQUIRED_MARK.test(clean(inner))) hints.push(clean(inner));
    return " ";
  });
  const candidates = [base, ...base.split(/[/|\n]+/), ...base.split(/(?<=[\p{Script=Han}])\s*(?=[A-Za-z])|(?<=[A-Za-z)])\s*(?=[\p{Script=Han}])/u)]
    .map((part) => squash(part))
    .filter(Boolean);
  const hint = hints[0] ?? "";
  for (const candidate of candidates) {
    const target = aliases.get(candidate);
    if (target) return { target, hint };
  }
  for (const candidate of candidates) {
    // "图片1", "图片 2", "Image 3": a numbered picture column.
    const target = aliases.get(candidate.replace(/\d+$/, ""));
    if (target?.field === "image" || target?.field === "gallery") return { target, hint };
  }
  if (certificates) {
    for (const candidate of [original, ...base.split(/[/|\n]+/)]) {
      const type = certificateColumnType(candidate);
      if (type) return { target: { certificate: type }, hint };
    }
  }
  return { target: null, hint };
};

const STATUS_WORDS = [
  [/^(?:active|在售|上架|已上架|销售中|启用|正常|有效|on ?sale|for ?sale)$/i, "active"],
  [/^(?:approved|已审核|已批准|审核通过)$/i, "approved"],
  [/^(?:live|已发布|已上线)$/i, "live"],
  [/^(?:draft|草稿|未上架|未发布|待上架)$/i, "draft"],
  [/^(?:needs_review|needs review|待审核|待审|审核中)$/i, "needs_review"],
  [/^(?:blocked|下架|已下架|停售|禁用|禁售)$/i, "blocked"],
];
const LIFECYCLE_WORDS = [
  [/^(?:active|在售|正常|销售中|常规)$/i, "active"],
  [/^(?:launch|新品|即将上市|首发|上新)$/i, "launch"],
  [/^(?:test|测试|试销)$/i, "test"],
  [/^(?:archive|archived|停产|退市|归档|淘汰)$/i, "archive"],
];
/** "在售 active" → "active"; a word the table does not use is kept, lower-cased. */
const codeWord = (value, table) => {
  const raw = clean(value);
  if (!raw) return { code: "", known: true };
  for (const part of [raw, ...raw.split(/[\s/|,，]+/)]) {
    for (const [pattern, code] of table) if (pattern.test(part.trim())) return { code, known: true };
  }
  return { code: raw.toLowerCase(), known: false };
};

const YES = /^(?:yes|y|true|是|有|已有|已认证|已通过|通过|✓|✔|√|ok)$/i;
const NO = /^(?:no|n|false|否|无|没有|未认证|-|—|n\/a|na)$/i;

/**
 * A price as written → `{ amount, currency }`: 5999, "5,999.00", "¥5999",
 * "5999元", "US$ 999", "999 USD". `amount` is null when it is not one number.
 */
export const parseMoney = (value, { language = "", numberFormat = "" } = {}) => {
  const raw = clean(value).replace(/\s*(?:\/|每)\s*(?:台|件|个|部|只|套|pcs?|units?|ea|piece)$/i, "");
  if (!raw) return { amount: null, currency: "" };
  const match = /^([^\d\s.,-]*)\s*(-?[\d,，]*\.?\d+)\s*([^\d\s.,]*)$/.exec(raw.replace(/\s+(?=\d)/g, "").replace(/(?<=\d)\s+(?=[^\d\s])/g, ""));
  if (!match) return { amount: null, currency: "" };
  const amount = Number(match[2].replace(/[,，]/g, ""));
  const sign = match[1] || match[3];
  const currency = sign ? currencyOf(sign, { language }) : currencyOfFormat(numberFormat, language);
  if (sign && !currency && !/^\$$/.test(sign) && !/^[¥￥]$/.test(sign)) return { amount: null, currency: "" };
  return { amount: Number.isFinite(amount) ? amount : null, currency };
};

/** A count as written → number or null: 200, "1,200", "200台", "200 pcs"; "缺货"/"sold out" → 0. */
const parseCount = (value) => {
  const raw = clean(value);
  if (!raw) return { amount: null };
  if (/^(?:缺货|售罄|无货|断货|sold ?out|out of stock)$/i.test(raw)) return { amount: 0 };
  const match = /^(-?[\d,，]*\.?\d+)\s*(?:台|件|个|部|只|套|盒|箱|pcs?|units?|pieces?|天|days?|d)?$/i.exec(raw);
  if (!match) return { amount: null };
  const amount = Number(match[1].replace(/[,，]/g, ""));
  return { amount: Number.isFinite(amount) ? amount : null };
};

/** A date as written → "YYYY-MM-DD" or "" (unclear: 10/04/2027 could be April or October). */
export const parseDate = (value) => {
  const raw = clean(value);
  const match = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:[ T].*)?$/.exec(raw);
  if (!match) return "";
  const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
};

const splitList = (value, separators = /\s*[|\n]\s*/) =>
  String(value ?? "")
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);

/** Picture references in a cell: links and file names, several separated by |, ;, commas or new lines. */
const pictureRefs = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (/https?:\/\//i.test(raw)) return raw.split(/[\s|,;，；、]+/).map((item) => item.trim()).filter(Boolean);
  return splitList(raw, /\s*[|\n;,，；、]\s*/);
};

const slug = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A product ID made from text that is not one: ASCII kept, anything else gets a short stable hash. */
const idFrom = (text) => {
  const ascii = slug(text).slice(0, 60).replace(/-+$/, "");
  const hasOther = /[^\x00-\x7f]/.test(String(text ?? ""));
  const hash = createHash("sha256").update(clean(text).toLowerCase()).digest("hex").slice(0, 6);
  if (!ascii) return `p-${hash}`;
  return hasOther ? `${ascii}-${hash}` : ascii;
};

// -------------------------------------------------- finding the table ----

const KEY_FIELDS = new Set(["name", "model", "product_id", "sku"]);

/**
 * Where the header row is and what each column means. Looks at the first 20
 * rows and takes the first that names at least two known product columns,
 * one of them a name, model, ID or SKU (a title row above it is fine).
 */
const findHeader = (sheet, aliases, isKey) => {
  for (const row of sheet.rows.slice(0, 20)) {
    const read = [...row.cells.entries()]
      .map(([column, cell]) => ({ column, header: clean(cell.value), ...readHeader(cell.value, aliases) }))
      .filter((item) => item.header);
    const known = read.filter((item) => item.target);
    if (known.length >= 2 && known.some((item) => isKey(item.target))) return { row: row.number, columns: read };
  }
  return null;
};

export const findProductTable = (sheet) => findHeader(sheet, PRODUCT_ALIASES, (target) => KEY_FIELDS.has(target.field));
export const findCertificateTable = (sheet) =>
  findHeader(sheet, CERTIFICATE_ALIASES, (target) => target.field === "cert_number") ?? null;

/** Merged cells: the value the top-left cell shows, on every row of the range below the header. */
const fillMerges = (sheet, headerRow, notes) => {
  for (const { ref, from, to } of sheet.merges) {
    const top = sheet.rows.find((row) => row.number === from.row)?.cells.get(from.column);
    if (!top || to.row <= headerRow || (from.row === to.row && from.column === to.column)) continue;
    let filled = 0;
    for (let rowNumber = Math.max(from.row, headerRow + 1); rowNumber <= to.row; rowNumber += 1) {
      let row = sheet.rows.find((candidate) => candidate.number === rowNumber);
      if (!row) {
        row = { number: rowNumber, cells: new Map() };
        sheet.rows.push(row);
        sheet.rows.sort((a, b) => a.number - b.number);
      }
      for (let column = from.column; column <= to.column; column += 1) {
        if (!row.cells.has(column)) {
          row.cells.set(column, { ...top });
          filled += 1;
        }
      }
    }
    if (filled && from.row > headerRow && to.row > from.row) notes.push(`merged cells ${ref}: "${clean(top.value).slice(0, 40)}" read on rows ${from.row}–${to.row}`);
  }
};

// ----------------------------------------------------------- planning ----

const columnLabel = (sheet, column) => (sheet.csv ? `column ${column}` : columnLetter(column));

/**
 * The product sheet → `{ rows, columns, headerRow, notes }`. A row is
 * `{ __line, __cells }` plus one key per canonical field, `__attributes`,
 * `__certificates` and `__pictures`. `columns` says how each header was read,
 * for the preview.
 */
export const readProductSheet = (sheet) => {
  const notes = [];
  const header = findProductTable(sheet);
  if (!header) return null;
  fillMerges(sheet, header.row, notes);
  const seen = new Map();
  const columns = header.columns.map((column) => {
    const out = { ...column, letter: columnLabel(sheet, column.column) };
    const { target } = column;
    if (!target) out.as = { attribute: column.header };
    else if (target.field && !["image", "gallery"].includes(target.field) && seen.has(target.field)) {
      out.as = { attribute: column.header };
      out.duplicateOf = seen.get(target.field);
    } else {
      out.as = target;
      if (target.field) seen.set(target.field, out.letter);
    }
    return out;
  });
  const names = columns.filter((column) => column.as.field === "name").length;
  for (const column of columns) {
    // 型号/Model is the name when there is no name column, otherwise a detail.
    if (column.as.field === "model") column.as = names ? { attribute: "model" } : { field: "name", fromModel: true };
  }
  const byColumn = new Map(columns.map((column) => [column.column, column]));
  const hasIdColumn = columns.some((column) => column.as.field === "product_id");
  const headerless = new Map();
  const rows = [];
  const used = new Set();
  // A picture on a row with no cells (a row Excel does not even write down) is still read, and reported.
  const known = new Set(sheet.rows.map((row) => row.number));
  const pictureRows = sheet.pictures.filter((picture) => picture.row > header.row && !known.has(picture.row)).map((picture) => picture.row);
  const allRows = [...sheet.rows, ...[...new Set(pictureRows)].map((number) => ({ number, cells: new Map() }))].sort((a, b) => a.number - b.number);
  for (const row of allRows) {
    if (row.number <= header.row) continue;
    const pictures = sheet.pictures.filter((picture) => picture.row === row.number);
    if (!row.cells.size && !pictures.length) continue;
    for (const picture of pictures) used.add(picture);
    const out = { __line: row.number, __hasIdColumn: hasIdColumn, __cells: {}, __attributes: {}, __certificates: [], __pictures: [], __imageRefs: [], __galleryRefs: [] };
    for (const [columnNumber, cell] of row.cells) {
      const column = byColumn.get(columnNumber);
      if (!column) {
        const list = headerless.get(columnNumber) ?? [];
        list.push(`${columnLabel(sheet, columnNumber)}${sheet.csv ? ` line ${row.number}` : row.number}`);
        headerless.set(columnNumber, list);
        continue;
      }
      const value = String(cell.value ?? "").trim();
      if (!value) continue;
      const { as } = column;
      if (as.ignore) continue;
      if (as.field === "image") out.__imageRefs.push(...pictureRefs(value));
      else if (as.field === "gallery") out.__galleryRefs.push(...pictureRefs(value));
      else if (as.field) {
        out[as.field] = value;
        out.__cells[as.field] = { ...cell, hint: column.hint };
      } else if (as.attribute) {
        out.__attributes[as.attribute] = { value, hint: column.target ? column.hint : "", number: Boolean(as.number), header: column.header };
      } else if (as.certificate) out.__certificates.push({ type: as.certificate, value, header: column.header });
    }
    for (const picture of pictures.sort((a, b) => a.column - b.column)) {
      const column = byColumn.get(picture.column);
      out.__pictures.push({ ...picture, gallery: column?.as?.field === "gallery" });
    }
    rows.push(out);
  }
  for (const [columnNumber, cells] of headerless) {
    notes.push(`${columnLabel(sheet, columnNumber)} has values but no header (${cells.slice(0, 4).join(", ")}${cells.length > 4 ? ", …" : ""}): left out. Give the column a header to import it.`);
  }
  for (const picture of sheet.pictures) {
    if (used.has(picture)) continue;
    notes.push(
      picture.row <= header.row
        ? `a picture at ${picture.cell} is above the product rows (row ${picture.row}), left out`
        : `a picture at ${picture.cell} is on an empty row, left out. Move it into its product's row`,
    );
  }
  return { rows, columns, headerRow: header.row, notes, language: sheet.language ?? "" };
};

/** The same, for rows that are already objects keyed by header (`parseCsv`). */
const rowsToSheet = (rows) => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("__"))))];
  return {
    name: "CSV",
    csv: true,
    rows: [
      { number: 1, cells: new Map(headers.map((header, index) => [index + 1, { value: header }])) },
      ...rows.map((row, index) => ({
        number: row.__line ?? index + 2,
        cells: new Map(headers.map((header, column) => [column + 1, { value: String(row[header] ?? "").trim() }]).filter(([, cell]) => cell.value !== "")),
      })),
    ],
    pictures: [],
    merges: [],
  };
};

const attributeValue = ({ value, hint, number: numeric }) => {
  if (numeric) {
    const { amount } = parseCount(value);
    if (amount !== null) return { value: amount };
    return { value, note: `"${value}" is not a number` };
  }
  // A unit in the header goes with a bare number: 重量(kg) 0.2 → "0.2 kg".
  if (hint && /^-?\d+(?:\.\d+)?$/.test(value) && !currencyOf(hint)) return { value: `${value} ${hint}` };
  return { value };
};

/**
 * What each catalogue row says, before anything is read from Busabase.
 * `rows` are objects keyed by header (`parseCsv`) or `readProductSheet(sheet).rows`.
 * Returns `{ products, skipped, notes }`; a product is `{ productId, line, idFrom,
 * text, price, priceText, cogs, landedCost, currency, currencyFrom, available,
 * attributes, tags, description, bullets, imageRefs, pictures, certificates,
 * source, fill }`.
 */
export const planProducts = (rows, { language = "", source = "", sourceLabel = "", fill = {}, lineLabel = (line) => `line ${line}` } = {}) => {
  const mapped = rows.length && !("__attributes" in rows[0]) ? readProductSheet(rowsToSheet(rows))?.rows ?? [] : rows;
  const products = [];
  const skipped = [];
  const notes = [];
  const seen = new Map();
  for (const row of mapped) {
    const where = lineLabel(row.__line);
    let id = clean(row.product_id);
    let idFromWhat = "column";
    if (id === TEMPLATE_EXAMPLE_ID) {
      skipped.push({ kind: "product", key: id, reason: `${where}: the template's example row (delete it when you add your own products)` });
      continue;
    }
    const onlyPictures = row.__pictures.length && !Object.keys(row.__cells).length && !Object.keys(row.__attributes).length && !row.__imageRefs.length;
    if (onlyPictures) {
      notes.push(`a picture at ${row.__pictures.map((picture) => picture.cell).join(", ")} is on ${where}, which has no product: left out. If it belongs to the row above, move it into that row`);
      continue;
    }
    if (!row.__hasIdColumn) {
      if (row.sku) {
        id = PRODUCT_ID_PATTERN.test(clean(row.sku)) ? clean(row.sku) : idFrom(row.sku);
        idFromWhat = "sku";
      } else if (row.name) {
        // Variant columns tell rows of one model apart; a model already in the name adds nothing.
        const variant = ["model", "storage", "memory", "color"]
          .map((key) => row.__attributes[key]?.value)
          .filter((value) => value && !clean(row.name).toLowerCase().includes(clean(value).toLowerCase()));
        id = idFrom([row.name, ...variant].join(" "));
        idFromWhat = variant.length ? "name and variant" : "name";
      } else {
        skipped.push({ kind: "product", key: where, reason: `${where}: no name` });
        continue;
      }
    }
    if (!PRODUCT_ID_PATTERN.test(id)) {
      skipped.push({ kind: "product", key: id || where, reason: `${where}: product_id "${id}" is missing or not usable in a web address` });
      continue;
    }
    if (!clean(row.name)) {
      skipped.push({ kind: "product", key: id, reason: `${where}: no name` });
      continue;
    }
    if (seen.has(id)) {
      skipped.push({ kind: "product", key: id, reason: `${where}: product_id appears twice (also ${seen.get(id)}); the first row was used${idFromWhat === "column" ? "" : `. The ID was made from the ${idFromWhat}: add a product ID or SKU column to tell these rows apart`}` });
      continue;
    }
    seen.set(id, where);

    const priceCell = row.__cells.price ?? {};
    const money = parseMoney(row.price, { language, numberFormat: priceCell.numberFormat });
    const price = money.amount;
    let currency = "";
    let currencyFrom = "";
    const currencyCell = codeCurrency(row.currency);
    if (row.currency && !currencyCell) notes.push(`${id}: currency "${row.currency}" is not a 3-letter code, left out`);
    if (currencyCell) [currency, currencyFrom] = [currencyCell, "column"];
    else if (money.currency) [currency, currencyFrom] = [money.currency, "price cell"];
    else if (priceCell.hint && currencyOf(priceCell.hint, { language })) [currency, currencyFrom] = [currencyOf(priceCell.hint, { language }), "price header"];
    if (row.price && price === null) notes.push(`${id}: price "${row.price}" is not a number, left out`);
    if (price === null) notes.push(`${id}: no price in the list, so the shop will not list it`);
    const cost = (key) => {
      if (!row[key]) return null;
      const parsed = parseMoney(row[key], { language, numberFormat: row.__cells[key]?.numberFormat }).amount;
      if (parsed === null) notes.push(`${id}: ${key === "cogs" ? "cost" : "landed cost"} "${row[key]}" is not a number, left out`);
      return parsed;
    };
    const stock = parseCount(row.stock_available);
    if (row.stock_available && stock.amount === null) notes.push(`${id}: stock "${row.stock_available}" is not a number, left out (stock stays unknown)`);

    const attributes = {};
    for (const [key, entry] of Object.entries(row.__attributes)) {
      const { value, note } = attributeValue(entry);
      attributes[key] = value;
      if (note) notes.push(`${id}: ${entry.header} ${note}, kept as written`);
    }
    const certificates = [];
    for (const { type, value, header } of row.__certificates) {
      if (NO.test(value)) continue;
      certificates.push({ productId: id, type, number: YES.test(value) ? "" : value, header, line: row.__line });
    }
    const status = codeWord(row.status, STATUS_WORDS);
    const lifecycle = codeWord(row.lifecycle, LIFECYCLE_WORDS);
    if (!status.known) notes.push(`${id}: status "${row.status}" is not one the shop lists (active, approved, live), kept as written`);
    if (!lifecycle.known) notes.push(`${id}: lifecycle "${row.lifecycle}" is not one the shop lists (active, launch), kept as written`);
    const launch = row.launch_date ? parseDate(row.launch_date) : "";
    if (row.launch_date && !launch) notes.push(`${id}: launch date "${row.launch_date}" is not YYYY-MM-DD, left out`);

    const imageRefs = [...row.__imageRefs, ...row.__galleryRefs];
    const pictures = [...row.__pictures.filter((picture) => !picture.gallery), ...row.__pictures.filter((picture) => picture.gallery)];
    if (!imageRefs.length && !pictures.length) notes.push(`${id}: no photo in the list`);
    products.push({
      productId: id,
      line: row.__line,
      where,
      idFrom: idFromWhat,
      text: {
        sku: clean(row.sku),
        name: clean(row.name),
        subtitle: clean(row.subtitle),
        category: clean(row.category),
        lifecycle: lifecycle.code,
        status: status.code,
        vendor: clean(row.vendor),
        owner: clean(row.owner),
        "launch-date": launch,
      },
      price,
      priceText: clean(row.price),
      cogs: cost("cogs"),
      landedCost: cost("landed_cost"),
      currency,
      currencyFrom,
      available: stock.amount,
      attributes,
      tags: splitList(row.tags, /\s*[|\n,，、;；]\s*/),
      description: String(row.description ?? "").trim(),
      bullets: splitList(row.bullets),
      imageRefs,
      pictures,
      certificates,
      source: clean(row.source) || source || sourceLabel,
      fill,
    });
  }
  return { products, skipped, notes };
};

/** A currency cell → its 3-letter code ("人民币" → CNY), or "" when it is not one. */
const codeCurrency = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  return currencyOf(raw) || (/^[A-Z]{3}$/i.test(raw) ? raw.toUpperCase() : "");
};

/**
 * Certificate rows (objects keyed by header, or `readCertificateSheet` rows with
 * `product_id` resolved) → `{ certificates, skipped }`; a certificate is
 * `{ productId, line, type, issuer, number, issued, expiry, badExpiry }`.
 */
export const planCertificates = (rows, productIds, { lineLabel = (line) => `line ${line}` } = {}) => {
  const certificates = [];
  const skipped = [];
  for (const row of rows) {
    const where = lineLabel(row.__line);
    const type = canonicalCertType(row.cert_type);
    const key = `${row.product_id ?? ""} ${type} ${row.cert_number ?? ""}`.trim();
    if (row.product_id === TEMPLATE_EXAMPLE_ID) {
      skipped.push({ kind: "certificate", key, reason: `${where}: the template's example row` });
      continue;
    }
    if (row.__unresolved) {
      skipped.push({ kind: "certificate", key, reason: `${where}: ${row.__unresolved}` });
      continue;
    }
    if (!productIds.has(row.product_id)) {
      skipped.push({ kind: "certificate", key, reason: `${where}: product_id "${row.product_id}" is not in the product list` });
      continue;
    }
    if (!row.cert_number) {
      skipped.push({ kind: "certificate", key, reason: `${where}: cert_number is empty` });
      continue;
    }
    if (!type) {
      skipped.push({ kind: "certificate", key, reason: `${where}: cert_type is empty` });
      continue;
    }
    const issued = parseDate(row.issued_date);
    const expiry = parseDate(row.expiry_date);
    certificates.push({
      productId: row.product_id,
      line: row.__line,
      where,
      type,
      issuer: clean(row.issuer),
      number: clean(row.cert_number),
      issued,
      expiry,
      badExpiry: Boolean(row.expiry_date) && !expiry,
      note: clean(row.note),
    });
  }
  return { certificates, skipped };
};

/**
 * A certificates sheet → rows keyed by canonical field, each with `product_id`
 * found from the product ID, SKU or name column against `products`.
 */
export const readCertificateSheet = (sheet, products) => {
  const header = findCertificateTable(sheet);
  if (!header) return null;
  fillMerges(sheet, header.row, []);
  const byColumn = new Map(header.columns.filter((column) => column.target).map((column) => [column.column, column.target.field]));
  const unknown = header.columns.filter((column) => !column.target).map((column) => `${columnLabel(sheet, column.column)} "${column.header}"`);
  const bySku = new Map();
  const byName = new Map();
  for (const product of products) {
    if (product.text.sku) bySku.set(product.text.sku.toLowerCase(), product.productId);
    const name = product.text.name.toLowerCase();
    byName.set(name, byName.has(name) ? null : product.productId);
  }
  const ids = new Set(products.map((product) => product.productId));
  const rows = [];
  for (const row of sheet.rows) {
    if (row.number <= header.row || !row.cells.size) continue;
    const out = { __line: row.number };
    for (const [column, cell] of row.cells) {
      const field = byColumn.get(column);
      if (field) out[field] = clean(cell.value);
    }
    if (!out.cert_type && !out.cert_number) continue;
    if (!out.product_id || !ids.has(out.product_id)) {
      const viaSku = out.sku && bySku.get(out.sku.toLowerCase());
      const viaName = out.name ? byName.get(out.name.toLowerCase()) : undefined;
      if (out.product_id && !ids.has(out.product_id) && out.product_id !== TEMPLATE_EXAMPLE_ID && !viaSku && !viaName) {
        // keep: planCertificates says "not in the product list"
      } else if (viaSku) out.product_id = viaSku;
      else if (viaName) out.product_id = viaName;
      else if (viaName === null) out.__unresolved = `the name "${out.name}" matches more than one product; use the product ID`;
      else if (!out.product_id) out.__unresolved = `no product ID, SKU or name that matches a product in the list`;
    }
    rows.push(out);
  }
  return { rows, headerRow: header.row, unknown };
};

// ------------------------------------------------- finding the tables ----

const stamped = (node, resourceKey) => node?.metadata?.appId === PRODUCT_HUB_APP_ID && node?.metadata?.resourceKey === resourceKey;

/**
 * The product hub's Products and Certificates Bases from one `nodes.list`
 * answer, by installer stamp, then default slug; `override` (a base id, node
 * id or slug) names the Products table. Throws a readable Error otherwise.
 */
export const resolveProductHub = (nodes, override = "") => {
  const bases = nodes.filter((node) => node.type === "base");
  let products;
  if (override) {
    products = bases.find((node) => node.baseId === override || node.id === override || node.slug === override);
    if (!products) throw new Error(`No Base "${override}" in this workspace (--products-base). Check the id or slug.`);
  } else {
    let matches = bases.filter((node) => stamped(node, "products"));
    if (!matches.length) matches = bases.filter((node) => node.slug === "busa-product-hub-products");
    if (!matches.length) {
      throw new Error(
        "Busa Product Hub is not installed in this workspace: no Products table found. Install the Busa Product Hub template first, then run this again.",
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `This workspace has ${matches.length} Busa Product Hub Products tables (${matches.map((node) => node.slug).join(", ")}). Name one with --products-base <slug>.`,
      );
    }
    products = matches[0];
  }
  const siblings = bases.filter((node) => node.parentId === products.parentId);
  const certificates =
    siblings.find((node) => stamped(node, "certificates")) ??
    siblings.find((node) => node.slug === products.slug.replace(/-products$/, "-certificates"));
  return { productsBaseId: products.baseId, productsSlug: products.slug, certificatesBaseId: certificates?.baseId ?? null };
};

// -------------------------------------------------- building the rows ----

const asObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const asList = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Key-sorted JSON, so "the same object" compares equal whatever order it was written in. */
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

const JSON_FIELDS = new Set(["pricing", "inventory", "content", "gallery", "tags"]);

// The selling price's keys inside the Pricing JSON of a table made before
// busa-product-hub 0.4.0. On a table with the Price column they are moved out.
const JSON_PRICE_KEYS = ["current_price", "price", "currency"];

/** True when the Products table has busa-product-hub 0.4.0's Price column. */
export const hasPriceColumn = (base) => (base?.fields ?? []).some((field) => field.slug === "price");

/** True when `next` would store the same thing as `current` for that field. */
const sameValue = (slug, current, next) => {
  if (JSON_FIELDS.has(slug)) {
    const parse = (value) => (typeof value === "string" ? (value.trim() ? JSON.parse(value) : null) : value ?? null);
    try {
      return canonical(parse(current)) === canonical(parse(next));
    } catch {
      return false;
    }
  }
  if (typeof next === "number") return Number(current) === next;
  return String(current ?? "") === String(next ?? "");
};

const FILLABLE = ["currency", "status", "lifecycle", "category", "vendor"];

/**
 * The Products fields this import writes for one product, merged over what is
 * stored. `images` is `[{ file, sha256, url }]` for the photos it could find,
 * or null when the list names none (stored photos are then left alone).
 * `priceColumn` says whether the table has the Price and Currency columns
 * (busa-product-hub 0.4.0+); without them the price goes into the Pricing JSON.
 */
export const productFields = (planned, existing = {}, images = null, { priceColumn = true } = {}) => {
  const fields = { "product-id": planned.productId };
  for (const [slug, value] of Object.entries(planned.text)) if (value) fields[slug] = value;
  const fill = planned.fill ?? {};
  for (const slug of ["status", "lifecycle", "category", "vendor"]) {
    if (!fields[slug] && blank(existing[slug]) && fill[slug]) fields[slug] = fill[slug];
  }

  const pricing = { ...asObject(existing.pricing) };
  let price;
  if (priceColumn) {
    // One price: the column. A price still in the JSON (a row from before the
    // upgrade) moves into the empty column instead of staying behind as a copy.
    const stored = blank(existing.price) ? pricing.current_price ?? pricing.price : existing.price;
    const storedCurrency = blank(existing.currency) ? pricing.currency : existing.currency;
    for (const key of JSON_PRICE_KEYS) delete pricing[key];
    price = planned.price ?? (blank(stored) || !Number.isFinite(Number(stored)) ? null : Number(stored));
    const currency = planned.currency || (blank(storedCurrency) ? "" : String(storedCurrency).trim()) || fill.currency || "";
    if (price !== null) fields.price = price;
    if (currency) fields.currency = currency;
  } else {
    if (planned.currency) pricing.currency = planned.currency;
    else if (blank(pricing.currency) && fill.currency) pricing.currency = fill.currency;
    if (planned.price !== null) pricing.current_price = planned.price;
    price = typeof pricing.current_price === "number" ? pricing.current_price : null;
  }
  if (planned.price !== null) pricing.target_price = planned.price;
  if (planned.cogs !== null && planned.cogs !== undefined) pricing.cogs = planned.cogs;
  if (planned.landedCost !== null) pricing.landed_cost = planned.landedCost;
  const cost = typeof pricing.landed_cost === "number" ? pricing.landed_cost : typeof pricing.cogs === "number" ? pricing.cogs : null;
  if (typeof price === "number" && cost !== null && price > 0) {
    pricing.gross_margin_pct = Math.round(((price - cost) / price) * 1000) / 10;
  }
  fields.pricing = JSON.stringify(pricing);

  if (planned.available !== null) fields.inventory = JSON.stringify({ ...asObject(existing.inventory), available: planned.available });

  const content = { ...asObject(existing.content) };
  if (planned.description) content.description = planned.description;
  if (planned.bullets.length) content.bullets = planned.bullets;
  if (Object.keys(planned.attributes).length) content.attributes = { ...asObject(content.attributes), ...planned.attributes };
  if (planned.source) content.source = planned.source;
  if (images?.length) {
    content.image_files = images.map(({ file, sha256: hash, url }) => ({ file, sha256: hash, url }));
    content.images_ready = true;
    fields.image = images[0].url;
    fields.gallery = JSON.stringify(images.map((image) => image.url));
  }
  fields.content = JSON.stringify(content);
  if (planned.tags.length) fields.tags = JSON.stringify(planned.tags);
  return fields;
};

/** Only the fields whose stored value would change. */
export const changedFields = (existing, next) =>
  Object.fromEntries(Object.entries(next).filter(([slug, value]) => !sameValue(slug, existing[slug], value)));

const relationIds = (value) => {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);
};

/** The option id of `type` in the Certificates table's Certificate type field, or null. */
export const certificateTypeId = (choices, type) => {
  const normalize = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim();
  const wanted = normalize(type);
  return choices.find((choice) => normalize(choice.id) === wanted || normalize(choice.name) === wanted)?.id ?? null;
};

// ---------------------------------------------------------- reading ----

const SPREADSHEET = /\.(?:xlsx|xlsm)$/i;

/** A product list file → sheets, by extension. */
export const readTableFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xls") throw new InputError(`${path.basename(filePath)} is an old .xls file. Open it in Excel or WPS and Save As "Excel Workbook (.xlsx)".`);
  if ([".numbers", ".ods", ".pdf", ".docx", ".doc"].includes(ext)) {
    throw new InputError(`${path.basename(filePath)}: this importer reads .xlsx and .csv. ${ext === ".pdf" || ext.startsWith(".doc") ? "Transcribe it into products-template.xlsx first (see the skill, \"Bring products in\")." : "Export it as .xlsx or CSV."}`);
  }
  const bytes = await readFile(filePath);
  if (SPREADSHEET.test(filePath)) return readXlsx(bytes);
  return { sheets: [readDelimited(bytes, { name: path.basename(filePath) })], notes: [] };
};

const pickSheet = (book, wanted, finder, label) => {
  if (wanted) {
    const sheet = book.sheets.find((candidate) => candidate.name === wanted) ?? book.sheets.find((candidate) => candidate.name.toLowerCase() === wanted.toLowerCase());
    if (!sheet) throw new InputError(`there is no sheet "${wanted}" (${label}). The sheets are: ${book.sheets.map((candidate) => `"${candidate.name}"`).join(", ")}.`);
    return sheet;
  }
  return book.sheets.filter((sheet) => !sheet.hidden).find((sheet) => finder(sheet)) ?? null;
};

// ------------------------------------------------------------- running ----

const readAll = async (records, baseId) => {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await records.readPage({ baseId, limit: PAGE, cursor });
    rows.push(...result.records);
    cursor = result.nextCursor;
    if (!cursor) return rows;
  }
  throw new Error(`More than ${PAGE * MAX_PAGES} rows in ${baseId}; this importer is built for a small catalogue.`);
};

const loadSdk = async () => {
  try {
    const [main, airapp] = await Promise.all([import("busabase-sdk"), import("busabase-sdk/airapp")]);
    return { createBusabaseClient: main.createBusabaseClient, uploadAsset: main.uploadAsset, createAirAppRecords: airapp.createAirAppRecords };
  } catch {
    throw new Error("busabase-sdk is not installed next to this script. Run `npm i busabase-sdk` in this directory first.");
  }
};

const PICTURE_KIND = { floating: "in the sheet", "in-cell": "in the cell", "wps-in-cell": "in the cell (WPS)", "image-formula": "IMAGE() link" };

/**
 * Run one import. Everything that touches Busabase goes through `sdk`
 * (defaults to the installed busabase-sdk). Returns the summary it prints.
 */
export const runImport = async ({
  catalogPath,
  certificatesPath = "",
  imagesDir = "",
  productsBase = "",
  sheet: sheetName = "",
  certificatesSheet = "",
  currency: fillCurrency = "",
  fill: fillInput = {},
  source = "",
  dryRun = false,
  env = process.env,
  sdk,
  now = () => new Date(),
}) => {
  if (!env.BUSABASE_BASE_URL) throw new Error("Set BUSABASE_BASE_URL (and BUSABASE_API_KEY, BUSABASE_SPACE_ID for Busabase Cloud).");
  const fill = { ...fillInput, ...(fillCurrency ? { currency: codeCurrency(fillCurrency) || fillCurrency } : {}) };
  if (fill.currency && !/^[A-Z]{3}$/.test(fill.currency)) throw new InputError(`--currency "${fill.currency}" is not a 3-letter code such as CNY or USD.`);
  for (const key of Object.keys(fill)) if (!FILLABLE.includes(key)) throw new InputError(`--fill ${key}=… is not allowed; only ${FILLABLE.join(", ")}.`);

  // 1. Read the file: which sheet holds the products, how its columns read.
  const fileName = path.basename(catalogPath);
  const book = await readTableFile(catalogPath);
  const productSheet = pickSheet(book, sheetName, findProductTable, "--sheet");
  if (!productSheet) {
    const firstRow = book.sheets[0]?.rows.find((row) => row.cells.size);
    const seen = firstRow ? [...firstRow.cells.values()].map((cell) => `"${clean(cell.value)}"`).slice(0, 12).join(", ") : "nothing";
    throw new InputError(`${fileName} has no product table: no row in the first 20 names a product column (a name, model, product ID or SKU, plus at least one more such as price). The first row says: ${seen}.`);
  }
  const table = readProductSheet(productSheet);
  if (!table) throw new InputError(`sheet "${productSheet.name}" has no header row with a name, model, product ID or SKU column.`);
  if (!table.columns.some((column) => column.as.field === "name")) throw new InputError(`${fileName}: no name column (名称 / Name / 型号 / Model). Columns read: ${table.columns.map((column) => `"${column.header}"`).join(", ")}.`);
  const csv = Boolean(productSheet.csv);
  const lineLabel = csv ? (line) => `line ${line}` : (line) => `row ${line}`;
  const sourceLabel = csv ? fileName : `${fileName} › ${productSheet.name}`;
  const plan = planProducts(table.rows, { language: table.language, source, sourceLabel, fill, lineLabel });

  // Certificates: certificate columns on the product rows, then a sheet or file.
  const inline = plan.products.flatMap((product) =>
    product.certificates.map((cert) => ({ __line: cert.line, product_id: product.productId, cert_type: cert.type, cert_number: cert.number, __inline: cert.header })),
  );
  let certificateRows = [];
  let certificatesFrom = "";
  let certificatesLabel = lineLabel;
  let certificateSourceLabel = sourceLabel;
  const certificateNotes = [];
  if (certificatesPath) {
    const certBook = await readTableFile(certificatesPath);
    const certSheet = pickSheet(certBook, certificatesSheet, findCertificateTable, "--certificates-sheet");
    const read = certSheet ? readCertificateSheet(certSheet, plan.products) : null;
    if (!read) throw new InputError(`${path.basename(certificatesPath)} has no certificate table: no header row with a certificate number column (cert_number / 证书编号).`);
    certificateRows = read.rows;
    certificatesFrom = certSheet.csv ? path.basename(certificatesPath) : `${path.basename(certificatesPath)} › ${certSheet.name}`;
    certificateSourceLabel = certificatesFrom;
    if (certSheet.csv) certificatesLabel = (line) => `line ${line}`;
    if (read.unknown.length) certificateNotes.push(`certificate columns not used: ${read.unknown.join(", ")}`);
  } else if (!csv) {
    const certSheet = pickSheet(book, certificatesSheet, (candidate) => candidate !== productSheet && findCertificateTable(candidate), "--certificates-sheet");
    const read = certSheet ? readCertificateSheet(certSheet, plan.products) : null;
    if (read) {
      certificateRows = read.rows;
      certificatesFrom = `${fileName} › ${certSheet.name}`;
      certificateSourceLabel = certificatesFrom;
      if (read.unknown.length) certificateNotes.push(`certificate columns not used: ${read.unknown.join(", ")}`);
    }
  }
  const productIds = new Set(plan.products.map((product) => product.productId));
  const certificatePlan = planCertificates(certificateRows, productIds, { lineLabel: certificatesLabel });
  const inlinePlan = planCertificates(
    inline.filter((row) => row.cert_number),
    productIds,
    { lineLabel },
  );
  for (const cert of inlinePlan.certificates) cert.sourceNote = `${sourceLabel} ${lineLabel(cert.line)} (${inline.find((row) => row.__line === cert.line && row.cert_type === cert.type)?.__inline})`;
  for (const cert of certificatePlan.certificates) cert.sourceNote = `${certificateSourceLabel} ${certificatesLabel(cert.line)}`;
  const inlineMissing = inline
    .filter((row) => !row.cert_number)
    .map((row) => ({ kind: "certificate", key: `${row.product_id} ${row.cert_type}`, reason: `${lineLabel(row.__line)}: ${row.__inline} says yes but gives no certificate number; add the number (or the Certificates sheet) to import it` }));
  const allCertificates = [...inlinePlan.certificates, ...certificatePlan.certificates];

  const photoDir = imagesDir || path.join(path.dirname(catalogPath), "images");
  const pictureCount = plan.products.reduce((sum, product) => sum + product.pictures.length, 0);

  // 2. Busabase: the tables, and what is stored.
  const { createBusabaseClient, uploadAsset, createAirAppRecords } = sdk ?? (await loadSdk());
  const client = createBusabaseClient({
    baseUrl: env.BUSABASE_BASE_URL,
    ...(env.BUSABASE_API_KEY ? { apiKey: env.BUSABASE_API_KEY } : {}),
    ...(env.BUSABASE_SPACE_ID ? { spaceId: env.BUSABASE_SPACE_ID } : {}),
  });
  const records = createAirAppRecords(client, { appId: IMPORTER_ID });
  const hub = resolveProductHub((await client.nodes.list({ types: ["base"] })) ?? [], productsBase);
  const priceColumn = hasPriceColumn(await client.bases.get({ baseId: hub.productsBaseId }));
  if (allCertificates.length && !hub.certificatesBaseId) {
    throw new Error(`No Certificates table next to ${hub.productsSlug}. Install Busa Product Hub completely, or run without certificates.`);
  }

  const summary = {
    dryRun,
    productsTable: hub.productsSlug,
    priceColumn,
    file: fileName,
    sheet: csv ? "" : productSheet.name,
    headerRow: table.headerRow,
    certificatesFrom,
    columns: table.columns.map((column) => ({ letter: column.letter, header: column.header, as: column.as, known: Boolean(column.target), hint: column.hint, duplicateOf: column.duplicateOf ?? "" })),
    fill,
    rows: [],
    products: { created: 0, updated: 0, unchanged: 0, skipped: 0, queued: 0 },
    certificates: { created: 0, updated: 0, unchanged: 0, skipped: 0, queued: 0 },
    images: { uploaded: 0, reused: 0, missing: 0 },
    picturesInFile: pictureCount,
    skipped: [...plan.skipped, ...certificatePlan.skipped, ...inlinePlan.skipped, ...inlineMissing],
    notes: [...book.notes, ...productSheet.notes, ...table.notes, ...plan.notes, ...certificateNotes],
  };
  if (!priceColumn) {
    summary.notes.push(
      `${hub.productsSlug} has no Price column (Busa Product Hub before 0.4.0), so prices stay in Pricing (JSON) as before, where the shop reads them.`,
    );
  }
  summary.products.skipped = plan.skipped.length;
  summary.certificates.skipped = certificatePlan.skipped.length + inlinePlan.skipped.length + inlineMissing.length;

  const existingProducts = new Map();
  let maxRef = 0;
  for (const record of await readAll(records, hub.productsBaseId)) {
    const id = String(record.fields["product-id"] ?? "");
    maxRef = Math.max(maxRef, Number(record.fields.ref) || 0);
    if (id && !existingProducts.has(id)) existingProducts.set(id, record);
  }
  const productRecordIds = new Map();
  const nowIso = () => now().toISOString();

  // 3. Each product: its pictures, then one create or one update.
  for (const planned of plan.products) {
    const existing = existingProducts.get(planned.productId);
    const stored = existing?.fields ?? {};
    const known = asList(asObject(stored.content).image_files);
    const row = {
      line: planned.line,
      where: planned.where,
      productId: planned.productId,
      idFrom: planned.idFrom,
      name: planned.text.name,
      price: planned.price,
      priceText: planned.priceText,
      currency: "",
      currencyFrom: "",
      stock: planned.available,
      pictures: [],
      action: "",
      changed: [],
      empty: [],
    };
    summary.rows.push(row);

    let images = null;
    const hashes = new Set();
    const upload = async ({ file, bytes, label }) => {
      const hash = sha256(bytes);
      if (hashes.has(hash)) {
        row.pictures.push({ label, status: "same picture again" });
        return null;
      }
      hashes.add(hash);
      const already = known.find((item) => item?.sha256 === hash && item?.url);
      if (already) {
        summary.images.reused += 1;
        row.pictures.push({ label, status: "already uploaded" });
        return { file: already.file ?? file, sha256: hash, url: already.url };
      }
      const mimeType = MIME[path.extname(file).toLowerCase()];
      if (!mimeType) {
        summary.images.missing += 1;
        row.pictures.push({ label, status: "not usable" });
        summary.notes.push(`${planned.productId}: ${label} is not an image type this importer uploads (${path.extname(file) || "no extension"}), left out. Use PNG, JPEG, WebP, GIF or SVG.`);
        return null;
      }
      summary.images.uploaded += 1;
      row.pictures.push({ label, status: dryRun ? "to upload" : "uploaded" });
      if (dryRun) return { file, sha256: hash, url: `(would upload ${file})` };
      const asset = await uploadAsset(client, new Uint8Array(bytes), { fileName: file, mimeType, context: "record-field" });
      return { file, sha256: hash, url: asset.url };
    };
    const found = [];
    for (const ref of planned.imageRefs) {
      if (/^https:\/\//i.test(ref)) {
        found.push({ file: ref, sha256: "", url: ref });
        row.pictures.push({ label: "link", status: "link" });
        continue;
      }
      if (/^http:\/\//i.test(ref)) {
        summary.images.missing += 1;
        row.pictures.push({ label: "http link", status: "not usable" });
        summary.notes.push(`${planned.productId}: ${ref} is http://, not https://, left out (a website cannot show it safely)`);
        continue;
      }
      const file = path.basename(ref);
      const filePath = path.join(photoDir, ref);
      const bytes = await stat(filePath).then((info) => (info.isFile() ? readFile(filePath) : null)).catch(() => null);
      if (!bytes || bytes.byteLength === 0) {
        summary.images.missing += 1;
        row.pictures.push({ label: file, status: "missing" });
        summary.notes.push(`${planned.productId}: photo ${ref} not found in ${photoDir}, left out`);
        continue;
      }
      const image = await upload({ file, bytes, label: file });
      if (image) found.push(image);
    }
    let embedded = 0;
    for (const picture of planned.pictures) {
      if (picture.kind === "image-formula") {
        found.push({ file: picture.url, sha256: "", url: picture.url });
        row.pictures.push({ label: `${picture.cell} ${PICTURE_KIND[picture.kind]}`, status: "link" });
        continue;
      }
      embedded += 1;
      const ext = picture.ext === ".jpeg" ? ".jpg" : picture.ext;
      const image = await upload({ file: `${planned.productId}-${embedded}${ext}`, bytes: picture.bytes, label: `${picture.cell} ${PICTURE_KIND[picture.kind]}` });
      if (image) found.push(image);
    }
    if (planned.imageRefs.length || planned.pictures.length) {
      const unique = [];
      for (const image of found) if (!unique.some((other) => other.url === image.url)) unique.push(image);
      if (unique.length > MAX_PICTURES) summary.notes.push(`${planned.productId}: ${unique.length} pictures; the first ${MAX_PICTURES} are kept`);
      images = unique.length ? unique.slice(0, MAX_PICTURES) : null;
    }

    const next = productFields(planned, stored, images, { priceColumn });
    const after = { ...stored, ...next };
    row.currency = String((priceColumn ? after.currency : asObject(after.pricing).currency) ?? "");
    row.currencyFrom = planned.currency ? planned.currencyFrom : row.currency ? (fill.currency === row.currency ? "--currency" : "table") : "";
    const storedPrice = priceColumn ? after.price : asObject(after.pricing).current_price;
    row.price = blank(storedPrice) || !Number.isFinite(Number(storedPrice)) ? null : Number(storedPrice);
    row.stock = asObject(after.inventory).available ?? null;
    if (blank(storedPrice)) row.empty.push("price");
    if (!row.currency) row.empty.push("currency");
    if (asObject(after.inventory).available === undefined) row.empty.push("stock");
    if (blank(after.image)) row.empty.push("picture");
    if (blank(after.status)) row.empty.push("status");
    if (blank(after.lifecycle)) row.empty.push("lifecycle");
    if (!asObject(after.content).description) row.empty.push("description");
    // Busa Shop's listing rule (busa-shop SKILL.md, "The listing rule"), so the owner sees before
    // importing which products a shop would leave off, and why.
    const lifecycle = String(after.lifecycle ?? "");
    const status = String(after.status ?? "");
    row.unlisted = [
      ...(!lifecycle ? ["no lifecycle"] : ["active", "launch"].includes(lifecycle) ? [] : [`lifecycle "${lifecycle}"`]),
      ...(!status ? ["no status"] : ["active", "approved", "live"].includes(status) ? [] : [`status "${status}"`]),
      ...(Number(storedPrice) > 0 ? [] : ["no price"]),
      ...(row.currency ? [] : ["no currency"]),
    ];
    row.listed = !row.unlisted.length;

    if (!existing) {
      maxRef += 1;
      const fields = { ...next, ref: maxRef, "created-at": nowIso(), "updated-at": nowIso() };
      if (dryRun) {
        summary.products.created += 1;
        row.action = "create";
        continue;
      }
      const outcome = await records.createRecord({
        baseId: hub.productsBaseId,
        fields,
        message: `Import product ${planned.productId} from ${fileName}`,
      });
      if (outcome.status === "queued" || !outcome.recordId) {
        summary.products.queued += 1;
        row.action = "waiting for review";
      } else {
        summary.products.created += 1;
        row.action = "created";
        productRecordIds.set(planned.productId, outcome.recordId);
      }
      continue;
    }
    productRecordIds.set(planned.productId, existing.id);
    const changes = changedFields(stored, next);
    row.changed = Object.keys(changes);
    if (!row.changed.length) {
      summary.products.unchanged += 1;
      row.action = "unchanged";
      continue;
    }
    if (dryRun) {
      summary.products.updated += 1;
      row.action = "update";
      continue;
    }
    const outcome = await records.updateRecord({
      recordId: existing.id,
      baseCommitId: existing.headCommitId,
      fields: { ...changes, "updated-at": nowIso() },
      message: `Update product ${planned.productId} from ${fileName} (${row.changed.join(", ")})`,
    });
    if (outcome.status === "queued") {
      summary.products.queued += 1;
      row.action = "waiting for review";
    } else {
      summary.products.updated += 1;
      row.action = "updated";
    }
  }

  // 4. Certificates, linked to the product saved above.
  if (allCertificates.length) {
    const base = await client.bases.get({ baseId: hub.certificatesBaseId });
    const choices = base?.fields?.find((field) => field.slug === "cert-type")?.options?.choices ?? [];
    const existingCertificates = await readAll(records, hub.certificatesBaseId);
    const plannedIds = new Set(plan.products.map((product) => product.productId));
    for (const cert of allCertificates) {
      const label = `${cert.productId} ${cert.type} ${cert.number}`;
      const skip = (reason) => {
        summary.certificates.skipped += 1;
        summary.skipped.push({ kind: "certificate", key: label, reason });
      };
      const typeId = certificateTypeId(choices, cert.type);
      if (!typeId) {
        skip(`type "${cert.type}" is not an option of the Certificates table (it offers: ${choices.map((choice) => choice.name).join(", ")}). Update Busa Product Hub (0.3.0 adds EN 71, ASTM F963, CPSIA / CPC) or add the option.`);
        continue;
      }
      if (cert.badExpiry) summary.notes.push(`${label}: expiry date is not YYYY-MM-DD, left out`);
      const productRecordId = productRecordIds.get(cert.productId);
      if (!productRecordId) {
        if (dryRun && plannedIds.has(cert.productId) && !existingProducts.has(cert.productId)) {
          summary.certificates.created += 1; // would be linked to the product created in the same run
          continue;
        }
        skip(`product ${cert.productId} was not saved (waiting for review or skipped), so there is nothing to link it to yet. Run the import again after it is approved.`);
        continue;
      }
      const next = {
        product: [productRecordId],
        "cert-type": typeId,
        "cert-number": cert.number,
        ...(cert.issuer ? { issuer: cert.issuer } : {}),
        ...(cert.issued ? { "issued-date": cert.issued } : {}),
        ...(cert.expiry ? { "expiry-date": cert.expiry } : {}),
        "source-note": cert.note ? `${cert.sourceNote}; ${cert.note}` : cert.sourceNote,
      };
      const existing = existingCertificates.find(
        (record) =>
          relationIds(record.fields.product).includes(productRecordId) &&
          String(record.fields["cert-type"] ?? "") === typeId &&
          String(record.fields["cert-number"] ?? "") === cert.number,
      );
      if (!existing) {
        if (dryRun) {
          summary.certificates.created += 1;
          continue;
        }
        const outcome = await records.createRecord({
          baseId: hub.certificatesBaseId,
          fields: next,
          message: `Import certificate ${typeId} ${cert.number} for ${cert.productId}`,
        });
        if (outcome.status === "queued") summary.certificates.queued += 1;
        else summary.certificates.created += 1;
        continue;
      }
      const { product: _product, ...comparable } = next;
      const changes = changedFields(existing.fields, comparable);
      if (!Object.keys(changes).length) {
        summary.certificates.unchanged += 1;
        continue;
      }
      if (dryRun) {
        summary.certificates.updated += 1;
        continue;
      }
      const outcome = await records.updateRecord({
        recordId: existing.id,
        baseCommitId: existing.headCommitId,
        fields: changes,
        message: `Update certificate ${typeId} ${cert.number} for ${cert.productId} (${Object.keys(changes).join(", ")})`,
      });
      if (outcome.status === "queued") summary.certificates.queued += 1;
      else summary.certificates.updated += 1;
    }
  }
  return summary;
};

// ----------------------------------------------------------- preview ----

const cellText = (value, max = 48) => {
  const text = clean(value).replace(/\|/g, "\\|");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const describeTarget = (as) => {
  if (as.field === "image") return "picture (main, then gallery)";
  if (as.field === "gallery") return "gallery pictures";
  if (as.field === "cogs") return "cost (pricing.cogs)";
  if (as.field === "landed_cost") return "landed cost (pricing.landed_cost)";
  if (as.field === "stock_available") return "stock (inventory.available)";
  if (as.field === "source") return "where the data came from (content.source)";
  if (as.field === "name" && as.fromModel) return "name (no name column, so the model is the name)";
  if (as.field) return as.field.replace(/_/g, " ");
  if (as.certificate) return `${as.certificate} certificate number`;
  return "";
};

/** The summary as the text the owner reads: counts, one table row per product, then what needs a look. */
export const formatSummary = (summary) => {
  const verb = summary.dryRun ? "would be " : "";
  const line = (label, counts) =>
    `${label}: ${counts.created} ${verb}created, ${counts.updated} ${verb}updated, ${counts.unchanged} unchanged, ${counts.skipped} skipped${counts.queued ? `, ${counts.queued} waiting for review` : ""}`;
  const out = [
    `${summary.dryRun ? "Dry run, nothing was written or uploaded. " : ""}Products table: ${summary.productsTable}`,
    `Read from: ${summary.file}${summary.sheet ? `, sheet "${summary.sheet}"` : ""}, headers on ${summary.sheet ? "row" : "line"} ${summary.headerRow}${summary.certificatesFrom ? `; certificates from ${summary.certificatesFrom}` : ""}`,
    line("Products", summary.products),
    line("Certificates", summary.certificates),
    `Photos: ${summary.images.uploaded} ${summary.dryRun ? "to upload" : "uploaded"}, ${summary.images.reused} already uploaded, ${summary.images.missing} missing${summary.picturesInFile ? ` (${summary.picturesInFile} found inside the file)` : ""}`,
  ];
  if (summary.rows?.length) {
    out.push("", "| Row | Product ID | Name | Price | Stock | Pictures | Result | Empty |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of summary.rows) {
      const price = row.price !== null && row.price !== undefined ? `${formatNumber(row.price)}${row.currency ? ` ${row.currency}` : ""}` : row.priceText ? `"${cellText(row.priceText, 16)}"?` : "—";
      const pictures = row.pictures.length ? `${row.pictures.length}: ${row.pictures.map((picture) => (picture.status === "to upload" || picture.status === "uploaded" || picture.status === "link" ? picture.label : `${picture.label} (${picture.status})`)).join(", ")}` : "0";
      const result = row.changed?.length && row.action !== "unchanged" ? `${row.action} (${row.changed.filter((slug) => slug !== "updated-at").join(", ")})` : row.action;
      out.push(
        `| ${row.where.replace(/^(row|line) /, "")} | ${cellText(row.productId, 40)}${row.idFrom === "column" ? "" : "*"} | ${cellText(row.name)} | ${price} | ${row.stock ?? "—"} | ${cellText(pictures, 60)} | ${result} | ${row.empty.length ? row.empty.join(", ") : "—"} |`,
      );
    }
    const made = summary.rows.filter((row) => row.idFrom !== "column");
    if (made.length) {
      const how = [...new Set(made.map((row) => row.idFrom))].join(" / ");
      out.push("", `* No product ID column: these IDs were made from the ${how}. Add a 商品编号 / Product ID column to keep them stable if you rename a product.`);
    }
    const unlisted = summary.rows.filter((row) => !row.listed);
    if (unlisted.length) {
      const reasons = new Map();
      for (const row of unlisted) for (const reason of row.unlisted ?? []) reasons.set(reason, [...(reasons.get(reason) ?? []), row.name]);
      const why = [...reasons].map(([reason, names]) => `${reason} (${names.length > 3 ? `${names.length} products` : names.join(", ")})`).join("; ");
      const fixes = [
        reasons.has("no lifecycle") ? "--fill lifecycle=active" : "",
        reasons.has("no status") ? "--fill status=active" : "",
        reasons.has("no currency") ? "--currency <CODE>" : "",
      ].filter(Boolean);
      out.push(
        `Busa Shop lists a product only with lifecycle active/launch, status active/approved/live, a price and a currency. ${unlisted.length} of ${summary.rows.length} would not be listed as they are: ${why}.${fixes.length ? ` If the owner wants them on sale, fill the sheet, or run with ${fixes.join(" ")} (it fills only empty cells).` : ""}`,
      );
    }
    const noCurrency = summary.rows.filter((row) => row.price !== null && row.price !== undefined && !row.currency);
    if (noCurrency.length) out.push(`${noCurrency.length} prices say no currency: add a 币种 / Currency column, or ask the owner and run with --currency <CODE>.`);
    const fromHint = summary.rows.filter((row) => ["price cell", "price header"].includes(row.currencyFrom));
    if (fromHint.length) out.push(`Currency read from the ${[...new Set(fromHint.map((row) => row.currencyFrom))].join(" and ")} for ${fromHint.length} product(s): ${[...new Set(fromHint.map((row) => row.currency))].join(", ")}. Check it is right.`);
  }
  if (summary.columns?.length) {
    out.push("", "How the columns were read:");
    for (const column of summary.columns) {
      const header = `${column.letter} "${cellText(column.header, 40)}"`;
      if (column.duplicateOf) out.push(`- ${header} → a second ${describeTarget(column.as) || column.as.attribute} column (the first is ${column.duplicateOf}); kept as the product detail "${column.as.attribute}"`);
      else if (column.as.ignore) out.push(`- ${header} → ${column.as.ignore}, not imported`);
      else if (column.as.attribute && !column.known) out.push(`- ${header} → not a known column; kept as the product detail "${column.as.attribute}" (in the record's Content JSON, content.attributes; not shown on a shop website)`);
      else if (column.as.attribute) out.push(`- ${header} → product detail "${column.as.attribute}"${column.hint ? ` (unit "${column.hint}" added to bare numbers)` : ""}`);
      else out.push(`- ${header} → ${describeTarget(column.as)}${column.hint && column.as.field === "price" ? ` (header says "${column.hint}")` : ""}`);
    }
    const fills = Object.entries(summary.fill ?? {});
    if (fills.length) out.push(`Filled in where both the sheet and the table were empty, because you asked: ${fills.map(([key, value]) => `${key} = ${value}`).join(", ")}`);
  }
  if (summary.skipped.length) out.push("", "Skipped:", ...summary.skipped.map((item) => `  - ${item.kind} ${item.key}: ${item.reason}`));
  if (summary.notes.length) out.push("", "Notes:", ...summary.notes.map((note) => `  - ${note}`));
  if (summary.dryRun) out.push("", "Nothing was written. If the owner agrees with this, run the same command again without --dry-run.");
  return out.join("\n");
};

// --------------------------------------------------- template sheet ----

const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
const crc32 = (bytes) => {
  if (typeof zlib.crc32 === "function") return zlib.crc32(bytes) >>> 0;
  let crc = -1;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
};

/** A zip archive of `[name, bytes]`, deflated, with a fixed timestamp so the same input is the same file. */
const writeZip = (files) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const time = 0; // 00:00
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
};

/**
 * A small .xlsx: `sheets` are `{ name, rows: [[cell]], widths: [n], header }`,
 * a cell being a string, a number or null. Text is stored inline; the first
 * row is bold on grey and frozen when `header` is set.
 */
export const writeXlsx = (sheets) => {
  const sheetXml = ({ rows, widths = [], header }) => {
    const cols = widths.length ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
    const body = rows
      .map((row, rowIndex) => {
        const cells = row
          .map((value, columnIndex) => {
            if (value === null || value === undefined || value === "") return "";
            const ref = `${columnLetter(columnIndex + 1)}${rowIndex + 1}`;
            const style = header && rowIndex === 0 ? 1 : 2;
            if (typeof value === "number") return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
            return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
          })
          .join("");
        return `<row r="${rowIndex + 1}"${header && rowIndex === 0 ? ' ht="32" customHeight="1"' : ""}>${cells}</row>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
  };
  const files = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EAED"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]),
  ];
  return writeZip(files);
};

// The template's columns: [Chinese, English, width, example value].
const TEMPLATE_PRODUCT_COLUMNS = [
  ["商品编号", "Product ID", 16, TEMPLATE_EXAMPLE_ID],
  ["名称", "Name", 26, "示例手机 Example Phone"],
  ["型号", "Model", 14, "EX-1"],
  ["品牌", "Brand", 14, "示例品牌 Example Brand"],
  ["货号", "SKU", 14, "EX-1-256-BK"],
  ["类目", "Category", 14, "手机 Phones"],
  ["售价", "Price", 10, 1999],
  ["币种", "Currency", 10, "CNY"],
  ["成本", "Cost", 10, 1200],
  ["库存", "Stock", 10, 50],
  ["状态", "Status", 12, "active"],
  ["生命周期", "Lifecycle", 12, "active"],
  ["颜色", "Color", 12, "黑色 Black"],
  ["内存", "Memory", 10, "8GB"],
  ["存储", "Storage", 10, "256GB"],
  ["屏幕", "Screen", 14, "6.7 英寸 inch"],
  ["电池", "Battery", 12, "5000 mAh"],
  ["主图", "Image", 18, ""],
  ["图集", "Gallery", 18, ""],
  ["描述", "Description", 36, "一段介绍这件商品的话。One paragraph about the product."],
  ["卖点", "Highlights", 30, "卖点一 Highlight one | 卖点二 Highlight two"],
  ["来源", "Source", 22, "示例数据 Example data"],
];
const TEMPLATE_CERTIFICATE_COLUMNS = [
  ["商品编号", "Product ID", 16, TEMPLATE_EXAMPLE_ID],
  ["认证类型", "Type", 14, "FCC"],
  ["证书编号", "Number", 20, "EXAMPLE-FCC-ID"],
  ["发证机构", "Issuer", 24, "示例实验室 Example Lab"],
  ["发证日期", "Issued", 12, "2026-01-15"],
  ["到期日期", "Expires", 12, "2028-01-15"],
  ["来源", "Source", 22, "示例数据 Example data"],
];
const TEMPLATE_HELP = [
  ["怎么填 How to fill this in"],
  ["1. 「商品 Products」表每行一个商品。只有「名称」必须填。One product per row on Products. Only Name is required."],
  ["2. 空着的格子就是“没有”：导入不会编造任何值。An empty cell means “not provided”: the import never makes a value up."],
  ["3. 售价写数字，币种写三个字母（CNY、USD、EUR）。Price is a number; Currency is three letters (CNY, USD, EUR)."],
  ["4. 图片三种方式：① 直接把图片插入到这个商品所在的那一行（浮动图片或“放置在单元格中”都可以）；② 在「主图」「图集」里填 https:// 图片链接，多个用 | 分开；③ 填图片文件名，再把图片文件夹一起交给 Agent。"],
  ["   Pictures, three ways: (1) insert the picture into the product's row (floating over the row, or Place in Cell); (2) put https:// links in Image / Gallery, several separated by |; (3) type file names and give your agent the folder of pictures."],
  ["5. 状态填 active（在售）、生命周期填 active，商品才会出现在 Busa Shop 网站上；draft 是草稿。Status active and Lifecycle active put a product on a Busa Shop website; draft keeps it off."],
  ["6. 表里没有的列（比如「防水等级」）也会保留，作为商品参数存进产品库。Any other column (for example “Water resistance”) is kept as a product detail."],
  ["7. 认证写在「认证 Certificates」表。类型只能是 CE、FCC、RoHS、UN38.3、UKCA、EN 71、ASTM F963、CPSIA / CPC；日期写成 2028-01-15。"],
  ["   Certificates go on the Certificates sheet. Type is one of CE, FCC, RoHS, UN38.3, UKCA, EN 71, ASTM F963, CPSIA / CPC; dates as 2028-01-15."],
  ["8. 两张表的「来源」都写这一行数据从哪来（文件名和页码，或网址）。Source, on both sheets: where this row's facts came from (a file and page, or a web address)."],
  ["9. 示例行（商品编号 example-phone）不会被导入，填好后可以删掉。The example rows (Product ID example-phone) are never imported; delete them once you have your own."],
];

/** The blank bilingual template: Products (one example row), Certificates (one example row), How to fill. */
export const templateWorkbook = () =>
  writeXlsx([
    {
      name: "商品 Products",
      header: true,
      widths: TEMPLATE_PRODUCT_COLUMNS.map((column) => column[2]),
      rows: [TEMPLATE_PRODUCT_COLUMNS.map(([zh, en]) => `${zh} ${en}`), TEMPLATE_PRODUCT_COLUMNS.map((column) => column[3])],
    },
    {
      name: "认证 Certificates",
      header: true,
      widths: TEMPLATE_CERTIFICATE_COLUMNS.map((column) => column[2]),
      rows: [TEMPLATE_CERTIFICATE_COLUMNS.map(([zh, en]) => `${zh} ${en}`), TEMPLATE_CERTIFICATE_COLUMNS.map((column) => column[3])],
    },
    { name: "说明 How to fill", widths: [140], rows: TEMPLATE_HELP },
  ]);

// --------------------------------------------------------------- CLI ----

const USAGE = `Usage: node import-products.mjs <products.xlsx | products.csv> [options]

Imports products, their pictures and certificates into the Busa Product Hub
installed in the workspace named by BUSABASE_BASE_URL / BUSABASE_API_KEY /
BUSABASE_SPACE_ID. Needs: npm i busabase-sdk

  --dry-run                    read everything and print the preview; write and upload nothing
  --sheet <name>               the products sheet (default: the first sheet whose header row names products)
  --certificates <file>        certificates from a separate .csv/.xlsx (default: a certificates sheet in the workbook)
  --certificates-sheet <name>  which sheet holds the certificates
  --images <dir>               where picture file names are found (default: images/ next to the file)
  --currency <CODE>            the currency of prices that do not say one (CNY, USD…); never overrides one
  --fill <field>=<value>       fill status, lifecycle, category or vendor where the sheet AND the table are empty
  --source "<text>"            where this data came from, kept on each product (default: file › sheet)
  --products-base <id|slug>    the Products table, when the workspace has more than one
  --json                       print the summary as JSON
  --write-template <file.xlsx> write the blank bilingual template spreadsheet and stop (no Busabase needed)`;

export const main = async (argv, { log = console.log, ...options } = {}) => {
  const valueOf = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const valuesOf = (name) => argv.flatMap((arg, index) => (arg === name && argv[index + 1] ? [argv[index + 1]] : []));
  const flagsWithValues = new Set(["--certificates", "--images", "--products-base", "--sheet", "--certificates-sheet", "--currency", "--fill", "--source", "--write-template"]);
  if (argv.includes("--help")) {
    log(USAGE);
    return 0;
  }
  const template = valueOf("--write-template");
  if (template) {
    await mkdir(path.dirname(path.resolve(template)), { recursive: true });
    await writeFile(template, templateWorkbook());
    log(`Wrote ${template}: sheets "商品 Products", "认证 Certificates" and "说明 How to fill". Fill it in, then: node import-products.mjs ${path.basename(template)} --dry-run`);
    return 0;
  }
  const catalogPath = argv.find((arg, index) => !arg.startsWith("--") && !flagsWithValues.has(argv[index - 1]));
  if (!catalogPath) {
    log(USAGE);
    return 1;
  }
  const fill = {};
  for (const pair of valuesOf("--fill")) {
    const [key, ...rest] = pair.split("=");
    if (!rest.length || !rest.join("=").trim()) throw new InputError(`--fill ${pair}: write it as field=value, e.g. --fill status=active`);
    fill[key.trim()] = rest.join("=").trim();
  }
  const summary = await runImport({
    catalogPath,
    certificatesPath: valueOf("--certificates") ?? "",
    imagesDir: valueOf("--images") ?? "",
    productsBase: valueOf("--products-base") ?? "",
    sheet: valueOf("--sheet") ?? "",
    certificatesSheet: valueOf("--certificates-sheet") ?? "",
    currency: (valueOf("--currency") ?? "").toUpperCase(),
    fill,
    source: valueOf("--source") ?? "",
    dryRun: argv.includes("--dry-run"),
    ...options,
  });
  log(argv.includes("--json") ? JSON.stringify(summary, null, 2) : formatSummary(summary));
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`import-products: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
