// PayPal, the way PayPal's standard integration says to do it: the browser
// shows PayPal's own button (JavaScript SDK v6), and THIS server creates and
// captures the PayPal order with the REST API (Orders v2), so the amount is
// never the browser's to choose.
//
//   POST /v1/oauth2/token                              client id + secret → access token
//   POST /v2/checkout/orders                           create (intent CAPTURE)
//   GET  /v2/checkout/orders/{id}                      read it back before capturing
//   POST /v2/checkout/orders/{id}/capture              take the money
//   POST /v1/notifications/verify-webhook-signature    is this webhook really from PayPal?
//
// Docs used (2026-11):
//   https://developer.paypal.com/docs/checkout/standard/integrate/   (server create/capture; INSTRUMENT_DECLINED)
//   https://developer.paypal.com/sdk/js/set-up/                     (JS SDK v6: web-sdk/v6/core, createInstance with clientId)
//   https://developer.paypal.com/docsai/payments/methods/paypal/sdk/js/v6/paypal-checkout  (v6 one-time payment session)
//   https://developer.paypal.com/api/rest/webhooks/rest/            (verify-webhook-signature, raw body, retries)
//   https://developer.paypal.com/docs/api/orders/v2/                (order body, custom_id, invoice_id, shipping)
//   https://developer.paypal.com/docs/api/reference/currency-codes/ (currencies, no decimals for HUF/JPY/TWD)
//
// The client secret comes from the Busabase Vault at runtime (src/vault.js),
// never from a table or a file. Nothing here logs it, or an access token.

export const PAYPAL_API = { sandbox: "https://api-m.sandbox.paypal.com", live: "https://api-m.paypal.com" };
export const PAYPAL_SDK = { sandbox: "https://www.sandbox.paypal.com/web-sdk/v6/core", live: "https://www.paypal.com/web-sdk/v6/core" };

// Currencies the PayPal REST API takes for payments. The last three take no decimals.
export const PAYPAL_CURRENCIES = new Set(
  "AUD BRL CAD CNY CZK DKK EUR HKD HUF ILS JPY MYR MXN TWD NZD NOK PHP PLN GBP SGD SEK CHF THB USD".split(" "),
);
export const NO_DECIMAL_CURRENCIES = new Set(["HUF", "JPY", "TWD"]);

export const PAYPAL_ORDER_ID_PATTERN = /^[A-Z0-9]{5,40}$/;
export const PAYPAL_CAPTURE_ID_PATTERN = /^[A-Z0-9]{5,40}$/;

/** A money value as PayPal wants it: "12.50", or "1250" for JPY. `null` when it cannot be written exactly. */
export const paypalValue = (amount, currency) => {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  if (NO_DECIMAL_CURRENCIES.has(currency)) return Number.isInteger(amount) ? String(amount) : null;
  return (Math.round(amount * 100) / 100).toFixed(2);
};

const cents = (value) => Math.round(Number(value) * 100);

/** Same amount and currency, to the cent. PayPal sends strings ("66.50"); orders store numbers. */
export const sameAmount = (paid, expected) =>
  Boolean(paid && expected) &&
  String(paid.currency).toUpperCase() === String(expected.currency).toUpperCase() &&
  Number.isFinite(Number(paid.value)) &&
  cents(paid.value) === cents(expected.value);

const cut = (value, max) => String(value ?? "").slice(0, max);

/**
 * The create-order body for one of our orders. `order` is what the Orders row
 * holds (src/orders.js `orderFromRecord`): our order id is the PayPal order's
 * `custom_id` and `invoice_id`, which is how a capture or a webhook finds its
 * way back to the row. The address the buyer typed at checkout is sent as the
 * shipping address (`SET_PROVIDED_ADDRESS`): PayPal shows it, and its Seller
 * Protection needs it on the transaction.
 */
