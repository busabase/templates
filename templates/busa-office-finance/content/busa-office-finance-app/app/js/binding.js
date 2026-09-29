const flatten = (nodes) =>
  nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
export function bindOwnedFolder(tree, folder, config) {
  if (
    !folder ||
    folder.node?.metadata?.appId !== config.appId ||
    folder.node?.metadata?.resourceKey !== "app-root"
  )
    throw Error("SCHEMA_INCOMPLETE: app ownership missing");
  const siblings = folder.children || [];
  return {
    ...config,
    folder: {
      ...config.folder,
      nodeId: folder.node.id,
      slug: folder.node.slug,
    },
    bases: config.bases.map((b) => {
      const matches = siblings.filter(
        (n) =>
          n.type === "base" &&
          n.metadata?.appId === config.appId &&
          n.metadata?.resourceKey === b.key,
      );
      if (matches.length !== 1) throw Error("SCHEMA_INCOMPLETE: " + b.key);
      return { ...b, slug: matches[0].slug };
    }),
  };
}
/** @param {import('busabase-sdk').BusabaseClient} client */
export async function resolveOwnedConfig(client, config) {
  const tree = await client.nodes.list({ parentId: null, depth: 3 });
  const roots = flatten(tree || []).filter(
    (n) =>
      n.type === "folder" &&
      n.metadata?.appId === config.appId &&
      n.metadata?.resourceKey === "app-root",
  );
  if (roots.length !== 1)
    throw Error(
      roots.length
        ? "SETUP_CONFLICT: multiple installations; select one installation"
        : "SCHEMA_INCOMPLETE: installed Folder missing",
    );
  const folder = await client.nodes.get({
    nodeId: roots[0].id,
    type: "folder",
  });
  return bindOwnedFolder(tree, folder, config);
}
