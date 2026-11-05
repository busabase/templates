// The data side of the site: one bounded read plan, cached in the Worker's
// memory, and the image fetch. Everything that talks to Busabase is here, and
// it only ever calls these procedures:
//
//   nodes.list({ types: ["base", "airapp"] })   find the tables (src/resources.js)
//   records.list  Settings (5 rows), Products (100), Certificates (100)
//   bases.createChangeRequest  one Orders row per order request
//   fileTrees.readFile  one image file inside the Product Hub AirApp
//
// Nothing a visitor sends is passed through to the API: no Base, record id,
// path, filter or body. The visitor's input selects among products this module
// already read, and is validated in src/orders.js before anything is written.

import { buildCatalog, normalizeSettings } from "./catalog.js";
import { orderToFields } from "./orders.js";
import { resolveProductTables, resolveShopTables, SHOP_APP_ID } from "./resources.js";

export const CATALOG_TTL_MS = 60_000; // a change in the workspace shows within a minute
export const STALE_IF_ERROR_MS = 10 * 60_000; // keep serving the last good catalog through a short outage
export const PRODUCTS_PAGE = 100; // the shop lists at most the first 100 products of the table
export const CERTIFICATES_PAGE = 100;
export const SETTINGS_PAGE = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class ShopUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ShopUnavailableError";
    this.cause = cause;
  }
}

const describeError = (error) => error?.status ?? error?.code ?? error?.name ?? "error";

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

    const tables = resolveProductTables(nodes, settings.productsBase);
    if (tables.status !== "ready") return { setup: tables.status, settings };

    const [productsPage, certificateRecords] = await Promise.all([
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
    ]);

    const catalog = buildCatalog({
      productRecords: productsPage.records,
      certificateRecords,
      settings,
      busabaseOrigin,
      nowMs: now(),
    });
    return {
      setup: "ready",
      settings,
      catalog,
      ordersBaseId: shop.orders.status === "found" ? shop.orders.node.baseId : null,
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
  const createOrder = async (state, order) => {
    const fields = orderToFields(order, { nowIso: new Date(now()).toISOString() });
    try {
      const outcome = await records.createRecord({
        baseId: state.ordersBaseId,
        fields,
        message: `Order request ${order.orderId} from the website`,
        idempotencyKey: order.orderId,
      });
      return { status: outcome.status, recordId: outcome.recordId ?? null };
    } catch (error) {
      log.error?.("busa-shop: order not saved", order.orderId, describeError(error));
      throw new ShopUnavailableError("The order could not be saved", error);
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

  return { load, createOrder, productImage, appId: SHOP_APP_ID };
};
