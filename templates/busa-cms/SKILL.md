---
name: busa-cms
description: A website's Posts, Pages, Categories, and Tags, in the exact shape the busabase-cms SDK reads. Use when the user wants to run a blog or marketing site's content out of Busabase, asks to write/edit/publish a post or page, wants their Next.js site wired to a Busabase Folder, or asks why something they wrote is not showing up on the site.
metadata:
  category: content
  tags:
    - risk:local-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-cms
    resources:
      - categories
      - tags
      - posts
      - pages
    risk: local-write
---

# Busa CMS

Four Bases that a website reads directly, plus an admin for the people who write
into them. Posts are Markdown, Pages are HTML, and Categories and Tags are shared
between them.

The point of this template is that the schema is **not its own invention**. It is
the `standard` profile of the [`busabase-cms`](https://www.npmjs.com/package/busabase-cms)
npm SDK, mirrored field for field, so a site can do this and it works:

```ts
import { createBusabaseCms } from "busabase-cms";

export const cms = createBusabaseCms({
  config: {
    baseUrl: process.env.BUSABASE_BASE_URL,
    apiKey: process.env.BUSABASE_API_KEY,
    spaceId: process.env.BUSABASE_SPACE_ID,
  },
  folderId: process.env.BUSABASE_CMS_FOLDER_ID,
  lazyCreate: true,
});

const posts = await cms.posts.list();
const page = await cms.pages.getByPath("/pricing");
```

Posts and Pages are looked up by **path**; only Categories and Tags have
`getBySlug`. Installing the package needs `--auto-merge`, because the seed links
posts to categories and tags and a relation stores ids that exist only once the
rows are merged.

The Folder id that goes in `BUSABASE_CMS_FOLDER_ID` is shown in the app under
**Help & Settings › Connect**, along with the snippet above filled in for this
install.

## The one rule that explains everything else

**The SDK serves rows whose `status` is `published`, and nothing else.**

That single fact is why a draft is invisible to visitors without a staging site,
why "why isn't my post live" is almost always "it is still a draft", and why this
app's list has a Published/Drafts filter rather than a workflow. Say it in those
terms; do not describe drafts as "pending" or "waiting for approval" — nothing is
waiting on anyone.

## Bases

| Resource | What a row is | Notable fields |
| --- | --- | --- |
| `posts` | one Markdown article | `path`, `title`, `slug`, `locale`, `status`, `body` (markdown), `description` (excerpt), `author`, `categories`, `tags`, `published-at`, `cover-image`, `seo-title`, `seo-description`, `canonical-url`, `legacy-paths` |
| `pages` | one HTML page | the same identity and SEO fields, plus `template` (`standard`/`landing`/`product`/`use-case`), `body` (html), `hero`, `features`, `faqs` |
| `categories` | one reusable category | `name`, `slug`, `locale`, `description` |
| `tags` | one reusable tag | same shape as categories |

Rules the site depends on, in the order they bite:

- **`path` is the route, and it must start with `/`.** The SDK rejects a row whose
  path does not; it is not served, and nothing tells the author. Unique per locale.
- **`path` is also a promise.** Changing it breaks every existing link. Put the old
  value in `legacy-paths` before you change it, not after the traffic drops.
- **`schema-version` is required and is `1`.** Write it on every row you create.
- **A `json` field holds JSON *text*.** `legacy-paths`, `hero`, `features` and
  `faqs` are stored raw and validated to parse, so write `JSON.stringify(value)`,
  not the value. The SDK reader accepts either form, so the mistake only surfaces
  as a rejected write.
- **`locale` matters even on a single-language site.** Every uniqueness rule is
  scoped to it, and a row with the wrong locale simply will not appear.
- **Relations point at record ids** in `categories`/`tags`. Resolve the term first;
  do not invent one because a name looked close.
- **Dates are `YYYY-MM-DD`.** `published-at` orders the blog index; a published post
  without one cannot be sorted.

## What the app does

Four lists in the sidebar — Posts, Pages, Categories, Tags — a Published/Drafts
filter above the list, and a detail pane with **Edit** and **Publish** /
**Move to draft**. New posts and pages start as drafts.

Two things the tables cannot tell you, which the app does:

- **Help & Settings › Connect** — the Folder id and the exact env and server code
  for the consuming site.
- **Help & Settings › Resources** — the live Bases diffed against what
  `busabase-cms` expects to adopt, so drift shows up here rather than as a
  `BusabaseCmsSchemaDriftError` on the site's first render.

## Where you are allowed to go

Saving is a save. This app passes no `autoMerge`, so Busabase's own permission-aware
default decides: with write access on the Folder a save lands immediately, and
without it the same save becomes a ChangeRequest for someone who has it. Report what
actually came back rather than promising either outcome.

What you must not do:

- **Do not delete a published row to "unpublish" it.** Set `status` to `draft`. A
  delete loses the path, its history, and the redirect you would have needed.
- **Do not renumber, re-slug, or "tidy" paths in bulk.** Every one is a live URL.
- **Do not write `status: published` on a row you just created** unless the person
  asked you to publish it. Draft first is the norm here, same as any CMS.
- **Do not edit the four Bases' field definitions.** They are the SDK's contract;
  changing one breaks the site rather than this app. Extra fields are fine — the SDK
  preserves them and exposes them as `rawFields`.
- **Do not put secrets in content.** These rows are published to the internet.

## Maintaining the template

```bash
node scripts/sync-content.mjs           # regenerate content/ from the app's declaration
node scripts/sync-content.mjs --check   # verify it is current
npm install && node scripts/check-sdk-contract.mjs   # diff against the real busabase-cms
cd content/busa-cms-app && node scripts/check.mjs    # AirApp contract checks
```

`content/*/base.json` and `records.ndjson` are **generated** — edit
`content/busa-cms-app/app/js/{schema,config}.js` and `content/busa-cms-app/lib/sample-content.js`
instead. `check-sdk-contract.mjs` is what keeps the claim in the first paragraph
true: it resolves the published `busabase-cms` and fails if a single field, type,
required flag, select choice, attachment policy or relation target has drifted.
