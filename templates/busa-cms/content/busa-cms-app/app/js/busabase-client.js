import { createBusabaseClient, inspectProvisionedResources } from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

/**
 * One client, one URL, every environment.
 *
 * The app always calls Busabase's public REST surface on its **own** origin.
 * Deployed inside Busabase that origin IS Busabase — the platform's own preview
 * proxy says so: "Absolute refs like `/api/v1/…` still hit the busabase origin
 * root (the data bridge)" — so the logged-in viewer's session authenticates it.
 * Standalone, the same `/api/v1` path is served by this app's local gateway
 * (`server/local-auth.js`), which attaches the credential it holds and the Space
 * the operator confirmed, server-side.
 *
 * That is why no credential ever appears in these files: the browser never holds
 * one, in either environment.
 *
 * The earlier shape of this app kept the SDK on its own Node process instead. It
 * worked under `npm run dev` and returned nothing at all once installed: a hosted
 * AirApp's process is given `BUSABASE_AIRAPP_RUNTIME` and nothing else — no API
 * origin, no credential — so the only route to the data is the browser's.
 */
const parentUrls = () => {
  const values = [];
  if (document.referrer) values.push(document.referrer);
  try {
    if (window.parent !== window) values.push(window.parent.location.href);
  } catch {
    // Cross-origin embeds cannot expose their parent URL; auth discovery handles them.
  }
  return values.flatMap((value) => {
    try {
      return [new URL(value)];
    } catch {
      return [];
    }
  });
};

const dashboardSpaceHint = () => {
  for (const url of parentUrls()) {
    const match = url.pathname.match(/^\/dashboard\/([^/]+)(?:\/|$)/);
    if (!match) continue;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return "";
};

export function createRuntimeClient() {
  const spaceId = appConfig.spaceId || dashboardSpaceHint();
  return createBusabaseClient({
    baseUrl: window.location.origin,
    ...(spaceId ? { spaceId } : {}),
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

/**
 * Install stamps every node it creates with `appId` + `resourceKey`. Finding the
 * Folder by those stamps rather than by slug is what lets an operator rename
 * "Busa CMS" to "Website" without the app losing track of its own content.
 */
async function locateInstalledFolder(client) {
  const nodes = flattenNodes(await client.nodes.list({ parentId: null, depth: 2 }));
  const folders = nodes.filter(
    (node) =>
      node.type === "folder" &&
      node.metadata?.appId === appConfig.appId &&
      node.metadata?.resourceKey === "app-root",
  );
  if (folders.length > 1) {
    throw new Error("SETUP_CONFLICT: more than one Busa CMS Folder exists in this Space");
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

/**
 * Resolve install-specific ids from the template's ownership stamps.
 *
 * @returns how much of the declared structure exists. Reported rather than
 * thrown: a Space with no Folder yet is a state the setup gate explains, not an
 * error the operator can do anything with.
 */
export async function resolveRuntimeResources(client) {
  await locateInstalledFolder(client).catch((error) => {
    if (String(error?.message || "").startsWith("SETUP_CONFLICT")) throw error;
  });
  const resources = await inspectProvisionedResources(client, resourceConfig);
  if (resources.folder?.nodeId) appConfig.schema.folder.nodeId = resources.folder.nodeId;
  for (const resolved of resources.bases) {
    const declaration = appConfig.schema.bases.find((base) => base.key === resolved.key);
    if (declaration) {
      declaration.nodeId = resolved.nodeId;
      declaration.baseId = resolved.baseId;
    }
  }
  return {
    folderId: appConfig.schema.folder.nodeId || "",
    basesFound: resources.bases.length,
    basesExpected: appConfig.schema.bases.length,
  };
}

/**
 * What the consuming website needs. The Folder node id is the whole point of the
 * Connect tab: without it `createBusabaseCms({ folderId })` has nothing to adopt,
 * and the alternative — matching Bases by slug — breaks the moment somebody
 * renames one.
 */
export const connectionFacts = () => ({
  folderId: appConfig.schema.folder.nodeId,
  folderSlug: appConfig.schema.folder.slug,
  spaceId: appConfig.spaceId || dashboardSpaceHint(),
  baseUrl: window.location.origin,
  profile: appConfig.cms.profile,
  sdkPackage: appConfig.cms.sdkPackage,
  bases: appConfig.schema.bases.map((base) => ({ key: base.key, slug: base.slug })),
});
