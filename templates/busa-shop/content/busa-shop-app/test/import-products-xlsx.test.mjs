// scripts/import-products.mjs reading Excel (into a busa-product-hub table here; the shop's own table is import-products-shop.test.mjs): a workbook built
// here the way Excel and WPS write one (shared strings, a date style, a currency
// format, merged cells, a title row, floating pictures, Excel's "Place in Cell"
// pictures and WPS's DISPIMG pictures), imported against the fake Busabase with
// the real busabase-sdk. Plus files written by XlsxWriter and LibreOffice, and
// the template spreadsheet. Every product here is invented test data.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { createBusabaseClient, uploadAsset } from "busabase-sdk";
import { createAirAppRecords } from "busabase-sdk/airapp";
import {
  canonicalCertType,
  decodeText,
  excelDate,
  formatSummary,
  main,
  parseDate,
  parseMoney,
  readDelimited,
  readHeader,
  readProductSheet,
  readXlsx,
  runImport,
  templateWorkbook,
} from "../../../scripts/import-products.mjs";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { NODES } from "./fixtures.mjs";

const hubBase = async (name) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`../../../../busa-product-hub/content/${name}/base.json`, import.meta.url)), "utf8"));
const hubCertificatesBase = await hubBase("certificates");
const hubProductsBase = await hubBase("products");
const TEMPLATE_ASSET = fileURLToPath(new URL("../../../assets/import/products-template.xlsx", import.meta.url));
const HUB_TEMPLATE_ASSET = fileURLToPath(new URL("../../../../busa-product-hub/assets/import/products-template.xlsx", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const sdk = { createBusabaseClient, uploadAsset, createAirAppRecords };

// ------------------------------------------------ a tiny PNG and .xlsx ----

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, 8 + data.length);
  return out;
};
/** A valid 4×4 PNG of one colour, so each picture has its own bytes. */
const png = (r, g, b) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const RED = png(220, 40, 40);
const BLUE = png(40, 80, 220);
const GREEN = png(40, 160, 80);
const GOLD = png(230, 180, 30);
const GREY = png(120, 120, 120);

