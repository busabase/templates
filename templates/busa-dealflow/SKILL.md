---
name: busa-dealflow
description: Shared deal-flow desk for an investment team — one record per company, every meeting, filed document and post-investment update linked to it, follow-ups with owners, a weekly leadership digest, and a leadership-only IC table. Use when the user hands over a meeting transcript or notes about a company, asks where a project stands or what the team saw this week, adds or moves a project, closes a follow-up, or asks for the weekly digest; read this first, then dealflow-meeting-notes or dealflow-weekly-digest for those jobs. 投资团队的 Deal Flow 共享空间：整理会议纪要、查项目进展、本周团队看了哪些项目、写管理层周报时先读本手册。
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
    - industry:venture-capital
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-dealflow
    resources:
      - deals
      - meetings
      - followups
      - digests
      - ic-notes
    risk: gated-write
---

# Investment Deal Flow — team playbook

This folder is the shared projects–meetings–follow-ups space of an investment team. Everyone keeps
the agent they already use (Codex, WorkBuddy, Claude Code…), and that agent reads and writes here
**with that person's own account and permissions**. The team wants one loop:

```txt
meeting ──► transcript to your own agent ──► find the project (never a duplicate) ──► minutes + findings + follow-ups ──► update the project
   ▲                                                                                                                    │
   └── owners close follow-ups ◄── leadership reads "This week" / the digest ◄── colleagues ask their own agents ◄───────┘
```

Turning one meeting into records is in `dealflow-meeting-notes`; the weekly digest is in
`dealflow-weekly-digest`. This file holds the data rules everybody keeps.

Write in the language the team works in. The sample data is in English and each company keeps its
Chinese name in `aliases`, so a transcript in either language finds it.

## Tables and fields

**Space:** the person's account may belong to several spaces. Pass `--space-id <team space id>` on
every command (the connection prompt names it); never run `space use` to change their default.

Find tables by the `resourceKey` install stamped on them (the visible names may have been
translated, and slugs may carry a prefix): `npx --yes busabase-cli@latest bases list --output json`,
then take the Bases in this folder whose slug ends in `-deals`, `-meetings`, `-followups`,
`-digests`, `-ic-notes`.

### `deals` — Projects (one per company; everything hangs off it)

| Field | Meaning | Rule |
| --- | --- | --- |
| `name` Project | What the team calls it, e.g. "Spruce Robotics" | required; the display name |
| `company` Company legal name | Registered legal name | required; **the dedupe key** |
| `aliases` Also known as | Short names, other-language names, common mis-transcriptions | comma-separated; add new ones whenever a transcript uses one |
| `stage` Stage | `sourcing` · `first-meeting` · `diligence` · `ic` · `portfolio` · `on-hold` · `passed` | required; change only when a meeting or decision supports it |
| `sector` Sector | `ai-infra` / `enterprise` / `robotics` / `healthcare` / `consumer` / `other` | |
| `round` Round | Text, e.g. "Series A" | |
| `owner` Deal lead | A person | required |
| `team` Team | `tech` / `healthcare` / `consumer` | |
| `one-liner` One-liner | What they do and for whom | |
| `latest-finding` Latest finding | The most important finding of the latest meeting | update after every meeting |
| `next-step` / `next-step-due` | The team's next action and its date | update after every meeting |
| `last-meeting-on` Last meeting | Date | update after every meeting |
| `source` Source | Who referred it, which event | |

### `meetings` — Meetings & files (each linked to exactly one project)

Meetings, calls, diligence interviews, IC meetings, portfolio reviews and filed documents all live
here, told apart by `kind`: `intro` first meeting · `follow-up` · `diligence` interview · `ic`
meeting · `board` portfolio review · `document` filed document. `phase` is `pre` / `during` / `post`
investment.

- `title` is always `YYYY-MM-DD · Project · Type`, e.g. `2026-11-05 · Spruce Robotics · Diligence interview`.
- `deal` is required and points at exactly one project. One meeting about two companies is two records.
- `summary` minutes (Markdown bullets, facts), `highlights` key findings (one per line; leadership
  reads them line by line), `questions` open questions and risks.
- `recorded-by`, `attendees` (our side first, then a semicolon, then theirs), `logged-via` (which
  agent wrote it: Codex / WorkBuddy / Claude Code / Manual).
- `transcript` holds the original text (an excerpt if it is very long; attach the full file in `files`).

### `followups` — Follow-ups

`title` is one thing that can be done; `deal` required; `meeting` is where it came from; `owner`
required; `due-on`; `status`: `open` · `in-progress` · `done` · `dropped`. When done, set `done-on`
and write the outcome in `notes`.

### `digests` — Weekly digests

One per week; see `dealflow-weekly-digest`.

### `ic-notes` — IC notes (leadership only)

Investment-committee conclusions and partners' views. **After installing, an admin restricts this
table to leadership** (table → permissions → visibility private → grant the partners). People who
cannot see it — and their agents — find no trace of it in lists, search or grep. The IC meeting in
`meetings` says only "the committee met; the conclusion is in the leadership table".

## Rules

1. **One company, one project record.** Before writing anything, search `name`, `company` and
   `aliases`, then `grep` the projects table for short names. Found it → use it. Unsure whether it is
   the same company → **ask**, do not create.
2. **Every write is a change request** (the busabase-cli `*-change-request` commands) with a real
   `--message` (verb + what + why) and `--playbook skill:<this skill's node id>`. Do not pass
   `autoMerge`; read the returned `status`: merged means it landed, in_review means tell the person
   who has to review it.
3. **You act with the person's own permissions.** A table you cannot find is one they may not see:
   say "this table is not shared with you", never work around it, never ask for someone else's key,
   never copy leadership-table content into shared tables.
4. **No sensitive financials.** Fund returns, portfolio revenue, profit or valuation figures stay
   out of the shared tables; keep the original as an attachment and write "materials filed".
5. **Change a stage only on evidence**, and say which meeting or decision in `latest-finding` or the minutes.
6. **Send the link after every write**: `https://<busabase address>/dashboard/<space id>/base/<table slug>/<record id>`.

## Read-only questions

- A project's full picture: find the project by name, then `meetings` and `followups` whose `deal`
  points at it, in date order, told as pre / during / post investment.
- What the team saw this week: `meetings` with `held-on` from Monday to today, grouped by `deal`,
  with attendees and key findings.
- What I still owe: `followups` whose `owner` is me and `status` is not `done`/`dropped`, overdue first.

```bash
# latest 50 meetings, newest first; filter this week's by held-on locally
npx --yes busabase-cli@latest records query --base-id <meetings base id> --limit 50 \
  --sort-json '{"fieldSlug":"held-on","fieldType":"date","direction":"desc"}' --slim --output json
# exact project by name; fall back to grep for short names and aliases
npx --yes busabase-cli@latest records by-field-text --base-id <deals base id> --field-slug name --value-text "Spruce Robotics" --output json
npx --yes busabase-cli@latest grep --pattern "Spruce|云杉" --base-ids <deals base id> --output json
```

## What this app does not do

- The Deal Flow app in this folder only reads: this week's overview, project timelines, the
  follow-up board and the connection prompt. It writes nothing.
- It sends no email, contacts nobody, and does not sync legacy systems. Importing from an old
  system is a separate, agreed job.
- It makes no investment judgement; every finding and stage change must trace to a meeting.
