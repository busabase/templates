---
name: busa-shop
description: Storefront website (Busabase Website engine) for a small cross-border seller, built on the busa-product-hub product list. It shows active products with price, photos and valid safety certificates, takes order requests into an Orders table (no payment), reads its store name, currency and contact from a Settings table, and comes with a daily shop check that writes a Reports row and improves from the owner's feedback. Use when the user invokes $busa-shop or /busa-shop, or asks to open an online shop / 独立站 / storefront for their products, import a product list or toy list (CSV, photos, certificates) into the product hub, put a product list on a public website, handle new website orders or order requests, check the shop, run the daily shop check, find missing photos, prices or expiring certificates (EN 71, ASTM F963, CPC, CE, UKCA) before a buyer sees them, or apply feedback on the last shop report.
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
      - orders
      - settings
      - reports
    risk: local-write
---

# Busa Shop

A real website for a small seller: strangers open it, look at the products and
send an order request. Behind it there is no second product list. **The shop
sells from one product table: the Products table of the `busa-product-hub`
template.** Change a product there and the website shows the change within a
minute. This folder adds only what a shop needs on top: the website, Orders,
Settings and Reports.

Ordering is an order *request*. The website takes no payment: it tells the
buyer "we will contact you to confirm and arrange payment", and a person does
that by email.

## Mandatory dependencies

1. `$busabase` for connecting, finding nodes, reading and writing records.
2. The `busa-product-hub` skill (installed with that template) for anything
   that changes products, stock or certificates. The one exception is
   importing a product list: this skill's `scripts/import-catalog.mjs` writes
   Products and Certificates into the product hub (see "Open the shop").
3. `$busabase-app-creator` before changing the website's code.

If `busa-product-hub` is not installed in this workspace, stop and tell the
user to install it first (Template Center → Busa Product Hub). A template
cannot declare that it needs another one, so nothing installs it for them.

## Boundary: what you never do

- Never email or message a customer. You write a reply draft; the owner sends it.
- Never set an order to `paid` or `shipped` unless the owner tells you it
  happened. Never take, request or record card details.
- Never copy products, prices or photos into this folder. Product data lives
  in busa-product-hub only.
- Never fix product data during the daily check. Report it; the owner (or the
  product hub procedure, when they ask) fixes it.
- Never click Run or Go live, never change `site.access` in
  `content/busa-shop-app/airapp.json`, and never copy the site's key anywhere.
  Going live is the owner's decision and their consent.
- Never overwrite a person's text in Owner feedback, Internal note or Reply
  draft. Add dated lines; do not rewrite history.

## What is in this folder

| Node | What it is |
| --- | --- |
| **Shop Website** (`busa-shop-app`, AirApp, Website engine) | The public site. `vendor/worker.js` is what deploys (the bundle of `src/` with busabase-sdk inside); `src/` is its source. `airapp.json` asks for `write` access because the order form creates records. |
| **Orders** | One row per order request. The website creates it with status `new` and never touches it again. |
| **Settings** | One row: what the website shows and what the daily check uses. |
| **Reports** | One row per daily shop check, with the owner's feedback. |
| **busa-shop** (this skill) | The manual. `scripts/` holds two helpers (below). |

Field-by-field reference: [`references/shop-schema.md`](references/shop-schema.md).

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
| Currency | website | Three letters (`USD`). A product is listed only if its `pricing.currency` is the same |
| Contact email | website | Shown in the footer and in error messages. Use a real inbox before going live |
| Language | website | `en`, `de`, `fr` or `es`: the website's own words. Product texts stay as written |
| Ships to | website | Country codes, comma-separated. The order form offers only these. Empty = every country |
| Show the demo-store notice | website | The yellow "fictional demo store" bar. Turn it off for a real shop |
| Only list products with this tag | website | Optional: list only products whose `tags` contain this word |
| Products table | website | Optional: the id or slug of the Products table to sell from (see "How the website finds its tables") |
| Live site address | daily check | The public address shown after Go live |
| Required certificates | daily check | Comma-separated certificate types, e.g. `EN 71, ASTM F963, CPSIA / CPC` |
| Certificate expiry warning (days) | daily check | Warn this many days before a certificate expires |
| Standing check rules | daily check | Rules added from the owner's feedback, one per line, newest last |

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

## What the website reads from busa-product-hub

Products (`busa-product-hub-products`), first 100 rows by `ref`:

