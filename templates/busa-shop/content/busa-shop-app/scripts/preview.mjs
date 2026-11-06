#!/usr/bin/env node
// Local preview of the deployed bundle. Busabase never runs this: a `site`
// app is deployed from vendor/worker.js + public/, not started with `npm run dev`.
//
//   BUSABASE_BASE_URL=https://busabase.com BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… npm run dev
//
// serves vendor/worker.js on http://localhost:8787 against that workspace, with
// public/ as the static assets, the way the platform binds them. The key stays
// in this process; the browser never sees it. Without a key it answers with the
// "temporarily unavailable" page, which is what a visitor would see too.
//
// Email goes out for real through Node's sockets (scripts/node-sockets.mjs);
// SMTP_TEST_CA_FILE trusts a local test mail server's own certificate.
// PAYPAL_API_BASE / PAYPAL_SDK_URL point PayPal at a mock instead (testing only).
import { readFile } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export const assetsBinding = {
  async fetch(request) {
    const path = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(publicDir, path);
    if (!file.startsWith(publicDir)) return new Response("Not found", { status: 404 });
    try {
      return new Response(await readFile(file), { headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

/** Serve a Worker module over node:http. Returns the listening server. */
export const serveWorker = async ({ worker, env, port = 8787, host = "127.0.0.1" }) => {
  // One env object for the life of the server, as on the platform: the site
  // keeps its catalog cache per env, so a fresh object per request would read
  // the workspace again on every page view and image.
  const bindings = { ...env, ASSETS: assetsBinding };
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const origin = `http://${req.headers.host ?? `${host}:${port}`}`;
    const request = new Request(new URL(req.url, origin), {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([key, value]) => (Array.isArray(value) ? value.map((item) => [key, item]) : [[key, value]])),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    // Work handed to waitUntil (the emails) keeps running after the answer, as on the platform.
    const response = await worker.fetch(request, bindings, { waitUntil: (promise) => promise.catch((error) => console.error("waitUntil:", error?.message ?? error)) });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: worker } = await import(new URL("../vendor/worker.js", import.meta.url));
  const { createNodeSockets } = await import("./node-sockets.mjs");
  const port = Number(process.env.PORT ?? 8787);
  const ca = process.env.SMTP_TEST_CA_FILE ? await readFile(process.env.SMTP_TEST_CA_FILE, "utf8") : undefined;
  await serveWorker({
    worker,
    port,
    host: process.env.HOST ?? "127.0.0.1",
    env: {
      BUSABASE_BASE_URL: process.env.BUSABASE_BASE_URL ?? "",
      BUSABASE_API_KEY: process.env.BUSABASE_API_KEY ?? "",
      BUSABASE_SPACE_ID: process.env.BUSABASE_SPACE_ID ?? "",
      BUSABASE_AIRAPP_RUNTIME: "site",
      SOCKETS: createNodeSockets({ ca }),
      ...(process.env.PAYPAL_API_BASE ? { PAYPAL_API_BASE: process.env.PAYPAL_API_BASE } : {}),
      ...(process.env.PAYPAL_SDK_URL ? { PAYPAL_SDK_URL: process.env.PAYPAL_SDK_URL } : {}),
    },
  });
  console.log(`Busa Shop preview on http://localhost:${port} (reading ${process.env.BUSABASE_BASE_URL || "no workspace: set BUSABASE_BASE_URL"})`);
}
