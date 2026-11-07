// Checkout end to end, through the DEPLOYED bundle (vendor/worker.js), against
// a fake Busabase, the PayPal stand-in (test/fake-paypal.mjs) and a real SMTP
// server on localhost (test/fake-smtp.mjs): shipping by country, the order
// saved as awaiting payment, PayPal's order created and captured on the
// server, webhooks verified and applied once, the emails, the policy pages,
// and that no secret ever reaches a page, an answer or a log line.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createNodeSockets } from "../scripts/node-sockets.mjs";
import worker from "../vendor/worker.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { startFakePayPal } from "./fake-paypal.mjs";
import { startFakeSmtp } from "./fake-smtp.mjs";
import { demoState } from "./fixtures.mjs";

const SITE = "https://tumbleberry-toys.example";
const PAYPAL_SECRET = "mock-secret-1";
const SMTP_PASSWORD = "smtp-app-password-123";
let api;
let paypal;
let smtp;
let pristine;
let logged;
let pending = [];

const envFor = (overrides = {}) => ({
  BUSABASE_BASE_URL: api.origin,
  BUSABASE_API_KEY: TEST_KEY,
  BUSABASE_SPACE_ID: "spc_demo",
  BUSABASE_AIRAPP_RUNTIME: "site",
  SOCKETS: createNodeSockets(),
  PAYPAL_API_BASE: paypal.origin,
  PAYPAL_SDK_URL: paypal.sdkUrl,
  ...overrides,
});

// One env per test (a fresh Worker cache), and every waitUntil kept to await.
let env;
const ctx = () => ({ waitUntil: (promise) => pending.push(promise) });
const settle = async () => {
  while (pending.length) await Promise.all(pending.splice(0));
};
const call = async (path, init = {}, useEnv = env) => {
  const response = await worker.fetch(new Request(new URL(path, SITE), init), useEnv, ctx());
  const text = await response.text();
  return { response, status: response.status, text, json: () => JSON.parse(text) };
};
const post = (path, body, headers = {}) =>
  call(path, { method: "POST", headers: { "content-type": "application/json", origin: SITE, ...headers }, body: JSON.stringify(body) });

const checkout = (overrides = {}) => ({
  orderId: "ORD-7K2M9QX4PT",
  name: "Mia Jensen",
  email: "mia.jensen@example.com",
  phone: "+45 12 34 56 78",
  country: "DK",
  address1: "Eksempelvej 7",
  city: "Aarhus",
  postalCode: "8000",
  note: "Birthday present.",
  items: [
    { productId: "tt-walking-robot", quantity: 2 },
    { productId: "tt-rainbow-blocks", quantity: 1 },
  ],
  expectedTotal: 78.4,
  ...overrides,
});

const orderRow = (orderId = "ORD-7K2M9QX4PT") => api.state.records.bas_orders.find((row) => row.fields["order-id"] === orderId);
const settings = () => api.state.records.bas_settings[0].fields;

const turnOn = () =>
  Object.assign(settings(), {
    "paypal-mode": "sandbox",
    "paypal-client-id": paypal.clientId,
    "paypal-webhook-id": paypal.webhookId,
    "smtp-host": smtp.host,
    "smtp-port": smtp.port,
    "smtp-security": "none",
    "smtp-username": "",
    "email-from": "shop@tumbleberry.example",
    "notify-email": "owner@tumbleberry.example",
  });

/** Checkout → PayPal order → buyer approves → capture: what the browser does. */
const payFor = async (orderId = "ORD-7K2M9QX4PT", overrides = {}) => {
  assert.equal((await post("/api/orders", checkout({ orderId, ...overrides }))).status, 200);
  const created = (await post("/api/paypal/orders", { orderId })).json();
  paypal.approve(created.id);
  const captured = await post("/api/paypal/capture", { orderId, paypalOrderId: created.id });
  await settle();
  return { paypalOrderId: created.id, captured };
};

before(async () => {
  api = await startFakeBusabase({ nodes: [], records: {} });
  paypal = await startFakePayPal({ clientSecret: PAYPAL_SECRET });
  smtp = await startFakeSmtp();
  pristine = await demoState({ imageUrl: (file) => `${api.origin}/assets/${file}`, source: "shop" });
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level];
    console[level] = (...args) => {
      logged.push(args.map(String).join(" "));
      if (process.env.DEBUG_TESTS) original(...args);
    };
  }
});

