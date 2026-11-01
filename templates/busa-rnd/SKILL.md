---
name: busa-rnd
description: Lightweight R&D desk that coding agents keep current — products, projects, tasks, a plain-language changelog, delivery acceptance and a weekly R&D report. Use when the user asks to log or groom tasks, pick up work in a repository connected to this desk, record a merged change, package work for acceptance, update project health, or write the weekly report; read this first, then the role skill for the job (rnd-prd, rnd-coder, rnd-pmo).
metadata:
  category: platform
  tags:
    - surface:busabase
    - workflow:rnd
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-rnd
    resources:
      - products
      - projects
      - tasks
      - changelog
      - deliveries
      - reports
    risk: gated-write
---

# R&D Projects

A small desk for a team that lets coding agents do most of the bookkeeping. People raise needs and
make decisions; agents turn needs into tasks, write back as they code, package finished work for
acceptance, and write the weekly report. The point is one loop that closes every week:

```txt
 need ──► task ──► code + PR ──► merged: changelog row ──► delivery ──► accepted by a person
  ▲                                                                          │
  └──────────── weekly report: what shipped, what is in progress, ◄──────────┘
                what is still needed, what needs a decision
```

This file is the data contract every agent shares. The jobs live in three role skills in the same
folder — read the one that owns your job after this file:

| Job | Skill |
| --- | --- |
| Turn notes, feedback or a request into tasks; groom the backlog; package merged work into deliveries; write acceptance steps; record a person's acceptance result | `rnd-prd` |
| Connect a code repository; pick up a task; keep it current through branch, PR and merge; write the changelog row; backfill merges nobody logged | `rnd-coder` |
| Register products and projects; update project health; write the weekly report and release notes | `rnd-pmo` |

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-rnd" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `products`, `projects`, `tasks`, `changelog`, `deliveries`,
`reports`. More than one desk printed → ask which one; never pick. A repository's `AGENTS.md` /
`CLAUDE.md` pointer block (see `rnd-coder`) may already name the Folder id — prefer it.

## The six tables

Values are written as the **choice id** in `code` (e.g. `in-progress`), never as the display name —
the dashboard matches colors and labels by id. Dates are `YYYY-MM-DD`. A relation takes an array of
record ids, even when it holds one (`["rec…"]`); look the id up, never guess it.

### `products` 产品 — one row per product the team ships

| Field | Meaning |
| --- | --- |
| `title` | Product name, as people say it. |
| `product-key` | Short stable kebab-case id (`lumen-app`). Used in branch names and by repositories' pointer blocks. Never change it once used. |
| `status` | `active` 在研 · `maintenance` 维护中 · `planned` 规划中 · `retired` 已下线 |
| `owner` | The accountable person. |
| `repos` | One repository URL per line. A repository belongs to exactly one product. |
| `try-at` | Where a person tries it for acceptance — staging URL, sandbox, which test user to ask for. Never a password. |
| `description` | One or two sentences: who uses it and for what. |

### `projects` 项目 — work with a goal and a target date, inside one product

| Field | Meaning |
| --- | --- |
| `title`, `product` | Name; the one product it belongs to. |
| `status` | `planned` · `in-progress` · `paused` · `done` · `canceled` |
| `health` | `on-track` 正常 · `at-risk` 有风险 · `off-track` 已延误 — rules in `rnd-pmo`. |
| `owner`, `start-date`, `target-date` | Who answers for it, and when. |
| `goal` | What users can do when it is finished — not a list of tickets. |
| `latest-update`, `updated-on` | Two sentences written with each weekly report, and the date written. |

### `tasks` 任务 — every need, bug and improvement

| Field | Meaning |
| --- | --- |
| `title` | One need, phrased as the outcome ("Apply coupon codes at checkout"). |
| `product`, `project` | Product always; project when it belongs to one. |
| `type` | `feature` 需求 · `bug` 缺陷 · `improvement` 优化 · `chore` 杂项 |
| `status` | `backlog` 待规划 → `todo` 待开始 → `in-progress` 进行中 → `in-review` 评审中 → `done` 已完成; or `canceled` 已取消 |
| `priority` | `urgent` · `high` · `medium` · `low` — set by a person; agents propose. |
| `assignee`, `requester` | Who does it (a person, or `Claude Code (agent)` and similar); who asked. |
| `due-date` | Only when someone committed to a date. |
| `acceptance` | What a user can see or do when it is done — testable, not "works well". |
| `details` | Context, links, constraints. |
| `pr-url`, `completed-on` | The pull request; the date it was merged or otherwise finished. |

### `changelog` 变更记录 — one row per merged change

| Field | Meaning |
| --- | --- |
| `title` | **One plain sentence a non-engineer understands**, saying what changed for users ("Shoppers can apply a coupon code at checkout"). Not the commit message. |
| `kind` | `feature` · `fix` · `improvement` · `refactor` · `docs` · `chore` |
| `product`, `task` | Product always; the task when there is one. |
| `merged-on`, `version` | Merge date; release version if it has one yet. |
| `pr-url`, `repo` | The PR / MR / commit link — the dedupe key — and `owner/name`. |
| `author` | Who made it: `Claude Code (agent), reviewed by Leo Chen`, or a person. |
| `verification` | How it was verified, in one or two sentences. "Not verified" is an honest value; blank is not. |
| `details` | Optional notes. |

