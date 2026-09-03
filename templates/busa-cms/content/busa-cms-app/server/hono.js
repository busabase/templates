import fs from "node:fs/promises";
import path from "node:path";
import { describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";
import { sampleRecords } from "../lib/sample-content.js";
import { connectSnippets } from "../lib/connect-snippets.js";
import { installLocalBusabaseAuth } from "./local-auth.js";
import { APP_DIR } from "./paths.js";

/**
 * What this process is, and is not.
 *
 * It serves the app's files, tells the browser which runtime it is in, hands over
 * the demo seed, and — standalone only — proxies `/api/v1` with the credential it
 * holds. It never reads the workspace itself: a Busabase-hosted AirApp is given
 * `BUSABASE_AIRAPP_RUNTIME` and nothing else — no API origin, no credential — so
 * the browser's own same-origin `/api/v1` is the only route to the data. That is
 * the platform's design, not a workaround: the preview proxy exists specifically
 * so "absolute refs like /api/v1/… still hit the busabase origin root".
 */

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function sendFile(c, absPath, { store = false } = {}) {
  let body;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": store ? "public, max-age=3600" : "no-store",
  });
}

/**
 * Serve one directory under `app/` without letting a crafted path escape it.
 * `path.resolve` collapses `..` first, so the prefix test below is the real check.
 */
const serveDirectory = (name, extension) => (c) => {
  const rel = decodeURIComponent(c.req.path.replace(new RegExp(`^/${name}/`), ""));
  const root = path.resolve(APP_DIR, name);
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) || path.extname(resolved) !== extension) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
};

export const app = new Hono();

// Adds the standalone connect gate and, with it, the `/api/v1` proxy that attaches
// the server-side credential and the operator's confirmed Space. Hosted, none of
// its routes are reached: the browser's `/api/v1` is Busabase's own.
installLocalBusabaseAuth(app, { appId: "busa-cms" });

app.get("/health", (c) => c.json({ ok: true, app: "busa-cms" }));

// The SDK owns the runtime vocabulary and decides hosting from the presence of
// BUSABASE_AIRAPP_RUNTIME rather than membership in a stale list of engine names.
app.get("/__airapp/runtime", (c) => c.json(describeBusabaseAirAppRuntime()));

/**
 * The demo seed, served rather than imported by the browser: one seeded post's
 * body is a code sample naming an API-key env var, and `busabase-sdk/airapp-check`
 * fails any app whose browser bundle mentions one.
 */
app.get("/api/demo-records", (c) => c.json(sampleRecords));

/**
 * The copy-paste block for the consuming website, built here for the same reason —
 * it names `BUSABASE_API_KEY`, which must not appear in browser source.
 */
app.get("/api/connect-snippet", (c) =>
  c.json(
    connectSnippets({
      baseUrl: c.req.query("baseUrl") || "",
      spaceId: c.req.query("spaceId") || "",
      folderId: c.req.query("folderId") || "",
      profile: c.req.query("profile") || "standard",
    }),
  ),
);

// ---- Static (zero-build frontend) ----

app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
// Cascade-layered stylesheets; @layer precedence makes <link> order irrelevant to
// which rule wins. See frontend-modules.md / css-modules.md.
app.get("/styles/*", serveDirectory("styles", ".css"));
app.get("/i18n/*", serveDirectory("i18n", ".js"));
// Plain ES modules, no bundler: app.js imports these with relative "./js/*.js"
// specifiers, so the browser requests them here.
app.get("/js/*", serveDirectory("js", ".js"));
app.get("/vendor/*", (c) => serveDirectory("vendor", ".js")(c));
