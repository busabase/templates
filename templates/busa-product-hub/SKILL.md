---
name: busa-product-hub
description: Product & certification hub (Busabase App-in-Skill) for export/trade sellers — catalog/SKU master data, pricing, inventory, channel status, content assets, compliance notes, lifecycle state, a certificate-expiry tracker (CE/FCC/RoHS/UN38.3/UKCA), and an approval-gated review queue. Use when the user invokes $busa-product-hub or /busa-product-hub, asks for 电商商品管理, 商品库, SKU 管理, inventory/reorder, product status across Amazon/Shopify/TikTok Shop/eBay, channel publishing approvals, price-change review, quality holds, product lifecycle/archive decisions, certificate expiry tracking, CE/FCC/RoHS/UN38.3/UKCA certification status, MOQ or lead-time questions ahead of a trade show, or a Busabase-backed product management desk. Also use it to bring products in, that is to import a product list from an Excel workbook (.xlsx, pictures inside included) or CSV with English or Chinese columns (导入商品, 导入 Excel 商品表, 上传产品表), or turn a supplier price list PDF, a photo of a catalogue page, a product page the owner points to, or pasted text into products, always as a preview the owner confirms first.
metadata:
  category: ecommerce
  tags:
    - risk:local-write
    - industry:ecommerce
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-product-hub
    resources:
      - products
      - channels
      - inventory
      - review
      - settings
      - certificates
    risk: local-write

---

# Busa Product Hub

## Overview

Export/trade sellers exhibiting at trade shows get asked the same three
questions constantly: "do you have CE?", "what's the MOQ?", "what's the lead
time?" AI can draft a spec sheet in seconds, but it cannot make up an answer
to those three — a wrong one loses the deal or the shipment. Busa Product
Hub is the one place both an agent and a human trust for that answer: it
pairs an AI-drafted product/channel/inventory desk with a human sign-off
gate, plus a certificate-expiry tracker so a supplier sees which
certifications are about to lapse before a buyer asks.

The desk consolidates product master data, SKU pricing, inventory cover,
channel status, asset readiness, compliance notes, lifecycle state, a
certificate tracker, and an approval-gated review queue in a Busabase-backed
App-in-Skill.

Default behavior is AirApp-first. Unless the user explicitly asks only for
explanation, update Busabase directly and give the operator the clickable
AirApp URL (or the local preview URL when local preview is explicitly
requested). Use chat-only mode only when the user says "纯聊天", "chat only",
"不要打开 UI", or similar; then present numbered review items (`Review #1`)
and take verdicts in conversation.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling, AirApp
   runtime limits, security, validation, and deployment.

If a dependency is unavailable, preserve this skill's local artifact and
product contracts, stop before the unavailable Busabase operation, and
report the exact missing dependency. Do not invent a second data backend.

## Boundary

- The AirApp reads and writes Busabase records only. It never publishes a
  channel listing, changes a price, archives a SKU, lifts a quality hold, or
  performs any other external side effect.
- Publishing channels, changing prices, archiving SKUs, and lifting quality
  holds all require a human approval record on a review item. The operator
  (or their agent) performs the real follow-up outside the app after
  explicit approval and reports the concrete result back.
- Reading a product list, a marketplace export, an inventory CSV, or a
  certificate PDF is a genuine external operation a browser cannot perform,
  so it happens in a script the agent runs, never in the AirApp:
  - **A product list** (products, their pictures and certificates, from a
    spreadsheet, a CSV, or anything transcribed into one) enters through
    `scripts/import-products.mjs`, the one product-list importer for this
    template and for busa-shop. See "Bring products in, any way".
  - **Channel rows, inventory per warehouse, review items and the Settings
    row** enter through `scripts/ingest_products.mjs`, which reads a JSON
    payload the agent prepares (shaped like the retired
    `products_snapshot.json`) and upserts every row by natural key
    (`channel_id`/`inventory_id`/`item_id`) so re-ingests are idempotent. It
    imports this template's AirApp modules, so it runs from a checkout of
    busabase/templates, not from the installed skill. Its `products` and
    `certificates` arrays exist for that snapshot loop (re-ingesting the
    state after an approved decision); do not use it for a product list.

  The AirApp itself never fetches documents from remote systems on its own.
