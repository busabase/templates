import test from "node:test";
import assert from "node:assert/strict";
import { bindOwnedFolder } from "../app/js/resource-binding.js";
const config = {
  appId: "test-app",
  folder: { slug: "original" },
  bases: [{ key: "cases", slug: "original-cases" }],
};
const root = {
  id: "owned",
  type: "folder",
  slug: "install-suffix",
  metadata: { appId: "test-app", resourceKey: "app-root" },
};
const child = {
  type: "base",
  slug: "actual-cases",
  baseId: "base",
  metadata: { appId: "test-app", resourceKey: "cases" },
};
test("nested ownership survives renamed installation slug", () => {
  const bound = bindOwnedFolder(
    [{ type: "folder", children: [root] }],
    { node: root, children: [child] },
    config,
  );
  assert.equal(bound.folder.nodeId, "owned");
  assert.equal(bound.bases[0].slug, "actual-cases");
});
test("same-name unowned resources and duplicate installations are rejected", () => {
  assert.throws(() =>
    bindOwnedFolder(
      [root],
      { node: root, children: [{ ...child, metadata: {} }] },
      config,
    ),
  );
  assert.throws(() =>
    bindOwnedFolder(
      [root, { ...root, id: "duplicate" }],
      { node: root, children: [child] },
      config,
    ),
  );
});
