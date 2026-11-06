// Checkout validation and the exact Orders fields the website writes.
// Pure: the catalog, settings and shipping rates come in, a verdict comes out
// (test/orders.test.mjs). The Worker never trusts a price, a name, a shipping
// cost or a total from the browser: every line is rebuilt from the catalog it
// just served, and shipping from the Shipping table.

import { countryName, formatPrice, PRODUCT_ID_PATTERN } from "./catalog.js";
import { checkoutCountries, NO_POSTAL_CODE, REGION_REQUIRED, shippingFor } from "./shipping.js";

// Made by the browser when the order form loads and kept until the order goes
// through, so a double click or a retry after a timeout sends the same id. The
// Worker passes it as the create's idempotency key: the same id twice is one
// record. Crockford base32 (no I, L, O, U), 10 characters = 50 random bits.
// It is also the only thing a buyer needs to come back and pay (/pay/<id>).
export const ORDER_ID_PATTERN = /^ORD-[0-9A-HJKMNP-TV-Z]{10}$/;

// The same patterns Busabase's own `email` and `phone` field types enforce, so a
// value that passes here cannot be refused by the write.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?[\d\s().-]{6,}$/;

export const LIMITS = { name: 100, email: 200, phone: 40, note: 1000, items: 20, address: 300, city: 120, region: 120, postalCode: 20 };

/** Order statuses, in lifecycle order. The website sets only the first two and the payment ones. */
export const ORDER_STATUSES = [
  "new", // an order request, no online payment: the owner confirms by email
  "awaiting-payment", // checkout with PayPal started, not paid yet
  "confirmed", // order request confirmed by the owner, waiting for payment
  "paid", // PayPal confirmed the payment (or the owner says it was paid)
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "payment-problem", // PayPal denied or reversed it, or the amount did not match: the owner looks
];

// The fields the website writes when it creates an order, and the only ones.
export const WEBSITE_ORDER_FIELDS = [
  "title",
  "order-id",
  "status",
  "payment-method",
  "customer-name",
  "email",
  "phone",
  "country",
  "address-line1",
  "address-line2",
  "city",
  "region",
  "postal-code",
  "shipping-address",
  "items-summary",
  "items",
  "subtotal",
  "shipping",
  "total",
  "currency",
  "delivery-estimate",
  "customer-note",
  "created-at",
  "source",
];

// What the website may change later on its own orders, and only after PayPal
// says so (a capture it made, or a verified webhook), plus its email log.
// Staff-only fields (`internal-note`, `reply-draft`, `tracking-number`) are
// never read or written by the website, and it never sets shipped, completed
// or cancelled.
export const WEBSITE_UPDATE_FIELDS = [
  "status",
  "paypal-order-id",
  "paypal-capture-id",
  "amount-paid",
  "paid-at",
  "payer-email",
  "refunded-amount",
  "payment-problem",
  "payment-log",
  "email-log",
];

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_OR_NEWLINE = /[\u0000-\u001F\u007F]/;

const field = (value) => (typeof value === "string" ? value.trim() : "");

const singleLine = (errors, key, raw, { max, required, pattern }) => {
  const value = field(raw).replace(/\s+/g, " ");
  if (!value) {
    if (required) errors[key] = "required";
    return "";
  }
  if (value.length > max) errors[key] = "too_long";
  else if (CONTROL_OR_NEWLINE.test(value)) errors[key] = "invalid";
  else if (pattern && !pattern.test(value)) errors[key] = "invalid";
  return value;
};

const parseItems = (raw) => {
  if (!Array.isArray(raw)) return null;
  const merged = new Map();
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = typeof item.quantity === "string" ? Number(item.quantity) : item.quantity;
    if (!PRODUCT_ID_PATTERN.test(productId) || !Number.isInteger(quantity)) return null;
    if (quantity === 0) continue;
    if (quantity < 0) return null;
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
};

const cents = (amount) => Math.round(amount * 100);

/** Which address parts a country needs: `{ region, postalCode }` → required or not. */
export const addressRules = (country) => ({ region: REGION_REQUIRED.has(country), postalCode: !NO_POSTAL_CODE.has(country) });

/**
 * Validate one checkout against the catalog it was placed from.
 *
 * `shipping` is the shop's rates (src/shipping.js; `{ status: "missing" }` for
 * a shop installed before the Shipping table). Returns `{ ok: true, order }`,
 * `{ ok: false, status: 400, errors }` (field → error code), or
 * `{ ok: false, status: 409, errors: { items: "price_changed" }, total }` when
 * the total the visitor saw is not the total now.
 */
