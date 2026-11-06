import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSettings } from "../src/catalog.js";
import {
  appendLogLines,
  isHoneypotHit,
  newOrderId,
  ORDER_ID_PATTERN,
  orderFromRecord,
  orderInputFromForm,
  orderToFields,
  validateOrder,
  WEBSITE_ORDER_FIELDS,
} from "../src/orders.js";
import { buildShippingRates } from "../src/shipping.js";

const settings = normalizeSettings({ fields: { "store-name": "Shop", currency: "USD", "ships-to": "US, GB, DK" } });
const product = (id, extra = {}) => ({
  id,
  sku: id.toUpperCase(),
  name: `Toy ${id}`,
  price: 24,
  soldOut: false,
  maxQuantity: 99,
  ...extra,
});
const listed = [product("robot"), product("blocks", { price: 18.5 }), product("dino", { soldOut: true, maxQuantity: 0 }), product("train", { maxQuantity: 3 })];

const valid = (overrides = {}) => ({
  orderId: "ORD-7K2M9QX4PT",
  name: "Mia Jensen",
  email: "mia@example.com",
  phone: "+45 12 34 56 78",
  country: "dk",
  address1: "Eksempelvej 7",
  city: "Aarhus",
  postalCode: "8000",
  note: "Before the 20th, please.",
  items: [
    { productId: "robot", quantity: 2 },
    { productId: "blocks", quantity: 1 },
  ],
  ...overrides,
});

const check = (overrides) => validateOrder(valid(overrides), { listed, settings });

