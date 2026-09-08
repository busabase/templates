# Busa Product Hub

Busa Product Hub is a Busabase-backed product & certification hub for
export/trade sellers. AI can draft a spec sheet, but MOQ, certification, and
lead time can't be made up — buyers at a trade show ask "do you have CE?"
constantly, so this app pairs AI drafting with a human sign-off gate: catalog
data, pricing, inventory, channel status, and a certificate-expiry tracker,
all behind an approval-gated review queue.

## What It Shows

- Overview: product KPIs, a **"Certificates expiring soon" panel** (the
  headline addition), image-rich product cards, inventory value, margin,
  recent activity, and review queue preview.
- Products: catalog cards and product detail pages with gallery, pricing,
  inventory, content readiness, compliance notes, channel matrix, linked
  certificates, and linked review items.
- Inventory: warehouse availability, inbound stock, days cover, and
  stockout-risk flags.
- Channels: Amazon/Shopify/TikTok Shop/eBay listing status, content score,
  price, and channel issue notes.
- Certificates: every certificate (CE/FCC/RoHS/UN38.3/UKCA/Other), sorted
  soonest-expiry-first, each linking back to its product. Status
  (valid/expiring soon/expired) is always computed from the expiry date —
  never stored.
- Review: approval queue for publishing, price changes, quality holds,
  lifecycle decisions, and unsourced spec claims (a fact the agent extracted
  from a document without a page/section citation).
- Settings: sanitized seller profile, platform connectors, warehouses,
  review policy, and data-provider state.

## Running Locally

```bash
pnpm --dir content/busa-product-hub-app install
pnpm --dir content/busa-product-hub-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=inventory&lang=en#/inventory
/?demo=channels&lang=en#/channels
/?demo=certificates&lang=en#/certificates
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/products/prod-aurora-lamp
```

Use `lang=zh` for Chinese screenshots. Demo mode uses the same real static
PNG product images shipped under
`content/busa-product-hub-app/app/assets/product-images/` and never reads or
writes Busabase.

## Data

All persistent data — products, channels, inventory, review items,
certificates, and settings — lives in Busabase Bases under one application
Folder. See `SKILL.md` and `references/product-hub-schema.md` for the
resource map and record shapes. `scripts/sync-content.mjs` regenerates the
package's `content/<base>/base.json` sidecars from the app's own declaration
in `config.js` (or checks they are current with `--check`), so the two can
never drift.

## Boundary

The AirApp reads and writes Busabase only — it never publishes a channel
listing, changes a price, archives a SKU, or lifts a quality hold by itself.
Those actions require a human approval record in the review queue; carrying
them out is the operator's or their agent's job, outside this app. Products,
channels, inventory, review items, and certificates enter Busabase through
the operator's own workflow (directly, through `$busabase`, or through an
agent), never through the browser. Never commit real seller exports,
credentials, `.env*`, or generated exports.
