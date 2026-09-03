import { createBusabaseClient as createSdkClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/js/config.js";
import { localCredential, runtimeHeaders, runtimeOrigin } from "./runtime-context.ts";

/**
 * The single Busabase boundary.
 *
 * Everything the app knows about the workspace comes through here, and nothing
 * here reaches the browser. The credential situation is the reason: hosted, this
 * process forwards the viewer's own ambient session; standalone, the local gateway
 * holds an OAuth token server-side. Either way the browser gets rendered data over
 * this app's own routes and never a Busabase credential.
 */

type BaseKey = "categories" | "tags" | "posts" | "pages";

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

const flattenNodes = (nodes: any[], output: any[] = []) => {
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
async function locateInstalledFolder(sdk: any) {
  const nodes = flattenNodes(await sdk.nodes.list({ parentId: null, depth: 2 }));
  const folders = nodes.filter(
    (node: any) =>
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
      (node: any) =>
        node.type === "base" &&
        node.metadata?.appId === appConfig.appId &&
        node.metadata?.resourceKey === declaration.key,
    );
    if (installed) declaration.slug = installed.slug;
  }
}

const recordFields = (record: any) =>
  record?.fields || record?.headCommit?.payload?.fields || record?.headCommit?.payload || {};

export function createBusabaseClient() {
  const local = localCredential();
  // Two shapes, one client. Hosted: this app's origin IS Busabase and the viewer's
  // forwarded session authenticates — no key, no Space to choose. Standalone: the
  // server holds the key and the operator's confirmed Space, and the browser holds
  // neither.
  const sdk = local
    ? createSdkClient({
        baseUrl: local.baseUrl,
        ...(local.spaceId ? { spaceId: local.spaceId } : {}),
        ...(local.accessToken ? { apiKey: local.accessToken } : {}),
      })
    : createSdkClient({
        baseUrl: runtimeOrigin(),
        ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
        headers: runtimeHeaders,
      });

  const declaration = (key: BaseKey) => {
    const resource = appConfig.schema.bases.find((candidate) => candidate.key === key);
    if (!resource?.baseId) throw new Error(`SETUP_REQUIRED: ${resource?.name || key}`);
    return resource;
  };

  return {
    /**
     * @returns how much of the declared structure actually exists. Reported rather
     * than thrown: a Space with no Folder yet is a state the setup gate explains,
     * not an error the operator can do anything with.
     */
    async resolveResources() {
      await locateInstalledFolder(sdk).catch((error) => {
        if (String(error?.message || "").startsWith("SETUP_CONFLICT")) throw error;
      });
      const resources = await inspectProvisionedResources(sdk, resourceConfig);
      if (resources.folder?.nodeId) appConfig.schema.folder.nodeId = resources.folder.nodeId;
      for (const resolved of resources.bases) {
        const target = appConfig.schema.bases.find((candidate) => candidate.key === resolved.key);
        if (target) {
          target.nodeId = resolved.nodeId;
          target.baseId = resolved.baseId;
        }
      }
      return {
        folderId: appConfig.schema.folder.nodeId || "",
        basesFound: resources.bases.length,
        basesExpected: appConfig.schema.bases.length,
        missing: resources.missing ?? [],
        repairs: resources.repairs ?? [],
      };
    },

    async listRecords(key: BaseKey) {
      const resource = declaration(key);
      const page = await sdk.records.list({ baseId: resource.baseId, limit: resource.readLimit });
      return (page.records || []).map((record: any) => ({
        id: record.id,
        headCommit: record.headCommit,
        updatedAt: record.updatedAt,
        fields: recordFields(record),
      }));
    },

    /**
     * The Bases as they exist right now, not as the template declared them. The
     * Connect tab diffs this against the SDK contract, so a Base someone edited by
     * hand shows up as the drift it is instead of passing on the manifest's word.
     */
    async describeBases() {
      const described = [];
      for (const resource of appConfig.schema.bases) {
        if (!resource.baseId) {
          described.push({ key: resource.key, slug: resource.slug, name: resource.name, fields: null });
          continue;
        }
        const live = await sdk.bases.get({ baseId: resource.baseId }).catch(() => null);
        described.push({
          key: resource.key,
          slug: live?.slug ?? resource.slug,
          name: live?.name ?? resource.name,
          fields: live?.fields ?? null,
        });
      }
      return described;
    },

    /**
     * Saving is a save. There is no separate approval step in this app: Busabase's
     * own permission-aware default decides — an editor with write access on the
     * Folder publishes directly, and someone without it lands in review instead of
     * being told "no". Passing `autoMerge` either way would override that judgement
     * with the app's, which is worse than the platform's.
     */
    async createContent(key: "posts" | "pages", fields: Record<string, unknown>) {
      const resource = declaration(key);
      const noun = key === "posts" ? "post" : "page";
      return sdk.bases.createChangeRequest({
        baseId: resource.baseId,
        fields,
        message: `New ${noun}: ${String(fields.title || "Untitled")}`,
        submittedBy: "airapp",
        idempotencyKey: crypto.randomUUID(),
      });
    },

    async updateContent(input: {
      recordId: string;
      baseCommitId?: string | null;
      fields: Record<string, unknown>;
      title?: string;
    }) {
      return sdk.records.changeRequest({
        recordId: input.recordId,
        operation: "update",
        fields: input.fields,
        message: `Update: ${input.title ?? input.recordId}`,
        author: "airapp",
        ...(input.baseCommitId ? { baseCommitId: input.baseCommitId } : {}),
      });
    },

    async setStatus(input: {
      recordId: string;
      baseCommitId?: string | null;
      status: string;
      title?: string;
      publishedAt?: string;
    }) {
      return sdk.records.changeRequest({
        recordId: input.recordId,
        operation: "update",
        fields: {
          status: input.status,
          ...(input.publishedAt ? { "published-at": input.publishedAt } : {}),
        },
        message:
          input.status === "published"
            ? `Publish: ${input.title ?? input.recordId}`
            : `Unpublish: ${input.title ?? input.recordId}`,
        author: "airapp",
        ...(input.baseCommitId ? { baseCommitId: input.baseCommitId } : {}),
      });
    },
  };
}
