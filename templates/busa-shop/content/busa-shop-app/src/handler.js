// The site's request handler, separate from src/worker.js so tests can build
// it with a fake Busabase client. See src/worker.js for the route list.

import { createBusabaseClient } from "busabase-sdk";
import { createAirAppRecords } from "busabase-sdk/airapp";
import { formatPrice, PRODUCT_ID_PATTERN } from "./catalog.js";
import { translator } from "./i18n.js";
import { composeEmails, EMAIL_SKIP_REASONS, emailLogLines, smtpConfig } from "./mail.js";
import {
  appendLogLines,
  isHoneypotHit,
  newOrderId,
  ORDER_ID_PATTERN,
  orderInputFromForm,
  validateOrder,
} from "./orders.js";
import {
  homePage,
  notFoundPage,
  orderPage,
  payPage,
  policyPage,
  productPage,
  setupPage,
  thanksPage,
  unavailablePage,
} from "./pages.js";
import {
  captureOf,
  createOrderBody,
  createPayPalClient,
  decideWebhook,
  eventOrderRef,
  HANDLED_EVENTS,
  ourOrderIdOf,
  PAYPAL_API,
  PAYPAL_CAPTURE_ID_PATTERN,
  PAYPAL_CURRENCIES,
  PAYPAL_ORDER_ID_PATTERN,
  PAYPAL_SDK,
  PayPalError,
  paypalValue,
  sameAmount,
} from "./paypal.js";
import { PAGE_SLUG_PATTERN, unfinishedPages } from "./policies.js";
import { buildRobots, buildSitemap } from "./seo.js";
import { checkoutCountries } from "./shipping.js";
import { createShop, ShopUnavailableError } from "./shop.js";
import { sendMail } from "./smtp.js";
import { createSecretsReader, readShopSecrets } from "./vault.js";

export const MAX_ORDER_BODY_BYTES = 16 * 1024;
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'",
};

// PayPal's button is PayPal's own script, frames and styles. Only the pay page
// allows them (https://developer.paypal.com/sdk/js/csp/ lists these hosts).
const PAYPAL_HOSTS = ["https://*.paypal.com", "https://*.paypalobjects.com", "https://*.venmo.com"];
export const paypalCsp = (sdkUrl) => {
  const hosts = [...new Set([...PAYPAL_HOSTS, new URL(sdkUrl).origin])].join(" ");
  return `default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' ${hosts}; script-src 'self' ${hosts}; connect-src 'self' ${hosts}; frame-src ${hosts}; child-src ${hosts}; form-action 'self'; base-uri 'none'; object-src 'none'`;
};

const html = (body, { status = 200, cache = "public, max-age=60", extra = {} } = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, ...SECURITY_HEADERS, ...extra },
  });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS },
  });

