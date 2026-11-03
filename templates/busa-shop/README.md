# busa-shop

A public storefront for a small cross-border seller, running on Busabase's
Website (`site`) engine. It sells from the Products table of
[`busa-product-hub`](../busa-product-hub) (one product table, no copy), takes
order requests into **Orders**, reads its texts from **Settings**, and comes
with a daily shop check that writes **Reports** and applies the owner's
feedback on the next run. The manual is [`SKILL.md`](SKILL.md).

Install busa-product-hub first; a template cannot declare that dependency, so
the website shows an owner-facing setup page until it finds a Products table.

```bash
busabase-cli install ./templates/busa-product-hub
busabase-cli install ./templates/busa-shop
```

Then click **Run** on *Shop Website* for the members-only preview and **Go
live** to publish it. Go live creates an API key in your name with `write`
access, because the order form saves orders.

## Demo data

Everything is fictional and labelled as such: the toy factory "Tumbleberry
Toys", its 12 toys and 38 certificates in [`assets/demo/`](assets/demo) (the
CSV the course imports into the product hub, with original SVG
illustrations; two toys have no photo, one has no price, some certificates
are missing, expired or expiring on purpose), three sample orders and one
sample report.

## Developing the website

```bash
cd content/busa-shop-app
npm install
npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js
npm test          # unit tests + the deployed bundle against a fake Busabase API
npm run check     # vendor/worker.js is fresh, import-free, default-export only
BUSABASE_BASE_URL=… BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… npm run dev   # local preview
```

`vendor/worker.js` (`site.entry`) is what deploys and must be rebuilt after any
change to `src/`. It sits in `vendor/` because it carries busabase-sdk inside it,
and this repository's checks read an app's own source (`src/`) and skip vendored
bundles.
The screenshots were taken from that bundle running locally against the
template's demo data served by the test fake, not from a live install.