beforeEach(async () => {
  // Emails a previous test left running in waitUntil land before the reset, not in this test.
  if (pending) await settle();
  paypal.reset();
  Object.assign(api.state, structuredClone(pristine));
  api.state.records.bas_orders = [];
  api.state.vault = { BUSA_SHOP_PAYPAL_CLIENT_SECRET: PAYPAL_SECRET, BUSA_SHOP_SMTP_PASSWORD: SMTP_PASSWORD, ANOTHER_APPS_TOKEN: "not-the-shops" };
  Object.assign(api.options, { failCreates: false, queueCreates: false, failReads: false, viewerSession: false, conflictOnce: undefined, conflictFields: undefined });
  api.log.length = 0;
  api.reset();
  paypal.log.length = 0;
  Object.assign(paypal.options, { declineNextCapture: false, pendingNextCapture: false, capturedAmount: null });
  smtp.messages.length = 0;
  logged = [];
  pending = [];
  turnOn();
  env = envFor();
});

after(async () => {
  await Promise.all([api.close(), paypal.close(), smtp.close()]);
});

describe("checkout with PayPal", () => {
  it("shows shipping by country and asks for a real delivery address", async () => {
    const { status, text } = await call("/order?add=tt-walking-robot");
    assert.equal(status, 200);
    assert.match(text, /<h1>Checkout<\/h1>/);
    assert.match(text, /data-submit>Continue to payment</);
    for (const name of ["name", "email", "phone", "address1", "address2", "city", "region", "postalCode"]) assert.match(text, new RegExp(`name="${name}"`));
    assert.match(text, /<option value="DK">Denmark<\/option>/);
    const data = JSON.parse(/<script type="application\/json" id="shop-data">(.*?)<\/script>/s.exec(text)[1]);
    assert.equal(data.payment, "paypal");
    assert.deepEqual(data.rates.DK, { cost: 11.9, freeOver: 90, estimate: "7–12 business days" });
    assert.ok(data.regionRequired.includes("US") && data.regionRequired.includes("CA"));
    assert.ok(!text.includes(PAYPAL_SECRET), "the secret never reaches a page");
    assert.doesNotMatch(text, /For the shop owner/, "visitors of a keyed site never see the owner's plan note");
  });

  it("saves the order as awaiting payment, then creates the PayPal order on the server with the order's own amount", async () => {
    const saved = await post("/api/orders", checkout({ expectedTotal: 78.4 }));
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual(saved.json(), { ok: true, orderId: "ORD-7K2M9QX4PT", payment: "paypal", payPath: "/pay/ORD-7K2M9QX4PT" });
    const row = orderRow().fields;
    assert.equal(row.status, "awaiting-payment");
    assert.equal(row["payment-method"], "paypal");
    assert.deepEqual([row.subtotal, row.shipping, row.total], [66.5, 11.9, 78.4]);
    assert.equal(row["shipping-address"], "Mia Jensen\nEksempelvej 7\n8000 Aarhus\nDenmark (DK)");
    assert.equal(smtp.messages.length, 0, "no email for an order nobody has paid yet");

    const created = await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT", amount: 0.01 });
    assert.equal(created.status, 200, created.text);
    const { id } = created.json();
    const sent = JSON.parse(paypal.log.find((entry) => entry.path === "/v2/checkout/orders").body);
    assert.equal(sent.purchase_units[0].amount.value, "78.40", "the browser's amount is ignored");
    assert.equal(sent.purchase_units[0].custom_id, "ORD-7K2M9QX4PT");
    assert.equal(sent.purchase_units[0].shipping.address.postal_code, "8000");
    assert.equal(paypal.log.find((entry) => entry.path === "/v2/checkout/orders").headers["paypal-request-id"], "ORD-7K2M9QX4PT-1");
    assert.equal(orderRow().fields["paypal-order-id"], id);
    assert.match(orderRow().fields["payment-log"], new RegExp(`created PayPal order ${id} \\(sandbox\\)`));
    // A second click on the PayPal button uses the same PayPal order.
    assert.equal((await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" })).json().id, id);
    assert.equal(paypal.log.filter((entry) => entry.method === "POST" && entry.path === "/v2/checkout/orders").length, 1);
  });

  it("the pay page shows the button, the total and nothing personal, with PayPal allowed only there", async () => {
    await post("/api/orders", checkout());
    const page = await call("/pay/ORD-7K2M9QX4PT");
    assert.equal(page.status, 200);
    assert.match(page.text, /Pay for your order/);
    assert.match(page.text, /\$78\.40/);
    assert.match(page.text, /data-paypal-buttons/);
    for (const personal of ["Mia Jensen", "mia.jensen@example.com", "Eksempelvej", "+45"]) assert.ok(!page.text.includes(personal), personal);
    const csp = page.response.headers.get("content-security-policy");
    assert.match(csp, /script-src 'self' https:\/\/\*\.paypal\.com/);
    assert.match(csp, /frame-src https:\/\/\*\.paypal\.com/);
    assert.ok(csp.includes(paypal.origin), "the SDK's own origin (the mock here)");
    assert.equal(page.response.headers.get("cache-control"), "no-store");
    assert.equal(page.response.headers.get("x-robots-tag"), "noindex");
    const home = await call("/");
    assert.doesNotMatch(home.response.headers.get("content-security-policy"), /paypal/, "every other page keeps the strict policy");
    assert.equal((await call("/pay/ORD-0000000000")).status, 404);
    assert.equal((await call("/pay/../../etc")).status, 404);
  });

  it("captures after approval, marks the order paid once, and sends the receipt and the owner's notice", async () => {
    const { paypalOrderId, captured } = await payFor();
    assert.equal(captured.status, 200, captured.text);
    assert.equal(captured.json().status, "paid");
    const row = orderRow().fields;
    assert.equal(row.status, "paid");
    assert.equal(row["amount-paid"], 78.4);
    assert.match(row["paypal-capture-id"], /^3C/);
    assert.equal(row["paypal-order-id"], paypalOrderId);
    assert.equal(row["payer-email"], "sandbox-buyer@example.com");
    assert.ok(Date.parse(row["paid-at"]));
    assert.deepEqual(smtp.messages.map((message) => [message.envelope.to[0], message.subject]), [
      ["mia.jensen@example.com", "Order ORD-7K2M9QX4PT confirmed: payment received"],
      ["owner@tumbleberry.example", "New paid order ORD-7K2M9QX4PT · $78.40"],
    ]);
    assert.match(smtp.messages[0].text, /PayPal transaction: 3C/);
    assert.match(row["email-log"], /sent payment-receipt to mia\.jensen@example\.com\n.*sent owner-paid to owner@tumbleberry\.example$/);
    // Paying again changes nothing and sends nothing.
    assert.equal((await post("/api/paypal/capture", { orderId: "ORD-7K2M9QX4PT", paypalOrderId })).json().status, "paid");
    await settle();
    assert.equal(smtp.messages.length, 2);
    // And the pay page now says so.
    assert.match((await call("/pay/ORD-7K2M9QX4PT")).text, /This order is paid\. Thank you!/);
  });

  it("applies a verified webhook once, and refuses one that is not PayPal's", async () => {
    const { paypalOrderId } = await payFor();
    const event = paypal.events.captureCompleted(paypalOrderId);
    const first = await paypal.deliver(`${SITE}/api/paypal/webhook`, event, { deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()) });
    assert.equal(first.status, 200);
    assert.match(orderRow().fields["payment-log"], new RegExp(`PayPal ${event.id} PAYMENT.CAPTURE.COMPLETED: capture .* \\(already marked paid\\)`));
    const again = await paypal.deliver(`${SITE}/api/paypal/webhook`, event, { deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()) });
    assert.deepEqual(await again.json(), { ok: true, duplicate: true });
    const before = JSON.stringify(orderRow().fields);
    const forged = await paypal.deliver(`${SITE}/api/paypal/webhook`, paypal.events.refunded(orderRow().fields["paypal-capture-id"], "78.40"), {
      tamper: true,
      deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()),
    });
    assert.equal(forged.status, 400);
    assert.equal(JSON.stringify(orderRow().fields), before, "nothing changed");
    await settle();
    assert.equal(smtp.messages.length, 2, "no second receipt");
    // Verified with PayPal using the raw bytes, and our webhook id.
    const verify = paypal.log.filter((entry) => entry.path === "/v1/notifications/verify-webhook-signature");
    assert.equal(verify.length, 3);
    assert.match(verify[0].body, new RegExp(`"webhook_id":"${paypal.webhookId}"`));
  });

  it("records refunds made in PayPal, found by the transaction id alone", async () => {
    await payFor();
    const captureId = orderRow().fields["paypal-capture-id"];
    const deliver = (event) => paypal.deliver(`${SITE}/api/paypal/webhook`, event, { deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()) });
    assert.equal((await deliver(paypal.events.refunded(captureId, "20.00"))).status, 200);
    assert.equal(orderRow().fields["refunded-amount"], 20);
    assert.equal(orderRow().fields.status, "paid", "a partial refund keeps it paid");
    assert.equal((await deliver(paypal.events.refunded(captureId, "58.40"))).status, 200);
    assert.equal(orderRow().fields["refunded-amount"], 78.4);
    assert.equal(orderRow().fields.status, "refunded");
  });

  it("a reversal or a denial makes it a payment problem, and tells the owner", async () => {
    const { paypalOrderId } = await payFor();
    smtp.messages.length = 0;
    const deliver = (event) => paypal.deliver(`${SITE}/api/paypal/webhook`, event, { deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()) });
    assert.equal((await deliver(paypal.events.reversed(orderRow().fields["paypal-capture-id"], "78.40"))).status, 200);
    await settle();
    assert.equal(orderRow().fields.status, "payment-problem");
    assert.match(orderRow().fields["payment-problem"], /reversed/);
    assert.deepEqual(smtp.messages.map((message) => message.subject), ["Payment problem on order ORD-7K2M9QX4PT"]);
    assert.ok(paypalOrderId);

    await post("/api/orders", checkout({ orderId: "ORD-3H8VQ2N6RA" }));
    const created = (await post("/api/paypal/orders", { orderId: "ORD-3H8VQ2N6RA" })).json();
    assert.equal((await deliver(paypal.events.captureDenied(created.id))).status, 200);
    assert.equal(orderRow("ORD-3H8VQ2N6RA").fields.status, "payment-problem");
  });

  it("a payment of the wrong amount is never 'paid'", async () => {
    paypal.options.capturedAmount = { value: "70.00", currency_code: "USD" };
    const { captured } = await payFor();
    assert.equal(captured.json().status, "problem");
    assert.equal(orderRow().fields.status, "payment-problem");
    assert.match(orderRow().fields["payment-problem"], /captured 70\.00 USD, but this order is 78\.4 USD/);
    assert.deepEqual(smtp.messages.map((message) => message.subject), ["Payment problem on order ORD-7K2M9QX4PT"], "no receipt");
  });

  it("a declined card lets the buyer try another way to pay, on the same order", async () => {
    await post("/api/orders", checkout());
    const created = (await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" })).json();
    paypal.approve(created.id);
    paypal.options.declineNextCapture = true;
    const declined = await post("/api/paypal/capture", { orderId: "ORD-7K2M9QX4PT", paypalOrderId: created.id });
    assert.equal(declined.status, 422);
    assert.deepEqual(declined.json(), { ok: false, error: "instrument_declined" });
    assert.equal(orderRow().fields.status, "awaiting-payment");
    const retried = await post("/api/paypal/capture", { orderId: "ORD-7K2M9QX4PT", paypalOrderId: created.id });
    assert.equal(retried.json().status, "paid");
    const requestIds = paypal.log.filter((entry) => entry.path.endsWith("/capture")).map((entry) => entry.headers["paypal-request-id"]);
    assert.equal(new Set(requestIds).size, 2, "a fresh request id for the second try, or PayPal would replay the decline");
  });

  it("captures from the webhook when the buyer closed the window after approving", async () => {
    await post("/api/orders", checkout());
    const created = (await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" })).json();
    paypal.approve(created.id);
    const response = await paypal.deliver(`${SITE}/api/paypal/webhook`, paypal.events.orderApproved(created.id), {
      deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()),
    });
    assert.equal(response.status, 200);
    await settle();
    assert.equal(orderRow().fields.status, "paid");
    assert.match(orderRow().fields["payment-log"], /webhook WH-[0-9A-F]+: capture 3C\w+ COMPLETED for 78\.40 USD → paid/, "the capture line carries the event id, so the event is not applied twice");
    assert.equal(smtp.messages.length, 2);
  });

  it("when the webhook marks it paid between the browser's read and write, the browser does not send a second receipt", async () => {
    await post("/api/orders", checkout());
    const created = (await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" })).json();
    paypal.approve(created.id);
    const recordId = orderRow().id;
    api.options.conflictOnce = new Set([recordId]);
    api.options.conflictFields = { status: "paid", "amount-paid": 78.4, "paypal-capture-id": "3CWEBHOOK000001", "payment-log": "webhook got there first" };
    const captured = await post("/api/paypal/capture", { orderId: "ORD-7K2M9QX4PT", paypalOrderId: created.id });
    await settle();
    assert.equal(captured.json().status, "paid");
    assert.equal(orderRow().fields["paypal-capture-id"], "3CWEBHOOK000001", "the other writer's capture stays");
    assert.equal(smtp.messages.length, 0, "the writer that marked it paid sends the emails; this one did not");
  });
});

