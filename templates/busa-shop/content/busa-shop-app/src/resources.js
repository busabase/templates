// Finding the tables the site reads, by the stamp the template installer
// writes. Pure: it decides from one `nodes.list` answer (test/resources.test.mjs).
//
// A published template carries no workspace ids, and a site Worker is not told
// its own node id, so the Worker has to find its tables at runtime. Installing
// a template stamps every node it creates with
// `metadata = { appId: <template name>, resourceKey: <package slug>, schemaVersion }`
// (busabase-package's installer), and that stamp survives renaming the Folder
// or installing into a differently named one. So:
//
//   1. this shop's Settings and Orders: the Base stamped
//      { appId: "busa-shop", resourceKey: "settings" | "orders" };
//   2. the Products table: the Base named in Settings › "Products table"
//      (a base id, node id or slug) when the owner filled it in, otherwise the
//      Base stamped { appId: "busa-product-hub", resourceKey: "products" };
//   3. Certificates and the Product Hub AirApp (for its bundled images): the
//      stamped nodes in the SAME folder as that Products table.
//
// When the stamp is missing (a hand-made copy, an older install), the default
// installed slug is the fallback (`busa-shop-settings`, `busa-product-hub-products`).
// Two matches are never guessed between: the page says so and the owner picks.

export const SHOP_APP_ID = "busa-shop";
export const PRODUCT_HUB_APP_ID = "busa-product-hub";

const stamped = (node, appId, resourceKey) =>
  node?.metadata?.appId === appId && node?.metadata?.resourceKey === resourceKey;

/** One declared resource: `{ status: "found", node }`, `{ status: "missing" }` or `{ status: "ambiguous", nodes }`. */
export const pickResource = (nodes, { type, appId, resourceKey, fallbackSlug, parentId }) => {
  const candidates = nodes.filter(
    (node) => node.type === type && (parentId === undefined || node.parentId === parentId),
  );
  let matches = candidates.filter((node) => stamped(node, appId, resourceKey));
  if (matches.length === 0 && fallbackSlug) matches = candidates.filter((node) => node.slug === fallbackSlug);
  if (matches.length === 1) return { status: "found", node: matches[0] };
  if (matches.length === 0) return { status: "missing" };
  return { status: "ambiguous", nodes: matches };
};

export const resolveShopTables = (nodes) => ({
  settings: pickResource(nodes, {
    type: "base",
    appId: SHOP_APP_ID,
    resourceKey: "settings",
    fallbackSlug: "busa-shop-settings",
  }),
  orders: pickResource(nodes, {
    type: "base",
    appId: SHOP_APP_ID,
    resourceKey: "orders",
    fallbackSlug: "busa-shop-orders",
  }),
});

/**
 * Resolve the Products table and its siblings. `override` is Settings ›
 * "Products table": matched against a Base's id, its node id, or its slug.
 */
export const resolveProductTables = (nodes, override) => {
  let products;
  if (override) {
    const node = nodes.find(
      (candidate) =>
        candidate.type === "base" &&
        (candidate.baseId === override || candidate.id === override || candidate.slug === override),
    );
    if (!node) return { status: "products-override-not-found" };
    products = node;
  } else {
    const picked = pickResource(nodes, {
      type: "base",
      appId: PRODUCT_HUB_APP_ID,
      resourceKey: "products",
      fallbackSlug: "busa-product-hub-products",
    });
    if (picked.status === "missing") return { status: "products-missing" };
    if (picked.status === "ambiguous") return { status: "products-ambiguous" };
    products = picked.node;
  }
  const certificates = pickResource(nodes, {
    type: "base",
    appId: PRODUCT_HUB_APP_ID,
    resourceKey: "certificates",
    fallbackSlug: products.slug.endsWith("-products") ? `${products.slug.slice(0, -"-products".length)}-certificates` : "",
    parentId: products.parentId,
  });
  const hubApp = pickResource(nodes, {
    type: "airapp",
    appId: PRODUCT_HUB_APP_ID,
    resourceKey: "busa-product-hub-app",
    fallbackSlug: "busa-product-hub-app",
    parentId: products.parentId,
  });
  return {
    status: "ready",
    productsBaseId: products.baseId,
    certificatesBaseId: certificates.status === "found" ? certificates.node.baseId : null,
    hubAppNodeId: hubApp.status === "found" ? hubApp.node.id : null,
  };
};
