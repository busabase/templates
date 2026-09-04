import { CMS_BASES, CMS_SCHEMA_PROFILE, CMS_SCHEMA_VERSION } from "./schema.js";

/**
 * The app's single declaration of what it owns.
 *
 * `content/<base>/base.json` and `content/_folder.json` are GENERATED from this
 * file by `scripts/sync-content.mjs` — never hand-edit them. The AirApp cannot
 * read `content/` from inside its installed node, so the declaration has to live
 * on the app side and the package side is derived from it.
 *
 * The field definitions themselves come from `schema.js`, which mirrors the
 * busabase-cms-sdk SDK's standard profile.
 */

const readLimits = { categories: 100, tags: 100, posts: 50, pages: 50 };

const views = {
  categories: [
    {
      key: "all-categories",
      name: "All Categories / 全部分类",
      type: "table",
      config: {
        visibleFieldSlugs: ["name", "slug", "locale", "description", "updated-at"],
        sorts: [{ fieldSlug: "name", direction: "asc" }],
      },
      viewId: "",
    },
  ],
  tags: [
    {
      key: "all-tags",
      name: "All Tags / 全部标签",
      type: "table",
      config: {
        visibleFieldSlugs: ["name", "slug", "locale", "description", "updated-at"],
        sorts: [{ fieldSlug: "name", direction: "asc" }],
      },
      viewId: "",
    },
  ],
  posts: [
    {
      // Filtered on `status`, because that is the only state the SDK reads:
      // anything not "published" is invisible to the live site.
      key: "published-posts",
      name: "Published / 已发布",
      type: "table",
      config: {
        filters: [{ fieldSlug: "status", operator: "equals", value: "published" }],
        visibleFieldSlugs: ["title", "path", "locale", "author", "categories", "tags", "published-at"],
        sorts: [{ fieldSlug: "published-at", direction: "desc" }],
      },
      viewId: "",
    },
    {
      key: "all-posts",
      name: "All Posts / 全部文章",
      type: "table",
      config: {
        visibleFieldSlugs: ["title", "path", "status", "locale", "author", "published-at"],
        sorts: [{ fieldSlug: "published-at", direction: "desc" }],
      },
      viewId: "",
    },
    {
      key: "post-seo",
      name: "SEO review / SEO 检查",
      type: "table",
      config: {
        visibleFieldSlugs: ["title", "path", "seo-title", "seo-description", "canonical-url", "cover-image"],
        sorts: [{ fieldSlug: "path", direction: "asc" }],
      },
      viewId: "",
    },
  ],
  pages: [
    {
      key: "site-map",
      name: "Site pages / 站点页面",
      type: "table",
      config: {
        visibleFieldSlugs: ["title", "path", "template", "locale", "status", "updated-at"],
        sorts: [{ fieldSlug: "path", direction: "asc" }],
      },
      viewId: "",
    },
    {
      key: "published-pages",
      name: "Published / 已发布",
      type: "table",
      config: {
        filters: [{ fieldSlug: "status", operator: "equals", value: "published" }],
        visibleFieldSlugs: ["title", "path", "template", "locale", "updated-at"],
        sorts: [{ fieldSlug: "path", direction: "asc" }],
      },
      viewId: "",
    },
  ],
};

export const appConfig = {
  appId: "busa-cms",
  schemaVersion: 1,
  appName: "Busa CMS",
  appSlug: "busa-cms-app",
  description:
    "A website CMS desk for the standard busabase-cms-sdk Posts, Pages, Categories, and Tags Bases.",
  locale: "en",
  deployment: "cloud",
  spaceId: "",
  readOnly: false,
  cms: {
    /** What `createBusabaseCms({ schemaProfile })` has to be given to read this Folder. */
    profile: CMS_SCHEMA_PROFILE,
    metadataSchemaVersion: CMS_SCHEMA_VERSION,
    /** The npm package this schema is the counterpart of. */
    sdkPackage: "busabase-cms-sdk",
    docs: "https://www.npmjs.com/package/busabase-cms-sdk",
  },
  brand: {
    mode: "inferred",
    accent: "#7C3AED",
    logo_path: "",
  },
  schema: {
    folder: {
      name: "Busa CMS",
      slug: "busa-cms",
      description:
        "Website content the busabase-cms-sdk SDK reads: Markdown posts, HTML pages, and their taxonomy.",
      nodeId: "",
    },
    bases: CMS_BASES.map((base) => ({
      key: base.role,
      name: base.name,
      // The slug install produces: the Folder slug, then the Base key. It is also
      // one of the names the SDK's adoption accepts (`<folder-slug>-<role>`), so a
      // Folder installed from this template is recognised even if its Bases are
      // later renamed.
      slug: `busa-cms-${base.role}`,
      nodeId: "",
      baseId: "",
      readLimit: readLimits[base.role],
      description: base.description,
      fields: base.fields,
      views: views[base.role],
    })),
    relations: [
      {
        source_base: "posts",
        field_slug: "categories",
        field_name: "Categories",
        target_base: "categories",
        required: false,
        multiple: true,
      },
      {
        source_base: "posts",
        field_slug: "tags",
        field_name: "Tags",
        target_base: "tags",
        required: false,
        multiple: true,
      },
    ],
    docs: [],
    drives: [],
    whiteboards: [],
    forms: [],
    workflows: [],
    html: [],
    vaultRequirements: [],
    integrations: [],
  },
  ui: {
    primary_base: "posts",
    summary:
      "See what the website actually serves, read a post or page the way the SDK renders it, and propose the next edit for review.",
    screens: [
      {
        id: "library",
        name: "Library",
        purpose: "Browse posts and pages by status and locale, and preview one as rendered.",
        data_sources: ["posts", "pages", "categories", "tags"],
      },
      {
        id: "taxonomy",
        name: "Taxonomy",
        purpose: "Review categories and tags, and spot ones nothing uses.",
        data_sources: ["categories", "tags", "posts"],
      },
      {
        id: "connect",
        name: "Connect",
        purpose:
          "Show the Folder id, the schema health, and the exact busabase-cms-sdk snippet for the site.",
        data_sources: ["posts", "pages", "categories", "tags"],
      },
    ],
    attention_states: ["not_published", "missing_seo", "orphan_taxonomy", "duplicate_path"],
    actions: [
      {
        id: "draft-post",
        label: "Draft Post",
        kind: "change_request",
        base: "posts",
        fields: [
          "path",
          "title",
          "slug",
          "locale",
          "status",
          "description",
          "body",
          "author",
          "categories",
          "tags",
          "published-at",
          "seo-title",
          "seo-description",
          "schema-version",
        ],
      },
      {
        id: "draft-page",
        label: "Draft Page",
        kind: "change_request",
        base: "pages",
        fields: [
          "path",
          "title",
          "slug",
          "locale",
          "status",
          "template",
          "body",
          "seo-title",
          "seo-description",
          "schema-version",
        ],
      },
      {
        id: "request-publish",
        label: "Request Publish",
        kind: "change_request",
        base: "posts",
        fields: ["status", "published-at"],
      },
    ],
  },
  permissions: {
    read_procedures: [
      "nodes.list",
      "bases.get",
      "nodes.get",
      "records.listPaged",
      "records.search",
      "changeRequests.listPaged",
    ],
    change_request_procedures: ["bases.createChangeRequest", "records.changeRequest"],
  },
};
