# busa-shop

A one-install online shop for a small cross-border seller, running on
Busabase's Website (`site`) engine (on a space without it, such as Busabase
Cloud Free, a private preview in your own browser tab). Product management is
built in: the shop keeps its own **Products** and **Certificates** tables, in
plain columns you edit in the grid. Checkout asks for the delivery address,
adds the shipping cost for the buyer's country from **Shipping**, and takes
the payment with **PayPal** (created and captured on the server; webhooks
verified with PayPal), or an order request while PayPal is off. Each order
lands in **Orders**, where it is followed from payment to shipping; the buyer
and the owner get emails over the owner's own **SMTP** mailbox; policy pages
come from **Pages**. Texts and the non-secret setup are in **Settings**, the
PayPal secret and the SMTP password in the Space **Vault**. A daily shop check
writes **Reports** and applies the owner's feedback on the next run. The
manual is [`SKILL.md`](SKILL.md).

```bash
busabase-cli install ./templates/busa-shop
```

Products starts empty. Bring a product list in with the importer in
[`scripts/import-products.mjs`](scripts/import-products.mjs) (Excel workbooks
with the pictures inside, or CSV, English or Chinese column names; a dry-run
preview first), or type products into the table. The shop lists a product when
its Status is On sale and it has a name, a product ID and a price in the
shop's currency; a change shows on the site within about a minute.

Then open *Shop Website*: opening it starts the members-only preview (the
header shows **Running** and **Not live**; a **Run** button appears only on a
node that has never run). Click **Go live** to publish it; the address and
the **Public** switch are under **More actions → Settings**. Go live creates
an API key in your name with `write` access, listed as `Site: Shop Website`,
because the order form saves orders; the preview has its own,
`Site preview: Shop Website`. On Busabase Cloud the Website engine needs Plus
or higher.

On a Free space the shop still runs, for you only: opening *Shop Website* runs
the same site inside your own browser tab (the browser engine,
`content/busa-shop-app/scripts/browser-preview.mjs`), reading your tables as you,
with your session and no key. The header shows **Running** and **Restart** only; there is no
address and no **Go live**, and nobody else can open it. Orders you place there
are real Orders rows. Upgrading the space to Plus switches the same node to the
Website engine, with Go live.

## Busa Product Hub is optional

Busa Shop no longer needs [`busa-product-hub`](../busa-product-hub). That
template is for export sellers who manage several channels (Amazon, Shopify,
TikTok Shop, eBay) and their certificates in one place. To sell from its
Products table instead of the shop's own, write its slug
(`busa-product-hub-products`) into the shop's Settings › **Products table**.
A shop installed before 0.5.0, which has no Products of its own, keeps selling
from the product hub with nothing to change.

## Demo data

Everything is fictional and labelled as such: the toy factory "Tumbleberry
Toys", its 12 toys and 39 certificates in [`assets/demo/`](assets/demo) (the
CSVs the course imports into the shop's Products with
[`scripts/import-products.mjs`](scripts/import-products.mjs), with original SVG
illustrations; two toys have no photo, one has no price, some certificates
are missing, expired or expiring on purpose), four sample orders (one paid
with fake PayPal ids), demo shipping rates, five policy pages full of
【fill in …】 markers plus a hidden draft Legal notice, and one sample report. [`assets/import/products-template.xlsx`](assets/import/products-template.xlsx)
is the blank bilingual sheet (`node scripts/import-products.mjs --write-template`).

## Developing the website

```bash
cd content/busa-shop-app
npm install
npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js
npm test          # unit tests, the importer, and the deployed bundle against a fake Busabase API
npm run check     # vendor/worker.js is fresh, import-free, default-export only
BUSABASE_BASE_URL=… BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… npm run dev   # local preview
```

The tests run checkout end to end through the bundle against a fake Busabase,
a PayPal stand-in (`test/fake-paypal.mjs`: REST API, signed webhooks, a JS SDK
v6 stand-in) and a real SMTP server on localhost. `npm run dev` sends email
through Node's sockets; `PAYPAL_API_BASE` / `PAYPAL_SDK_URL` point it at a
PayPal mock (a deploy never sets them).

`airapp.json` *prefers* the Website engine (`preferredEngine: "site"`, never
`requiredEngine`, which would turn a Free space into an upgrade wall). Where it
is not available Busabase picks the browser engine and runs `install`
(`node --version`: nothing to install, the bundle carries its dependencies) and
`start` (`node scripts/browser-preview.mjs`). `npm run check` keeps all three.

`vendor/worker.js` (`site.entry`) is what deploys and must be rebuilt after any
change to `src/`. It sits in `vendor/` because it carries busabase-sdk inside it,
and this repository's checks read an app's own source (`src/`) and skip vendored
bundles.
The screenshots were taken from that bundle running locally against the
template's demo data served by the test fake, not from a live install.

`scripts/import-products.mjs` is also shipped, byte for byte, as
busa-product-hub's `scripts/import-products.mjs`; edit it here and copy it
there (`test/import-products-shop.test.mjs` fails until the two agree).
