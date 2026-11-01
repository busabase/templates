---
name: rnd-prd
description: Needs-and-acceptance playbook for the busa-rnd desk — turn notes, feedback and requests into tasks with testable acceptance criteria, groom the backlog, package merged work into deliveries a person can accept by what users can now do, and record the acceptance result. Use when the user pastes meeting notes or customer feedback, asks to groom or prioritise the backlog, wants last week's work packaged for acceptance, or reports an acceptance decision.
---

# rnd-prd — needs in, deliveries out

Read `busa-rnd` in this folder first. This file covers the two ends of the loop that people care
about most: what goes **in** (a need, written so it can be checked) and what comes **out** (a
delivery, written so a person can accept it without reading code).

## Turn notes into tasks

Input is whatever the user pastes: meeting notes, a customer email, a chat thread, a bug report.

1. **Split** it into needs — one task per thing someone wants, not one per sentence. Drop chatter;
   keep decisions and asks.
2. **For each candidate** draft:
   - `title` — the outcome, not the implementation ("Email invoices to the billing contact", not
     "Add SMTP job").
   - `product`, `type`, `requester` — who asked: a person, a team, or a source when nobody is named
     (`Sales — Ken Lau`, `Customer support`, `Customer — Acme weekly call`).
   - `project` only when the notes or the person name it. Adding work to a project changes its
     date risk, so otherwise leave it empty and suggest the project in your summary.
   - `acceptance` — 1–4 checks a person can do and see, including the failure case when there is
     one ("an expired code says why it failed"). No "works well", no "fast" without a number.
   - `details` — the source sentence quoted, plus anything the coder needs to know.
   - `status: backlog`. Leave `priority` and `due-date` empty unless the person stated them —
     "urgent", "不急", "needed for next month's demo" all count as stated (`urgent` / `low` / a date).
   - An idea with no testable outcome yet ("maybe membership tiers next year") is still a task:
     `type: feature`, `acceptance: "Not defined yet — needs a short spec first"`.
3. **Look for duplicates** among the product's open tasks (similar title or same ask). A duplicate
   becomes a note on the existing task, not a second row: read its current `details`, then write
   them back with one dated line appended (`2026-10-20 — Sales asked again: needed for two demos in
   November.`). Never drop what was there; never change its priority or date on the way.
   - If the new ask touches a delivery that is still `ready`, say so in your summary — its acceptor
     may want the change before accepting. Link the new task to that delivery only if they agree.
4. **Show the list** — new tasks, and notes to add to existing ones — and write after a yes.

## Groom the backlog

Read the product's `backlog` and `todo` tasks, then propose — never apply silently:

- duplicates to merge (cancel the extra with `details: "Duplicate of <title>"`);
- tasks whose acceptance criteria are missing or untestable, each with a suggested rewrite;
- a `priority` for each, with a one-line reason tied to a requester, a project's target date, or
  a risk. The person who owns the product decides.

## Package merged work into deliveries

This is the job that needs judgement. People accept **capabilities**, not pull requests.

1. **Gather** the window (default: last Monday–Sunday): changelog rows merged in it, and tasks
   completed in it. Remove changes already listed in any delivery's `changes`. Then also take every
   delivery still `preparing` — finishing those is part of the job.
2. **Group by what a user can now do.**
   - Changes on the same task belong together; so do tasks that only make sense together
     (the coupon field, and the fix that keeps the code after a refresh, are one delivery).
   - A fix users would notice is its own small delivery — unless it fixes a delivery still waiting
     for acceptance; then add it to that one.
   - `refactor`, `docs`, `chore` and other changes with no user-visible effect get **no**
     delivery. The weekly report still lists them.
   - One large task that shipped in independent slices may need two deliveries.
3. **Write each delivery:**
   - `title` — the capability in the user's words ("Customers receive itemised PDF invoices").
   - `tasks`, `changes`, `product`, `project`.
   - `how-to-verify` — numbered steps covering **every** acceptance criterion of its tasks. Each
     step: what to do, then `**Expect:**` what the person should see. Say where to try it — the
     product's `try-at` field; if it is empty, ask and fill it in. Never invent a URL.
   - `evidence` — what was already checked (from the changes' `verification`) and the PR links.
     Never claim a check nobody ran.
   - `acceptor` — whoever asked for it (the tasks' requester) or the product owner; ask if unclear.
   - `status: ready` and `submitted-on: today` when the steps cover every criterion. If a criterion
     cannot be checked yet, keep `preparing` and say why in `evidence`.
4. **Show the grouping** — deliveries, what is in each, and what got no delivery and why — and
   write after a yes.

## Record an acceptance result

Only from the acceptor's own words, in this conversation or quoted by the user.

- **Accepted:** `status: accepted`, `decided-on`, `feedback` with their words.
- **Changes requested:** `status: changes-requested`, `decided-on`, `feedback`, and for each
  problem a follow-up task — `type: bug` (or `feature` for a missed need), the same product and
  project, `requester` = the acceptor, `details: "Found during acceptance of <delivery title>"`.
  Add the follow-up tasks to the delivery's `tasks`. When they merge, the delivery goes back to
  `ready` with updated steps.

Never mark a delivery `accepted` because the tests pass, the PR merged, or nobody objected.
Acceptance is a person's decision; your job is to make it a five-minute one.

## Bigger features

When a need is too large for one task, write a short spec in the parent task's `details` —
problem, who it is for, in scope, out of scope — and split the work into tasks that each have their
own acceptance criteria. Keep the spec where the work is; there is no separate document to drift.
