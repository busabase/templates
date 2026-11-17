---
name: busa-onboarding
description: New-hire onboarding desk that agents keep current — everyone from signed offer to day 90 with start date, manager, buddy and five measures (accounts and equipment ready, paperwork done, training done, missed 1:1s, weekly pulse), evidence-backed signals, onboarding actions and a Monday onboarding review. Use when the user asks which new hires are stuck or at risk, who starts soon without a laptop or account, wants new hires re-scored from IT, HR, learning, calendar or pulse data, logs something noticed about a new hire, plans an action to unstick someone, briefs before a 1:1 with a new hire, checks day-one readiness, or writes or compares the weekly onboarding review.
metadata:
  category: hr
  tags:
    - surface:busabase
    - workflow:onboarding
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-onboarding
    resources:
      - hires
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Onboarding Desk

One place where every new hire is scored the same way every week, from signed offer to day 90.
Each agent reads its own source — IT tickets and the device inventory, the HR onboarding
checklist, the learning platform, manager and buddy calendars, the weekly pulse survey — and
writes a signal with the evidence; the new hire is re-scored by one rule; someone who is stuck gets
an action in week three, not in the exit interview.

```txt
 IT tickets & devices ──┐
 HR checklist ──────────┤
 learning platform ─────┤  each agent writes a signal (evidence · its own name)
 calendars (1:1s) ──────┤                    │
 pulse survey ──────────┘                    ▼
                  hires: five measures ──► score 0–100 ──► on track / watch / at risk
                                                                │ red, or starting soon and not ready
                                                                ▼   ⇒ action (where stuck · plan · owner · date)
                     Monday onboarding review: how many on track, everyone at risk, starts not ready
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-onboarding" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `hires`, `signals`, `actions`, `reviews`. If two desks
are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `hires` | One new hire, from signed offer to day 90 | People own the role, manager, buddy and start date; agents keep the five measures and the score current |
| `signals` | One movement of one new hire's measure, or one note, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done for a new hire who is stuck | An agent proposes; a person owns it |
| `reviews` | The weekly onboarding review | An agent, every Monday |

### hires

- `name`, `role`, `team` (`engineering`, `sales`, `support`, `design`, `marketing`, `operations`,
  `finance`, `people` — rename the choices to your own teams), `manager`, `buddy`, `location`.
- `start-date` — day one. It comes from People; an agent never changes it. A row stays on the desk
  until day 90; after that, archive it.
- The five measures, numbers only, each from one source. The three completion rates count only
  what is **due by today** — a laptop due on day one is not "missing" three weeks before — so a
  rate can fall as more comes due.

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `access-pct` | IT service desk and device inventory: accounts and equipment due by today that are ready, in % | IT agent |
  | `paperwork-pct` | HR onboarding checklist: contract, right-to-work, tax, bank and policy items due by today that are done, in % | HR agent |
  | `training-pct` | Learning platform: required modules due by today that are completed, in %; empty before anything is due | Learning agent |
  | `checkins-missed` | Manager and buddy calendars: scheduled 1:1s missed or cancelled without a new date in the last 30 days; empty before day one | Calendar agent |
  | `pulse` | Weekly new-hire pulse survey: the latest answer, 1–5; empty before the first one | Pulse agent |

- `score` (0–100) and `status` (`on-track`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored them and when. `summary` — one or two sentences:
  where they stand and why.

### signals

One row per movement: `title` ("Training done: 70% → 55%"), `hire`, `kind` (`access`, `paperwork`,
`training`, `checkins`, `pulse`, `note`), `recorded-on`, `previous-value`, `new-value` (in the
measure's own unit; no `previous-value` for a first pulse), `written-by` (the agent's name and tool,
e.g. `IT agent · Codex`, or the person's name), `writer` (`agent` or `person`), `evidence` (what the
number is made of — ticket, form or module names — in one or two sentences, ending with the source)
and `source-url` when there is one.

A `note` has no numbers: a visa delay, a role or territory change, something a manager or buddy
noticed. It does not change the score by itself — it is often the earliest warning, so read it
when proposing an action.

### actions

`title` (what will be done), `hire`, `status` (`open`, `in-progress`, `done`, `dropped`), `owner`
(the person who can fix it — IT, People or the manager, never the new hire), `due-date` (before
day one, for anything that must be ready on day one), `proposed-by`, `cause` (where they are stuck,
from the signals) and `plan` (the concrete steps and when to re-check).

### reviews

`title` ("Week of Nov 2 – Nov 8"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `on-track-count`, `at-risk-count`, `not-ready-count`, `written-by`, and
`body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
accounts & equipment = access-pct        ≥ 100 → 20 · ≥ 90 → 12 · ≥ 75 → 6 · else 0
paperwork            = paperwork-pct     ≥ 100 → 20 · ≥ 90 → 12 · ≥ 75 → 6 · else 0
training             = training-pct      ≥ 95  → 20 · ≥ 80 → 12 · ≥ 60 → 6 · else 0
1:1s                 = checkins-missed   0     → 20 · 1    → 12 · 2    → 6 · else 0
pulse                = pulse             ≥ 4.5 → 20 · ≥ 4  → 12 · ≥ 3  → 6 · else 0

a part with no reading scores 10          (nothing due yet is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → on-track · 50–69 → watch · under 50 → at-risk
```

So someone who has not started yet, with every account, device and form that is due ready, scores
20 + 20 + 10 + 10 + 10 = 70: on track. The app computes the same rule (`model.js#scoreParts`,
`#statusFor`) and shows each part's points on the new hire's page, so a score that disagrees with
its fields is visible at once. Never set a score or a status by feel.

"Starting soon" means the start date is within 14 days. Anyone starting soon whose `access-pct` is
below 100 is **not ready** and needs attention whatever their status: a missing laptop on day one
is the most visible onboarding failure there is.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each new hire whose number moved, write one `signals` row: previous value, new value, today,
   your name in `written-by`, `writer: agent`, and the evidence with ticket, form or module names.
   If you cannot reach the source, skip the new hire and say so — never carry an old number
   forward as if it were new.
3. Update the new hire's field to the new value.

### Re-score a new hire

After any measure changes: compute the five parts and the score by the rule, write `score`,
`status`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If they turned
`at-risk`, or start within 14 days and are not ready, and have no open action, add one `actions`
row with the cause and a concrete plan; the owner is whoever can fix it.

### Answer "who is stuck?"

Read only. How many are on track; then every `at-risk` new hire, earliest start first, with the
score, the weakest part and the open action; then everyone starting within 14 days who is not
ready, and what is missing. One screen, numbers first.

### Check day-one readiness

Read only. Everyone starting within 14 days, soonest first: what is still missing (accounts,
equipment, paperwork), who owns each gap, and whether it will be done before day one.

### Brief before a 1:1

Read only. Role, start date and which day they are on, the score with each part, the last five
signals and who wrote them, open actions, and two questions worth asking.

### Write the Monday onboarding review

From the records only: headline, on-track count and its change since the last review, every
at-risk new hire with where they are stuck and the action, everyone starting within 14 days who is
not ready, and what changed. Write it with `status: draft`; a person changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Offers, pay, start dates, roles, reporting lines and the choice of buddy belong to people. An
  agent never changes them, never grants or revokes access itself, never signs or sends a document,
  and never messages the new hire; it proposes, a person acts.
- Pulse answers are personal. Write the score and, at most, one short quote the new hire agreed to
  share; never paste a whole survey answer, health or family details into a record.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
