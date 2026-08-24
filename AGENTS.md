# Working in this repository

Rules for an agent adding or changing a template here. This file is about **this
repository's conventions** — where things go, what is generated, how work is
submitted. It does not teach you how to build a Busabase app; that is a separate
job with a separate owner (see below).

## Building the app itself is not this repository's job

To design an app — its tables, its AirApp, its resource model, the runtime
constraints an AirApp has to satisfy — use the `busabase-app-creator` skill:

```bash
npx skills add busabase/skills
```

That skill owns the *mechanics*: what an AirApp may and may not do, how
resources are modelled, how the code gets deployed and reviewed. Nothing here
restates those rules, and nothing here overrides them. If a rule in this file
seems to contradict it, this file is wrong — say so rather than picking one.

## Layout

One template per directory under `templates/`:

```
templates/<name>/
├── SKILL.md          the manual an agent reads before touching this app's data
├── busabase.json     manifest + the `template` object the catalog reads
├── content/          the resources, as plain files
│   ├── <base>/base.json + records.ndjson
│   └── <name>-app/   the AirApp: a real Node project, `_node.json` + source
├── assets/screenshots/
└── scripts/          optional; carried into the installed Skill node, never run by Busabase
```

`<name>` is the template's identity: it is the directory name, the manifest
`name`, and the `name` in SKILL.md's frontmatter. The validator requires the
three to agree, because they are one thing.

## What is generated, and must not be hand-edited

**`templates.json`** — the catalog the dashboard reads. Rebuild it after any
change to a template:

```bash
npx busabase-cli index . --repo busabase/templates -o templates.json
npx busabase-cli index . --repo busabase/templates -o templates.json --check   # verify
```

Whether a template is listed is decided by the same rules that decide how it
installs, so editing this file by hand can only make the catalog lie about what
an install does.

**`content/<base>/base.json`, when a template generates it.** Some templates
declare their tables in the AirApp's own config, because the app needs those
field definitions at runtime and cannot read `content/` from inside the
installed node. Those templates carry a sync script — `busa-email` has
`scripts/sync-content.mjs` — and the declaration, not the generated file, is
where an edit belongs:

```bash
cd templates/<name> && node scripts/sync-content.mjs        # regenerate
cd templates/<name> && node scripts/sync-content.mjs --check # verify
```

If a template has no such script, its `base.json` files are hand-written and are
the source.

## Things that are load-bearing and easy to get wrong

- **`SKILL.md` must opt in**: `metadata.busabase.template: true`. It is never
  inferred from the directory's shape. Publishing a template means accepting
  that installers run its code and hand this file to their agent, and that
  deserves a deliberate flag.
- **Every key in `metadata.busabase.resources` must name a Base under
  `content/`.** An agent told about a table that does not exist writes to the
  wrong one.
- **The AirApp's `package.json` needs a `dev` script.** Busabase starts an app
  with `npm run dev`; without it the app installs and then never boots.
- **`resourceKey` must match the slug the package ships under.** Install stamps
  nodes with it, and the app looks its own resources up by it.
- **Sample rows: at most 50 per Base.** They are merged on install rather than
  proposed, so that opening the app shows something. A template seeds a demo; it
  does not ship a dataset.
- **Never commit a real workspace's ids.** Node, base and space ids belong to
  whoever last ran setup — they are runtime state, not part of the app, and
  publishing them ships one person's workspace layout to everyone.
- **Screenshots must be the app actually running.** They are what a user decides
  on; a mock-up here is a promise the install cannot keep.

## Submitting

Open a pull request. Before you do:

```bash
npx busabase-cli index . --repo busabase/templates -o templates.json --check
```

A template that declares itself one and does not qualify appears in the
catalog's `rejected` list with its reasons — that list is the first place to
look when something you added is missing from the gallery.

## Starting from a folder you already built

If the app already exists in a workspace, export it rather than writing this
layout by hand:

```bash
npx busabase-cli export <folder-slug> -o ./templates/<name> --template
```

That writes the layout above, and generates a `SKILL.md` draft from the folder's
structure when it has no Skill node yet. The draft is deliberately full of
TODOs and never invents anything: an agent acts on what that file says, and a
plausible-sounding guess about what a table means is worse than an obvious
blank.
