// Which product details a product page shows, in what order, under which
// label. Pure (test/details.test.mjs).
//
// Two sources, one list:
//
// - busa-shop's own Products table (0.5.0 and later) has plain columns: Brand,
//   Model, Warranty, Returns, and **Specs**, one "Label: value" per line, as the
//   owner reads and edits it in the grid. `parseSpecs` turns Specs into keys: a
//   label it recognises (the store languages' own words, the key itself, the
//   common English and Chinese names: "RAM", "电池") becomes that key, any other
//   label stays as written and is shown after the known ones, in the owner's
//   order. What the owner writes in Specs is meant for shoppers, so nothing
//   else needs naming in Settings.
// - a busa-product-hub table keeps every column of an imported sheet in
//   `content.attributes`: a column it knows under one canonical key (brand,
//   battery, moq, …: the PRODUCT_COLUMNS table in scripts/import-products.mjs),
//   any other column under its own header text ("防水等级").
//
// A page shows:
// - SHOPPER_DETAILS, when present, in this order;
// - then the Specs labels the shop's own table adds, and the keys the owner
//   names in Settings › "Also show these product details", in that order;
// - never TRADE_DETAILS (minimum order, lead time, customs code, carton size,
//   country of origin: for the owner and trade buyers), even when named;
// - nothing else: a product hub column nobody looked at never reaches a public page.

import { MESSAGES } from "./i18n.js";

export const SHOPPER_DETAILS = [
  "brand",
  "model",
  "color",
  "screen",
  "processor",
  "memory",
  "storage",
  "battery",
  "charging",
  "camera",
  "front_camera",
  "network",
  "os",
  "specs",
  "age_grade",
  "materials",
  "batteries",
  "dimensions",
  "weight",
  "in_the_box",
  "warranty",
  "returns",
];

export const TRADE_DETAILS = ["moq", "lead_time_days", "hs_code", "carton_qty", "country_of_origin"];

/** How a key is compared: NFKC (full-width → plain), lower case, runs of spaces as one. */
const keyOf = (value) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

const SHOPPER = new Set(SHOPPER_DETAILS.map(keyOf));
const TRADE = new Set(TRADE_DETAILS.map(keyOf));

/** Settings › "Also show these product details": keys separated by commas, semicolons, `|` or new lines (Chinese punctuation too). */
export const parseDetailKeys = (value) => {
  const keys = [];
  const seen = new Set();
  for (const part of String(value ?? "").split(/[,;|\n\r，；、]+/)) {
    const key = part.trim();
    if (key && !seen.has(keyOf(key))) {
      seen.add(keyOf(key));
      keys.push(key);
    }
  }
  return keys;
};

/** A value a shopper can read: text, a number, or a list of those. Anything else (an object, true/false) is not shown. */
export const detailValue = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").join(", ").trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value.trim();
  return "";
};

/** The label: the page language's word for a known key, else the key as stored (`refresh_rate` → "Refresh rate"). */
const labelFor = (key, language) => {
  const message = `spec_${keyOf(key)}`;
  const known = MESSAGES[language]?.[message] ?? MESSAGES.en[message];
  if (known) return known;
  const words = key.trim().replace(/_+/g, " ");
  return /^[a-z]/.test(words) ? words[0].toUpperCase() + words.slice(1) : words;
};

/**
 * `[[label, value]]` for one product's `content.attributes`, `extraKeys`
 * being Settings › "Also show these product details" (parsed). Empty values
 * are left out.
 */
export const productDetails = (attributes, { extraKeys = [], language = "en" } = {}) => {
  const source = attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes : {};
  const byKey = new Map();
  for (const key of Object.keys(source)) if (!byKey.has(keyOf(key))) byKey.set(keyOf(key), key);
  const rows = [];
  const add = (wanted) => {
    const stored = byKey.get(keyOf(wanted));
    if (stored === undefined) return;
    const value = detailValue(source[stored]);
    if (value) rows.push([labelFor(stored, language), value]);
  };
  for (const key of SHOPPER_DETAILS) add(key);
  for (const key of extraKeys) {
    const wanted = keyOf(key);
    if (!SHOPPER.has(wanted) && !TRADE.has(wanted)) add(key);
  }
  return rows;
};

