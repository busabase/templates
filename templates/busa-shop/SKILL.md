---
name: busa-shop
description: Busa Shop (Busa 独立站) is a one-install online shop for a small cross-border seller, with product management built in (商品管理) and no separate product hub (产品枢纽) to install. Its own Products and Certificates tables feed a storefront website (Busabase Website engine; on Free a private preview in the owner's browser) that takes order requests into Orders (no payment), reads its texts and currency from Settings, and runs a daily shop check that writes Reports and learns from the owner's feedback. Use when the user invokes $busa-shop or /busa-shop, or asks to open an online shop, 网店 or 独立站, to import products (导入商品, 导入 Excel 商品表, import products from Excel or CSV, import Excel with pictures, a product list or 商品表), to turn a price list PDF, a photo or a product page into products, to put products in the shop (把商品放进店, 上架) or take them down (下架), to change a price (改价格), to record certificates (EN 71, ASTM F963, CPC, CE, UKCA), to handle new orders, or to run the daily shop check.
metadata:
  category: ecommerce
  tags:
    - risk:local-write
    - industry:ecommerce
    - surface:website
  busabase:
    template: true
    folderSlug: busa-shop
    resources:
      - products
      - certificates
      - orders
      - settings
      - reports
    risk: local-write
---

# Busa Shop

A real website for a small seller: strangers open it, look at the products and
send an order request. **The shop keeps its own product list**: the
**Products** table in this folder, with **Certificates** next to it, in plain
columns the owner reads and edits in the table. Change a product there and the
website shows the change within a minute. Nothing else needs installing.

Ordering is an order *request*. The website takes no payment: it tells the
buyer "we will contact you to confirm and arrange payment", and a person does
that by email.

## Mandatory dependencies

1. `$busabase` for connecting, finding nodes, reading and writing records.
2. `$busabase-app-creator` before changing the website's code.

Busa Product Hub (`busa-product-hub`) is **not** needed. It is a separate
template for export sellers who list on several channels (Amazon, Shopify,
TikTok Shop, eBay). A shop can sell from its table instead, when the owner asks
("Sell from a product hub instead", below), and a shop installed before
busa-shop 0.5.0 already does.

## Boundary: what you never do

- Never email or message a customer. You write a reply draft; the owner sends it.
- Never set an order to `paid` or `shipped` unless the owner tells you it
  happened. Never take, request or record card details.
- Never invent a product fact: a price, stock, a specification, a certificate,
  a date. An empty cell stays empty until the owner gives the value.
- Never fix product data during the daily check. Report it; the owner (or
  "Manage products", when they ask) fixes it.
- **What the owner asks for in so many words is their decision; what you work
  out yourself is a proposal.** Taking products the owner names off sale, or
  writing the exact price they give, you do after showing them the change
  ("Manage products"). A price you would suggest, or a product you think
  should go, you only tell the owner about; you do not write it.
- Never click Run, Restart or Go live, never change `site.access` in
  `content/busa-shop-app/airapp.json`, and never copy either of the site's
  keys anywhere. Running the preview and going live are the owner's
  decisions and their consent.
- Never overwrite a person's text in Owner feedback, Internal note, Reply
  draft or a product's Notes. Add dated lines; do not rewrite history.

## What is in this folder

| Node | What it is |
| --- | --- |
| **Products** | The shop's products, one row per product, plain columns (below). The website sells from here |
| **Certificates** | One row per product certificate: what a product page shows as "valid until" |
| **Orders** | One row per order request. The website creates it with status `new` and never touches it again. |
| **Settings** | One row: what the website shows and what the daily check uses. |
| **Reports** | One row per daily shop check, with the owner's feedback. |
| **Shop Website** (`busa-shop-app`, AirApp, Website engine) | The public site. `vendor/worker.js` is what deploys (the bundle of `src/` with busabase-sdk inside); `src/` is its source. `airapp.json` asks for `write` access because the order form creates records. It *prefers* the Website engine: a space without it (Busabase Cloud Free) runs the same bundle as a private preview in the viewer's browser tab (`content/busa-shop-app/scripts/browser-preview.mjs`), with no address and no Go live. |
| **busa-shop** (this skill) | The manual. `scripts/` holds the product importer and the live-site probe (below). |

Field-by-field reference: [`references/shop-schema.md`](references/shop-schema.md).

### Products

One row per product. The columns an owner meets first are the ones the
website uses most; the table's **On sale** and **All products** views show
Name, Product ID, Status, Price, Currency, Stock, Category and Image URL.

| Column | What it means |
| --- | --- |
| **Name** | The product's name on the website |
| **Product ID** | The page address, `/products/<Product ID>`: letters, digits, `.`, `_`, `-`. Also how an import finds the row again |
| **Status** | `active` **On sale**, `draft` **Draft**, `archive` **Off sale (archived)**. Only On sale is listed |
| **Price** | The selling price, a number |
| **Currency** | Three letters. Empty means the shop's own currency (Settings › Currency); another currency than the shop's is not listed |
| **Stock** | A number: 0 or less shows "Out of stock", empty means not known |
| **Subtitle** | Under the name, on the card and the product page |
| **Brand**, **Model** | The first two lines of the product page's Details; Brand is also the product's brand in its search data |
| **Category** | Not shown as text: only in the page's search data (schema.org `category`), and for the owner's own sorting |
| **Image URL** | The main photo: an `https://` address |
| **More photos** | More `https://` addresses, one per line |
| **Description** | Paragraphs, separated by a blank line |
| **Highlights** | One selling point per line, shown as a list |
| **Specs** | The product's details, one `Label: value` per line (`Battery: 5110 mAh`). See "Product details on the page" |
| **Warranty**, **Returns** | Shown at the end of the Details, as written |
| **SKU** | Shown as "Item no.", and written into orders |
| **Tags** | Comma-separated; only used by Settings › "Only list products with this tag" |
| **Position on the site** | The order on the website, smallest first; empty goes last |
| **Cost**, **Source**, **Notes** | For the owner only. The website never reads them: what a product costs, where its facts came from, supplier and trade terms (MOQ, lead time, HS code), and any column of an imported sheet that is not for shoppers |

### Certificates

`product` (the Products row), `cert-type` (CE, FCC, RoHS, UN38.3, UKCA, and for
toys **EN 71** (EU), **ASTM F963** (US) and **CPSIA / CPC** (US Children's
Product Certificate), or Other), `issuer`, `cert-number`, `issued-date`,
`expiry-date` (YYYY-MM-DD), `file` (the certificate itself), `source-note`
(the document and page the facts came from). A product page lists only
certificates that have **not expired**, as their type + "valid until", never
the number. Type `Other` is not shown, because it names nothing a buyer can
check: record it under its real type.

### Orders

`title` (shown as the row name: `ORD-… · customer`), `order-id` (made in the
buyer's browser, e.g. `ORD-7K2M9QX4PT`; it is also the write's idempotency
key, so a double click is one order), `status` (`new` → `confirmed` → `paid` →
`shipped`, or `cancelled`), `customer-name`, `email`, `phone` (optional),
`country` ("Denmark (DK)"), `items-summary` (one readable line per item),
`items` (the same as JSON: product id, sku, name, quantity, unit price, line
total), `total` and `currency` exactly as shown to the buyer, `customer-note`,
`created-at`, `source` (`website`). Staff-only, never read or written by the
website: `internal-note`, `reply-draft`.

Views: **New orders** (status new, oldest first), **Confirmed, not shipped**,
**All orders** (newest first).

### Settings (one row)

| Field | Used by | Meaning |
| --- | --- | --- |
| Store name, Tagline, About, Shipping note | website | The texts on the pages |
| Currency | website | Three letters (`USD`): the shop's currency. A product is listed only in this currency |
| Contact email | website | Shown in the footer and in error messages. Use a real inbox before going live |
| Language | website | `en`, `de`, `fr` or `es`: the website's own words. Product texts stay as written |
| Ships to | website | Country codes, comma-separated. The order form offers only these. Empty = every country |
| Show the demo-store notice | website | The yellow "fictional demo store" bar. Turn it off for a real shop |
| Only list products with this tag | website | Optional: list only products whose Tags contain this word |
| Products table | website, importer | Optional: sell from another table instead of this folder's Products (see "Sell from a product hub instead") |
| Live site address | daily check | The public address shown after Go live |
| Required certificates | daily check | Comma-separated certificate types, e.g. `EN 71, ASTM F963, CPSIA / CPC` |
| Certificate expiry warning (days) | daily check | Warn this many days before a certificate expires |
| Standing check rules | daily check | Rules added from the owner's feedback, one per line, newest last |
| Also show these product details | website | Only for a product hub table: more of its `content.attributes` keys for the product page, comma-separated (`防水等级, gtin`). The shop's own table needs none: its Specs column is the list |

The website reads Settings at most once a minute, so a change shows on the
live site within about a minute, with no redeploy.

### Reports

`title`, `report-date`, `status` (`open` / `acknowledged`), `summary`,
`issue-types`, `issue-count`, `issues` (one line per finding), `orders-waiting`,
`site-check`, `owner-feedback` (the owner writes here), `applied-feedback`
(what the check did with feedback that was due), `checked-at`, `sample` (ticked
only on the one sample report the template installs). Issue types:
`missing-price`, `hidden-product`, `missing-image`, `out-of-stock`,
`certificate-missing`, `certificate-expired`, `certificate-expiring`,
`orders-waiting`, `demo-leftovers`, `site-unreachable`, `site-mismatch`,
`image-unreachable`, `other`.

## The listing rule

A product is on the website only when **all** of these hold
(`content/busa-shop-app/src/catalog.js`, `listingFor`):

1. **Status** is `active` (On sale). (In a product hub table: `status` is
   `active`, `approved` or `live`, **and** `lifecycle` is `active` or
   `launch`.)
2. it has a **Name** and a URL-safe **Product ID**, not used by an earlier row;
3. **Price** is a number above 0 (in a product hub table from before its 0.4.0,
   `pricing.current_price` while Price is empty);
4. **Currency** equals Settings › Currency. In the shop's own table an empty
   Currency means the shop's; in a product hub table it must be filled
   (`pricing.currency` while it is empty);
5. Settings › "Only list products with this tag" is empty, or the product has that tag.

Stock never hides a product: 0 or less shows "Out of stock", and it cannot be
ordered. When stock is known the order form caps the quantity at it (and at
99). At most the first 100 rows, by **Position on the site**, are read.

## Product details on the page

The product page's **Details** list (`src/details.js`) shows, under the store
language's words and in this order, whichever of these a product has:

`brand`, `model`, `color`, `screen`, `processor`, `memory`, `storage`,
`battery`, `charging`, `camera`, `front_camera`, `network`, `os`, `specs`,
`age_grade`, `materials`, `batteries`, `dimensions`, `weight`, `in_the_box`,
`warranty`, `returns` (after the SKU as "Item no.").

**In the shop's own Products** these come from the Brand, Model, Warranty and
Returns columns and the **Specs** column, one `Label: value` per line. A label
the website knows becomes that detail, so it is ordered and translated:
the store languages' own words (`Battery`, `Akku`, `Batterie`), the English
names in the importer's lines (`Colour`, `Display`, `RAM`, `Storage`,
`Front camera`, `Operating system`, `In the box`, `Age`, `Size`…), and the
common Chinese ones (`电池`, `运行内存`, `屏幕`, `保修`). A line with any other
label (`IP rating: IP54`, `防水等级: IP54`) is shown too, after the known ones,
with its label as written: what the owner writes in Specs is meant for
shoppers. A line without a colon is added to "Specifications". So a phone's
Specs (Colour, Display, Processor, RAM, Storage, Battery, Charging, Camera,
Front camera, Network, Operating system, In the box) reads as a spec sheet,
and a toy's (Age, Materials, Batteries, Size, Weight) as a toy's. Put a note
about Google services or a China/global ROM on the `Operating system` line,
where a buyer looks.

