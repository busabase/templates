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
//   2. the Products table:
//      a. the Base named in Settings › "Products table" (a base id, node id or
//         slug) when the owner filled it in: a product hub's table, or any
//         compatible one;
//      b. otherwise this shop's own Products, stamped
//         { appId: "busa-shop", resourceKey: "products" } in the same folder as
//         its Settings (busa-shop 0.5.0 and later);
//      c. otherwise, in a shop installed before 0.5.0 (no Products of its own),
//         the Base stamped { appId: "busa-product-hub", resourceKey: "products" };
//   3. Certificates (and, for a product hub, its AirApp with the bundled
//      images): the stamped nodes in the SAME folder as that Products table.
//
// The table's shape follows its stamp: a busa-shop Products table has plain
// columns (one Status, Stock, Specs…); anything else is read as a busa-product-hub
// table (Lifecycle + Status, JSON blocks). src/catalog.js reads both.
//
// When the stamp is missing (a hand-made copy, an older install), the default
// installed slug is the fallback (`busa-shop-settings`, `busa-shop-products`,
// `busa-product-hub-products`). Two matches are never guessed between: the
// page says so and the owner picks.

export const SHOP_APP_ID = "busa-shop";
export const PRODUCT_HUB_APP_ID = "busa-product-hub";

/** The two shapes of Products table the site reads (src/catalog.js). */
export const SHOP_SHAPE = "shop";
export const PRODUCT_HUB_SHAPE = "product-hub";

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
 * Shipping and Pages (busa-shop 0.6.0 and later) and Posts (0.7.0), in the
 * folder of this shop's Settings. A shop installed before has none of them:
 * it keeps taking order requests without a shipping line, shows no policy
 * pages and has no blog.
 */
export const resolveShopExtras = (nodes, shopFolderId) => ({
  shipping: pickResource(nodes, {
    type: "base",
    appId: SHOP_APP_ID,
    resourceKey: "shipping",
    fallbackSlug: "busa-shop-shipping",
    parentId: shopFolderId,
  }),
  pages: pickResource(nodes, {
    type: "base",
    appId: SHOP_APP_ID,
    resourceKey: "pages",
    fallbackSlug: "busa-shop-pages",
    parentId: shopFolderId,
  }),
  posts: pickResource(nodes, {
    type: "base",
    appId: SHOP_APP_ID,
    resourceKey: "posts",
    fallbackSlug: "busa-shop-posts",
    parentId: shopFolderId,
  }),
});

/**
 * This website's own AirApp node, in the folder of this shop's Settings: the
 * `appId` Busabase's app-user endpoints (buyer login, src/account.js) take.
 * Missing or ambiguous → no buyer login, everything else as before.
 */
export const resolveShopApp = (nodes, shopFolderId) =>
  pickResource(nodes, {
    type: "airapp",
    appId: SHOP_APP_ID,
    resourceKey: "busa-shop-app",
    fallbackSlug: "busa-shop-app",
    parentId: shopFolderId,
  });

const siblingSlug =(slug, resourceKey) =>
  slug.endsWith("-products") ? `${slug.slice(0, -"-products".length)}-${resourceKey}` : "";

/**
 * Resolve the Products table and its siblings. `override` is Settings ›
 * "Products table": matched against a Base's id, its node id, or its slug.
 * `shopFolderId` is the folder of this shop's Settings, where its own
 * Products and Certificates live.
 */
export const resolveProductTables = (nodes, override, { shopFolderId } = {}) => {
  let products;
  let shape;
  if (override) {
    const node = nodes.find(
      (candidate) =>
        candidate.type === "base" &&
        (candidate.baseId === override || candidate.id === override || candidate.slug === override),
    );
    if (!node) return { status: "products-override-not-found" };
    products = node;
    shape = node.metadata?.appId === SHOP_APP_ID ? SHOP_SHAPE : PRODUCT_HUB_SHAPE;
  } else {
    const own =
      shopFolderId === undefined
        ? { status: "missing" }
        : pickResource(nodes, {
            type: "base",
            appId: SHOP_APP_ID,
            resourceKey: "products",
            fallbackSlug: "busa-shop-products",
            parentId: shopFolderId,
          });
    if (own.status === "ambiguous") return { status: "products-ambiguous" };
    if (own.status === "found") {
      products = own.node;
      shape = SHOP_SHAPE;
    } else {
      // A shop installed before busa-shop 0.5.0 has no Products of its own and sells from the product hub.
      const picked = pickResource(nodes, {
        type: "base",
        appId: PRODUCT_HUB_APP_ID,
        resourceKey: "products",
        fallbackSlug: "busa-product-hub-products",
      });
      if (picked.status === "missing") return { status: "products-missing" };
      if (picked.status === "ambiguous") return { status: "products-ambiguous" };
      products = picked.node;
      shape = PRODUCT_HUB_SHAPE;
    }
  }
  const appId = shape === SHOP_SHAPE ? SHOP_APP_ID : PRODUCT_HUB_APP_ID;
  const certificates = pickResource(nodes, {
    type: "base",
    appId,
    resourceKey: "certificates",
    fallbackSlug: siblingSlug(products.slug, "certificates"),
    parentId: products.parentId,
  });
  // Only a product hub keeps product pictures inside its AirApp (`./assets/…`).
  const hubApp =
    shape === PRODUCT_HUB_SHAPE
      ? pickResource(nodes, {
          type: "airapp",
          appId: PRODUCT_HUB_APP_ID,
          resourceKey: "busa-product-hub-app",
          fallbackSlug: "busa-product-hub-app",
          parentId: products.parentId,
        })
      : { status: "missing" };
  return {
    status: "ready",
    shape,
    productsBaseId: products.baseId,
    certificatesBaseId: certificates.status === "found" ? certificates.node.baseId : null,
    hubAppNodeId: hubApp.status === "found" ? hubApp.node.id : null,
  };
};
