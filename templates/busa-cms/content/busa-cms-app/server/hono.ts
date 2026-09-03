import fs from "node:fs/promises";
import path from "node:path";
import { describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { type Context, Hono } from "hono";
import { withRuntimeRequest } from "../lib/runtime-context.ts";
import { demoSave, demoSetStatus, demoStatePayload, isDemoQuery } from "./demo.ts";
import { installLocalBusabaseAuth } from "./local-auth.js";
import { APP_DIR } from "./paths.ts";
import { saveContent, setStatus, statePayload } from "./state.ts";

// The AirApp server forwards its ambient Busabase session to busabase-sdk.

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function sendFile(c: Context, absPath: string, { store = false }: { store?: boolean } = {}) {
  let body: Buffer;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": store ? "public, max-age=3600" : "no-store",
  });
}

/**
 * Serve one directory under `app/` without letting a crafted path escape it.
 * `path.resolve` collapses `..` first, so the prefix test below is the real check.
 */
const serveDirectory = (name: string, extension: string) => (c: Context) => {
  const rel = decodeURIComponent(c.req.path.replace(new RegExp(`^/${name}/`), ""));
  const root = path.resolve(APP_DIR, name);
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) || path.extname(resolved) !== extension) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
};

export const app = new Hono();

installLocalBusabaseAuth(app, { appId: "busa-cms" });

app.use("*", async (c, next) => {
  const headers: Record<string, string> = {};
  for (const name of ["cookie", "authorization"]) {
    const value = c.req.header(name);
    if (value) headers[name] = value;
  }
  // Hosted, `headers` carries the viewer's ambient session and that is the whole
  // story. Standalone there is no such session, so the gateway hands over the
  // credential and the Space it validated — server-side, never from the browser.
  const local = describeBusabaseAirAppRuntime().hosted
    ? null
    : await installLocalBusabaseAuth.resolve?.(c).catch(() => null);
  return withRuntimeRequest({ origin: new URL(c.req.url).origin, headers, local }, next);
});

app.get("/health", (c) => c.json({ ok: true, app: "busa-cms" }));

// The SDK owns the runtime vocabulary and decides hosting from the presence of
// BUSABASE_AIRAPP_RUNTIME rather than membership in a stale list of engine names.
app.get("/__airapp/runtime", (c) => c.json(describeBusabaseAirAppRuntime()));

// ---- API ----

const failed = (c: Context, error: unknown) =>
  c.json({ error: String((error as Error)?.message || error) }, 500);

app.get("/api/state", async (c) => {
  const query = c.req.query();
  try {
    return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload());
  } catch (error) {
    return failed(c, error);
  }
});

app.post("/api/save", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  try {
    if (isDemoQuery(query)) return c.json(demoSave(body));
    return c.json(await saveContent(body));
  } catch (error) {
    return failed(c, error);
  }
});

app.post("/api/status", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  try {
    if (isDemoQuery(query)) return c.json(demoSetStatus(body));
    return c.json(await setStatus(body));
  } catch (error) {
    return failed(c, error);
  }
});

// ---- Static (zero-build frontend) ----

app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
// Cascade-layered stylesheets; @layer precedence makes <link> order irrelevant to
// which rule wins. See frontend-modules.md / css-modules.md.
app.get("/styles/*", serveDirectory("styles", ".css"));
app.get("/i18n/*", serveDirectory("i18n", ".js"));
// Plain ES modules, no bundler: app.js imports these with relative "./js/*.js"
// specifiers, so the browser requests them here.
app.get("/js/*", serveDirectory("js", ".js"));
