#!/usr/bin/env node
// The private preview on a space without the Website engine (Busabase Cloud
// Free). Busabase runs airapp.json's `start` here when it picks the browser
// engine: Node inside the viewer's own browser tab. Only that viewer sees it,
// and there is no address to publish and no Go live.
//
// It serves the same vendor/worker.js the Website engine deploys, so what the
// owner clicks through is the website itself. Two things differ from a deploy:
//
// - No key and no space id: the browser engine injects neither. The site's
//   calls to /api/v1 go to the tab's own origin with the viewer's session
//   cookie, and act in the viewer's active space as the viewer. An order placed
//   here is that person's Change Request, merged at once when they can write
//   to Orders.
// - The Busabase address is the origin the tab is on (`location.origin`),
//   never a configured URL.
//
// Busabase never runs this on the Website engine (that deploys site.entry), and
// `npm run dev` (scripts/preview.mjs) is the local preview with a key.

// The browser engine's fetch (Nodepod, 2026-11) throws "Cannot construct a
// Request with a Request object that has already been used" for
// `fetch(new Request(url, { method: "POST", body }))`, which is how
// busabase-sdk sends every write, so no order could be saved. The same request
// handed over as url + init goes through. Set before the bundle is loaded.
const engineFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  if (typeof input === "string" || input instanceof URL) return engineFetch(input, init);
  const hasBody = input.method !== "GET" && input.method !== "HEAD";
  return engineFetch(input.url, {
    method: input.method,
    headers: Object.fromEntries(input.headers),
    body: hasBody ? await input.arrayBuffer() : undefined,
    redirect: input.redirect,
    ...init,
  });
};

const { default: worker } = await import("../vendor/worker.js");
const { serveWorker } = await import("./preview.mjs");

const origin = globalThis.location?.origin ?? "";
if (!origin) console.error("Busa Shop: this engine gives no location.origin, so the preview cannot find Busabase; every page will say it is unavailable.");
const port = Number(process.env.PORT ?? 3000);
const engine = process.env.BUSABASE_AIRAPP_RUNTIME ?? "unknown";

await serveWorker({
  worker,
  port,
  host: "0.0.0.0",
  env: {
    BUSABASE_BASE_URL: origin,
    BUSABASE_API_KEY: "",
    BUSABASE_SPACE_ID: "",
    BUSABASE_AIRAPP_RUNTIME: engine,
  },
});
console.log(
  `Busa Shop: private preview on the ${engine} engine, listening on port ${port}. ` +
    `It reads ${origin || "(no Busabase origin)"} as the signed-in viewer. Nothing is published; there is no Go live here.`,
);
