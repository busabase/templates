# Busa Product Hub Schema

Use this schema when reading or writing Busa Product Hub's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/busa-product-hub-app/app/js/providers/busabase-provider.js`,
`content/busa-product-hub-app/app/js/product-hub-model.js`). The canonical
field declaration lives in
`content/busa-product-hub-app/app/js/config.js`; `content/<base>/base.json`
is generated from it by `scripts/sync-content.mjs` and must never be
hand-edited directly — edit `config.js`, then run
`node scripts/sync-content.mjs`. Metrics and the recent-activity feed are
computed client-side from the six Bases on every read
(`buildSnapshot`/`assembleSnapshot` in `product-hub-model.js`) — the only
persisted state is what lives directly on those Bases.

Product lifecycle: `launch`, `active`, `test`, `archive`.

Product/channel status values (free text, badge-styled in the UI):
`active`, `needs_review`, `changes_requested`, `blocked`, `retiring`,
`draft`, `approved`, `live`, `ready_to_publish`, `suppressed`,
`price_review`.

Inventory status: `healthy`, `low_stock`, `stockout_risk`, `test_cap`,
`retiring`.

Review item type: `publish_approval`, `quality_hold`, `price_change`, a
lifecycle/archive decision, or `spec_claim` (see the Review section below).

Decision actions (the only three buttons the review queue exposes):
`approve`, `request_changes`, `block`.

Certificate status (`valid`/`expiring_soon`/`expired`) is **never stored** —
see the Certificates section below.

## Products (`busa-product-hub-products`)

Products, channel rows, inventory rows, review items, and certificates enter
Busabase through the operator's own workflow — directly, through
`$busabase`, or through an agent acting on the operator's behalf — never
through this AirApp. The AirApp itself never creates one of these rows; it
only ever writes a review decision onto a review item's own record.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number |
| `sku` | `sku` | text | |
| `name` | `name` | text | |
| `subtitle` | `subtitle` | text | |
| `category` | `category` | text | |
| `lifecycle` | `lifecycle` | text | `launch\|active\|test\|archive` |
| `status` | `status` | text | catalog status badge |
| `owner` | `owner` | text | |
| `vendor` | `vendor` | text | supplier/manufacturer |
| `launch-date` | `launch_date` | text | ISO date |
| `image` | `image` | text | hero image URL, e.g. `/assets/product-images/aurora-lamp.png` |
| `gallery` | `gallery` | longtext | JSON array of image URLs |
| `tags` | `tags` | longtext | JSON array of tag strings |
| `pricing` | `pricing` | longtext | JSON object: `cogs`, `landed_cost`, `target_price`, `current_price`, `map_price`, `gross_margin_pct`, `breakeven_acos` |
| `inventory` | `inventory` | longtext | JSON object rollup: `on_hand`, `available`, `reserved`, `inbound`, `days_cover`, `reorder_point`, `reorder_qty` |
| `content` | `content` | longtext | JSON object: `hero_images_ready`, `hero_images_required`, `video_ready`, `listing_source`, `copy_status` |
| `compliance` | `compliance` | longtext | JSON object: `score`, `status`, `notes` (array) |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Channels (`busa-product-hub-channels`)

One row per product × marketplace channel, keyed by
`channel-id = <product_id>__<platform>`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `channel-id` | `channel_id` | text | `<product_id>__<platform>`, required |
| `product-id` | `product_id` | text | references `products.product-id` |
| `platform` | `platform` | text | `amazon\|shopify\|tiktok_shop\|ebay` |
| `listing-id` | `listing_id` | text | marketplace listing id |
| `status` | `status` | text | `live\|ready_to_publish\|draft\|suppressed\|price_review` |
| `price` | `price` | number | |
| `buybox` | `buybox` | text | `"true"\|"false"\|""` (tri-state; empty = unknown/not applicable) |
| `content-score` | `content_score` | number | 0-100 |
| `issue` | `issue` | longtext | channel issue note; empty means no open issue |
| `next-step` | `next-step` | text | e.g. `approve_publish`, `add_asset` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Inventory (`busa-product-hub-inventory`)

One row per product × warehouse, keyed by
`inventory-id = <product_id>__<warehouse_id>`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `inventory-id` | `inventory_id` | text | `<product_id>__<warehouse_id>`, required |
| `product-id` | `product_id` | text | references `products.product-id` |
| `warehouse-id` | `warehouse_id` | text | references `settings.warehouses[].warehouse_id` |
| `warehouse-name` | `warehouse_name` | text | |
| `on-hand` | `on_hand` | number | |
| `available` | `available` | number | |
| `reserved` | `reserved` | number | |
| `inbound` | `inbound` | number | |
| `inbound-eta` | `inbound_eta` | text | ISO date |
| `days-cover` | `days_cover` | number | |
| `status` | `status` | text | `healthy\|low_stock\|stockout_risk\|test_cap\|retiring` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Review (`busa-product-hub-review`)

