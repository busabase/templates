import {
  createBusabaseClient,
  inspectProvisionedResources,
} from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

/**
 * One client, one URL, every environment.
 *
 * The app always calls Busabase's public REST surface on its *own* origin.
 * Deployed inside Busabase that origin IS Busabase, so `/api/v1` reaches the
 * real backend and the logged-in user's session cookie authenticates it — no
 * key, no bridge prefix, no Cloud-vs-Desktop fork. Run locally with
 * `npm run dev`, the same `/api/v1` path is served by this app's own dev proxy
 * (see `server.js`), which forwards to whichever Busabase you point
 * `BUSABASE_BASE_URL` at and attaches your key server-side.
 *
 * That is why no credential ever appears in these files: the browser never
 * holds one.
 */
export function createRuntimeClient() {
  return createBusabaseClient({
    baseUrl: window.location.origin,
    ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
  });
}

const resourceConfig = {
  appId: appConfig.appId,
  appName: appConfig.appName,
  schemaVersion: appConfig.schemaVersion,
  folder: appConfig.schema.folder,
  bases: appConfig.schema.bases,
  airApp: {
    slug: appConfig.appSlug,
    name: appConfig.appName,
    resourceKey: appConfig.appSlug,
  },
};

const flattenNodes = (nodes, output = []) => {
  for (const node of nodes || []) {
    output.push(node);
    flattenNodes(node.children, output);
  }
  return output;
};

async function locateInstalledFolder(client) {
  const nodes = flattenNodes(await client.nodes.list({ parentId: null, depth: 2 }));
  const folders = nodes.filter(
    (node) =>
      node.type === "folder" &&
      node.metadata?.appId === appConfig.appId &&
      node.metadata?.resourceKey === "app-root",
  );
  if (folders.length > 1) {
    throw new Error("SETUP_CONFLICT: Multiple B2B CRM template instances exist in this Space");
  }
  const folder = folders[0];
  if (!folder) return;

  appConfig.schema.folder.nodeId = folder.id;
  appConfig.schema.folder.slug = folder.slug;
  for (const declaration of appConfig.schema.bases) {
    const installed = (folder.children || []).find(
      (node) =>
        node.type === "base" &&
        node.metadata?.appId === appConfig.appId &&
        node.metadata?.resourceKey === declaration.key,
    );
    if (installed) declaration.slug = installed.slug;
  }
}

/** Resolve install-specific ids from template ownership stamps. */
export async function resolveRuntimeResources(client) {
  await locateInstalledFolder(client);
  const resources = await inspectProvisionedResources(client, resourceConfig);
  if (!resources.folder || resources.missing.length || resources.bases.length !== resourceConfig.bases.length) {
    throw new Error("SETUP_REQUIRED: B2B CRM template resources are incomplete");
  }
  if (resources.repairs.length) {
    throw new Error("SCHEMA_INCOMPLETE: B2B CRM ownership metadata requires repair");
  }

  appConfig.schema.folder.nodeId = resources.folder.nodeId;
  for (const resolved of resources.bases) {
    const declaration = appConfig.schema.bases.find((base) => base.key === resolved.key);
    if (declaration) {
      declaration.nodeId = resolved.nodeId;
      declaration.baseId = resolved.baseId;
    }
  }
  return appConfig.schema.bases;
}
