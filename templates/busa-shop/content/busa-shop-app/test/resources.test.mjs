import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickResource, resolveProductTables, resolveShopTables } from "../src/resources.js";
import { NODES } from "./fixtures.mjs";

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
  it("uses busa-product-hub's stamped Products, with its sibling Certificates and AirApp", () => {
    assert.deepEqual(resolveProductTables(all, ""), {
      status: "ready",
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
