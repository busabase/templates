/**
 * The busabase-cms "standard" profile, mirrored field for field.
 *
 * This file is a deliberate copy of `busabase-cms`'s own `src/schema.ts`
 * (`getBusabaseCmsBaseDefinition`, profile `standard`, schemaVersion 1). It is a
 * copy rather than an import because an installed AirApp is a self-contained
 * Node project served from a Busabase node: it cannot resolve an npm package
 * that only the website using this content has installed.
 *
 * That makes drift the real risk, so it is checked rather than trusted:
 * `node scripts/check-sdk-contract.mjs` (run from the template root) resolves the
 * published `busabase-cms` and asserts every Base, field, type, required flag,
 * select choice, attachment policy and relation target here is identical to what
 * the SDK would provision. If the SDK changes its contract, that check fails and
 * this file — not the SDK — is what has to move.
 *
 * Why it matters in the product: a site running `createBusabaseCms({ folderId })`
 * against a Folder installed from this template must find exactly the schema it
 * expects. One missing field or one broader attachment policy and the SDK throws
 * `BusabaseCmsSchemaDriftError` on the site's first render instead of serving a
 * page.
 */

/** Field display names are i18n records — Busabase renders them per viewer locale. */
const i18n = (en, zhCN) => ({ en, "zh-CN": zhCN });

const choices = (values) => ({
  choices: values.map(([id, en, zhCN]) => ({ id, name: `${en} / ${zhCN}` })),
});

export const LOCALE_OPTIONS = choices([
  ["en", "English", "英文"],
  ["zh-CN", "Simplified Chinese", "简体中文"],
  ["zh-TW", "Traditional Chinese", "繁體中文"],
  ["ja", "Japanese", "日文"],
  ["pt", "Portuguese", "葡萄牙文"],
]);

export const STATUS_OPTIONS = choices([
  ["draft", "Draft", "草稿"],
  ["in-review", "In review", "审核中"],
  ["published", "Published", "已发布"],
  ["archived", "Archived", "已归档"],
]);

export const TEMPLATE_OPTIONS = choices([
  ["standard", "Standard", "标准"],
  ["landing", "Landing", "落地页"],
  ["product", "Product", "产品"],
  ["use-case", "Use case", "使用场景"],
]);

const field = (slug, name, type, required, options = {}) => ({
  slug,
  name,
  type,
  required,
  options,
});

/** Categories and Tags share one shape in the SDK; so do they here. */
const taxonomyFields = () => [
  field("name", i18n("Name", "名称"), "text", true),
  field("slug", i18n("Slug", "标识"), "text", true),
  field("locale", i18n("Locale", "语言"), "select", true, LOCALE_OPTIONS),
  field("description", i18n("Description", "描述"), "longtext", false),
  field("updated-at", i18n("Updated at", "更新时间"), "updated_time", false),
];

const postFields = () => [
  field("path", i18n("Path", "网址"), "text", true),
  field("title", i18n("Title", "标题"), "text", true),
  field("slug", i18n("Slug", "标识"), "text", true),
  field("locale", i18n("Locale", "语言"), "select", true, LOCALE_OPTIONS),
  field("status", i18n("Status", "状态"), "select", true, STATUS_OPTIONS),
  field("description", i18n("Excerpt", "摘要"), "longtext", false),
  field("body", i18n("Body", "正文"), "markdown", true),
  field("cover-image", i18n("Cover image", "封面图片"), "attachment", false, {
    attachment: { maxFiles: 1, allowedMimeTypes: ["image/*"], maxFileSize: 10 * 1024 * 1024 },
  }),
  field("attachments", i18n("Attachments", "附件"), "attachment", false, {
    attachment: {
      maxFiles: 20,
      allowedMimeTypes: ["image/*", "application/pdf"],
      maxFileSize: 20 * 1024 * 1024,
    },
  }),
  field("author", i18n("Author", "作者"), "text", false),
  // The template ships slugs, not ids: `targetBaseSlug` is resolved server-side at
  // install. The SDK later validates the resolved `targetBaseId` against the Base it
  // adopted for that role, so the two routes have to land on the same Base.
  field("categories", i18n("Categories", "分类"), "relation", false, {
    targetBaseSlug: "categories",
    multiple: true,
  }),
  field("tags", i18n("Tags", "标签"), "relation", false, {
    targetBaseSlug: "tags",
    multiple: true,
  }),
  field("published-at", i18n("Published at", "发布时间"), "date", false),
  field("canonical-url", i18n("Canonical URL", "规范网址"), "url", false),
  field("legacy-paths", i18n("Legacy paths", "旧网址"), "json", false),
  field("seo-title", i18n("SEO title", "SEO 标题"), "text", false),
  field("seo-description", i18n("SEO description", "SEO 描述"), "longtext", false),
  field("schema-version", i18n("Schema version", "结构版本"), "number", true),
  field("updated-at", i18n("Updated at", "更新时间"), "updated_time", false),
];

const pageFields = () => [
  field("path", i18n("Path", "网址"), "text", true),
  field("title", i18n("Title", "标题"), "text", true),
  field("slug", i18n("Slug", "标识"), "text", true),
  field("locale", i18n("Locale", "语言"), "select", true, LOCALE_OPTIONS),
  field("status", i18n("Status", "状态"), "select", true, STATUS_OPTIONS),
  field("template", i18n("Template", "模板"), "select", true, TEMPLATE_OPTIONS),
  field("body", i18n("Body", "正文"), "html", true),
  field("hero", i18n("Hero", "首屏"), "json", false),
  field("features", i18n("Features", "功能"), "json", false),
  field("faqs", i18n("FAQs", "常见问题"), "json", false),
  field("canonical-url", i18n("Canonical URL", "规范网址"), "url", false),
  field("legacy-paths", i18n("Legacy paths", "旧网址"), "json", false),
  field("seo-title", i18n("SEO title", "SEO 标题"), "text", false),
  field("seo-description", i18n("SEO description", "SEO 描述"), "longtext", false),
  field("schema-version", i18n("Schema version", "结构版本"), "number", true),
  field("updated-at", i18n("Updated at", "更新时间"), "updated_time", false),
];

/**
 * Declared in the SDK's own provisioning order (Categories, Tags, Posts, Pages) so
 * the taxonomy Bases a relation points at already exist when Posts is created.
 */
export const CMS_BASES = [
  {
    role: "categories",
    name: "Categories / 分类",
    description: "Reusable content categories / 可复用的内容分类",
    fields: taxonomyFields(),
  },
  {
    role: "tags",
    name: "Tags / 标签",
    description: "Reusable content tags / 可复用的内容标签",
    fields: taxonomyFields(),
  },
  {
    role: "posts",
    name: "Posts / 文章",
    description: "Publishable Markdown posts / 可发布的 Markdown 文章",
    fields: postFields(),
  },
  {
    role: "pages",
    name: "Pages / 页面",
    description: "Publishable HTML pages / 可发布的 HTML 页面",
    fields: pageFields(),
  },
];

/** `metadata.busabaseCms.schemaVersion` the SDK writes onto the Folder. */
export const CMS_SCHEMA_VERSION = 1;
export const CMS_SCHEMA_PROFILE = "standard";
