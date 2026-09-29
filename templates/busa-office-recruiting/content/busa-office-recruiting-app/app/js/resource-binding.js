export function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);
}

export function bindOwnedFolder(tree, folder, config) {
  const roots = flattenNodes(tree).filter(
    (node) =>
      node.type === "folder" &&
      node.metadata?.appId === config.appId &&
      node.metadata?.resourceKey === "app-root",
  );
  if (roots.length !== 1)
    throw new Error("SETUP_CONFLICT: expected exactly one installed app root");
  const root = roots[0];
  if (folder.node?.id !== root.id)
    throw new Error("SETUP_CONFLICT: folder identity changed");
  const bases = config.bases.map((base) => {
    const matches = (folder.children || []).filter(
      (node) =>
        node.type === "base" &&
        node.metadata?.appId === config.appId &&
        node.metadata?.resourceKey === base.key &&
        node.baseId,
    );
    if (matches.length !== 1)
      throw new Error(
        "SCHEMA_INCOMPLETE: missing or ambiguous owned resource " + base.key,
      );
    return { ...base, slug: matches[0].slug };
  });
  return {
    ...config,
    folder: { ...config.folder, nodeId: root.id, slug: root.slug },
    bases,
  };
}

/** @param {import('busabase-sdk').BusabaseClient} client */
export async function resolveOwnedConfig(client, config) {
  const tree = await client.nodes.list({ parentId: null, depth: 3 });
  const roots = flattenNodes(tree || []).filter(
    (node) =>
      node.type === "folder" &&
      node.metadata?.appId === config.appId &&
      node.metadata?.resourceKey === "app-root",
  );
  if (roots.length !== 1)
    throw new Error("SETUP_CONFLICT: expected exactly one installed app root");
  const folder = await client.nodes.get({
    nodeId: roots[0].id,
    type: "folder",
  });
  return bindOwnedFolder(tree, folder, config);
}