- Publishing channels, changing prices, archiving SKUs, lifting quality
  holds, and treating a `spec_claim` as verified all require a human
  approval record on a review item; `scripts/execute_decisions.mjs` never
  performs the action itself — it only writes an execution marker
  (`execution-status: "ready_for_agent"`) with the concrete operation
  (`publish_channel` / `apply_price_change` / `lift_quality_hold` /
  `maintain_quality_hold` / `verify_spec_claim` / `maintain_block` /
  `archive_product` / `request_revision`). The agent performs the real
  follow-up outside the app after explicit approval and reports the
  concrete result back to the operator, then re-ingests the updated state
  with `scripts/ingest_products.mjs`. The AirApp itself only ever decides on
  a review item (approve/request_changes/block) directly onto its own
  record — it never runs either script.
- No seller credentials live in this repo or in Busabase. Never commit local
  payload files, env files, or generated exports.
- Never invent certifications, expiry dates, test reports, inventory, or
  supplier facts. Mark them missing and request evidence (a `spec_claim`
  review item, see below) rather than weakening margin, MAP, low-stock, or
  compliance gates to make a product pass — or letting an unsourced claim
  reach a customer-facing quote.

## Busabase Resources

Six Bases under one application Folder (`busa-product-hub`), declared in
`content/busa-product-hub-app/app/js/config.js` and the generated template
sidecars under `content/`:

- `products`: catalog/SKU master data — lifecycle, status, owner, vendor, image/gallery, tags, the selling price as two plain columns (**Price**, a number, and **Currency**, three letters such as `USD`), and JSON-encoded pricing details (cost, target, MAP, margins)/inventory-rollup/content-readiness/compliance blocks. See "The selling price" below.
- `channels`: one row per product × marketplace channel (Amazon/Shopify/TikTok Shop/eBay) — listing id, status, price, buybox, content score, and channel issue note.
- `inventory`: one row per product × warehouse — on-hand/available/reserved/inbound units, inbound ETA, days of cover, and stock-risk status.
- `review`: the approval-gated review queue — channel publish approvals, price-change review, quality holds, lifecycle/archive decisions, and `spec_claim` items (see below), with the human decision on the same row.
- `settings`: one row (`record-id: "config"`) with the seller profile, platform connectors, warehouses, and review policy.
- `certificates`: one row per product certificate (CE/FCC/RoHS/UN38.3/UKCA, the toy-safety types EN 71 / ASTM F963 / CPSIA / CPC, or Other) — issuer, certificate number, issued/expiry dates, the certificate file, and a source note. **No stored status field** — `valid`/`expiring_soon`/`expired` is always derived client-side from the expiry date vs now (`certStatusFor()` in `product-hub-model.js`), the same derived-not-stored pattern this app already uses elsewhere. `expiring_soon` = within 90 days and not yet past; `expired` = past (or missing/unparseable, treated as the most urgent case); `valid` = more than 90 days remaining. Record a toy test report or certificate under its own type (`EN 71`, `ASTM F963`, `CPSIA / CPC`) rather than as `Other`. A workspace that installed this template before 0.3.0 has the older type list: add those three options to the Certificate type field (a field change on the Certificates Base) before recording them, or the write is refused.

Resources provision lazily through an idempotent Busabase ChangeRequest the
first time the app runs in a Space; see `references/product-hub-schema.md`
for exact field shapes. Metrics and the recent-activity feed are recomputed
client-side from the stored rows on every read
(`content/busa-product-hub-app/app/js/product-hub-model.js`'s
`buildSnapshot`/`assembleSnapshot`), so the desk is always fresh regardless
of when a browser session loads it.

