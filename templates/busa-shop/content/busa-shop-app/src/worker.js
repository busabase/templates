// Busa Shop website: a Cloudflare-Worker-style `site` app on Busabase.
//
// Source of the deployed bundle. Edit the files in src/, then rebuild the one
// file Busabase deploys (airapp.json › site.entry; it must have no imports left):
//
//   npm install
//   npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js
//
// The bundle lives in vendor/ because it carries busabase-sdk inside it: this
// repository's checks (busabase-cli check, scripts/check-app-writes.mjs,
// scripts/check-app-sdk-helpers.mjs) read an app's own source, src/ here, and
// leave vendored bundles alone, as they do for every app's app/vendor/busabase-*.js.
//
// Fixed routes only. Each one has one job, and none passes a visitor's path,
// filter or body through to the API. The one visitor value that reaches it is
// an order id (ORD- + ten characters, pattern-checked), as the exact value of
// this shop's Orders › Order ID:
//
//   GET  /                        home: store name, tagline, product grid
//   GET  /products/<product-id>   one listed product (404 for anything else)
//   GET  /order                   checkout: cart, delivery address, shipping, total
//   POST /api/orders              create one Orders row (JSON or a plain form post):
//                                 `new` (order request) or `awaiting-payment` (PayPal)
//   GET  /pay/<order-id>          that order's PayPal button, or its status
//   POST /api/paypal/orders       create the PayPal order for one of our orders (server-side amount)
//   POST /api/paypal/capture      capture it after the buyer approved; mark the order paid
//   POST /api/paypal/client-token a browser-safe PayPal client token (SDK fallback)
//   POST /api/paypal/webhook      PayPal's notifications, each verified with PayPal first
//   GET  /pages/<slug>            a published policy page from the Pages table
//   GET  /api/status              readiness for the daily check (never a secret)
//   GET  /images/<product-id>/<n> image n of a listed product, fetched with the site key
//   GET  /sitemap.xml, /robots.txt
//   /static/*, /favicon.svg       files in public/, served by the platform
//
// Bindings (set by Busabase on every deploy, never written anywhere else):
//   env.BUSABASE_BASE_URL, env.BUSABASE_API_KEY, env.BUSABASE_SPACE_ID
// Secrets come from the Busabase Vault at runtime (src/vault.js), never from here.
// Only a local run sets these (npm run dev, tests); a deploy never does:
//   env.SOCKETS          a `connect()` for SMTP outside Cloudflare (scripts/node-sockets.mjs)
//   env.PAYPAL_API_BASE, env.PAYPAL_SDK_URL   a PayPal mock instead of PayPal

import { createHandler } from "./handler.js";

const handler = createHandler();

// Only a default export: the platform treats named exports of the entry module
// as extra entrypoints.
export default {
  fetch: (request, env, ctx) => handler(request, env, ctx),
};
