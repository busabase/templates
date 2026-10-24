# Contributing to Busabase Templates

[中文版](CONTRIBUTING.zh-CN.md) has the same content; if the two ever differ, this English file wins.

This guide is written for two readers at once: a person who wants to improve the catalog, and the
coding agent that person asks to do the work. If you are the agent, read this file and
[`AGENTS.md`](AGENTS.md) before touching anything, run the commands as written, and write the pull
request in English.

Not comfortable with GitHub? You do not need to be. Jump to
[Hand it to your agent](#hand-it-to-your-agent), copy the prompt, and give your agent the files.

## 1. What you can contribute

| Kind | What changes | Read |
| --- | --- | --- |
| **Media on an existing template** (the common case) | A demo video, screenshots or the cover of a template that is already in `templates/` | [Section 2](#2-adding-or-replacing-media) |
| **A new template** | A whole new directory under `templates/` | [Section 3](#3-contributing-a-new-template) |

Both kinds end the same way: one pull request to `busabase/templates`, reviewed and merged by a
Busabase maintainer ([Section 4](#4-submitting)).

## 2. Adding or replacing media

### One-time setup

- **Git and Git LFS.** Install Git LFS (`brew install git-lfs`, `apt install git-lfs`, or the
  installer from <https://git-lfs.com>; Git for Windows already ships it), then run once:
  ```bash
  git lfs install
  ```
  Videos are stored with LFS (see [Commit with Git LFS](#commit-with-git-lfs)). Without it, Git
  silently commits the whole file instead.
- **Node.js 24.18 or later.** `busabase-cli` requires it.
- **ffmpeg** for videos, and **Python 3 with Pillow** (built with WebP support) for covers.
- A GitHub account. The [`gh`](https://cli.github.com) CLI is optional, but it makes forking and
  opening the pull request one command each.

### Get the repository

Find out whether you can push to `busabase/templates`:

```bash
gh repo view busabase/templates --json viewerPermission --jq .viewerPermission
```

`ADMIN`, `MAINTAIN` or `WRITE` means you can push a branch to it directly. Anything else (most
contributors) means you work on a fork:

```bash
gh repo fork busabase/templates --clone=false
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/<your-github-user>/templates.git
cd templates
git remote add upstream https://github.com/busabase/templates.git
git fetch upstream
git checkout --no-track -b feat/<name>-<what> upstream/main
```

With write access, clone `https://github.com/busabase/templates.git` the same way and run
`git checkout --no-track -b feat/<name>-<what> origin/main`. Name the branch after the change, for
example `feat/busa-crm-zh-CN-film`.

`GIT_LFS_SKIP_SMUDGE=1` leaves the other templates' videos as small pointer files instead of
downloading all of them. To watch one that already exists:

```bash
git lfs pull --include="templates/<name>/assets/recordings/*"
```

`<name>` is always the template's directory name, for example `busa-crm`.

### Where files go

```
templates/<name>/
├── busabase.json                  declares which files the gallery shows
└── assets/
    ├── screenshots/
    │   ├── cover.webp             English cover, always first
    │   ├── <view>.webp            English screenshots
    │   ├── cover-zh-CN.webp       Chinese cover
    │   └── <view>-zh-CN.webp      Chinese screenshots
    └── recordings/
        ├── <name>.mp4             English video (the default)
        └── <name>-zh-CN.mp4       Chinese video
```

A file on disk does nothing until `busabase.json` declares it, under `template`:

| Field | Holds |
| --- | --- |
| `template.screenshots` | The English gallery, cover first. Every language without its own entry sees this list. |
| `template.video` | The English video. Every language without its own video sees it. |
| `template.locales.<locale>.screenshots` | That language's gallery. Replaces the English list as a whole, cover first. |
| `template.locales.<locale>.video` | That language's video. |

### One file per language: `template.locales`

```json
"screenshots": ["assets/screenshots/cover.webp", "assets/screenshots/overview.webp"],
"video": "assets/recordings/busa-rnd.mp4",
"locales": {
  "zh-CN": {
    "screenshots": ["assets/screenshots/cover-zh-CN.webp", "assets/screenshots/overview-zh-CN.webp"],
    "video": "assets/recordings/busa-rnd-zh-CN.mp4"
  }
}
```

- **The top level is English**, and it is the fallback. A Japanese viewer of a template with no
  `ja` entry sees the English media. Servers older than 0.98.0 only ever read the top level.
- **Each field falls back on its own.** A locale that declares only `video` keeps the English
  screenshots, so adding a Chinese video never forces new Chinese screenshots.
- **Keys are exact locale codes**: `zh-CN`, `zh-TW`, `ja`, `ko`, `de`, `fr`, `es`, `pt`, `vi`.
  `zh` is not `zh-CN`. Do not add `locales.en`; English belongs at the top level.
- **Never put a `-zh-CN` file in the top-level lists.** That shows Chinese to everyone else.
- **Only have a Chinese cut?** Declare it as `locales.zh-CN.video` and leave the English
  `template.video` as it is. Do not overwrite the English file with a Chinese video.
- **Replacing a video** means overwriting the file at the same path. `busabase.json` and
  `templates.json` do not change, and that is expected.

`templates/busa-rnd/busabase.json` is a complete working example.

### The format bar

**Video**

| | Bar |
| --- | --- |
| Container, codec | MP4, H.264 |
| Picture | 1440×900 (16:10). The player is a 16:10 box, so 16:9 footage gets black bars. |
| Pixel format | `yuv420p`, limited (`tv`) range. Not `yuvj420p`. |
| Frame rate | 30 fps |
| Audio | None. The player starts muted; on-screen text has to carry the meaning. If the master has a voice-over, dropping it loses what it said, so tell the person who made it. |
| Length | 40–60 s for a scenario film, as a guideline rather than a hard limit. The existing short loops are 8–33 s. |
| File size | Under 8 MB. The busa-rnd films are about 3.5 MB. |
| Streaming | `+faststart`, so playback starts before the download ends. |

Edit and export at 16:10 (1440×900 or 2880×1800) if you can. This command turns any master into a
file that meets the bar; a true 16:9 picture gets black bars top and bottom. The example writes the
Chinese cut; name the English one `<name>.mp4`. Over 8 MB? Raise `-crf` to 23–26 rather than
lowering the resolution.

```bash
ffmpeg -y -i <your-master-file> \
  -vf "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2,fps=30" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -color_range tv -colorspace bt709 \
  -movflags +faststart -an \
  templates/<name>/assets/recordings/<name>-zh-CN.mp4

ffprobe -v error \
  -show_entries stream=codec_name,width,height,pix_fmt,color_range,r_frame_rate:format=duration,size \
  templates/<name>/assets/recordings/<name>-zh-CN.mp4
```

`ffprobe` should report `h264`, `1440`, `900`, `yuv420p`, `tv`, `30/1`, and a `size` under
8000000.

If the master is a 16:10 picture placed inside a 16:9 frame (black bars at the sides), the command
above adds a second set of bars, and `ffprobe` will not notice. Find the real picture first, and put
the `crop=…` it prints at the front of `-vf`, for example
`-vf "crop=1728:1080:96:0,scale=1440:900:…"`:

```bash
ffmpeg -i <your-master-file> -vf cropdetect -frames:v 150 -f null - 2>&1 | grep -o 'crop=[0-9:]*' | tail -1
```

Then look at the film itself, from start to finish. Confirm that the app on screen is this template,
in this file's language. Files get mixed up, and no command here can tell one film from another. An
agent that cannot watch video can look at a contact sheet instead:

```bash
ffmpeg -i templates/<name>/assets/recordings/<name>-zh-CN.mp4 -vf "fps=1/4,scale=480:-1,tile=4x3" -frames:v 1 ~/sheet.png
```

If the film shows another template, stop and ask the person who sent it. Do not commit it.

**Screenshots and cover**

- WebP, 1440×900, of the app actually running. No mock-ups: a screenshot is a promise the install
  has to keep.
- The cover is generated, never drawn by hand, and only after the screenshots are final, because it
  is rendered from one of them:
  ```bash
  python3 skills/busabase-template-cover/scripts/generate_cover.py templates/<name>
  python3 skills/busabase-template-cover/scripts/generate_cover.py templates/<name> --locale zh-CN
  python3 skills/busabase-template-cover/scripts/generate_cover.py --check templates/<name>
  python3 skills/busabase-template-cover/scripts/generate_cover.py --check --locale zh-CN templates/<name>
  ```
  The renderer's rules are in
  [`skills/busabase-template-cover/SKILL.md`](skills/busabase-template-cover/SKILL.md).

The full publishing bar for stills (coverage, branding, sample data) is the
`busabase-template-creator` skill; see [Section 3](#3-contributing-a-new-template) to install it.

### What a template video should show

The current direction for a template film, in brief:

- **One prompt, then the scenario inside Busabase, then one big number.** Someone asks an agent
  for something, the template's real screens show what changed, and the film ends on a single
  number that sums up the effect.
- **About 40–60 seconds.**
- **The first 5 seconds work on their own as a hook.** Open on the prompt and its result, and have
  the real product on screen within 5 seconds. Do not open on a slow setup.
- **No review or approval shot is required.** Leave it out, unless reviewing is what the template
  is for (pull-request review, for example).
- **Keep it real.** Everything shown inside Busabase is the template installed and running, not a
  mock-up. The closing number matches what the data on screen says. If a chat or prompt screen is
  staged rather than recorded, label it as illustrative on screen.
- **No real people's data.** Use the template's fictional sample data. No real customer names,
  email addresses, phone numbers, API keys or private workspaces, and no other company's branding.
- **A localized cut is fully localized**: Busabase and the app both in that language.

Making several films? Open the pull request for the first one and ask there before you shoot the
rest.

### Regenerate the catalog and check

Run `check` once before you change anything, so you know which warnings were already there. Then,
after your change, run these from the repository root:

```bash
npx busabase-cli@latest --version     # must print 0.98.0 or later
npx busabase-cli@latest check ./templates/<name>
npx busabase-cli@latest index . --repo busabase/templates -o templates.json
npx busabase-cli@latest index . --repo busabase/templates -o templates.json --check
node scripts/check-app-writes.mjs
node scripts/check-app-sdk-helpers.mjs
```

- `check` must report **0 errors** for every template you touched. It errors on a declared file
  that is not on disk, and warns about a misspelled locale key or a localized file in the English
  list. Warnings that were already there before your change are not yours to fix.
- `check` only confirms that declared files exist. It does not look at a video's format, length,
  content or LFS storage; `ffprobe`, your own viewing and `git lfs status` cover those.
- `index` rebuilds `templates.json`, the catalog the Template Center reads. Never edit it by hand.
  `@latest` matters: a CLI older than 0.98.0 silently drops `locales` from the catalog. The
  examples in `AGENTS.md` omit the version; add `@latest` when you run them.
- `index --check` must print `templates.json is up to date`.
- `scripts/check-app-writes.mjs` fails when an AirApp forces review on a person's own write
  (`autoMerge: false`, or a value worked out from where the app runs). Leave `autoMerge` unset and
  report the outcome Busabase returns. If a write truly needs a second person before something is
  sent, say why on that line with `// allow-forced-review: <reason>`.
- `scripts/check-app-sdk-helpers.mjs` fails when an AirApp writes again what `busabase-sdk/airapp`
  provides: a local `isQueued`, a `fetch("__airapp/runtime")`, or the SDK's "Sent for review." sentence.
  Import `isAirAppWriteQueued`, call `detectAirAppRuntime()` and use `airAppWriteMessage` from the app's
  vendored `busabase-airapp.js`. If a copy has to stay, say why on that line, or the line above, with
  `// allow-private-copy: <reason>`.

### Commit with Git LFS

```bash
git add templates/<name>/busabase.json templates/<name>/assets templates.json
git status --short                    # only the files you meant to change
git lfs status
```

Every `.mp4` under "Objects to be committed" must read `(LFS: …)`. If one reads `(Git: …)`, Git
LFS was not set up when you added it. Fix it before you commit:

```bash
git lfs install
git add --renormalize templates/<name>/assets/recordings/<file>.mp4
git lfs status                        # now (LFS: …)
```

Already committed it? Run the same `git lfs install` and `git add --renormalize`, then
`git commit --amend --no-edit`, all before you push.

Do not edit `.gitattributes`. Its unanchored `*.mp4` rule already covers every template's
`assets/recordings/`.

Then commit, and continue with [Section 4](#4-submitting):

```bash
git commit -m "feat(<name>): add zh-CN demo film"
```

## 3. Contributing a new template

Building an app is not documented in this repository. Two published agent skills own it, and this
guide does not restate them:

| Skill | Owns |
| --- | --- |
| `busabase-app-creator` | Building the app: tables, AirApp, resource model, the package format and the contract `check` enforces. |
| `busabase-template-creator` | Making it publishable here: generated cover, screenshot coverage, no third-party branding, sample records, agent prompts, a clean `check`. |

Install both for your agent, from the public [`busabase/skills`](https://github.com/busabase/skills)
repository:

```bash
npx skills add busabase/skills --skill busabase-app-creator --skill busabase-template-creator -g -y
```

`-g` installs them for your user rather than into the current directory, so no `.agents/`,
`.claude/` or `skills-lock.json` ends up in this repository. `AGENTS.md` shows the same command
without flags; inside this repository, add `-g`. If those files do appear, do not commit them.
(`npx skills add busabase/skills --list` shows everything that repository publishes;
`busabase-cli skill install` installs only the `busabase` workspace skill, which you do not need
here.)

The path, in order:

1. **Build it** with `busabase-app-creator`. It describes two ways in: build in a Busabase workspace
   and export, or write the package on disk and install it to verify. To export a folder you
   already built:
   ```bash
   npx busabase-cli@latest export <folder-slug> -o ./templates/<name> --template
   ```
   The CLI exports from the workspace it is connected to: run `npx busabase-cli@latest login`
   first for Busabase Cloud, or add `--base-url http://127.0.0.1:15419` for the local workspace in
   step 3. An exported folder rarely passes `check` on the first run; `check` names each problem,
   for example sample rows that still carry workspace ids, or no screenshots yet.
2. **Follow this repository's rules** in [`AGENTS.md`](AGENTS.md): the layout, what is generated,
   and the load-bearing rules (`<name>` agreeing in three places, at most 50 sample rows per Base,
   no real workspace ids, screenshots of the running app).
3. **Install and open it.** A green `check` does not prove that the app works. A local workspace is
   enough, and needs no account:
   ```bash
   npx busabase@latest server --data ~/.busabase-try
   # in a second terminal, from the repository root:
   npx busabase-cli@latest --base-url http://127.0.0.1:15419 install ./templates/<name>
   ```
   Then open <http://127.0.0.1:15419> and use the app.
4. **Meet the publishing bar** with `busabase-template-creator`, and add media as described in
   [Section 2](#2-adding-or-replacing-media).
5. **Check and index**, exactly as in
   [Regenerate the catalog and check](#regenerate-the-catalog-and-check).

### Updating busabase-sdk in every AirApp

Each AirApp pins `busabase-sdk` in its `package.json` and bundles it into `app/vendor/busabase-*`
with its own `build:sdk` script, so an SDK fix reaches an app only when both move. One command does
both for every app, then runs each app's own `check` and `test`:

```bash
node scripts/update-app-sdk.mjs --check            # apps not on npm latest; exits 1 if any
node scripts/update-app-sdk.mjs                    # move every app to npm latest
node scripts/update-app-sdk.mjs --version 0.98.0   # or to one version
node scripts/update-app-sdk.mjs templates/busa-crm/content/busa-crm-app   # or one app (paths and globs)
```

It prints one row per app (install, `build:sdk`, `check`, `test`) and exits non-zero if any fails.
A committed lockfile is refreshed and no new one is written, `node_modules` is removed afterwards,
and only the `busabase-*` bundles are rebuilt; another vendored library stays as committed.

Then read the diff, run [Regenerate the catalog and check](#regenerate-the-catalog-and-check) on
every template, and install a few templates locally as in step 3. A passing `check` does not prove
that an app still opens.

### Moving an AirApp onto the SDK's helpers

Since busabase-sdk 0.99.0 the SDK carries the AirApp plumbing the templates each used to copy: the
runtime probe, the record reads and writes, the queued-write test and the review sentence. Once an app
is on 0.99.0 or later, one command moves it off the copies it recognises:

```bash
node scripts/adopt-sdk-airapp-helpers.mjs --dry-run      # what would change, and what stays
node scripts/adopt-sdk-airapp-helpers.mjs                # every app of this repository
node scripts/adopt-sdk-airapp-helpers.mjs templates/busa-crm/content/busa-crm-app   # or one (paths and globs)
node scripts/adopt-sdk-airapp-helpers.mjs --check        # exits 1 while an app still has a copy it recognises
```

It rewrites a piece only when it matches a known shape exactly (the `records.list` call and its
array-or-page handling, the `records.get` not-found wrapper, find-then-create-or-update, `isQueued`,
a `runtime.js` that is only the probe, the `savedForReview` sentence) and prints the rest as "left",
with the reason. It never touches an app's business rules, row formats, field slugs, sort or filters,
or the `pending` / `change_request_id` its UI reads. Run it twice and the second run changes nothing.
Finish what it leaves by hand, run each app's own `check` and `test`, and keep the change in the same
batch as the SDK update that made it possible.

## 4. Submitting

### Scope: one template, or one media batch, per pull request

- A new template is its own pull request.
- A **media batch** is the same kind of change across several templates, such as "Chinese films for
  five templates". Do not mix media with changes to a template's copy, data or code.
- Touch only the templates you are working on, plus the regenerated `templates.json`.
- An SDK update is one batch too: what `scripts/update-app-sdk.mjs` changed in every app, plus the
  smallest fix for any app it broke, and nothing else.
- Moving apps onto the SDK's helpers is a batch of its own: what `scripts/adopt-sdk-airapp-helpers.mjs`
  changed, the apps finished by hand, and nothing else.

### Push and open the pull request

```bash
git push -u origin feat/<name>-<what>
gh pr create --repo busabase/templates --base main \
  --head <your-github-user>:feat/<name>-<what> \
  --title "feat(<name>): add zh-CN demo film" \
  --body-file <a-file-outside-the-repo>.md
```

With write access, drop `<your-github-user>:` from `--head`. Without `gh`, open the pull request
from your fork's page on GitHub.

**Title**: English, in the repository's style: `feat(busa-crm): add zh-CN demo film`,
`feat(templates): add zh-CN demo films for 5 templates`, `feat: add busa-xyz template`.

**Body**: English, and include:

- What changed and why, in two or three sentences.
- For media, one row per file:

  | Template | File | Locale | Duration | Size | What it shows |
  | --- | --- | --- | --- | --- | --- |

- The output of `check` and `index --check`.
- A link the reviewer can play. GitHub serves an LFS video on your branch at
  `https://media.githubusercontent.com/media/<owner>/templates/<branch>/templates/<name>/assets/recordings/<file>.mp4`.
- Anything you are unsure about. A question stated in the pull request is better than a guess.

### What a reviewer checks

- The scope: one template or one batch, and nothing unrelated.
- `check` shows 0 errors for each touched template, and `templates.json` is current.
- Every `.mp4` is stored with Git LFS: `git lfs ls-files` on the branch lists it.
- Paths and declarations: the English file at the top level, other languages under `locales`, the
  cover first in each gallery.
- The format bar, against your `ffprobe` output.
- The video itself, watched in full in each language: the hook lands in the first 5 seconds,
  everything inside Busabase is real, the number matches the data, and nothing private or branded
  is on screen.
- For a new template, the publishing bar of `busabase-template-creator`, and that it installs and
  opens.

### What "done" means

- A Busabase maintainer approves and merges the pull request into `main`. Do not merge it yourself.
- If changes are requested, push more commits to the same branch. Do not open a new pull request.
- After the merge, the Template Center, both in the product and on busabase.com, reads the new
  `templates.json` from `main` within about an hour.

### Hand it to your agent

Copy one of these, fill in the angle brackets, and attach or point to your files. The prompt can be
in any language; the pull request itself stays in English.

**Add or replace a video:**

```text
Read CONTRIBUTING.md and AGENTS.md in https://github.com/busabase/templates and follow them exactly.
Add this video to the template <template-name> as its <zh-CN / English> video: <path-to-video-file>.
Fork the repository if I have no write access. Check the video against the format bar and re-encode it
if it does not meet it, put it where the guide says, declare it in busabase.json, regenerate
templates.json, run the checks, and make sure the .mp4 is stored with Git LFS. If the video does not
show that template, stop and ask me. Then open one pull request to busabase/templates with an English
title and body. Show me the PR link and the check output. Do not merge it.
```

**Several videos at once:** use the same prompt, and replace its second sentence with a list:

```text
Add these videos as one media batch:
- <template-name>, <locale>: <path-to-video-file>
- <template-name>, <locale>: <path-to-video-file>
```

**A new template:**

```text
Read CONTRIBUTING.md and AGENTS.md in https://github.com/busabase/templates, then install the skills it
names. Help me turn <a short description of the app, or the folder slug in my Busabase workspace> into
a new template that meets the publishing bar, install and open it locally, and open one pull request
to busabase/templates with an English title and body. Ask me instead of guessing what a table or a
field means. Do not merge it.
```
