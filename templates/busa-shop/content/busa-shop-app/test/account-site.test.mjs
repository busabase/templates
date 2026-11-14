// Buyer login and "My orders" (busa-shop 0.10.0; abuse protection 0.10.1), end to end through the
// DEPLOYED bundle (vendor/worker.js) against a fake Busabase whose app-user
// endpoints answer the way the platform's contract says: the email form, the
// code, the session cookie, My orders read through records/query (never the
// Orders table with the site key), sign-out, checkout writing Customer
// account, and a shop that keeps working when login is off or unknown.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
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

// The Worker reads Date.now(); tests move it forward instead of sleeping.
const realNow = Date.now;
let clockOffset = 0;

/** The send-code form's hidden fields as the page rendered them (the signed render time). */
const renderedForm = async (headers = {}) => {
  const page = await call("/account", { headers });
  return Object.fromEntries([...page.text.matchAll(/<input type="hidden" name="(form_time)" value="([^"]+)">/g)].map((match) => [match[1], match[2]]));
};

/** What a person does: open /account, take a couple of seconds to type, send. The honeypot goes along empty, as a browser sends it. */
const sendCode = async (fields, headers = {}, { typingMs = 2000 } = {}) => {
  const hidden = await renderedForm();
  clockOffset += typingMs;
  api.log.length = 0;
  return form("/account/send-code", { ...hidden, referral: "", ...fields }, headers);
};

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
  clockOffset = 0;
  Date.now = () => realNow() + clockOffset;
  // A fresh env per test is a fresh Worker: nothing cached from the test before.
  env = { BUSABASE_BASE_URL: api.origin, BUSABASE_API_KEY: TEST_KEY, BUSABASE_SPACE_ID: "spc_demo", BUSABASE_AIRAPP_RUNTIME: "site" };
});

afterEach(() => {
  Date.now = realNow;
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
    const sent = await sendCode({ email: "  Mia.Jensen@Example.com " });
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
    const page = await sendCode({ email: MIA });
    assert.equal(page.status, 429);
    assert.match(page.text, /wait 42 seconds/);
    assert.match(page.text, /action="\/account\/verify"/, "the code sent before still works");
    api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 3600, reason: "email_daily_limit" } };
    assert.match((await sendCode({ email: MIA })).text, /Too many codes were sent to this address today/);
    api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 3600, reason: "space_daily_limit" } };
    assert.match((await sendCode({ email: MIA })).text, /cannot send more sign-in codes today/);
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