/** Stored (uncompressed) zip: a different code path from the importer's own deflated writer. */
const zipStore = (files) => {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const nameBytes = Buffer.from(name);
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(10, 4);
    entry.writeUInt16LE(10, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
};

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const letters = (n) => (n > 26 ? letters(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * A workbook the way Excel/WPS write one. A sheet is `{ name, state, rows,
 * merges, floating: [{ col, row, rowOff, png }] }`; a row cell is a string
 * (shared), a number, null, or `{ v, style }` / `{ inCell: png }` /
 * `{ wps: png }` / `{ formula, v }`. Styles: 1 = date (numFmt 14), 2 = ¥ (zh-CN).
 */
const buildWorkbook = (sheets) => {
  const shared = [];
  const sharedIndex = (text) => {
    let at = shared.indexOf(text);
    if (at < 0) at = shared.push(text) - 1;
    return at;
  };
  const media = [];
  const richRels = [];
  const wps = [];
  const files = [];
  const sheetFiles = sheets.map((sheet, sheetIndex) => {
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const r = rowIndex + 1;
        const cells = row
          .map((value, colIndex) => {
            const ref = `${letters(colIndex + 1)}${r}`;
            if (value === null || value === undefined) return "";
            if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
            if (typeof value === "string") return `<c r="${ref}" t="s"><v>${sharedIndex(value)}</v></c>`;
            if (value.inCell) {
              media.push(value.inCell);
              richRels.push(media.length);
              return `<c r="${ref}" t="e" vm="${richRels.length}"><v>#VALUE!</v></c>`;
            }
            if (value.wps) {
              media.push(value.wps);
              const id = `ID_${String(wps.length + 1).padStart(4, "0")}TESTWPS`;
              wps.push({ id, image: media.length });
              return `<c r="${ref}" t="str"><f>_xlfn.DISPIMG("${id}",1)</f><v>=DISPIMG("${id}",1)</v></c>`;
            }
            if (value.formula) return `<c r="${ref}" t="str"><f>${esc(value.formula)}</f><v>${esc(value.v ?? "")}</v></c>`;
            return `<c r="${ref}" s="${value.style}"><v>${value.v}</v></c>`;
          })
          .join("");
        return `<row r="${r}">${cells}</row>`;
      })
      .join("");
    const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
    const drawing = sheet.floating?.length ? '<drawing r:id="rId1"/>' : "";
    if (sheet.floating?.length) {
      const anchors = sheet.floating
        .map((picture, index) => {
          media.push(picture.png);
          return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${picture.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${picture.row}</xdr:row><xdr:rowOff>${picture.rowOff ?? 0}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${picture.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${picture.row + 2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 2}" name="Picture ${index + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${index + 1}"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
        })
        .join("");
      const first = media.length - sheet.floating.length + 1;
      files.push([
        `xl/drawings/drawing${sheetIndex + 1}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`,
      ]);
      files.push([
        `xl/drawings/_rels/drawing${sheetIndex + 1}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheet.floating.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${first + index}.png"/>`).join("")}</Relationships>`,
      ]);
      files.push([
        `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetIndex + 1}.xml"/></Relationships>`,
      ]);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS}><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData>${merges}${drawing}</worksheet>`;
  });
  const workbookRels = [
    ...sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`),
    '<Relationship Id="rS1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
    '<Relationship Id="rS2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  ];
  if (richRels.length) {
    workbookRels.push(
      '<Relationship Id="rM1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/>',
      '<Relationship Id="rM2" Type="http://schemas.microsoft.com/office/2022/10/relationships/richValueRel" Target="richData/richValueRel.xml"/>',
      '<Relationship Id="rM3" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue" Target="richData/rdrichvalue.xml"/>',
      '<Relationship Id="rM4" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure" Target="richData/rdrichvaluestructure.xml"/>',
    );
    const blocks = richRels.map((_, index) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${index}"/></ext></extLst></bk>`).join("");
    files.push([
      "xl/metadata.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${richRels.length}">${blocks}</futureMetadata><valueMetadata count="${richRels.length}">${richRels.map((_, index) => `<bk><rc t="1" v="${index}"/></bk>`).join("")}</valueMetadata></metadata>`,
    ]);
    files.push([
      "xl/richData/rdrichvaluestructure.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvStructures xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>',
    ]);
    files.push([
      "xl/richData/rdrichvalue.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="${richRels.length}">${richRels.map((_, index) => `<rv s="0"><v>${index}</v><v>5</v></rv>`).join("")}</rvData>`,
    ]);
    files.push([
      "xl/richData/richValueRel.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${richRels.map((_, index) => `<rel r:id="rId${index + 1}"/>`).join("")}</richValueRels>`,
    ]);
    files.push([
      "xl/richData/_rels/richValueRel.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${richRels.map((image, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${image}.png"/>`).join("")}</Relationships>`,
    ]);
  }
  if (wps.length) {
    workbookRels.push('<Relationship Id="rW1" Type="http://www.wps.cn/officeDocument/2020/cellImage" Target="cellimages.xml"/>');
    files.push([
      "xl/cellimages.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><etc:cellImages xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData">${wps.map(({ id }, index) => `<etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 2}" name="${id}" descr=""/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr/></xdr:pic></etc:cellImage>`).join("")}</etc:cellImages>`,
    ]);
    files.push([
      "xl/_rels/cellimages.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wps.map(({ image }, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${image}.png"/>`).join("")}</Relationships>`,
    ]);
  }
  return zipStore([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8"?><workbook ${NS}><sheets>${sheets.map((sheet, index) => `<sheet name="${esc(sheet.name)}" sheetId="${index + 1}"${sheet.state ? ` state="${sheet.state}"` : ""} r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    ],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join("")}</Relationships>`],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$¥-804]#,##0.00"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ],
    ...sheetFiles.map((xml, index) => [`xl/worksheets/sheet${index + 1}.xml`, xml]),
    ["xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((text) => `<si><t xml:space="preserve">${esc(text)}</t></si>`).join("")}</sst>`],
    ...files,
    ...media.map((bytes, index) => [`xl/media/image${index + 1}.png`, bytes]),
  ]);
};

