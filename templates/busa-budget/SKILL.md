---
name: busa-budget
description: Budget-vs-actual desk that agents keep current — every department or cost center with a budget this year, with division, budget owner, finance partner, annual budget, year-to-date budget and actual, full-year forecast, open purchase orders and five measures (spend against the year-to-date budget, forecast against the annual budget, heads over plan, open POs without a budget line, renewals waiting for a decision), evidence-backed signals, budget actions and a Monday budget review. Use when the user asks which departments or cost centers are over budget or heading over, what the projected overrun for the year is, which forecasts are stale, how much is committed in open purchase orders, which contract renewals need a decision, wants cost centers re-scored from general-ledger, forecast, HRIS, procurement or contract-register data, logs something a budget owner said, plans an action to bring a budget back in line, briefs before a budget review, or writes or compares the weekly budget review.
metadata:
  category: finance
  tags:
    - surface:busabase
    - workflow:budget-vs-actual
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-budget
    resources:
      - departments
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Budget Desk

One place where every cost center's budget is scored the same way every week. Each agent reads
its own source — the general ledger, the forecast model, the HRIS, the procurement system, the
contract register — and writes a signal with the evidence; the cost center is re-scored by one
rule; a cost center heading over budget gets an action while there are still months left to act,
not at year-end close.

```txt
 general ledger ──────┐
 forecast model ──────┤
 HRIS ────────────────┤  each agent writes a signal (evidence · its own name)
 procurement system ──┤                    │
 contract register ───┘                    ▼
        cost centers: five measures ──► score 0–100 ──► on track / watch / at risk
                                                              │ red ⇒ action (what is wrong · plan · owner · date)
                                                              │ forecast older than 30 days ⇒ refresh list
                                                              ▼
     Monday budget review: projected overrun, open POs, every cost center at risk, every stale forecast
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-budget" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `departments`, `signals`, `actions`, `reviews`. If two
desks are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `departments` | One department or cost center with a budget this year | People own the name, division, budget owner, finance partner and annual budget; agents keep the actuals, the forecast, open POs, the five measures and the score current |
| `signals` | One movement of one cost center's measure, or one note, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done for a cost center heading over budget or whose forecast is stale | An agent proposes; a person owns it |
| `reviews` | The weekly budget review | An agent, every Monday |

### departments

- `name`, `division` (`product`, `gtm`, `operations`, `g-and-a` — rename the choices to your own
  divisions), `budget-owner` (the executive accountable for the budget), `finance-partner`.
- `annual-budget` — this fiscal year's approved budget in dollars, after approved transfers.
- `ytd-budget` and `ytd-actual` — budget and actual spend from the start of the fiscal year to the
  last closed month, in dollars, from the general ledger.
- `forecast` — the full-year forecast in dollars: actuals to date, open commitments and the run
  rate for the months left. `forecast-on` — the date the forecast was last refreshed.
- `committed` — open purchase orders not yet invoiced, in dollars.
- The five measures, numbers only, each from one source:

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `ytd-variance-pct` | General ledger: (`ytd-actual` − `ytd-budget`) ÷ `ytd-budget`, in %, rounded (positive = over) | Ledger agent |
  | `forecast-variance-pct` | Forecast model: (`forecast` − `annual-budget`) ÷ `annual-budget`, in %, rounded | Forecast agent |
  | `headcount-gap` | HRIS against the headcount plan: people on payroll minus heads planned for today (0 or below when at or under plan) | HRIS agent |
  | `unbudgeted-pos` | Procurement system: open purchase orders with no budget line | Procurement agent |
  | `renewals-undecided` | Contract register: contracts renewing in the next 60 days with no renew / cut / cancel decision | Contracts agent |

- `score` (0–100) and `status` (`on-track`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored the cost center and when. `summary` — one or two
  sentences: where the budget stands and why.

### signals

One row per movement: `title` ("Full-year forecast vs budget: +6% → +11%"), `department`, `kind`
(`spend`, `forecast`, `headcount`, `purchasing`, `renewals`, `note`), `recorded-on`,
`previous-value`, `new-value` (in the measure's own unit; no `previous-value` for a first reading),
`written-by` (the agent's name and tool, e.g. `Forecast agent · Claude Code`, or the person's
name), `writer` (`agent` or `person`), `evidence` (what the number is made of — dollar amounts, PO
numbers, contract names, start dates — in one or two sentences, ending with the source) and
`source-url` when there is one.

A `note` has no numbers: a verbal approval, a vendor price change, something a finance partner
heard in a review. It does not change the score by itself — it is often the earliest warning, so
read it when proposing an action.

### actions

`title` (what will be done), `department`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner` (the person who can fix it — the budget owner or the finance partner), `due-date`,
`proposed-by`, `cause` (what is wrong, from the signals) and `plan` (the concrete steps and when to
re-check).