- `product-id` (the page address `/products/<product-id>`; letters, digits, `.`, `_`, `-`), `name`, `subtitle`, `sku`, `category`, `lifecycle`, `status`, `tags`
- `pricing` JSON: `current_price`, `currency`
- `inventory` JSON: `available` (0 or less = out of stock; missing = not known)
- `content` JSON: `description` (paragraphs), `bullets` (list), `attributes`
  (`age_grade`, `materials`, `batteries`, `dimensions`, `weight`, `warranty`,
  `returns` are shown; `moq`, `lead_time_days`, `hs_code`, `carton_qty`,
  `country_of_origin` stay off the public page)
- `image`, `gallery` (see "Product images")

Certificates (`busa-product-hub-certificates`): `product`, `cert-type`,
`expiry-date`. A product page lists only certificates that have **not
expired**, as their type + "valid until", never the certificate number. The
types are the product hub's options (0.3.0 and later): CE, FCC, RoHS, UN38.3,
UKCA, and for toys **EN 71** (EU), **ASTM F963** (US) and **CPSIA / CPC** (US
Children's Product Certificate). A certificate of type `Other` is not shown,
because it names nothing a buyer can check: record it under its real type.

## The listing rule

A product is on the website only when **all** of these hold
(`content/busa-shop-app/src/catalog.js`, `listingFor`):

1. `lifecycle` is `active` or `launch` (not `test`, not `archive`, not empty);
2. `status` is `active`, `approved` or `live` (not `draft`, `needs_review`, `blocked`, …);
3. it has a `name` and a URL-safe `product-id`, not used by an earlier row;
4. `pricing.current_price` is a number above 0;
5. `pricing.currency` equals Settings › Currency;
6. Settings › "Only list products with this tag" is empty, or the product has that tag.

Stock never hides a product: `inventory.available` of 0 or less shows "Out of
stock", and it cannot be ordered. When stock is known the order form caps the
quantity at it (and at 99).

## Product images

`image` and `gallery` in the product hub are plain text, so the website
decides per value (`classifyImageRef` in `src/catalog.js`):

- **An `https://` URL on another host** (an uploaded file's public address, a
  CDN): the buyer's browser loads it directly. It must open in a private
  browser window without signing in; the daily check tests one.
- **A URL on the Busabase server itself, or a path inside the Product Hub
  AirApp** (`./assets/product-images/aurora-lamp.png`, the hub's own sample
  data): a stranger cannot load it, so the website serves it at
  `/images/<product-id>/<n>`, fetching it with its key. That route answers only
  for image *n* of a **listed** product; any other id, a hidden product or an
  index out of range is a 404, and the key is only ever sent to the Busabase
  server, never to another host.
- Anything else (`http://` elsewhere, `data:`, paths outside `assets/`) is
  ignored. A listed product without a usable image shows "Photo coming soon".

## How the website finds its tables

A published template carries no workspace ids, so the website looks its tables
up when it starts, using the stamp the installer puts on every node
(`appId` = template name, `resourceKey` = the table's folder name):

1. this shop's Settings and Orders: stamped `busa-shop` / `settings`, `orders`
   (fallback: slugs `busa-shop-settings`, `busa-shop-orders`);
2. the Products table: Settings › Products table if filled (a Base id, node id
   or slug), otherwise the Base stamped `busa-product-hub` / `products`
   (fallback slug `busa-product-hub-products`);
3. Certificates and the Product Hub AirApp: the stamped ones in the same
   folder as that Products table.

If something is missing or there are two candidates, the website does not
guess: it shows an owner-facing "This shop is not open yet" page naming the
problem (`products-missing`, `products-ambiguous`,
`products-override-not-found`, `settings-missing`, `settings-ambiguous`,
`settings-empty`, `currency-missing`) and `/api/status` reports the same code.
Fix the table and the page clears within a minute.

## Open the shop

1. **Install busa-product-hub, then busa-shop.** Both from the Template Center,
   in the same workspace.
2. **Retire the product hub's three sample products** (Aurora Desk Lamp, Bento
   Lunchbox, Expandable Spice Rack): following the busa-product-hub skill, set
   their `lifecycle` to `archive`. Otherwise a lamp appears in the toy shop.
3. **Import the product list** with this skill's `scripts/import-catalog.mjs`,
   one command. Put it in a directory with the product list CSV, the
   certificates CSV and the photos (`images/`), then:

   ```bash
   npm i busabase-sdk
   BUSABASE_BASE_URL=… BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… \
     node import-catalog.mjs toy-catalog.csv --certificates toy-certificates.csv --images images/
   ```

   Run it with `--dry-run` first and show the owner the summary. It finds the
   product hub's tables itself, uploads the photos, upserts every product by
   `product-id`, links the certificates in the same run, and prints what it
   created, updated, left unchanged and skipped, with reasons. Running it
   again changes nothing; after editing the CSV it changes only what
   changed. An empty cell never clears a stored value, and nothing is
   invented: a product without a price is imported without one (the shop then
   hides it). The course's toy list is the fictional factory in this
   template's `assets/demo/`
   (https://github.com/busabase/templates/tree/main/templates/busa-shop/assets/demo);
   the student hands those files to you. Columns: `product_id`, `name`,
   `price`, `currency` (required), then `sku`, `subtitle`, `category`,
   `lifecycle`, `status`, `landed_cost`, `stock_available`, `age_grade`,
   `materials`, `batteries`, `dimensions`, `weight`, `carton_qty`, `moq`,
   `lead_time_days`, `hs_code`, `country_of_origin`, `warranty`, `returns`,
   `image_file` and `gallery_files` (file names in `images/` or https URLs,
   `|`-separated), `tags`, `description`, `bullets` (`|`-separated), `vendor`.
   Certificates: `product_id`, `cert_type` (a type the product hub offers),
   `cert_number`, `issuer`, `issued_date`, `expiry_date` (YYYY-MM-DD).
   Afterwards read the Products table back and confirm the count and a few prices.
4. **Check Settings** with the owner: store name, tagline, currency equal to
   the products' currency, a real contact email, language, ships-to
   countries, about text, shipping note, demo notice (off for a real shop).
5. **The owner clicks Run** on Shop Website. That deploys a members-only
   preview in the App tab, on real data. Open it and check: the home page
   lists what the listing rule says it should, a product page, `/api/status`
   (`"setup": "ready"`), `/sitemap.xml`. A test order lands in the real
   Orders table: place one only if the owner agrees, then delete it.
6. **Before Go live, tell the owner, in these words or similar:** "Go live
   publishes the site at the address in the node's settings. It asks for
   **write** access, because the order form must save orders. Going live
   creates an API key in your name, listed as `Site: Shop Website`; it can do
   whatever you can do in this workspace, not only these tables, and the
   website's code is the only thing between a stranger and that. Turning
   Public off, or moving the app to Trash, cuts it off." The owner clicks Go
   live; you do not.
7. **Write the live address into Settings › Live site address**, so the daily
   check can test it.
8. **After any change to the website's code**, the live address keeps serving
   the old version until the owner clicks Run and Go live again. Changes to
   Settings and to products need no redeploy.

## Handle a new order

For each order with status `new`, oldest first:

1. Read its items and check each against the product hub now: still listed,
   in stock (`inventory.available` ≥ quantity), price unchanged. The shop has
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
lower the stock in the product hub (orders do not change stock).

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
check rules, Live site address) and every report whose feedback is due (rule
above), oldest first. Before checking anything, apply each one:

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

Read the Products (first 100 by `ref`) and Certificates tables of the product
hub and apply the listing rule. Every finding is one line in Issues, tagged
with its type:

| Type | Report it when | Lines |
| --- | --- | --- |
| `missing-price` | lifecycle and status would list it, but `pricing.current_price` is missing or not above 0 | one per product |
| `hidden-product` | lifecycle is `active`/`launch` but it is hidden for another reason (status, currency, tag, id). Products in `test`/`archive` are hidden on purpose: do not report them | one per product |
| `missing-image` | listed, but no image the website can show | one per product |
| `out-of-stock` | listed, and `inventory.available` is 0 or less. Report it only when a Standing check rule asks for it (the sample feedback does) | one per product |
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
- **The site's key reaches everything its owner can reach in this workspace**
  at write level, not only these tables. The website's fixed routes are the
  only thing in between. The key belongs to whoever clicked Go live and stops
  working if they leave the workspace.
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

## Helpers in `scripts/`

- `import-catalog.mjs`: imports a product list CSV, its photos and a
  certificates CSV into the installed busa-product-hub. Needs only Node and
  `busabase-sdk`; copy it into an empty directory and run it. `--dry-run`
  writes and uploads nothing.
- `probe-site.mjs`: the live-site half of the daily check. Reads the public
  site only.

## Changing the website

Read `$busabase-app-creator` first. The source is `content/busa-shop-app/src/`
(`catalog.js` listing and images, `orders.js` validation and the Orders fields
written, `seo.js`, `pages.js`, `resources.js` table lookup, `shop.js` the only
code that calls Busabase, `handler.js` routes). Then, in that folder:

```bash
npm install
npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js
npm test && npm run check
```

Keep routes fixed: never pass a visitor's path, id, filter or body through to
the API. Then the owner clicks Run and Go live again.
