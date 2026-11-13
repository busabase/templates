---
name: busa-suppliers
description: Supplier scorecard and procurement risk desk that agents keep current — suppliers with annual spend, contract end and five measures (on-time delivery, inspection rejects, price versus contract, first-time invoice match, response time), evidence-backed signals, supplier actions and a Monday procurement review. Use when the user asks which suppliers put supply at risk or how much spend is exposed, wants suppliers re-scored from receiving, inspection, invoice or issue data, logs something heard from a supplier, plans a corrective action, briefs before a supplier negotiation, reviews contracts coming up for renewal, or writes or compares the weekly procurement review.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:procurement
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-suppliers
    resources:
      - suppliers
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Supplier Scorecard

One place where every supplier is scored the same way every week. Each agent reads its own
source — goods receipts, the inspection log, invoice lines, the three-way match, the issue inbox —
and writes a signal with the evidence; the supplier is re-scored by one rule; a red supplier gets
an action months before its contract comes up, not the week a café runs out of cups.

```txt
 goods receipts ───┐
 inspection log ───┤
 invoice lines ────┤  each agent writes a signal (evidence · its own name)
 three-way match ──┤                    │
 issue inbox ──────┘                    ▼
                  suppliers: five measures ──► score 0–100 ──► preferred / watch / at risk
                                                                     │ red ⇒ action (cause · plan · owner · date)
                                                                     ▼
                           Monday procurement review: spend at risk, red suppliers, contracts ending
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-suppliers" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `suppliers`, `signals`, `actions`, `reviews`. If two
desks are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `suppliers` | One supplier | People own the contract, price and choice of supplier; agents keep the five measures and the score current |
| `signals` | One movement of one supplier's measure, or one piece of risk news, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done about a supplier that is slipping | An agent proposes; a person owns it |
| `reviews` | The weekly procurement review | An agent, every Monday |

### suppliers

- `name`, `category` (`green-coffee`, `dairy`, `packaging`, `food`, `equipment`, `logistics`,
  `services` — rename the choices to your own categories), `buyer` (the person who owns the
  relationship), `contract` (what was signed, in a few words), `backup` (who could supply instead,
  or "None qualified").
- `annual-spend` — spend over the last twelve months in US dollars, a number. `contract-end` — when
  the current contract ends. These come from people and the contract register; an agent never
  changes them.
- The five measures, numbers only, each from one source:

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `on-time-pct` | Goods receipts: share of deliveries in the last 90 days that arrived by the promised date, in % | Receiving agent |
  | `defect-pct` | Inspection log: share of units rejected at incoming inspection in the last 90 days, in % | Quality agent |
  | `price-variance-pct` | Invoice lines: average invoiced unit price against the contract price, in % (negative = under) | Price agent |
  | `invoice-match-pct` | Accounts payable: share of invoices that matched PO and receipt the first time, in %; empty if none yet | AP agent |
  | `response-days` | Issue inbox: average days to a first real answer on a claim, quote or question | Sourcing agent |

- `score` (0–100) and `rating` (`preferred`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored it and when. `summary` — one or two sentences: where
  the supplier stands and why.

### signals

One row per movement: `title` ("On-time deliveries: 84% → 78%"), `supplier`, `kind` (`delivery`,
`quality`, `price`, `invoice`, `response`, `risk`), `recorded-on`, `previous-value`, `new-value`
(in the measure's own unit), `written-by` (the agent's name and tool, e.g.
`Receiving agent · Codex`, or the person's name), `writer` (`agent` or `person`), `evidence` (what
the number is made of — PO, lot or invoice numbers — in one or two sentences, ending with the
source) and `source-url` when there is one.

A `risk` signal has no numbers: a single source, a capacity warning, a plant shutdown, a late
harvest, something a buyer heard on a call. It does not change the score by itself — it is often
the earliest warning, so the sourcing agent reads it when proposing an action.

### actions

`title` (what will be done), `supplier`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner`, `due-date` (before the contract ends), `proposed-by`, `cause` (why the supplier is
slipping, from the signals) and `plan` (the concrete steps and when to re-check).

### reviews

`title` ("Week of Oct 27 – Nov 2"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `spend-at-risk`, `at-risk-count`, `written-by`, and `body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
on-time delivery  = on-time-pct           ≥ 95  → 20 · ≥ 90 → 12 · ≥ 80 → 6 · else 0
quality           = defect-pct            ≤ 0.5 → 20 · ≤ 1  → 12 · ≤ 2  → 6 · else 0
price vs contract = price-variance-pct    ≤ 0   → 20 · ≤ 2  → 12 · ≤ 5  → 6 · else 0
invoice match     = invoice-match-pct     ≥ 95  → 20 · ≥ 90 → 12 · ≥ 80 → 6 · else 0
response time     = response-days         ≤ 1   → 20 · ≤ 3  → 12 · ≤ 7  → 6 · else 0

a part with no reading scores 10          (unknown is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → preferred · 50–69 → watch · under 50 → at-risk
```

The app computes the same rule (`model.js#scoreParts`, `#ratingFor`) and shows each part's points
on the supplier page, so a score that disagrees with its fields is visible at once. Never set a
score or a rating by feel.

"Ending soon" means the contract ends within 90 days. A `watch` supplier whose contract ends soon
needs a decision — renew, renegotiate or re-source — as much as a red one.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each supplier whose number moved, write one `signals` row: previous value, new value, today,
   your name in `written-by`, `writer: agent`, and the evidence with PO, lot or invoice numbers. If
   you cannot reach the source, skip the supplier and say so — never carry an old number forward
   as if it were new.
3. Update the supplier's field to the new value.

### Re-score a supplier

After any measure changes: compute the five parts and the score by the rule, write `score`,
`rating`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If the supplier
turned `at-risk` and has no open action, add one `actions` row with the cause and a concrete plan;
the owner is the supplier's `buyer`, the due date before its contract ends.

### Answer "which suppliers put supply at risk?"

Read only. Total annual spend with `at-risk` suppliers; then every `at-risk` supplier, soonest
contract end first, with its score, its weakest part, its backup and its open action; then
`watch` suppliers whose contract ends within 90 days. One screen, numbers first.

### Brief before a negotiation

Read only. Annual spend, contract end, the score with each part, the last five signals and who
wrote them, open actions, the backup supplier, and two points worth raising.

### Write the Monday procurement review

From the records only: headline, spend at risk and its change since the last review, every
at-risk supplier with cause and action, `watch` suppliers whose contract ends within 90 days, and
what changed. Write it with `status: draft`; a person changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Contracts, prices, annual spend, the buyer and the choice of supplier belong to people. An agent
  never changes them, never places, changes or cancels an order, never approves or pays an
  invoice, and never contacts a supplier; it proposes, a person acts.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
