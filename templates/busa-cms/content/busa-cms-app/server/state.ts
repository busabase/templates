import { analyze, LIVE_STATUS } from "../app/js/content-model.js";
import { appConfig } from "../app/js/config.js";
import { CMS_BASES } from "../app/js/schema.js";
import { createBusabaseClient } from "../lib/busabase-client.ts";
import { diffSchema, schemaIsClean } from "../lib/schema-health.ts";
import { runtimeOrigin } from "../lib/runtime-context.ts";
import { connectSnippets } from "../lib/connect-snippets.ts";

/**
 * One payload, everything a screen needs.
 *
 * Deliberately not a REST surface over the four Bases: the screens ask cross-Base
 * questions ("which live pages collide", "how many posts use this tag"), so
 * answering them once here beats four round trips and a second copy of the rules
 * in the browser.
 */

/** Choice id → its "English / 中文" name, so the browser can label without the schema. */
const choiceMaps = () => {
  const post = CMS_BASES.find((base) => base.role === "posts");
  const page = CMS_BASES.find((base) => base.role === "pages");
  const named = (base: any, slug: string) =>
    Object.fromEntries(
      (base?.fields.find((field: any) => field.slug === slug)?.options?.choices ?? []).map(
        (choice: any) => [choice.id, choice.name],
      ),
    );
  return {
    locale: named(post, "locale"),
    status: named(post, "status"),
    template: named(page, "template"),
  };
};

/**
 * Two questions the setup gate answers separately: can this app reach its Bases,
 * and is a website actually reading them. A Space can be perfectly connected and
 * still have nothing published.
 */
const onboardingState = (input: {
  basesFound: number;
  basesExpected: number;
  schemaOk: boolean;
  publishedCount: number;
}) => {
  if (input.basesFound < input.basesExpected || !input.schemaOk) {
    return { configured: false, state: "needs_resources", publishedCount: input.publishedCount };
  }
  if (input.publishedCount === 0) {
    return { configured: false, state: "needs_content", publishedCount: 0 };
  }
  return { configured: true, state: "ready", publishedCount: input.publishedCount };
};

const emptyPayload = (extra: Record<string, unknown>) => ({
  items: [],
  terms: [],
  counts: {},
  choices: choiceMaps(),
  schemaHealth: null,
  ...extra,
});

export async function statePayload() {
  const client = createBusabaseClient();

  let resources;
  try {
    resources = await client.resolveResources();
  } catch (error: any) {
    return emptyPayload({
      connection: { baseUrl: runtimeOrigin(), profile: appConfig.cms.profile },
      provider_status: {
        ok: false,
        provider: "busabase",
        mode: "busabase",
        message: String(error?.message || error),
      },
      setup: { connection: {}, onboarding: { configured: false, state: "needs_resources" } },
    });
  }

  if (resources.basesFound < resources.basesExpected) {
    return emptyPayload({
      connection: {
        baseUrl: runtimeOrigin(),
        folderId: resources.folderId,
        folderSlug: appConfig.schema.folder.slug,
        profile: appConfig.cms.profile,
      },
      provider_status: { ok: true, provider: "busabase", mode: "busabase" },
      setup: {
        connection: { ...resources, baseUrl: runtimeOrigin(), schemaOk: false },
        onboarding: { configured: false, state: "needs_resources", publishedCount: 0 },
      },
    });
  }

  const [categories, tags, posts, pages, described] = await Promise.all([
    client.listRecords("categories"),
    client.listRecords("tags"),
    client.listRecords("posts"),
    client.listRecords("pages"),
    client.describeBases(),
  ]);

  const analysis = analyze({ categories, tags, posts, pages });
  const schemaHealth = diffSchema(described as any);
  const schemaOk = schemaIsClean(schemaHealth);
  const publishedCount = analysis.items.filter((item) => item.status === LIVE_STATUS).length;

  return {
    items: analysis.items,
    terms: analysis.terms,
    counts: analysis.counts,
    choices: choiceMaps(),
    connection: {
      baseUrl: runtimeOrigin(),
      folderId: resources.folderId,
      folderSlug: appConfig.schema.folder.slug,
      spaceId: appConfig.spaceId || "",
      profile: appConfig.cms.profile,
      sdkPackage: appConfig.cms.sdkPackage,
      bases: appConfig.schema.bases.map((base) => ({ key: base.key, slug: base.slug })),
      snippets: connectSnippets({
        baseUrl: runtimeOrigin(),
        spaceId: appConfig.spaceId || "",
        folderId: resources.folderId,
        profile: appConfig.cms.profile,
      }),
    },
    schemaHealth,
    provider_status: { ok: true, provider: "busabase", mode: "busabase" },
    setup: {
      connection: { ...resources, baseUrl: runtimeOrigin(), schemaOk },
      onboarding: onboardingState({ ...resources, schemaOk, publishedCount }),
    },
  };
}

/**
 * Whether the save landed or is waiting for someone with write access. The app does
 * not decide this — Busabase does, from the actor's own permission — so the UI
 * reports what came back rather than announcing an outcome in advance.
 */
const saveResult = (result: any) => ({
  id: String(result?.id || ""),
  merged: result?.materialized !== false && result?.status !== "in_review",
});

export async function saveContent(body: any) {
  const client = createBusabaseClient();
  const kind = body?.kind === "pages" ? "pages" : "posts";
  const fields = { ...(body?.fields || {}), "schema-version": 1 };

  if (body?.recordId) {
    return saveResult(
      await client.updateContent({
        recordId: String(body.recordId),
        baseCommitId: body?.baseCommitId || null,
        fields,
        title: body?.fields?.title,
      }),
    );
  }
  return saveResult(await client.createContent(kind, { status: "draft", ...fields }));
}

export async function setStatus(body: any) {
  const status = body?.status === "published" ? "published" : "draft";
  return saveResult(
    await createBusabaseClient().setStatus({
      recordId: String(body?.recordId || ""),
      baseCommitId: body?.baseCommitId || null,
      status,
      title: body?.title,
      // A first publish gets today's date; re-publishing keeps the original, so a
      // typo fix does not move the post to the top of the blog index.
      publishedAt:
        status === "published" ? body?.publishedAt || new Date().toISOString().slice(0, 10) : undefined,
    }),
  );
}
