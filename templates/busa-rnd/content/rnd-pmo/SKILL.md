---
name: rnd-pmo
description: Portfolio-and-reporting playbook for the busa-rnd desk — register products and projects, keep project health honest, and write the weekly R&D report and release notes from the records. Use when the user asks for the weekly report (周报), a status update on a product or project, which projects are at risk, release notes for a version, or to register a product or start a project. / 项目与周报手册：登记产品和项目、维护项目健康度、根据记录生成研发周报和版本说明。
---

# rnd-pmo — products, projects and the weekly report

Read `busa-rnd` in this folder first. This file turns the records the other skills keep into the
one thing people read every week.

## Products and projects

- **Register a product:** `title`, a kebab-case `product-key` that will never change, `owner`,
  `status: active`, and one repository URL per line in `repos`. Check first that neither the name
  nor the key exists.
- **Start a project:** the product it belongs to, an `owner`, `start-date`, `target-date`, and a
  `goal` written as what users can do when it is finished. `status: planned` until work starts;
  `health: on-track`.
- A project ends as `done` or `canceled` — never deleted.

## Project health

Compute it from the project's tasks, then write it with a reason. Use the first rule that matches:

| Health | When |
| --- | --- |
| `off-track` 已延误 | `target-date` has passed and the project is not `done`; **or** an `urgent` task in it is overdue; **or** the owner says it will miss. |
| `at-risk` 有风险 | Any task in it is overdue; **or** the target is within 21 days and one of its tasks has not started (`backlog`/`todo`). |
| `on-track` 正常 | Otherwise. |

Overdue means an open task (`todo`, `in-progress`, `in-review`) whose `due-date` is before today.

With each weekly report, write every live project's `latest-update` — two sentences: what moved,
and what threatens the date — and set `updated-on`. If health changes, the first sentence says
why. A person's explicit call ("keep it at risk") overrides the rules; record it in the update.

## The weekly report

Written every Monday for the previous Monday–Sunday (ISO week), as a **draft** a person finalises.

### 1. Read — bounded, filtered

Find the desk (see `busa-rnd`), then for the window `start..end`:

| Need | Read |
| --- | --- |
| What shipped | `changelog`: `merged-on` ≥ start and ≤ end, sorted by `merged-on` |
| What finished | `tasks`: `status = done`, `completed-on` in the window |
| What is open | `tasks`: `status ≠ done`, `≠ canceled` — and `records group-by status` for exact counts |
| Acceptance | `deliveries`: every one not yet `accepted` (`preparing`, `ready`, `changes-requested`), plus those accepted in the window |
| Projects | `projects`: `status` is `planned`, `in-progress` or `paused` |

"Shipped" covers the window. Everything else — open, overdue, waiting for acceptance, project
health — is stated **as of today**, the day you write, so a decision made on Tuesday is not reported
as still pending.

```bash
npx busabase-cli records list --base-id <changelog id> --limit 100 --output json \
  --value-filters-json '[{"fieldSlug":"merged-on","operator":"gte","value":"2026-10-12"},{"fieldSlug":"merged-on","operator":"lte","value":"2026-10-18"}]' \
  --sort-json '{"fieldSlug":"merged-on","fieldType":"date","direction":"asc"}'
```

If a page comes back with `nextCursor`, read the next page — a report needs the whole window.

### 2. Check coverage

If you can reach the code host (`gh`, `glab`), compare each product's merged PRs in the window
with the changelog rows (the `rnd-coder` backfill steps). Missing rows: backfill them first if the
user agrees, otherwise list them under Coverage. Never describe a merge that has no row as if it
were logged.

### 3. Update projects

Health and `latest-update` for each live project, as above.

### 4. Write the report row

`kind: weekly`, `status: draft`, `period-start`, `period-end`, `product` empty (all products) unless
asked for one, `title: "<YYYY>-W<ww> R&D weekly report"` (translated if the team writes in another
language), `summary` = the conclusion line, `body` in this shape:

```markdown
**Summary:** 9 changes merged across 3 products. Coupon codes and PDF invoices are ready for
acceptance; rate limiting on the public pricing API is four days late.

## Shipped last week
**<Product>**
- <changelog or delivery sentence> — <being prepared | ready for acceptance | accepted | changes requested | internal> ([#412](…), [#421](…))

## In progress
- <Product> · <task title> — <in progress | in review ([#425](…))>, due <date> (**late** when overdue)

## Open needs
| Priority | Need | Product | From |
| --- | --- | --- | --- |
| High | <task title> | <product> | <requester> |

## Risks and decisions
1. **<What is at risk.>** <Why, in one sentence.> Decide: <the choice>, by <who>.

## Coverage
Read <n> changelog rows, <n> tasks, <n> deliveries, <n> projects. <Merges without a changelog row,
or tables that could not be read — or "Every merged pull request has a changelog row.">
```

Rules for the body:

- **Every line comes from a row you read.** Numbers are counts of rows, not estimates.
- Group shipped work by product, and by delivery where one exists — one line per capability, with
  all its PR links — rather than one line per PR.
- "Open needs" lists `todo` and `backlog` by priority, at most ten; mark as new the ones whose
  record `createdAt` falls in the window.
- "Risks and decisions" is the section a manager reads first. Each item names the decision and who
  makes it. Nothing to decide → say "None this week."
- Write in the team's language. A bilingual team gets both, line by line.

**Idempotent:** a report with the same title that is still `draft` is updated in place; one that
is `final` is never overwritten — say so and stop.

### 5. Hand it over

Reply with a clickable link to the report row (build it as the `busabase` skill's links reference
says), the summary line, and the decisions it asks for. The person
reads it, edits through you or in Busabase, and tells you to finalise: then set `status: final`.
Never finalise on your own.

## Release notes

For a product and version: the changelog rows with that `version` (or a date range the user
gives). Write a `reports` row with `kind: release`, `status: draft`, the product, and a body grouped
into **New**, **Improved** and **Fixed**, in user words. Leave out `refactor`, `docs` and `chore`
unless users would notice them.

## Run it every week

Busabase stores and shows the work; it does not start an agent on a schedule. Use the scheduler
your agent already has, on a machine where `busabase-cli` is logged in:

- **Claude Code** — create a routine (`/schedule`) for Monday 09:00 with the prompt below.
- **cron** — `0 9 * * 1 cd <any working dir> && claude -p "<prompt>"` (or `codex exec "<prompt>"`).

Prompt: *"Read the rnd-pmo skill in the busa-rnd folder and write last week's R&D weekly report as
a draft. Update project health. Then tell me what needs a decision."*
