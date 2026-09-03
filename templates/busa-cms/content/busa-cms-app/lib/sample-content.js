/**
 * The demo seed, declared once.
 *
 * Two things read this file, and they must not disagree:
 *  - `scripts/sync-content.mjs` writes it out as `content/<base>/records.ndjson`,
 *    the rows install merges into a real Space;
 *  - `js/providers/demo-provider.js` serves it directly, so the gallery preview
 *    (`?demo=1`) shows the same content without a workspace behind it.
 *
 * Relation values are package-local `key`s of rows in the target Base; install
 * mints real record ids and rewrites them.
 *
 * A `json` field (`legacy-paths`, `hero`, `features`, `faqs`) holds JSON **text**,
 * not a parsed value: Busabase stores it raw like `code` and validates that it
 * parses, so an array literal here is rejected at install with "must be text". The
 * SDK reader accepts either form, which is exactly why this only shows up against
 * a real server — `scripts/sync-content.mjs` now checks it too.
 *
 * The seed is a small bilingual site on purpose: one locale would hide the fact
 * that every Base carries `locale`, and one status would hide that the SDK
 * serves `published` and nothing else.
 */

/** Site the demo content belongs to. Fictional; the domain is reserved for examples. */
export const DEMO_SITE = "https://tidepool.example";

