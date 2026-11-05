---
name: dealflow-weekly-digest
description: Write the weekly leadership digest for the Deal Flow desk — which projects the team saw this week, the key findings, stage changes, and the follow-ups that are overdue or due next week — as one record in Weekly digests, every line traceable to a meeting or follow-up. Use when asked for the weekly digest, 周报, 管理层周报, what the team saw this week written up, or a one-minute leadership version. Read busa-dealflow first.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
---

# Weekly leadership digest

Read `busa-dealflow` in the same folder first. The digest answers leadership's three questions:
**which projects did the team see this week, what did we find, and what needs following up?**
Write it in the team's language.

## Steps

1. **Pick the period.** Default: Monday to Sunday of this week (ISO week; title it `YYYY-Www`, e.g.
   `2026-W45`). "Last week" means one week earlier.
2. **Read the data** (read-only, at most one page of 50 per table, sorted by date):
   - `meetings` with `held-on` in the period.
   - `followups` still `open` / `in-progress` that are overdue or due within 7 days after the period,
     plus those with `done-on` in the period.
   - `deals` touched by the above (`stage`, `owner`).
   - The previous digest (latest `period-end` in `digests`), to compare stages.
3. **Write `body` (Markdown)** in four sections; every line must trace to a record:
   - `## Projects seen this week`: one line per project — **Project** (stage, deal lead): which
     meetings and who attended.
   - `## Key findings`: the most important `highlights`, grouped by project, each dated.
   - `## Stage changes`: compared with last week (or "None").
   - `## Needs following up`: overdue first, with owner and due date; a separate "Done" line for
     this week's closed ones.
4. **Write `for-leadership`**: at most three items that need a partner's decision or presence.
5. **Write** to `digests`: `title` `2026-W45 Investment team digest`, `period-start` / `period-end`,
   `projects-seen`, `meetings-held` (meetings and files), `status: draft`. If that week already has a
   draft, update it instead of adding another. A person marks it `final`.
6. **Report back:** a summary of five lines or fewer, plus the link.

## Boundaries

- Summarise existing records only; do not infer conclusions nobody stated.
- If you can see "IC notes (leadership only)", do **not** copy anything from it into the digest — the
  digest is visible to everyone. Write only "Wavecraft Health: the IC met; conclusion in the leadership table".
- No financial figures.
