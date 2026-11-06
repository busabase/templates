# Busa Shop schema

The five Bases this template installs (`content/<base>/base.json` is the
source; installed slugs are `busa-shop-<folder name>`), the website's routes,
what the importer writes, and what the website reads when Settings point it
at a busa-product-hub table instead (or the shop is older than 0.5.0).

## Products (`busa-shop-products`)

Plain columns an owner edits in the grid. The website reads the first 100 rows
by `ref` (Position), never writes them.

| Slug | Type | Read by the website | Notes |
| --- | --- | --- | --- |
| `name` | text, required | yes | |
| `product-id` | text, required | yes | Page address `/products/<product-id>`: `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`. Import key |
| `status` | select | yes | `active` (On sale, listed), `draft`, `archive` (Off sale) |
| `price` | number | yes | Above 0 to be listed |
| `currency` | text | yes | ISO 4217; empty = Settings › Currency; another currency is not listed |
| `stock` | number | yes | Empty = unknown; 0 or less = Out of stock; caps the order quantity |
| `category` | text | yes | Search data only (schema.org `category`), not shown as text |
| `brand`, `model` | text | yes | First two Details lines; `brand` is also schema.org `brand` |
| `subtitle` | text | yes | Under the name on the card and the product page |
| `image` | text | yes | Main photo URL (see SKILL.md "Product images") |
| `gallery` | longtext | yes | More photo URLs, one per line (a JSON array is read too) |
| `description` | longtext | yes | Paragraphs separated by a blank line |
| `highlights` | longtext | yes | One per line, shown as a list (at most 8) |
| `specs` | longtext | yes | One `Label: value` per line; known labels become Details keys (`src/details.js`, `parseSpecs`), others are shown as written, after them |
| `warranty`, `returns` | text | yes | Last two Details lines |
| `sku` | text | yes | "Item no.", and written into orders |
| `tags` | text | yes | Comma-separated; only for Settings › `listed-tag` |
| `ref` | number | sort only | "Position on the site": ascending, empty last |
| `cost` | number | **never** | Unit cost (or landed cost) |
| `source` | text | **never** | Where the facts came from |
| `notes` | longtext | **never** | `Label: value` lines: supplier, MOQ, lead time, HS code, carton qty, country of origin, EAN, and any column of an imported sheet that is not for shoppers |

## Certificates (`busa-shop-certificates`)