export const sampleRecords = {
  categories: [
    {
      key: "category-product",
      fields: {
        name: "Product",
        slug: "product",
        locale: "en",
        description: "Releases, changelogs, and what shipped.",
      },
    },
    {
      key: "category-guides",
      fields: {
        name: "Guides",
        slug: "guides",
        locale: "en",
        description: "How to get something done with Tidepool.",
      },
    },
    {
      key: "category-engineering",
      fields: {
        name: "Engineering",
        slug: "engineering",
        locale: "en",
        description: "How the product is built and why.",
      },
    },
    {
      key: "category-product-zh",
      fields: {
        name: "产品",
        slug: "product",
        locale: "zh-CN",
        description: "版本发布与更新日志。",
      },
    },
  ],
  tags: [
    {
      key: "tag-launch",
      fields: {
        name: "Launch",
        slug: "launch",
        locale: "en",
        description: "Announcements for something newly available.",
      },
    },
    {
      key: "tag-nextjs",
      fields: {
        name: "Next.js",
        slug: "nextjs",
        locale: "en",
        description: "Content about the Next.js integration.",
      },
    },
    {
      key: "tag-seo",
      fields: {
        name: "SEO",
        slug: "seo",
        locale: "en",
        description: "Search, canonical URLs, and metadata.",
      },
    },
    {
      key: "tag-migration",
      fields: {
        name: "Migration",
        slug: "migration",
        locale: "en",
        description: "Moving content in from somewhere else.",
      },
    },
    {
      key: "tag-launch-zh",
      fields: {
        name: "发布",
        slug: "launch",
        locale: "zh-CN",
        description: "新功能上线公告。",
      },
    },
  ],
  posts: [
    {
      key: "post-introducing-tidepool",
      fields: {
        path: "/blog/introducing-tidepool",
        title: "Introducing Tidepool",
        slug: "introducing-tidepool",
        locale: "en",
        status: "published",
        description:
          "Analytics that answer one question — did this week go better than last week?",
        body: [
          "Most analytics tools are built for teams with an analyst. Tidepool is built",
          "for the person who ships the product, answers the support email, and writes",
          "the changelog — all before lunch.",
          "",
          "## One number, in context",
          "",
          "The dashboard opens on a single trend line and the one sentence that explains",
          "it. Everything else is a click away, not in your face.",
          "",
          "## What is in the first release",
          "",
          "- Weekly digests that read like a note from a colleague",
          "- Retention cohorts without a query builder",
          "- A public changelog fed straight from this CMS",
          "",
          "We would rather ship something small that you read every Monday than",
          "something enormous you open twice.",
        ].join("\n"),
        author: "Ada Whitfield",
        categories: ["category-product"],
        tags: ["tag-launch"],
        "published-at": "2026-07-14",
        "seo-title": "Introducing Tidepool — weekly analytics for solo makers",
        "seo-description":
          "Tidepool answers one question every Monday: did this week go better than last week?",
        "schema-version": 1,
      },
    },
    {
      key: "post-nextjs-guide",
      fields: {
        path: "/blog/publish-with-nextjs",
        title: "Publish this blog from Busabase with Next.js",
        slug: "publish-with-nextjs",
        locale: "en",
        status: "published",
        description:
          "The twenty lines of server code between a Busabase Folder and a live blog route.",
        body: [
          "This post is stored in a Busabase Base and rendered by a Next.js route.",
          "Here is the whole connection.",
          "",
          "```ts",
          'import { createBusabaseCms } from "busabase-cms";',
          "",
          "const cms = createBusabaseCms({",
          "  config: {",
          "    baseUrl: process.env.BUSABASE_BASE_URL,",
          "    apiKey: process.env.BUSABASE_API_KEY,",
          "    spaceId: process.env.BUSABASE_SPACE_ID,",
          "  },",
          "  folderId: process.env.BUSABASE_CMS_FOLDER_ID,",
          "  lazyCreate: true,",
          "});",
          "",
          "export default async function Page({ params }) {",
          // Posts and Pages are looked up by `path`; only taxonomy has getBySlug.
          '  const post = await cms.posts.getByPath(`/blog/${params.slug}`);',
          "  if (!post) notFound();",
          "  return <Article post={post} />;",
          "}",
          "```",
          "",
          "## Only published rows are served",
          "",
          "The SDK reads rows whose `status` is `published`. A draft is invisible to the",
          "site by construction — you do not need a second staging environment to keep",
          "unfinished work off the internet.",
          "",
          "## Paths are the contract",
          "",
          "`path` is what the site routes on, and it is unique per locale. Keep it stable;",
          "if you must change one, put the old value in `legacy-paths` so the redirect",
          "writes itself.",
        ].join("\n"),
        author: "Ada Whitfield",
        categories: ["category-guides"],
        tags: ["tag-nextjs", "tag-seo"],
        "published-at": "2026-07-28",
        "canonical-url": "https://tidepool.example/blog/publish-with-nextjs",
        "seo-title": "Publish a Next.js blog from a Busabase Folder",
        "seo-description":
          "Wire busabase-cms to a Busabase Folder and render posts from a Next.js route.",
        "schema-version": 1,
      },
    },
    {
      key: "post-migration",
      fields: {
        path: "/blog/moving-off-markdown-files",
        title: "Moving 60 posts out of the repo",
        slug: "moving-off-markdown-files",
        locale: "en",
        status: "published",
        description: "What broke, what did not, and the redirect table we should have kept.",
        body: [
          "Our posts used to be MDX files in the app repo. Publishing a typo fix meant a",
          "pull request, a review, and a deploy. Here is what moving them into Busabase",
          "actually cost.",
          "",
          "## Frontmatter maps almost one to one",
          "",
          "| Frontmatter | Base field |",
          "| --- | --- |",
          "| `title` | `title` |",
          "| `date` | `published-at` |",
          "| `draft: true` | `status: draft` |",
          "| `tags` | `tags` relation |",
          "",
          "## The part we got wrong",
          "",
          "We renamed a handful of slugs on the way in and lost the old URLs. `legacy-paths`",
          "exists for exactly this; fill it in before the migration, not after the traffic",
          "drop.",
        ].join("\n"),
        author: "Roman Vasquez",
        categories: ["category-engineering", "category-guides"],
        tags: ["tag-migration", "tag-seo"],
        "published-at": "2026-08-11",
        "legacy-paths": '["/posts/moving-off-markdown", "/blog/2026/markdown-migration"]',
        "seo-title": "Migrating 60 MDX posts into a Busabase CMS",
        "seo-description":
          "A frontmatter-to-field mapping, and the redirect table worth writing first.",
        "schema-version": 1,
      },
    },
    {
      key: "post-launch-zh",
      fields: {
        path: "/zh-CN/blog/tidepool-shang-xian",
        title: "Tidepool 正式上线",
        slug: "tidepool-shang-xian",
        locale: "zh-CN",
        status: "published",
        description: "每周一封数据简报，只回答一个问题：这周比上周好吗？",
        body: [
          "大多数分析工具是给有数据分析师的团队做的。Tidepool 是给那种上午发版、",
          "中午回工单、下午写更新日志的人做的。",
          "",
          "## 一个数字，带上下文",
          "",
          "打开只有一条趋势线，以及解释这条线的一句话。其余的都在一次点击之后，",
          "而不是糊在脸上。",
          "",
          "## 首个版本包含",
          "",
          "- 读起来像同事留言的每周简报",
          "- 不用写查询的留存分析",
          "- 直接由这套 CMS 驱动的公开更新日志",
        ].join("\n"),
        author: "Ada Whitfield",
        categories: ["category-product-zh"],
        tags: ["tag-launch-zh"],
        "published-at": "2026-07-14",
        "seo-title": "Tidepool 上线 —— 给独立开发者的每周数据简报",
        "seo-description": "每周一封简报，只回答一个问题：这周比上周好吗？",
        "schema-version": 1,
      },
    },
    {
      key: "post-cohorts-draft",
      fields: {
        path: "/blog/reading-a-cohort-table",
        title: "How to read a cohort table without a stats degree",
        slug: "reading-a-cohort-table",
        locale: "en",
        status: "in-review",
        description: "A triangle of percentages, explained one diagonal at a time.",
        body: [
          "A cohort table looks like a wall of numbers until someone shows you which",
          "direction to read it in. Read down a column, not across a row.",
          "",
          "TODO: add the annotated screenshot before this goes out.",
        ].join("\n"),
        author: "Roman Vasquez",
        categories: ["category-guides"],
        tags: [],
        "schema-version": 1,
      },
    },
    {
      key: "post-pricing-draft",
      fields: {
        path: "/blog/why-we-raised-prices",
        title: "Why we raised prices (and who is grandfathered)",
        slug: "why-we-raised-prices",
        locale: "en",
        status: "draft",
        body: "Outline only. Needs the final numbers from finance before review.",
        author: "Ada Whitfield",
        categories: [],
        tags: [],
        "schema-version": 1,
      },
    },
  ],
  pages: [
    {
      key: "page-home",
      fields: {
        path: "/",
        title: "Tidepool — analytics you actually read",
        slug: "home",
        locale: "en",
        status: "published",
        template: "landing",
        body: [
          "<section>",
          "  <h1>Did this week go better than last week?</h1>",
          "  <p>Tidepool answers that on Monday morning, in one sentence, by email.</p>",
          "</section>",
          "<section>",
          "  <h2>Built for one-person products</h2>",
          "  <p>No query builder, no dashboard to configure, no analyst required.</p>",
          "</section>",
        ].join("\n"),
        hero: JSON.stringify({
          headline: "Did this week go better than last week?",
          subhead: "One trend line, one sentence, every Monday.",
          cta: { label: "Start free", href: "/signup" },
        }),
        features: JSON.stringify([
          { title: "Weekly digest", body: "A short note, not a dashboard invitation." },
          { title: "Cohorts without SQL", body: "Retention you can read down a column." },
          { title: "Public changelog", body: "Fed straight from your CMS." },
        ]),
        "seo-title": "Tidepool — weekly analytics for solo makers",
        "seo-description":
          "One trend line and one sentence, every Monday. Analytics for people who ship alone.",
        "schema-version": 1,
      },
    },
    {
      key: "page-pricing",
      fields: {
        path: "/pricing",
        title: "Pricing",
        slug: "pricing",
        locale: "en",
        status: "published",
        template: "product",
        body: [
          "<h1>Pricing</h1>",
          "<p>One plan while you are small, one when you are not.</p>",
          "<ul>",
          "  <li><strong>Solo</strong> — free up to 10,000 events a month.</li>",
          "  <li><strong>Studio</strong> — $19 a month, unlimited projects.</li>",
          "</ul>",
        ].join("\n"),
        faqs: JSON.stringify([
          { q: "Do you charge per seat?", a: "No. Invite whoever needs to see the numbers." },
          {
            q: "What happens over the free limit?",
            a: "Collection continues and we email you. Nothing is dropped.",
          },
        ]),
        "seo-title": "Tidepool pricing — free while you are small",
        "seo-description": "Free up to 10,000 events a month, then $19 for unlimited projects.",
        "schema-version": 1,
      },
    },
    {
      key: "page-changelog-usecase",
      fields: {
        path: "/use-cases/public-changelog",
        title: "Run your public changelog from your CMS",
        slug: "public-changelog",
        locale: "en",
        status: "published",
        template: "use-case",
        body: [
          "<h1>Run your public changelog from your CMS</h1>",
          "<p>Every entry is a post with the <code>Product</code> category. The site route",
          "  filters on it, so shipping a changelog entry is writing a row and having it",
          "  reviewed — not a deploy.</p>",
        ].join("\n"),
        "seo-title": "Public changelog powered by Busabase CMS",
        "seo-description":
          "Ship changelog entries by writing a reviewed row, not by opening a pull request.",
        "schema-version": 1,
      },
    },
    {
      key: "page-about",
      fields: {
        path: "/about",
        title: "About Tidepool",
        slug: "about",
        locale: "en",
        status: "published",
        template: "standard",
        body: [
          "<h1>About</h1>",
          "<p>Two people in two time zones, building the analytics tool we kept failing to",
          "  find. Started in 2025, still independent.</p>",
        ].join("\n"),
        "legacy-paths": '["/company"]',
        "schema-version": 1,
      },
    },
    {
      key: "page-home-zh",
      fields: {
        path: "/zh-CN",
        title: "Tidepool —— 你真的会看的数据",
        slug: "home",
        locale: "zh-CN",
        status: "published",
        template: "landing",
        body: [
          "<section>",
          "  <h1>这周比上周好吗？</h1>",
          "  <p>每周一早上，一封邮件，一句话回答这个问题。</p>",
          "</section>",
        ].join("\n"),
        hero: JSON.stringify({
          headline: "这周比上周好吗？",
          subhead: "一条趋势线，一句话，每周一。",
          cta: { label: "免费开始", href: "/zh-CN/signup" },
        }),
        "seo-title": "Tidepool —— 给独立开发者的每周数据简报",
        "seo-description": "一条趋势线，一句话，每周一送到你的邮箱。",
        "schema-version": 1,
      },
    },
    {
      key: "page-security-draft",
      fields: {
        path: "/security",
        title: "Security",
        slug: "security",
        locale: "en",
        status: "draft",
        template: "standard",
        body: "<h1>Security</h1><p>Draft — waiting on the subprocessor list.</p>",
        "schema-version": 1,
      },
    },
  ],
};
