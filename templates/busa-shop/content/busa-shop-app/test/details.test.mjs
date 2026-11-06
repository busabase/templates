// Which product details a product page shows (src/details.js), with the keys
// busa-product-hub's importer actually writes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, planProducts, shopProductFields } from "../../../scripts/import-products.mjs";
import { normalizeProduct, normalizeSettings } from "../src/catalog.js";
import { parseDetailKeys, parseSpecs, productDetails, SHOPPER_DETAILS, specKeyFor, TRADE_DETAILS } from "../src/details.js";
import { MESSAGES } from "../src/i18n.js";

// A budget phone as a Chinese seller's sheet has it (invented test data).
const PHONE_CSV = [
  "商品编号,商品名称,品牌,型号,颜色,运行内存,机身存储(GB),屏幕,处理器,电池(mAh),快充(W),后置摄像头,前置摄像头,网络,系统,包装清单,保修,售价,币种,库存,状态,生命周期,起订量,交期,海关编码,装箱数,原产地,防水等级,直播话术",
  "test-phone-a1,测试手机 A1,Xinghe,A1 TEST,星空蓝,8GB,256,6.7 英寸 120Hz AMOLED,天玑 7025,5110,33,5000 万像素主摄,800 万像素,5G 双卡,Android 14（HyperOS），预装 Google Play,手机 | 33W 充电器 | USB-C 数据线 | 保护壳,1 年保修,199,USD,40,active,active,100,15,8517.13,40,China,IP54,今天下单送贴膜",
].join("\n");

const importedAttributes = () => {
  const [product] = planProducts(parseCsv(PHONE_CSV)).products;
  return product.attributes;
};

describe("the keys the page knows", () => {
  it("every shopper key and EAN / GTIN has a label in every site language", () => {
    for (const [language, table] of Object.entries(MESSAGES)) {
      for (const key of [...SHOPPER_DETAILS, "gtin"]) assert.ok(table[`spec_${key}`], `${language}: spec_${key}`);
    }
  });

  it("are the importer's own canonical keys for these columns", () => {
    const attributes = importedAttributes();
    for (const key of ["brand", "model", "color", "memory", "storage", "screen", "processor", "battery", "charging", "camera", "front_camera", "network", "os", "in_the_box", "warranty"]) {
      assert.ok(SHOPPER_DETAILS.includes(key), key);
      assert.ok(attributes[key], `the importer writes ${key}`);
    }
    for (const key of TRADE_DETAILS) assert.ok(key in attributes, `the importer writes ${key}`);
    assert.equal(attributes.battery, "5110 mAh");
    assert.equal(attributes.charging, "33 W");
    assert.equal(attributes.storage, "256 GB");
    assert.equal(attributes["防水等级"], "IP54", "an unknown column is kept under its header");
  });
});

