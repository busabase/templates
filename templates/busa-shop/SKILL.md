---
name: busa-shop
description: Busa Shop (Busa 独立站) is a one-install online shop for a small cross-border seller with 商品管理 built in (no 产品枢纽 to install). Its Products feed a storefront website with checkout (PayPal or order requests), SMTP order emails, policy pages, Orders, Reports and a daily shop check. Use for $busa-shop or /busa-shop, or to open an online shop, 网店 or 独立站; to import products (导入商品, 导入 Excel 商品表, import Excel or CSV, import products from Excel, a product list or 商品表, a PDF or photo); to put products in the shop (把商品放进店, 上架), take them down (下架) or change a price (改价格); to record certificates; to set up payments (收款, 付款, PayPal, 结账, checkout), shipping costs (运费), emails (邮件, SMTP) or policy pages (政策页); to handle orders (订单, what to ship, awaiting payment, payment problems); to write blog posts (写博客, 写文章, 落地页, landing pages) or improve SEO and GEO (Google, Search Console, Analytics, AI assistants); to let AI 助手 like ChatGPT and Claude find and sell your products over MCP (Agent 电商); or to run the daily shop check.
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
      - shipping
      - pages
      - posts
      - settings
      - reports
    risk: local-write
---

# Busa Shop

A real website for a small seller: strangers open it, look at the products,
check out and pay. **The shop keeps its own product list**: the
**Products** table in this folder, with **Certificates** next to it, in plain
columns the owner reads and edits in the table. Change a product there and the
website shows the change within a minute. Nothing else needs installing.

**Checkout** asks for the buyer's delivery address, adds the shipping cost for
their country from the **Shipping** table, and takes the payment with
**PayPal**, into the owner's own PayPal account. PayPal confirms the payment
to the website, which marks the order **paid** and emails the buyer a receipt
and the owner "new paid order" through the owner's own **SMTP** mailbox. The
shop's **policy pages** (Shipping, Returns & warranty, Privacy, Terms,
Contact) come from the **Pages** table and are linked in the footer. The
secrets this needs (the PayPal client secret, the SMTP password) live in the
**Space Vault**, never in a table.

The shop also has a **blog**: the **Posts** table, shown at `/blog`, in the
sitemap, an RSS feed and `/llms.txt`. An Agent writes a post as a **Draft**
from the shop's own facts; the owner reads it and publishes it ("Blog posts
and landing content (博客文章)"). Every page carries what Google and AI
assistants read (titles, descriptions, schema.org data with prices, shipping
and returns), and Settings take a Google Analytics 4 ID and the Search Console
code ("Google and AI assistants (SEO, GEO)").

Until PayPal is set up, and on Busabase Cloud Free, the same checkout sends an
**order request** instead: the website tells the buyer "we will contact you to
confirm and arrange payment", and a person does that by email. How payments,
shipping, emails and orders work, and what you may do there: "Payments and
orders (收款与订单)".

## Mandatory dependencies

1. `$busabase` for connecting, finding nodes, reading and writing records.
2. `$busabase-app-creator` before changing the website's code.

Busa Product Hub (`busa-product-hub`) is **not** needed. It is a separate
template for export sellers who list on several channels (Amazon, Shopify,
TikTok Shop, eBay). A shop can sell from its table instead, when the owner asks
("Sell from a product hub instead", below), and a shop installed before
busa-shop 0.5.0 already does.

## Boundary: what you never do

- Never email or message a customer yourself. You write a reply draft; the
  owner sends it. (The website sends its own order emails; you do not send,
  resend or rewrite them.)
- **Never mark an order `paid` without PayPal's confirmation.** The website
  does that itself when PayPal confirms a payment. Only for an order request
  paid some other way (a bank transfer) do you set `paid`, and only when the
  owner tells you the money arrived. Never set `shipped` unless the owner tells
  you it shipped. Never take, request or record card details.
- **Never refund, and never set `refunded`.** Refunds are made by the owner in
  their PayPal account; PayPal tells the website, which records it. Never
  promise a refund in a reply draft unless the owner said so.
- **Never touch the Vault.** The PayPal client secret and the SMTP password
  are typed into the Space Vault by the owner (or a Space admin) themselves.
  Never ask for them in chat, never write them into a table, a file, a prompt,
  a report or a log, and never read them back. You may name the Vault items
  that are needed and say whether `/api/status` sees them.
- Never switch Settings › PayPal to `live` unless the owner tells you to, after
  a sandbox payment went through.
- Never invent a product fact: a price, stock, a specification, a certificate,
  a date. An empty cell stays empty until the owner gives the value.
- Never fix product data during the daily check. Report it; the owner (or
  "Manage products", when they ask) fixes it.
- **What the owner asks for in so many words is their decision; what you work
  out yourself is a proposal.** Taking products the owner names off sale, or
  writing the exact price they give, you do after showing them the change
  ("Manage products"). A price you would suggest, or a product you think
  should go, you only tell the owner about; you do not write it.
- Never deploy the preview or go live on your own initiative, never change
  `site.access` in `content/busa-shop-app/airapp.json`, and never copy either
  of the site's keys anywhere. Running the preview and going live are the
  owner's decisions and their consent. When the owner asks you to
  (「帮我重启上线」「上线」), tell them what "Open the shop" step 5 says first,
  then do it yourself ("Publish the website for the owner").
- Never overwrite a person's text in Owner feedback, Internal note, Reply
  draft or a product's Notes. Add dated lines; do not rewrite history.
- **Never publish a blog post.** You write a post as a new row with Status
  **Draft**; the owner reads it and sets Status to **Published** in the Posts
  table themselves. Never change a published post's text, Path or Status
  unless the owner asks for exactly that change. If the owner asks you to
  publish, tell them where the Status cell is.
- In a post, only facts from this shop's tables: Products, Shipping,
  Settings, Pages. Never promise free shipping the Shipping table does not
  give, a warranty or return period the product's row or the Returns page does
  not state, a delivery date, or anything about another shop.

## What is in this folder

| Node | What it is |
| --- | --- |
| **Products** | The shop's products, one row per product, plain columns (below). The website sells from here |
| **Certificates** | One row per product certificate: what a product page shows as "valid until" |
| **Orders** | One row per order. The website creates it at checkout (`awaiting-payment`, or `new` for an order request) and afterwards changes only its payment fields, when PayPal confirms something, and its Email log. Staff do the rest (shipped, completed, cancelled). |
| **Shipping** | One row per shipping zone: the countries it covers, the cost, an optional free-shipping threshold, the delivery time. Checkout uses it. |
| **Pages** | The shop's policy pages (Shipping, Returns & warranty, Privacy, Terms, Contact) in simple Markdown, with 【fill in …】 where only the owner can say. |
| **Posts** | The blog: one row per post (Markdown), busabase-cms-sdk's standard Posts fields. Only Published rows are on the site, at `/blog/<slug>`. |
| **Settings** | One row: what the website shows, the non-secret half of PayPal and SMTP, and what the daily check uses. |
| **Reports** | One row per daily shop check, with the owner's feedback. |
| **Shop Website** (`busa-shop-app`, AirApp, Website engine) | The public site. `vendor/worker.js` is what deploys (the bundle of `src/` with busabase-sdk inside); `src/` is its source. `airapp.json` asks for `write` access because checkout creates Orders rows and records PayPal's confirmations on them. It *prefers* the Website engine: a space without it (Busabase Cloud Free) runs the same bundle as a private preview in the viewer's browser tab (`content/busa-shop-app/scripts/browser-preview.mjs`), with no address and no Go live. |
| **busa-shop** (this skill) | The manual. `scripts/` holds the product importer and the live-site probe (below). |

Field-by-field reference: [`references/shop-schema.md`](references/shop-schema.md).

### Products

One row per product. The columns an owner meets first are the ones the
website uses most; the table's **On sale** and **All products** views show
Name, Main photo, Product ID, Status, Price, Currency, Stock and Category.

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
| **Main photo** | The main picture, as a file in the cell (attachment, one): drop or upload it in the table |
| **More photos** | More pictures for the product page, as files (attachment, up to 11), after the Main photo |
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