describe("send-code abuse protection (busa-shop 0.10.1)", () => {
  const sentIp = () => {
    const calls = appUserCalls("/send-code");
    assert.equal(calls.length, 1, "Busabase was asked once");
    return calls[0].ip;
  };

  it("forwards CF-Connecting-IP, preferred over X-Forwarded-For", async () => {
    const sent = await sendCode({ email: MIA }, { "cf-connecting-ip": "198.51.100.23", "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    assert.equal(sent.status, 303);
    assert.equal(sentIp(), "198.51.100.23");
  });

  it("without CF-Connecting-IP, forwards the first X-Forwarded-For hop", async () => {
    await sendCode({ email: MIA }, { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1, 172.16.0.9" });
    assert.equal(sentIp(), "203.0.113.7");
    await sendCode({ email: MIA }, { "x-forwarded-for": "2001:db8::1, 10.0.0.1" });
    assert.equal(sentIp(), "2001:db8::1");
  });

  it("with neither header, sends no IP header at all", async () => {
    await sendCode({ email: MIA });
    assert.equal(sentIp(), null);
  });

  it("never takes the IP from the form body", async () => {
    await sendCode({ email: MIA, ip: "192.0.2.66", "x-busabase-app-user-ip": "192.0.2.66", "cf-connecting-ip": "192.0.2.66" });
    assert.equal(sentIp(), null);
    await sendCode({ email: MIA, ip: "192.0.2.66" }, { "cf-connecting-ip": "198.51.100.23" });
    assert.equal(sentIp(), "198.51.100.23");
    // Junk in the header is not passed on either.
    await sendCode({ email: MIA }, { "cf-connecting-ip": "<script>", "x-forwarded-for": "not an ip" });
    assert.equal(sentIp(), null);
  });

  it("sends the shop's language as locale", async () => {
    api.state.records.bas_settings[0].fields.language = "de";
    const sent = await sendCode({ email: MIA });
    assert.equal(sent.status, 303);
    assert.equal(JSON.parse(appUserCalls("/send-code")[0].body).locale, "de");
  });

  it("explains the per-network limits, in every language", async () => {
    const expected = {
      en: [/from your network in the last hour\. Please try again in about 45 minutes\./, /from your network today\. Please try again tomorrow/],
      de: [/in der letzten Stunde zu viele Anmeldecodes angefordert\. Bitte versuchen Sie es in etwa 45 Minuten/, /heute zu viele Anmeldecodes angefordert/],
      fr: [/au cours de la dernière heure\. Réessayez dans environ 45 minutes/, /depuis votre réseau aujourd(&#39;|')hui/],
      es: [/en la última hora\. Inténtalo de nuevo en unos 45 minutos/, /desde tu red hoy/],
    };
    for (const [language, [hourly, daily]] of Object.entries(expected)) {
      api.state.records.bas_settings[0].fields.language = language;
      env = { ...env };
      api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 2700, reason: "ip_hourly_limit" } };
      const hourlyPage = await sendCode({ email: MIA });
      assert.equal(hourlyPage.status, 429);
      assert.match(hourlyPage.text, hourly, language);
      assert.match(hourlyPage.text, /action="\/account\/send-code"/, "the email form, to try again later");
      api.state.appUsers.answers["send-code"] = { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 50000, reason: "ip_daily_limit" } };
      const dailyPage = await sendCode({ email: MIA });
      assert.equal(dailyPage.status, 429);
      assert.match(dailyPage.text, daily, language);
      assert.doesNotMatch(dailyPage.text, /wait \d+ seconds/, "not the cooldown message");
    }
  });

  it("the email form has a hidden honeypot and a signed render time, and needs no JavaScript", async () => {
    const page = await call("/account");
    const formHtml = /<form class="account-form" method="post" action="\/account\/send-code">([\s\S]*?)<\/form>/.exec(page.text)[1];
    assert.match(formHtml, /<div class="account-extra" aria-hidden="true"><label>Leave this field empty<input name="referral" type="text" tabindex="-1" autocomplete="off" value=""><\/label><\/div>/);
    assert.match(formHtml, /<input type="hidden" name="form_time" value="\d+\.[A-Za-z0-9_-]{43}">/);
    assert.doesNotMatch(formHtml, /<script/);
    const css = await readFile(new URL("../public/static/shop.css", import.meta.url), "utf8");
    assert.match(css, /\.account-extra \{[^}]*position: absolute;[^}]*left: -10000px;[^}]*overflow: hidden;/, "off-screen for everyone");
  });

  it("a filled honeypot gets the same answer as a sent code, and Busabase is not asked", async () => {
    const real = await sendCode({ email: MIA });
    const bot = await sendCode({ email: MIA, referral: "https://spam.example" });
    assert.equal(appUserCalls("/send-code").length, 0, "no code sent for the bot");
    assert.equal(bot.status, real.status);
    assert.equal(bot.response.headers.get("location"), real.response.headers.get("location"));
    assert.deepEqual(bot.cookies, real.cookies);
    assert.equal(bot.text, real.text);
    const next = await call("/account", { headers: { cookie: bot.cookies[0].split(";")[0] } });
    assert.match(next.text, /We sent a 6-digit code to mia\.jensen@example\.com/);
  });

  it("a post faster than 1.5 s after the page was shown gets the fake success, and Busabase is not asked", async () => {
    const fast = await sendCode({ email: MIA }, {}, { typingMs: 300 });
    assert.equal(fast.status, 303);
    assert.equal(fast.response.headers.get("location"), "/account");
    assert.ok(fast.cookies.some((cookie) => cookie.startsWith("busa_shop_login=")));
    assert.equal(appUserCalls("/send-code").length, 0);
  });

  it("a person who takes 2 s gets a real code", async () => {
    const sent = await sendCode({ email: MIA }, {}, { typingMs: 2000 });
    assert.equal(sent.status, 303);
    assert.equal(appUserCalls("/send-code").length, 1);
  });

  it("a missing, forged or hours-old render time shows the form again with a fresh one, and Busabase is not asked", async () => {
    const hidden = await renderedForm();
    const [ms] = hidden.form_time.split(".");
    clockOffset += 5000;
    for (const fields of [{}, { form_time: `${ms}.${"A".repeat(43)}` }, { form_time: `${Number(ms) - 60000}.${hidden.form_time.split(".")[1]}` }, { form_time: "garbage" }]) {
      api.log.length = 0;
      const page = await form("/account/send-code", { email: MIA, referral: "", ...fields });
      assert.equal(page.status, 400, JSON.stringify(fields));
      assert.match(page.text, /This page was open for a while/);
      assert.match(page.text, /name="form_time" value="\d+\./);
      assert.match(page.text, /value="mia\.jensen@example\.com"/, "the email is kept");
      assert.equal(appUserCalls("/send-code").length, 0);
    }
    clockOffset += 7 * 60 * 60 * 1000;
    const stale = await form("/account/send-code", { email: MIA, referral: "", ...hidden });
    assert.equal(stale.status, 400);
    assert.equal(appUserCalls("/send-code").length, 0);
  });

  it("the code page's 'Send a new code' carries a render time too", async () => {
    const page = await call("/account", { headers: { cookie: `busa_shop_login=${encodeURIComponent(MIA)}` } });
    const resend = /<div class="account-more">\s*<form method="post" action="\/account\/send-code">([\s\S]*?)<\/form>/.exec(page.text)[1];
    const formTime = /name="form_time" value="([^"]+)"/.exec(resend)[1];
    clockOffset += 3000;
    api.log.length = 0;
    const sent = await form("/account/send-code", { email: MIA, form_time: formTime });
    assert.equal(sent.status, 303);
    assert.equal(appUserCalls("/send-code").length, 1);
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
      const sent = await sendCode({ email: MIA });
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
    const page = await sendCode({ email: MIA });
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