### `deliveries` 交付验收 — what users can now do, for a person to accept

A delivery groups merged work by **what a user can now do**, not by PR or commit. One delivery may
hold several tasks and changes; one big task may need several deliveries.

| Field | Meaning |
| --- | --- |
| `title` | The capability in a user's words ("Shoppers can use coupon codes at checkout"). |
| `product`, `project` | Where it belongs. |
| `status` | `preparing` 整理中 → `ready` 待验收 → `accepted` 验收通过 / `changes-requested` 需修改 |
| `tasks`, `changes` | The tasks and changelog rows it contains. |
| `how-to-verify` | Numbered steps; each says what to do and what the person should see. |
| `evidence` | What the agent already checked, with links (Markdown). |
| `submitted-on`, `acceptor` | When it was marked ready; who accepts it. |
| `decided-on`, `feedback` | Filled **only** from the acceptor's own words. |

### `reports` 周报与产出 — weekly reports and release notes

| Field | Meaning |
| --- | --- |
| `title` | `2026-W42 R&D weekly report / 2026-W42 研发周报`, or `Ledger API 1.12 release notes`. |
| `kind` | `weekly` · `release` · `other` |
| `status` | `draft` 草稿 (agent) → `final` 已定稿 (a person) |
| `period-start`, `period-end`, `product` | The window covered; product empty means all products. |
| `summary` | The one-line conclusion. |
| `body` | Markdown. The weekly format is in `rnd-pmo`. |

## How to write

- **Look before you write.** Search for an existing row first — by `pr-url` for changes, by title
  and product for tasks and deliveries. Update it rather than create a twin.
- **Propose through a change request and read the status.** Omit `autoMerge`: a key that can write
  lands the change at once, a weaker one queues it for review, and both are correct.
  ```bash
  npx busabase-cli bases create-change-request --base-id <tasks base id> --fields-json @task.json \
    --message "Add task: Apple Pay on web checkout — requested by Sales"
  npx busabase-cli records change-request --record-id <id> --operation update \
    --fields-json '{"status":"in-review","pr-url":"https://…/pull/425"}' \
    --message "Move 'Delivery-date estimate' to review — PR #425 opened"
  ```
- **The write returns the record, not the change request.** To see whether it merged or is
  waiting for review: `npx busabase-cli records change-requests --record-id <id> --output json`.
- **Read with bounded, filtered queries.** `records list` takes `--value-filters-json` (exact) and
  `--sort-json` — a sort needs `"fieldType":"date"` to take effect; at most 100 rows per page, follow
  `nextCursor` for more. Values come back in `headCommit.payload`. (`--help` lists `records query`,
  whose filters are only best-effort; `npx busabase-cli schema records.list` shows the full input.)
  ```bash
  npx busabase-cli records list --base-id <changelog base id> --limit 50 --output json \
    --value-filters-json '[{"fieldSlug":"merged-on","operator":"gte","value":"2026-10-12"}]' \
    --sort-json '{"fieldSlug":"merged-on","fieldType":"date","direction":"desc"}'
  npx busabase-cli records group-by --base-id <tasks base id> --field-slug status   # exact counts
  ```
- **Write for the person reading the review inbox.** The `message` says what and why, in one line.
  Primary fields are human names, never ids.

## What no agent does here

- **Accept a delivery, or finalise a report, on its own judgement.** `accepted`,
  `changes-requested` and `final` are set only from a person's explicit words in this conversation.
- **Change an existing task's priority, due date or project without the person who owns it.**
  Propose; do not apply. (On a new task, fill them only when the person asking stated them.)
- **Write work that is not in the records.** A report or delivery describes rows that exist. If
  something happened that has no row, add the row first (or say it is missing).
- **Delete.** Cancel a task (`canceled`) or retire a product instead; history stays.
- **Store a credential.** Tokens for GitHub/GitLab stay in the agent's own environment, never in a
  field.
- **Approve or merge its own change request** unless the user explicitly asks for that specific one.

## The weekly rhythm

Busabase does not run on a schedule by itself. Run the weekly report from whatever scheduler your
agent has — a Claude Code routine, a cron line calling your agent non-interactively, a Codex
automation — every Monday morning, with the prompt "Write last week's R&D weekly report", then let
a person read and finalise it. `rnd-pmo` has the details.

## The AirApp

`busa-rnd-app` in this folder is read-only: an overview of the last seven days, a "needs you"
queue, the weekly report reader, the acceptance queue, the task board, projects, changelog and
products. It reads the six tables through the viewer's own session and writes nothing. The agent
prompts on it (and on each table) start agent jobs, and those jobs write through the skills above.