const plain = (body, status = 200, type = "text/plain; charset=utf-8", cache = "public, max-age=300") =>
  new Response(body, { status, headers: { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff" } });

const NOT_READY = { cache: "no-store", extra: { "retry-after": "300", "x-robots-tag": "noindex" } };
const PRIVATE = { cache: "no-store", extra: { "x-robots-tag": "noindex" } };

// `cloudflare:sockets` exists only on the Website engine (a Cloudflare Worker),
// and Busabase's site check allows exactly this kind of import: a literal
// `cloudflare:` specifier (a computed `import(x)` is refused). It is loaded
// lazily, the first time an email goes out, so Node (npm run dev, which
// passes env.SOCKETS instead) and the browser engine (no key, so no email)
// never load it. esbuild leaves a `cloudflare:` import as it is.

const defaultDeps = {
  createClient: createBusabaseClient,
  createRecords: createAirAppRecords,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  log: console,
  loadConnect: async (env) => {
    if (typeof env?.SOCKETS?.connect === "function") return (...args) => env.SOCKETS.connect(...args);
    try {
      const sockets = await import("cloudflare:sockets");
      return typeof sockets.connect === "function" ? sockets.connect : null;
    } catch {
      return null;
    }
  },
  sendMail,
};

/** No Origin (a plain form post from an old browser, a script), this site, or the Busabase host and its subdomains. */
export const allowedOrigin = (origin, siteOrigin, busabaseBaseUrl) => {
  if (!origin) return true;
  if (origin === siteOrigin) return true;
  try {
    const from = new URL(origin);
    const busabase = new URL(busabaseBaseUrl);
    return from.protocol === busabase.protocol && (from.host === busabase.host || from.host.endsWith(`.${busabase.host}`));
  } catch {
    return false;
  }
};

const readLimited = async (request, max = MAX_ORDER_BODY_BYTES) => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  const body = await request.text();
  return new TextEncoder().encode(body).length > max ? null : body;
};

const isoNow = (deps) => new Date(deps.now()).toISOString();

/** Build the fetch handler. Tests inject a fake client; the default export uses busabase-sdk. */
export const createHandler = (overrides = {}) => {
  const deps = { ...defaultDeps, ...overrides };
  const sites = new WeakMap();

  /** Everything kept per env (one env per deploy): the shop, its secrets reader, its PayPal client. */
  const siteFor = (env) => {
    let site = sites.get(env);
    if (!site) {
      const baseUrl = env.BUSABASE_BASE_URL;
      const client = deps.createClient({
        baseUrl,
        apiKey: env.BUSABASE_API_KEY,
        spaceId: env.BUSABASE_SPACE_ID,
      });
      const shop = createShop({
        client,
        records: deps.createRecords(client, { appId: "busa-shop" }),
        busabaseOrigin: new URL(baseUrl).origin,
        apiKey: env.BUSABASE_API_KEY,
        fetchImpl: deps.fetch,
        now: deps.now,
        log: deps.log,
      });
      const secrets = createSecretsReader({
        now: deps.now,
        read: () => readShopSecrets({ baseUrl, apiKey: env.BUSABASE_API_KEY, spaceId: env.BUSABASE_SPACE_ID, fetchImpl: deps.fetch }),
      });
      site = { shop, secrets, paypal: null };
      sites.set(env, site);
    }
    return site;
  };

  const needsSecrets = (settings) => settings.paypalMode !== "off" || Boolean(settings.smtpHost);

  /** The two secrets when this shop uses them and this engine can read them; `{}` otherwise. */
  const secretsFor = async (env, state) => {
    if (!env.BUSABASE_API_KEY || !needsSecrets(state.settings)) return { secrets: {}, error: env.BUSABASE_API_KEY ? "" : "no-key" };
    const result = await siteFor(env).secrets.get();
    if (result.error && result.error !== "no-key") deps.log.warn?.("busa-shop: Vault runtime values unreadable", result.error);
    return result;
  };

  /**
   * How this shop takes payment right now: PayPal when Settings, the Vault
   * and the engine all allow it, otherwise order requests, with the reason.
   */
  const paymentsFor = (env, state, vault) => {
    const settings = state.settings;
    const mode = settings.paypalMode;
    if (mode === "off") return { payment: "request", reason: "off" };
    if (!env.BUSABASE_API_KEY) return { payment: "request", reason: "browser-engine" };
    if (!settings.paypalClientId) return { payment: "request", reason: "no-client-id" };
    if (!PAYPAL_CURRENCIES.has(settings.currency)) return { payment: "request", reason: "currency-not-supported" };
    if (state.shipping.status !== "ready") return { payment: "request", reason: "no-shipping-table" };
    if (!vault.secrets.paypalSecret) return { payment: "request", reason: vault.error ? "vault-unreadable" : "no-secret" };
    return {
      payment: "paypal",
      mode,
      clientId: settings.paypalClientId,
      // Test hooks: a deploy never sets these, so the live site always talks to PayPal itself.
      apiBase: env.PAYPAL_API_BASE || PAYPAL_API[mode],
      sdkUrl: env.PAYPAL_SDK_URL || PAYPAL_SDK[mode],
      secret: vault.secrets.paypalSecret,
    };
  };

  const paypalClientFor = (env, payments) => {
    const site = siteFor(env);
    const key = `${payments.apiBase}|${payments.clientId}`;
    if (!site.paypal || site.paypal.key !== key || site.paypal.secret !== payments.secret) {
      site.paypal = {
        key,
        secret: payments.secret,
        client: createPayPalClient({ apiBase: payments.apiBase, clientId: payments.clientId, clientSecret: payments.secret, fetchImpl: deps.fetch, now: deps.now }),
      };
    }
    return site.paypal.client;
  };

  const siteInfo = (state, payments) => ({ pages: state.pages ?? [], payment: payments?.payment ?? "request" });

  const checkoutFor = (state, payments) => ({
    payment: payments.payment,
    countries: checkoutCountries(state.settings, state.shipping),
    shipping: state.shipping,
  });

  // ---- Email: after the order is saved, never in the way of it ----

  /**
   * Send the emails for one moment of an order, then add what happened to its
   * Email log. Runs in `ctx.waitUntil`, after the answer has gone to the
   * buyer; it never throws. Skipped (and logged once) when SMTP is not set up.
   */
  const sendOrderEmails = async ({ env, state, orderId, kind, heloName, problem = "" }) => {
    // The browser engine has no key and no sockets: no email, and no extra write in the viewer's name.
    // A shop that never set up SMTP (no host) sends none and says nothing.
    if (!env.BUSABASE_API_KEY || !state.settings.smtpHost) return;
    const shop = siteFor(env).shop;
    try {
      const vault = await secretsFor(env, state);
      const config = smtpConfig(state.settings, vault.secrets, { canConnect: true });
      const order = await shop.findOrder(state, orderId);
      if (!order) return;
      let lines;
      if (!config.ready) {
        if (order.emailLog.includes(EMAIL_SKIP_REASONS[config.reason])) return;
        lines = [`${isoNow(deps)} ${EMAIL_SKIP_REASONS[config.reason]}`];
      } else {
        // Never the same email twice for one order (a retried checkout, a webhook racing the browser).
        const messages = composeEmails(kind, order, state.settings, config, { problem }).filter(
          (message) => !new RegExp(`\\bsent ${message.tag} to `).test(order.emailLog),
        );
        if (!messages.length) return;
        const connect = await deps.loadConnect(env);
        let results;
        try {
          results = await deps.sendMail({
            connect,
            host: config.host,
            port: config.port,
            security: config.security,
            username: config.username,
            password: config.password,
            heloName,
            messages,
          });
        } catch (error) {
          results = messages.map((message) => ({ tag: message.tag, to: message.to, ok: false, error: error?.message ?? String(error) }));
        }
        for (const result of results) {
          if (!result.ok) deps.log.warn?.("busa-shop: email not sent", orderId, result.tag, result.error);
        }
        lines = emailLogLines(results, isoNow(deps));
      }
      await shop.updateOrder(state, orderId, (current) => ({ fields: { "email-log": appendLogLines(current.emailLog, lines) } }), `Email log for ${orderId}`);
    } catch (error) {
      deps.log.warn?.("busa-shop: email step failed", orderId, error?.message ?? error);
    }
  };

  const later = (ctx, work) => {
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else work.catch(() => {});
  };

  // ---- Shared bits of the routes ----

  const assets = async (request, env, settings) => {
    if (env.ASSETS?.fetch) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    }
    return html(notFoundPage({ settings }), { status: 404, cache: "no-store" });
  };

  const notReady = (state) => html(setupPage({ code: state.setup }), { status: 503, ...NOT_READY });

  const orderLinesFromQuery = (url, state) => {
    const productId = url.searchParams.get("add") ?? "";
    const product = state.catalog.listed.find((item) => item.id === productId);
    if (!product || product.soldOut) return [];
    const qty = Math.trunc(Number(url.searchParams.get("qty") ?? "1"));
    const quantity = Number.isFinite(qty) && qty > 0 ? Math.min(qty, product.maxQuantity) : 1;
    return [{ product, quantity }];
  };

  const linesFromInput = (input, state) => {
    const byId = new Map(state.catalog.listed.map((product) => [product.id, product]));
    return (Array.isArray(input.items) ? input.items : [])
      .map(({ productId, quantity }) => ({ product: byId.get(productId), quantity }))
      .filter((line) => line.product && !line.product.soldOut && Number.isInteger(line.quantity) && line.quantity > 0)
      .map((line) => ({ ...line, quantity: Math.min(line.quantity, line.product.maxQuantity) }));
  };

  /** A browser POST from somewhere else is refused; see postOrder for why the Busabase host is allowed. */
  const crossSite = (request, url, env) => !allowedOrigin(request.headers.get("origin"), url.origin, env.BUSABASE_BASE_URL);

  const readJsonBody = async (request) => {
    const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") return { error: json({ ok: false, error: "unsupported_media_type" }, 415) };
    const raw = await readLimited(request);
    if (raw === null) return { error: json({ ok: false, error: "too_large" }, 413) };
    try {
      const body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) return { error: json({ ok: false, error: "invalid" }, 400) };
      return { body };
    } catch {
      return { error: json({ ok: false, error: "invalid_json" }, 400) };
    }
  };

  // ---- POST /api/orders: checkout ----

  const postOrder = async (request, url, env, ctx) => {
    // A browser posting from another site is refused. The members-only preview
    // is the one other origin allowed: Busabase serves it through its own
    // proxy (`/api/airapp-preview/<node>/…` on the Busabase origin), so the
    // page that posts there has Busabase's origin, not this site's.
    // (A workspace may be opened on a subdomain of that host, so those count.)
    // There are no cookies here, so this only stops another site's page from
    // posting through a visitor's browser; it is not spam protection.
    if (crossSite(request, url, env)) return json({ ok: false, error: "forbidden" }, 403);
    const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const isForm = type === "application/x-www-form-urlencoded";
    if (type !== "application/json" && !isForm) return json({ ok: false, error: "unsupported_media_type" }, 415);
    const raw = await readLimited(request);
    if (raw === null) return json({ ok: false, error: "too_large" }, 413);
    let input;
    try {
      input = isForm ? orderInputFromForm(new URLSearchParams(raw)) : JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ ok: false, error: "invalid" }, 400);

    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (state.setup !== "ready") {
      return isForm ? notReady(state) : json({ ok: false, error: "not_ready", setup: state.setup }, 503);
    }
    const { settings } = state;
    const vault = await secretsFor(env, state);
    const payments = paymentsFor(env, state, vault);
    const site = siteInfo(state, payments);
    const t = translator(settings.language);
    const values = {
      name: input.name,
      email: input.email,
      phone: input.phone,
      country: typeof input.country === "string" ? input.country.toUpperCase() : "",
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      note: input.note,
    };
    const formPage = (props, status) =>
      html(
        orderPage({
          origin: url.origin,
          settings,
          catalog: state.catalog,
          lines: linesFromInput(input, state),
          values,
          orderId: typeof input.orderId === "string" && input.orderId ? input.orderId : newOrderId(),
          ordersReady: Boolean(state.ordersBaseId),
          checkout: checkoutFor(state, payments),
          site,
          ...props,
        }),
        { status, cache: "no-store" },
      );

    if (!state.ordersBaseId) {
      return isForm ? formPage({}, 503) : json({ ok: false, error: "ordering_unavailable" }, 503);
    }

    // A bot filled the field people never see: answer like a success, write nothing.
    if (isHoneypotHit(input)) {
      const orderId = typeof input.orderId === "string" ? input.orderId : "";
      return isForm
        ? html(thanksPage({ origin: url.origin, settings, orderId, email: String(input.email ?? ""), site }), { cache: "no-store" })
        : json({ ok: true, orderId, payment: "request" });
    }

    const verdict = validateOrder(input, { listed: state.catalog.listed, settings, shipping: state.shipping });
    if (!verdict.ok) {
      if (isForm) {
        const first = verdict.itemErrors?.[0];
        return formPage(
          {
            errors: verdict.errors,
            values: { ...values, errorValues: { name: first?.name ?? "", max: first?.max ?? "", total: verdict.totalText ?? "" } },
            status: verdict.status === 409 ? t("error_price_changed", { total: verdict.totalText }) : t("error_fix"),
          },
          verdict.status,
        );
      }
      return json(
        {
          ok: false,
          errors: verdict.errors,
          itemErrors: verdict.itemErrors ?? [],
          ...(verdict.status === 409
            ? {
                total: verdict.total,
                totalText: verdict.totalText,
                products: state.catalog.listed.map((product) => ({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  priceText: product.priceText,
                  maxQuantity: product.maxQuantity,
                  soldOut: product.soldOut,
                })),
              }
            : {}),
        },
        verdict.status,
      );
    }

    // PayPal needs an amount it can write exactly (no decimals in JPY, HUF, TWD).
    const payment = payments.payment === "paypal" && paypalValue(verdict.order.total, settings.currency) !== null ? "paypal" : "request";
    try {
      await shop.createOrder(state, verdict.order, { payment });
    } catch (error) {
      if (!(error instanceof ShopUnavailableError)) throw error;
      const message = [
        t("error_unavailable"),
        settings.contactEmail ? t("error_unavailable_contact", { email: settings.contactEmail }) : "",
      ]
        .filter(Boolean)
        .join(" ");
      return isForm ? formPage({ status: message }, 503) : json({ ok: false, error: "unavailable" }, 503);
    }
    const { orderId, email } = verdict.order;
    if (payment === "request") {
      later(ctx, sendOrderEmails({ env, state, orderId, kind: "request", heloName: url.hostname }));
      return isForm
        ? html(thanksPage({ origin: url.origin, settings, orderId, email, site }), { cache: "no-store" })
        : json({ ok: true, orderId, payment: "request" });
    }
    if (isForm) {
      const order = await shop.findOrder(state, orderId);
      if (order) return payPageResponse(url, state, order, payments);
    }
    return json({ ok: true, orderId, payment: "paypal", payPath: `/pay/${orderId}` });
  };

  // ---- GET /pay/<order id> ----

  const payPageResponse = (url, state, order, payments) => {
    const showButton = order.status === "awaiting-payment" && payments.payment === "paypal" && order.currency === state.settings.currency;
    const paypal = showButton ? { clientId: payments.clientId, sdkUrl: payments.sdkUrl } : null;
    return html(payPage({ origin: url.origin, settings: state.settings, order, paypal, site: siteInfo(state, payments) }), {
      cache: "no-store",
      extra: { ...PRIVATE.extra, ...(paypal ? { "content-security-policy": paypalCsp(paypal.sdkUrl) } : {}) },
    });
  };

  const getPay = async (url, env, orderId) => {
    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (state.setup !== "ready") return notReady(state);
    const vault = await secretsFor(env, state);
    const payments = paymentsFor(env, state, vault);
    const order = ORDER_ID_PATTERN.test(orderId) ? await shop.findOrder(state, orderId) : null;
    if (!order) return html(notFoundPage({ settings: state.settings, site: siteInfo(state, payments) }), { status: 404, ...PRIVATE });
    return payPageResponse(url, state, order, payments);
  };

  // ---- PayPal: create, capture, webhook ----

  /** Load the shop, its secrets and PayPal for a JSON PayPal route; or the error response to give. */
  const paypalContext = async (env) => {
    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (state.setup !== "ready") return { error: json({ ok: false, error: "not_ready", setup: state.setup }, 503) };
    const vault = await secretsFor(env, state);
    const payments = paymentsFor(env, state, vault);
    if (payments.payment !== "paypal") return { error: json({ ok: false, error: "paypal_off", reason: payments.reason }, 409) };
    return { shop, state, payments, paypal: paypalClientFor(env, payments) };
  };

  /** A client token for this site's domain, for the PayPal SDK when the client id alone is not enough. */
  const postClientToken = async (request, url, env) => {
    if (crossSite(request, url, env)) return json({ ok: false, error: "forbidden" }, 403);
    const context = await paypalContext(env);
    if (context.error) return context.error;
    const origin = allowedOrigin(request.headers.get("origin"), url.origin, env.BUSABASE_BASE_URL) && request.headers.get("origin") ? request.headers.get("origin") : url.origin;
    try {
      return json({ ok: true, clientToken: await context.paypal.clientToken(origin) });
    } catch (failure) {
      deps.log.error?.("busa-shop: PayPal client token refused", failure?.message ?? failure);
      return json({ ok: false, error: "paypal_error" }, 502);
    }
  };

  const REUSABLE_PAYPAL_STATUSES = new Set(["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED"]);

  const postCreatePayPalOrder = async (request, url, env) => {
    if (crossSite(request, url, env)) return json({ ok: false, error: "forbidden" }, 403);
    const { body, error } = await readJsonBody(request);
    if (error) return error;
    const orderId = String(body.orderId ?? "");
    if (!ORDER_ID_PATTERN.test(orderId)) return json({ ok: false, error: "invalid" }, 400);
    const context = await paypalContext(env);
    if (context.error) return context.error;
    const { shop, state, payments, paypal } = context;
    const order = await shop.findOrder(state, orderId);
    if (!order) return json({ ok: false, error: "not_found" }, 404);
    if (order.status !== "awaiting-payment") return json({ ok: false, error: "not_payable", status: order.status }, 409);
    if (order.currency !== state.settings.currency || paypalValue(order.total, order.currency) === null) {
      return json({ ok: false, error: "not_payable", status: order.status }, 409);
    }
    try {
      // A PayPal order made for this one before, still waiting for the buyer, is used again.
      if (order.paypalOrderId) {
        const existing = await paypal.getOrder(order.paypalOrderId).catch(() => null);
        const unit = existing?.purchase_units?.[0];
        if (
          existing &&
          REUSABLE_PAYPAL_STATUSES.has(existing.status) &&
          ourOrderIdOf(existing) === orderId &&
          sameAmount({ value: unit?.amount?.value, currency: unit?.amount?.currency_code }, { value: order.total, currency: order.currency })
        ) {
          return json({ ok: true, id: existing.id });
        }
      }
      const attempt = (order.paymentLog.match(/created PayPal order/g) ?? []).length + 1;
      const created = await paypal.createOrder(
        createOrderBody(order, { storeName: state.settings.storeName, locale: { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES" }[state.settings.language] }),
        `${orderId}-${attempt}`,
      );
      if (!PAYPAL_ORDER_ID_PATTERN.test(String(created?.id ?? ""))) throw new PayPalError("PayPal answered without an order id");
      await shop.updateOrder(
        state,
        orderId,
        (current) => ({
          fields: {
            "paypal-order-id": created.id,
            "payment-log": appendLogLines(current.paymentLog, [`${isoNow(deps)} created PayPal order ${created.id} (${payments.mode})`]),
          },
        }),
        `PayPal order ${created.id} for ${orderId}`,
      );
      return json({ ok: true, id: created.id });
    } catch (failure) {
      if (failure instanceof ShopUnavailableError) throw failure;
      deps.log.error?.("busa-shop: PayPal order not created", orderId, failure?.message ?? failure);
      return json({ ok: false, error: "paypal_error", issue: failure?.issue ?? "" }, 502);
    }
  };

  /**
   * Mark an order paid from a completed capture, exactly once whoever gets
   * there first (this route or the webhook); send the receipt if this call
   * was the one that marked it. Returns the decision that was applied.
   */
  const applyCapture = async ({ env, ctx, url, state, orderId, paypalOrderId, capture, source }) => {
    const shop = siteFor(env).shop;
    const { result } = await shop.updateOrder(
      state,
      orderId,
      (current) => {
        const alreadyPaid = ["paid", "shipped", "completed"].includes(current.status);
        if (alreadyPaid) return null;
        const line = `${isoNow(deps)} ${source}: capture ${capture.captureId} ${capture.status} for ${capture.amount.value} ${capture.amount.currency}`;
        const base = {
          "paypal-order-id": paypalOrderId,
          "paypal-capture-id": capture.captureId,
          ...(capture.payerEmail ? { "payer-email": capture.payerEmail } : {}),
        };
        if (capture.status === "PENDING") {
          return {
            kind: "pending",
            fields: {
              ...base,
              "payment-problem": `${isoNow(deps).slice(0, 10)}: PayPal is holding this payment (${capture.reason || "pending"}). It is not paid yet: look at it in your PayPal account.`,
              "payment-log": appendLogLines(current.paymentLog, [`${line} (pending)`]),
            },
          };
        }
        if (capture.status !== "COMPLETED") {
          return { kind: "declined", fields: { "payment-log": appendLogLines(current.paymentLog, [`${line} (not completed)`]) } };
        }
        if (!sameAmount(capture.amount, { value: current.total, currency: current.currency })) {
          return {
            kind: "problem",
            problem: `PayPal captured ${capture.amount.value} ${capture.amount.currency}, but this order is ${current.total} ${current.currency}. Check the payment in PayPal before shipping.`,
            fields: {
              ...base,
              status: "payment-problem",
              "amount-paid": Number(capture.amount.value) || 0,
              "payment-problem": `${isoNow(deps).slice(0, 10)}: PayPal captured ${capture.amount.value} ${capture.amount.currency}, but this order is ${current.total} ${current.currency}. Check the payment in PayPal before shipping.`,
              "payment-log": appendLogLines(current.paymentLog, [`${line}: AMOUNT MISMATCH`]),
            },
          };
        }
        return {
          kind: "paid",
          fields: {
            ...base,
            status: "paid",
            "amount-paid": Number(capture.amount.value),
            "paid-at": capture.createTime || isoNow(deps),
            "payment-log": appendLogLines(current.paymentLog, [`${line} → paid`]),
          },
        };
      },
      (decision) => (decision.kind === "paid" ? `Paid with PayPal: ${orderId} (capture ${capture.captureId})` : `PayPal ${decision.kind}: ${orderId}`),
    );
    if (result?.kind === "paid") later(ctx, sendOrderEmails({ env, state, orderId, kind: "paid", heloName: url.hostname }));
    if (result?.kind === "problem") later(ctx, sendOrderEmails({ env, state, orderId, kind: "problem", heloName: url.hostname, problem: result.problem }));
    return result;
  };

  /** Capture an approved PayPal order of ours (the buyer's onApprove, or a CHECKOUT.ORDER.APPROVED webhook). */
  const captureNow = async ({ env, ctx, url, state, paypal, orderId, paypalOrderId, source }) => {
    const paypalOrder = await paypal.getOrder(paypalOrderId);
    if (ourOrderIdOf(paypalOrder) !== orderId) return { error: "not_this_order" };
    let captured = captureOf(paypalOrder);
    if (!captured || paypalOrder.status !== "COMPLETED") {
      if (paypalOrder.status !== "APPROVED") return { error: "not_approved", paypalStatus: paypalOrder.status };
      try {
        // A fresh request id per attempt: after INSTRUMENT_DECLINED the buyer
        // picks another way to pay and the capture is tried again, which an
        // idempotent replay of the first attempt would refuse.
        captured = captureOf(await paypal.captureOrder(paypalOrderId, `${orderId}-capture-${deps.now()}`));
      } catch (failure) {
        // The webhook and the buyer's browser both tried: the other one won. Read what it captured.
        if (failure?.issue !== "ORDER_ALREADY_CAPTURED") throw failure;
        captured = captureOf(await paypal.getOrder(paypalOrderId));
      }
    }
    if (!captured || !PAYPAL_CAPTURE_ID_PATTERN.test(captured.captureId)) return { error: "no_capture" };
    const result = await applyCapture({ env, ctx, url, state, orderId, paypalOrderId, capture: captured, source });
    return { captured, result };
  };

  const postCapture = async (request, url, env, ctx) => {
    if (crossSite(request, url, env)) return json({ ok: false, error: "forbidden" }, 403);
    const { body, error } = await readJsonBody(request);
    if (error) return error;
    const orderId = String(body.orderId ?? "");
    const paypalOrderId = String(body.paypalOrderId ?? "");
    if (!ORDER_ID_PATTERN.test(orderId) || !PAYPAL_ORDER_ID_PATTERN.test(paypalOrderId)) return json({ ok: false, error: "invalid" }, 400);
    const context = await paypalContext(env);
    if (context.error) return context.error;
    const { shop, state, paypal } = context;
    const order = await shop.findOrder(state, orderId);
    if (!order) return json({ ok: false, error: "not_found" }, 404);
    if (["paid", "shipped", "completed"].includes(order.status)) return json({ ok: true, status: "paid", orderId });
    if (order.status !== "awaiting-payment") return json({ ok: false, error: "not_payable", status: order.status }, 409);
    try {
      const outcome = await captureNow({ env, ctx, url, state, paypal, orderId, paypalOrderId, source: "buyer approved" });
      if (outcome.error) return json({ ok: false, error: outcome.error }, 409);
      const { captured, result } = outcome;
      if (captured.status === "PENDING") return json({ ok: true, status: "pending", orderId });
      if (captured.status !== "COMPLETED") return json({ ok: false, error: "declined" }, 402);
      if (result?.kind === "problem") return json({ ok: true, status: "problem", orderId });
      const after = await shop.findOrder(state, orderId);
      return json({
        ok: true,
        status: after?.status === "payment-problem" ? "problem" : "paid",
        orderId,
        amountText: formatPrice(Number(captured.amount.value), captured.amount.currency, state.settings.language),
      });
    } catch (failure) {
      if (failure instanceof ShopUnavailableError) throw failure;
      deps.log.error?.("busa-shop: PayPal capture failed", orderId, failure?.message ?? failure);
      // PayPal's standard integration: a declined instrument lets the buyer pick another one.
      if (failure?.issue === "INSTRUMENT_DECLINED") return json({ ok: false, error: "instrument_declined" }, 422);
      return json({ ok: false, error: "paypal_error", issue: failure?.issue ?? "" }, 502);
    }
  };

  /**
   * POST /api/paypal/webhook. Every event is checked with PayPal's
   * verify-webhook-signature before anything is read from it; then it is
   * matched to one order, applied once (its id goes into Payment log), and
   * answered 200. Anything that should make PayPal try again (Busabase or
   * PayPal unreachable, the webhook id not set yet) is a 503: PayPal retries
   * for three days.
   */
  const postWebhook = async (request, url, env, ctx) => {
    const raw = await readLimited(request, MAX_WEBHOOK_BODY_BYTES);
    if (raw === null) return json({ ok: false, error: "too_large" }, 413);
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!event || typeof event !== "object" || typeof event.id !== "string") return json({ ok: false, error: "invalid" }, 400);
    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (state.setup !== "ready") return json({ ok: false, error: "not_ready" }, 503);
    const vault = await secretsFor(env, state);
    const payments = paymentsFor(env, state, vault);
    if (payments.payment !== "paypal") {
      deps.log.warn?.("busa-shop: PayPal webhook arrived, but PayPal is not set up here", payments.reason);
      return json({ ok: false, error: "paypal_off" }, 503);
    }
    if (!state.settings.paypalWebhookId) {
      deps.log.warn?.("busa-shop: PayPal webhook arrived, but Settings › PayPal webhook ID is empty, so it cannot be verified");
      return json({ ok: false, error: "no_webhook_id" }, 503);
    }
    const paypal = paypalClientFor(env, payments);
    let genuine;
    try {
      genuine = await paypal.verifyWebhook({ headers: request.headers, rawBody: raw, webhookId: state.settings.paypalWebhookId });
    } catch (failure) {
      deps.log.error?.("busa-shop: PayPal webhook not verified", failure?.message ?? failure);
      return json({ ok: false, error: "verify_unavailable" }, 503);
    }
    if (!genuine) {
      deps.log.warn?.("busa-shop: PayPal webhook signature did not verify", event.id);
      return json({ ok: false, error: "signature" }, 400);
    }
    const type = String(event.event_type ?? "");
    if (!HANDLED_EVENTS.has(type)) return json({ ok: true, ignored: type });

    const ref = eventOrderRef(event);
    let order = ORDER_ID_PATTERN.test(ref.ourId) ? await shop.findOrder(state, ref.ourId) : null;
    if (!order && PAYPAL_CAPTURE_ID_PATTERN.test(ref.captureId)) order = await shop.findOrderByCapture(state, ref.captureId);
    if (!order) {
      deps.log.warn?.("busa-shop: PayPal webhook for an order this shop does not have", type, event.id);
      return json({ ok: true, ignored: "unknown_order" });
    }
    if (order.paymentLog.includes(event.id)) return json({ ok: true, duplicate: true });

    if (type === "CHECKOUT.ORDER.APPROVED") {
      const decision = decideWebhook(event, order, { nowIso: isoNow(deps) });
      if (decision.kind === "capture" && PAYPAL_ORDER_ID_PATTERN.test(ref.paypalOrderId)) {
        try {
          await captureNow({ env, ctx, url, state, paypal, orderId: order.orderId, paypalOrderId: ref.paypalOrderId, source: `webhook ${event.id}` });
        } catch (failure) {
          if (failure instanceof ShopUnavailableError) throw failure;
          deps.log.error?.("busa-shop: capture after approval failed", order.orderId, failure?.message ?? failure);
          return json({ ok: false, error: "capture_failed" }, 503);
        }
      }
      await shop.updateOrder(
        state,
        order.orderId,
        (current) =>
          current.paymentLog.includes(event.id)
            ? null
            : { fields: { "payment-log": appendLogLines(current.paymentLog, [`${isoNow(deps)} PayPal ${event.id} ${type}: ${decision.note}`]) } },
        `PayPal ${type} for ${order.orderId}`,
      );
      return json({ ok: true });
    }

    const { result } = await shop.updateOrder(
      state,
      order.orderId,
      (current) => {
        if (current.paymentLog.includes(event.id)) return null;
        const decision = decideWebhook(event, current, { nowIso: isoNow(deps) });
        if (decision.kind === "ignore") return null;
        return {
          ...decision,
          fields: { ...decision.fields, "payment-log": appendLogLines(current.paymentLog, [`${isoNow(deps)} PayPal ${event.id} ${type}: ${decision.note}`]) },
        };
      },
      (decision) => `PayPal ${type} for ${order.orderId}${decision.kind === "paid" ? ": paid" : ""}`,
    );
    if (result?.kind === "paid") later(ctx, sendOrderEmails({ env, state, orderId: order.orderId, kind: "paid", heloName: url.hostname }));
    if (result?.kind === "problem" && result.fields.status === "payment-problem") {
      later(ctx, sendOrderEmails({ env, state, orderId: order.orderId, kind: "problem", heloName: url.hostname, problem: result.fields["payment-problem"] }));
    }
    return json({ ok: true });
  };

  // ---- Images ----

  const imageRoute = async (request, env, ctx, productId, index) => {
    const cache = typeof caches !== "undefined" ? caches.default : undefined;
    const hit = cache ? await cache.match(request) : undefined;
    if (hit) return hit;
    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (state.setup !== "ready") return plain("Not found", 404, undefined, "no-store");
    const image = await shop.productImage(state, productId, index);
    if (!image) return plain("Not found", 404, undefined, "no-store");
    const response = new Response(image.body, {
      headers: {
        "content-type": image.type,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
        // An SVG opened on its own must not run anything on the shop's origin.
        "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      },
    });
    if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  };

  // ---- /api/status: readiness only, never a value ----

  const statusBody = async (env, state) => {
    if (state.setup !== "ready") return { ok: false, setup: state.setup, products: 0, ordering: false };
    const vault = await secretsFor(env, state);
    const payments = paymentsFor(env, state, vault);
    const email = smtpConfig(state.settings, vault.secrets, { canConnect: Boolean(env.BUSABASE_API_KEY) });
    return {
      ok: true,
      setup: state.setup,
      products: state.catalog.listed.length,
      ordering: Boolean(state.ordersBaseId) && checkoutCountries(state.settings, state.shipping).length > 0,
      productsFrom: state.productsFrom,
      payments: payments.payment === "paypal" ? `paypal-${payments.mode}` : "requests",
      ...(payments.payment === "paypal" ? {} : { paymentsNote: payments.reason }),
      shipping: state.shipping.status === "ready" ? { countries: checkoutCountries(state.settings, state.shipping).length, problems: state.shipping.problems.length } : state.shipping.status,
      email: email.ready ? "ready" : email.reason,
      pages: state.pages.length,
      ...(unfinishedPages(state.pages).length ? { pagesToFinish: unfinishedPages(state.pages) } : {}),
    };
  };

  const route = async (request, env, ctx) => {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const method = request.method;
    const isRead = method === "GET" || method === "HEAD";

    if (path.startsWith("/static/") || path === "/favicon.svg") return assets(request, env, null);
    if (path === "/api/orders") {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      return postOrder(request, url, env, ctx);
    }
    if (path === "/api/paypal/orders" || path === "/api/paypal/capture" || path === "/api/paypal/webhook" || path === "/api/paypal/client-token") {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (path === "/api/paypal/orders") return postCreatePayPalOrder(request, url, env);
      if (path === "/api/paypal/client-token") return postClientToken(request, url, env);
      if (path === "/api/paypal/capture") return postCapture(request, url, env, ctx);
      return postWebhook(request, url, env, ctx);
    }
    if (!isRead) return plain("Method not allowed", 405, undefined, "no-store");
    if (path === "/robots.txt") return plain(buildRobots(url.origin));

    const imageMatch = /^\/images\/([^/]{1,240})\/(\d{1,2})$/.exec(path);
    if (imageMatch) {
      let productId;
      try {
        productId = decodeURIComponent(imageMatch[1]);
      } catch {
        return plain("Not found", 404, undefined, "no-store");
      }
      if (!PRODUCT_ID_PATTERN.test(productId)) return plain("Not found", 404, undefined, "no-store");
      return imageRoute(request, env, ctx, productId, Number(imageMatch[2]));
    }

    const payMatch = /^\/pay\/([^/]{1,40})$/.exec(path);
    if (payMatch) return getPay(url, env, payMatch[1]);

    const isPage =
      path === "/" || path === "/order" || path.startsWith("/products/") || path.startsWith("/pages/") || path === "/sitemap.xml";
    if (!isPage && path !== "/api/status") return assets(request, env, null);

    const shop = siteFor(env).shop;
    const state = await shop.load();
    if (path === "/api/status") return json(await statusBody(env, state));
    if (state.setup !== "ready") {
      return path === "/sitemap.xml" ? plain("Not ready", 503, undefined, "no-store") : notReady(state);
    }
    const { settings, catalog } = state;
    // Product and policy pages are the same for every visitor: they say
    // "PayPal" from Settings alone, without reading the Vault on each view.
    const payment = settings.paypalMode !== "off" && settings.paypalClientId && env.BUSABASE_API_KEY && state.shipping.status === "ready" ? "paypal" : "request";
    const site = { pages: state.pages, payment };

    if (path === "/") return html(homePage({ origin: url.origin, settings, catalog, site }));
    if (path === "/sitemap.xml") {
      return plain(buildSitemap(url.origin, catalog.listed, state.pages), 200, "application/xml; charset=utf-8");
    }
    if (path === "/order") {
      const vault = await secretsFor(env, state);
      const payments = paymentsFor(env, state, vault);
      return html(
        orderPage({
          origin: url.origin,
          settings,
          catalog,
          lines: orderLinesFromQuery(url, state),
          orderId: newOrderId(),
          ordersReady: Boolean(state.ordersBaseId),
          checkout: checkoutFor(state, payments),
          site: siteInfo(state, payments),
          // No key: the browser engine (Busabase Cloud Free), the owner's own tab.
          browserPreview: !env.BUSABASE_API_KEY,
        }),
        { cache: "no-store" },
      );
    }
    const pageMatch = /^\/pages\/([^/]+)$/.exec(path);
    if (pageMatch) {
      const slug = pageMatch[1].toLowerCase();
      const page = PAGE_SLUG_PATTERN.test(slug) ? state.pages.find((item) => item.slug === slug) : null;
      if (page) return html(policyPage({ origin: url.origin, settings, page, site }));
      return html(notFoundPage({ settings, site }), { status: 404, cache: "no-store" });
    }
    const productMatch = /^\/products\/([^/]+)$/.exec(path);
    if (productMatch) {
      let productId = "";
      try {
        productId = decodeURIComponent(productMatch[1]);
      } catch {
        productId = "";
      }
      const product = catalog.listed.find((item) => item.id === productId);
      if (product) return html(productPage({ origin: url.origin, settings, product, site }));
    }
    return html(notFoundPage({ settings, site }), { status: 404, cache: "no-store" });
  };

  return async (request, env, ctx) => {
    let response;
    try {
      if (!env?.BUSABASE_BASE_URL) throw new ShopUnavailableError("BUSABASE_BASE_URL is not set");
      response = await route(request, env, ctx);
    } catch (error) {
      if (!(error instanceof ShopUnavailableError)) deps.log.error?.("busa-shop: unexpected error", error?.message ?? error);
      const path = new URL(request.url).pathname;
      response = path.startsWith("/api/")
        ? json({ ok: false, error: "unavailable" }, 503)
        : html(unavailablePage(), { status: 503, ...NOT_READY });
    }
    if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
    return response;
  };
};