export const createOrderBody = (order, { storeName, locale }) => {
  const currency = order.currency;
  const value = paypalValue(order.total, currency);
  if (value === null) throw new Error(`total ${order.total} cannot be written in ${currency}`);
  const items = (order.lines ?? []).map((line) => ({
    name: cut(line.name || line.productId, 127),
    quantity: String(line.quantity),
    unit_amount: { currency_code: currency, value: paypalValue(line.unitPrice, currency) },
    ...(line.sku ? { sku: cut(line.sku, 127) } : {}),
    category: "PHYSICAL_GOODS",
  }));
  const itemTotal = items.reduce((sum, item) => sum + cents(item.unit_amount.value) * Number(item.quantity), 0);
  const shippingCents = cents(order.shipping ?? 0);
  // PayPal refuses an order whose breakdown does not add up. If staff edited a
  // total by hand, send the amount alone rather than a breakdown that lies.
  const consistent =
    items.every((item) => item.unit_amount.value !== null) &&
    itemTotal + shippingCents === cents(value) &&
    paypalValue(itemTotal / 100, currency) !== null;
  const address = order.address ?? {};
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: order.orderId,
        custom_id: order.orderId,
        invoice_id: order.orderId,
        description: cut(`${storeName || "Shop"} order ${order.orderId}`, 127),
        amount: {
          currency_code: currency,
          value,
          ...(consistent
            ? {
                breakdown: {
                  item_total: { currency_code: currency, value: paypalValue(itemTotal / 100, currency) },
                  shipping: { currency_code: currency, value: paypalValue(shippingCents / 100, currency) },
                },
              }
            : {}),
        },
        ...(consistent ? { items } : {}),
        shipping: {
          name: { full_name: cut(order.name, 300) },
          address: {
            address_line_1: cut(address.line1, 300),
            ...(address.line2 ? { address_line_2: cut(address.line2, 300) } : {}),
            admin_area_2: cut(address.city, 120),
            ...(address.region ? { admin_area_1: cut(address.region, 300) } : {}),
            ...(address.postalCode ? { postal_code: cut(address.postalCode, 60) } : {}),
            country_code: address.country,
          },
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: cut(storeName || "Shop", 127),
          shipping_preference: "SET_PROVIDED_ADDRESS",
          user_action: "PAY_NOW",
          ...(locale ? { locale } : {}),
        },
      },
    },
  };
};

/** Our order id as a PayPal order carries it (custom_id, else invoice_id). */
export const ourOrderIdOf = (paypalOrder) => {
  const unit = paypalOrder?.purchase_units?.[0];
  return String(unit?.custom_id || unit?.invoice_id || "");
};

/** The capture inside a capture (or GET order) response: `{ captureId, status, amount, payerEmail } | null`. */
export const captureOf = (paypalOrder) => {
  const unit = paypalOrder?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (!capture) return null;
  return {
    captureId: String(capture.id ?? ""),
    status: String(capture.status ?? ""),
    amount: { value: String(capture.amount?.value ?? ""), currency: String(capture.amount?.currency_code ?? "") },
    reason: String(capture.status_details?.reason ?? ""),
    createTime: String(capture.create_time ?? ""),
    payerEmail: String(paypalOrder?.payer?.email_address ?? paypalOrder?.payment_source?.paypal?.email_address ?? ""),
  };
};

/** The first `issue` in a PayPal error body (`INSTRUMENT_DECLINED`, `ORDER_ALREADY_CAPTURED`…), or "". */
export const paypalIssue = (body) => String(body?.details?.[0]?.issue ?? body?.name ?? "");

export class PayPalError extends Error {
  constructor(message, { status = 0, issue = "", debugId = "" } = {}) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.issue = issue;
    this.debugId = debugId;
  }
}

/**
 * A small PayPal REST client. `apiBase` is PAYPAL_API[mode]; the local preview
 * and the tests point it at a mock. The access token is kept in memory until a
 * minute before it expires.
 */