describe("when PayPal is not ready", () => {
  it("takes order requests, and says why, when the secret is not in the Vault", async () => {
    api.state.vault = { SOMETHING_ELSE: "x" };
    const page = await call("/order");
    assert.match(page.text, /data-submit>Send order request</);
    const status = (await call("/api/status")).json();
    assert.equal(status.payments, "requests");
    assert.equal(status.paymentsNote, "no-secret");
    assert.equal(status.email, "ready", "security none needs no password");
    const saved = await post("/api/orders", checkout());
    assert.equal(saved.json().payment, "request");
    assert.equal(orderRow().fields.status, "new");
    assert.equal((await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" })).status, 409);
  });

  it("a webhook it cannot verify yet is answered 'try again later', and nothing changes", async () => {
    await payFor();
    settings()["paypal-webhook-id"] = "";
    env = envFor();
    const before = JSON.stringify(orderRow().fields);
    const response = await paypal.deliver(`${SITE}/api/paypal/webhook`, paypal.events.refunded(orderRow().fields["paypal-capture-id"], "78.40"), {
      deliverFetch: (url, init) => worker.fetch(new Request(url, init), env, ctx()),
    });
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(orderRow().fields), before);
  });

  it("a wrong secret makes PayPal unavailable at the pay step, with the order kept", async () => {
    api.state.vault = { BUSA_SHOP_PAYPAL_CLIENT_SECRET: "wrong" };
    await post("/api/orders", checkout());
    const created = await post("/api/paypal/orders", { orderId: "ORD-7K2M9QX4PT" });
    assert.equal(created.status, 502);
    assert.equal(orderRow().fields.status, "awaiting-payment");
    assert.ok(logged.some((line) => /PayPal refused the client id \/ secret \(401/.test(line)));
  });

  it("a shop with PayPal off reads no Vault at all", async () => {
    Object.assign(settings(), { "paypal-mode": "off", "smtp-host": "" });
    await call("/order");
    await call("/api/status");
    assert.ok(!api.log.some((entry) => entry.path === "/api/v1/vault/runtime"));
  });
});

describe("order requests and email", () => {
  beforeEach(() => {
    settings()["paypal-mode"] = "off";
  });

  it("emails the buyer (only the shop's own data) and the owner (everything) when a request is saved", async () => {
    const saved = await post("/api/orders", checkout({ note: "Visit https://spam.example now" }));
    assert.equal(saved.json().payment, "request");
    await settle();
    const [buyer, owner] = smtp.messages;
    assert.equal(buyer.subject, "We received your order request ORD-7K2M9QX4PT");
    assert.equal(buyer.replyTo, "<hello@tumbleberry.example>");
    for (const typed of ["Mia Jensen", "spam.example", "Eksempelvej"]) assert.ok(!buyer.text.includes(typed), typed);
    assert.equal(owner.subject, "New order request ORD-7K2M9QX4PT · $78.40");
    assert.match(owner.text, /Visit https:\/\/spam\.example now/);
    assert.match(orderRow().fields["email-log"], /sent request-received to mia\.jensen@example\.com/);
  });

  it("a mail server that refuses the login is written into the Email log, and the order is still saved", async () => {
    const strict = await startFakeSmtp({ requireAuth: { user: "shop@tumbleberry.example", pass: SMTP_PASSWORD } });
    try {
      Object.assign(settings(), { "smtp-port": strict.port, "smtp-security": "none" });
      env = envFor();
      assert.equal((await post("/api/orders", checkout())).status, 200);
      await settle();
      assert.equal(orderRow().fields.status, "new");
      assert.match(orderRow().fields["email-log"], /FAILED request-received to mia\.jensen@example\.com: sender refused: the mail server answered 530/);
    } finally {
      await strict.close();
    }
  });

  it("a missing SMTP password is said once in the Email log, never sent", async () => {
    Object.assign(settings(), { "smtp-security": "starttls", "smtp-username": "shop@tumbleberry.example" });
    api.state.vault = {};
    await post("/api/orders", checkout());
    await settle();
    assert.equal(smtp.messages.length, 0);
    assert.match(orderRow().fields["email-log"], /no email sent: the SMTP password \(BUSA_SHOP_SMTP_PASSWORD\) is not in the Space Vault/);
  });
});

describe("policy pages", () => {
  it("are linked in the footer, rendered from Markdown with the store's details, and in the sitemap", async () => {
    const home = await call("/");
    for (const [slug, title] of [["shipping", "Shipping"], ["returns", "Returns &amp; warranty"], ["privacy", "Privacy"], ["terms", "Terms"], ["contact", "Contact"]]) {
      assert.match(home.text, new RegExp(`<a href="/pages/${slug}">${title}</a>`));
    }
    const privacy = await call("/pages/privacy");
    assert.equal(privacy.status, 200);
    assert.match(privacy.text, /<h1>Privacy<\/h1>/);
    assert.match(privacy.text, /This page explains what Tumbleberry Toys does/);
    assert.match(privacy.text, /<h3>Payments<\/h3>/);
    assert.match(privacy.text, /Write to hello@tumbleberry\.example/);
    assert.match(privacy.text, /【fill in/);
    assert.match((await call("/pages/terms")).text, /<a href="\/pages\/shipping">Shipping<\/a>/);
    assert.equal((await call("/pages/nope")).status, 404);
    api.state.records.bas_pages[0].fields.status = "draft";
    env = envFor();
    assert.equal((await call("/pages/shipping")).status, 404);
    const sitemap = (await call("/sitemap.xml")).text;
    assert.match(sitemap, /\/pages\/privacy/);
    assert.doesNotMatch(sitemap, /\/pages\/shipping/);
  });
});

describe("secrets", () => {
  it("never appear in a page, an API answer or a log line, and the Vault is read at most once per five minutes", async () => {
    const outputs = [];
    for (const path of ["/", "/order", "/api/status", "/pages/privacy", "/products/tt-walking-robot"]) outputs.push((await call(path)).text);
    await payFor();
    outputs.push((await call("/pay/ORD-7K2M9QX4PT")).text);
    outputs.push(...logged, ...api.state.records.bas_orders.map((row) => JSON.stringify(row.fields)));
    for (const output of outputs) {
      assert.ok(!output.includes(PAYPAL_SECRET) && !output.includes(SMTP_PASSWORD) && !output.includes("not-the-shops"), output.slice(0, 200));
    }
    assert.equal(api.log.filter((entry) => entry.path === "/api/v1/vault/runtime").length, 1);
    const status = (await call("/api/status")).json();
    assert.deepEqual(
      { payments: status.payments, email: status.email, shipping: status.shipping, pages: status.pages },
      { payments: "paypal-sandbox", email: "ready", shipping: { countries: 22, problems: 0 }, pages: 5 },
    );
  });
});