// The course's kind of file: invented phones, Chinese headers, pictures inside.
const PHONES = () =>
  buildWorkbook([
    { name: "说明", rows: [["这是测试数据：手机都是编的。"], ["Test data: these phones are made up."]] },
    {
      name: "商品 Products",
      merges: ["A1:L1", "A3:A4"],
      floating: [
        { col: 9, row: 2, png: BLUE }, // J3, the gallery column of row 3
        { col: 8, row: 5, rowOff: 160000, png: GREY }, // the lower half of row 6: belongs to row 7
        { col: 8, row: 8, png: GOLD }, // row 9: a row with nothing else
      ],
      rows: [
        ["手机报价（测试数据 test data）"],
        ["品牌", "商品名称", "型号", "颜色", "存储(GB)", "售价(元)", "库存", "状态", "主图", "图集", "防水等级", "FCC ID", null, "序号"],
        ["星河", "星河 S1（测试）", "S1", "黑色", 256, { v: 2999, style: 2 }, 120, "在售", { inCell: RED }, null, "IP68", "2A-TEST-S1", "备注在没有表头的列", 1],
        [null, "星河 S1 Pro（测试）", "S1P", "白色", 512, "3,999", "80台", "在售", "https://cdn.example/s1pro.png", null, null, null, null, 2],
        ["云雀", "云雀 Note（测试）", "N1", "蓝色", 128, null, "缺货", "草稿", { wps: GREEN }, null, "IP54", "是", null, 3],
        ["云雀", "云雀 Mini（测试）", "M1", "绿色", 64, "¥1,099", 30, "active", null, null, null, null, null, 4],
        ["云雀", "云雀 Lite（测试）", "L1", "灰色", 64, 999, 10, "active", "lite.png", null, null, null, null, 5],
      ],
    },
    {
      name: "认证 Certificates",
      rows: [
        ["名称", "认证类型", "证书编号", "发证机构", "有效期至"],
        ["星河 S1（测试）", "CE认证", "CE-TEST-001", "测试实验室（编的）", { v: 46783, style: 1 }],
        ["不存在的手机", "CE", "CE-TEST-404", "测试实验室（编的）", "2028-01-31"],
      ],
    },
    { name: "lists", state: "hidden", rows: [["状态", "在售"], ["草稿"]] },
  ]);

