import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOwnedConfig } from "../app/js/binding.js";
const config = {
  appId: "test",
  folder: { slug: "original" },
  bases: [{ key: "accounts", slug: "original-accounts" }],
};
const folder = {
  node: {
    id: "folder-one",
    slug: "renamed-install",
    metadata: { appId: "test", resourceKey: "app-root" },
  },
  children: [
    {
      id: "base-one",
      slug: "renamed-accounts",
      type: "base",
      metadata: { appId: "test", resourceKey: "accounts" },
    },
  ],
};
test("nested renamed install resolves ownership with one depth-limited metadata read", async () => {
  const calls = [];
  const client = {
    nodes: {
      list: async (args) => {
        calls.push(args);
        return [
          { children: [{ children: [{ ...folder.node, type: "folder" }] }] },
        ];
      },
      get: async (args) => {
        assert.equal(args.nodeId, "folder-one");
        return folder;
      },
    },
  };
  const bound = await resolveOwnedConfig(client, config);
  assert.deepEqual(calls, [{ parentId: null, depth: 3 }]);
  assert.equal(bound.folder.nodeId, "folder-one");
  assert.equal(bound.folder.slug, "renamed-install");
  assert.equal(bound.bases[0].slug, "renamed-accounts");
  assert.equal(config.folder.nodeId, undefined);
});
test("duplicate installs and foreign ownership fail closed", async () => {
  const root = { ...folder.node, type: "folder" };
  await assert.rejects(
    resolveOwnedConfig({ nodes: { list: async () => [root, root] } }, config),
    /SETUP_CONFLICT/,
  );
  await assert.rejects(
    resolveOwnedConfig(
      {
        nodes: {
          list: async () => [root],
          get: async () => ({
            ...folder,
            children: [
              {
                ...folder.children[0],
                metadata: { appId: "other", resourceKey: "accounts" },
              },
            ],
          }),
        },
      },
      config,
    ),
    /SCHEMA_INCOMPLETE/,
  );
});
