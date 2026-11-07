// The data side of the site: one bounded read plan, cached in the Worker's
// memory, the order lookups and writes, and the image fetch. Everything that
// talks to Busabase is here (and src/vault.js for the two secrets), and it only
// ever calls these procedures:
//
//   nodes.list({ types: ["base", "airapp"] })   find the tables (src/resources.js)
//   records.list  Settings (5 rows), Products (100), Certificates (100),
//                 Shipping (100), Pages (50)
//   records.get   ONE Orders row, by its exact Order ID (or, for a PayPal
//                 refund, its exact PayPal capture ID)
//   bases.createChangeRequest    one Orders row per checkout
//   records.changeRequest        that row's payment fields, after PayPal confirms,
//                                and its email log (src/orders.js WEBSITE_UPDATE_FIELDS)
//   fileTrees.readFile  one image file inside the Product Hub AirApp (product hub tables only)
//
// Nothing a visitor sends is passed through to the API as a Base, record id,
// path, filter or body. The one visitor value that reaches it is an order id,
// and only after it matched ORD- plus ten Crockford characters, as the exact
// value of the Order ID field of this shop's own Orders table.

import { buildCatalog, normalizeSettings } from "./catalog.js";
import { orderFromRecord, orderToFields } from "./orders.js";
import { buildPages, PAGES_LIMIT } from "./policies.js";
import { resolveProductTables, resolveShopExtras, resolveShopTables, SHOP_APP_ID } from "./resources.js";
import { buildShippingRates } from "./shipping.js";

export const CATALOG_TTL_MS = 60_000; // a change in the workspace shows within a minute
export const STALE_IF_ERROR_MS = 10 * 60_000; // keep serving the last good catalog through a short outage
export const PRODUCTS_PAGE = 100; // the shop lists at most the first 100 products of the table
export const CERTIFICATES_PAGE = 100;
export const SETTINGS_PAGE = 5;
export const SHIPPING_PAGE = 100;
export const UPDATE_ATTEMPTS = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class ShopUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ShopUnavailableError";
    this.cause = cause;
  }
}

const describeError = (error) => error?.status ?? error?.code ?? error?.name ?? "error";

const isConflict = (error) => error?.status === 409 || error?.code === "CONFLICT";

/** Read one optional table of this shop: `{ status: "ready", records } | { status: "missing" | "unreadable" }`. */
const readOptional = async (records, resource, limit, log, label) => {
  if (resource.status === "missing") return { status: "missing", records: [] };
  if (resource.status === "ambiguous") {
    log.warn?.(`busa-shop: more than one ${label} table in this shop's folder`);
    return { status: "unreadable", records: [] };
  }
  try {
    const page = await records.readPage({ baseId: resource.node.baseId, limit });
    return { status: "ready", records: page.records };
  } catch (error) {
    log.warn?.(`busa-shop: ${label} unreadable`, describeError(error));
    return { status: "unreadable", records: [] };
  }
};

/**
 * One shop per Worker isolate. `client` is a busabase-sdk client and `records`
 * the SDK's `createAirAppRecords(client, …)` helpers; tests pass fakes.
 */