// The same order with a Shipping table: DK and GB have a rate, US has none.
const shipping = {
  status: "ready",
  ...buildShippingRates(
    [
      { id: "s1", fields: { name: "EU", countries: "DK, DE", rate: 11.9, "free-over": 90, "delivery-estimate": "7–12 business days" } },
      { id: "s2", fields: { name: "UK", countries: "GB", rate: 9.9 } },
    ],
    settings,
  ),
};
const checkShipped = (overrides) => validateOrder(valid(overrides), { listed, settings, shipping });
describe("validateOrder", () => {
  it("accepts a complete order and rebuilds every line from the catalog", () => {
    const result = check({ items: [{ productId: "robot", quantity: 2, price: 0.01, name: "Hacked" }, { productId: "blocks", quantity: 1 }] });
    assert.equal(result.ok, true);
    assert.equal(result.order.total, 66.5);
    assert.equal(result.order.country, "DK");
    assert.deepEqual(result.order.lines[0], {
      productId: "robot",
      sku: "ROBOT",
      name: "Toy robot",
      quantity: 2,
      unitPrice: 24,
      lineTotal: 48,
    });
  });

  it("requires a valid client-made order id", () => {
    for (const orderId of ["", "ORD-123", "ord-7K2M9QX4PT", "ORD-7K2M9QX4PI", "ORD-7K2M9QX4PTX", 42]) {
      assert.equal(check({ orderId }).errors?.orderId, "invalid", String(orderId));
    }
  });

  it("checks every customer field", () => {
    assert.deepEqual(check({ name: "  " }).errors, { name: "required" });
    assert.deepEqual(check({ name: "x".repeat(101) }).errors, { name: "too_long" });
    assert.deepEqual(check({ name: "Mia\u0000" }).errors, { name: "invalid" });
    assert.deepEqual(check({ email: "" }).errors, { email: "required" });
    assert.deepEqual(check({ email: "mia@example" }).errors, { email: "invalid_email" });
    assert.deepEqual(check({ email: `${"a".repeat(195)}@ex.com` }).errors, { email: "too_long" });
    assert.deepEqual(check({ phone: "call me" }).errors, { phone: "invalid_phone" });
    assert.deepEqual(check({ phone: "" }).errors, { phone: "required" }, "a carrier needs a phone number");
    assert.deepEqual(check({ address1: "" }).errors, { address1: "required" });
    assert.deepEqual(check({ city: " " }).errors, { city: "required" });
    assert.deepEqual(check({ postalCode: "" }).errors, { postalCode: "required" });
    assert.deepEqual(check({ address1: "x".repeat(301) }).errors, { address1: "too_long" });
    assert.deepEqual(check({ address2: "Flat 2\u0007" }).errors, { address2: "invalid" });
    assert.equal(check({ address2: "Flat 2\nB" }).order.address.line2, "Flat 2 B", "a line break inside one address line is a space");
    assert.deepEqual(check({ country: "" }).errors, { country: "required" });
    assert.deepEqual(check({ country: "FR" }).errors, { country: "invalid_country" });
    assert.deepEqual(check({ note: "x".repeat(1001) }).errors, { note: "too_long" });
    assert.equal(check({ note: "line one\nline two" }).ok, true);
    assert.deepEqual(check({ name: 5, email: null }).errors, { name: "required", email: "required" });
  });

  it("refuses items that are not real, listed, in stock and in range", () => {
    assert.deepEqual(check({ items: [] }).errors, { items: "items_empty" });
    assert.deepEqual(check({ items: "robot" }).errors, { items: "invalid" });
    assert.deepEqual(check({ items: [{ productId: "robot", quantity: 1.5 }] }).errors, { items: "invalid" });
    assert.deepEqual(check({ items: [{ productId: "robot", quantity: -1 }] }).errors, { items: "invalid" });
    assert.deepEqual(check({ items: [{ productId: "../x", quantity: 1 }] }).errors, { items: "invalid" });
    assert.deepEqual(check({ items: [{ productId: "lamp", quantity: 1 }] }).itemErrors, [{ productId: "lamp", code: "not_available" }]);
    assert.equal(check({ items: [{ productId: "dino", quantity: 1 }] }).errors.items, "sold_out");
    assert.deepEqual(check({ items: [{ productId: "train", quantity: 4 }] }).itemErrors, [
      { productId: "train", code: "too_many", name: "Toy train", max: 3 },
    ]);
    assert.deepEqual(
      check({ items: Array.from({ length: 21 }, (_, index) => ({ productId: `p${index}`, quantity: 1 })) }).errors,
      { items: "too_many_items" },
    );
  });

  it("merges repeated lines and drops zero quantities", () => {
    const result = check({ items: [{ productId: "robot", quantity: 1 }, { productId: "robot", quantity: 2 }, { productId: "blocks", quantity: 0 }] });
    assert.deepEqual(
      result.order.lines.map((line) => [line.productId, line.quantity]),
      [["robot", 3]],
    );
  });

  it("answers 409 when the total the visitor saw is not the total now", () => {
    const result = check({ expectedTotal: 60 });
    assert.equal(result.status, 409);
    assert.equal(result.total, 66.5);
    assert.equal(result.totalText, "$66.50");
    assert.equal(check({ expectedTotal: 66.5 }).ok, true);
  });

  it("adds shipping from the Shipping table, and refuses a country without a rate", () => {
    const result = checkShipped({});
    assert.equal(result.ok, true);
    assert.equal(result.order.subtotal, 66.5);
    assert.equal(result.order.shipping, 11.9);
    assert.equal(result.order.total, 78.4);
    assert.equal(result.order.deliveryEstimate, "7–12 business days");
    assert.deepEqual(result.order.address, { line1: "Eksempelvej 7", line2: "", city: "Aarhus", region: "", postalCode: "8000", country: "DK" });
    // In Ships to (US, GB, DK) but no rate: cannot check out.
    assert.deepEqual(checkShipped({ country: "US", region: "CA", postalCode: "94105" }).errors, { country: "no_shipping" });
    // Not in Ships to at all, though it has a rate (DE).
    assert.deepEqual(checkShipped({ country: "DE" }).errors, { country: "invalid_country" });
    // The visitor's total must include shipping.
    assert.equal(checkShipped({ expectedTotal: 66.5 }).status, 409);
    assert.equal(checkShipped({ expectedTotal: 78.4 }).ok, true);
  });

  it("ships free from the threshold, on the items total only", () => {
    const result = checkShipped({ items: [{ productId: "robot", quantity: 4 }] });
    assert.equal(result.order.subtotal, 96);
    assert.equal(result.order.shipping, 0);
    assert.equal(result.order.total, 96);
  });

  it("asks for a state where the country needs one, and no postal code where there is none", () => {
    const us = normalizeSettings({ fields: { "store-name": "Shop", currency: "USD", "ships-to": "US, HK" } });
    const rates = { status: "ready", ...buildShippingRates([{ id: "s", fields: { name: "All", countries: "US, HK", rate: 5 } }], us) };
    const run = (overrides) => validateOrder(valid({ ...overrides }), { listed, settings: us, shipping: rates });
    assert.deepEqual(run({ country: "US", postalCode: "62701" }).errors, { region: "required" });
    assert.equal(run({ country: "US", region: "IL", postalCode: "62701" }).ok, true);
    assert.equal(run({ country: "HK", postalCode: "" }).ok, true, "Hong Kong has no postal codes");
  });

  it("treats a non-object body as empty", () => {
    for (const body of [null, "x", [], 7]) assert.equal(validateOrder(body, { listed, settings }).ok, false);
  });
});

