# Busa Shop schema

The three Bases this template installs (`content/<base>/base.json` is the
source; installed slugs are `busa-shop-<folder name>`), the website's routes,
and what the website reads from busa-product-hub.

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
| `products-base` | text | Optional: Products table id or slug |
| `site-url` | url | Live address, for the daily check |
| `required-certificates` | text | Daily check: certificate types, `EN 71, ASTM F963, CPSIA / CPC` |
| `expiry-warning-days` | number | Daily check: default 90 |
| `check-rules` | longtext | Daily check: standing rules from feedback |

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
| `GET /api/status` | `{ ok, setup, products, ordering }` |
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

## Read from busa-product-hub (never written)

| Base | Read | Fields used |
| --- | --- | --- |
| Products | first 100 by `ref` | `product-id`, `name`, `subtitle`, `sku`, `category`, `lifecycle`, `status`, `tags`, `image`, `gallery`, `price` and `currency` (busa-product-hub 0.4.0+; while a column is empty, `pricing.current_price` / `pricing.currency`), `inventory` (`available`), `content` (`description`, `bullets`, `attributes`), `updated-at` |
| Certificates | first 100 | `product`, `cert-type` (shown as is; `Other` is not shown), `expiry-date` |
| Product Hub AirApp | one file per image request | only for image paths under `assets/` |

## Written to busa-product-hub by `scripts/import-catalog.mjs`

Run by an agent or a person, never by the website. Products are matched by
`product-id`; certificates by product + `cert-type` + `cert-number`.

| Base | Fields it may write |
| --- | --- |
| Products | `product-id`, `sku`, `name`, `subtitle`, `category`, `lifecycle`, `status`, `vendor`, `image`, `gallery`, `tags`, `price`, `currency`; inside the JSON blocks only the keys the list fills (`pricing`: `target_price`, `landed_cost`, `gross_margin_pct`; `inventory`: `available`; `content`: `description`, `bullets`, `attributes.*`, `images_ready`, `image_files`); `ref`, `created-at` on create; `updated-at` when something changed |
| Certificates | `product`, `cert-type`, `cert-number`, `issuer`, `issued-date`, `expiry-date`, `source-note` |

Other keys in the JSON blocks, other fields (`owner`, `compliance`, the
certificate `file`, …) and every value the list leaves empty are kept as
stored. The price is the exception that moves: on a Products table with the
Price column, `current_price`, `price` and `currency` are taken out of
`pricing` (a value still there and not in the list moves into the empty
column), so a product has one price. On a table from before busa-product-hub
0.4.0, which has no Price column, the importer writes `pricing.currency` and
`pricing.current_price` instead, exactly as earlier versions did, and its
summary notes it. `gross_margin_pct` is recomputed from the price and
`landed_cost` whenever both are known. `content.image_files` remembers each uploaded photo's file name,
SHA-256 and URL, which is how a second run knows not to upload it again.
