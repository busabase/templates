# Busa Shop schema

The Bases this template installs (`content/<base>/base.json` is the
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
| `main-photo` | attachment (1 image) | yes | Main photo: the file's `url` (see SKILL.md "Product images"). Since 0.9.0 |
| `more-photos` | attachment (up to 11 images) | yes | More photos, after the main one; the page shows 8 in all. Since 0.9.0 |
| `image`, `gallery` | text, longtext | while both photo cells are empty | Only in a shop installed before 0.9.0: the main photo's link, more links one per line. Deleted once the photos are moved ("A shop installed before 0.9.0") |
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
| `order-id` | text, required | website | Made by the buyer's browser: `ORD-` + 10 Crockford base32 characters. The create's idempotency key, the PayPal order's `custom_id` / `invoice_id`, and the pay page `/pay/<order-id>` |
| `status` | select, required | website, then staff | `new`, `awaiting-payment`, `confirmed`, `paid`, `shipped`, `completed`, `cancelled`, `refunded`, `payment-problem`. The website sets `new` / `awaiting-payment` at checkout, then only `paid`, `payment-problem`, `refunded`, and only from PayPal |
| `payment-method` | select | website | `paypal` or `request` |
| `total` | number | website | Items total + shipping, computed by the website from the catalog and Shipping, in cents, never from the browser |
| `currency` | text | website | Settings › Currency at order time |
| `customer-name` | text | website | 1–100 characters, one line |
| `email` | email | website | Up to 200 characters, Busabase's own email pattern |
| `phone` | phone | website | Required at checkout (the carrier needs it) |
| `country` | text | website | `Denmark (DK)`; only countries in Settings › Ships to with a Shipping row |
| `shipping-address` | longtext | website | The whole address as one block, for the parcel |
| `items-summary` | longtext | website | `2 × Walking Robot Buddy (TT-ROB-01) @ 24.00 USD = 48.00 USD`, one line per item |
| `subtotal` | number | website | Items total |
| `shipping` | number | website | From the Shipping table; left out for a shop without one |
| `delivery-estimate` | text | website | The Shipping row's Delivery time |
| `tracking-number` | text | staff only | The website never reads or writes it |
| `paid-at` | date (with time) | website | PayPal's capture time |
| `amount-paid` | number | website | What PayPal captured |
| `paypal-order-id` | text | website | The PayPal order made for this order |
| `paypal-capture-id` | text | website | PayPal's transaction id; how a refund finds the order |
| `payer-email` | text | website | The PayPal account that paid |
| `refunded-amount` | number | website | Sum of PayPal refunds |
| `payment-problem` | longtext | website | One sentence: what PayPal reported that needs the owner |
| `payment-log` | longtext | website | One dated line per thing PayPal said, with the webhook event id (so an event is applied once) |
| `email-log` | longtext | website | One dated line per email: `sent …`, `FAILED … : <server answer>`, `no email sent: …` |
| `customer-note` | longtext | website | Optional, up to 1000 characters |
| `internal-note` | longtext | staff only | Dated lines. The website never reads or writes it |
| `reply-draft` | longtext | staff only | The agent's draft reply for the owner to send |
| `address-line1`, `address-line2`, `city`, `region`, `postal-code` | text | website | The address in parts. Region is required for AR, AU, BR, CA, CN, IN, JP, MX, US; postal code everywhere but a short list (HK, AE, IE…) |
| `items` | longtext | website | JSON `[{product_id, sku, name, quantity, unit_price, line_total}]` |
| `created-at` | date (with time) | website | ISO timestamp |
| `source` | text | website | `website` (staff may enter `email`, `phone`, … for orders taken elsewhere) |

The website creates a row through `bases.createChangeRequest` with
`submittedBy: "busa-shop"` and `idempotencyKey: <order-id>`, and changes it
through `records.changeRequest` with `author: "busa-shop"` and the
`baseCommitId` it just read (a concurrent change is re-read, never
overwritten); it never sends `autoMerge`. Views: To ship, New order requests,
Awaiting payment, Payment problems, Confirmed waiting for payment, All orders.

## Shipping (`busa-shop-shipping`)

| Slug | Type | Notes |
| --- | --- | --- |
| `name` | text, required | Zone, the owner's name for it |
| `countries` | text, required | ISO codes, separated by commas, spaces or `；、` |
| `rate` | number, required | Shipping cost in the shop's currency; 0 = free |
| `currency` | text | Empty = the shop's; another currency makes the row unusable |
| `free-over` | number | Free shipping when the items total reaches it |
| `delivery-estimate` | text | Shown at checkout as written |
| `position` | number | The first row (by position) naming a country wins |
| `notes` | longtext | Owner only |

## Pages (`busa-shop-pages`)

| Slug | Type | Notes |
| --- | --- | --- |
| `title` | text, required | The page's `<h1>` and footer link |
| `slug` | text, required | `/pages/<slug>`: lowercase letters, digits, `-` |
| `status` | select, required | `published` or `draft` (a draft is a 404) |
| `in-footer` | checkbox | Linked in every page's footer |
| `position` | number | Footer order |
| `body` | longtext | Simple Markdown; `{{store_name}}`, `{{contact_email}}`; 【fill in …】 markers |

## Posts (`busa-shop-posts`)

busabase-cms-sdk's standard Posts fields (as in busa-cms) without `categories`
and `tags`; the SDK reads the table with `baseSlugs: { posts: "busa-shop-posts" }`.
The website reads the newest 100 rows by `published-at` and shows only
`published` ones (`src/posts.js`).

| Slug | Type | Notes |
| --- | --- | --- |
| `path` | text, required | The address: `/blog/<slug>` (lowercase letters, digits, `-`, at most 100); anything else is served at `/blog/<slug field>` |
| `title` | text, required | The post's `<h1>` |
| `slug` | text, required | The Path's last part |
| `locale` | select, required | `en`, `zh-CN`, `zh-TW`, `ja`, `pt` (the SDK's choices); the page's `lang` |
| `status` | select, required | `draft`, `in-review`, `published`, `archived`; only `published` is on the site |
| `description` | longtext | Excerpt: on `/blog`, in the feed and `/llms.txt`; the description when SEO description is empty |
| `body` | markdown, required | The policy pages' Markdown plus `#` read as `##`; `/products/<id>` links add product cards under the post |
| `cover-image` | attachment (1 image) | The post's picture (a Busabase asset is served at `/blog-covers/<slug>`); empty = the first linked product's photo |
| `attachments` | attachment | Not shown by the website |
| `author` | text | Shown under the title; the store name (or empty) makes the publisher the author in JSON-LD |
| `published-at` | date | Date shown and order on `/blog`; does not schedule |
| `canonical-url` | url | Only when the post was first published elsewhere: then the canonical link points there and the post stays out of the sitemap, feed and `/llms.txt` |
| `legacy-paths` | json | `["/old/address"]`: each redirects (301) to the post; never one of the site's own routes |
| `seo-title` | text | `<title>`; empty = "Title · store name" |
| `seo-description` | longtext | `<meta name="description">` |
| `schema-version` | number, required | `1` |
| `updated-at` | updated time | `dateModified`, sitemap `lastmod` |

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
| `paypal-mode` | select | `off`, `sandbox`, `live` |
| `paypal-client-id` | text | The PayPal REST app's client ID (public) |
| `paypal-webhook-id` | text | The webhook registered for `<live address>/api/paypal/webhook` |
| `smtp-host` | text | Empty = no email |
| `smtp-port` | number | `465` (default, with `tls`) or `587` (with `starttls`); 25 is refused |
| `smtp-security` | select | `tls`, `starttls`, `none` (local test catcher only; sends no password) |
| `smtp-username` | text | Usually the full mailbox address |
| `email-from` | email | From address; empty = the SMTP username |
| `notify-email` | email | Owner notifications; empty = Contact email |
| `ga4-id` | text | Optional (0.7.0+): GA4 measurement ID `G-…` (a pasted gtag snippet works); loads gtag.js on the public site only, never in a preview |
| `google-site-verification` | text | Optional (0.7.0+): Search Console HTML-tag `content` (the whole tag works) |
| `bing-site-verification` | text | Optional (0.7.0+): Bing `msvalidate.01` `content` |

Secrets are never in Settings: the Space Vault holds `BUSA_SHOP_PAYPAL_CLIENT_SECRET`
and `BUSA_SHOP_SMTP_PASSWORD` (Secrets, marked Runtime), read by the website at
runtime through `GET /api/v1/vault/runtime` with its own key.

## Reports (`busa-shop-reports`)

| Slug | Type | Notes |
| --- | --- | --- |
| `title` | text | `Daily shop check · 2026-11-05` |
| `report-date` | date, required | Normally one real report per date (see SKILL.md, step 0); newest = latest date, then latest `checked-at` |
| `status` | select, required | `open`, `acknowledged`: set by the check that applied this report's feedback; an acknowledged report is never applied or written again |
| `summary` | longtext | Two to four plain sentences |
| `issue-types` | multiselect | `missing-price`, `hidden-product`, `missing-image`, `out-of-stock`, `certificate-missing`, `certificate-expired`, `certificate-expiring`, `orders-waiting`, `orders-to-ship`, `payment-waiting`, `payment-problem`, `email-failed`, `shipping-missing`, `policy-unfinished`, `checkout-setup`, `demo-leftovers`, `site-unreachable`, `site-mismatch`, `image-unreachable`, `other`: every type used in Issues |
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
| `GET /order` | Checkout (cart, address, shipping, total); `?add=<product-id>&qty=<n>` pre-fills one line |
| `POST /api/orders` | JSON (from the page script) or a plain form post; creates one Orders row, `awaiting-payment` (PayPal) or `new` (order request) |
| `GET /pay/<order-id>` | That order's items, total and PayPal button, or its status; no name, email or address; `no-store`, `noindex` |
| `POST /api/paypal/orders` | `{orderId}` → `{id}`: creates (or reuses) the PayPal order for one awaiting order, amount from the row |
| `POST /api/paypal/capture` | `{orderId, paypalOrderId}` → `{status: "paid" \| "pending" \| "problem"}`; `422 instrument_declined` lets the buyer choose another way to pay |
| `POST /api/paypal/client-token` | A browser-safe PayPal client token for this domain (SDK fallback) |
| `POST /api/paypal/webhook` | PayPal's notifications: verified with `verify-webhook-signature` first (`400` if not genuine), applied once; `503` (PayPal retries) when it cannot verify yet |
| `GET /pages/<slug>` | A published policy page |
| `GET /blog` | Published posts, newest `published-at` first; with none, a short note and `noindex` (and no Blog link anywhere) |
| `GET /blog/<slug>` | A published post (else 404); other spellings of its address and its legacy paths answer `301` to it |
| `GET /blog/rss.xml` | RSS 2.0, the newest 20 posts |
| `GET /blog-covers/<slug>` | A published post's cover when it is a Busabase asset, fetched with the key |
| `GET /llms.txt` | Plain-text summary for AI assistants: store, what it sells, shipping, payment, contact, listed products with prices, published pages and posts |
| `GET /api/status` | `{ ok, setup, products, ordering, productsFrom, payments, paymentsNote?, shipping, email, pages, pagesToFinish?, posts, postsNotShown?, google: { analytics, searchConsole, bing } }`; readiness only, never a value |
| `GET /images/<product-id>/<n>` | Image `n` of a listed product, fetched with the key |
| `GET /sitemap.xml`, `GET /robots.txt` | Sitemap: home, listed products, published pages, `/blog` and posts. robots.txt: one group for every crawler (search engines and AI assistants named), `/api/`, `/order`, `/pay/` disallowed, the sitemap linked |
| any other path | A post's legacy path → `301`; else 404 |
| `/static/*`, `/favicon.svg` | Files in `public/` |

`POST /api/orders` answers `200 {ok, orderId, payment, payPath?}`, `400 {errors, itemErrors}`
(field → code: `required`, `invalid`, `too_long`, `invalid_email`,
`invalid_phone`, `invalid_country`, `no_shipping`, `shipping_unavailable`,
`items_empty`, `too_many_items`, `not_available`, `sold_out`, `too_many`),
`409` when the total the buyer saw (items + shipping) is no longer the total
(with current prices), `403` for a cross-site post, `413` over 16 KB, `415`
for other content types, `503` when the shop is not set up or the order could
not be saved (nothing was saved; the buyer keeps the same order id for the
retry).

## Written by `scripts/import-products.mjs`

Run by an agent or a person, never by the website. It writes the table the
website sells from (SKILL.md, "How the website finds its tables"), or the one
`--products-base` names. Products are matched by `product-id`; certificates
by product + `cert-type` + `cert-number`. An empty cell in the list leaves
the stored value alone.

| Base | Fields it may write |
| --- | --- |
| Products (the shop's) | `product-id`, `name`, `sku`, `subtitle`, `category`, `status` (from the sheet's Status and Lifecycle: on sale → `active`, draft/test → `draft`, 下架/archive → `archive`), `price`, `currency`, `stock`, `cost` (cost, or landed cost when there is none), `brand`, `model`, `warranty`, `returns`, `description`, `highlights`, `tags`, `specs` and `notes` (lines merged by label: a line about the same thing gets the new value under the label already there, new lines are appended, none is removed), `source`, `main-photo` + `more-photos` (the uploaded pictures as files, main first; a link in the list is downloaded and uploaded too); in a shop from before 0.9.0 without them, `image` + `gallery` (the uploaded pictures' links, the rest one per line); `ref` on create |
| Certificates | `product`, `cert-type`, `cert-number`, `issuer`, `issued-date`, `expiry-date`, `source-note` (`<file> › <sheet> row <n>`, plus the row's Source/备注) |

A column it writes but the table no longer has (the owner deleted it) is left
out, and the summary says so. A picture is not uploaded again when the
product already shows one with the same bytes (it reads the stored files back).
`--move-photos` writes only `main-photo` + `more-photos`, on rows where both
are empty, from their `image` / `gallery` links.
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
