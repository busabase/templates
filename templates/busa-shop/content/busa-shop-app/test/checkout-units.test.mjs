// The pure parts of checkout: shipping rates, policy pages and their
// Markdown, the emails, the Vault read, and PayPal's order body and webhook
// decisions. The SMTP client is tested against a mock socket here and
// against a real (local) SMTP server in test/smtp.test.mjs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSettings } from "../src/catalog.js";
import { composeEmails, emailLogLines, smtpConfig } from "../src/mail.js";
import { orderFromRecord, orderToFields, validateOrder } from "../src/orders.js";
import { createOrderBody, decideWebhook, eventOrderRef, paypalValue, sameAmount } from "../src/paypal.js";
import { buildPages, fillPlaceholders, renderMarkdown, unfinishedPages } from "../src/policies.js";
import { buildShippingRates, checkoutCountries, clientRates, shippingFor } from "../src/shipping.js";
import { createSecretsReader, readShopSecrets } from "../src/vault.js";
import { sampleRows } from "./fixtures.mjs";

const settings = normalizeSettings({
  fields: {
    "store-name": "Tumbleberry Toys",
    currency: "USD",
    "contact-email": "hello@tumbleberry.example",
    "ships-to": "US, GB, DK, DE",
    language: "en",
  },
});

const rows = (list) => list.map((fields, index) => ({ id: `rec_${index}`, fields }));

describe("shipping rates", () => {
  it("reads zones, codes, free-over and the delivery time, first row winning", () => {
    const { rates, problems } = buildShippingRates(
      rows([
        { name: "EU", countries: "dk, de；FR", rate: 11.9, "free-over": 90, "delivery-estimate": "7–12 business days", position: 2 },
        { name: "US", countries: "US", rate: 8.9, position: 1 },
        { name: "Denmark again", countries: "DK", rate: 5, position: 3 },
        { name: "Bad", countries: "XX", rate: 1 },
        { name: "No cost", countries: "GB" },
        { name: "Euro", countries: "GB", rate: 7, currency: "EUR" },
        { name: "Empty", countries: "", rate: 3 },
      ]),
      settings,
    );
    assert.deepEqual([...rates.keys()], ["US", "DK", "DE", "FR"]);
    assert.deepEqual(rates.get("DK"), { zone: "EU", country: "DK", cost: 11.9, currency: "USD", freeOver: 90, estimate: "7–12 business days" });
    assert.deepEqual(
      problems.map((problem) => problem.code),
      ["duplicate-country", "unknown-country", "no-rate", "currency-mismatch", "no-countries"],
    );
  });

  it("offers only ships-to countries that have a rate, and nothing changes for a shop without the table", () => {
    const shipping = { status: "ready", ...buildShippingRates(rows([{ name: "EU", countries: "DK, FR", rate: 10 }]), settings) };
    assert.deepEqual(checkoutCountries(settings, shipping), ["DK"]);
    assert.deepEqual(checkoutCountries(settings, { status: "missing", rates: new Map() }), settings.shipsTo);
    assert.deepEqual(clientRates(shipping, ["DK"]), { DK: { cost: 10, freeOver: null, estimate: "" } });
  });

  it("charges the rate, free from the threshold, and says why it cannot", () => {
    const shipping = { status: "ready", ...buildShippingRates(rows([{ name: "EU", countries: "DK", rate: 11.9, "free-over": 90 }, { name: "Free", countries: "DE", rate: 0 }]), settings) };
    assert.equal(shippingFor(shipping, "DK", 89.99).cost, 11.9);
    assert.equal(shippingFor(shipping, "DK", 90).cost, 0);
    assert.equal(shippingFor(shipping, "DE", 1).free, true);
    assert.deepEqual(shippingFor(shipping, "US", 10), { ok: false, code: "no_shipping" });
    assert.deepEqual(shippingFor({ status: "unreadable", rates: new Map() }, "DK", 10), { ok: false, code: "shipping_unavailable" });
    assert.equal(shippingFor({ status: "missing", rates: new Map() }, "DK", 10).cost, null);
  });

  it("the template's own rates cover every ships-to country of its sample Settings, once", async () => {
    const sample = normalizeSettings({ fields: (await sampleRows("settings"))[0].fields });
    const { rates, problems } = buildShippingRates(await sampleRows("shipping"), sample);
    assert.deepEqual(problems, []);
    assert.deepEqual(sample.shipsTo.filter((code) => !rates.has(code)), []);
  });
});

