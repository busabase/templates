// Exercise the deployed Worker bundle against the ordinary fake Busabase HTTP
// server, including Workers for Platforms' restricted default Cache API.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
const routes = [
  ["product image", "/images/tt-walking-robot/0"],
  ["blog cover", "/blog-covers/first-robot-toy-for-a-three-year-old"],
];
let api;
let pristine;
let env;

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop", blog: true });
  pristine.records.bas_posts[0].fields["cover-image"] = [{
    id: "att_cover", url: `${api.origin}/api/assets/robot-cover/raw`, mimeType: "image/svg+xml",
  }];
  pristine.assets["robot-cover"] = { type: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'><title>Demo blog cover</title></svg>" };
});
after(() => api.close());
beforeEach(() => {
  Object.assign(api.state, structuredClone(pristine));
  api.log.length = 0;
  env = { BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo", BUSABASE_AIRAPP_RUNTIME: "site" };
});
afterEach(() => {
  if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
  else delete globalThis.caches;
});

const installCache = (failure) => {
  const entries = new Map();
  const names = [];
  let defaultReads = 0;
  let puts = 0;
  const cache = {
    async match(request) {
      if (failure === "match") throw new Error("Named cache temporarily unavailable");
      return entries.get(request.url)?.clone();
    },
    put(request, response) {
      puts += 1;
      if (failure === "put-sync") throw new Error("Synchronous cache write refusal");
      if (failure === "put-async") return Promise.reject(new Error("Cache write unavailable"));
      entries.set(request.url, response.clone());
      return Promise.resolve();
    },
  };
  Object.defineProperty(globalThis, "caches", { configurable: true, value: {
    get default() {
      defaultReads += 1;
      return { match: async () => { throw new Error("This Worker is not permitted to access the default cache."); } };
    },
    async open(name) {
      names.push(name);
      if (failure === "open") throw new Error("Named caches not offered here");
      return cache;
    },
  } });
  return { entries, names, defaultReads: () => defaultReads, puts: () => puts };
};

const call = async (route) => {
  const pending = [];
  const response = await worker.fetch(new Request(new URL(route, SITE)), env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  return response;
};
const assertImage = async (response) => {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
  assert.match(await response.text(), /<svg/);
};
const assetReads = () => api.log.filter((entry) => entry.path.startsWith("/assets/") || entry.path.startsWith("/api/assets/")).length;

describe("image caching on an isolated Website Worker", () => {
  for (const [label, route] of routes) {
    it(`${label}: serves and reuses a named cache while the default cache is forbidden`, async () => {
      const cache = installCache();
      await assertImage(await call(route));
      const firstReads = assetReads();
      assert.ok(firstReads > 0, "a cache miss reads the real image route on the fake HTTP server");
      await assertImage(await call(route));
      assert.equal(assetReads(), firstReads, "a cache hit does not fetch the image again");
      assert.equal(cache.puts(), 1);
      assert.deepEqual(cache.names, ["busa-shop-images-v1", "busa-shop-images-v1"]);
      assert.equal(cache.defaultReads(), 0, "the restricted default cache is never accessed");
    });

    for (const failure of ["open", "match", "put-sync", "put-async"]) {
      it(`${label}: serves the image when cache ${failure} fails`, async () => {
        installCache(failure);
        await assertImage(await call(route));
      });
    }

    it(`${label}: still runs in a browser or Node runtime with no Cache API`, async () => {
      delete globalThis.caches;
      await assertImage(await call(route));
    });
  }
});
