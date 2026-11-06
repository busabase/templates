// The site's request handler, separate from src/worker.js so tests can build
// it with a fake Busabase client. See src/worker.js for the route list.

import { createBusabaseClient } from "busabase-sdk";
import { createAirAppRecords } from "busabase-sdk/airapp";
import { PRODUCT_ID_PATTERN } from "./catalog.js";
import { isHoneypotHit, newOrderId, orderInputFromForm, validateOrder } from "./orders.js";
import {
  homePage,
  notFoundPage,
  orderPage,
  productPage,
  setupPage,
  thanksPage,
  unavailablePage,
} from "./pages.js";
import { buildRobots, buildSitemap } from "./seo.js";
import { createShop, ShopUnavailableError } from "./shop.js";
import { translator } from "./i18n.js";

export const MAX_ORDER_BODY_BYTES = 16 * 1024;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'",
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

const defaultDeps = {
  createClient: createBusabaseClient,
  createRecords: createAirAppRecords,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  log: console,
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

const readLimited = async (request) => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_ORDER_BODY_BYTES) return null;
  const body = await request.text();
  return new TextEncoder().encode(body).length > MAX_ORDER_BODY_BYTES ? null : body;
};

/** Build the fetch handler. Tests inject a fake client; the default export uses busabase-sdk. */
export const createHandler = (overrides = {}) => {
  const deps = { ...defaultDeps, ...overrides };
  const shops = new WeakMap();

  const shopFor = (env) => {
    let shop = shops.get(env);
    if (!shop) {
      const baseUrl = env.BUSABASE_BASE_URL;
      const client = deps.createClient({
        baseUrl,
        apiKey: env.BUSABASE_API_KEY,
        spaceId: env.BUSABASE_SPACE_ID,
      });
      shop = createShop({
        client,
        records: deps.createRecords(client, { appId: "busa-shop" }),
        busabaseOrigin: new URL(baseUrl).origin,
        apiKey: env.BUSABASE_API_KEY,
        fetchImpl: deps.fetch,
        now: deps.now,
        log: deps.log,
      });
      shops.set(env, shop);
    }
    return shop;
  };

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

  const postOrder = async (request, url, env) => {
    // A browser posting from another site is refused. The members-only preview
    // is the one other origin allowed: Busabase serves it through its own
    // proxy (`/api/airapp-preview/<node>/…` on the Busabase origin), so the
    // page that posts there has Busabase's origin, not this site's.
    // (A workspace may be opened on a subdomain of that host, so those count.)
    // There are no cookies here, so this only stops another site's page from
    // posting through a visitor's browser; it is not spam protection.
    if (!allowedOrigin(request.headers.get("origin"), url.origin, env.BUSABASE_BASE_URL)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
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

    const shop = shopFor(env);
    const state = await shop.load();
    if (state.setup !== "ready") {
      return isForm ? notReady(state) : json({ ok: false, error: "not_ready", setup: state.setup }, 503);
    }
    const { settings } = state;
    const t = translator(settings.language);
    const formPage = (props, status) =>
      html(
        orderPage({
          origin: url.origin,
          settings,
          catalog: state.catalog,
          lines: linesFromInput(input, state),
          values: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            country: typeof input.country === "string" ? input.country.toUpperCase() : "",
            note: input.note,
          },
          orderId: typeof input.orderId === "string" && input.orderId ? input.orderId : newOrderId(),
          ordersReady: Boolean(state.ordersBaseId),
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
        ? html(thanksPage({ origin: url.origin, settings, orderId, email: String(input.email ?? "") }), { cache: "no-store" })
        : json({ ok: true, orderId });
    }

    const verdict = validateOrder(input, { listed: state.catalog.listed, settings });
    if (!verdict.ok) {
      if (isForm) {
        const first = verdict.itemErrors?.[0];
        return formPage(
          {
            errors: verdict.errors,
            values: {
              name: input.name,
              email: input.email,
              phone: input.phone,
              country: typeof input.country === "string" ? input.country.toUpperCase() : "",
              note: input.note,
              errorValues: { name: first?.name ?? "", max: first?.max ?? "", total: verdict.totalText ?? "" },
            },
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

    try {
      await shop.createOrder(state, verdict.order);
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
    return isForm
      ? html(thanksPage({ origin: url.origin, settings, orderId, email }), { cache: "no-store" })
      : json({ ok: true, orderId });
  };

  const imageRoute = async (request, env, ctx, productId, index) => {
    const cache = typeof caches !== "undefined" ? caches.default : undefined;
    const hit = cache ? await cache.match(request) : undefined;
    if (hit) return hit;
    const shop = shopFor(env);
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

  const route = async (request, env, ctx) => {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const method = request.method;
    const isRead = method === "GET" || method === "HEAD";

    if (path.startsWith("/static/") || path === "/favicon.svg") return assets(request, env, null);
    if (path === "/api/orders") {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      return postOrder(request, url, env);
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

    const isPage = path === "/" || path === "/order" || path.startsWith("/products/") || path === "/sitemap.xml";
    if (!isPage && path !== "/api/status") return assets(request, env, null);

    const state = await shopFor(env).load();
    if (path === "/api/status") {
      return json({
        ok: state.setup === "ready",
        setup: state.setup,
        products: state.setup === "ready" ? state.catalog.listed.length : 0,
        ordering: state.setup === "ready" && Boolean(state.ordersBaseId),
        ...(state.setup === "ready" ? { productsFrom: state.productsFrom } : {}),
      });
    }
    if (state.setup !== "ready") {
      return path === "/sitemap.xml" ? plain("Not ready", 503, undefined, "no-store") : notReady(state);
    }
    const { settings, catalog } = state;

    if (path === "/") return html(homePage({ origin: url.origin, settings, catalog }));
    if (path === "/sitemap.xml") return plain(buildSitemap(url.origin, catalog.listed), 200, "application/xml; charset=utf-8");
    if (path === "/order") {
      return html(
        orderPage({
          origin: url.origin,
          settings,
          catalog,
          lines: orderLinesFromQuery(url, state),
          orderId: newOrderId(),
          ordersReady: Boolean(state.ordersBaseId),
        }),
        { cache: "no-store" },
      );
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
      if (product) return html(productPage({ origin: url.origin, settings, product }));
    }
    return html(notFoundPage({ settings }), { status: 404, cache: "no-store" });
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
