import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (context) => context.json({ ok: true, app: "busabase-airapp" }));

/**
 * Local development proxy — inert when deployed.
 *
 * Browser code always calls `/api/v1/…` on its own origin. Inside Busabase that
 * origin already serves the real API, so nothing below ever runs there:
 * `BUSABASE_BASE_URL` is a local shell variable, so this route is simply never
 * registered. Running standalone (`npm run dev`) it is what turns that same
 * relative path into a real call against the Busabase you develop against:
 *
 *   BUSABASE_BASE_URL=http://localhost:15419 npm run dev     # Desktop / OSS: open, no key
 *   BUSABASE_BASE_URL=https://busabase.com \
 *   BUSABASE_API_KEY=… BUSABASE_SPACE_ID=… npm run dev       # Cloud
 *
 * The key is attached here, server-side, and never reaches the browser or any
 * committed file — which is why the app's own source can stay credential-free.
 */
const busabaseBaseUrl = (process.env.BUSABASE_BASE_URL || "").replace(/\/+$/, "");
if (busabaseBaseUrl) {
  app.all("/api/v1/*", async (context) => {
    const incoming = new URL(context.req.url);
    const target = new URL(incoming.pathname + incoming.search, busabaseBaseUrl);
    const headers = new Headers();
    const contentType = context.req.header("content-type");
    if (contentType) headers.set("content-type", contentType);
    const accept = context.req.header("accept");
    if (accept) headers.set("accept", accept);
    const space = context.req.header("x-busabase-space") || process.env.BUSABASE_SPACE_ID;
    if (space) headers.set("x-busabase-space", space);
    if (process.env.BUSABASE_API_KEY) {
      headers.set("authorization", `Bearer ${process.env.BUSABASE_API_KEY}`);
    }
    const method = context.req.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    const upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await context.req.arrayBuffer() : undefined,
      redirect: "manual",
    });
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("content-type", upstreamType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  });
  console.log(`Busabase dev proxy: /api/v1/* -> ${busabaseBaseUrl}/api/v1/*`);
}

app.use("/*", serveStatic({ root: "./app" }));

const port = Number.parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, () => {
  // Wording matters: the Local Node engine discovers which port to reverse-proxy
  // by matching this line against `READY_PORT_PATTERNS` in busabase-core's
  // `local-node-runtime.ts`. "ready on port" matches none of them, so the
  // preview would never load. Keep "listening on port <n>".
  console.log(`AirApp listening on port ${port}`);
});
