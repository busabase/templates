// Order request validation and the exact Orders fields the website writes.
// Pure: the catalog and settings come in, a verdict comes out
// (test/orders.test.mjs). The Worker never trusts a price, a name or a total
// from the browser — every line is rebuilt from the catalog it just served.

import { countryName, formatPrice, PRODUCT_ID_PATTERN } from "./catalog.js";

// Made by the browser when the order form loads and kept until the order goes
// through, so a double click or a retry after a timeout sends the same id. The
// Worker passes it as the create's idempotency key: the same id twice is one
// record. Crockford base32 (no I, L, O, U), 10 characters = 50 random bits.
export const ORDER_ID_PATTERN = /^ORD-[0-9A-HJKMNP-TV-Z]{10}$/;

// The same patterns Busabase's own `email` and `phone` field types enforce, so a
// value that passes here cannot be refused by the write.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?[\d\s().-]{6,}$/;

export const LIMITS = { name: 100, email: 200, phone: 40, note: 1000, items: 20 };

// The fields the website writes, and the only ones. `internal-note` and
// `reply-draft` are staff-only; the website never reads or writes them, and
// never changes an order after creating it.
export const WEBSITE_ORDER_FIELDS = [
  "title",
  "order-id",
  "status",
  "customer-name",
  "email",
  "phone",
  "country",
  "items-summary",
  "items",
  "total",
  "currency",
  "customer-note",
  "created-at",
  "source",
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

/**
 * Validate one order request against the catalog it was placed from.
 *
 * Returns `{ ok: true, order }`, `{ ok: false, status: 400, errors }` (field →
 * error code), or `{ ok: false, status: 409, errors: { items: "price_changed" },
 * total }` when the total the visitor saw is not the total now.
 */
export const validateOrder = (input, { listed, settings }) => {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const errors = {};
  const itemErrors = [];

  const orderId = field(body.orderId);
  if (!ORDER_ID_PATTERN.test(orderId)) errors.orderId = "invalid";

  const name = singleLine(errors, "name", body.name, { max: LIMITS.name, required: true });
  const email = singleLine(errors, "email", body.email, {
    max: LIMITS.email,
    required: true,
    pattern: EMAIL_PATTERN,
  });
  if (errors.email === "invalid") errors.email = "invalid_email";
  const phone = singleLine(errors, "phone", body.phone, { max: LIMITS.phone, required: false, pattern: PHONE_PATTERN });
  if (errors.phone === "invalid") errors.phone = "invalid_phone";

  const country = field(body.country).toUpperCase();
  if (!country) errors.country = "required";
  else if (!settings.shipsTo.includes(country)) errors.country = "invalid_country";

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

  if (Object.keys(errors).length) {
    return { ok: false, status: 400, errors, itemErrors };
  }

  const currency = settings.currency;
  const totalCents = lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0);
  const total = totalCents / 100;

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
      note,
      currency,
      total,
      lines: lines.map(({ product, quantity }) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.price,
        lineTotal: (Math.round(product.price * 100) * quantity) / 100,
      })),
    },
  };
};

/** The Orders record the website creates: exactly WEBSITE_ORDER_FIELDS, empty optional ones left out. */
export const orderToFields = (order, { nowIso }) => {
  const money = (amount) => amount.toFixed(2);
  const lines = order.lines.map(
    (line) =>
      `${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ""} @ ${money(line.unitPrice)} ${order.currency} = ${money(line.lineTotal)} ${order.currency}`,
  );
  const fields = {
    title: `${order.orderId} · ${order.name}`,
    "order-id": order.orderId,
    status: "new",
    "customer-name": order.name,
    email: order.email,
    country: `${countryName(order.country, "en")} (${order.country})`,
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
    total: order.total,
    currency: order.currency,
    "created-at": nowIso,
    source: "website",
  };
  if (order.phone) fields.phone = order.phone;
  if (order.note) fields["customer-note"] = order.note;
  return fields;
};

/** Turn an HTML form post into the same shape the JSON API takes. */
export const orderInputFromForm = (form) => {
  const items = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("qty.")) continue;
    const quantity = Number(value);
    items.push({ productId: key.slice(4), quantity: Number.isFinite(quantity) ? Math.trunc(quantity) : Number.NaN });
  }
  const expected = Number(form.get("expectedTotal"));
  return {
    orderId: form.get("orderId") ?? "",
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    country: form.get("country") ?? "",
    note: form.get("note") ?? "",
    website: form.get("company_url") ?? "",
    items,
    ...(form.get("expectedTotal") !== null && Number.isFinite(expected) ? { expectedTotal: expected } : {}),
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
