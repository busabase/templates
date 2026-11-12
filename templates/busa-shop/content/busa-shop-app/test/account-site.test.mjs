// Buyer login and "My orders" (busa-shop 0.10.0), end to end through the
// DEPLOYED bundle (vendor/worker.js) against a fake Busabase whose app-user
// endpoints answer the way the platform's contract says: the email form, the
// code, the session cookie, My orders read through records/query (never the
// Orders table with the site key), sign-out, checkout writing Customer
// account, and a shop that keeps working when login is off or unknown.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState, SHOP_APP_NODE } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
const MIA = "mia.jensen@example.com";
const MIA_TOKEN = "mia-session-0123456789abcdefghijklmnopqrstuv";
const MIA_ID = "apu_mia";
const COOKIE = `busa_shop_session=${MIA_TOKEN}`;
let api;
let pristine;
let env;

const call = async (path, init = {}) => {
  const response = await worker.fetch(new Request(new URL(path, SITE), init), env, { waitUntil: () => {} });
  const text = await response.text();
  return { response, status: response.status, text, cookies: response.headers.getSetCookie() };
};
const form = (path, fields, headers = {}) =>
  call(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE, ...headers }, body: new URLSearchParams(fields).toString() });

const appUserCalls = (endpoint) => api.log.filter((entry) => entry.path.startsWith("/api/v1/app-users/") && entry.path.endsWith(endpoint));

const checkout = (overrides = {}) => ({
  orderId: "ORD-7K2M9QX4PT",
  name: "Mia Jensen",
  email: MIA,
  phone: "+45 12 34 56 78",
  country: "DK",
  address1: "Eksempelvej 7",
  city: "Aarhus",
  postalCode: "8000",
  items: [
    { productId: "tt-walking-robot", quantity: 2 },
    { productId: "tt-rainbow-blocks", quantity: 1 },
  ],
  expectedTotal: 78.4,
  ...overrides,
});
const postOrder = (body, headers = {}) =>
  call("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: SITE, ...headers }, body: JSON.stringify(body) });

/** One of Mia's orders the way records/query returns it: the whole row, staff-only columns included. */
const miaOrder = {
  id: "rec_order_mia",
  createdAt: "2026-11-02T09:00:00.000Z",
  updatedAt: "2026-11-03T09:00:00.000Z",
  fields: {
    title: "ORD-9D4TB7W1XE · Mia Jensen",
    "order-id": "ORD-9D4TB7W1XE",
    status: "shipped",
    "created-at": "2026-11-02T09:00:00.000Z",
    items: JSON.stringify([{ product_id: "tt-cuddle-bear", sku: "TT-PLS-04", name: "Cuddle Bear Plush", quantity: 3, unit_price: 15, line_total: 45 }]),
    "items-summary": "3 × Cuddle Bear Plush (TT-PLS-04) @ 15.00 USD = 45.00 USD",
    total: 54.9,
    currency: "USD",
    "customer-account": MIA_ID,
    "internal-note": "STAFF-ONLY-NOTE customer was rude",
    "reply-draft": "REPLY-DRAFT-TEXT",
    "tracking-number": "TRACK-SECRET-0001",
    "payment-log": "PAYMENT-LOG-LINE",
    "email-log": "EMAIL-LOG-LINE",
    "paypal-capture-id": "CAPTURE-ID-XYZ",
    "shipping-address": "SHIP-ADDRESS-BLOCK",
    cost: "COST-PRICE-9",
  },
};

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop" });
  pristine.nodes = [...pristine.nodes, SHOP_APP_NODE];
});