describe("policy pages", () => {
  it("publishes only published pages with a good, unique address, in footer order", () => {
    const pages = buildPages(
      rows([
        { title: "Terms", slug: "terms", status: "published", "in-footer": true, position: 2, body: "x" },
        { title: "Shipping", slug: "Shipping", status: "published", "in-footer": true, position: 1, body: "y" },
        { title: "Draft", slug: "draft", status: "draft", position: 0 },
        { title: "Bad", slug: "../x", status: "published" },
        { title: "Again", slug: "terms", status: "published", position: 3 },
      ]),
    );
    assert.deepEqual(pages.map((page) => [page.slug, page.title]), [["shipping", "Shipping"], ["terms", "Terms"]]);
  });

  it("renders the small Markdown and never HTML", () => {
    const html = renderMarkdown(
      "## Returns\n\nYou can return within **30** days, *unused*.\n\n- one\n- two [our terms](/pages/terms)\n\n1. first\n2. second\n\n<script>alert(1)</script>\n[x](javascript:alert(1)) [mail](mailto:a@b.example)",
    );
    assert.match(html, /<h3>Returns<\/h3>/, "## is one level below the page's own h1… and h2 is #");
    assert.match(html, /<strong>30<\/strong>/);
    assert.match(html, /<em>unused<\/em>/);
    assert.match(html, /<ul><li>one<\/li><li>two <a href="\/pages\/terms">our terms<\/a><\/li><\/ul>/);
    assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /href="javascript:/);
    assert.match(html, /<a href="mailto:a@b.example">mail<\/a>/);
    assert.match(renderMarkdown("# Top"), /<h2>Top<\/h2>/);
  });

  it("fills in the store's name and contact, and finds the 【fill in】 markers", () => {
    assert.equal(fillPlaceholders("Write to {{contact_email}} at {{ store_name }}.", settings), "Write to hello@tumbleberry.example at Tumbleberry Toys.");
    assert.match(fillPlaceholders("{{contact_email}}", { storeName: "S", contactEmail: "" }), /【fill in: contact email】/);
    const pages = buildPages(rows([{ title: "A", slug: "a", status: "published", body: "ok" }, { title: "B", slug: "b", status: "published", body: "within 【fill in: number】 days" }]));
    assert.deepEqual(unfinishedPages(pages), ["b"]);
  });

  it("the template's Legal notice is a draft: never on the site, in the footer or reported, until the owner publishes it", async () => {
    const rows = await sampleRows("pages");
    const legal = rows.find((row) => row.fields.slug === "legal").fields;
    assert.equal(legal.status, "draft");
    assert.equal(legal["in-footer"], false);
    assert.match(legal.body, /【fill in: your business licence number/);
    assert.match(legal.body, /Only publish what is true for you/);
    assert.ok(!buildPages(rows).some((page) => page.slug === "legal"));
  });

  it("the five template pages are published, in the footer, and say only what the owner must fill in", async () => {
    const pages = buildPages(await sampleRows("pages"));
    assert.deepEqual(pages.map((page) => page.slug), ["shipping", "returns", "privacy", "terms", "contact"]);
    assert.ok(pages.every((page) => page.inFooter));
    assert.deepEqual(unfinishedPages(pages), ["shipping", "returns", "privacy", "terms", "contact"]);
    for (const page of pages) {
      const html = renderMarkdown(fillPlaceholders(page.body, settings));
      assert.doesNotMatch(html, /\{\{|<script|href="(?!\/pages\/|https:|mailto:)/, page.slug);
    }
    assert.match(pages.find((page) => page.slug === "privacy").body, /PayPal/);
  });
});

const shipping = { status: "ready", ...buildShippingRates(rows([{ name: "EU", countries: "DK", rate: 11.9 }]), settings) };
const listed = [
  { id: "tt-walking-robot", sku: "TT-ROB-01", name: "Walking Robot Buddy", price: 24, soldOut: false, maxQuantity: 99 },
  { id: "tt-rainbow-blocks", sku: "TT-BLK-02", name: "Rainbow Stacking Blocks", price: 18.5, soldOut: false, maxQuantity: 99 },
];
const checkout = validateOrder(
  {
    orderId: "ORD-7K2M9QX4PT",
    name: "Mia Jensen",
    email: "mia.jensen@example.com",
    phone: "+45 12 34 56 78",
    country: "DK",
    address1: "Eksempelvej 7",
    city: "Aarhus",
    postalCode: "8000",
    note: "Win a prize at https://spam.example",
    items: [
      { productId: "tt-walking-robot", quantity: 2 },
      { productId: "tt-rainbow-blocks", quantity: 1 },
    ],
  },
  { listed, settings, shipping },
).order;
const stored = orderFromRecord({ id: "rec_1", headCommitId: "cmt_1", fields: orderToFields(checkout, { nowIso: "2026-11-07T10:00:00.000Z", payment: "paypal" }) });

describe("PayPal order body", () => {
  it("is the stored order: our id as custom_id and invoice_id, a breakdown that adds up, the address to ship to", () => {
    const body = createOrderBody(stored, { storeName: "Tumbleberry Toys", locale: "en-US" });
    const unit = body.purchase_units[0];
    assert.equal(body.intent, "CAPTURE");
    assert.equal(unit.custom_id, "ORD-7K2M9QX4PT");
    assert.equal(unit.invoice_id, "ORD-7K2M9QX4PT");
    assert.deepEqual(unit.amount, {
      currency_code: "USD",
      value: "78.40",
      breakdown: { item_total: { currency_code: "USD", value: "66.50" }, shipping: { currency_code: "USD", value: "11.90" } },
    });
    assert.deepEqual(unit.items.map((item) => [item.name, item.quantity, item.unit_amount.value]), [
      ["Walking Robot Buddy", "2", "24.00"],
      ["Rainbow Stacking Blocks", "1", "18.50"],
    ]);
    assert.deepEqual(unit.shipping, {
      name: { full_name: "Mia Jensen" },
      address: { address_line_1: "Eksempelvej 7", admin_area_2: "Aarhus", postal_code: "8000", country_code: "DK" },
    });
    assert.equal(body.payment_source.paypal.experience_context.shipping_preference, "SET_PROVIDED_ADDRESS");
  });

  it("sends the amount alone when staff changed the total by hand, and refuses what PayPal cannot write", () => {
    const body = createOrderBody({ ...stored, total: 70 }, { storeName: "S" });
    assert.deepEqual(body.purchase_units[0].amount, { currency_code: "USD", value: "70.00" });
    assert.equal(body.purchase_units[0].items, undefined);
    assert.equal(paypalValue(1250, "JPY"), "1250");
    assert.equal(paypalValue(12.5, "JPY"), null);
    assert.throws(() => createOrderBody({ ...stored, currency: "JPY", total: 12.5 }, { storeName: "S" }));
    assert.ok(sameAmount({ value: "78.40", currency: "usd" }, { value: 78.4, currency: "USD" }));
    assert.ok(!sameAmount({ value: "78.39", currency: "USD" }, { value: 78.4, currency: "USD" }));
    assert.ok(!sameAmount({ value: "78.40", currency: "EUR" }, { value: 78.4, currency: "USD" }));
  });
});

describe("PayPal webhook decisions", () => {
  const nowIso = "2026-11-07T10:05:00.000Z";
  const completed = (value = "78.40", currency = "USD") => ({
    id: "WH-1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "3C1", amount: { value, currency_code: currency }, custom_id: "ORD-7K2M9QX4PT", create_time: "2026-11-07T10:04:00Z" },
  });

  it("finds the order by our id, and a refund by the capture it belongs to", () => {
    assert.deepEqual(eventOrderRef(completed()), { ourId: "ORD-7K2M9QX4PT", captureId: "3C1", paypalOrderId: "" });
    const refund = { event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "5R1", links: [{ rel: "up", href: "https://api-m.paypal.com/v2/payments/captures/3C1ABC" }] } };
    assert.deepEqual(eventOrderRef(refund), { ourId: "", captureId: "3C1ABC", paypalOrderId: "" });
    assert.equal(eventOrderRef({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "9P", purchase_units: [{ custom_id: "ORD-7K2M9QX4PT" }] } }).ourId, "ORD-7K2M9QX4PT");
  });

  it("marks paid only for the right amount and currency", () => {
    const paid = decideWebhook(completed(), stored, { nowIso });
    assert.equal(paid.kind, "paid");
    assert.deepEqual(paid.fields, { status: "paid", "paypal-capture-id": "3C1", "amount-paid": 78.4, "paid-at": "2026-11-07T10:04:00Z" });
    for (const [value, currency] of [["70.00", "USD"], ["78.40", "EUR"]]) {
      const wrong = decideWebhook(completed(value, currency), stored, { nowIso });
      assert.equal(wrong.kind, "problem");
      assert.equal(wrong.fields.status, "payment-problem");
      assert.match(wrong.fields["payment-problem"], /Check the payment in PayPal before shipping/);
    }
  });

  it("never moves an order backwards, and records refunds, reversals and denials", () => {
    const shipped = { ...stored, status: "shipped", captureId: "3C1", amountPaid: 78.4 };
    assert.equal(decideWebhook(completed(), shipped, { nowIso }).kind, "log");
    const partial = decideWebhook({ id: "WH-2", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "5R1", amount: { value: "20.00", currency_code: "USD" } } }, shipped, { nowIso });
    assert.deepEqual(partial.fields, { "refunded-amount": 20 });
    const full = decideWebhook({ id: "WH-3", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "5R2", amount: { value: "58.40", currency_code: "USD" } } }, { ...shipped, refundedAmount: 20 }, { nowIso });
    assert.deepEqual(full.fields, { "refunded-amount": 78.4, status: "refunded" });
    const reversed = decideWebhook({ id: "WH-4", event_type: "PAYMENT.CAPTURE.REVERSED", resource: { id: "6V", amount: { value: "78.40", currency_code: "USD" } } }, shipped, { nowIso });
    assert.equal(reversed.fields.status, "payment-problem");
    assert.match(reversed.fields["payment-problem"], /Resolution Center/);
    const denied = decideWebhook({ id: "WH-5", event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "3D", amount: { value: "78.40", currency_code: "USD" } } }, stored, { nowIso });
    assert.equal(denied.fields.status, "payment-problem");
    const pending = decideWebhook({ id: "WH-6", event_type: "PAYMENT.CAPTURE.PENDING", resource: { id: "3C9", status_details: { reason: "PENDING_REVIEW" } } }, stored, { nowIso });
    assert.equal(pending.fields.status, undefined, "pending keeps the order awaiting payment");
    assert.match(pending.fields["payment-problem"], /PENDING_REVIEW/);
    assert.equal(decideWebhook({ id: "WH-7", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "9P" } }, stored, { nowIso }).kind, "capture");
    assert.equal(decideWebhook({ id: "WH-8", event_type: "CUSTOMER.DISPUTE.CREATED", resource: {} }, stored, { nowIso }).kind, "ignore");
  });
});

