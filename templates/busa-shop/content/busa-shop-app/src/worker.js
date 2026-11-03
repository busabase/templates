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
// id, filter or body through to the API:
//
//   GET  /                        home: store name, tagline, product grid
//   GET  /products/<product-id>   one listed product (404 for anything else)
//   GET  /order                   the order request form
//   POST /api/orders              create one Orders row (JSON or a plain form post)
//   GET  /api/status              { ok, setup, products, ordering } for the daily check
//   GET  /images/<product-id>/<n> image n of a listed product, fetched with the site key
//   GET  /sitemap.xml, /robots.txt
//   /static/*, /favicon.svg       files in public/, served by the platform
//
// Bindings (set by Busabase on every deploy, never written anywhere else):
//   env.BUSABASE_BASE_URL, env.BUSABASE_API_KEY, env.BUSABASE_SPACE_ID

import { createHandler } from "./handler.js";

const handler = createHandler();

// Only a default export: the platform treats named exports of the entry module
// as extra entrypoints.
export default {
  fetch: (request, env, ctx) => handler(request, env, ctx),
};
