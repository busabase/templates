export async function bindInstalledResources(client, config) {
  const tree = await client.nodes.list({ parentId: null, depth: 3 });
  const flatten = (nodes) => nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
  const roots = flatten(tree || []).filter((node) => node.type === 'folder' && node.metadata?.appId === config.appId && node.metadata?.resourceKey === 'app-root');
  if (roots.length !== 1) throw new Error(`SETUP_CONFLICT: Expected one owned installation, found ${roots.length}.`);
  const folder = await client.nodes.get({ nodeId: roots[0].id, type: 'folder' });
  const bases = config.bases.map((base) => {
    const candidates = (folder.children || []).filter((node) => node.metadata?.appId === config.appId && node.metadata?.resourceKey === base.key);
    if (candidates.length !== 1 || candidates[0].type !== 'base' || !candidates[0].baseId) throw new Error(`SCHEMA_INCOMPLETE: Resource ${base.name} missing or ambiguous.`);
    return { ...base, slug: candidates[0].slug };
  });
  return { ...config, folder: { ...config.folder, nodeId: roots[0].id, slug: folder.node.slug }, bases };
}