describe("productDetails", () => {
  it("shows a phone's specs in a stable order, and nothing for the trade or unknown columns", () => {
    const rows = productDetails(importedAttributes());
    assert.deepEqual(rows, [
      ["Brand", "Xinghe"],
      ["Model", "A1 TEST"],
      ["Colour", "星空蓝"],
      ["Display", "6.7 英寸 120Hz AMOLED"],
      ["Processor", "天玑 7025"],
      ["RAM", "8GB"],
      ["Storage", "256 GB"],
      ["Battery", "5110 mAh"],
      ["Charging", "33 W"],
      ["Camera", "5000 万像素主摄"],
      ["Front camera", "800 万像素"],
      ["Network", "5G 双卡"],
      ["Operating system", "Android 14（HyperOS），预装 Google Play"],
      ["In the box", "手机 | 33W 充电器 | USB-C 数据线 | 保护壳"],
      ["Warranty", "1 年保修"],
    ]);
  });

  it("labels in the page language", () => {
    const rows = Object.fromEntries(productDetails(importedAttributes(), { language: "de" }));
    assert.equal(rows.Akku, "5110 mAh");
    assert.equal(rows.Lieferumfang, "手机 | 33W 充电器 | USB-C 数据线 | 保护壳");
    assert.equal(Object.fromEntries(productDetails(importedAttributes(), { language: "fr" }))["Système d'exploitation"], "Android 14（HyperOS），预装 Google Play");
  });

  it("keeps the toy keys in their old order", () => {
    const rows = productDetails({ returns: "30-day returns", weight: "0.32 kg", age_grade: "3+", moq: 48, hs_code: "9503.00", batteries: "2 × AA", materials: "ABS", dimensions: "14 × 9 × 21 cm", warranty: "1 year" });
    assert.deepEqual(rows.map(([label]) => label), ["Age", "Materials", "Batteries", "Size", "Weight", "Warranty", "Returns"]);
  });

  it("adds the keys Settings name, after the known ones, but never a trade key", () => {
    const extraKeys = parseDetailKeys("防水等级， moq、HS_CODE; gtin\nbattery | refresh_rate, nothing-here");
    const rows = productDetails({ ...importedAttributes(), gtin: "6941812345678", refresh_rate: "120 Hz" }, { extraKeys });
    assert.deepEqual(rows.slice(-3), [
      ["防水等级", "IP54"],
      ["EAN / GTIN", "6941812345678"],
      ["Refresh rate", "120 Hz"],
    ]);
    assert.equal(rows.filter(([label]) => label === "Battery").length, 1, "a known key named again is not shown twice");
    const text = JSON.stringify(rows);
    for (const hidden of ["100", "8517.13", "China", "今天下单送贴膜"]) assert.ok(!text.includes(hidden), hidden);
  });

  it("matches keys whatever their case or width, and skips values a shopper cannot read", () => {
    const rows = productDetails({ Brand: " Xinghe ", COLOR: ["黑", "蓝", { x: 1 }], storage: "", battery: { mAh: 5000 }, network: true, os: 14 }, { extraKeys: ["ｍｏｑ"] });
    assert.deepEqual(rows, [
      ["Brand", "Xinghe"],
      ["Colour", "黑, 蓝"],
      ["Operating system", "14"],
    ]);
    assert.deepEqual(productDetails(null), []);
    assert.deepEqual(productDetails(["brand"]), []);
  });

  it("reads Settings › Also show these product details", () => {
    assert.deepEqual(normalizeSettings({ fields: { "show-details": " 防水等级 ,gtin,,GTIN " } }).showDetails, ["防水等级", "gtin"]);
    assert.deepEqual(normalizeSettings({ fields: {} }).showDetails, [], "a shop installed before the field existed shows the known keys only");
  });
});

describe("Specs in the shop's own Products", () => {
  it("reads one \"Label: value\" per line: known labels as their key, the owner's own labels as written, in order", () => {
    const { attributes, extraKeys } = parseSpecs("Battery: 5110 mAh\n运行内存：8 GB\n- Front camera: 8 MP\nIP rating: IP54\nAll-day battery\n\nEAN / GTIN: 6941234567890");
    assert.deepEqual(attributes, { battery: "5110 mAh", memory: "8 GB", front_camera: "8 MP", "IP rating": "IP54", gtin: "6941234567890", specs: "All-day battery" });
    assert.deepEqual(extraKeys, ["IP rating", "gtin"]);
    assert.equal(specKeyFor("Akku"), "battery", "the store languages' own words");
    assert.equal(specKeyFor("Écran"), "screen");
    assert.equal(specKeyFor("保修"), "warranty");
    assert.equal(specKeyFor("Weight (kg)"), "", "a label it does not know stays the owner's");
    assert.deepEqual(parseSpecs(undefined), { attributes: {}, extraKeys: [] });
  });

  it("a phone imported into the shop's table shows the same details, in the same order, as from a product hub", () => {
    const [phone] = planProducts(parseCsv(PHONE_CSV)).products;
    const fields = shopProductFields(phone);
    assert.equal(fields.brand, "Xinghe");
    assert.match(fields.specs, /^Colour: 星空蓝\nDisplay: 6\.7 英寸 120Hz AMOLED\nProcessor: 天玑 7025\nRAM: 8GB\nStorage: 256 GB\nBattery: 5110 mAh/);
    assert.match(fields.notes, /^MOQ: 100$/m);
    assert.match(fields.notes, /^防水等级: IP54$/m, "a column it does not know is the owner's, in Notes");
    const fromShop = normalizeProduct({ fields }, { shape: "shop" });
    const fromHub = productDetails(phone.attributes);
    assert.deepEqual(productDetails(fromShop.content.attributes, { extraKeys: fromShop.specKeys }), fromHub);
    // Moved into Specs by the owner, an unknown line is shown; a trade one never is.
    const edited = normalizeProduct({ fields: { ...fields, specs: `${fields.specs}\n防水等级: IP54\nMOQ: 100` } }, { shape: "shop" });
    const rows = productDetails(edited.content.attributes, { extraKeys: edited.specKeys });
    assert.deepEqual(rows.at(-1), ["防水等级", "IP54"]);
    assert.ok(!rows.some(([label]) => label === "MOQ"));
  });
});
