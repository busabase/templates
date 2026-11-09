#!/usr/bin/env node
// The live-site half of the daily shop check: open the public site the way a
// stranger would (no key, no cookie) and report what came back.
//
//   node scripts/probe-site.mjs https://<the shop's address>
//
// Prints one JSON object: whether the home page, /api/status, /sitemap.xml,
// robots.txt and /llms.txt answer, how long the home page took, how many
// products and blog posts the site lists, whether the home page carries the
// Google Analytics and Search Console tags, and whether every photo on every
// listed product page loads (`images.failed` names each one that does not).
// Since busa-shop 0.8.0 it also asks the MCP endpoint for its tools (the
// tools/list an AI assistant sends when it connects) and fetches /agents.md,
// the Google feed and /.well-known/ucp. It only reads.

const MAX_PRODUCT_PAGES = 100; // the shop lists at most 100 products
const PARALLEL = 6;

const imageSources = (html) =>
  [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((src) => !src.startsWith("/static/"));

/** Run `task` over `items`, `limit` at a time. */
const inBatches = async (items, limit, task) => {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    results.push(...(await Promise.all(items.slice(index, index + limit).map(task))));
  }
  return results;
};

export const probeSite = async (siteUrl, { fetchImpl = fetch, now = () => Date.now(), timeoutMs = 15_000 } = {}) => {
  const origin = new URL(siteUrl).origin;
  const get = async (path) => {
    const started = now();
    try {
      const response = await fetchImpl(new URL(path, origin), {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "busa-shop-daily-check" },
      });
      const body = await response.text();
      return { status: response.status, ms: now() - started, type: response.headers.get("content-type") ?? "", body };
    } catch (error) {
      return { status: 0, ms: now() - started, type: "", body: "", error: error?.name ?? "error" };
    }
  };

  const mcpTools = async () => {
    const started = now();
    try {
      const response = await fetchImpl(new URL("/mcp", origin), {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "busa-shop-daily-check", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, ms: now() - started, tools: (body?.result?.tools ?? []).map((tool) => tool.name) };
    } catch (error) {
      return { status: 0, ms: now() - started, tools: [], error: error?.name ?? "error" };
    }
  };
  const [home, status, sitemap, robots, llms, mcp, agentsMd, feed, ucp] = await Promise.all([
    get("/"),
    get("/api/status"),
    get("/sitemap.xml"),
    get("/robots.txt"),
    get("/llms.txt"),
    mcpTools(),
    get("/agents.md"),
    get("/feeds/google.xml"),
    get("/.well-known/ucp"),
  ]);
  let statusJson = null;
  try {
    statusJson = JSON.parse(status.body);
  } catch {
    statusJson = null;
  }
  const productUrls = [...sitemap.body.matchAll(/<loc>([^<]+\/products\/[^<]+)<\/loc>/g)].map((match) => match[1]);

  // Every photo on every listed product page, each URL fetched once.
  const pages = await inBatches(productUrls.slice(0, MAX_PRODUCT_PAGES), PARALLEL, async (url) => ({
    product: decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""),
    page: await get(new URL(url).pathname),
  }));
  const photos = new Map();
  for (const { product, page } of pages) {
    for (const src of imageSources(page.body)) {
      const url = new URL(src, origin).href;
      if (!photos.has(url)) photos.set(url, product);
    }
  }
  const checked = await inBatches([...photos], PARALLEL, async ([url, product]) => {
    const result = await get(url);
    return { product, url, status: result.status, type: result.type, ...(result.error ? { error: result.error } : {}) };
  });
  const failed = checked.filter((photo) => photo.status !== 200 || !photo.type.toLowerCase().startsWith("image/"));
  const pageErrors = pages.filter(({ page }) => page.status !== 200).map(({ product, page }) => ({ product, status: page.status }));

  return {
    site: origin,
    checkedAt: new Date(now()).toISOString(),
    reachable: home.status === 200,
    home: {
      status: home.status,
      ms: home.ms,
      ...(home.error ? { error: home.error } : {}),
      title: /<title>([^<]*)<\/title>/.exec(home.body)?.[1] ?? "",
      charset: /<meta charset="utf-8">/i.test(home.body),
      demoNotice: home.body.includes('class="demo-notice"'),
      setupPage: home.body.includes('class="message setup"'),
      googleAnalytics: home.body.includes('<meta name="busa-shop-ga4"'),
      searchConsole: home.body.includes('<meta name="google-site-verification"'),
    },
    status: { status: status.status, ...(statusJson ?? {}) },
    sitemap: {
      status: sitemap.status,
      productUrls: productUrls.length,
      postUrls: [...sitemap.body.matchAll(/<loc>[^<]+\/blog\/[^<]+<\/loc>/g)].length,
    },
    robots: { status: robots.status, sitemap: /^Sitemap: /m.test(robots.body) },
    llms: { status: llms.status },
    agents: {
      mcp: { status: mcp.status, ms: mcp.ms, tools: mcp.tools, ...(mcp.error ? { error: mcp.error } : {}) },
      agentsMd: { status: agentsMd.status },
      feed: { status: feed.status, items: (feed.body.match(/<item>/g) ?? []).length },
      ucp: { status: ucp.status },
    },
    productPages: { checked: pages.length, failed: pageErrors },
    images: { checked: checked.length, failed },
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/probe-site.mjs https://<the shop's address>");
    process.exitCode = 1;
  } else {
    const result = await probeSite(target);
    console.log(JSON.stringify(result, null, 2));
    if (!result.reachable) process.exitCode = 2;
  }
}