export const validateOrder = (input, { listed, settings, shipping = { status: "missing" } }) => {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const errors = {};
  const itemErrors = [];

  const orderId = field(body.orderId);
  if (!ORDER_ID_PATTERN.test(orderId)) errors.orderId = "invalid";

  const name = singleLine(errors, "name", body.name, { max: LIMITS.name, required: true });
  const email = singleLine(errors, "email", body.email, { max: LIMITS.email, required: true, pattern: EMAIL_PATTERN });
  if (errors.email === "invalid") errors.email = "invalid_email";
  // A carrier needs a phone number for the delivery.
  const phone = singleLine(errors, "phone", body.phone, { max: LIMITS.phone, required: true, pattern: PHONE_PATTERN });
  if (errors.phone === "invalid") errors.phone = "invalid_phone";

  const country = field(body.country).toUpperCase();
  const countries = checkoutCountries(settings, shipping);
  if (!country) errors.country = "required";
  else if (!countries.includes(country)) errors.country = settings.shipsTo.includes(country) ? "no_shipping" : "invalid_country";

  // What the address needs depends on the country; a country we cannot ship to adds no more errors.
  const rules = addressRules(errors.country ? "" : country);
  const line1 = singleLine(errors, "address1", body.address1, { max: LIMITS.address, required: true });
  const line2 = singleLine(errors, "address2", body.address2, { max: LIMITS.address, required: false });
  const city = singleLine(errors, "city", body.city, { max: LIMITS.city, required: true });
  const region = singleLine(errors, "region", body.region, { max: LIMITS.region, required: rules.region });
  const postalCode = singleLine(errors, "postalCode", body.postalCode, { max: LIMITS.postalCode, required: rules.postalCode });

  const note = field(body.note).replace(/\r\n?/g, "\n");
  if (note.length > LIMITS.note) errors.note = "too_long";
  else if (CONTROL.test(note)) errors.note = "invalid";

  const items = parseItems(body.items);
  const lines = [];
  if (items === null) errors.items = "invalid";
  else if (items.length === 0) errors.items = "items_empty";
  else if (items.length > LIMITS.items) errors.items = "too_many_items";
  else {
    const byId = new Map(listed.map((product) => [product.id, product]));
    for (const { productId, quantity } of items) {
      const product = byId.get(productId);
      if (!product) {
        itemErrors.push({ productId, code: "not_available" });
        continue;
      }
      if (product.soldOut) {
        itemErrors.push({ productId, code: "sold_out", name: product.name });
        continue;
      }
      if (quantity > product.maxQuantity) {
        itemErrors.push({ productId, code: "too_many", name: product.name, max: product.maxQuantity });
        continue;
      }
      lines.push({ product, quantity });
    }
    if (itemErrors.length) errors.items = itemErrors[0].code;
  }

  const currency = settings.currency;
  const subtotalCents = lines.reduce((sum, line) => sum + cents(line.product.price) * line.quantity, 0);
  const rate = errors.country ? null : shippingFor(shipping, country, subtotalCents / 100);
  if (rate && !rate.ok) errors.country = rate.code;

  if (Object.keys(errors).length) {
    return { ok: false, status: 400, errors, itemErrors };
  }

  const shippingCents = rate.cost === null ? 0 : cents(rate.cost);
  const total = (subtotalCents + shippingCents) / 100;

  const expected = body.expectedTotal;
  if (typeof expected === "number" && Number.isFinite(expected) && Math.abs(expected - total) > 0.004) {
    return {
      ok: false,
      status: 409,
      errors: { items: "price_changed" },
      itemErrors,
      total,
      totalText: formatPrice(total, currency, settings.language),
    };
  }

  return {
    ok: true,
    order: {
      orderId,
      name,
      email,
      phone,
      country,
      address: { line1, line2, city, region, postalCode, country },
      note,
      currency,
      subtotal: subtotalCents / 100,
      shipping: rate.cost === null ? null : shippingCents / 100,
      deliveryEstimate: rate.estimate ?? "",
      total,
      lines: lines.map(({ product, quantity }) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.price,
        lineTotal: (cents(product.price) * quantity) / 100,
      })),
    },
  };
};

const money = (amount) => amount.toFixed(2);

/** The address as one block, the way it goes on a parcel. */
export const formatShippingAddress = (order) =>
  [
    order.name,
    order.address.line1,
    order.address.line2,
    [order.address.postalCode, order.address.city].filter(Boolean).join(" "),
    order.address.region,
    `${countryName(order.country, "en")} (${order.country})`,
  ]
    .filter(Boolean)
    .join("\n");

/**
 * The Orders record the website creates: only WEBSITE_ORDER_FIELDS, empty
 * optional ones left out. `payment` is `paypal` (status awaiting-payment) or
 * `request` (status new).
 */
export const orderToFields = (order, { nowIso, payment = "request" }) => {
  const lines = order.lines.map(
    (line) =>
      `${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ""} @ ${money(line.unitPrice)} ${order.currency} = ${money(line.lineTotal)} ${order.currency}`,
  );
  const fields = {
    title: `${order.orderId} · ${order.name}`,
    "order-id": order.orderId,
    status: payment === "paypal" ? "awaiting-payment" : "new",
    "payment-method": payment === "paypal" ? "paypal" : "request",
    "customer-name": order.name,
    email: order.email,
    country: `${countryName(order.country, "en")} (${order.country})`,
    "address-line1": order.address.line1,
    city: order.address.city,
    "shipping-address": formatShippingAddress(order),
    "items-summary": lines.join("\n"),
    items: JSON.stringify(
      order.lines.map((line) => ({
        product_id: line.productId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: line.lineTotal,
      })),
    ),
    subtotal: order.subtotal,
    total: order.total,
    currency: order.currency,
    "created-at": nowIso,
    source: "website",
  };
  if (order.shipping !== null && order.shipping !== undefined) fields.shipping = order.shipping;
  if (order.deliveryEstimate) fields["delivery-estimate"] = order.deliveryEstimate;
  if (order.phone) fields.phone = order.phone;
  if (order.address.line2) fields["address-line2"] = order.address.line2;
  if (order.address.region) fields.region = order.address.region;
  if (order.address.postalCode) fields["postal-code"] = order.address.postalCode;
  if (order.note) fields["customer-note"] = order.note;
  return fields;
};