describe("orderToFields", () => {
  it("writes exactly the website's fields and never a staff-only one", () => {
    const { order } = check({});
    const fields = orderToFields(order, { nowIso: "2026-11-05T10:00:00.000Z" });
    assert.ok(Object.keys(fields).every((key) => WEBSITE_ORDER_FIELDS.includes(key)));
    assert.equal(fields["internal-note"], undefined);
    assert.equal(fields["reply-draft"], undefined);
    assert.equal(fields["tracking-number"], undefined);
    assert.equal(fields["address-line2"], undefined, "an empty optional field is left out, not written as empty");
    assert.equal(fields.shipping, undefined, "no Shipping table: the cost is left to the owner's reply");
    assert.equal(fields.status, "new");
    assert.equal(fields["payment-method"], "request");
    assert.equal(fields["shipping-address"], "Mia Jensen\nEksempelvej 7\n8000 Aarhus\nDenmark (DK)");
    assert.equal(fields.title, "ORD-7K2M9QX4PT · Mia Jensen");
    assert.equal(fields.country, "Denmark (DK)");
    assert.equal(fields.total, 66.5);
    assert.equal(fields.currency, "USD");
    assert.equal(fields["created-at"], "2026-11-05T10:00:00.000Z");
    assert.equal(fields["items-summary"], "2 × Toy robot (ROBOT) @ 24.00 USD = 48.00 USD\n1 × Toy blocks (BLOCKS) @ 18.50 USD = 18.50 USD");
    assert.deepEqual(JSON.parse(fields.items)[1], {
      product_id: "blocks",
      sku: "BLOCKS",
      name: "Toy blocks",
      quantity: 1,
      unit_price: 18.5,
      line_total: 18.5,
    });
  });

  it("starts a PayPal checkout as awaiting payment, with shipping in the total", () => {
    const { order } = checkShipped({});
    const fields = orderToFields(order, { nowIso: "2026-11-05T10:00:00.000Z", payment: "paypal" });
    assert.equal(fields.status, "awaiting-payment");
    assert.equal(fields["payment-method"], "paypal");
    assert.equal(fields.subtotal, 66.5);
    assert.equal(fields.shipping, 11.9);
    assert.equal(fields.total, 78.4);
    assert.equal(fields["delivery-estimate"], "7–12 business days");
  });

  it("reads an order back from its row the way it was written", () => {
    const { order } = checkShipped({});
    const fields = orderToFields(order, { nowIso: "2026-11-05T10:00:00.000Z", payment: "paypal" });
    const back = orderFromRecord({ id: "rec_1", headCommitId: "cmt_1", fields: { ...fields, status: { id: "awaiting-payment", name: "Awaiting payment" } } });
    assert.equal(back.status, "awaiting-payment", "a select read as { id, name } too");
    assert.equal(back.country, "DK");
    assert.deepEqual(back.address, order.address);
    assert.deepEqual(back.lines, order.lines);
    assert.equal(back.total, 78.4);
    assert.equal(back.shipping, 11.9);
    assert.equal(back.headCommitId, "cmt_1");
  });

  it("appends log lines and keeps the newest when the log grows long", () => {
    assert.equal(appendLogLines("", ["a"]), "a");
    assert.equal(appendLogLines("a\n", ["b", "c"]), "a\nb\nc");
    const long = appendLogLines("x".repeat(50) + "\nold", ["new"], 20);
    assert.ok(long.endsWith("new") && long.length <= 20, long);
  });
});

describe("form posts and ids", () => {
  it("reads a plain HTML form into the API shape", () => {
    const form = new URLSearchParams("orderId=ORD-7K2M9QX4PT&name=Mia&email=m%40e.com&country=DK&address1=Eksempelvej+7&city=Aarhus&postalCode=8000&qty.robot=2&qty.blocks=x&expectedTotal=48.00&company_url=");
    const input = orderInputFromForm(form);
    assert.equal(input.name, "Mia");
    assert.equal(input.address1, "Eksempelvej 7");
    assert.equal(input.postalCode, "8000");
    assert.equal(input.expectedTotal, 48);
    assert.equal(orderInputFromForm(new URLSearchParams("expectedTotal=")).expectedTotal, undefined, "an empty total (no country chosen yet) is not 0");
    assert.deepEqual(input.items[0], { productId: "robot", quantity: 2 });
    assert.ok(Number.isNaN(input.items[1].quantity));
    assert.equal(isHoneypotHit(input), false);
    assert.equal(isHoneypotHit({ website: "http://spam.example" }), true);
  });

  it("makes order ids in the accepted format", () => {
    for (let index = 0; index < 50; index += 1) assert.match(newOrderId(), ORDER_ID_PATTERN);
    assert.equal(newOrderId((bytes) => bytes.fill(31)), "ORD-ZZZZZZZZZZ");
  });
});