The same fields as busa-product-hub's Certificates, so one importer writes
both: `product` (relation to this folder's Products, one), `cert-type`
(select: CE, FCC, RoHS, UN38.3, UKCA, EN 71, ASTM F963, CPSIA / CPC, Other),
`issuer`, `cert-number`, `issued-date`, `expiry-date` (text, YYYY-MM-DD),
`file` (attachment, one), `source-note`. The website reads the first 100 rows:
`product`, `cert-type` (`Other` is not shown), `expiry-date` (only unexpired
ones are shown; never the number).

## Orders (`busa-shop-orders`)

| Slug | Type | Written by | Notes |
| --- | --- | --- | --- |
| `title` | text | website | Row name: `ORD-7K2M9QX4PT · Mia Jensen` |
| `order-id` | text, required | website | Made by the buyer's browser: `ORD-` + 10 Crockford base32 characters. Also the create's idempotency key |
| `status` | select, required | website (`new` only), then staff | `new`, `confirmed`, `paid`, `shipped`, `cancelled` |
| `customer-name` | text | website | 1–100 characters, one line |
| `email` | email | website | Up to 200 characters, Busabase's own email pattern |
| `phone` | phone | website | Optional; left out when empty |
| `country` | text | website | `Denmark (DK)`; only Settings › Ships to codes are accepted |
| `items-summary` | longtext | website | `2 × Walking Robot Buddy (TT-ROB-01) @ 24.00 USD = 48.00 USD`, one line per item |
| `items` | longtext | website | JSON `[{product_id, sku, name, quantity, unit_price, line_total}]` |
| `total` | number | website | Computed by the website from the catalog it showed, in cents, never from the browser |
| `currency` | text | website | Settings › Currency at order time |
| `customer-note` | longtext | website | Optional, up to 1000 characters |
| `internal-note` | longtext | staff only | Dated lines. The website never reads or writes it |
| `reply-draft` | longtext | staff only | The agent's draft reply for the owner to send |
| `created-at` | date (with time) | website | ISO timestamp |
| `source` | text | website | `website` (staff may enter `email`, `phone`, … for orders taken elsewhere) |

The website creates a row through `bases.createChangeRequest` with
`submittedBy: "busa-shop"` and `idempotencyKey: <order-id>`, and never sends
`autoMerge`. With the owner's write access it is saved at once; otherwise it
waits as a ChangeRequest and the buyer is still thanked.

## Settings (`busa-shop-settings`), one row

| Slug | Type | Notes |
| --- | --- | --- |
| `store-name` | text, required | |
| `tagline` | text | |
| `currency` | text, required | ISO 4217, e.g. `USD` |
| `contact-email` | email | |
| `language` | select | `en`, `de`, `fr`, `es` |
| `ships-to` | text | ISO 3166-1 alpha-2 codes, comma or space separated; empty = all |
| `about` | longtext | Paragraphs separated by a blank line |
| `shipping-note` | longtext | Shown under the order form |
| `demo-notice` | checkbox | The "fictional demo store" bar |
| `listed-tag` | text | Optional tag filter |
| `products-base` | text | Optional: another Products table to sell from (id or slug), e.g. `busa-product-hub-products`. Empty = this folder's Products |
| `site-url` | url | Live address, for the daily check |
| `required-certificates` | text | Daily check: certificate types, `EN 71, ASTM F963, CPSIA / CPC` |
| `expiry-warning-days` | number | Daily check: default 90 |
| `check-rules` | longtext | Daily check: standing rules from feedback |
| `show-details` | text | Optional (0.4.0+), for a product hub table only: extra `content.attributes` keys for the product page, comma-separated (`防水等级, gtin`); `moq`, `lead_time_days`, `hs_code`, `carton_qty`, `country_of_origin` are never shown. Missing on older installs = none |

## Reports (`busa-shop-reports`)

| Slug | Type | Notes |
| --- | --- | --- |
| `title` | text | `Daily shop check · 2026-11-05` |
| `report-date` | date, required | Normally one real report per date (see SKILL.md, step 0); newest = latest date, then latest `checked-at` |
| `status` | select, required | `open`, `acknowledged`: set by the check that applied this report's feedback; an acknowledged report is never applied or written again |
| `summary` | longtext | Two to four plain sentences |
| `issue-types` | multiselect | `missing-price`, `hidden-product`, `missing-image`, `out-of-stock`, `certificate-missing`, `certificate-expired`, `certificate-expiring`, `orders-waiting`, `demo-leftovers`, `site-unreachable`, `site-mismatch`, `image-unreachable`, `other`: every type used in Issues |
| `issue-count` | number | Lines in Issues, waiting orders included |
| `issues` | longtext | One line per finding: `- [type] Product (id): what, and the date`; one per product for `certificate-missing`, naming every missing type |
| `orders-waiting` | number | |
| `site-check` | longtext | Summary of `scripts/probe-site.mjs`, or why it was not run |
| `owner-feedback` | longtext | Written by the owner |
| `applied-feedback` | longtext | What this run did with the previous report's feedback |
| `checked-at` | date (with time) | |
| `sample` | checkbox | Ticked only on the template's sample report; never updated in place, its feedback applied like any other |

## Website routes (`content/busa-shop-app/src/handler.js`)

| Route | Does |
| --- | --- |
| `GET /` | Home: store name, tagline, product grid, how ordering works, about |
| `GET /products/<product-id>` | A listed product; anything else is a 404 |
| `GET /order` | Order request form; `?add=<product-id>&qty=<n>` pre-fills one line |
| `POST /api/orders` | JSON (from the page script) or a plain form post; creates one Orders row |
| `GET /api/status` | `{ ok, setup, products, ordering, productsFrom }`; `productsFrom` (when ready) is `shop` or `product-hub`, the shape of the table it sells from |
| `GET /images/<product-id>/<n>` | Image `n` of a listed product, fetched with the key |
| `GET /sitemap.xml`, `GET /robots.txt` | Home and every listed product; `/api/` and `/order` disallowed |
| `/static/*`, `/favicon.svg` | Files in `public/` |

`POST /api/orders` answers `200 {ok, orderId}`, `400 {errors, itemErrors}`
(field → code: `required`, `invalid`, `too_long`, `invalid_email`,
`invalid_phone`, `invalid_country`, `items_empty`, `too_many_items`,
`not_available`, `sold_out`, `too_many`), `409` when the total the buyer saw
is no longer the total (with current prices), `403` for a cross-site post,
`413` over 16 KB, `415` for other content types, `503` when the shop is not
set up or the order could not be saved (nothing was saved; the buyer keeps the
same order id for the retry).

## Written by `scripts/import-products.mjs`

Run by an agent or a person, never by the website. It writes the table the
website sells from (SKILL.md, "How the website finds its tables"), or the one
`--products-base` names. Products are matched by `product-id`; certificates
by product + `cert-type` + `cert-number`. An empty cell in the list leaves
the stored value alone.

| Base | Fields it may write |
| --- | --- |
| Products (the shop's) | `product-id`, `name`, `sku`, `subtitle`, `category`, `status` (from the sheet's Status and Lifecycle: on sale → `active`, draft/test → `draft`, 下架/archive → `archive`), `price`, `currency`, `stock`, `cost` (cost, or landed cost when there is none), `brand`, `model`, `warranty`, `returns`, `description`, `highlights`, `tags`, `specs` and `notes` (lines merged by label: a line about the same thing gets the new value under the label already there, new lines are appended, none is removed), `source`, `image` + `gallery` (the uploaded pictures: main, then the rest one per line); `ref` on create |
| Certificates | `product`, `cert-type`, `cert-number`, `issuer`, `issued-date`, `expiry-date`, `source-note` (`<file> › <sheet> row <n>`, plus the row's Source/备注) |

A column it writes but the table no longer has (the owner deleted it) is left
out, and the summary says so. A picture is not uploaded again when the
product already shows one with the same bytes (it reads the stored URLs back).
Into a busa-product-hub table it writes that template's shape instead
(busa-product-hub's `references/product-hub-schema.md`, "Written by
`scripts/import-products.mjs`").

## Read from a busa-product-hub table (never written by the website)

When Settings › Products table names one, or the shop was installed before
0.5.0 and has no Products of its own:

| Base | Read | Fields used |
| --- | --- | --- |
| Products | first 100 by `ref` | `product-id`, `name`, `subtitle`, `sku`, `category`, `lifecycle`, `status`, `tags` (JSON), `image`, `gallery` (JSON), `price` and `currency` (busa-product-hub 0.4.0+; while a column is empty, `pricing.current_price` / `pricing.currency`), `inventory` (`available`), `content` (`description`, `bullets`, `attributes`: the shopper keys in `src/details.js` plus Settings › `show-details`; see SKILL.md "Product details on the page"), `updated-at` |
| Certificates | first 100 | `product`, `cert-type` (shown as is; `Other` is not shown), `expiry-date` |
| Product Hub AirApp | one file per image request | only for image paths under `assets/` |
