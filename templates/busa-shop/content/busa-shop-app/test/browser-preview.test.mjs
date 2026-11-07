// scripts/browser-preview.mjs, the `start` command Busabase runs on the browser
// engine (a Free space). It is started here as its own process, the way the
// engine starts it, with `location` defined as the browser gives it and no key
// or space in the environment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startFakeBusabase } from "./fake-busabase.mjs";
import { demoState } from "./fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// The engine finds the preview port in the log with this pattern (Busabase's
// airapp-runtime-descriptor `COMMON_READY_PATTERNS`).
const READY = /listening on port\s*:?\s*(\d{2,5})/i;

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

let api;
let child;
let preview;
let output = "";

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  Object.assign(api.state, await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}` }));
  api.options.viewerSession = true;
  const port = await freePort();
  const location = `globalThis.location = new URL(${JSON.stringify(`${api.origin}/dashboard/spc_demo/airapp/busa-shop-app`)});`;
  child = spawn(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(location)}`, "scripts/browser-preview.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH, PORT: String(port), BUSABASE_AIRAPP_RUNTIME: "browser" },
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ready line in 15 s:\n${output}`)), 15_000);
    const onData = (chunk) => {
      output += chunk;
      const match = READY.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`exited with ${code}:\n${output}`)));
  });
  preview = `http://127.0.0.1:${ready}`;
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
  await api?.close();
});

describe("browser-preview.mjs", () => {
  it("says which engine it runs on, in a line the engine reads the port from", () => {
    assert.match(output, /private preview on the browser engine, listening on port \d+/);
    assert.match(output, /Nothing is published; there is no Go live here\./);
  });

  it("reads the workspace at location.origin with no key and no space header, products in ref order", async () => {
    const response = await fetch(`${preview}/`);
    assert.equal(response.status, 200);
    const text = await response.text();
    const cards = [...text.matchAll(/<li class="card">[\s\S]*?<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
    assert.equal(cards[0], "Walking Robot Buddy");
    assert.equal(cards.at(-1), "Bubble Machine");
    assert.ok(api.log.length > 0);
    assert.ok(api.log.every((entry) => entry.auth === "" && entry.space === ""), "the viewer's session, never a key");
  });

  it("saves an order request as one Orders row", async () => {
    const response = await fetch(`${preview}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: "ORD-BRWSR7PRVW",
        name: "Mia Jensen",
        email: "mia.jensen@example.com",
        phone: "+45 12 34 56 78",
        country: "DK",
        address1: "Eksempelvej 7",
        city: "Aarhus",
        postalCode: "8000",
        items: [{ productId: "tt-walking-robot", quantity: 1 }],
        expectedTotal: 24,
      }),
    });
    assert.deepEqual(await response.json(), { ok: true, orderId: "ORD-BRWSR7PRVW", payment: "request" });
    assert.equal(api.state.records.bas_orders.length, 1);
    assert.equal(api.state.records.bas_orders[0].fields["order-id"], "ORD-BRWSR7PRVW");
  });

  it("takes order requests even when Settings turn PayPal and email on, and never asks for the Vault", async () => {
    const settings = api.state.records.bas_settings[0].fields;
    Object.assign(settings, { "paypal-mode": "sandbox", "paypal-client-id": "AbCdEf123", "smtp-host": "smtp.example.com", "smtp-username": "shop@example.com" });
    try {
      // A fresh env (the cache is per env), the way a new preview starts.
      const { default: worker } = await import("../vendor/worker.js");
      const env = { BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: "", BUSABASE_SPACE_ID: "" };
      const page = await (await worker.fetch(new Request("http://preview.local/order?add=tt-walking-robot"), env, { waitUntil() {} })).text();
      assert.match(page, /data-submit>Send order request</);
      assert.match(page, /"payment":"request"/);
      assert.match(page, /For the shop owner · 店主可见/, "the owner sees why there is no PayPal here");
      assert.match(page, /need the Website engine \(Busabase Plus and higher\)/);
      assert.doesNotMatch(page, /data-submit>Continue to payment|paypal\.com/);
      const status = JSON.parse(await (await worker.fetch(new Request("http://preview.local/api/status"), env, { waitUntil() {} })).text());
      assert.equal(status.payments, "requests");
      assert.equal(status.paymentsNote, "browser-engine");
      assert.equal(status.email, "browser-engine");
      assert.ok(!api.log.some((entry) => entry.path === "/api/v1/vault/runtime"), "the browser engine never reads the Vault");
    } finally {
      Object.assign(settings, { "paypal-mode": "off", "paypal-client-id": "", "smtp-host": "", "smtp-username": "" });
    }
  });

  it("reads the workspace once for several page views (one env for the server's life)", async () => {
    const before = api.log.filter((entry) => entry.path === "/api/v1/nodes").length;
    for (const path of ["/", "/products/tt-walking-robot", "/order", "/api/status"]) await (await fetch(`${preview}${path}`)).text();
    assert.equal(api.log.filter((entry) => entry.path === "/api/v1/nodes").length, before);
  });
});
