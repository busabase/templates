#!/usr/bin/env node
// The live-site half of the daily shop check: open the public site the way a
// stranger would (no key, no cookie) and report what came back.
//
//   node scripts/probe-site.mjs https://<the shop's address>
//
// Prints one JSON object: whether the home page, /api/status, /sitemap.xml and
// robots.txt answer, how long the home page took, how many products the site
// says it lists, and whether one product image loads. It only reads.

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

  const [home, status, sitemap, robots] = await Promise.all([get("/"), get("/api/status"), get("/sitemap.xml"), get("/robots.txt")]);
  let statusJson = null;
  try {
    statusJson = JSON.parse(status.body);
  } catch {
    statusJson = null;
  }
  const productUrls = [...sitemap.body.matchAll(/<loc>([^<]+\/products\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  const firstImage = /<img[^>]+src="([^"]+)"/.exec(home.body)?.[1] ?? "";
  let image = null;
  if (firstImage && !firstImage.startsWith("/static/")) {
    const result = await get(firstImage.replaceAll("&amp;", "&"));
    image = { url: new URL(firstImage.replaceAll("&amp;", "&"), origin).href, status: result.status, type: result.type };
  }

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
    },
    status: { status: status.status, ...(statusJson ?? {}) },
    sitemap: { status: sitemap.status, productUrls: productUrls.length },
    robots: { status: robots.status },
    image,
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