### The selling price

Since 0.4.0 a product's selling price is the **Price** column (`price`, a
number) and its **Currency** column (`currency`). They are ordinary cells: a
person changes a price by editing Price in the Products table, with no JSON to
touch. They are the only place the selling price lives. Never write
`current_price`, `price` or `currency` into the Pricing JSON, which keeps
only the other figures (`cogs`, `landed_cost`, `target_price`, `map_price`,
`gross_margin_pct`, `breakeven_acos`). `gross_margin_pct` is stored, not
computed: it is not updated when someone changes Price, so recompute it when
you change a price or the landed cost.

A workspace that installed this template before 0.4.0 has no Price or
Currency column; its prices are still `pricing.current_price` and
`pricing.currency`. Everything that reads a price (this app's Agent readiness
and product page, busa-shop's website and importer) reads the column and falls
back to the Pricing JSON while the column is empty, so nothing breaks before
the upgrade. When that workspace's Busa Product Hub app is updated to 0.4.0
and opened, it appends the two columns (a field change; without permission to
change fields it waits for a Space admin). `scripts/import-products.mjs` and
`scripts/ingest_products.mjs` then move each product's JSON price into the
columns the next time they write that product. Until then,
change a price where it is stored now: in the JSON on an old table, in the
column on a new one.

Changing a price is still approval-gated for an agent (Boundary above): carry
out an approved `price_change` review item by writing the new Price, never a
second price in the JSON. The owner editing the cell themselves is their own
decision and needs no review item.

### The `spec_claim` review type

`review.type` is free-form text (not a constrained enum), so this is a
documented value convention, not a schema migration. `spec_claim` flags a
specification claim the agent extracted from an uploaded document (e.g. a
spec-sheet PDF) **without** a clear page/section citation. Any `products`
field or `certificates` row whose `source-note` doesn't cite a specific
document + location (e.g. `spec-sheet.pdf p.3`, not `"uploaded by
operator"`) should get a corresponding `spec_claim` review item before that
fact is trustworthy enough to appear on a customer-facing quote. It renders
in the review queue exactly like every other type — there is no separate UI
surface for it.

### Agent readiness

Every product carries a derived **Agent readiness** score out of 7: how ready
its data is for AI shopping agents (ChatGPT, Gemini, Meta Muse, Amazon Rufus)
to read and recommend it. Like certificate status it is **derived, never
stored** — `agentReadinessFor()` in `product-hub-model.js` recomputes it from
the loaded rows every time, so there is no field to write and nothing to
backfill. The seven checks:

1. `price` — the Price column is above 0 and Currency is filled (on a table made before 0.4.0, while those columns are empty: `pricing.current_price` and `pricing.currency`).
2. `availability` — an available/on-hand quantity is known, from the product's `inventory` rollup or its inventory rows.
3. `channel-price` — every `live`/`active` channel row with a price shows the same price (±0.01). No priced live channels passes.
4. `attributes` — `content.attributes.weight`, `.dimensions`, `.warranty`, and `.returns` are all non-empty.
5. `images` — `content.images_ready` is `true`.
6. `sourced-claims` — no `spec_claim` review item for the product is still `needs_review` or `changes_requested`.
7. `certificates` — none of the product's certificates has the derived status `expired`.

The four attribute keys are optional and live inside the existing `content`
JSON field of `products` (`{"images_ready": true, "attributes": {"weight":
"1.2 kg", "dimensions": "38 × 16 × 45 cm", "warranty": "2-year limited
warranty", "returns": "30-day returns"}}`) — there is no schema change. Fill
them only from a cited source; a missing value stays missing and shows up as
a failed check, which is the point. Raise a score by fixing the underlying
data (through `scripts/import-products.mjs`, `scripts/ingest_products.mjs` or
a review decision), never by guessing a value.

## Bring products in, any way

The owner's own product data enters Products and Certificates through one
importer, `scripts/import-products.mjs`, whatever form it arrives in. A
spreadsheet goes in as it is; anything else (a PDF, a photo, a web page,
pasted text) is first transcribed into the template spreadsheet. Every run is
the same four steps: **preview → the owner confirms → import → read back.**
It is the only product-list importer: busa-shop's skill points here too, so
an Excel file, a CSV and a transcribed price list all land the same way.

Never collect product data by crawling: no bulk downloads from brand or
marketplace websites, whose terms usually forbid it. The data comes from the
owner's own files, or from one page the owner points to (below).

### The four steps

1. **Set up.** Copy `scripts/import-products.mjs` from this skill into an
   empty directory, put the owner's file (and a picture folder, if they gave
   you one) next to it, and install the SDK there. The script needs nothing
   else.

   ```bash
   npm i busabase-sdk
   export BUSABASE_BASE_URL=… BUSABASE_API_KEY=… BUSABASE_SPACE_ID=…
   ```