// ---- Specs: busa-shop's own Products table ----

/** A label as it is compared: NFKC, lower case, no spaces, `_`, `-`, `.`, `/`, `()` or `:`. */
const squashLabel = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-.:/()（）·]+/g, "");

/** Keys a Specs line can name: the shopper details, and the barcode (shown when written there). */
export const SPEC_KEYS = [...SHOPPER_DETAILS, "gtin"];

// Other words people use for the same keys. The store languages' own labels
// (MESSAGES › spec_<key>) and the key itself are recognised without being listed.
const SPEC_SYNONYMS = {
  brand: ["品牌", "make"],
  model: ["型号", "机型"],
  color: ["color", "颜色", "配色"],
  screen: ["screen", "screen size", "屏幕", "屏幕尺寸", "显示屏"],
  processor: ["chip", "chipset", "cpu", "soc", "处理器", "芯片"],
  memory: ["memory", "ram", "内存", "运行内存", "运存"],
  storage: ["rom", "storage capacity", "存储", "机身存储", "存储容量"],
  battery: ["battery capacity", "电池", "电池容量"],
  charging: ["fast charging", "charging power", "快充", "充电", "充电功率"],
  camera: ["rear camera", "main camera", "cameras", "后置摄像头", "摄像头", "后摄", "主摄"],
  front_camera: ["selfie camera", "前置摄像头", "前摄"],
  network: ["网络", "网络制式"],
  os: ["os", "system", "系统", "操作系统"],
  specs: ["specifications", "spec", "规格", "参数", "规格参数"],
  age_grade: ["age", "age grade", "适用年龄", "年龄"],
  materials: ["material", "材质", "材料"],
  batteries: ["battery type", "电池规格", "所需电池"],
  dimensions: ["dimensions", "size", "尺寸", "产品尺寸"],
  weight: ["net weight", "重量", "净重"],
  in_the_box: ["what's in the box", "box contents", "package contents", "包装清单", "包装内容"],
  warranty: ["保修", "质保", "保修期"],
  returns: ["return policy", "退货", "退换货", "退货政策"],
  gtin: ["ean", "upc", "barcode", "条码", "条形码"],
};

const SPEC_LABELS = (() => {
  const map = new Map();
  const add = (label, key) => {
    const squashed = squashLabel(label);
    if (squashed && !map.has(squashed)) map.set(squashed, key);
  };
  for (const key of SPEC_KEYS) {
    add(key, key);
    for (const language of Object.keys(MESSAGES)) {
      const label = MESSAGES[language]?.[`spec_${key}`];
      if (label) add(label, key);
    }
    for (const synonym of SPEC_SYNONYMS[key] ?? []) add(synonym, key);
  }
  return map;
})();

/** The key a Specs label stands for (`"RAM"` → `memory`, `"电池"` → `battery`), or "" when it is the owner's own label. */
export const specKeyFor = (label) => SPEC_LABELS.get(squashLabel(label)) ?? "";

/**
 * The Specs cell of busa-shop's own Products → `{ attributes, extraKeys }`:
 * one entry per "Label: value" line (a full-width "：" works too), a known
 * label under its key, any other under the label as written. A line with no
 * label adds to `specs` (the free "Specifications" line). `extraKeys` are the
 * entries outside SHOPPER_DETAILS, in the owner's order, for `productDetails`.
 */
export const parseSpecs = (value) => {
  const attributes = {};
  const extraKeys = [];
  const free = [];
  for (const raw of String(value ?? "").split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•*]\s+/, "");
    if (!line) continue;
    const match = /^([^:：]{1,60})[:：]\s*(.+)$/.exec(line);
    if (!match) {
      free.push(line);
      continue;
    }
    const label = match[1].trim();
    const key = specKeyFor(label) || label;
    if (attributes[key] !== undefined) continue;
    attributes[key] = match[2].trim();
    if (!SHOPPER.has(keyOf(key))) extraKeys.push(key);
  }
  if (free.length && attributes.specs === undefined) attributes.specs = free.join("; ");
  return { attributes, extraKeys };
};