export const createShop = ({ client, records, busabaseOrigin, apiKey, fetchImpl = fetch, now = () => Date.now(), log = console }) => {
  let cached = null; // { value, at }
  let inFlight = null;

  const readCatalog = async () => {
    const nodes = (await client.nodes.list({ types: ["base", "airapp"] })) ?? [];
    const shop = resolveShopTables(nodes);
    if (shop.settings.status !== "found") {
      return { setup: shop.settings.status === "ambiguous" ? "settings-ambiguous" : "settings-missing" };
    }
    const settingsPage = await records.readPage({ baseId: shop.settings.node.baseId, limit: SETTINGS_PAGE });
    const settingsRecord = settingsPage.records[0];
    if (!settingsRecord) return { setup: "settings-empty" };
    const settings = normalizeSettings(settingsRecord);
    if (!/^[A-Z]{3}$/.test(settings.currency)) return { setup: "currency-missing", settings };
    if (!settings.storeName) settings.storeName = "Shop";

    const tables = resolveProductTables(nodes, settings.productsBase, { shopFolderId: shop.settings.node.parentId });
    if (tables.status !== "ready") return { setup: tables.status, settings };

    const extras = resolveShopExtras(nodes, shop.settings.node.parentId);
    const [productsPage, certificateRecords, shippingRead, pagesRead] = await Promise.all([
      records.readPage({
        baseId: tables.productsBaseId,
        limit: PRODUCTS_PAGE,
        // `fieldType` is not optional in practice: Busabase before 2026-11-05
        // answered a sort without it in the default order (newest first).
        sort: { fieldSlug: "ref", fieldType: "number", direction: "asc" },
      }),
      tables.certificatesBaseId
        ? records
            .readPage({ baseId: tables.certificatesBaseId, limit: CERTIFICATES_PAGE })
            .then((page) => page.records)
            .catch((error) => {
              // Certificates only add a line to product pages; never take the shop down for them.
              log.warn?.("busa-shop: certificates unreadable", describeError(error));
              return [];
            })
        : Promise.resolve([]),
      readOptional(records, extras.shipping, SHIPPING_PAGE, log, "Shipping"),
      readOptional(records, extras.pages, PAGES_LIMIT, log, "Pages"),
    ]);

    const catalog = buildCatalog({
      productRecords: productsPage.records,
      certificateRecords,
      settings,
      busabaseOrigin,
      nowMs: now(),
      shape: tables.shape,
      airappImages: Boolean(tables.hubAppNodeId),
    });
    return {
      setup: "ready",
      settings,
      catalog,
      productsFrom: tables.shape,
      ordersBaseId: shop.orders.status === "found" ? shop.orders.node.baseId : null,
      // `ready` with rates, or `missing` (a shop from before 0.6.0: order
      // requests without a shipping line) or `unreadable` (ordering pauses).
      shipping:
        shippingRead.status === "ready"
          ? { status: "ready", ...buildShippingRates(shippingRead.records, settings) }
          : { status: shippingRead.status, rates: new Map(), problems: [] },
      pages: buildPages(pagesRead.records),
      pagesStatus: pagesRead.status,
      hubAppNodeId: tables.hubAppNodeId,
      moreProducts: Boolean(productsPage.nextCursor),
    };
  };

  /** The current catalog, read at most once a minute per isolate. */
  const load = async () => {
    const at = now();
    if (cached && at - cached.at < CATALOG_TTL_MS) return cached.value;
    if (!inFlight) {
      inFlight = readCatalog()
        .then((value) => {
          cached = { value, at: now() };
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    try {
      return await inFlight;
    } catch (error) {
      log.error?.("busa-shop: could not read the workspace", describeError(error));
      if (cached && cached.value.setup === "ready" && at - cached.at < STALE_IF_ERROR_MS) return cached.value;
      throw new ShopUnavailableError("The workspace could not be read", error);
    }
  };

  /** Create one Orders row. The order id is the idempotency key: the same id twice is one record. */
  const createOrder = async (state, order, { payment = "request" } = {}) => {
    const fields = orderToFields(order, { nowIso: new Date(now()).toISOString(), payment });
    try {
      const outcome = await records.createRecord({
        baseId: state.ordersBaseId,
        fields,
        message: payment === "paypal" ? `Checkout ${order.orderId} from the website (awaiting PayPal payment)` : `Order request ${order.orderId} from the website`,
        idempotencyKey: order.orderId,
      });
      return { status: outcome.status, recordId: outcome.recordId ?? null };
    } catch (error) {
      log.error?.("busa-shop: order not saved", order.orderId, describeError(error));
      throw new ShopUnavailableError("The order could not be saved", error);
    }
  };

  /** One Orders row by the exact value of one field, read now (never cached): the order, or null. */
  const findOrderBy = async (state, fieldSlug, valueText) => {
    if (!state.ordersBaseId || !valueText) return null;
    try {
      const record = await records.findRecord({ baseId: state.ordersBaseId, fieldSlug, valueText });
      return record ? orderFromRecord(record) : null;
    } catch (error) {
      log.error?.("busa-shop: order unreadable", describeError(error));
      throw new ShopUnavailableError("The order could not be read", error);
    }
  };

  const findOrder = (state, orderId) => findOrderBy(state, "order-id", orderId);
  const findOrderByCapture = (state, captureId) => findOrderBy(state, "paypal-capture-id", captureId);

  /**
   * Change one order, safely against another writer: read it, let `decide`
   * work out the fields from what is there NOW, and write them against the
   * revision just read. If someone else wrote in between (the PayPal webhook
   * and the buyer's browser racing to mark it paid), read again and decide
   * again. `decide(order)` returns `{ fields, ...anything }` or null for
   * "nothing to do". Resolves to `{ order, result, outcome }`, or
   * `{ order, result: null }` when there was nothing to do.
   */
  const updateOrder = async (state, orderId, decide, message) => {
    for (let attempt = 1; ; attempt += 1) {
      const order = await findOrder(state, orderId);
      if (!order) return { order: null, result: null };
      const result = decide(order);
      if (!result || !Object.keys(result.fields ?? {}).length) return { order, result: null };
      try {
        const outcome = await records.updateRecord({
          recordId: order.recordId,
          ...(order.headCommitId ? { baseCommitId: order.headCommitId } : {}),
          fields: result.fields,
          message: typeof message === "function" ? message(result) : message,
        });
        if (outcome.status === "queued") log.warn?.("busa-shop: order change waits for review", orderId);
        return { order, result, outcome };
      } catch (error) {
        if (isConflict(error) && attempt < UPDATE_ATTEMPTS) continue;
        log.error?.("busa-shop: order not updated", orderId, describeError(error));
        throw new ShopUnavailableError("The order could not be updated", error);
      }
    }
  };

  const sameOrigin = (url) => {
    try {
      return new URL(url).origin === busabaseOrigin;
    } catch {
      return false;
    }
  };

  const fetchImage = async (startUrl) => {
    // The browser preview (no key) signs in with the viewer's session cookie,
    // which the browser itself sends to the Busabase origin only. It also hides
    // a manual redirect behind an opaque response (status 0, no Location), so
    // there the browser follows the hop to the storage host on its own.
    if (!apiKey) return fetchImpl(startUrl, { redirect: "follow" });
    // The key goes only to the Busabase server itself, never to another host,
    // so redirects are followed by hand: a hop to a storage or CDN host is
    // fetched without it.
    let url = startUrl;
    let response;
    for (let hop = 0; ; hop += 1) {
      const headers = sameOrigin(url) && apiKey ? { authorization: `Bearer ${apiKey}` } : {};
      response = await fetchImpl(url, { headers, redirect: "manual" });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      await response.body?.cancel?.();
      if (hop >= 2) return null;
      const next = new URL(location, url);
      if (next.protocol !== "https:" && !sameOrigin(next.href)) return null;
      url = next.href;
    }
    return response;
  };

  const imageResponse = async (startUrl) => {
    const response = await fetchImage(startUrl);
    if (!response) return null;
    const type = response.headers.get("content-type") ?? "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (!response.ok || !type.toLowerCase().startsWith("image/") || length > MAX_IMAGE_BYTES) {
      await response.body?.cancel?.();
      return null;
    }
    return { body: response.body, type };
  };

  /**
   * The bytes of image `index` of a LISTED product, or null. The product id
   * and index only pick among images this module already read from the
   * Products table; a direct (public) URL is never proxied.
   */
  const productImage = async (state, productId, index) => {
    const product = state.catalog.listed.find((item) => item.id === productId);
    const image = product?.images[index];
    if (!image || image.kind === "direct") return null;
    try {
      if (image.kind === "busabase") return await imageResponse(image.url);
      if (image.kind !== "airapp" || !state.hubAppNodeId) return null;
      const file = await client.fileTrees.readFile({ nodeId: state.hubAppNodeId, filePath: image.path });
      const type = typeof file?.mimeType === "string" ? file.mimeType : "";
      if (!type.startsWith("image/")) return null;
      if (file.encoding === "utf8") {
        if (type !== "image/svg+xml" || typeof file.content !== "string") return null;
        return { body: file.content, type };
      }
      const assetUrl = file.assetUrl || (file.encoding === "url" ? file.content : "");
      if (!assetUrl) return null;
      return await imageResponse(new URL(assetUrl, busabaseOrigin).href);
    } catch (error) {
      log.warn?.("busa-shop: image unreadable", productId, index, describeError(error));
      return null;
    }
  };

  return { load, createOrder, findOrder, findOrderByCapture, updateOrder, productImage, appId: SHOP_APP_ID };
};
