---
name: rnd-coder
description: Coding-agent playbook for the busa-rnd desk — connect a repository, pick up a task, keep it current through branch, pull request and merge, and write a one-sentence changelog row with how it was verified. Use when you work in a repository whose AGENTS.md or CLAUDE.md points at this desk, or when asked to pick up, start or finish a task, log a merged change, or backfill merges nobody logged.
---

# rnd-coder — write back while you code

Read `busa-rnd` in this folder first: it has the tables, the field values and the rules every
agent shares. This file is only the coding loop.

Two promises make the whole desk work, and both are yours:

1. **The task always says where the work really is** — `in-progress` while you code, `in-review`
   with the link once a PR is open, `done` when it merges.
2. **Every merged change gets one changelog row, written by you, at merge time.** You know right
   now what changed for users and how you checked it. Anyone reconstructing it from `git log` next
   week can only guess — and the weekly report is built on this row.

## Connect a repository (once per repository)

1. Find the product this repository belongs to: match its remote URL against `products.repos`.
   - Found → use it.
   - Not found but the product exists → propose adding the URL to that product's `repos` (one per
     line) and wait for a yes.
   - No product yet → propose a new product (name, kebab-case `product-key`, owner) and wait for a
     yes. A repository belongs to exactly one product; if it seems to serve two, ask.
2. Write the pointer block below into the repository's `AGENTS.md` — or `CLAUDE.md` if that is the
   file it already uses; never create a second one. Fill in the real ids, show the block to the
   user, and commit it only after they agree.

```markdown
## R&D desk (Busabase)

This repository is product `<product-key>` on the Busabase R&D desk
(space "<space name>", folder `<folder node id>`). Every coding agent working here:

1. Before starting: read the coding playbook and follow it —
   `npx busabase-cli@latest skills read-file --node-id <rnd-coder node id> --file-path SKILL.md --output json`
   It begins by sending you to the `busa-rnd` skill in the same folder.
2. Find or create the task you are working on and set it `in-progress`.
3. When the pull request opens: set the task `in-review` with the PR link.
4. When it merges: set the task `done` and write one changelog row in plain words,
   with how it was verified.

If the playbook cannot be fetched, stop and say so. Do not work from this summary.
```

The agent that reads this block needs `busabase-cli` logged in on that machine
(`npx busabase-cli login`). Credentials never go into the repository.

## Pick up a task

1. **Which task.** The one the user names. Otherwise, in this repository's product: the `todo`
   tasks, ordered `urgent` → `high` → `medium` → `low`, then earliest `due-date`. Say which you
   chose and why before you start. Never start a `backlog` task without a yes — nobody has
   scheduled it.
2. **No task yet?** The user asked for work that has no row: create it (`status: in-progress`,
   product, type, requester = the user) with acceptance criteria you confirm with them.
3. **Read the acceptance criteria.** Missing or untestable ("works well") → ask the user, or
   propose criteria and wait. Do not code against a guess; a guess becomes the wrong delivery.
4. **Claim it:** `status: in-progress`, `assignee: "<your name> (agent)"` — e.g.
   `Claude Code (agent)` — adding `for <person>` when someone asked you to.

```bash
npx busabase-cli records change-request --record-id <task id> --operation update \
  --fields-json '{"status":"in-progress","assignee":"Claude Code (agent)"}' \
  --message "Start 'Saved addresses at checkout' — picked up by Claude Code"
```

## Build, verify, open the pull request

- Follow the repository's own conventions for branches, commits and tests. Absent any, a branch
  named `<product-key>/<short-slug>` is fine.
- **Verify against the acceptance criteria, for real** — run the tests, run the app, click the
  path a user would. Write down what you actually did; it goes into the changelog row.
- Open the PR. Put the task title and its acceptance criteria in the PR body so the reviewer sees
  what "done" means.
- Update the task: `status: in-review`, `pr-url: <link>`.

## When it merges

Do both, in one go:

1. **Task:** `status: done`, `completed-on: <merge date>`.
2. **Changelog row** — first check none exists for this `pr-url`
   (`npx busabase-cli records by-field-text --base-id <changelog id> --field-slug pr-url --value-text <url>`):

```json
{
  "title": "Shoppers can apply a coupon code at checkout",
  "kind": "feature",
  "product": ["<product record id>"],
  "task": ["<task record id>"],
  "merged-on": "2026-10-14",
  "version": "3.8.0",
  "pr-url": "https://git.example.com/lumen/lumen-app/pull/412",
  "repo": "lumen/lumen-app",
  "author": "Claude Code (agent), reviewed by Leo Chen",
  "verification": "Unit tests plus a staging run: a valid code takes 10% off, an expired code shows the reason."
}
```

```bash
npx busabase-cli bases create-change-request --base-id <changelog id> --fields-json @change.json \
  --message "Log PR #412: coupon codes at checkout"
```

**The title is the one sentence a product manager will read.** Say what changed for the people
who use the product, in their words:

| ✅ Write | ❌ Not |
| --- | --- |
| Shoppers can apply a coupon code at checkout | feat(checkout): add CouponInput component |
| Tapping Pay repeatedly no longer creates duplicate orders | fix race condition in submitOrder |
| Payment SDK upgraded to 5.2 for the new card network rules | bump sdk |

An internal change still says why it matters. `verification` says what you really checked;
"Not verified beyond CI" is an honest value — leave nothing blank.

If a human merges later, catch up at the start of your next session: for this product's
`in-review` tasks, check the PR state (`gh pr view <url> --json state,mergedAt` or
`glab mr view <id>`) and do the two writes above for anything merged.

**One row per merged PR**, not per commit. A change merged with no task (a small fix, a human's
direct merge) still gets its row, with `task` empty.

## Backfill merges nobody logged

When asked — and before every weekly report, if `rnd-pmo` asks you:

1. List merged PRs in the window for each repository of the product:
   `gh pr list --state merged --search "merged:>=2026-10-12" --json number,title,url,mergedAt,author --limit 100`
   (GitLab: `glab mr list --merged`; plain git: `git log --merges --since=2026-10-12`).
2. Drop every one whose URL already has a changelog row.
3. For the rest, read the PR description and diff summary and draft a row each, with
   `details: "Backfilled from git — not written at merge time."` and `verification` from the PR's
   own checks, or "Unknown — backfilled".
4. Show the list; write after a yes.

## Never

- Mark a delivery `ready`, `accepted` or `changes-requested` — packaging and acceptance belong to
  `rnd-prd` and the people it asks.
- Change a task's `priority`, `due-date` or `project` without the person who owns it.
- Close a task as `done` whose PR is not merged, or whose acceptance criteria you did not check —
  say what is left instead.
- Put a token, password or key into any field, commit or pointer block.