One row per order, made by checkout. The columns an owner meets first:
**Order** (`ORD-… · customer`), **Order ID** (`ORD-7K2M9QX4PT`, made in the
buyer's browser; it is also the write's idempotency key, so a double click is
one order, and the order's pay page is `/pay/<Order ID>`), **Status**,
**Payment** (`paypal`, or `request` for an order request), **Total** and
**Currency** (items + shipping, as the buyer saw and paid them), the
customer's name, email and phone, **Ship to** (the whole address as one
block, the way it goes on a parcel), **Items**, **Items total**, **Shipping**,
**Delivery time**.

Payment columns, written by the website only when PayPal confirms something:
**Paid at**, **Amount paid**, **PayPal order ID**, **PayPal transaction ID**
(the capture id the owner finds in PayPal), **PayPal payer email**,
**Refunded**, **Payment problem** (what needs the owner, in a sentence),
**Payment log** (one dated line per thing PayPal said, with its event id) and
**Email log** (one dated line per email sent, failed or not sent, and why).

Staff only, never read or written by the website: **Tracking number**,
**Internal note**, **Reply draft**. Also kept, for the agent and for labels:
the address in parts (line 1, line 2, city, state / province, postal code),
**Country** (`Denmark (DK)`), **Items (JSON)** (product id, sku, name,
quantity, unit price, line total), **Customer note**, **Created at**,
**Source** (`website`).

Status, and who sets it ("Payments and orders" has the whole lifecycle):
`awaiting-payment` → `paid` → `shipped` → `completed` for a PayPal order;
`new` → `confirmed` → `paid` → `shipped` → `completed` for an order request;
`cancelled`; `refunded` (PayPal reported a full refund); `payment-problem`
(PayPal denied or reversed the payment, or captured a different amount).

Views: **To ship** (paid, oldest payment first), **New order requests**,
**Awaiting payment**, **Payment problems**, **Confirmed, waiting for
payment**, **All orders** (newest first).

### Settings (one row)

One row holds every setting, so the website and the daily check read typed,
checked values (a currency, a PayPal mode, an email address). People see it a
group at a time: the table opens on the **Store** view, and **Payments
(PayPal)**, **Order emails (SMTP)**, **Google and search** and **Products and
daily check** each show the store name plus their own columns (**All
settings** shows every one). Each column carries its own help (what it is
for, an example), the same as the Meaning below. When the owner asks to change
a setting, write that one cell; never add a second row.

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
| PayPal | website | `off` (order requests only), `sandbox` (test money) or `live` (real payments). See "Set up PayPal" |
| PayPal client ID | website | The PayPal REST app's client ID, sandbox or live to match. Not a secret: the buyer's browser gets it. Its **secret** goes in the Vault |
| PayPal webhook ID | website | The ID PayPal gives the webhook registered for `<live address>/api/paypal/webhook`; every notification is verified with it |
| SMTP host, SMTP port, SMTP security, SMTP username | website | The owner's mailbox for order emails: `smtp.example.com`, `587` with `starttls` or `465` with `tls`, the login (usually the full address). Its **password** goes in the Vault |
| Send emails from | website | The From address (the SMTP mailbox, or an alias it may send as). Empty = the SMTP username |
| Order notifications to | website | Where "new paid order" and "new order request" go. Empty = Contact email |
| Live site address | daily check | The public address shown after Go live |
| Required certificates | daily check | Comma-separated certificate types, e.g. `EN 71, ASTM F963, CPSIA / CPC` |
| Certificate expiry warning (days) | daily check | Warn this many days before a certificate expires |
| Standing check rules | daily check | Rules added from the owner's feedback, one per line, newest last |
| Also show these product details | website | Only for a product hub table: more of its `content.attributes` keys for the product page, comma-separated (`防水等级, gtin`). The shop's own table needs none: its Specs column is the list |
| Google Analytics 4 measurement ID | website | Optional `G-…` ID of a GA4 web data stream for the live address. The public site then loads Google's tag on every page; the members-only preview and the browser preview never do. A pasted gtag snippet works too |
| Google Search Console verification code | website | Optional: the `content` value of the HTML tag Search Console gives for the live address (pasting the whole `<meta …>` tag works too). Every page then carries the tag |
| Bing Webmaster Tools verification code | website | Optional: the `content` of Bing's `msvalidate.01` tag, the same way |

The website reads Settings at most once a minute, so a change shows on the
live site within about a minute, with no redeploy. **Never put a password or
secret into Settings**: two things live in the **Space Vault** instead, each
a Secret marked **Runtime**: `BUSA_SHOP_PAYPAL_CLIENT_SECRET` and
`BUSA_SHOP_SMTP_PASSWORD` ("Payments and orders (收款与订单)").

### Shipping

One row per shipping zone: **Zone** (the owner's name for it, e.g. `European
Union`), **Countries (codes)** (`DE, FR, ES`, ISO codes, comma-separated),
**Shipping cost** (a number; 0 = free), **Currency** (empty = the shop's;
another currency makes the row unusable), **Free shipping from (items
total)** (optional), **Delivery time** (shown at checkout as written,
`7–12 business days`), **Position**, **Notes** (owner only). The template's
rows are fictional demo rates.

Checkout offers a country only when it is in Settings › Ships to (empty =
every country) **and** a usable row names it; the first row (by Position)
that names a country wins. The shipping cost is added to the items total
before the buyer pays, and is free when the items total reaches Free shipping
from. A shop installed before busa-shop 0.6.0 has no Shipping table: it keeps
taking order requests with "shipping confirmed in our reply", and cannot take
PayPal payments until the table exists (install the template again).

### Pages

One row per policy page: **Title**, **Address (slug)** (the page is
`/pages/<slug>`), **Status** (`published` / `draft`; only published pages are
on the site), **Show in footer**, **Position** (footer order), **Text
(Markdown)**. The Markdown is deliberately small: `#`/`##`/`###` headings,
paragraphs, `-` and `1.` lists, `**bold**`, `*italic*`, `[text](https://… or
/pages/… or mailto:…)`; no HTML. `{{store_name}}` and `{{contact_email}}`
become the Settings values. The template installs five published pages
(Shipping, Returns & warranty, Privacy, Terms, Contact) whose every
**【fill in …】** marks something only the owner can say (a return period, a
business address, the law that applies). A published page still showing a
marker is reported by the daily check (`policy-unfinished`). A sixth page,
**Legal notice** (who runs the shop, its registration or self-declaration,
tax), installs as a **Draft** and out of the footer: it goes public only when
the owner fills it in and sets it to published ("Selling legally (法律合规)").

### Posts

One row per blog post, in busabase-cms-sdk's standard Posts fields (so that
SDK, or a Busa CMS admin, can read the table by its slug): **Path** (the
address: `/blog/<slug>`), **Title**, **Slug**, **Locale** (`en` for an English
shop), **Status** (`draft`, `in-review`, `published`, `archived`), **Excerpt**
(the one-line summary on `/blog`, in the feed and in `/llms.txt`), **Body**
(Markdown, below), **Cover image** (an attachment, optional), **Attachments**,
**Author**, **Published at** (the date shown, and the order on `/blog`, newest
first; it does not schedule anything), **Canonical URL** (only when the post
was first published on another site), **Legacy paths** (a JSON list of old
addresses, below), **SEO title**, **SEO description**, **Schema version**
(`1`). Views: All posts, Drafts, Published.

Only a **Published** row with a title, a body and an address is on the site:
on `/blog`, at its address, in `/sitemap.xml`, `/blog/rss.xml` and
`/llms.txt`. A Draft, In review or Archived row is a 404 everywhere. The site
reads Posts with everything else, so a change shows within about a minute. A
published row the site cannot show (no title, no body, no usable address, the
same address twice) is named in `/api/status` under `postsNotShown`.