beforeEach(() => {
  Object.assign(api.state, structuredClone(pristine));
  api.state.records.bas_orders = [];
  api.state.appUsers = {
    settings: { [SHOP_APP_NODE.id]: { enabled: true, appName: "Tumbleberry Toys", ownerFields: { bas_orders: "customer-account" } } },
    byEmail: { [MIA]: { id: MIA_ID, code: "123456", token: MIA_TOKEN } },
    records: { [MIA_ID]: [miaOrder] },
    answers: {},
  };
  api.log.length = 0;
  api.reset();
  // A fresh env per test is a fresh Worker: nothing cached from the test before.
  env = { BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo", BUSABASE_AIRAPP_RUNTIME: "site" };
});

after(() => api.close());

describe("buyer login", () => {
  it("signed out, /account asks for an email, and the header links to it", async () => {
    const page = await call("/account");
    assert.equal(page.status, 200);
    assert.match(page.text, /<form class="account-form" method="post" action="\/account\/send-code">/);
    assert.match(page.text, /name="email" type="email"/);
    assert.match(page.text, /<meta name="robots" content="noindex">/);
    assert.equal(page.response.headers.get("cache-control"), "no-store");
    const home = await call("/");
    assert.match(home.text, /<a class="account-link" href="\/account">Account<\/a>/);
    const settings = appUserCalls("/settings");
    assert.equal(settings.length, 1, "the settings answer is cached");
    assert.equal(settings[0].path, `/api/v1/app-users/apps/${SHOP_APP_NODE.id}/settings`);
    assert.equal(settings[0].auth, `Bearer ${TEST_KEY}`);
    assert.equal(settings[0].space, "spc_demo");
  });

  it("send-code passes the email on and the code form says to check the inbox (and spam)", async () => {
    const sent = await form("/account/send-code", { email: "  Mia.Jensen@Example.com " });
    assert.equal(sent.status, 303);
    assert.equal(sent.response.headers.get("location"), "/account");
    const pending = sent.cookies.find((cookie) => cookie.startsWith("busa_shop_login="));
    assert.ok(pending, "the email the code went to is kept for the code form");
    assert.match(pending, /HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=900/);
    const [request] = appUserCalls("/send-code");
    assert.deepEqual(JSON.parse(request.body), { appId: SHOP_APP_NODE.id, email: MIA, locale: "en" });
    assert.equal(request.auth, `Bearer ${TEST_KEY}`);
    assert.equal(request.space, "spc_demo");

    const codeForm = await call("/account", { headers: { cookie: pending.split(";")[0] } });
    assert.equal(codeForm.status, 200);
    assert.match(codeForm.text, /We sent a 6-digit code to mia\.jensen@example\.com/);
    assert.match(codeForm.text, /spam/);
    assert.match(codeForm.text, /action="\/account\/verify"/);
    assert.match(codeForm.text, /autocomplete="one-time-code"/);
  });

  it("refuses an address that is not an email without asking Busabase", async () => {
    const page = await form("/account/send-code", { email: "not-an-email" });
    assert.equal(page.status, 400);
    assert.match(page.text, /valid email address/);
    assert.equal(appUserCalls("/send-code").length, 0);
  });

  it("a code asked for too soon says how many seconds to wait", async () => {
    api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 42, reason: "cooldown" } };
    const page = await form("/account/send-code", { email: MIA });
    assert.equal(page.status, 429);
    assert.match(page.text, /wait 42 seconds/);
    assert.match(page.text, /action="\/account\/verify"/, "the code sent before still works");
    api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 3600, reason: "email_daily_limit" } };
    assert.match((await form("/account/send-code", { email: MIA })).text, /Too many codes were sent to this address today/);
    api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 3600, reason: "space_daily_limit" } };
    assert.match((await form("/account/send-code", { email: MIA })).text, /cannot send more sign-in codes today/);
  });

  it("the right code sets the session cookie and goes to My orders", async () => {
    const signedIn = await form("/account/verify", { email: MIA, code: "123 456" });
    assert.equal(signedIn.status, 303);
    assert.equal(signedIn.response.headers.get("location"), "/account");
    assert.ok(signedIn.cookies.includes(`busa_shop_session=${MIA_TOKEN}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`), signedIn.cookies.join("\n"));
    assert.ok(signedIn.cookies.some((cookie) => /^busa_shop_login=;.*Max-Age=0$/.test(cookie)), "the pending email is forgotten");
    assert.deepEqual(JSON.parse(appUserCalls("/verify")[0].body), { appId: SHOP_APP_NODE.id, email: MIA, code: "123456" });
  });

  it("a wrong code says how many tries are left; an expired one says to ask again", async () => {
    const wrong = await form("/account/verify", { email: MIA, code: "000000" });
    assert.equal(wrong.status, 400);
    assert.match(wrong.text, /That code is not right\. You have 4 more tries\./);
    assert.ok(!wrong.cookies.some((cookie) => cookie.startsWith("busa_shop_session=")), "no session");
    api.state.appUsers.answers.verify = { status: 400, body: { code: "INVALID_CODE", attemptsLeft: 1 } };
    assert.match((await form("/account/verify", { email: MIA, code: "000000" })).text, /You have 1 more try\./);
    api.state.appUsers.answers.verify = { status: 400, body: { code: "INVALID_CODE", attemptsLeft: 0 } };
    assert.match((await form("/account/verify", { email: MIA, code: "000000" })).text, /cannot be tried again\. Ask for a new code\./);
    api.state.appUsers.answers.verify = { status: 410, body: { code: "CODE_EXPIRED" } };
    const expired = await form("/account/verify", { email: MIA, code: "123456" });
    assert.equal(expired.status, 410);
    assert.match(expired.text, /expired or was already used/);
    api.state.appUsers.answers.verify = { status: 403, body: { code: "APP_USER_DISABLED" } };
    const disabled = await form("/account/verify", { email: MIA, code: "123456" });
    assert.equal(disabled.status, 403);
    assert.match(disabled.text, /This account has been disabled/);
    const letters = await form("/account/verify", { email: MIA, code: "12ab56" });
    assert.equal(letters.status, 400);
    assert.match(letters.text, /6 digits/);
  });

  it("signed in, My orders shows what records/query returns, and only the buyer's columns", async () => {
    const page = await call("/account", { headers: { cookie: COOKIE } });
    assert.equal(page.status, 200);
    assert.match(page.text, /<h1>My orders<\/h1>/);
    assert.match(page.text, /Signed in as mia\.jensen@example\.com/);
    assert.match(page.text, /<a href="\/pay\/ORD-9D4TB7W1XE">ORD-9D4TB7W1XE<\/a>/);
    assert.match(page.text, /3 × Cuddle Bear Plush/);
    assert.match(page.text, /54\.90/);
    assert.match(page.text, /Shipped/);
    assert.match(page.text, /Nov 2, 2026/);
    for (const hidden of ["STAFF-ONLY-NOTE", "REPLY-DRAFT-TEXT", "TRACK-SECRET-0001", "PAYMENT-LOG-LINE", "EMAIL-LOG-LINE", "CAPTURE-ID-XYZ", "SHIP-ADDRESS-BLOCK", "COST-PRICE-9", MIA_ID, MIA_TOKEN]) {
      assert.ok(!page.text.includes(hidden), `${hidden} must not reach the page`);
    }
    const [query] = appUserCalls("/records/query");
    assert.equal(query.method, "POST");
    assert.equal(query.session, MIA_TOKEN);
    assert.equal(query.auth, `Bearer ${TEST_KEY}`);
    assert.deepEqual(JSON.parse(query.body), { appId: SHOP_APP_NODE.id, baseId: "bas_orders", limit: 20 });
    // Never the Orders table with the site's key, filtered here.
    assert.ok(!api.log.some((entry) => entry.query?.baseId === "bas_orders"), "the Orders table itself is not read");
  });

  it("an older page of orders follows Busabase's cursor", async () => {
    api.state.appUsers.nextCursor = "c_20";
    const first = await call("/account", { headers: { cookie: COOKIE } });
    assert.match(first.text, /href="\/account\?cursor=c_20">Older orders/);
    api.log.length = 0;
    await call("/account?cursor=c_20", { headers: { cookie: COOKIE } });
    assert.equal(JSON.parse(appUserCalls("/records/query")[0].body).cursor, "c_20");
  });

  it("no orders yet says so; an owner field Busabase does not know says the orders cannot be shown", async () => {
    api.state.appUsers.records = {};
    assert.match((await call("/account", { headers: { cookie: COOKIE } })).text, /No orders yet/);
    api.state.appUsers.answers["records/query"] = { status: 403, body: { code: "NO_OWNER_FIELD" } };
    const page = await call("/account", { headers: { cookie: COOKIE } });
    assert.equal(page.status, 200);
    assert.match(page.text, /cannot be shown just now/);
  });

  it("an ended session clears the cookie and asks to sign in again", async () => {
    const page = await call("/account", { headers: { cookie: "busa_shop_session=revoked-session-0123456789abcdef" } });
    assert.equal(page.status, 200);
    assert.match(page.text, /sign-in has ended/);
    assert.match(page.text, /action="\/account\/send-code"/);
    assert.ok(page.cookies.some((cookie) => /^busa_shop_session=;.*Max-Age=0$/.test(cookie)));
  });

  it("sign-out ends the session on Busabase and clears the cookie", async () => {
    const out = await form("/account/sign-out", {}, { cookie: COOKIE });
    assert.equal(out.status, 303);
    assert.equal(out.response.headers.get("location"), "/account?notice=signed-out");
    assert.ok(out.cookies.includes("busa_shop_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"), out.cookies.join("\n"));
    const [request] = appUserCalls("/sign-out");
    assert.equal(request.session, MIA_TOKEN);
    assert.deepEqual(JSON.parse(request.body), { appId: SHOP_APP_NODE.id });
    assert.match((await call("/account?notice=signed-out")).text, /You are signed out\./);
  });

  it("refuses a form posted from another site", async () => {
    const page = await form("/account/send-code", { email: MIA }, { origin: "https://evil.example" });
    assert.equal(page.status, 403);
    assert.equal(appUserCalls("/send-code").length, 0);
    assert.equal((await form("/account/sign-out", {}, { origin: "https://evil.example", cookie: COOKIE })).status, 403);
  });
});