2. **Preview.** `node import-products.mjs products.xlsx --dry-run`. It reads
   Busabase and writes nothing. Show the owner what it prints, as it is: one
   table row per product (ID, name, price, stock, the pictures it found and
   where, create/update, which fields are empty), then "How the columns were
   read", Skipped and Notes. Point out what needs a decision: IDs marked `*`
   (made from the name, see below), prices with no currency, a currency it
   read from a `(元)` header or a `¥` sign, columns kept as product details,
   products a shop would not list and why, rows and pictures it left out.
3. **The owner confirms**, and decides only what the preview says is
   missing and only they can know:
   - the currency of prices that do not say one: `--currency CNY`;
   - whether to put the products on sale: `--fill status=active --fill lifecycle=active`
     (fills only cells that are empty in the sheet *and* in the table);
   - where the data came from, when it was not a file of theirs: `--source "…"`.

   Never fill in a price, a stock number, a specification, a certificate or a
   date yourself. An empty cell stays empty. If the owner corrects the sheet,
   run the preview again.
4. **Import and read back.** The same command without `--dry-run`. Then read
   the Products table back: the number of products, a few prices, and that
   each picture URL opens. If the summary says "waiting for review", the
   credential cannot write here: tell the owner who can approve it.

Running it again changes nothing; after the owner edits the sheet it changes
only what changed. A price in the sheet overwrites the Price cell, so once the
owner edits prices in the table, update the sheet too or leave its price cells
empty.

### Which input, which way