The template installs two published **sample posts** for the fictional toy
shop (Author `Tumbleberry Toys (sample)`): archive them when the shop is real.
A shop installed before busa-shop 0.7.0 has no Posts table and no blog ("Blog
posts and landing content", "A shop installed before 0.7.0").

### Reports

`title`, `report-date`, `status` (`open` / `acknowledged`), `summary`,
`issue-types`, `issue-count`, `issues` (one line per finding), `orders-waiting`,
`site-check`, `owner-feedback` (the owner writes here), `applied-feedback`
(what the check did with feedback that was due), `checked-at`, `sample` (ticked
only on the one sample report the template installs). Issue types:
`missing-price`, `hidden-product`, `missing-image`, `out-of-stock`,
`certificate-missing`, `certificate-expired`, `certificate-expiring`,
`orders-waiting`, `orders-to-ship`, `payment-waiting`, `payment-problem`,
`email-failed`, `shipping-missing`, `policy-unfinished`, `checkout-setup`,
`demo-leftovers`, `site-unreachable`, `site-mismatch`, `image-unreachable`,
`other`.

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

A product's pictures are **files** in two attachment cells of Products: **Main
photo** (one) and **More photos** (up to 11). The owner drops them into the
cell in the table; the importer uploads them the same way. Each file's `url`
is what the website shows, main photo first, at most 8 on a page.

Two older places hold **links** (plain text) instead, and the website still
reads them, but only while a row's Main photo and More photos are both empty:
**Image** / **Gallery** in a Busa Product Hub table, and **Image URL** / **More
photos (one link per line)** in a shop installed before 0.9.0 that has not
moved its photos yet ("A shop installed before 0.9.0").

Either way the website decides per link (`classifyImageRef` in
`src/catalog.js`):

- **An `https://` URL on another host** (an uploaded file's public address on
  Busabase Cloud, a CDN): the buyer's browser loads it directly. It must open
  in a private browser window without signing in; the daily check tests one.
- **A URL on the Busabase server itself** (a self-hosted or Desktop file): a
  stranger cannot load it, so the website serves it at
  `/images/<product-id>/<n>`, fetching it with its key. That route answers
  only for image *n* of a **listed** product; any other id, a hidden product
  or an index out of range is a 404, and the key is only ever sent to the
  Busabase server, never to another host.
- **A path inside the Product Hub AirApp** (`./assets/product-images/…`, a
  product hub's own sample data): served the same way, only when the shop
  sells from a product hub table.
- Anything else (`http://` elsewhere, `data:`, other paths) is ignored. A
  listed product without a usable image shows "Photo coming soon".

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
   (and, for a product hub, its AirApp, for the pictures inside it);
4. Shipping and Pages: stamped `busa-shop` / `shipping`, `pages` in the folder
   of its Settings (fallback slugs `busa-shop-shipping`, `busa-shop-pages`).
   A shop installed before busa-shop 0.6.0 has neither and keeps working:
   order requests with no shipping line, no policy pages, no PayPal.
5. Posts: stamped `busa-shop` / `posts` in the folder of its Settings
   (fallback slug `busa-shop-posts`). Without it the shop has no blog and no
   "Blog" link; everything else works.

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
   back: the number of products, a few prices, and that each product has
   its Main photo. If the summary says "waiting for review", the credential cannot
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
- **Pictures.** They become files in Main photo and More photos. An `https://`
  link in an image column is downloaded and stored as the shop's own file, so
  the shop never depends on a supplier's server (`http://` is left out; a link
  that does not download is left out and named). A file name is read from
  `--images` (default `images/` next to the file) and uploaded. Pictures inside the workbook are
  uploaded too: a floating picture belongs to the row its top-left corner is
  in (a corner in the lower half of a row counts for the next row, which is
  where LibreOffice puts pictures it re-measured), Excel's **Place in Cell**
  pictures and WPS's in-cell pictures (`=DISPIMG(…)`) to their cell, and
  `=IMAGE("https://…")` is downloaded like a link. The first picture is the
  Main photo, the rest More photos, at most 12, the same picture once. A
  picture already on the product (the same bytes) is not uploaded again. In a
  product hub table, or a shop from before 0.9.0 without the two photo cells,
  links stay links and uploads go in as their public addresses, as before. Not read, and said
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
   Certificates, Orders, Shipping, Pages, Settings, Reports, Shop Website and
   this manual, in one folder. Products and Certificates start empty, and the website says "No
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
   Then **Shipping** (a real cost for every ships-to country: "Shipping costs
   (运费)"), the **policy pages** (every 【fill in …】 answered: "Policy pages
   (政策页)") and, when the owner wants them, **order emails** ("Order emails
   (邮件, SMTP)") and PayPal in sandbox ("Set up PayPal": a test purchase
   works in the members-only preview of step 4). Tell the owner about
   "Selling legally (法律合规)" and the hidden **Legal notice** page.
4. **The owner opens Shop Website.** On Plus and higher (the Website engine),
   opening the node starts the members-only preview by itself, on real data,
   in the App tab: there is nothing to click first. (A **Run** button appears only on a node that has never run.) The
   header then shows **Running** and **Not live**, with the buttons **Go
   live** and **Restart** (zh-CN: 「运行中」「未发布」「上线」「重启」).
   Running the preview creates an API key in the owner's name, listed as
   `Site preview: Shop Website`, with the same write access as the live site.
   Once it runs, open the preview and check: the home page lists what the
   listing rule says it should, a product page, `/api/status`
   (`"setup": "ready"`, `"productsFrom": "shop"`, and what it says about
   `payments`, `shipping`, `email` and `pagesToFinish`), `/sitemap.xml`, a
   policy page from the footer. A test order lands in the real Orders table
   (and, with SMTP set up, sends real emails): place one only if the owner
   agrees, then delete it.

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
   asks for **write** access, because checkout must save orders and record
   PayPal's confirmations on them. Going
   live creates an API key in your name, listed as `Site: Shop Website`, next
   to the preview's `Site preview: Shop Website`; each can do whatever you
   can do in this workspace, not only these tables, and the website's code is
   the only thing between a stranger and that. Turning Public off, or moving
   the app to Trash, cuts the live site off." The owner clicks **Go live**
   (「上线」), or asks you to: then follow "Publish the website for the
   owner". The header then shows **Live** (「已上线」) and the message "The
   site is live." (「网站已上线。」).
6. **Write the live address into Settings › Live site address**, so the daily
   check can test it. The owner finds it under **More actions → Settings**
   (「更多操作」→「设置」): **Address** (「地址」), with the **Public**
   (「公开」) switch next to it.
7. **Register the PayPal webhook** for `<live address>/api/paypal/webhook`
   ("Set up PayPal", step 6): webhooks only arrive after Go live. Live
   payments only when the owner says so.
8. **After any change to the website's code**, the live address keeps serving
   the old version until a new preview of the new files is deployed and goes
   live: the owner clicks **Restart** and then **Go live**, or asks you to
   ("Publish the website for the owner"). Changes to Settings and to products
   need no redeploy.

### Publish the website for the owner (重启、上线)

Only when the owner asks, and after you told them step 5. Use the Shop Website
node's id (the AirApp in this folder, stamp `resourceKey: busa-shop-app`) and
the owner's own credential: the live site's key is created in the name of
whoever goes live.

```bash
SITE=<Shop Website node id>
H=(-H "Authorization: Bearer $BUSABASE_API_KEY" -H "x-busabase-space: $BUSABASE_SPACE_ID")
curl -s "$BUSABASE_BASE_URL/api/v1/airapps/$SITE/site" "${H[@]}"                  # what is live, previewStale
curl -s -X POST "$BUSABASE_BASE_URL/api/v1/airapps/$SITE/site/preview" "${H[@]}"  # Restart: preview the current files
curl -s -X POST "$BUSABASE_BASE_URL/api/v1/airapps/$SITE/site/go-live" "${H[@]}"  # Go live: publish that preview
```

The same actions are MCP `airapps_site_state`, `airapps_site_deploy_preview`,
`airapps_site_go_live`, and `busabase-cli airapps site-deploy-preview` /
`site-go-live --node-id <id>` in a busabase-cli newer than 1.3.1. Read each
`outcome`: `ok`; `preview-stale` (the files changed after the preview: deploy
the preview again, never publish another way); `no-preview`; `blocked`
(`state.blockers` names why the files cannot deploy). Then check the live
address with `node scripts/probe-site.mjs <address>` and tell the owner what
went live. A 403 means the credential cannot write to the app: the owner
goes live themselves.

## Payments and orders (收款与订单)

Everything about getting paid and getting the parcel out: 收款 / 付款 / PayPal /
结账 (checkout), 运费 (shipping costs), 邮件 / SMTP (order emails), 订单 (orders),
政策页 (policy pages). The owner sets it up once; after that the website runs it,
and you help the owner read it and do the human steps.

### How an order moves

| Status | Means | Set by |
| --- | --- | --- |
| `awaiting-payment` | The buyer filled in checkout and was sent to PayPal; PayPal has not confirmed a payment | the website |
| `paid` | PayPal confirmed the payment, for exactly the order's total and currency | the website, from PayPal. For an order request paid another way: staff, when the owner says the money arrived |
| `shipped` | Handed to the carrier, Tracking number filled in | staff |
| `completed` | Arrived, nothing left to do | staff |
| `new` | An order request (PayPal is off): nothing was charged | the website |
| `confirmed` | The owner confirmed an order request by email and waits for the payment | staff |
| `cancelled` | Will not be sent | staff |
| `refunded` | PayPal reported the payment refunded in full (a partial refund only fills **Refunded**) | the website, from PayPal |
| `payment-problem` | PayPal denied or reversed the payment, or captured a different amount: **Payment problem** says what, in a sentence | the website, from PayPal |

How the website knows: when the buyer approves in PayPal's window, the website
captures the payment itself (PayPal's standard integration: the order is
created and captured on the server, with the amount from the Orders row, never
from the browser), then PayPal also sends a **webhook** for every payment
event. The website checks every webhook with PayPal
(`verify-webhook-signature`) before it reads it, matches it to the order by our
Order ID (the PayPal order's `custom_id`) or, for a refund, by the PayPal
transaction ID, checks the amount and currency against the order, applies it
once (the event id goes into Payment log, so a repeated notification changes
nothing) and only then changes the order. A buyer who closes the window after
approving is still captured, from the `CHECKOUT.ORDER.APPROVED` webhook.

The website writes, besides creating the row: Status (`paid`,
`payment-problem`, `refunded` only), PayPal order ID, PayPal transaction ID,
Amount paid, Paid at, PayPal payer email, Refunded, Payment problem, Payment
log, Email log. Nothing else, and never on an order it did not create.

### Set up PayPal

PayPal's own standard checkout, in the owner's own PayPal business account
(https://developer.paypal.com/docs/checkout/standard/). The owner does every
step below in PayPal and in the Vault; you explain, then check the result.
One shop, one Shop Website node: sandbox and live are a switch in Settings,
each with its own credentials. Start in **sandbox** (test money):

1. **A sandbox app.** In https://developer.paypal.com, signed in with the
   PayPal business account: **Apps & Credentials**, **Sandbox**, **Create
   App** (type Merchant). It shows a **Client ID** and a **Secret**.
2. **Client ID → Settings › PayPal client ID** (you may write it when the
   owner pastes it: a client ID is public, the buyer's browser receives it).
3. **Secret → the Space Vault, by the owner.** In Busabase: the settings
   window (「工作空间设置」, from the account menu) → **Vault** (under 账户) →
   **Space overrides** (「Space 覆盖值」) → choose this shop's space → **Add
   secret** (「添加 Secret」): Name
   `BUSA_SHOP_PAYPAL_CLIENT_SECRET`, Value the Secret, **Runtime** ticked →
   **Save** (「保存」). Only the Space's owners and admins can. It must be the
   **Space** tab: the website's keys (`Site preview: Shop Website` for the
   preview, `Site: Shop Website` for the live site) never receive anyone's
   personal (User defaults) values, and receive the Space's only while the
   person who ran the preview or clicked Go live can write in this space.
4. **Settings › PayPal = `sandbox`.** Within a minute, open the preview's
   `/api/status` (or the live one): `"payments": "paypal-sandbox"`. Anything
   else comes with `paymentsNote`: `off`, `no-client-id`, `no-secret` (no
   Vault item by that name in the Space tab marked Runtime, or the key's
   person cannot write in the space), `vault-unreadable`,
   `currency-not-supported` (PayPal does not take Settings › Currency),
   `no-shipping-table`, `browser-engine` (Free: no online payment). Until it
   is ready, checkout keeps taking order requests.
5. **A test purchase, in the members-only preview.** No Go live is needed:
   the preview (Plus and higher) is the same website with its own key. PayPal
   developer dashboard → **Testing Tools** → **Sandbox Accounts**: a
   *Personal* account's email and password pay with sandbox money. Open Shop
   Website, add a product, check out, pay as that account. The website
   captures the payment itself, so the order is `paid` the moment PayPal's
   window closes (Payment log: `buyer approved: capture … COMPLETED … →
   paid`), and the receipt and the owner's notice go out by email right then.
6. **The webhook, after Go live.** PayPal can only reach the public live
   address, so **webhooks only arrive after Go live**; the preview never gets
   them. In the same PayPal app, **Webhooks** → **Add Webhook**, URL
   `<Settings › Live site address>/api/paypal/webhook`, events **Payment
   capture completed**, **denied**, **pending**, **refunded**, **reversed**
   and **Checkout order approved** → Save, and its **Webhook ID** into
   Settings › PayPal webhook ID. Payments do not wait for it: it is the
   backup that records what happens later in PayPal (a refund, a reversal or
   dispute, a capture PayPal finished after holding it, a buyer who closed
   the window after approving). Without it (in the preview, or before it is
   registered) those later changes are not written to the order: the owner
   sees them in PayPal and tells you, and you note them in Internal note. A
   webhook that arrives while Settings › PayPal webhook ID is still empty is
   answered "try again later"; PayPal retries for three days, so none is
   lost while the owner registers it.

**Switching to live** (only when the owner says so, after a sandbox purchase
worked): in PayPal switch to **Live**, take the live app's Client ID (into
Settings) and Secret (the owner replaces the Vault value, same name), add the
same webhook URL to the live app and put its Webhook ID into Settings, then
Settings › PayPal = `live`. All of them belong together: a sandbox client ID
with a live secret is refused by PayPal (checkout then says PayPal is
unavailable and the order stays `awaiting-payment`). One small real order,
refunded afterwards in PayPal, proves it.

The Vault is on every Busabase Cloud plan, Free included (no plan switch
gates it). Online payment needs the Website engine (Plus and higher): on a
Free space the browser preview has no key to read the Vault with and cannot
open a mail connection, so its checkout takes order requests and shows the
owner, and only the owner, a note saying why.

### Order emails (邮件, SMTP)

The website sends, in the store's language, from the owner's own mailbox:

| Email | To | When |
| --- | --- | --- |
| `payment-receipt` | buyer | PayPal confirmed the payment: the order, address, amount and PayPal transaction ID |
| `owner-paid` | Settings › Order notifications to (else Contact email) | the same moment: a new paid order to ship |
| `request-received` | buyer | an order request was saved: only the shop's own data (items, prices, order number), never the name, note or address typed into the form, because anyone can type anyone's email there |
| `owner-request` | the owner | an order request was saved |
| `owner-problem` | the owner | PayPal denied or reversed a payment, or the amount did not match |

Setup, all in Settings except the password: **SMTP host**, **SMTP port** and
**SMTP security** (`465` + `tls`, or `587` + `starttls`; port 25 is blocked
for websites), **SMTP username** (usually the full mailbox address), **Send
emails from**, **Order notifications to**. The password (for Gmail or Outlook
with two-step login an *app password*, for QQ / 163 mail the *authorization
code*) goes into the Space Vault by the owner, as above: Name
`BUSA_SHOP_SMTP_PASSWORD`, Runtime ticked.

**QQ Mail (QQ 邮箱)**, the template's defaults: SMTP host `smtp.qq.com`,
port `465` with `tls` (QQ also lists 587: then `starttls`), SMTP username and
Send emails from both the full QQ address (`12345678@qq.com`), and in the
Vault the mailbox's **授权码**, never the QQ password. The owner turns SMTP on
and generates the 授权码 in QQ Mail's settings (设置 → 账号 → POP3/IMAP/SMTP
服务 → 开启, then 生成授权码): https://service.mail.qq.com/detail/0/141 and
https://wx.mail.qq.com/list/readtemplate?name=app_intro.html#/agreement/authorizationCode
(changing the QQ password expires the 授权码: then put the new one in the
Vault). `/api/status` then says
`"email": "ready"`; otherwise `off` (no host), `no-sender`, `no-password`,
`bad-port`. `none` security is only for a local test mail catcher: it sends no
password.

Every order's **Email log** says what was sent to whom, or why not
(`FAILED payment-receipt to …: 535 …`, `no email sent: …`). An email never
holds up an order or a payment, and a failed one is not retried: tell the
owner, who can write to the buyer from the mailbox. SMTP is for these few
emails per order, not for newsletters or bulk mail (mailbox providers cap a
day's sending, and bulk mail from a personal mailbox gets it blocked); bulk
email needs an email service such as AWS SES, which this template does not
use.

### Shipping costs (运费)

When the owner gives you costs ("EU 12 dollars, free from 90; US 9"), show the
Shipping rows before and after (Zone, Countries, Shipping cost, Free shipping
from, Delivery time), write them after the owner says yes, read them back, and
tell the owner every Settings › Ships to country that still has no usable row:
checkout does not offer it. Never invent a cost or a delivery time; an empty
Delivery time is fine. A cost is in the shop's currency (Currency empty). A
change shows at checkout within about a minute.

### Policy pages (政策页)

Buyers and PayPal expect a shop to say how it ships, takes returns, handles
data and who runs it. The five pages are generic and every **【fill in …】** is
a question for the owner. List the markers still on published pages, ask the
owner each answer, show the changed text, write it after their yes. Never make
up a return period, a warranty, a business name or address, a law or a
company number: an unanswered marker stays. Keep what the pages say in line
with Shipping (delivery times), Settings (contact email, ships-to) and how the
shop takes payment. They are templates, not legal advice: the owner is
responsible for them and should check what the countries they sell to
require. Add a page with a new row (published, an Address of lowercase letters,
digits and `-`).

### Selling legally (法律合规)

Guidance with official sources, **not legal advice**: tell the owner what to
check, and never decide for them. For an individual selling online from
mainland China:

- **Registration.** The E-commerce Law (《电子商务法》第十条) and
  《网络交易监督管理办法》第八条 let an individual with **total annual sales of
  no more than 100,000 CNY** (all their online shops added up) sell without
  registering a business; above that, or for goods that need a licence, they
  register (个体工商户 or a company). Texts:
  https://www.cac.gov.cn/2018-09/01/c_1123362506.htm and
  https://www.gov.cn/zhengce/zhengceku/2021-03/16/content_5593226.htm
- **What the shop must show.** A registered seller shows its business
  licence information on the shop's front page (《电子商务法》第十五条). An
  individual who does not need to register must, under
  《网络交易监督管理办法》第十二条, truthfully show a self-declaration (e.g.
  「个人从事零星小额交易活动，依法不需要办理市场主体登记」) with their real
  address and contact, or a link to it. The template's **Legal notice** page
  is the place for this; it installs as a hidden draft so that nothing is
  published in the owner's name until they fill it in and publish it. Never
  publish it for them, and never write a self-declaration or a licence
  number they have not given you.
- **Tax.** Shop income is taxable (《电子商务法》第十一条). The local tax office
  (hotline 12366) says what applies.
- **Consumers.** In China, goods sold online can be returned within seven
  days without a reason, with a few exceptions (《消费者权益保护法》第二十五条);
  buyers abroad have their own rights (in the EU, 14 days). The Returns page
  must not promise less than the buyer's law gives.
- **Personal data.** Names, addresses and phone numbers are personal
  information (《个人信息保护法》; the GDPR for EU buyers): collect only what
  shipping needs, keep it safe, say so on the Privacy page.
- **Export and import.** What may be sold, product safety marks (CE, UKCA,
  EN 71, CPSIA…), import duties and VAT depend on the destination country;
  check each country in Settings › Ships to before selling there.

The laws above are in the national law database, https://flk.npc.gov.cn
(search by name).

### Ship a paid order

**To ship** lists the paid orders, oldest payment first. For each: the Ship
to block, the phone, the items. When the owner says an order has gone out and
gives the tracking number: write **Tracking number**, set Status `shipped`,
add `YYYY-MM-DD shipped, tracking … (owner in chat)` to Internal note, and
remind the owner to lower Stock (orders do not change it). `completed` when the
owner says it arrived. The website does not email the buyer about shipping:
draft that email for the owner if they want one.

### Awaiting payment and payment problems

- **Awaiting payment** for more than a day is almost always a buyer who left
  at PayPal's window. Nothing was charged. Its pay page `/pay/<Order ID>`
  still works if the buyer comes back. Cancel it only when the owner says so.
- **Payment problem**: read Payment problem and Payment log to the owner in
  plain words and say what to look at in PayPal (Activity, Resolution Center
  for a reversal). Do not ship a `payment-problem` order until the owner has
  checked PayPal. Never change its status yourself.
- **Refunds** are made by the owner in PayPal (Activity → the payment →
  Refund). PayPal tells the website; the order shows **Refunded** and, when
  it is the whole amount, `refunded`.

## Handle a new order request

An order request is what checkout makes while PayPal is off (and on a Free
space): status `new`, nothing charged. For each, oldest first:

1. Read its items and check each against Products now: still listed, in
   stock (Stock ≥ quantity, or Stock empty), price unchanged. The shop has
   already refused unknown, hidden and sold-out products, but stock is not
   reserved by an order and may have changed since.
2. Check the country is one the owner ships to and the email looks real.
   Obvious spam (nonsense name, link in the note): set status `cancelled` and
   add `YYYY-MM-DD spam, cancelled by agent at <owner>'s request` only if the
   owner agrees; otherwise flag it.
3. Write **Reply draft**: thank them, confirm what is available, say what is
   not, give the shipping cost (the order's Shipping, from the Shipping
   table; a placeholder `[shipping cost]` for the owner when it is empty), and
   how payment will be arranged (`[payment details]`; never a link you made
   up). Sign with the store name.
4. Add a dated line to **Internal note** with what you checked. Leave status `new`.
5. Tell the owner which orders are ready to send, and anything odd.

When the owner says the reply was sent: status `confirmed`. Paid (the owner
says the money arrived): `paid`. Shipped: "Ship a paid order". Cancelled:
`cancelled` with the reason in Internal note. When an order is confirmed or
shipped, remind the owner to lower the product's Stock (orders do not change
stock).

## Blog posts and landing content (博客文章)

Buyers ask the same questions before they buy: what it costs to ship to my
country, how long it takes, which phone suits me, what happens if it breaks.
A post that answers one of them, with this shop's own facts, is what Google
shows for that question and what an AI assistant quotes. The Agent plans and
writes; **the owner publishes**.

### Where a post appears

- At its address: its **Path** when that is `/blog/` plus one lowercase slug
  (letters, digits, hyphens, at most 100), e.g.
  `/blog/redmi-13c-price-and-shipping-thailand`; otherwise at `/blog/<Slug>`.
  The same Path with capitals or a trailing slash redirects to it.
- On `/blog`, newest Published at first, with its Excerpt and picture. The
  header and footer show a **Blog** link only while at least one post is
  published.
- In `/sitemap.xml`, the RSS feed `/blog/rss.xml` and `/llms.txt` (not a post
  whose Canonical URL names another site).
- Under the post, **Products in this post**: a card for every product on sale
  the body links to as `/products/<Product ID>` (at most four).
- In `<head>`: the SEO title (else "Title · store name"), the SEO description
  (else the Excerpt), the canonical address, Open Graph `article` tags, and
  schema.org `BlogPosting` plus a breadcrumb. The picture is the Cover image,
  else the photo of the first linked product.

### Plan posts

1. Read Settings (store name, language, currency, Ships to), Shipping (zones,
   costs, Free shipping from, delivery times), the products on sale, the
   Shipping and Returns & warranty pages, and the posts already there (no
   second post on the same question).
2. Propose the number of posts the owner asked for (three if they did not
   say). For each: the title, the question it answers in the words a buyer in
   one of the Ships to countries would type, the Path, the products it links
   to, and **every fact it will use with the table it comes from**. Say which
   facts are missing (a network band, a duty amount) instead of filling them.
3. Write nothing until the owner picks.

### Write a draft

1. One new row in Posts, **Status `draft`**, through a Change Request:

   ```bash
   busabase-cli bases get --slug <Posts slug, usually busa-shop-posts> --output json   # its Base id
   busabase-cli bases create-change-request --base-id <Posts Base id> --fields-json @post.json \
     --message "Blog post draft at the owner's request: <title>"
   ```

   `post.json`: `path`, `title`, `slug` (the Path's last part), `locale`
   (`en` for an English shop; the SDK's choices are `en`, `zh-CN`, `zh-TW`,
   `ja`, `pt`), `status: "draft"`, `description` (one sentence), `body`,
   `author` (the store name unless the owner names someone),
   `seo-title` (at most 60 characters, with the buyer's words),
   `seo-description` (at most 155), `schema-version: 1`. Leave
   `published-at`, `canonical-url` and `legacy-paths` empty.
2. **Only facts from the tables.** Every price as Products says it, in the
   shop's currency (do not convert currencies: the tables hold no exchange
   rate), every spec from Specs, every shipping cost, threshold and delivery
   time from Shipping (with its country), warranty and returns from the
   product's Warranty and Returns and the Returns & warranty page, duties and
   taxes only as the Terms or Shipping page says them. A fact the tables do not
   hold is left out or written as "ask us", never guessed.
3. **Never** promise free shipping the Shipping table does not give, a
   "global" or "international" warranty, a delivery date, the lowest price,
   an official or authorised status, or a certificate Certificates does not
   hold; never write about another shop. A page still showing 【fill in …】
   is not a source.
4. Link the products by `/products/<Product ID>`, the policy pages by
   `/pages/<slug>`, other posts by their Path.
5. The Markdown is the policy pages' small set: `##` and `###` headings,
   paragraphs, `-` and `1.` lists, `**bold**`, `*italic*`, links, and tables
   (a header row, then `| --- | --- |`). No HTML and no pictures in the body
   (the Cover image is the post's picture). A `#` heading becomes the same
   level as `##`: the post's title is its only `<h1>`.
6. Write in the shop's language (Settings › Language) unless the owner asks
   for another.
7. Read the row back and tell the owner: it is in **Posts › Drafts**, it is
   not on the site, and to publish it they set its **Status** to
   **Published** (it then shows within about a minute).

### Check a draft

Compare every price, spec, shipping cost, delivery time, warranty and return
promise in the draft with the tables and pages it came from, and list each one
that does not match, plus an empty SEO title, SEO description or Excerpt, a
Path that is not `/blog/<slug>`, and links to products that are not on sale.
Change nothing; the owner decides.

### The owner publishes

In Posts, the draft's **Status** cell → **Published**. The website shows it
within about a minute: on `/blog`, at its address, in the sitemap, the feed
and `/llms.txt`. Optionally set **Published at** to the date to show (empty =
no date, ordered by its last change). To take a post down, set Status to
**Archived** (or back to Draft): it is a 404 within a minute, and search
engines drop it on their next visit. Google itself takes days to weeks to
visit a new address; submitting the sitemap in Search Console helps ("Google
and AI assistants (SEO, GEO)").

### Change a post's address

Change its Path and add the old one to **Legacy paths**, a JSON list such as
`["/blog/old-address"]`: a visit to an old address is redirected (301) to the
current one, so links and search results keep working. A legacy path can be
any path the old site used (`/2025/phones.html`), but never one of this site's
own routes. Never give a new post an address that another post used.

### Read the posts with busabase-cms-sdk

The fields are the SDK's standard Posts without its two taxonomy relations
(Categories, Tags), so its reader works on this table by slug:

```js
import { createBusabaseCms } from "busabase-cms-sdk";
const cms = createBusabaseCms({ config: { baseUrl, apiKey, spaceId }, baseSlugs: { posts: "busa-shop-posts" } });
const posts = await cms.posts.list(); // published rows only
```

Not its Folder mode (`folderId`): that expects Categories, Tags and the SDK's
own Pages next to Posts, and this folder's Pages are the policy pages.

### A shop installed before 0.7.0

It has no Posts table and no Google fields in Settings; everything else keeps
working. To add them (owner's yes first): create the Base in the shop's folder
with the fields of `templates/busa-shop/content/posts/base.json` in
github.com/busabase/templates, and the three Settings fields:

```bash
busabase-cli bases create --slug busa-shop-posts --name Posts --parent-node-id <the shop's folder node id> --fields-json @posts-fields.json
busabase-cli bases create-field --base-id <Settings Base id> --slug ga4-id --name "Google Analytics 4 measurement ID" --field-type text
busabase-cli bases create-field --base-id <Settings Base id> --slug google-site-verification --name "Google Search Console verification code" --field-type text
busabase-cli bases create-field --base-id <Settings Base id> --slug bing-site-verification --name "Bing Webmaster Tools verification code" --field-type text
```

The website finds a Posts table by the slug `busa-shop-posts` in the folder
of its Settings, and needs a new deploy of 0.7.0's `vendor/worker.js`
(Restart, then Go live) to read it.

### A shop installed before 0.9.0

Its Products keep pictures as links in **Image URL** and **More photos (one
link per line)**, and its Settings show all 28 columns in one row. Everything
keeps working. To move it to 0.9.0 (owner's yes first; the order matters,
because the live website reads the link columns until it runs 0.9.0):

1. **Website first.** Update the Shop Website node's files to 0.9.0's (at
   least `src/catalog.js` and the rebuilt `vendor/worker.js`), then deploy a
   new preview and go live: the owner clicks **Restart** and **Go live**, or
   asks you to ("Publish the website for the owner"). 0.9.0 reads the photo cells and, while they
   are empty, the old links, so nothing disappears.
2. **Add the two photo columns** to Products, with the field definitions of
   `templates/busa-shop/content/products/base.json` (`main-photo`,
   `more-photos`: attachment, images only, 1 and 11 files, with their help).
   `POST /api/v1/bases/<Products Base id>/fields` takes each definition as it
   is. Put Main photo in the views in place of Image URL.
3. **Move the photos**, preview first:
   `node import-products.mjs --move-photos --dry-run`, then without
   `--dry-run`. Each row's links are downloaded and stored as files named
   after the product (`tt-walking-robot-1.svg`, `-2`…), main first. A row that
   already has a photo is left alone, so it can run again. It names each link
   it could not download.
4. **Check the website** (`node probe-site.mjs <live address>`: no
   `images.failed`), then **delete the two old columns** (Image URL, More
   photos (one link per line)) with the owner's yes. The record history keeps
   the old links.
5. **Settings**: add each field's help and the six views of
   `templates/busa-shop/content/settings/base.json` (Store, Payments (PayPal),
   Order emails (SMTP), Google and search, Products and daily check, All
   settings), Store first. Nothing in the row changes.

The folder keeps saying `version: 0.8.0` in its metadata: the installer writes
it, and the API does not let anyone change a folder's version afterwards.
What runs is what the steps above changed.

## Google and AI assistants (SEO, GEO)

What the website does by itself, from the tables, on the live address:

- Every page has a title, a description, its canonical address and Open
  Graph tags; drafts, the order form and payment pages are kept out of search.
- **schema.org data**: the home page is an `OnlineStore`; a product page is a
  `Product` with an `Offer` (price, currency, in or out of stock, new), plus
  **shippingDetails**, one per Shipping zone, for the countries checkout
  offers (the cost for one unit, 0 when its price reaches Free shipping from;
  only zones whose Delivery time reads as days, like `6–10 business days`),
  and **hasMerchantReturnPolicy** when the product's Returns says a number of
  days (`30-day returns`) or no returns. A post is a `BlogPosting`.
- `/sitemap.xml`: the home page, every listed product, every published policy
  page, `/blog` and every post.
- `/robots.txt`: every crawler is allowed (only `/api/`, `/order`, `/pay/` are
  off-limits), the search engines' and AI assistants' crawlers are named
  (Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  Claude-SearchBot, Claude-User, PerplexityBot, Applebot…), and it links the
  sitemap.
- `/llms.txt`: a plain summary for AI assistants: the store, what it sells,
  where it ships and for how much, payment, contact, every listed product
  with its price and link, the policy pages and the posts.
- `/blog/rss.xml`: the newest 20 posts.

What the owner does (tell them; never do it for them):

1. **Google Search Console**: Add property → URL prefix → the live address →
   HTML tag. Copy the `content` value (or the whole tag) into Settings ›
   **Google Search Console verification code**, wait a minute, click
   **Verify**. Then Sitemaps → submit `sitemap.xml`.
2. **Google Analytics 4**: create a property and a Web data stream for the
   live address, copy its Measurement ID (`G-…`) into Settings › **Google
   Analytics 4 measurement ID**. Within a minute the public site loads
   Google's tag on every page; open the live site in another browser and
   watch Reports › Realtime. The members-only preview and the Free plan's
   browser preview never load it, so the owner's own previews never count.
3. **Bing** (optional): the same with Bing Webmaster Tools'
   `msvalidate.01` code.

`/api/status` says `"google": { "analytics", "searchConsole", "bing" }`
true or false (never the values), and the live-site probe says whether the
home page carries them. Better data makes better results: a Delivery time
written in days, Returns with a number of days, a Subtitle and Description
on every product, real photos.

## Agent commerce (AI assistants find and sell your products, Agent 电商)

A shopper asks their AI assistant "find me a phone under $200 that ships to
Thailand, and give me the buy link". With this shop's **MCP server** added
to the assistant, it searches the shop's own catalog, answers with the
products, prices and the shipping cost to that country, and hands over a
link to the shop's checkout page with the product and the country already
filled in. The buyer types the address and pays **on the shop's website**
(PayPal, or an order request when PayPal is off), never in the chat: Claude
and ChatGPT do not allow purchases inside a third-party connector, and the
order form is the only place this shop writes an order.

What the live website serves, by itself, from the tables (busa-shop 0.8.0;
a shop installed earlier gets it with the new `vendor/worker.js`, Restart,
then Go live; no table changes):

| Address | What it is |
| --- | --- |
| `/mcp` | The MCP server: public, no sign-in, read-only (MCP Streamable HTTP, both the 2025-11-25 and the 2026-07-28 revisions, stateless). |
| `/agents.md` | How an AI agent uses this shop: the MCP address and tools, how buying works, shipping, policies. |
| `/.well-known/ucp` | The Universal Commerce Protocol profile: catalog search and lookup over `/mcp`. |
| `/feeds/google.xml` | Every listed product as a Google Merchant Center feed: price, stock, condition, brand, photos, shipping per country. |
| `/llms.txt` | Gains a "For AI assistants and agents" section linking the four above. |

The four tools (the Universal Commerce Protocol's names; its `meta` object is
optional, since Claude and ChatGPT never send it):

- `search_catalog`: free text, the buyer's country (for "ships there?" and
  the shipping cost of each product), a price limit in **minor units**
  (cents: 20000 = $200.00), categories, in stock only by default; up to 20
  results a page. A word in the store's name or tagline ("toys" for
  Tumbleberry Toys) does not narrow the search.
- `lookup_catalog`: up to 10 products by id.
- `get_product`: one product in full: description, highlights, specs,
  warranty and returns, valid certificates, shipping cost and delivery time
  per country, Settings › Shipping note, the policy pages.
- `create_checkout`: the buy link, `https://<address>/order?product=<id>&qty=<n>&country=<CC>`,
  with the items total, the shipping to that country and the total. It saves
  nothing. It says PayPal only when PayPal really works on that page
  (Settings, the Vault secret and Shipping all set), otherwise order requests.
  It passes on the sentences of Settings › **Shipping note** about import duty
  or taxes ("Import duty and taxes, if any, are paid by the buyer on
  delivery."); without one it says the total includes no duties or taxes.

They read only what the website shows: listed products (Status active,
priced, in the store currency: never a draft, an archived product or one with
no price), published pages, Shipping and Settings. They never read Orders,
the Vault or anyone's data. At most 120 MCP requests a minute from one
address (an answer `429` says when to retry). A change in the tables shows
within a minute, as on the website.

The buy link opens `/order` with exactly those products (it replaces what the
buyer's browser had in its order), the country chosen, the shipping and the
total shown, and the order form as usual. Any page or ad can use the same
link.

### Add the shop to Claude or ChatGPT (the owner does this)

The MCP address is the **live address** plus `/mcp`
(`https://<Live site address>/mcp`; `/api/status` shows it as
`agents.mcp`). It exists only after **Go live** (Plus and higher): the Free
plan's private browser preview has no address an assistant could reach.

**Claude** (custom connectors, official help:
support.claude.com/en/articles/11175166): on Free, Pro and Max go to
**Customize → Connectors**, click **+ Add**, then **Add custom connector**.
Give it a name (the shop's), paste the MCP address, **Continue**, choose
**No sign in**, then **Add**. In a chat, click **+** at the lower left →
**Connectors** and switch the shop on. Free plans allow one custom
connector. On Team and Enterprise an Owner adds it under **Organization
settings → Connectors → Add → Custom → Web**, and members click
**Connect**. Claude connects from Anthropic's servers, so the address must be
public: the live address is.

**ChatGPT** (official help: help.openai.com/en/articles/12584461): custom MCP
servers are documented for **Business, Enterprise and Edu** workspaces on
ChatGPT web; on Business only admins and owners add them. Go to **Plugins**,
the **+** button, **Add custom MCP server**, enter a name, paste the MCP
address under **Connection**, no authentication, tick **I understand and want
to continue**, **Create as a plugin**, install it, then type `@` in a new chat
and pick it. Whether Plus or Pro accounts can do this is not in OpenAI's
documentation: look for **Add custom MCP server** on the account before
promising it.

Say to the owner, plainly: Claude and ChatGPT are not offered in mainland
China or Hong Kong (each company's supported-regions page); a connector shows
the shop only to people who added it, not to every user of the assistant; and
the assistant may still word things its own way, so the shop's tables stay
the truth.

Test it without an assistant (official MCP Inspector):

```bash
npx @modelcontextprotocol/inspector --cli https://<address>/mcp --transport http --method tools/list
npx @modelcontextprotocol/inspector --cli https://<address>/mcp --transport http --method tools/call \
  --tool-name search_catalog --tool-arg 'catalog={"query":"robot","context":{"address_country":"US"}}'
```

Then a real prompt, for example in Claude: "Using the <shop> connector, find
me a <product> under $<price> that ships to <country>, and give me the buy
link." Open the link it gives in a private window and check the product, the
country, the shipping and the total.

### Google Merchant Center (optional, the owner does this)

Merchant Center can read `https://<address>/feeds/google.xml`: add a product
source from a file and have it fetched from that URL on a schedule. The feed
targets the countries checkout offers, one shipping line per country (cost
for one item, free past a zone's threshold, transit days when Delivery time
reads as days). Google wants real photos (JPEG, PNG or WebP; from 2027-01-31
at least 500 × 500 pixels): the demo's SVG drawings would be refused, and a
product without a photo has no `image_link`. A product without a barcode is
sent with `identifier_exists` no; put `Barcode: <EAN/UPC>` in Specs when it
has one. Whether Google accepts a mainland-China individual without a company
is not stated in its help: apply and see.

Not done (yet): IndexNow pings to Bing (it needs a key file and something
that pings on every change; the website has no trigger when a table changes),
an OpenAI product feed (OpenAI's feed program is waitlisted and US-only), and
in-chat checkout (ACP, Google's UCP checkout, PayPal's agent products: none
is open to a small seller outside the US).

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
- **Where today's findings go** (step 7): if a real (not sample) report dated
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

### 3. Check orders and payments

`orders-waiting`: every order still `new`, and every `confirmed` order older
than 7 days (waiting for payment). Each one is one line in Issues (order id,
customer, total, since when) and counts toward the issue count; their number
also goes into Orders waiting.

`orders-to-ship`: every `paid` order (Orders › To ship), one line each: order
id, customer, country, total, paid since when.

`payment-waiting`: every `awaiting-payment` order created more than 24 hours
ago, one line each (order id, total, since when). Nearly always a buyer who
left at PayPal's window; say so, and that nothing was charged.

`payment-problem`: every `payment-problem` order, and every `awaiting-payment`
order whose Payment problem is filled in (PayPal is holding the payment), one
line each with Payment problem as written. Say "do not ship before checking
PayPal".

`email-failed`: every order whose Email log has a `FAILED` or `no email sent`
line dated after the previous real report's Checked at (the last 7 days when
there is none), one line per order with that line as written.

### 4. Check shipping, policy pages and the checkout setup

Read Shipping, Pages and Settings, and the live site's `/api/status` when
Live site address is set (step 6 probes it). One line for each:

- `shipping-missing` if a Settings › Ships to country (every country, when it
  is empty) has no usable Shipping row: no row names it, or its row has
  another currency or no cost, or an earlier row already names it. One line
  naming those countries. Also when the shop has no Shipping table (installed
  before 0.6.0) and Settings › PayPal is not `off`.
- `policy-unfinished`, one line per published page that still contains a
  【fill in …】, with its title and the markers' text.
- `checkout-setup`, one line each, when `/api/status` says `payments` is
  `requests` while Settings › PayPal is `sandbox` or `live` (give its
  `paymentsNote` and what it means: "Set up PayPal", step 5), or `email` is
  not `ready` while Settings › SMTP host is set, or Settings › PayPal is not
  `off` and PayPal webhook ID is empty.
- `other`, one line per published post that `/api/status` lists under
  `postsNotShown` (its title and the reason: `no-title`, `no-body`,
  `bad-path`, `duplicate-path`).

### 5. Check for demo leftovers

Only when Settings › Live site address is set, so the shop is public. One
`demo-leftovers` line for each of these that is still true:

- Settings › Show the demo-store notice is ticked;
- Settings › Contact email is empty or a placeholder (ends in `.example`, or
  is at `example.com`, `example.net` or `example.org`);
- Settings › About the store still says the shop is fictional demo data;
- Orders still holds the sample orders (title ends "(fictional demo)", or
  Internal note starts "Fictional demo data");
- Shipping still has the template's demo rates (Notes start "Fictional demo
  rate");
- Posts still has a published sample post (Author ends "(sample)").

The course's own live demo shop will show these on purpose. A real shop
should not.

### 6. Check the live site

If Live site address is set: `node scripts/probe-site.mjs <address>` (from this
skill's files). It opens the site as a stranger: the home page (status, time),
`/api/status`, the sitemap, robots.txt, **every photo on every listed
product page**, and (0.8.0) the MCP server's tool list, `/agents.md`, the
Google feed and `/.well-known/ucp` (under `agents`). Report:

- `site-unreachable` if the home page does not answer 200;
- `site-mismatch` if `/api/status` is not `ready` or its product count differs
  from the number you found listed (the site may lag the tables by a minute;
  re-probe once before reporting);
- `image-unreachable`, one line per photo the probe lists under
  `images.failed` (product, URL, what came back).

When `agents.mcp.tools` is not the four tools, or `agents.feed.items`
differs from the listed products, say so in Live site check (the site may
still run an older `vendor/worker.js`: Restart, then Go live).

Put a short summary in Live site check. If the address is empty, write "not
checked: no live site address in Settings" and skip steps 5 and 6 (and the
`/api/status` half of step 4).

### 7. Write the report

Fill the report chosen by the rule in step 0:
`title` = `Daily shop check · YYYY-MM-DD`, `report-date` = today, `status` =
`open`, Sample report unticked, a `summary` of two to four plain sentences
(how many products are on the site, the most important problems, orders
to ship and waiting, payment problems), `issues` with one line per finding, like
`- [certificate-expiring] Wooden Train Set (tt-wooden-train): EN 71 expires on 2026-12-01, in 26 days.`,
`issue-types` = every type that appears in Issues, `issue-count` = the
number of lines in Issues (waiting orders included), `orders-waiting`,
`site-check`, `applied-feedback` (what step 1 did, or "none due"), and
`checked-at` = now. When updating a same-day report in place, replace the
findings and `checked-at`, and add to Applied feedback rather than replace it.

Then tell the owner the three things that matter most, and that they can
write feedback into Owner feedback on this report for the next run.

## Honest limits

- **One payment provider: PayPal.** (PayPal's own button may offer a buyer a
  card through PayPal.) No Stripe, no bank transfer at checkout: with PayPal
  off, checkout takes order requests and payment is arranged by email.
- **Payments need the Website engine (Plus and higher).** A purchase works
  in the members-only preview already; PayPal's webhooks (later refunds,
  reversals, disputes) only arrive after Go live. The Free plan's browser
  preview takes order requests only and sends no email (it tells the owner
  so on the checkout page).
- **Refunds are made in PayPal** by the owner; the website only records what
  PayPal reports. No partial-refund workflow beyond the Refunded amount.
- **No taxes or duties are calculated**, and shipping is one cost per country
  (with an optional free-shipping threshold): no weights, carriers, labels or
  tracking lookups. The owner types the tracking number.
- **Stock is not reserved or decremented** by an order, paid or not.
- **Abandoned checkouts stay** in Orders as `awaiting-payment`; the daily check
  lists those older than a day and the owner cancels them.
- **Order emails go out once and are not retried.** A failure is in the
  order's Email log and the daily check. SMTP suits these few emails per order,
  not newsletters or bulk mail.
- **No CAPTCHA.** The form has a hidden honeypot field and validates
  everything, but a determined spammer can still send order requests (and,
  with SMTP set up, make the shop send the "request received" email, which
  carries only the shop's own data, to the address they typed).
- **The policy pages are templates, not legal advice.** The owner fills in and
  answers for them.
- **No custom domain yet**: the address is the one Busabase gives the site.
- **The MCP server sells nothing by itself.** It finds products and makes a
  link; the buyer orders and pays on the website. An assistant shows the shop
  only to people who added it as a connector. Browser-based MCP clients that
  send extra headers may be stopped by the hosting's CORS preflight, which
  allows only `Content-Type`; Claude and ChatGPT connect from their servers
  and are not affected.
- **Going live needs Plus or higher on Busabase Cloud.** The Website engine is
  not in the Free plan. A Free space gets only the private preview in the
  owner's own browser tab: no address, no Go live, nobody else can see it,
  it runs only while the tab is open, and the daily check has no live site to
  probe. Its orders are real rows all the same.
- **The site's keys reach everything their owner can reach in this workspace**
  at write level, not only these tables, and the Space's Vault values marked
  Runtime (the website keeps only its two and drops the rest). The website's
  fixed routes are the only thing in between. There are two:
  `Site: Shop Website` belongs to whoever clicked Go live,
  `Site preview: Shop Website` to whoever ran the preview (opening the node
  runs it), and each stops working if that person leaves the workspace.
- **The preview runs on real data**: a test order in the preview is a real
  row, and with SMTP set up it sends real emails.
- **At most the first 100 products** of the Products table are shown, and the
  newest 100 rows of Posts (by Published at).
- **The blog is simple**: no comments, no categories or tags pages, one
  language per post (the shop's), no scheduled publishing (Published at is
  only the date shown), no pictures inside the body.
- **The site shows what the tables say**, up to a minute late (the Vault up
  to five minutes), and stays up with the last good data for up to ten
  minutes if Busabase cannot be reached; after that it shows "temporarily
  unavailable".
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
  site only: the home page (and whether it carries the Google Analytics and
  Search Console tags), `/api/status`, the sitemap (product and post
  addresses), robots.txt, `/llms.txt`, every product photo, and the agent
  addresses: the MCP tool list, `/agents.md`, the Google feed, `/.well-known/ucp`.

## Changing the website

Read `$busabase-app-creator` first. The source is `content/busa-shop-app/src/`
(`catalog.js` listing, the two table shapes and images, `orders.js` checkout
validation and the Orders fields written, `shipping.js` the rates rule,
`policies.js` the Pages table and the Markdown pages and posts share,
`agents.js` the MCP tools, `/agents.md`, `/.well-known/ucp` and the Google feed,
`mcp.js` the MCP endpoint (Streamable HTTP, both protocol revisions),
`posts.js` which Posts rows are on the site, their addresses and redirects, `paypal.js` PayPal's REST API
and what each webhook event does, `vault.js` the two Vault values, `smtp.js`
the SMTP client, `mail.js` the emails, `seo.js`, `pages.js`, `details.js`
which product details a page shows and how Specs is read, `resources.js`
table lookup, `shop.js` the only code that calls Busabase besides the Vault
read, `handler.js` routes). Then, in
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