describe("checkout and buyer login", () => {
  it("signed in, the order is written with Customer account = the buyer's id", async () => {
    const page = await call("/order", { headers: { cookie: COOKIE } });
    assert.match(page.text, /Signed in as mia\.jensen@example\.com: this order will appear under My orders\./);
    const saved = await postOrder(checkout(), { cookie: COOKIE });
    assert.equal(saved.status, 200, saved.text);
    const row = api.state.records.bas_orders.find((candidate) => candidate.fields["order-id"] === "ORD-7K2M9QX4PT");
    assert.equal(row.fields["customer-account"], MIA_ID);
  });

  it("a guest order (no cookie, or a session Busabase does not know) has no Customer account", async () => {
    const guest = await postOrder(checkout());
    assert.equal(guest.status, 200, guest.text);
    assert.equal("customer-account" in api.state.records.bas_orders[0].fields, false);
    const forged = await postOrder(checkout({ orderId: "ORD-7K2M9QX4PV" }), { cookie: "busa_shop_session=someone-elses-0123456789abcdef" });
    assert.equal(forged.status, 200, forged.text);
    assert.equal("customer-account" in api.state.records.bas_orders[1].fields, false);
    // A form field can never set it.
    const sneaky = await postOrder({ ...checkout({ orderId: "ORD-7K2M9QX4PW" }), "customer-account": MIA_ID, customerAccount: MIA_ID });
    assert.equal(sneaky.status, 200, sneaky.text);
    assert.equal("customer-account" in api.state.records.bas_orders[2].fields, false);
  });

  it("the pay page still opens by order id, with or without a session", async () => {
    await postOrder(checkout());
    for (const headers of [{}, { cookie: COOKIE }]) {
      const pay = await call("/pay/ORD-7K2M9QX4PT", { headers });
      assert.equal(pay.status, 200);
      assert.match(pay.text, /ORD-7K2M9QX4PT/);
    }
  });
});