describe("emails", () => {
  const config = smtpConfig({ ...settings, smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls", smtpUsername: "shop@tumbleberry.example", emailFrom: "", notifyEmail: "owner@tumbleberry.example" }, { smtpPassword: "pw" });

  it("are ready only with a host, a sender and the Vault password", () => {
    assert.equal(config.ready, true);
    assert.equal(config.from, "shop@tumbleberry.example");
    assert.equal(config.notify, "owner@tumbleberry.example");
    assert.equal(smtpConfig({ ...settings, smtpHost: "" }, {}).reason, "off");
    assert.equal(smtpConfig({ ...settings, smtpHost: "h", smtpUsername: "u@x.example", smtpSecurity: "starttls" }, {}).reason, "no-password");
    assert.equal(smtpConfig({ ...settings, smtpHost: "h", smtpPort: 25, smtpUsername: "u@x.example" }, { smtpPassword: "p" }).reason, "bad-port");
    assert.equal(smtpConfig({ ...settings, smtpHost: "h", smtpUsername: "", emailFrom: "" }, {}).reason, "no-sender");
    assert.equal(smtpConfig({ ...settings, smtpHost: "h", smtpUsername: "u@x.example" }, { smtpPassword: "p" }, { canConnect: false }).reason, "browser-engine");
    assert.equal(smtpConfig({ ...settings, smtpHost: "h", smtpSecurity: "tls", smtpUsername: "u@x.example" }, { smtpPassword: "p" }).port, 465);
  });

  it("an order request email to the buyer carries none of the text typed into the form", () => {
    const [buyer, owner] = composeEmails("request", stored, settings, config);
    assert.equal(buyer.tag, "request-received");
    assert.equal(buyer.to, "mia.jensen@example.com");
    assert.equal(buyer.subject, "We received your order request ORD-7K2M9QX4PT");
    for (const typed of ["Mia Jensen", "spam.example", "Eksempelvej", "Aarhus", "+45"]) {
      assert.ok(!buyer.text.includes(typed) && !buyer.html.includes(typed), typed);
    }
    assert.match(buyer.text, /2 × Walking Robot Buddy \(TT-ROB-01\): \$48\.00/);
    assert.match(buyer.text, /Total: \$78\.40/);
    assert.equal(owner.tag, "owner-request");
    assert.equal(owner.to, "owner@tumbleberry.example");
    assert.equal(owner.replyTo, "mia.jensen@example.com", "the owner replies straight to the buyer");
    assert.match(owner.text, /Eksempelvej 7/);
  });

  it("the paid emails: a receipt to the buyer, a ready-to-ship notice to the owner, in the store language", () => {
    const paid = { ...stored, status: "paid", amountPaid: 78.4, captureId: "3C1ABC" };
    const [buyer, owner] = composeEmails("paid", paid, settings, config);
    assert.equal(buyer.subject, "Order ORD-7K2M9QX4PT confirmed: payment received");
    assert.match(buyer.text, /Hello Mia Jensen,/);
    assert.match(buyer.text, /PayPal transaction: 3C1ABC/);
    assert.match(buyer.text, /Eksempelvej 7/);
    assert.match(buyer.html, /<strong>\$78\.40<\/strong>/);
    assert.equal(owner.subject, "New paid order ORD-7K2M9QX4PT · $78.40");
    const [german] = composeEmails("paid", paid, { ...settings, language: "de" }, config);
    assert.equal(german.subject, "Bestellung ORD-7K2M9QX4PT bestätigt: Zahlung erhalten");
    assert.match(german.text, /78,40/);
    const problem = composeEmails("problem", paid, settings, config, { problem: "PayPal reversed this payment" });
    assert.deepEqual(problem.map((message) => message.tag), ["owner-problem"]);
    assert.deepEqual(composeEmails("paid", paid, settings, { ...config, notify: "" }).map((message) => message.tag), ["payment-receipt"]);
  });

  it("logs one line per email, the failure reason included", () => {
    assert.deepEqual(emailLogLines([{ tag: "payment-receipt", to: "a@b.example", ok: true }, { tag: "owner-paid", to: "c@d.example", ok: false, error: "535 bad login" }], "T"), [
      "T sent payment-receipt to a@b.example",
      "T FAILED owner-paid to c@d.example: 535 bad login",
    ]);
  });
});

describe("the Vault read", () => {
  it("keeps only the shop's two values, and caches them", async () => {
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls += 1;
      assert.equal(url, "https://busabase.example/api/v1/vault/runtime");
      assert.equal(init.headers.authorization, "Bearer sk_site");
      return new Response(JSON.stringify({ BUSA_SHOP_PAYPAL_CLIENT_SECRET: "s3cret", BUSA_SHOP_SMTP_PASSWORD: "pw", OTHER_APP_TOKEN: "not ours" }));
    };
    let now = 0;
    const reader = createSecretsReader({ now: () => now, read: () => readShopSecrets({ baseUrl: "https://busabase.example/", apiKey: "sk_site", spaceId: "spc", fetchImpl }) });
    const first = await reader.get();
    assert.deepEqual(first, { secrets: { paypalSecret: "s3cret", smtpPassword: "pw" }, error: "" });
    await reader.get();
    assert.equal(calls, 1);
    now = 6 * 60_000;
    await reader.get();
    assert.equal(calls, 2);
    assert.deepEqual(await readShopSecrets({ baseUrl: "x", apiKey: "" }), { secrets: {}, error: "no-key" });
    assert.deepEqual(await readShopSecrets({ baseUrl: "https://b.example", apiKey: "k", fetchImpl: async () => new Response("{}", { status: 403 }) }), { secrets: {}, error: "http-403" });
  });
});