const numberOrNull = (value) => {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

const str = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

const selectValue = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return str(value.id ?? value.name).toLowerCase();
  return str(value).toLowerCase();
};

/** An Orders row read back → the order shape PayPal and the emails use, plus its payment state. */
export const orderFromRecord = (record) => {
  const fields = record?.fields ?? {};
  let lines = [];
  try {
    const parsed = JSON.parse(typeof fields.items === "string" ? fields.items : "[]");
    if (Array.isArray(parsed)) {
      lines = parsed
        .filter((line) => line && typeof line === "object")
        .map((line) => ({
          productId: str(line.product_id),
          sku: str(line.sku),
          name: str(line.name),
          quantity: Number(line.quantity) || 0,
          unitPrice: numberOrNull(line.unit_price) ?? 0,
          lineTotal: numberOrNull(line.line_total) ?? 0,
        }));
    }
  } catch {
    lines = [];
  }
  const countryLabel = str(fields.country);
  const country = /\(([A-Z]{2})\)\s*$/.exec(countryLabel)?.[1] ?? "";
  return {
    recordId: typeof record?.id === "string" ? record.id : "",
    headCommitId: typeof record?.headCommitId === "string" ? record.headCommitId : "",
    orderId: str(fields["order-id"]),
    status: selectValue(fields.status),
    paymentMethod: selectValue(fields["payment-method"]) || "request",
    name: str(fields["customer-name"]),
    email: str(fields.email),
    phone: str(fields.phone),
    country,
    countryLabel,
    address: {
      line1: str(fields["address-line1"]),
      line2: str(fields["address-line2"]),
      city: str(fields.city),
      region: str(fields.region),
      postalCode: str(fields["postal-code"]),
      country,
    },
    note: typeof fields["customer-note"] === "string" ? fields["customer-note"] : "",
    lines,
    subtotal: numberOrNull(fields.subtotal),
    shipping: numberOrNull(fields.shipping),
    total: numberOrNull(fields.total) ?? 0,
    currency: str(fields.currency).toUpperCase(),
    deliveryEstimate: str(fields["delivery-estimate"]),
    paypalOrderId: str(fields["paypal-order-id"]),
    captureId: str(fields["paypal-capture-id"]),
    amountPaid: numberOrNull(fields["amount-paid"]),
    refundedAmount: numberOrNull(fields["refunded-amount"]) ?? 0,
    paymentLog: typeof fields["payment-log"] === "string" ? fields["payment-log"] : "",
    emailLog: typeof fields["email-log"] === "string" ? fields["email-log"] : "",
    paymentProblem: str(fields["payment-problem"]),
    createdAt: str(fields["created-at"]),
  };
};

/** A log field with one more dated line, newest last, kept under Busabase's longtext comfort. */
export const appendLogLines = (current, lines, max = 12_000) => {
  const next = [String(current ?? "").trimEnd(), ...lines].filter(Boolean).join("\n");
  return next.length > max ? next.slice(next.length - max).replace(/^[^\n]*\n/, "") : next;
};

/** Turn an HTML form post into the same shape the JSON API takes. */
export const orderInputFromForm = (form) => {
  const items = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("qty.")) continue;
    const quantity = Number(value);
    items.push({ productId: key.slice(4), quantity: Number.isFinite(quantity) ? Math.trunc(quantity) : Number.NaN });
  }
  const rawExpected = form.get("expectedTotal");
  const expected = rawExpected !== null && rawExpected.trim() !== "" ? Number(rawExpected) : Number.NaN;
  return {
    orderId: form.get("orderId") ?? "",
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    country: form.get("country") ?? "",
    address1: form.get("address1") ?? "",
    address2: form.get("address2") ?? "",
    city: form.get("city") ?? "",
    region: form.get("region") ?? "",
    postalCode: form.get("postalCode") ?? "",
    note: form.get("note") ?? "",
    website: form.get("company_url") ?? "",
    items,
    ...(Number.isFinite(expected) ? { expectedTotal: expected } : {}),
  };
};

/** A bot filled the field people never see. */
export const isHoneypotHit = (input) => typeof input?.website === "string" && input.website.trim() !== "";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh order id, for the form the server renders (the browser makes its own when JavaScript runs). */
export const newOrderId = (random = (bytes) => crypto.getRandomValues(bytes)) => {
  const bytes = random(new Uint8Array(10));
  let id = "ORD-";
  for (const byte of bytes) id += CROCKFORD[byte % 32];
  return id;
};