describe("when buyer login is off or unknown, the shop works without it", () => {
  const offCases = {
    "switched off in Busabase": () => {
      api.state.appUsers.settings[SHOP_APP_NODE.id] = { enabled: false };
    },
    "an older Busabase without app users (404)": () => {
      api.state.appUsers = undefined;
    },
    "Busabase failing on the settings": () => {
      api.state.appUsers.answers.settings = { status: 500, body: { code: "INTERNAL" } };
    },
    "no Shop Website node to sign in to": () => {
      api.state.nodes = api.state.nodes.filter((node) => node.id !== SHOP_APP_NODE.id);
    },
  };
  for (const [name, arrange] of Object.entries(offCases)) {
    it(name, async () => {
      arrange();
      const home = await call("/");
      assert.equal(home.status, 200);
      assert.doesNotMatch(home.text, /account-link|href="\/account"/);
      const account = await call("/account", { headers: { cookie: COOKIE } });
      assert.equal(account.status, 404);
      assert.match(account.text, /Customer accounts are not available/);
      assert.match(account.text, /You can still order as usual/);
      assert.doesNotMatch(account.text, /<form/);
      const sent = await form("/account/send-code", { email: MIA });
      assert.equal(sent.status, 404);
      assert.equal(appUserCalls("/send-code").length, 0);
      const order = await call("/order", { headers: { cookie: COOKIE } });
      assert.equal(order.status, 200);
      assert.doesNotMatch(order.text, /href="\/account"/);
      const saved = await postOrder(checkout(), { cookie: COOKIE });
      assert.equal(saved.status, 200, saved.text);
      assert.equal("customer-account" in api.state.records.bas_orders[0].fields, false);
      assert.equal(appUserCalls("/session").length, 0, "no session lookup while login is off");
    });
  }

  it("the browser engine (no key) never calls the app-user endpoints", async () => {
    api.options.viewerSession = true;
    env = { BUSABASE_BASE_URL: api.origin, BUSABASE_AIRAPP_RUNTIME: "browser" };
    try {
      const home = await call("/");
      assert.equal(home.status, 200);
      assert.doesNotMatch(home.text, /account-link/);
      assert.equal((await call("/account")).status, 404);
      assert.equal(api.log.filter((entry) => entry.path.startsWith("/api/v1/app-users/")).length, 0);
    } finally {
      api.options.viewerSession = false;
    }
  });

  it("Busabase switching login off between pages shows the not-available page on send-code", async () => {
    await call("/account");
    api.state.appUsers.answers["send-code"] = { status: 403, body: { code: "APP_LOGIN_DISABLED" } };
    const page = await form("/account/send-code", { email: MIA });
    assert.equal(page.status, 404);
    assert.match(page.text, /Customer accounts are not available/);
  });

  it("/api/status says whether buyer login is on", async () => {
    assert.equal(JSON.parse((await call("/api/status")).text).accounts, "on");
    api.state.appUsers.settings[SHOP_APP_NODE.id] = { enabled: false };
    env = { ...env };
    assert.equal(JSON.parse((await call("/api/status")).text).accounts, "disabled");
  });
});