| The owner gives you | What you do |
| --- | --- |
| **An Excel workbook (.xlsx)**, any column names, English or Chinese, pictures inside | Import it as it is (step 2). |
| **A CSV or TSV**, including one saved by Excel on a Chinese Windows (GB18030) | Import it as it is. |
| **A folder of photos** and a sheet that names them | `--images <folder>`: each name in an image column is looked up there. |
| **A supplier price list PDF, a photo or screenshot of a catalogue page** | Write the template (`node import-products.mjs --write-template products.xlsx`) and transcribe into it one product per row, only what you can read on the page. Leave what you cannot read empty and say so. Put the page in 来源 Source (`supplier-price-list-2026.pdf p.2`). Show the owner the filled sheet before the preview. Use pictures from the document only when the owner says they may. On the Certificates sheet too, Source names the page; a certificate whose Source cites no page also gets a `spec_claim` review item. |
| **A product page** the owner points to (their own store, or a supplier's page for a product they sell) | Read that one page, on the owner's behalf, for facts only: name, model, specifications, a price if shown. Do not follow links, open other products or listings, or fetch the site in bulk; if the site's terms forbid automated access, ask the owner to copy the facts instead. Transcribe into the template with the page's address in Source. Do not copy its pictures unless the owner has the rights to them (their own shop, or images the brand licensed to them); otherwise leave the pictures empty and ask for the owner's own photos. |
| **Text pasted into the chat** | Transcribe it into the template, show it, then preview. |
| **A marketplace export with per-channel or per-warehouse rows** | Products through this importer; channel and inventory rows through `scripts/ingest_products.mjs` (Boundary above). |

### What the importer understands

- **Where the table is.** The first sheet whose header row (any of the first
  20 rows; a title row above it is fine) names a product column: a name,
  model, product ID or SKU, plus one more. A sheet like 说明/Instructions is
  passed over. Certificates come from a sheet whose headers name a
  certificate number (认证 Certificates in the template), or from
  `--certificates <file>`; `--sheet` and `--certificates-sheet` choose.
- **Column names.** 名称/商品名称/品名/Name → name; 型号/Model is the name
  when there is no name column, otherwise a detail; 商品编号/Product ID; 货号/SKU;
  售价/价格/零售价/Price → price; 币种/货币/Currency; 成本/进价/Cost →
  `pricing.cogs`; 到岸成本/Landed cost; 库存/Stock → `inventory.available`;
  状态/Status (在售 → active, 草稿 → draft, 下架 → blocked); 生命周期/Lifecycle;
  类目/分类/Category; 供应商/Vendor; 品牌, 颜色, 内存, 存储, 屏幕, 电池, 处理器,
  系统, 网络, 规格, 条码, 材质, 尺寸, 重量, 起订量, 交期, 保修 and their English
  names → `content.attributes`; 主图/图片/图片链接/Image → the main picture,
  图集/Gallery → more pictures; 描述/Description; 卖点/Highlights → bullets;
  标签/Tags; 来源/Source → `content.source`; a column named after a
  certificate (FCC ID, CE 证书编号, UKCA, EN 71…) → a certificate of that type
  with the cell as its number. Bilingual headers (`售价 Price`) work, and a
  unit in brackets goes with bare numbers (`存储(GB)` 256 → `256 GB`).
  **A column it does not know is kept** as a product detail under its own
  header (in the record's Content JSON, `content.attributes`; a shop's website
  does not show it); a column with
  values and no header is reported and left out; 序号 is ignored.
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
  the rest the gallery, at most 12, the same picture once. A picture already
  uploaded (same bytes) is not uploaded again. Not read, and said so: linked
  (not embedded) pictures, EMF/WMF/TIFF/BMP files, pictures on a row with no
  product.
- **Never invents.** An empty cell is "not provided" and leaves the stored
  value alone; it never clears one. `content.source` records where each
  product came from (the Source column, `--source`, or `file › sheet`).
- **Refuses** an old `.xls`, `.ods`, `.numbers`, a PDF or a password-protected
  workbook, saying what to do (save as `.xlsx`, or transcribe).

What it writes, field by field: `references/product-hub-schema.md`,
"Written by `scripts/import-products.mjs`".

### The template spreadsheet

`node import-products.mjs --write-template products-template.xlsx` writes a
blank bilingual workbook (it is also in the templates repository,
[`assets/import/products-template.xlsx`](https://github.com/busabase/templates/raw/main/templates/busa-product-hub/assets/import/products-template.xlsx)):

- **商品 Products**: 商品编号 Product ID, 名称 Name, 型号 Model, 品牌 Brand,
  货号 SKU, 类目 Category, 售价 Price, 币种 Currency, 成本 Cost, 库存 Stock,
  状态 Status, 生命周期 Lifecycle, 颜色 Color, 内存 Memory, 存储 Storage,
  屏幕 Screen, 电池 Battery, 主图 Image, 图集 Gallery, 描述 Description,
  卖点 Highlights, 来源 Source, with one example row;
- **认证 Certificates**: 商品编号 Product ID, 认证类型 Type, 证书编号 Number,
  发证机构 Issuer, 发证日期 Issued, 到期日期 Expires, 来源 Source (added to
  the certificate's source note), with one example row;
- **说明 How to fill**: the rules above in both languages.

The example rows (Product ID `example-phone`) are never imported. Owners may
add any other column; it is kept as a detail.

## Local App

Default behavior is AirApp-first — give the user the clickable AirApp URL.
Start `pnpm --dir content/busa-product-hub-app dev` only when local
preview/debugging is explicitly requested.

Required app views (hash routes):

- `#/overview`: the only page with a hero and a three-number band
  (inventory value, average margin, agent-ready products at 7/7 — labelled
  "loaded rows" when more products exist than are loaded), visual product
  cards, review-queue preview, a **"Certificates expiring soon"** panel, and
  recent activity. Per-view totals sit next to each nav item; low stock,
  channel issues and expiring certificates sit in the sidebar attention block.
- Record views are one toolbar row (title, search, refresh) over a
  full-bleed 40px-row table. Each view opens a record its own way
  (`ui.detail_modes` in `app/js/config.js`):
  - `#/products` → `#/products/<id>` full page (gallery, pricing,
    inventory, content readiness, compliance, the Agent readiness panel,
    channel matrix, linked certificates, linked review items).
  - `#/inventory`, `#/channels`, `#/certificates` → drawer at
    `?peek=<id>`; Escape/Close returns to the list, "Open full page" goes
    to `#/<view>/<id>`.
  - `#/review` → split queue at `?peek=<item_id>`: the queue stays on the
    left, the item's evidence, an optional review note and `approve` /
    `request_changes` / `block` on the right. Decisions write directly onto
    the review item's own record through `busabase-sdk` — there is no
    separate decisions bucket.
  On a phone every mode opens as a page with Back to list.
- `#/settings`: sanitized seller profile, platform connectors, warehouses,
  review policy, and data-provider state, read live off the Settings Base.

Demo mode:

- `?demo=overview`, `?demo=products`, `?demo=inventory`, `?demo=channels`,
  `?demo=certificates`, `?demo=review`, and `?demo=detail` open
  deterministic mock scenes for documentation and screenshots.
- `lang=en` or `lang=zh` forces UI chrome language; demo product names and
  agent notes localize with the chrome.
- Demo mode never reads or writes Busabase. Decision buttons still work in
  the UI but act on in-memory state only.
- Demo product images are the same real static PNG assets shipped under
  `content/busa-product-hub-app/app/assets/product-images/` that the live
  app uses.

## Safety Defaults

- Never invent certifications, expiry dates, test reports, inventory, or
  supplier facts. Mark them missing and request evidence.
- Do not weaken margin, MAP, low-stock, or compliance gates to make a
  product pass.
- Keep channel publishing, price changes, SKU archival, and quality-hold
  changes approval-gated even if the connector credentials are ready.
- Any certificate or product field sourced from a document without a
  page/section citation gets a `spec_claim` review item before it is trusted
  on a customer-facing quote.
- Use stable ids so repeated writes are idempotent.
- Keep demo data deterministic and image-rich so documentation screenshots
  remain stable.

## Helpers in `scripts/`

- `import-products.mjs`: the product-list importer ("Bring products in, any
  way"). One file; needs only Node 20+ and `busabase-sdk`; copy it into an
  empty directory and run it. `--dry-run` writes and uploads nothing;
  `--write-template` writes the template spreadsheet. Its tests run with
  busa-shop's (`templates/busa-shop/content/busa-shop-app`, `npm test`), which
  hold the fake Busabase it is tested against.
- `ingest_products.mjs`: the JSON snapshot ingest for channels, inventory,
  review items and Settings (Boundary). Runs from a checkout of the templates
  repository.
- `execute_decisions.mjs`: writes the execution marker for approved review
  items (Boundary).
- `sync-content.mjs`: regenerates `content/<base>/base.json` from the app's
  `config.js`.

In normal use, invoke `/busa-product-hub` and open the AirApp.
