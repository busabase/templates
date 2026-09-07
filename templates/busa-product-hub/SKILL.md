---
name: busa-product-hub
description: Product & certification hub (Busabase App-in-Skill) for export/trade sellers — catalog/SKU master data, pricing, inventory, channel status, content assets, compliance notes, lifecycle state, a certificate-expiry tracker (CE/FCC/RoHS/UN38.3/UKCA), and an approval-gated review queue. Use when the user invokes $busa-product-hub or /busa-product-hub, asks for 电商商品管理, 商品库, SKU 管理, inventory/reorder, product status across Amazon/Shopify/TikTok Shop/eBay, channel publishing approvals, price-change review, quality holds, product lifecycle/archive decisions, certificate expiry tracking, CE/FCC/RoHS/UN38.3/UKCA certification status, MOQ or lead-time questions ahead of a trade show, or a Busabase-backed product management desk.
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
- Reading a SKU master sheet, a marketplace export, an inventory CSV, or a
  certificate PDF is a genuine external operation a browser cannot perform:
  `scripts/ingest_products.mjs` is the only place a product, channel row,
  inventory row, review item, or certificate enters the system. It reads a
  JSON payload the agent prepares and upserts every row into Busabase by
  natural key (`product_id`/`channel_id`/`inventory_id`/`item_id`, and for
  certificates `product_id` + `cert_type` + `cert_number` — certificates have
  no single declared id field of their own) so re-ingests are idempotent.
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

- `products`: catalog/SKU master data — lifecycle, status, owner, vendor, image/gallery, tags, and JSON-encoded pricing/inventory-rollup/content-readiness/compliance blocks.
- `channels`: one row per product × marketplace channel (Amazon/Shopify/TikTok Shop/eBay) — listing id, status, price, buybox, content score, and channel issue note.
- `inventory`: one row per product × warehouse — on-hand/available/reserved/inbound units, inbound ETA, days of cover, and stock-risk status.
- `review`: the approval-gated review queue — channel publish approvals, price-change review, quality holds, lifecycle/archive decisions, and `spec_claim` items (see below), with the human decision on the same row.
- `settings`: one row (`record-id: "config"`) with the seller profile, platform connectors, warehouses, and review policy.
- `certificates`: one row per product certificate (CE/FCC/RoHS/UN38.3/UKCA/Other) — issuer, certificate number, issued/expiry dates, the certificate file, and a source note. **No stored status field** — `valid`/`expiring_soon`/`expired` is always derived client-side from the expiry date vs now (`certStatusFor()` in `product-hub-model.js`), the same derived-not-stored pattern this app already uses elsewhere. `expiring_soon` = within 90 days and not yet past; `expired` = past (or missing/unparseable, treated as the most urgent case); `valid` = more than 90 days remaining.

Resources provision lazily through an idempotent Busabase ChangeRequest the
first time the app runs in a Space; see `references/product-hub-schema.md`
for exact field shapes. Metrics and the recent-activity feed are recomputed
client-side from the stored rows on every read
(`content/busa-product-hub-app/app/js/product-hub-model.js`'s
`buildSnapshot`/`assembleSnapshot`), so the desk is always fresh regardless
of when a browser session loads it.

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

## Local App

Default behavior is AirApp-first — give the user the clickable AirApp URL.
Start `pnpm --dir content/busa-product-hub-app dev` only when local
preview/debugging is explicitly requested.

Required app views (hash routes):

- `#/overview`: KPI cards (products, active products, average margin,
  inventory value, certificates at risk), a **"Certificates expiring soon"**
  panel (the headline screen — soonest-first, linking to each product),
  visual product cards, review-queue preview, and recent activity.
- `#/products` and `#/products/<id>`: catalog and product detail with
  gallery, pricing, inventory, content readiness, compliance notes, channel
  matrix, linked certificates, and linked review cards.
- `#/inventory`: warehouse and days-cover table with low-stock and
  stockout-risk badges.
- `#/channels`: product × platform status table with channel issue notes
  and content scores.
- `#/certificates`: every certificate, sorted soonest-expiry-first, each
  linking to its product.
- `#/review`: approval queue with `approve` / `request_changes` / `block`
  decisions. Decisions write directly onto the review item's own record
  through `busabase-sdk` — there is no separate decisions bucket.
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

In normal use, invoke `/busa-product-hub` and open the AirApp.