let api;
let dir;
const env = () => ({ BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo" });
const products = () => api.state.records.bas_products;
const certificates = () => api.state.records.bas_certificates;
const byName = (name) => products().find((row) => row.fields.name === name);
const writes = () => api.log.filter((entry) => entry.method !== "GET");
const freshState = () => ({
  nodes: Object.values(NODES),
  records: { bas_products: [], bas_certificates: [], bas_settings: [], bas_orders: [], bas_reports: [] },
  bases: { bas_certificates: { name: "Certificates", fields: structuredClone(hubCertificatesBase.fields) }, bas_products: { name: "Products", fields: structuredClone(hubProductsBase.fields) } },
  files: {},
  assets: {},
});
const run = (options = {}) => runImport({ catalogPath: path.join(dir, "phones.xlsx"), env: env(), sdk, now: () => new Date("2026-11-06T09:00:00Z"), ...options });

before(async () => {
  api = await startFakeBusabase(freshState());
  dir = await mkdtemp(path.join(tmpdir(), "busa-import-xlsx-"));
  await writeFile(path.join(dir, "phones.xlsx"), PHONES());
  await writeFile(path.join(dir, "lite.png"), GREY);
});

beforeEach(() => {
  for (const key of Object.keys(api.state)) delete api.state[key];
  Object.assign(api.state, freshState());
  Object.assign(api.options, { failCreates: false, queueCreates: false, queueUpdates: false, failReads: false });
  api.reset();
  api.log.length = 0;
});

after(async () => {
  await api.close();
  await rm(dir, { recursive: true, force: true });
});

describe("import-products.mjs: an Excel workbook with pictures inside", () => {
  it("the dry run is a preview the owner can read: one row per product, the pictures, the empty cells, how each column was read", async () => {
    const summary = await run({ dryRun: true, imagesDir: dir });
    assert.deepEqual(writes(), [], "a dry run writes and uploads nothing");
    assert.equal(summary.sheet, "商品 Products", "the instructions sheet before it has no table and is passed over");
    assert.equal(summary.headerRow, 2, "the title row above the headers is not a header");
    assert.equal(summary.certificatesFrom, "phones.xlsx › 认证 Certificates");
    assert.deepEqual(summary.products, { created: 5, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.equal(summary.picturesInFile, 4, "on product rows; the fifth, on a row with no product, is a note");
    assert.deepEqual(
      summary.rows.map((row) => [row.where, row.name, row.price, row.currency, row.stock, row.pictures.map((picture) => picture.label)]),
      [
        ["row 3", "星河 S1（测试）", 2999, "CNY", 120, ["I3 in the cell", "J3 in the sheet"]],
        ["row 4", "星河 S1 Pro（测试）", 3999, "CNY", 80, ["link"]],
        ["row 5", "云雀 Note（测试）", null, "", 0, ["I5 in the cell (WPS)"]],
        ["row 6", "云雀 Mini（测试）", 1099, "CNY", 30, []],
        ["row 7", "云雀 Lite（测试）", 999, "CNY", 10, ["lite.png", "I7 in the sheet"]],
      ],
    );
    const text = formatSummary(summary);
    assert.match(text, /^Dry run, nothing was written or uploaded\. Products table: busa-product-hub-products/);
    assert.match(text, /Read from: phones\.xlsx, sheet "商品 Products", headers on row 2; certificates from phones\.xlsx › 认证 Certificates/);
    assert.match(text, /\| Row \| Product ID \| Name \| Price \| Stock \| Pictures \| Result \| Empty \|/);
    assert.match(text, /\| 3 \| s1-256-[0-9a-f]{6}\* \| 星河 S1（测试） \| 2999 CNY \| 120 \| 2: I3 in the cell, J3 in the sheet \| create \| lifecycle, description \|/);
    assert.match(text, /\| 5 \| note-n1-128-[0-9a-f]{6}\* \| 云雀 Note（测试） \| — \| 0 \| 1: I5 in the cell \(WPS\) \| create \| price, currency, lifecycle, description \|/);
    assert.match(text, /\| 7 \| [^|]+ \| 云雀 Lite（测试） \| 999 CNY \| 10 \| 2: lite\.png, I7 in the sheet \(same picture again\) \| create \| lifecycle, description \|/);
    assert.match(text, /\* No product ID column: these IDs were made from the name and variant\./);
    assert.match(text, /- K "防水等级" → not a known column; kept as the product detail "防水等级" \(in the record's Content JSON, content\.attributes; a Busa Shop website shows it only when its Settings › Also show these product details names it\)/);
    assert.match(text, /- C "型号" → product detail "model"/);
    assert.match(text, /- E "存储\(GB\)" → product detail "storage" \(unit "GB" added to bare numbers\)/);
    assert.match(text, /- F "售价\(元\)" → price \(header says "元"\)/);
    assert.match(text, /- L "FCC ID" → FCC certificate number/);
    assert.match(text, /- N "序号" → row numbers, not imported/);
    assert.match(text, /M has values but no header \(M3\): left out\. Give the column a header to import it\./);
    assert.match(text, /merged cells A3:A4: "星河" read on rows 3–4/);
    assert.match(text, /a picture at I9 is on row 9, which has no product: left out\. If it belongs to the row above, move it into that row/);
    assert.match(text, /certificate [^:]+ FCC: row 5: FCC ID says yes but gives no certificate number/);
    assert.match(text, /certificate CE CE-TEST-404: row 3: no product ID, SKU or name that matches a product in the list/);
    assert.match(
      text,
      /Busa Shop lists a product only with lifecycle active\/launch, status active\/approved\/live, a price and a currency\. 5 of 5 would not be listed as they are: no lifecycle \(5 products\); status "draft" \(云雀 Note（测试）\); no price \(云雀 Note（测试）\); no currency \(云雀 Note（测试）\)\. If the owner wants them on sale, fill the sheet, or run with --fill lifecycle=active --currency <CODE> \(it fills only empty cells\)\./,
    );
    assert.match(text, /Nothing was written\. If the owner agrees with this, run the same command again without --dry-run\./);
  });

  it("imports the products with their pictures and certificates, and a second run changes nothing", async () => {
    const summary = await run({ imagesDir: dir, fill: { lifecycle: "active" } });
    assert.deepEqual(summary.products, { created: 5, updated: 0, unchanged: 0, skipped: 0, queued: 0 });
    assert.deepEqual(summary.images, { uploaded: 4, reused: 0, missing: 0 });
    assert.equal(summary.certificates.created, 2, "the CE row of the certificates sheet and the FCC ID column");

    const s1 = byName("星河 S1（测试）").fields;
    assert.match(s1["product-id"], /^s1-256-[0-9a-f]{6}$/, "no ID column: made from the name and the storage (the model is already in the name)");
    assert.equal(s1.price, 2999);
    assert.equal(s1.currency, "CNY");
    assert.equal(s1.status, "active", "在售 is the hub's active");
    assert.equal(s1.lifecycle, "active", "--fill lifecycle=active, because the sheet has no lifecycle column");
    assert.deepEqual(JSON.parse(s1.inventory), { available: 120 });
    const content = JSON.parse(s1.content);
    assert.deepEqual(content.attributes, { brand: "星河", model: "S1", color: "黑色", storage: "256 GB", 防水等级: "IP68" });
    assert.equal(content.source, "phones.xlsx › 商品 Products");
    assert.deepEqual(content.image_files.map((image) => image.file), [`${s1["product-id"]}-1.png`, `${s1["product-id"]}-2.png`]);
    assert.equal(content.images_ready, true);
    const gallery = JSON.parse(s1.gallery);
    assert.equal(s1.image, gallery[0]);
    // The uploaded bytes are the pictures in the workbook: the in-cell one first, then the floating one.
    assert.deepEqual(api.state.assets[gallery[0].split("/assets/")[1]].bytes, RED);
    assert.deepEqual(api.state.assets[gallery[1].split("/assets/")[1]].bytes, BLUE);

    const pro = byName("星河 S1 Pro（测试）").fields;
    assert.equal(pro.image, "https://cdn.example/s1pro.png", "an https link is used as it is");
    assert.equal(JSON.parse(pro.content).attributes.brand, "星河", "the merged brand cell counts for both rows");
    assert.equal(pro.price, 3999);

    const note = byName("云雀 Note（测试）").fields;
    assert.equal(note.price, undefined, "no price in the sheet, none invented");
    assert.equal(note.currency, undefined);
    assert.equal(note.status, "draft");
    assert.deepEqual(JSON.parse(note.inventory), { available: 0 }, "缺货 is 0 in stock");
    assert.deepEqual(api.state.assets[note.image.split("/assets/")[1]].bytes, GREEN, "the WPS in-cell picture");

    const lite = byName("云雀 Lite（测试）").fields;
    assert.deepEqual(
      JSON.parse(lite.gallery).map((url) => api.state.assets[url.split("/assets/")[1]].bytes),
      [GREY],
      "lite.png from the folder and the same picture floating on the row are one picture",
    );

    const ce = certificates().find((row) => row.fields["cert-number"] === "CE-TEST-001").fields;
    assert.deepEqual(ce, {
      product: [byName("星河 S1（测试）").id],
      "cert-type": "CE",
      "cert-number": "CE-TEST-001",
      issuer: "测试实验室（编的）",
      "expiry-date": "2028-01-31",
      "source-note": "phones.xlsx › 认证 Certificates row 2",
    });
    const fcc = certificates().find((row) => row.fields["cert-type"] === "FCC").fields;
    assert.equal(fcc["cert-number"], "2A-TEST-S1");
    assert.equal(fcc["source-note"], "phones.xlsx › 商品 Products row 3 (FCC ID)");
    assert.ok(writes().every((entry) => entry.method === "PUT" || !JSON.parse(entry.body).autoMerge), "never sends autoMerge");

    const text = formatSummary(summary);
    assert.match(text, /\| 3 \| [^|]+ \| 星河 S1（测试） \| 2999 CNY \| 120 \| 2: I3 in the cell, J3 in the sheet \| created \| description \|/);
    assert.match(text, /Filled in where both the sheet and the table were empty, because you asked: lifecycle = active/);

    const before = JSON.stringify(api.state.records);
    api.log.length = 0;
    const again = await run({ imagesDir: dir, fill: { lifecycle: "active" } });
    assert.deepEqual(again.products, { created: 0, updated: 0, unchanged: 5, skipped: 0, queued: 0 });
    assert.deepEqual(again.images, { uploaded: 0, reused: 4, missing: 0 });
    assert.equal(again.certificates.unchanged, 2);
    assert.deepEqual(writes(), []);
    assert.equal(JSON.stringify(api.state.records), before);
  });

  it("--currency fills only prices that say none, and --fill never overwrites the sheet or the table", async () => {
    await run({ imagesDir: dir });
    const mini = byName("云雀 Mini（测试）");
    mini.fields.status = "needs_review"; // the owner's own edit in the table
    api.log.length = 0;
    const summary = await run({ imagesDir: dir, currency: "USD", fill: { status: "live", lifecycle: "launch" } });
    assert.equal(byName("星河 S1（测试）").fields.currency, "CNY", "the sheet says 元: --currency does not change it");
    assert.equal(byName("云雀 Note（测试）").fields.currency, "USD", "the one product with no currency at all gets it");
    assert.equal(byName("星河 S1（测试）").fields.status, "active", "the sheet's 在售 wins over --fill");
    assert.equal(byName("云雀 Mini（测试）").fields.status, "active", "the sheet says active, so it is written over the owner's edit, as any value in the list is");
    assert.equal(byName("星河 S1（测试）").fields.lifecycle, "launch", "no lifecycle in the sheet or the table: filled");
    assert.equal(summary.rows.find((row) => row.name === "云雀 Note（测试）").currencyFrom, "--currency");
    await assert.rejects(run({ currency: "RMB1" }), /--currency "RMB1" is not a 3-letter code/);
    assert.equal((await run({ dryRun: true, currency: "RMB" })).fill.currency, "CNY", "RMB is written CNY");
    await assert.rejects(run({ fill: { price: "1" } }), /--fill price=… is not allowed; only currency, status, lifecycle, category, vendor/);
  });

  it("without write access, reports what waits for review", async () => {
    api.options.queueCreates = true;
    const summary = await run({ imagesDir: dir });
    assert.equal(summary.products.queued, 5);
    assert.match(formatSummary(summary), /\| 3 \| [^|]+ \| 星河 S1（测试） \| 2999 CNY \| 120 \| [^|]+ \| waiting for review \|/);
  });
});

describe("import-products.mjs reads files written by real spreadsheet programs", () => {
  // Made with XlsxWriter 3.2.9 (its embed_image() writes Excel's "Place in Cell" structure,
  // which its test suite checks against files saved by Excel):
  //   ws.write_row(0, 0, ["名称", "售价", "图片"])
  //   ws.write_row(1, 0, ["A phone", 5999]); ws.embed_image(1, 2, "red.png")
  //   ws.write_row(2, 0, ["B phone", 3999]); ws.insert_image(2, 2, "blue.png")
  //   ws.write_row(3, 0, ["C phone", 1999]); ws.embed_image(3, 2, "green.png")
  it("XlsxWriter: Place in Cell pictures and a floating one, each on its own row", async () => {
    const book = readXlsx(await readFile(`${FIXTURES}xlsxwriter-pictures.xlsx`));
    const table = readProductSheet(book.sheets[0]);
    assert.deepEqual(
      table.rows.map((row) => [row.name, row.price, row.__pictures.map((picture) => `${picture.cell} ${picture.kind}`)]),
      [
        ["A phone", "5999", ["C2 in-cell"]],
        ["B phone", "3999", ["C3 floating"]],
        ["C phone", "1999", ["C4 in-cell"]],
      ],
    );
  });

  // Made with openpyxl 3.1.5 (title row, merged brand cells, a date, pictures in F3:F5), then
  // converted by LibreOffice 24 (`soffice --headless --convert-to xlsx`). LibreOffice measures the
  // rows again and re-anchors every picture near the bottom of the row above its own.
  it("LibreOffice: pictures it re-anchored at the bottom of the row above stay with their product", async () => {
    const book = readXlsx(await readFile(`${FIXTURES}libreoffice-pictures.xlsx`));
    const table = readProductSheet(book.sheets[0]);
    assert.equal(table.headerRow, 2);
    assert.deepEqual(
      table.rows.map((row) => [row.name, row.__attributes.brand?.value, row.launch_date, row.__pictures.map((picture) => picture.cell)]),
      [
        ["星河 S1", "星河", "2026-03-15", ["F3"]],
        ["星河 S1 Pro", "星河", "2026-05-01", ["F4"]],
        ["云雀 Note", "云雀", "2026/7/1", ["F5"]],
      ],
    );
  });
});

describe("import-products.mjs: reading cells and headers", () => {
  it("understands English, Chinese and bilingual headers", () => {
    const read = (header) => {
      const { target, hint } = readHeader(header);
      return target ? { ...target, ...(hint ? { hint } : {}) } : null;
    };
    assert.deepEqual(read("商品名称"), { field: "name" });
    assert.deepEqual(read("品名"), { field: "name" });
    assert.deepEqual(read("名称 Name"), { field: "name" });
    assert.deepEqual(read("Product ID"), { field: "product_id" });
    assert.deepEqual(read("商品编号 Product ID"), { field: "product_id" });
    assert.deepEqual(read("售价（元）"), { field: "price", hint: "元" });
    assert.deepEqual(read("Price (USD)"), { field: "price", hint: "USD" });
    assert.deepEqual(read("零售价*"), { field: "price" });
    assert.deepEqual(read("售价(必填)"), { field: "price" });
    assert.deepEqual(read("币种"), { field: "currency" });
    assert.deepEqual(read("进价"), { field: "cogs" });
    assert.deepEqual(read("库存"), { field: "stock_available" });
    assert.deepEqual(read("运行内存"), { attribute: "memory" });
    assert.deepEqual(read("机身存储"), { attribute: "storage" });
    assert.deepEqual(read("屏幕尺寸(英寸)"), { attribute: "screen", hint: "英寸" });
    assert.deepEqual(read("图片2"), { field: "image" });
    assert.deepEqual(read("Image 3"), { field: "image" });
    assert.deepEqual(read("图集"), { field: "gallery" });
    assert.deepEqual(read("FCC ID"), { certificate: "FCC" });
    assert.deepEqual(read("CE证书编号"), { certificate: "CE" });
    assert.deepEqual(read("UN38.3"), { certificate: "UN38.3" });
    assert.deepEqual(read("EN71 Certificate No."), { certificate: "EN 71" });
    assert.equal(read("防水等级"), null, "unknown: the importer keeps it as a detail under its own header");
    assert.equal(canonicalCertType("CPC"), "CPSIA / CPC");
    assert.equal(canonicalCertType("ASTM F-963"), "ASTM F963");
    assert.equal(canonicalCertType("3C"), "3C", "not a hub type: kept, then refused with the table's list");
  });

  it("reads prices, dates and Excel's date serials the way a person wrote them", () => {
    assert.deepEqual(parseMoney("¥5,999.00", { language: "zh" }), { amount: 5999, currency: "CNY" });
    assert.deepEqual(parseMoney("¥5999", { language: "ja" }), { amount: 5999, currency: "JPY" });
    assert.deepEqual(parseMoney("¥5999"), { amount: 5999, currency: "" }, "¥ alone does not say CNY or JPY");
    assert.deepEqual(parseMoney("5999元/台"), { amount: 5999, currency: "CNY" });
    assert.deepEqual(parseMoney("US$ 999"), { amount: 999, currency: "USD" });
    assert.deepEqual(parseMoney("HK$7,999"), { amount: 7999, currency: "HKD" });
    assert.deepEqual(parseMoney("999 EUR"), { amount: 999, currency: "EUR" });
    assert.deepEqual(parseMoney("$999"), { amount: 999, currency: "" }, "a bare $ names no currency");
    assert.deepEqual(parseMoney("2999", { numberFormat: "[$¥-804]#,##0.00" }), { amount: 2999, currency: "CNY" });
    assert.deepEqual(parseMoney("面议"), { amount: null, currency: "" });
    assert.deepEqual(parseMoney("1,299-1,599"), { amount: null, currency: "" });
    assert.equal(parseDate("2027年4月10日"), "2027-04-10");
    assert.equal(parseDate("2027/4/1"), "2027-04-01");
    assert.equal(parseDate("10/04/2027"), "", "day/month order is unclear: left out, not guessed");
    assert.equal(parseDate("2027-02-30"), "");
    assert.equal(excelDate(46783), "2028-01-31");
    assert.equal(excelDate(1), "1900-01-01");
    assert.equal(excelDate(61), "1900-03-01", "after Excel's 29 February 1900");
    assert.equal(excelDate(45000, true), "2027-03-16", "the 1904 date system");
    assert.equal(excelDate(45000.5), "2023-03-15 12:00");
  });

  it("reads CSV from Chinese Windows Excel (GB18030), with semicolons, or UTF-16", () => {
    const gbk = Buffer.from([0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xca, 0xdb, 0xbc, 0xdb, 0x0a, 0xd0, 0xc7, 0xba, 0xd3, 0x2c, 0x39, 0x39, 0x0a]); // 名称,售价\n星河,99
    assert.deepEqual(decodeText(gbk), { text: "名称,售价\n星河,99\n", encoding: "GB18030 (Chinese Windows Excel)" });
    const sheet = readDelimited(gbk);
    assert.deepEqual(sheet.notes, ["read as GB18030 (Chinese Windows Excel)"]);
    assert.deepEqual(readProductSheet(sheet).rows.map((row) => [row.name, row.price]), [["星河", "99"]]);
    const semicolons = readDelimited(Buffer.from("name;price\nWidget;12,50\n"));
    assert.deepEqual(readProductSheet(semicolons).rows.map((row) => [row.name, row.price]), [["Widget", "12,50"]]);
    const utf16 = readDelimited(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("name\tprice\r\nWidget\t12\r\n", "utf16le")]));
    assert.deepEqual(readProductSheet(utf16).rows.map((row) => [row.name, row.price]), [["Widget", "12"]]);
  });

  it("refuses an old .xls, a password-protected or a damaged workbook with what to do", async () => {
    assert.throws(() => readXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(40).fill(0)])), /old \.xls file or a password-protected workbook\. Open it in Excel or WPS and Save As "Excel Workbook \(\.xlsx\)"/);
    assert.throws(() => readXlsx(Buffer.from("PK\u0003\u0004 not really a zip at all, no directory")), /damaged or not really an Excel workbook/);
    const xls = path.join(dir, "old.xls");
    await writeFile(xls, "x");
    await assert.rejects(runImport({ catalogPath: xls, env: env(), sdk }), /old\.xls is an old \.xls file\. Open it in Excel or WPS and Save As/);
    const pdf = path.join(dir, "list.pdf");
    await writeFile(pdf, "x");
    await assert.rejects(runImport({ catalogPath: pdf, env: env(), sdk }), /Transcribe it into products-template\.xlsx first/);
  });
});

describe("the template spreadsheet", () => {
  it("assets/import/products-template.xlsx is what --write-template writes", async () => {
    assert.deepEqual(await readFile(TEMPLATE_ASSET), templateWorkbook(), "regenerate: node scripts/import-products.mjs --write-template assets/import/products-template.xlsx");
    assert.deepEqual(await readFile(HUB_TEMPLATE_ASSET), templateWorkbook(), "busa-product-hub ships the same sheet: copy assets/import/products-template.xlsx there");
    const out = path.join(dir, "made", "products-template.xlsx");
    const lines = [];
    assert.equal(await main(["--write-template", out], { log: (line) => lines.push(line) }), 0);
    assert.deepEqual(await readFile(out), templateWorkbook());
    assert.match(lines[0], /Wrote .*products-template\.xlsx: sheets "商品 Products", "认证 Certificates" and "说明 How to fill"/);
  });

  it("every one of its bilingual headers is understood, and its example rows are never imported", async () => {
    const book = readXlsx(templateWorkbook());
    assert.deepEqual(book.sheets.map((sheet) => sheet.name), ["商品 Products", "认证 Certificates", "说明 How to fill"]);
    const table = readProductSheet(book.sheets[0]);
    assert.equal(table.headerRow, 1);
    assert.deepEqual(table.columns.filter((column) => !column.target).map((column) => column.header), [], "no column of the template is unknown");
    const out = path.join(dir, "blank.xlsx");
    await writeFile(out, templateWorkbook());
    const summary = await runImport({ catalogPath: out, dryRun: true, env: env(), sdk });
    assert.equal(summary.products.created, 0);
    assert.equal(summary.certificatesFrom, "blank.xlsx › 认证 Certificates");
    assert.deepEqual(summary.skipped.map((item) => item.reason), [
      "row 2: the template's example row (delete it when you add your own products)",
      "row 2: the template's example row",
    ]);
    assert.deepEqual(
      Object.fromEntries(table.columns.map((column) => [column.header, column.as.field ?? column.as.attribute])),
      {
        "商品编号 Product ID": "product_id",
        "名称 Name": "name",
        "型号 Model": "model",
        "品牌 Brand": "brand",
        "货号 SKU": "sku",
        "类目 Category": "category",
        "售价 Price": "price",
        "币种 Currency": "currency",
        "成本 Cost": "cogs",
        "库存 Stock": "stock_available",
        "状态 Status": "status",
        "生命周期 Lifecycle": "lifecycle",
        "颜色 Color": "color",
        "内存 Memory": "memory",
        "存储 Storage": "storage",
        "屏幕 Screen": "screen",
        "电池 Battery": "battery",
        "主图 Image": "image",
        "图集 Gallery": "gallery",
        "描述 Description": "description",
        "卖点 Highlights": "bullets",
        "来源 Source": "source",
      },
    );
  });

  it("filled in like a student would: a phone with a picture placed in its row", async () => {
    const workbook = buildWorkbook([
      {
        name: "商品 Products",
        rows: [
          ["商品编号 Product ID", "名称 Name", "售价 Price", "币种 Currency", "库存 Stock", "状态 Status", "生命周期 Lifecycle", "主图 Image", "来源 Source"],
          ["test-phone-1", "测试手机一号 Test Phone 1", 1999, "CNY", 12, "active", "active", { inCell: GOLD }, "课程测试数据 course test data"],
        ],
      },
    ]);
    const file = path.join(dir, "filled.xlsx");
    await writeFile(file, workbook);
    const lines = [];
    assert.equal(await main([file, "--json"], { log: (line) => lines.push(line), env: env(), sdk }), 0);
    const summary = JSON.parse(lines[0]);
    assert.equal(summary.products.created, 1);
    assert.equal(summary.rows[0].listed, true, "everything a shop needs to list it");
    const phone = products().find((row) => row.fields["product-id"] === "test-phone-1").fields;
    assert.equal(JSON.parse(phone.content).source, "课程测试数据 course test data", "the Source column, not the file name");
    assert.deepEqual(api.state.assets[phone.image.split("/assets/")[1]].bytes, GOLD);
  });
});
