import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickResource, resolveProductTables, resolveShopTables } from "../src/resources.js";
import { NODES, SHOP_NODES, SHOP_ONLY_NODES } from "./fixtures.mjs";

const all = Object.values(NODES);
const strip = (node) => ({ ...node, metadata: {} });

describe("finding the shop's own tables", () => {
  it("finds Settings and Orders by the installer's stamp", () => {
    const tables = resolveShopTables(all);
    assert.equal(tables.settings.node.baseId, "bas_settings");
    assert.equal(tables.orders.node.baseId, "bas_orders");
  });

  it("finds them by stamp even when the folder was installed under another name", () => {
    const renamed = all.map((node) => (node.metadata.appId === "busa-shop" ? { ...node, slug: `my-store-${node.metadata.resourceKey}` } : node));
    assert.equal(resolveShopTables(renamed).settings.node.baseId, "bas_settings");
  });

  it("falls back to the default slug when the stamp is missing", () => {
    const unstamped = all.map((node) => (node.metadata.appId === "busa-shop" ? strip(node) : node));
    assert.equal(resolveShopTables(unstamped).settings.status, "found");
  });

  it("reports missing and ambiguous instead of guessing", () => {
    assert.equal(resolveShopTables(all.filter((node) => node !== NODES.settings)).settings.status, "missing");
    const twice = [...all, { ...NODES.settings, id: "nod_2", baseId: "bas_settings_2", slug: "busa-shop-2-settings" }];
    assert.equal(resolveShopTables(twice).settings.status, "ambiguous");
  });
});

describe("finding the Products table", () => {
  const shopFolderId = NODES.settings.parentId;

  it("sells from the shop's own Products and Certificates, with no product hub anywhere", () => {
    assert.deepEqual(resolveProductTables(SHOP_ONLY_NODES, "", { shopFolderId }), {
      status: "ready",
      shape: "shop",
      productsBaseId: "bas_shop_products",
      certificatesBaseId: "bas_shop_certificates",
      hubAppNodeId: null,
    });
  });

  it("prefers the shop's own Products to a product hub installed next to it", () => {
    const both = [...all, ...Object.values(SHOP_NODES)];
    assert.equal(resolveProductTables(both, "", { shopFolderId }).productsBaseId, "bas_shop_products");
    // Settings › Products table still points the shop at the hub, with the hub's siblings.
    assert.deepEqual(resolveProductTables(both, "busa-product-hub-products", { shopFolderId }), {
      status: "ready",
      shape: "product-hub",
      productsBaseId: "bas_products",
      certificatesBaseId: "bas_certificates",
      hubAppNodeId: "nod_hub_app",
    });
    // …and back at its own table by slug, which reads as the shop's shape.
    assert.equal(resolveProductTables(both, "busa-shop-products", { shopFolderId }).shape, "shop");
  });

  it("only takes Products from this shop's own folder, by stamp or by the default slug", () => {
    const elsewhere = { ...SHOP_NODES.products, parentId: "nod_other_shop" };
    assert.equal(resolveProductTables([...all, elsewhere], "", { shopFolderId }).productsBaseId, "bas_products", "another folder's table is not this shop's");
    const unstamped = [...all, { ...SHOP_NODES.products, metadata: {} }];
    assert.equal(resolveProductTables(unstamped, "", { shopFolderId }).shape, "shop");
    const twice = [...SHOP_ONLY_NODES, { ...SHOP_NODES.products, id: "nod_shop_products_2", baseId: "bas_shop_products_2" }];
    assert.deepEqual(resolveProductTables(twice, "", { shopFolderId }), { status: "products-ambiguous" });
  });

  it("says the Products table is missing when the shop has none and there is no product hub", () => {
    const bare = SHOP_ONLY_NODES.filter((node) => node !== SHOP_NODES.products);
    assert.deepEqual(resolveProductTables(bare, "", { shopFolderId }), { status: "products-missing" });
  });

  it("a shop from before 0.5.0 (no Products of its own) keeps selling from busa-product-hub's stamped Products, with its sibling Certificates and AirApp", () => {
    assert.deepEqual(resolveProductTables(all, "", { shopFolderId }), {
      status: "ready",
      shape: "product-hub",
      productsBaseId: "bas_products",
      certificatesBaseId: "bas_certificates",
      hubAppNodeId: "nod_hub_app",
    });
  });

  it("says the product hub is missing when it is not installed", () => {
    const withoutHub = all.filter((node) => node.metadata.appId !== "busa-product-hub");
    assert.deepEqual(resolveProductTables(withoutHub, ""), { status: "products-missing" });
  });

  it("never picks between two product hubs on its own", () => {
    const second = [
      { ...NODES.products, id: "nod_hub2_products", parentId: "nod_hub2", baseId: "bas_products_2", slug: "busa-product-hub-2-products" },
      { ...NODES.certificates, id: "nod_hub2_certs", parentId: "nod_hub2", baseId: "bas_certs_2", slug: "busa-product-hub-2-certificates" },
    ];
    assert.deepEqual(resolveProductTables([...all, ...second], ""), { status: "products-ambiguous" });
  });

  it("uses Settings › Products table by slug, base id or node id, with that table's own siblings", () => {
    const second = [
      { ...NODES.products, id: "nod_hub2_products", parentId: "nod_hub2", baseId: "bas_products_2", slug: "busa-product-hub-2-products" },
      { ...NODES.certificates, id: "nod_hub2_certs", parentId: "nod_hub2", baseId: "bas_certs_2", slug: "busa-product-hub-2-certificates" },
    ];
    const nodes = [...all, ...second];
    for (const ref of ["busa-product-hub-2-products", "bas_products_2", "nod_hub2_products"]) {
      assert.deepEqual(resolveProductTables(nodes, ref), {
        status: "ready",
        shape: "product-hub",
        productsBaseId: "bas_products_2",
        certificatesBaseId: "bas_certs_2",
        hubAppNodeId: null,
      });
    }
    assert.deepEqual(resolveProductTables(nodes, "no-such-table"), { status: "products-override-not-found" });
  });

  it("can read any Base the owner names, even one that is not from the product hub", () => {
    assert.equal(resolveProductTables(all, "crm-contacts").productsBaseId, "bas_crm");
  });

  it("works without Certificates", () => {
    const result = resolveProductTables(all.filter((node) => node !== NODES.certificates), "");
    assert.equal(result.status, "ready");
    assert.equal(result.certificatesBaseId, null);
  });

  it("matches a Base, never an AirApp, for the Products table", () => {
    assert.equal(pickResource([{ ...NODES.products, type: "airapp" }], { type: "base", appId: "busa-product-hub", resourceKey: "products" }).status, "missing");
  });
});
