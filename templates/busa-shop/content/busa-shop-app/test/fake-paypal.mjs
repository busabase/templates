// A stand-in for PayPal, faithful to the parts the website uses, for tests and
// for a local end-to-end run in a real browser (no PayPal account needed):
//
//   POST /v1/oauth2/token                         Basic client id:secret → token (or a client token)
//   POST /v2/checkout/orders                      create; PayPal-Request-Id is idempotent;
//                                                 a breakdown that does not add up is a 422
//   GET  /v2/checkout/orders/{id}
//   POST /v2/checkout/orders/{id}/capture         only an APPROVED order; INSTRUMENT_DECLINED,
//                                                 PENDING and ORDER_ALREADY_CAPTURED on demand
//   POST /v1/notifications/verify-webhook-signature
//        SUCCESS only when the signature matches the event bytes it signed:
//        like PayPal, the signed string is `id|time|webhookId|crc32(raw body)`,
//        so an event re-serialised on the way back fails.
//   GET  /web-sdk/v6/core                         a JavaScript SDK v6 stand-in (window.paypal),
//                                                 drawing a <paypal-button> and a "PayPal window"
//   POST /mock/approve/{id}                       what the buyer's approval does (CORS open)
//
// `deliver(url, event)` posts a signed webhook to the website, the way PayPal does.
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export const crc32 = (text) => {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text, "utf8")) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const id = (prefix, length = 17) => `${prefix}${randomBytes(12).toString("hex").toUpperCase()}`.slice(0, length);

const cents = (value) => Math.round(Number(value) * 100);