Approval-gated review queue: channel publish approvals, price-change review,
quality holds, lifecycle/archive decisions, and spec-claim citations. The
operator's decision is written directly onto this row — there is no
separate decisions.json-equivalent bucket.

`type` is free-form text (not a constrained enum), so `spec_claim` is a
documented value convention, not a schema migration:

> `spec_claim` — a specification claim the agent extracted from an uploaded
> document (e.g. a spec-sheet PDF) WITHOUT a clear page/section citation. Any
> `products` field or `certificates` row whose `source-note` doesn't cite a
> specific document + location (e.g. `spec-sheet.pdf p.3`, not `"uploaded by
> operator"`) should get a corresponding `spec_claim` review item before that
> fact is trusted enough to appear on a customer-facing quote. It renders in
> the review queue exactly like every other type — there is no separate UI
> surface.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the reviewer can say "Review #2" |
| `product-id` | `product_id` | text | references `products.product-id` |
| `type` | `type` | text | `publish_approval\|quality_hold\|price_change\|lifecycle\|spec_claim` |
| `status` | `status` | text | `needs_review\|approved\|changes_requested\|blocked` |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `risk` | `risk` | text | `low\|medium\|high` |
| `recommendation` | `recommendation` | text | the agent's recommended action, e.g. `approve\|block\|request_changes` |
| `evidence` | `evidence` | longtext | JSON array of evidence lines |
| `decision-note` | `decision_note` | longtext | reviewer's note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, set by the agent's own follow-up after a decision |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Settings (`busa-product-hub-settings`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `seller-brand` | `seller_brand` | text | |
| `seller-entity` | `seller_entity` | text | |
| `base-currency` | `base_currency` | text | default `USD` |
| `platforms` | `platforms` | longtext | JSON array of `{platform, enabled, store_name}` |
| `warehouses` | `warehouses` | longtext | JSON array of `{warehouse_id, name, region}` |
| `review-policy` | `review_policy` | longtext | JSON object: `price_change_threshold_pct`, `margin_floor_pct`, `low_stock_days`, `channel_publish_requires_approval` |
| `sync` | `sync` | longtext | JSON object: `last_import_at`, `sources` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Certificates (`busa-product-hub-certificates`)

One row per product certificate. This is the headline addition over the
underlying product-management desk: a supplier at a trade show gets asked
"do you have CE?" constantly, and this table is where that answer lives.

There is **no stored status field**. `valid`/`expiring_soon`/`expired` is
always derived client-side from `expiry-date` compared to "now"
(`certStatusFor()` in `product-hub-model.js`), the same derived-not-stored
pattern busa-expo-leads uses for its lead SLA bucket — so the certificate
list is always correct relative to when it is opened, never stale relative
to whenever a record was last written.

- `expiring_soon` = expiry date is within 90 days from now and not yet past.
- `expired` = expiry date is in the past (or missing/unparseable — an
  unknown expiry is treated as the most urgent case, never silently hidden
  as "valid").
- `valid` = more than 90 days remaining.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product` | `product` (relation payload), `product_id` (normalized) | relation → `products` | single |
| `cert-type` | `cert_type` | select | `CE\|FCC\|RoHS\|UN38.3\|UKCA\|Other` |
| `issuer` | `issuer` | text | testing lab / certification body |
| `cert-number` | `cert_number` | text | |
| `issued-date` | `issued_date` | text | ISO date |
| `expiry-date` | `expiry_date` | text | ISO date |
| `file` | `file` | attachment | max 1 file — the certificate PDF/image itself |
| `source-note` | `source_note` | text | where this record came from, e.g. `spec-sheet.pdf p.3` or `"uploaded by operator"` — a note that doesn't cite a specific document + location should get a `spec_claim` review item (see Review above) |

## Decisions

A human verdict writes `status` (via `statusForVerdict()`), `decision-note`,
and `decided-at` directly onto the review item's own record — there is no
separate decisions file. Since Busabase reads are always live, there is no
staleness overlay to compute.

## Invariants

- Keep `product_id`, `channel_id`, `inventory_id`, and `item_id` stable across re-syncs.
- Treat external marketplace publishing, price changes, SKU archival, and quality holds as approval-required.
- Product images ship as static files under `content/busa-product-hub-app/app/assets/product-images/` (served by `server.js`), referenced by relative URL from `products.image`/`gallery` — never depend on external image URLs.
- Never invent a certificate, expiry date, or test report. A missing certificate is a gap to flag (or a `spec_claim` review item), never a value to guess.
- Do not commit real seller exports, credentials, `.env*`, or `exports/`.