### reviews

`title` ("Week of Nov 9 – Nov 15"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `projected-overrun`, `committed-total`, `on-track-count`,
`at-risk-count`, `forecast-stale-count`, `written-by`, and `body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
spend       = ytd-variance-pct       ≤ 0 → 20 · ≤ 3 → 12 · ≤ 6 → 6 · else 0
forecast    = forecast-variance-pct  ≤ 0 → 20 · ≤ 2 → 12 · ≤ 5 → 6 · else 0
headcount   = headcount-gap          ≤ 0 → 20 · 1   → 12 · 2   → 6 · else 0
purchasing  = unbudgeted-pos         0   → 20 · 1   → 12 · 2   → 6 · else 0
renewals    = renewals-undecided     0   → 20 · 1   → 12 · 2   → 6 · else 0

a part with no reading scores 10          (not measured yet is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → on-track · 50–69 → watch · under 50 → at-risk
```

The app computes the same rule (`model.js#scoreParts`, `#statusFor`) and shows each part's points
on the cost center's page, so a score that disagrees with its fields is visible at once. Never set
a score or a status by feel.

"Projected overrun" is the sum, over the cost centers whose forecast is above budget, of
`forecast` − `annual-budget`. A cost center under budget does not offset one over: money left in
one department is not automatically available to another. A cost center whose forecast was not
refreshed in the last 30 days — or never — is **stale** and goes on the refresh list whatever its
score: an old forecast is where the year-end surprise hides.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each cost center whose number moved, write one `signals` row: previous value, new value,
   today, your name in `written-by`, `writer: agent`, and the evidence with amounts, PO numbers or
   contract names. If you cannot reach the source, skip the cost center and say so — never carry
   an old number forward as if it were new.
3. Update the cost center's field to the new value. The ledger agent also keeps `ytd-budget` and
   `ytd-actual`; the forecast agent keeps `forecast` and `forecast-on`; the procurement agent
   keeps `committed`.

### Re-score a cost center

After any measure changes: compute the five parts and the score by the rule, write `score`,
`status`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If it turned
`at-risk` and has no open action, add one `actions` row with the cause and a concrete plan; the
owner is whoever can fix it.

### Answer "which cost centers are heading over budget?"

Read only. The projected overrun, open purchase orders and how many cost centers are on track;
then every `at-risk` cost center, lowest score first, with how far its forecast runs over, the
weakest part and the open action; then every stale forecast. One screen, numbers first.

### Which renewals need a decision?

Read only. Every cost center with renewals in the next 60 days and no decision, most first, with
what renews, roughly how much, and who has to decide.

### Brief before a budget review

Read only. Annual budget, spend against the year-to-date budget, the full-year forecast and when it
was refreshed, open POs, heads over plan, POs without a budget line, renewals waiting, the last
five signals and who wrote them, open actions, and three questions to ask the owner.

### Write the Monday budget review

From the records only: headline, the projected overrun and its change since the last review, open
purchase orders, how many cost centers are on track, every at-risk cost center with what is wrong
and the action, every stale forecast, and what changed. Write it with `status: draft`; a person
changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Budgets, budget transfers, purchase approvals, hiring, contract renewals and payments belong to
  people. An agent never changes `annual-budget`, never approves, cancels or raises a purchase
  order, never renews or cancels a contract, never pays anything and never moves money between
  budgets; it proposes, a person acts.
- People are not scored here. Write headcount as heads against plan; never write a named
  employee's salary, performance or personal circumstances into a record.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