export const createPayPalClient = ({ apiBase, clientId, clientSecret, fetchImpl = fetch, now = () => Date.now() }) => {
  let token = null; // { value, expiresAt }

  const accessToken = async () => {
    if (token && now() < token.expiresAt) return token.value;
    const response = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== "string") {
      throw new PayPalError(`PayPal refused the client id / secret (${response.status} ${body.error ?? ""})`.trim(), {
        status: response.status,
        issue: String(body.error ?? "AUTHENTICATION_FAILURE"),
      });
    }
    const seconds = Number(body.expires_in) || 300;
    token = { value: body.access_token, expiresAt: now() + Math.max(30, seconds - 60) * 1000 };
    return token.value;
  };

  const call = async (method, path, { body, rawBody, requestId } = {}) => {
    const headers = {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
      accept: "application/json",
      prefer: "return=representation",
      ...(requestId ? { "paypal-request-id": requestId } : {}),
    };
    const response = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers,
      ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) token = null;
    if (!response.ok) {
      throw new PayPalError(`PayPal ${method} ${path.replace(/\/[A-Z0-9]{5,40}(?=\/|$)/g, "/…")} → ${response.status} ${paypalIssue(data)}`.trim(), {
        status: response.status,
        issue: paypalIssue(data),
        debugId: String(data?.debug_id ?? ""),
      });
    }
    return data;
  };

  /**
   * A browser-safe client token for the JavaScript SDK (`createInstance({ clientToken })`),
   * bound to the shop's own domain. Only used when the SDK will not start from the
   * client id alone (https://developer.paypal.com/sdk/js/set-up/).
   */
  const clientToken = async (domain) => {
    const response = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", response_type: "client_token", "domains[]": domain }).toString(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== "string") {
      throw new PayPalError(`PayPal gave no client token (${response.status})`, { status: response.status, issue: String(body.error ?? "") });
    }
    return body.access_token;
  };

  return {
    clientToken,
    createOrder: (body, requestId) => call("POST", "/v2/checkout/orders", { body, requestId }),
    getOrder: (paypalOrderId) => call("GET", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`),
    captureOrder: (paypalOrderId, requestId) =>
      call("POST", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { rawBody: "{}", requestId }),
    /**
     * Ask PayPal whether a webhook delivery is genuine. The event goes back
     * byte for byte as it arrived (PayPal: "exactly as it was received"), so
     * the body is assembled around the raw text instead of re-serialised.
     */
    verifyWebhook: async ({ headers, rawBody, webhookId }) => {
      const get = (name) => headers.get(name) ?? "";
      const envelope =
        `{"auth_algo":${JSON.stringify(get("paypal-auth-algo"))},` +
        `"cert_url":${JSON.stringify(get("paypal-cert-url"))},` +
        `"transmission_id":${JSON.stringify(get("paypal-transmission-id"))},` +
        `"transmission_sig":${JSON.stringify(get("paypal-transmission-sig"))},` +
        `"transmission_time":${JSON.stringify(get("paypal-transmission-time"))},` +
        `"webhook_id":${JSON.stringify(webhookId)},` +
        `"webhook_event":${rawBody}}`;
      const data = await call("POST", "/v1/notifications/verify-webhook-signature", { rawBody: envelope });
      return data?.verification_status === "SUCCESS";
    },
  };
};

// ---- Webhook events → what happens to the order ----
//
// Pure: one verified event and the order as stored → one decision. The
// handler (src/handler.js) does the reading, writing and emailing.

export const HANDLED_EVENTS = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "CHECKOUT.ORDER.APPROVED",
]);

/** The capture id a refund or reversal belongs to, from its `up` link. */
export const parentCaptureId = (resource) => {
  const up = (resource?.links ?? []).find((link) => link?.rel === "up" && typeof link.href === "string");
  return /\/v2\/payments\/captures\/([A-Z0-9]{5,40})/.exec(up?.href ?? "")?.[1] ?? "";
};

/** How a webhook event points back at our order: our id, or (refunds) the capture id we stored. */
export const eventOrderRef = (event) => {
  const resource = event?.resource ?? {};
  const type = String(event?.event_type ?? "");
  const ourId = type.startsWith("CHECKOUT.ORDER.")
    ? ourOrderIdOf(resource)
    : String(resource.custom_id || resource.invoice_id || "");
  const captureId = type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.CAPTURE.REVERSED" ? parentCaptureId(resource) : String(resource.id ?? "");
  return { ourId, captureId, paypalOrderId: type.startsWith("CHECKOUT.ORDER.") ? String(resource.id ?? "") : String(resource.supplementary_data?.related_ids?.order_id ?? "") };
};

const FINAL_STATUSES = new Set(["shipped", "completed"]);

/**
 * Decide what one verified event does to one order. Returns
 * `{ kind, fields, note, emails }`:
 *   kind   "paid" | "problem" | "refund" | "capture" | "log" | "ignore"
 *   fields the Orders fields to write (never staff-only ones)
 *   note   the payment-log line's tail
 */
export const decideWebhook = (event, order, { nowIso }) => {
  const type = String(event?.event_type ?? "");
  const resource = event?.resource ?? {};
  const amount = { value: String(resource.amount?.value ?? ""), currency: String(resource.amount?.currency_code ?? "") };
  const expected = { value: order.total, currency: order.currency };
  const money = `${amount.value} ${amount.currency}`.trim();
  const isPaid = order.status === "paid" || FINAL_STATUSES.has(order.status);

  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    if (isPaid && (!order.captureId || order.captureId === resource.id)) {
      return { kind: "log", fields: order.captureId ? {} : { "paypal-capture-id": String(resource.id) }, note: `capture ${resource.id} completed (already marked paid)` };
    }
    if (!sameAmount(amount, expected)) {
      return {
        kind: "problem",
        fields: {
          status: "payment-problem",
          "paypal-capture-id": String(resource.id ?? ""),
          "amount-paid": Number(amount.value) || 0,
          "payment-problem": `${nowIso.slice(0, 10)}: PayPal captured ${money}, but this order is ${paypalValue(order.total, order.currency) ?? order.total} ${order.currency}. Check the payment in PayPal before shipping.`,
        },
        note: `capture ${resource.id} completed for ${money}: AMOUNT MISMATCH`,
      };
    }
    return {
      kind: "paid",
      fields: {
        status: "paid",
        "paypal-capture-id": String(resource.id ?? ""),
        "amount-paid": Number(amount.value),
        "paid-at": resource.create_time || nowIso,
      },
      note: `capture ${resource.id} completed for ${money} → paid`,
    };
  }
  if (type === "PAYMENT.CAPTURE.PENDING") {
    if (isPaid) return { kind: "log", fields: {}, note: `capture ${resource.id} pending (order already paid)` };
    const reason = String(resource.status_details?.reason ?? "");
    return {
      kind: "problem",
      fields: {
        "paypal-capture-id": String(resource.id ?? ""),
        "payment-problem": `${nowIso.slice(0, 10)}: PayPal is holding this payment (${reason || "pending"}). It is not paid yet: look at it in your PayPal account.`,
      },
      note: `capture ${resource.id} pending ${reason}`.trim(),
      keepStatus: true,
    };
  }
  if (type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.DECLINED") {
    if (isPaid && order.captureId && order.captureId !== resource.id) {
      return { kind: "log", fields: {}, note: `capture ${resource.id} denied (another capture already paid this order)` };
    }
    return {
      kind: "problem",
      fields: {
        status: "payment-problem",
        "payment-problem": `${nowIso.slice(0, 10)}: PayPal denied the payment (capture ${resource.id}). Nothing was received. Do not ship.`,
      },
      note: `capture ${resource.id} denied`,
    };
  }
  if (type === "PAYMENT.CAPTURE.REFUNDED") {
    const refunded = Math.round(((order.refundedAmount ?? 0) + (Number(amount.value) || 0)) * 100) / 100;
    const paid = order.amountPaid ?? order.total;
    const full = refunded + 0.004 >= paid;
    return {
      kind: "refund",
      fields: {
        "refunded-amount": refunded,
        ...(full ? { status: "refunded" } : {}),
      },
      note: `refund ${resource.id} of ${money}${full ? " → refunded" : ` (partial: ${refunded} ${order.currency} refunded in total)`}`,
    };
  }
  if (type === "PAYMENT.CAPTURE.REVERSED") {
    return {
      kind: "problem",
      fields: {
        status: "payment-problem",
        "payment-problem": `${nowIso.slice(0, 10)}: PayPal reversed this payment (${money}): the money went back to the buyer, usually a chargeback or a dispute. Do not ship; open the case in PayPal's Resolution Center.`,
      },
      note: `reversal ${resource.id} of ${money}`,
    };
  }
  if (type === "CHECKOUT.ORDER.APPROVED") {
    if (isPaid || order.status !== "awaiting-payment") return { kind: "log", fields: {}, note: `PayPal order ${resource.id} approved (order is ${order.status})` };
    return { kind: "capture", fields: {}, note: `PayPal order ${resource.id} approved: capturing` };
  }
  return { kind: "ignore", fields: {}, note: `${type} not handled` };
};
