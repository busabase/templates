# busa-cms

A WordPress-style admin for the four Bases the [`busabase-cms-sdk`](https://www.npmjs.com/package/busabase-cms-sdk)
SDK reads: **Posts**, **Pages**, **Categories**, **Tags**.

```bash
# --auto-merge is required, not a shortcut: the seed links posts to categories and
# tags, and a relation stores the ids of rows that only exist once they are merged.
busabase-cli install ./templates/busa-cms --auto-merge
```

Then write in it, and point a Next.js site at the Folder:

```ts
import { createBusabaseCms } from "busabase-cms-sdk";

export const cms = createBusabaseCms({
  config: { baseUrl: …, apiKey: …, spaceId: … },
  folderId: process.env.BUSABASE_CMS_FOLDER_ID,   // shown under Help & Settings › Connect
  lazyCreate: true,
});

const posts = await cms.posts.list();                        // only `published` rows, ever
const post = await cms.posts.getByPath("/blog/hello");       // posts and pages: by path
const tag  = await cms.tags.getBySlug("nextjs");             // taxonomy: by slug
```

## Why the schema is not negotiable

`content/busa-cms-app/app/js/schema.js` is the SDK's `standard` profile copied field
for field. It has to be a copy — an installed AirApp is a self-contained Node
project and cannot resolve a package only the consuming website has — so the copy is
checked rather than trusted:

```bash
npm install
node scripts/check-sdk-contract.mjs
```

That resolves the real published `busabase-cms-sdk`, asks it for the same four Base
definitions, and fails on any difference in a field, type, required flag, select
choice, attachment policy or relation target. It also parses every published seed
row through the SDK's own DTO schemas, which is what catches a demo that installs
cleanly and then never appears on the site.

## Layout

```
busa-cms/
├── SKILL.md                     the manual an agent reads before touching this data
├── busabase.json                manifest + catalog entry
├── scripts/
│   ├── sync-content.mjs         content/ ← the app's declaration (never hand-edit content/)
│   └── check-sdk-contract.mjs   this template ↔ the published busabase-cms-sdk
├── content/
│   ├── _folder.json             generated
│   ├── {categories,tags,posts,pages}/   base.json + records.ndjson, generated
│   └── busa-cms-app/            the AirApp
│       ├── server/ lib/         Hono + the single busabase-sdk boundary
│       └── app/                 zero-build ES modules and cascade-layered CSS
└── assets/screenshots/          catalog images
```

## Working on it

```bash
node scripts/sync-content.mjs --check                 # content/ is current
node scripts/check-sdk-contract.mjs                   # matches the SDK
cd content/busa-cms-app
pnpm install
node scripts/check.mjs                                # AirApp contract checks
pnpm dev                                              # http://localhost:3000
pnpm dev  # then open /?demo=1 for the seed content without a workspace
```

Standalone, the app shows a Busabase Cloud / custom-server OAuth gate; deployed as
an AirApp it uses the ambient session. No credential ever reaches the browser —
the Hono server owns the SDK, and the browser only talks to `/api/*`.
