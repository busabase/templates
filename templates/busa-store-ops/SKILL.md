---
name: busa-store-ops
description: Store-operations desk that agents keep current — every store in a chain (cafés, restaurants, retail) with region, area manager, store manager, 30-day revenue, last standards audit and five measures (audit score, sales vs target, review rating, shifts filled, audit fixes past due), evidence-backed signals, store actions and a Monday store review. Use when the user asks which stores are slipping or at risk, how much revenue is at risk, which stores are overdue for an audit or a visit, wants stores re-scored from audit, POS, review, scheduling or facilities data, logs something noticed at a store, plans an action to fix one, briefs before a store visit, or writes or compares the weekly store review.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:store-operations
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-store-ops
    resources:
      - stores
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Store Ops Desk

One place where every store in the chain is scored the same way every week. Each agent reads its
own source — the standards-audit app, the POS, review sites, the scheduling system, the
facilities queue — and writes a signal with the evidence; the store is re-scored by one rule; a
store that is slipping gets an action while its revenue is still there, not after the month
closes.

```txt
 standards audits ──┐
 POS ───────────────┤
 review sites ──────┤  each agent writes a signal (evidence · its own name)
 scheduling ────────┤                    │
 facilities queue ──┘                    ▼
                stores: five measures ──► score 0–100 ──► on standard / watch / at risk
                                                                │ red ⇒ action (what is wrong · plan · owner · date)
                                                                │ no audit in 30 days ⇒ visit list
                                                                ▼
                 Monday store review: revenue at risk, every store at risk, every audit overdue
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-store-ops" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `stores`, `signals`, `actions`, `reviews`. If two desks
are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `stores` | One store | People own the region, area manager, store manager and address; agents keep the revenue, the audit date, the five measures and the score current |
| `signals` | One movement of one store's measure, or one note, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done for a store that is slipping or overdue for an audit | An agent proposes; a person owns it |
| `reviews` | The weekly store review | An agent, every Monday |

### stores

- `name`, `region` (`bay-area`, `seattle`, `portland`, `los-angeles` — rename the choices to your
  own regions), `area-manager`, `store-manager`, `address`.
- `revenue-30d` — the store's revenue over the last 30 days, in dollars, from the POS.
- `audited-on` — the date of the last standards audit, written with `audit-score`.
- The five measures, numbers only, each from one source:

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `audit-score` | Standards-audit app: the last audit's score, 0–100 (checks passed, with critical items weighted as the checklist says) | Inspection agent |
  | `sales-pct` | POS: sales month to date ÷ the month-to-date target, in % | POS agent |
  | `rating` | Review sites (Google, Yelp, or the platforms you use): average rating of reviews in the last 30 days, 1–5 | Reviews agent |
  | `staffing-pct` | Scheduling system: scheduled shifts actually worked in the last 14 days, in % | Scheduling agent |
  | `overdue-fixes` | Facilities queue: corrective actions from audits that are past their due date | Facilities agent |

- `score` (0–100) and `status` (`on-track` = on standard, `watch`, `at-risk`) — set by the rule
  below. `scored-by` / `scored-on` — who last scored the store and when. `summary` — one or two
  sentences: where the store stands and why.

### signals

One row per movement: `title` ("Standards audit: 89 → 72"), `store`, `kind` (`audit`, `sales`,
`rating`, `staffing`, `fixes`, `note`), `recorded-on`, `previous-value`, `new-value` (in the
measure's own unit; no `previous-value` for a first reading), `written-by` (the agent's name and
tool, e.g. `Inspection agent · Codex`, or the person's name), `writer` (`agent` or `person`),
`evidence` (what the number is made of — checklist items, ticket numbers, review counts — in one
or two sentences, ending with the source) and `source-url` when there is one.

A `note` has no numbers: an equipment failure, a resignation, a competitor opening, something an
area manager saw on a visit. It does not change the score by itself — it is often the earliest
warning, so read it when proposing an action.

### actions

`title` (what will be done), `store`, `status` (`open`, `in-progress`, `done`, `dropped`), `owner`
(the person who can fix it — the store manager, the area manager or facilities), `due-date`,
`proposed-by`, `cause` (what is wrong, from the signals) and `plan` (the concrete steps and when to
re-check).

### reviews

`title` ("Week of Nov 9 – Nov 15"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `revenue-at-risk` (30-day revenue of the at-risk stores),
`on-track-count`, `at-risk-count`, `audit-overdue-count`, `written-by`, and `body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
audit        = audit-score      ≥ 90  → 20 · ≥ 80  → 12 · ≥ 70  → 6 · else 0
sales        = sales-pct        ≥ 100 → 20 · ≥ 95  → 12 · ≥ 90  → 6 · else 0
reviews      = rating           ≥ 4.5 → 20 · ≥ 4.2 → 12 · ≥ 4.0 → 6 · else 0
staffing     = staffing-pct     ≥ 98  → 20 · ≥ 95  → 12 · ≥ 90  → 6 · else 0
fixes        = overdue-fixes    0     → 20 · 1     → 12 · 2     → 6 · else 0

a part with no reading scores 10          (not measured yet is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → on-track (on standard) · 50–69 → watch · under 50 → at-risk
```

The app computes the same rule (`model.js#scoreParts`, `#statusFor`) and shows each part's points
on the store's page, so a score that disagrees with its fields is visible at once. Never set a
score or a status by feel.

"Revenue at risk" is the sum of `revenue-30d` over the at-risk stores. A store with no standards
audit in the last 30 days — or never audited — is **overdue for an audit** and goes on the visit
list whatever its score: an unaudited store is where the next critical item hides.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each store whose number moved, write one `signals` row: previous value, new value, today,
   your name in `written-by`, `writer: agent`, and the evidence with checklist items, ticket
   numbers or review counts. If you cannot reach the source, skip the store and say so — never
   carry an old number forward as if it were new.
3. Update the store's field to the new value (and `audited-on` with `audit-score`).

### Re-score a store

After any measure changes: compute the five parts and the score by the rule, write `score`,
`status`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If it turned
`at-risk` and has no open action, add one `actions` row with the cause and a concrete plan; the
owner is whoever can fix it.

### Answer "which stores are slipping?"

Read only. Revenue at risk and how many stores are on standard; then every `at-risk` store, lowest
score first, with its revenue, the weakest part and the open action; then every store overdue for
an audit. One screen, numbers first.

### Plan this week's visits

Read only. Every at-risk store and every store overdue for an audit, grouped by region, most
urgent first, with what to check at each.

### Brief before a store visit

Read only. Region, store manager, revenue, when it was last audited, the score with each part,
the last five signals and who wrote them, open actions, and three things to check on the visit.

### Write the Monday store review

From the records only: headline, revenue at risk and its change since the last review, how many
stores are on standard, every at-risk store with what is wrong and the action, every store
overdue for an audit, and what changed. Write it with `status: draft`; a person changes it to
`final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Sales targets, schedules, hiring, wages, prices and repairs that cost money belong to people. An
  agent never changes them, never books a contractor or orders a part, never publishes a reply to
  a review, and never messages staff; it proposes, a person acts.
- People are not scored here. Write staffing as shifts filled; never write a named employee's
  performance, health or personal circumstances into a record.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