- **Never shown**, wherever they are written: `moq`, `lead_time_days`,
  `hs_code`, `carton_qty`, `country_of_origin`. The importer puts them in
  Notes, for the owner and trade buyers.
- The `brand` detail is also the product's brand in the page's search data
  (schema.org `brand`); without one, the store's name.

**In a product hub table** the details are its `content.attributes` (that
template's importer keeps every column of a sheet there). Any key not in the
list above is hidden until the owner names it in Settings › **Also show these
product details**, e.g. `防水等级, gtin` (the keys as stored). A column nobody
looked at never reaches a public page: ask the owner before you add a key, and
do not add one whose values are internal (a supplier, a cost, a sales script).

## Product images

**Image URL** and **More photos** are plain text, so the website decides per
value (`classifyImageRef` in `src/catalog.js`):

- **An `https://` URL on another host** (an uploaded file's public address, a
  CDN): the buyer's browser loads it directly. It must open in a private
  browser window without signing in; the daily check tests one.
- **A URL on the Busabase server itself**: a stranger cannot load it, so the
  website serves it at `/images/<product-id>/<n>`, fetching it with its key.
  That route answers only for image *n* of a **listed** product; any other id,
  a hidden product or an index out of range is a 404, and the key is only ever
  sent to the Busabase server, never to another host.
- **A path inside the Product Hub AirApp** (`./assets/product-images/…`, a
  product hub's own sample data): served the same way, only when the shop
  sells from a product hub table.
- Anything else (`http://` elsewhere, `data:`, other paths) is ignored. A
  listed product without a usable image shows "Photo coming soon".

The importer uploads pictures and writes their public `https://` addresses,
which is the first case.

## How the website finds its tables

A published template carries no workspace ids, so the website looks its tables
up when it starts, using the stamp the installer puts on every node
(`appId` = template name, `resourceKey` = the table's folder name):

1. this shop's Settings and Orders: stamped `busa-shop` / `settings`, `orders`
   (fallback: slugs `busa-shop-settings`, `busa-shop-orders`);
2. the Products table:
   a. Settings › Products table, if filled (a Base id, node id or slug);
   b. otherwise this shop's own Products, stamped `busa-shop` / `products` in
      the folder of its Settings (fallback slug `busa-shop-products`);
   c. otherwise, for a shop installed before busa-shop 0.5.0 (no Products of
      its own), the Base stamped `busa-product-hub` / `products` (fallback
      slug `busa-product-hub-products`), which is where that shop sold from;
3. Certificates: the stamped one in the same folder as that Products table
   (and, for a product hub, its AirApp, for the pictures inside it).

A table stamped `busa-shop` is read as the shop's plain columns, any other as
a product hub's (Lifecycle + Status, JSON blocks). `/api/status` says which:
`"productsFrom": "shop"` or `"product-hub"`.

If something is missing or there are two candidates, the website does not
guess: it shows an owner-facing "This shop is not open yet" page naming the
problem (`products-missing`, `products-ambiguous`,
`products-override-not-found`, `settings-missing`, `settings-ambiguous`,
`settings-empty`, `currency-missing`) and `/api/status` reports the same code.
Fix the table and the page clears within a minute.

## Manage products (商品管理)

Everything about the product list happens in **Products** and
**Certificates** in this folder: bringing products in (导入商品), putting
them on sale or taking them off (上架 / 下架), changing a price (改价格),
recording certificates. The owner can do each of these by hand in the table;
you do them when they ask, the same way every time: **show the change → the
owner says yes → write it → read it back.**

Find the two tables with `$busabase` (`busabase-cli bases get --slug
busa-shop-products`, `--slug busa-shop-certificates`; on a renamed folder,
the Base stamped `busa-shop` / `products`). If Settings › Products table is
filled, the shop sells from that table instead: work there ("Sell from a
product hub instead").

### Bring products in, any way (导入商品)

The owner's product data enters Products and Certificates through one
importer, `scripts/import-products.mjs` in this skill, whatever form it
arrives in. A spreadsheet goes in as it is; anything else (a PDF, a photo, a
web page, pasted text) is first transcribed into the template spreadsheet.
Never collect product data by crawling: no bulk downloads from brand or
marketplace websites, whose terms usually forbid it. The data comes from the
owner's own files, or from one page the owner points to (below).

1. **Set up.** Read the importer out of this skill node with `$busabase`
   (`busabase-cli nodes read-file --kind skill --node-id <this skill's node>
   --file-path scripts/import-products.mjs --output json`, the `content`
   field), save it in an empty directory next to the owner's file (and a
   picture folder, if they gave you one), and install the SDK there. It needs
   nothing else.

   ```bash
   npm i busabase-sdk
   export BUSABASE_BASE_URL=… BUSABASE_API_KEY=… BUSABASE_SPACE_ID=…
   ```

2. **Preview.** `node import-products.mjs products.xlsx --dry-run` (the toy
   CSVs: `node import-products.mjs toy-catalog.csv --certificates
   toy-certificates.csv --images images/ --dry-run`). It reads Busabase and
   writes nothing. Its first line names the table it will write:
   `Products table: busa-shop-products (the shop's own Products)`. Show the
   owner what it prints, as it is: one table row per product (ID, name, price,
   stock, the pictures it found and where, create/update, which fields are
   empty), the products the shop would not list and why, "How the columns were
   read" (which column becomes Specs, which goes to Notes and never reaches the
   website), Skipped and Notes. Point out what needs a decision: IDs marked `*`
   (made from the name, see below), prices with no currency, a currency it read
   from a `(元)` header or a `¥` sign, a currency that is not the shop's,
   rows and pictures it left out. If the owner also asked you to take old
   products down, list those in the same preview ("Take products off sale").
3. **The owner confirms**, and decides only what the preview says is
   missing and only they can know:
   - the currency of prices that do not say one: `--currency USD`;
   - whether to put the products on sale when the sheet has no Status:
     `--fill status=active` (fills only cells that are empty in the sheet
     *and* in the table);
   - where the data came from, when it was not a file of theirs: `--source "…"`.

   Never fill in a price, a stock number, a specification, a certificate or a
   date yourself. An empty cell stays empty. If the owner corrects the sheet,
   run the preview again.
4. **Import and read back.** The same command without `--dry-run` (then take
   down the old products the owner confirmed, if any). Then read Products
   back: the number of products, a few prices, and that each picture URL
   opens. If the summary says "waiting for review", the credential cannot
   write here: tell the owner who can approve it.

Running it again changes nothing; after the owner edits the sheet it changes
only what changed. It never removes a line from Specs or Notes and keeps the
owner's own wording of a label. A price in the sheet overwrites the Price
cell, so once the owner edits prices in the table, update the sheet too or
leave its price cells empty.

| The owner gives you | What you do |
| --- | --- |
| **An Excel workbook (.xlsx)**, any column names, English or Chinese, pictures inside | Import it as it is (step 2). |
| **A CSV or TSV**, including one saved by Excel on a Chinese Windows (GB18030) | Import it as it is. |
| **A folder of photos** and a sheet that names them | `--images <folder>`: each name in an image column is looked up there. |
| **A supplier price list PDF, a photo or screenshot of a catalogue page** | Write the template (`node import-products.mjs --write-template products.xlsx`) and transcribe into it one product per row, only what you can read on the page. Leave what you cannot read empty and say so. Put the page in 来源 Source (`supplier-price-list-2026.pdf p.2`). Show the owner the filled sheet before the preview. Use pictures from the document only when the owner says they may. On the Certificates sheet too, Source names the page. |
| **A product page** the owner points to (their own store, or a supplier's page for a product they sell) | Read that one page, on the owner's behalf, for facts only: name, model, specifications, a price if shown. Do not follow links, open other products or listings, or fetch the site in bulk; if the site's terms forbid automated access, ask the owner to copy the facts instead. Transcribe into the template with the page's address in Source. Do not copy its pictures unless the owner has the rights to them (their own shop, or images the brand licensed to them); otherwise leave the pictures empty and ask for the owner's own photos. |
| **Text pasted into the chat** | Transcribe it into the template, show it, then preview. |
| **One or two products, described in chat** | No sheet needed: show the owner the row you would add (Name, Product ID, Status, Price, Specs lines…), and create it with `$busabase` after they say yes. |

What the importer understands:

- **Where the table is.** The first sheet whose header row (any of the first
  20 rows; a title row above it is fine) names a product column: a name,
  model, product ID or SKU, plus one more. A sheet like 说明/Instructions is
  passed over. Certificates come from a sheet whose headers name a
  certificate number (认证 Certificates in the template), or from
  `--certificates <file>`; `--sheet` and `--certificates-sheet` choose.
- **Column names.** 名称/商品名称/品名/Name → Name; 型号/Model is the name
  when there is no name column, otherwise Model; 商品编号/Product ID; 货号/SKU;
  售价/价格/零售价/Price → Price; 币种/货币/Currency; 库存/Stock → Stock;
  状态/Status (在售 → active, 草稿 → draft, 下架 → archive) and
  生命周期/Lifecycle (archive → archive, test → draft) → Status;
  类目/分类/Category; 品牌/Brand; 保修/Warranty; 退货/Returns;
  描述/Description; 卖点/Highlights; 标签/Tags; 主图/图片/图片链接/Image → the
  main picture, 图集/Gallery → More photos; 颜色, 屏幕, 处理器, 内存/运行内存,
  存储/机身存储, 电池, 快充, 后置/前置摄像头, 网络, 系统, 规格, 材质, 尺寸, 重量,
  包装清单 and their English names → **Specs** lines; 成本/进价/Cost (or
  到岸成本/Landed cost) → Cost; 来源/Source → Source; 供应商/Vendor, 起订量,
  交期, 海关编码, 装箱数, 原产地, 条码 → **Notes** lines; a column named after a
  certificate (FCC ID, CE 证书编号, UKCA, EN 71…) → a certificate of that type
  with the cell as its number. Bilingual headers (`售价 Price`) work, and a
  unit in brackets goes with bare numbers (`存储(GB)` 256 → `256 GB`).
  **A column it does not know is kept** in Notes under its own header (for
  the owner; never on the website: to show it, move the line into Specs); a
  column with values and no header is reported and left out; 序号 is ignored.
- **Values.** Prices as people write them (`¥5,999.00`, `5999元/台`,
  `US$ 999`). The currency comes from a currency column, else a sign in the
  cell, else the header (`售价(元)`), and the preview says which; `¥` counts as
  CNY only in a sheet with Chinese headers, a bare `$` never. Stock `200台`;
  缺货/售罄 is 0; 有货 is not a number and stays unknown. Dates as
  YYYY-MM-DD, 2027/4/10, 2027年4月10日 or an Excel date; 10/04/2027 is left
  out, not guessed. A merged cell counts for every row it spans.
- **Product IDs.** From a 商品编号/Product ID column; without one, from the
  SKU; without that, from the name plus the variant columns (model, storage,
  memory, colour) so two colours of one phone stay two products. Made IDs are
  marked `*` in the preview: they change if the name changes, so suggest an ID
  column when the owner will edit the sheet and import again.
- **Pictures.** An `https://` link in an image column is used as it is
  (`http://` is left out). A file name is read from `--images` (default
  `images/` next to the file) and uploaded. Pictures inside the workbook are
  uploaded too: a floating picture belongs to the row its top-left corner is
  in (a corner in the lower half of a row counts for the next row, which is
  where LibreOffice puts pictures it re-measured), Excel's **Place in Cell**
  pictures and WPS's in-cell pictures (`=DISPIMG(…)`) to their cell, and
  `=IMAGE("https://…")` is used as a link. The first picture is the main one,
  the rest More photos, at most 12, the same picture once. A picture already
  on the product (the same bytes) is not uploaded again. Not read, and said
  so: linked (not embedded) pictures, EMF/WMF/TIFF/BMP files, pictures on a
  row with no product.
- **Refuses** an old `.xls`, `.ods`, `.numbers`, a PDF or a password-protected
  workbook, saying what to do (save as `.xlsx`, or transcribe).

`node import-products.mjs --write-template products-template.xlsx` writes the
blank bilingual template (also in this template's
[`assets/import/products-template.xlsx`](https://github.com/busabase/templates/raw/main/templates/busa-shop/assets/import/products-template.xlsx)):
**商品 Products** (商品编号 Product ID, 名称 Name, 型号 Model, 品牌 Brand,
货号 SKU, 类目 Category, 售价 Price, 币种 Currency, 成本 Cost, 库存 Stock,
状态 Status, 生命周期 Lifecycle, 颜色 Color, 内存 Memory, 存储 Storage,
屏幕 Screen, 电池 Battery, 主图 Image, 图集 Gallery, 描述 Description,
卖点 Highlights, 来源 Source), **认证 Certificates** (商品编号 Product ID,
认证类型 Type, 证书编号 Number, 发证机构 Issuer, 发证日期 Issued, 到期日期
Expires, 来源 Source) and **说明 How to fill**. The example rows (Product ID
`example-phone`) are never imported. Owners may add any other column
(保修 Warranty, 退货 Returns, 防水等级…).

What it writes, column by column: [`references/shop-schema.md`](references/shop-schema.md),
"Written by `scripts/import-products.mjs`".

### Change a price (改价格)

The selling price is the **Price** cell, a plain number next to **Currency**.
The owner changes it in the Products table: in the grid where the table edits
cells in place, otherwise by opening the product (click its Name), **Edit**
(「编辑」), typing the new number into **Price** and **Update Now**
(「立即更新」). Nothing else has to change: the live site shows the new price
within about a minute.

Change a price for the owner only when they ask and give the price: show the
product, its current Price and the new one, and after they say yes write it
with `$busabase` (a record change on `price` whose message says the owner
asked, e.g. `busabase-cli records change-request --record-id <id> --operation
update --fields-json '{"price":259}' --message "Price changed at the owner's
request in chat on 2026-11-06"`). A price you would suggest yourself (from a
margin, a competitor) you only tell them; you do not write it.

### Take products off sale (下架) and put them on sale (上架)

Taking a product off sale means setting its **Status** to `archive` (Off sale).
The website stops listing it within about a minute. Nothing is deleted: the
row, its pictures and its certificates stay, and setting Status back to
`active` puts it on sale again (上架). `draft` is for a product not ready yet.

**When the owner asks for it in chat**, naming the products or describing
them in a way you can resolve (「上节课的演示玩具都下架」, "take the sample
products down"), the request is their decision and you carry it out:

1. **List exactly what you will change** in your preview: Product ID, Name,
   current Status, read from Products. When the same message also brings new
   products, put this list in the import's preview. Say what you are leaving
   alone and why (already off sale, not matched). If a product fits the
   description only partly, ask; do not guess.
2. **After the owner says yes to that list**, change only those products, in
   one change whose message records the request:

   ```bash
   busabase-cli records bulk-update-change-request --base-id <Products Base id> \
     --updates-json '[{"recordId":"<record id>","fields":{"status":"archive"}}, …]' \
     --message "Taken off sale at the owner's request in chat on 2026-11-06 («上节课的演示玩具都下架»); the owner confirmed this list of 12."
   ```

   (If the change waits for review instead of landing, the key cannot write
   here: tell the owner who can approve it.)
3. **Read back** that each one now has the new Status, and tell the owner how
   many. Import first and take down second, so the shop is never empty; for
   about a minute a reload of the live shop may then show the old products,
   the new ones or both, before it settles.

Putting products on sale is the same, with `active`; before you do, tell the
owner what each still lacks for the listing rule (a price, the shop's
currency, a photo). **When nobody asked** and you think a product should go
(it looks retired, duplicates another, its certificate lapsed), do not change
it: tell the owner, and the daily check reports it.

### Certificates (证书)

A certificate comes in with the import (a Certificates sheet, a certificate
file `--certificates`, or a column such as `FCC ID`), or you record one the
owner describes: one Certificates row linked to the product, with the type,
issuer, number, issued and expiry dates and a Source note naming the document
and page. Never invent an expiry date or an issuer: leave it empty and tell
the owner what is missing. A product page shows a certificate from the next
read after it is saved, until it expires; the daily check warns before that.

### Sell from a product hub instead

Settings › **Products table** points the shop at another table: write the
slug of a Busa Product Hub Products table (`busa-product-hub-products`) to sell
from it, the way export sellers who manage Amazon, Shopify and other channels
there do; clear it to sell from this folder's Products again. That table is
read in the product hub's shape (Lifecycle + Status, JSON blocks), its
Certificates and its AirApp pictures come along, and the same importer then
writes there (its preview says `named in the shop's Settings › Products
table`): follow busa-product-hub's own manual for that table (taking a
product down there sets Lifecycle to `archive`). Change Settings only when the
owner asks.

A shop installed **before busa-shop 0.5.0** has no Products of its own and
keeps selling from Busa Product Hub's Products, with nothing to change: the
website and the importer both find that table when the shop has none. To move
such a shop onto its own table, the owner installs Busa Shop again (a new
folder with its own Products), and you import the product list into it.

## Open the shop

1. **Install Busa Shop.** From the Template Center, one template: Products,
   Certificates, Orders, Settings, Reports, Shop Website and this manual, in
   one folder. Products and Certificates start empty, and the website says "No
   products are listed yet." until something is on sale.
2. **Bring the products in** with "Bring products in, any way". The course's
   toy list is the fictional factory in this template's `assets/demo/`
   (https://github.com/busabase/templates/tree/main/templates/busa-shop/assets/demo):
   the student hands you `toy-catalog.csv`, `toy-certificates.csv` and the
   `images/` folder, and you import all three
   (`node import-products.mjs toy-catalog.csv --certificates toy-certificates.csv --images images/ --dry-run`,
   then without `--dry-run`). A course that brings its own Excel file (phones,
   say) imports it the same way: `node import-products.mjs phones.xlsx --dry-run`.
   Old products the owner asks you to take down when a new list comes in
   (「上节课的演示玩具都下架」) go into the same preview, and off sale after the
   import ("Take products off sale").
3. **Check Settings** with the owner: store name, tagline, currency equal to
   the products' currency, a real contact email, language, ships-to
   countries, about text, shipping note, demo notice (off for a real shop).
4. **The owner opens Shop Website.** On Plus and higher (the Website engine),
   opening the node starts the members-only preview by itself, on real data,
   in the App tab: there is nothing to click first. (A **Run** button appears only on a node that has never run.) The
   header then shows **Running** and **Not live**, with the buttons **Go
   live** and **Restart** (zh-CN: 「运行中」「未发布」「上线」「重启」).
   Running the preview creates an API key in the owner's name, listed as
   `Site preview: Shop Website`, with the same write access as the live site.
   Once it runs, open the preview and check: the home page lists what the
   listing rule says it should, a product page, `/api/status`
   (`"setup": "ready"`, `"productsFrom": "shop"`), `/sitemap.xml`. A test
   order lands in the real Orders table: place one only if the owner agrees,
   then delete it.

   **On a Free space** (Busabase Cloud without Plus) the Website engine is not
   included, so opening Shop Website runs a **private preview inside the
   owner's own browser tab** instead (the browser engine). The header shows
   only **Running** and **Restart** (「运行中」「重启」): no **Not live**, no
   **Go live**. The Logs tab ends with `Busa Shop: private preview on the
   browser engine, … Nothing is published; there is no Go live here.` It is
   the same website reading the same tables, as the owner: no key is
   created, it acts in the space the owner has open, and an order placed in
   it is a real Orders row, saved as the owner's own Change Request. Nobody
   else can open it and it stops when the tab closes. You cannot open it
   yourself: ask the owner to click through home, a product and the order
   form and tell you what they see. **More actions → Settings** shows the
   engine as **Follow the app (Website)** with "Website is available on Plus
   and above." and **Upgrade to Plus** (「跟随 App（网站）」
   「网站仅在 Plus 版及以上套餐中提供。」「升级到 Plus 版」). The **Address**
   it lists under that is not live and cannot be (**Public** says "Go live first."
   「先上线一次。」). Steps 5 and 6 need Plus: tell the owner that going live, a
   public address and real customers start with the upgrade, and stop there.
5. **Before Go live (Plus and higher), tell the owner, in these words or
   similar:** "Go live
   publishes the site at the address shown under More actions → Settings. It
   asks for **write** access, because the order form must save orders. Going
   live creates an API key in your name, listed as `Site: Shop Website`, next
   to the preview's `Site preview: Shop Website`; each can do whatever you
   can do in this workspace, not only these tables, and the website's code is
   the only thing between a stranger and that. Turning Public off, or moving
   the app to Trash, cuts the live site off." The owner clicks **Go live**
   (「上线」); you do not. The header then shows **Live** (「已上线」) and the
   message "The site is live." (「网站已上线。」).
6. **Write the live address into Settings › Live site address**, so the daily
   check can test it. The owner finds it under **More actions → Settings**
   (「更多操作」→「设置」): **Address** (「地址」), with the **Public**
   (「公开」) switch next to it.
7. **After any change to the website's code**, the live address keeps serving
   the old version until the owner clicks **Restart** (a new preview of the
   new files) and then **Go live** again. Changes to Settings and to products
   need no redeploy.

## Handle a new order

For each order with status `new`, oldest first:

1. Read its items and check each against Products now: still listed, in
   stock (Stock ≥ quantity, or Stock empty), price unchanged. The shop has
   already refused unknown, hidden and sold-out products, but stock is not
   reserved by an order and may have changed since.
2. Check the country is one the owner ships to and the email looks real.
   Obvious spam (nonsense name, link in the note): set status `cancelled` and
   add `YYYY-MM-DD spam, cancelled by agent at <owner>'s request` only if the
   owner agrees; otherwise flag it.
3. Write **Reply draft**: thank them, confirm what is available, say what is
   not, give the shipping cost or a placeholder `[shipping cost]` for the
   owner, and how payment will be arranged (`[payment details]`; never a link
   you made up). Sign with the store name.
4. Add a dated line to **Internal note** with what you checked. Leave status `new`.
5. Tell the owner which orders are ready to send, and anything odd.

When the owner says the reply was sent: status `confirmed`. Paid: `paid`.
Shipped: `shipped`, tracking number in Internal note. Cancelled: `cancelled`
with the reason. When an order is confirmed or shipped, remind the owner to
lower the product's Stock (orders do not change stock).

## Daily shop check

Observe → decide → act → write back. One run applies the owner's open
feedback, checks everything below, and writes its findings into one Reports
row.

### 0. The reports you will meet, and the rules for them

- **The sample report.** The template installs one report with
  **Sample report** ticked (title "… (sample report, fictional)"). Its date is
  fixed in the template (2026-11-03), so on some installs it carries today's
  date. It is never "today's report": never update it in place, and never
  count it as a real check. Its Owner feedback is applied like any other
  (step 1), which is how the course shows the loop on day one.
- **Feedback is applied exactly once.** A report's feedback is due when its
  status is `open` and Owner feedback is not empty, whatever its date and
  whether or not it is the sample. After you apply it, that report becomes
  `acknowledged`. An `acknowledged` report is finished: never apply its
  feedback again and never write to it again.
- **Order.** "Newest" means latest `report-date`, and for the same date, latest
  `checked-at`.
- **Where today's findings go** (step 6): if a real (not sample) report dated
  today exists, is still `open`, and has empty Owner feedback, this is a
  same-day re-run: update that report in place. In every other case create a
  new report for today. That includes the case where today's real report was
  just acknowledged in step 1, which leaves two real reports for one date;
  `checked-at` orders them.

### 1. Apply the owner's feedback first

Read Settings (Required certificates, Certificate expiry warning, Standing
check rules, Live site address, Products table) and every report whose
feedback is due (rule above), oldest first. Before checking anything, apply
each one:

- A change to a number or list the check uses → change it in Settings
  (e.g. "warn me 45 days ahead" → Certificate expiry warning = 45).
- A new thing to check or a new way to report → add one line to Standing
  check rules: `- YYYY-MM-DD: <the rule, in plain words> (from the report of YYYY-MM-DD)`.
- Something you are not allowed to do here (change product data, email a
  customer, take payment) → do not do it; say so.

Note what you did, item by item, for today's report's Applied feedback (step
6), then set each of those reports' status to `acknowledged`. Do not edit the
owner's words. Rules already in Standing check rules apply on every run.

### 2. Check products and certificates

Read the Products table the website sells from ("How the website finds its
tables": this folder's Products and Certificates, or the table Settings ›
Products table names, with its own Certificates), the first 100 rows by
Position, and apply the listing rule. Every finding is one line in Issues,
tagged with its type:

| Type | Report it when | Lines |
| --- | --- | --- |
| `missing-price` | Status would list it (On sale; in a product hub table, lifecycle and status), but its Price is missing or not above 0 | one per product |
| `hidden-product` | Status is On sale (in a product hub table: lifecycle is `active`/`launch`) but it is hidden for another reason (currency, tag, id; in a product hub table also status). Products in Draft or Off sale (`test`/`archive` in a product hub) are hidden on purpose: do not report them | one per product |
| `missing-image` | listed, but no image the website can show | one per product |
| `out-of-stock` | listed, and Stock is 0 or less. Report it only when a Standing check rule asks for it (the sample feedback does) | one per product |
| `certificate-missing` | listed, checked **separately for each type** in Required certificates: the product has no certificate row of that type at all (compare types case-insensitively). One missing type is enough | one per product, naming every missing type |
| `certificate-expired` | listed, with a certificate whose expiry date is past or empty | one per certificate |
| `certificate-expiring` | listed, with a certificate expiring within the warning days; say how many days | one per certificate |

An expired certificate of a required type counts as `certificate-expired`,
not `certificate-missing`. Then apply every Standing check rule; a finding
with no type of its own is `other`.

### 3. Check orders

`orders-waiting`: every order still `new`, and every `confirmed` order older
than 7 days (waiting for payment). Each one is one line in Issues (order id,
customer, total, since when) and counts toward the issue count; their number
also goes into Orders waiting.

### 4. Check for demo leftovers

Only when Settings › Live site address is set, so the shop is public. One
`demo-leftovers` line for each of these that is still true:

- Settings › Show the demo-store notice is ticked;
- Settings › Contact email is empty or a placeholder (ends in `.example`, or
  is at `example.com`, `example.net` or `example.org`);
- Settings › About the store still says the shop is fictional demo data;
- Orders still holds the sample orders (title ends "(fictional demo)", or
  Internal note starts "Fictional demo data").

The course's own live demo shop will show these on purpose. A real shop
should not.

### 5. Check the live site

If Live site address is set: `node scripts/probe-site.mjs <address>` (from this
skill's files). It opens the site as a stranger: the home page (status, time),
`/api/status`, the sitemap, robots.txt, and **every photo on every listed
product page**. Report:

- `site-unreachable` if the home page does not answer 200;
- `site-mismatch` if `/api/status` is not `ready` or its product count differs
  from the number you found listed (the site may lag the tables by a minute;
  re-probe once before reporting);
- `image-unreachable`, one line per photo the probe lists under
  `images.failed` (product, URL, what came back).

Put a short summary in Live site check. If the address is empty, write "not
checked: no live site address in Settings" and skip steps 4 and 5.

### 6. Write the report

Fill the report chosen by the rule in step 0:
`title` = `Daily shop check · YYYY-MM-DD`, `report-date` = today, `status` =
`open`, Sample report unticked, a `summary` of two to four plain sentences
(how many products are on the site, the most important problems, orders
waiting), `issues` with one line per finding, like
`- [certificate-expiring] Wooden Train Set (tt-wooden-train): EN 71 expires on 2026-12-01, in 26 days.`,
`issue-types` = every type that appears in Issues, `issue-count` = the
number of lines in Issues (waiting orders included), `orders-waiting`,
`site-check`, `applied-feedback` (what step 1 did, or "none due"), and
`checked-at` = now. When updating a same-day report in place, replace the
findings and `checked-at`, and add to Applied feedback rather than replace it.

Then tell the owner the three things that matter most, and that they can
write feedback into Owner feedback on this report for the next run.

## Honest limits

- **No payment.** Orders are requests; payment is arranged by email.
- **No CAPTCHA.** The form has a hidden honeypot field and validates
  everything, but a determined spammer can still send order requests.
- **No custom domain yet**: the address is the one Busabase gives the site.
- **Going live needs Plus or higher on Busabase Cloud.** The Website engine is
  not in the Free plan. A Free space gets only the private preview in the
  owner's own browser tab: no address, no Go live, nobody else can see it,
  it runs only while the tab is open, and the daily check has no live site to
  probe. Its orders are real rows all the same.
- **The site's keys reach everything their owner can reach in this workspace**
  at write level, not only these tables. The website's fixed routes are the
  only thing in between. There are two: `Site: Shop Website` belongs to
  whoever clicked Go live, `Site preview: Shop Website` to whoever ran the
  preview (opening the node runs it), and each stops working if that person
  leaves the workspace.
- **No notification on a new order.** Someone has to look at New orders (the
  daily check counts them).
- **Stock is not reserved or decremented** by an order.
- **The preview runs on real data**: a test order in the preview is a real row.
- **At most the first 100 products** of the Products table are shown.
- **The site shows what the tables say**, up to a minute late, and stays up
  with the last good data for up to ten minutes if Busabase cannot be reached;
  after that it shows "temporarily unavailable".
- **Certificates are shown as recorded.** The website cannot check the
  documents; an expired one is hidden, nothing more.
- **One shop per workspace.** With two Busa Shop folders the website and the
  importer stop and ask which one (`settings-ambiguous`).

## Helpers in `scripts/`

- `import-products.mjs`: the product-list importer ("Bring products in, any
  way"). One file; needs only Node 20+ and `busabase-sdk`; copy it into an
  empty directory and run it. `--dry-run` writes and uploads nothing;
  `--write-template` writes the template spreadsheet; `--products-base
  <slug>` writes another table. busa-product-hub carries the same file, and a
  test keeps the two identical. Its tests run with the website's
  (`content/busa-shop-app`, `npm test`).
- `probe-site.mjs`: the live-site half of the daily check. Reads the public
  site only.

## Changing the website

Read `$busabase-app-creator` first. The source is `content/busa-shop-app/src/`
(`catalog.js` listing, the two table shapes and images, `orders.js` validation
and the Orders fields written, `seo.js`, `pages.js`, `details.js` which product
details a page shows and how Specs is read, `resources.js` table lookup,
`shop.js` the only code that calls Busabase, `handler.js` routes). Then, in
that folder:

```bash
npm install
npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js
npm test && npm run check
```

Keep routes fixed: never pass a visitor's path, id, filter or body through to
the API. Then the owner clicks Restart (a new preview of the new files) and
Go live again. `content/busa-shop-app/scripts/browser-preview.mjs` is what a Free space runs (the
same `vendor/worker.js`, on the viewer's session, at `location.origin`); keep
`airapp.json`'s `preferredEngine: "site"` (never `requiredEngine`, which turns
a Free space back into an upgrade wall), its `start`, and an `install` that
installs nothing. `npm run check` enforces all three.