export const startFakePayPal = async ({ clientId = "TEST-CLIENT-ID", clientSecret = "mock-secret-1", webhookId = "WH-TEST-0001", host = "127.0.0.1", port = 0 } = {}) => {
  const log = [];
  const orders = new Map();
  const requestIds = new Map();
  const tokens = new Set();
  const signingKey = randomBytes(32);
  const options = { declineNextCapture: false, pendingNextCapture: false, capturedAmount: null };
  let origin = "";

  const sign = (transmissionId, time, hookId, raw) =>
    createHmac("sha256", signingKey).update(`${transmissionId}|${time}|${hookId}|${crc32(raw)}`).digest("base64");

  const sdk = () => `// PayPal JavaScript SDK v6 — a local stand-in (test/fake-paypal.mjs). Not PayPal.
(() => {
  const ORIGIN = ${JSON.stringify(origin)};
  class PayPalButton extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = '<style>button{all:unset;cursor:pointer;display:block;width:100%;max-width:420px;text-align:center;background:#ffc439;color:#003087;font:700 18px/48px Arial,sans-serif;border-radius:24px}</style><button type="button" part="button"><span style="font-style:italic">Pay</span><span style="font-style:italic;color:#009cde">Pal</span></button>';
    }
  }
  if (!customElements.get("paypal-button")) customElements.define("paypal-button", PayPalButton);
  const windowFor = (order, session) => new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-mock-paypal-window", "");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999";
    const unit = order.purchase_units[0];
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;width:min(420px,92vw);padding:24px;font:15px/1.5 Arial,sans-serif;color:#2c2e2f">'
      + '<p style="margin:0 0 4px;font:700 22px Arial;color:#003087"><i>Pay</i><i style="color:#009cde">Pal</i> <small style="font:600 11px Arial;color:#888;letter-spacing:.08em">SANDBOX MOCK</small></p>'
      + '<p style="margin:0 0 12px;color:#666">Signed in as sandbox-buyer@example.com</p>'
      + '<p style="margin:0">' + (unit.description || "") + '</p>'
      + '<p style="margin:8px 0 16px;font-size:20px"><b>' + unit.amount.value + ' ' + unit.amount.currency_code + '</b></p>'
      + '<p style="margin:0 0 16px;color:#666">Ship to: ' + (unit.shipping?.name?.full_name || "") + ', ' + (unit.shipping?.address?.address_line_1 || "") + ', ' + (unit.shipping?.address?.admin_area_2 || "") + ', ' + (unit.shipping?.address?.country_code || "") + '</p>'
      + '<button data-mock-pay style="width:100%;background:#0070ba;color:#fff;border:0;border-radius:20px;font:700 16px/40px Arial;cursor:pointer">Pay Now</button>'
      + '<button data-mock-cancel style="width:100%;margin-top:8px;background:none;border:0;color:#0070ba;font:600 14px/32px Arial;cursor:pointer">Cancel and return to the shop</button></div>';
    document.body.append(overlay);
    overlay.querySelector("[data-mock-pay]").onclick = async () => {
      await fetch(ORIGIN + "/mock/approve/" + order.id, { method: "POST" });
      overlay.remove();
      resolve("approved");
    };
    overlay.querySelector("[data-mock-cancel]").onclick = () => { overlay.remove(); resolve("cancelled"); };
  });
  window.paypal = {
    version: "6-mock",
    async createInstance(options) {
      const ok = options.clientToken || options.clientId === ${JSON.stringify(clientId)};
      if (!ok) throw new Error("mock: unknown client id");
      return {
        async findEligibleMethods({ currencyCode }) {
          return { isEligible: (method) => method === "paypal" && typeof currencyCode === "string" };
        },
        createPayPalOneTimePaymentSession(callbacks) {
          return {
            async start(startOptions, orderPromise) {
              let created;
              try { created = await orderPromise; } catch (error) { callbacks.onError?.(error); throw error; }
              const order = await (await fetch(ORIGIN + "/mock/orders/" + created.orderId)).json();
              const outcome = await windowFor(order, this);
              if (outcome === "approved") await callbacks.onApprove({ orderId: created.orderId });
              else callbacks.onCancel?.({ orderId: created.orderId });
            },
          };
        },
      };
    },
  };
})();
`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const entry = { method: req.method, path: url.pathname, headers: req.headers, body: raw };
    log.push(entry);
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
    };
    const cors = { "access-control-allow-origin": "*" };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/web-sdk/v6/core") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cors });
      return res.end(sdk());
    }
    const approve = /^\/mock\/approve\/([A-Z0-9]+)$/.exec(url.pathname);
    if (req.method === "POST" && approve) {
      const order = orders.get(approve[1]);
      if (!order) return send(404, { name: "RESOURCE_NOT_FOUND" }, cors);
      order.status = "APPROVED";
      order.payer = { email_address: "sandbox-buyer@example.com", payer_id: "MOCKPAYER01" };
      return send(200, { ok: true }, cors);
    }
    const mockGet = /^\/mock\/orders\/([A-Z0-9]+)$/.exec(url.pathname);
    if (req.method === "GET" && mockGet) {
      const order = orders.get(mockGet[1]);
      return order ? send(200, order, cors) : send(404, { name: "RESOURCE_NOT_FOUND" }, cors);
    }

    if (req.method === "POST" && url.pathname === "/v1/oauth2/token") {
      const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      if (req.headers.authorization !== expected) return send(401, { error: "invalid_client", error_description: "Client Authentication failed" });
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") !== "client_credentials") return send(400, { error: "unsupported_grant_type" });
      const token = `A21AA${randomBytes(16).toString("hex")}`;
      tokens.add(token);
      return send(200, { access_token: token, token_type: "Bearer", expires_in: 32400, ...(form.get("response_type") === "client_token" ? { domains: form.getAll("domains[]") } : {}) });
    }
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!tokens.has(bearer)) return send(401, { name: "AUTHENTICATION_FAILURE", message: "Authentication failed due to invalid authentication credentials" });

    if (req.method === "POST" && url.pathname === "/v2/checkout/orders") {
      const requestId = req.headers["paypal-request-id"];
      if (requestId && requestIds.has(requestId)) return send(200, orders.get(requestIds.get(requestId)));
      const body = JSON.parse(raw || "{}");
      const unit = body.purchase_units?.[0];
      if (body.intent !== "CAPTURE" || !unit?.amount?.value) return send(400, { name: "INVALID_REQUEST", details: [{ issue: "MISSING_REQUIRED_PARAMETER" }] });
      const breakdown = unit.amount.breakdown;
      if (breakdown) {
        const sum = cents(breakdown.item_total?.value ?? 0) + cents(breakdown.shipping?.value ?? 0);
        if (sum !== cents(unit.amount.value)) return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "AMOUNT_MISMATCH" }] });
        const items = (unit.items ?? []).reduce((total, item) => total + cents(item.unit_amount.value) * Number(item.quantity), 0);
        if (unit.items && items !== cents(breakdown.item_total.value)) return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ITEM_TOTAL_MISMATCH" }] });
      }
      const order = {
        id: id("9", 17),
        status: body.payment_source?.paypal ? "PAYER_ACTION_REQUIRED" : "CREATED",
        intent: "CAPTURE",
        purchase_units: [{ ...unit, payee: { merchant_id: "MOCKMERCHANT1" } }],
        create_time: new Date().toISOString(),
        links: [],
      };
      orders.set(order.id, order);
      if (requestId) requestIds.set(requestId, order.id);
      return send(201, order);
    }
    const orderGet = /^\/v2\/checkout\/orders\/([A-Z0-9]+)$/.exec(url.pathname);
    if (req.method === "GET" && orderGet) {
      const order = orders.get(orderGet[1]);
      return order ? send(200, order) : send(404, { name: "RESOURCE_NOT_FOUND", details: [{ issue: "INVALID_RESOURCE_ID" }] });
    }
    const capture = /^\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/.exec(url.pathname);
    if (req.method === "POST" && capture) {
      const order = orders.get(capture[1]);
      if (!order) return send(404, { name: "RESOURCE_NOT_FOUND", details: [{ issue: "INVALID_RESOURCE_ID" }] });
      if (order.status === "COMPLETED") return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
      if (order.status !== "APPROVED") return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED" }] });
      if (options.declineNextCapture) {
        options.declineNextCapture = false;
        return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "mockdebug" });
      }
      const unit = order.purchase_units[0];
      const pending = options.pendingNextCapture;
      options.pendingNextCapture = false;
      const amount = options.capturedAmount ?? unit.amount;
      options.capturedAmount = null;
      order.status = "COMPLETED";
      unit.payments = {
        captures: [
          {
            id: id("3C", 17),
            status: pending ? "PENDING" : "COMPLETED",
            ...(pending ? { status_details: { reason: "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION" } } : {}),
            amount: { currency_code: amount.currency_code, value: amount.value },
            custom_id: unit.custom_id,
            invoice_id: unit.invoice_id,
            final_capture: true,
            create_time: new Date().toISOString(),
          },
        ],
      };
      return send(201, order);
    }
    if (req.method === "POST" && url.pathname === "/v1/notifications/verify-webhook-signature") {
      // The event must come back byte for byte: take it out of the envelope as text.
      const marker = raw.indexOf('"webhook_event":');
      if (marker === -1 || !raw.endsWith("}")) return send(400, { name: "VALIDATION_ERROR" });
      const eventText = raw.slice(marker + '"webhook_event":'.length, -1);
      const envelope = JSON.parse(raw);
      const ok =
        envelope.auth_algo === "SHA256withRSA" &&
        envelope.webhook_id === webhookId &&
        envelope.cert_url?.startsWith("https://api.sandbox.paypal.com/") &&
        envelope.transmission_sig === sign(envelope.transmission_id, envelope.transmission_time, webhookId, eventText);
      return send(200, { verification_status: ok ? "SUCCESS" : "FAILURE" });
    }
    return send(404, { name: "RESOURCE_NOT_FOUND", message: `mock has no ${req.method} ${url.pathname}` });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  origin = `http://${host}:${server.address().port}`;

  /** A webhook event like PayPal's, for one of the mock's orders. */
  const eventFor = (type, resource) => ({
    id: `WH-${randomBytes(8).toString("hex").toUpperCase()}`,
    event_version: "1.0",
    create_time: new Date().toISOString(),
    resource_type: type.startsWith("CHECKOUT.") ? "checkout-order" : type.endsWith("REFUNDED") || type.endsWith("REVERSED") ? "refund" : "capture",
    event_type: type,
    summary: type,
    resource,
  });

  const events = {
    captureCompleted: (paypalOrderId, overrides = {}) => {
      const order = orders.get(paypalOrderId);
      const captureResource = order.purchase_units[0].payments.captures[0];
      return eventFor("PAYMENT.CAPTURE.COMPLETED", { ...captureResource, supplementary_data: { related_ids: { order_id: paypalOrderId } }, ...overrides });
    },
    captureDenied: (paypalOrderId) => {
      const order = orders.get(paypalOrderId);
      const unit = order.purchase_units[0];
      return eventFor("PAYMENT.CAPTURE.DENIED", { id: id("3D", 17), status: "DECLINED", amount: unit.amount, custom_id: unit.custom_id, invoice_id: unit.invoice_id });
    },
    refunded: (captureId, value, currency = "USD") =>
      // A refund made in PayPal's dashboard: no custom_id, only the link up to its capture.
      eventFor("PAYMENT.CAPTURE.REFUNDED", {
        id: id("5R", 17),
        status: "COMPLETED",
        amount: { value, currency_code: currency },
        links: [{ href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}`, rel: "up", method: "GET" }],
      }),
    reversed: (captureId, value, currency = "USD") =>
      eventFor("PAYMENT.CAPTURE.REVERSED", {
        id: id("6V", 17),
        status: "COMPLETED",
        amount: { value, currency_code: currency },
        links: [{ href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}`, rel: "up", method: "GET" }],
      }),
    orderApproved: (paypalOrderId) => eventFor("CHECKOUT.ORDER.APPROVED", { ...orders.get(paypalOrderId) }),
  };

  /** Post a webhook the way PayPal does: its headers, signed over the exact bytes sent. */
  const deliver = async (url, event, { tamper = false, deliverFetch = fetch } = {}) => {
    const raw = JSON.stringify(event);
    const transmissionId = randomBytes(16).toString("hex");
    const time = new Date().toISOString();
    const signature = sign(transmissionId, time, webhookId, tamper ? `${raw} ` : raw);
    return deliverFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-mock",
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": time,
      },
      body: raw,
    });
  };

  return {
    origin,
    sdkUrl: `${origin}/web-sdk/v6/core`,
    clientId,
    clientSecret,
    webhookId,
    log,
    orders,
    options,
    events,
    deliver,
    /** What the buyer does in PayPal's window. */
    approve: (paypalOrderId) => {
      const order = orders.get(paypalOrderId);
      order.status = "APPROVED";
      order.payer = { email_address: "sandbox-buyer@example.com", payer_id: "MOCKPAYER01" };
    },
    /** Forget orders and idempotency keys, as a fresh sandbox would. */
    reset: () => {
      orders.clear();
      requestIds.clear();
      log.length = 0;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
