---
name: busa-customer-health
description: Customer health and churn-warning desk that agents keep current — accounts with ARR, renewal date and five health signals (seat usage, usage trend, urgent tickets, NPS, billing), evidence-backed signals, save plays and a Monday retention review. Use when the user asks which customers might churn or how much revenue is at risk, wants accounts re-scored from usage, support, survey or billing data, logs something heard from a customer, plans a save play, briefs before a customer call, reviews upcoming renewals, or writes or compares the weekly retention review.
metadata:
  category: sales-crm
  tags:
    - surface:busabase
    - workflow:customer-success
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-customer-health
    resources:
      - accounts
      - signals
      - plays
      - reviews
    risk: gated-write
---

# Customer Health

One place where every paying customer's health is visible, scored the same way every week. Each
agent reads its own source — product usage, the help desk, the NPS survey, billing — and writes a
signal with the evidence; the account is re-scored by one rule; a red account gets a save play
months before its renewal, not the week of it.

```txt
 product usage ─┐
 help desk ─────┤  each agent writes a signal (evidence · its own name)
 NPS survey ────┤                    │
 billing ───────┘                    ▼
                    accounts: five signal fields ──► score 0–100 ──► healthy / watch / at risk
                                                                          │ red ⇒ save play (cause · plan · owner · date)
                                                                          ▼
                                      Monday retention review: ARR at risk, red accounts, renewals
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-customer-health" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `accounts`, `signals`, `plays`, `reviews`. If two desks
are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `accounts` | One paying customer | People own the commercial fields; agents keep the five signal fields and the score current |
| `signals` | One movement of one account's signal, with evidence | The agent that reads that source, or a person |
| `plays` | What will be done about an account that is slipping | An agent proposes; a person owns it |
| `reviews` | The weekly retention review | An agent, every Monday |

### accounts

- `name`, `segment` (`enterprise`, `mid-market`, `smb`), `csm` (the customer success manager),
  `plan`, `champion` (name and role of the person who owns us inside the customer).
- `arr` — annual recurring revenue in US dollars, a number. `renewal-date` — the next renewal.
  These are commercial terms: people set them; an agent never changes them.
- The five signal fields, numbers only, each from one source:

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `seats-licensed`, `seats-active`, `seats-active-prior` | Product usage: seats paid for, seats active in the last 30 days, and in the 30 days before | Product analytics agent |
  | `urgent-tickets` | Help desk: open tickets marked urgent | Support agent |
  | `nps` | Survey: the latest NPS answer from this account, 0–10; empty if none | Survey agent |
  | `days-overdue` | Billing: days the oldest unpaid invoice is past due; 0 if none | Billing agent |

- `health-score` (0–100) and `health` (`healthy`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored it and when. `summary` — one or two sentences: where
  the account stands and why.

### signals

One row per movement: `title` ("Active seats: 63 → 41"), `account`, `kind` (`usage`, `support`,
`sentiment`, `billing`, `relationship`), `recorded-on`, `previous-value`, `new-value`,
`written-by` (the agent's name and tool, e.g. `Product analytics agent · Codex`, or the person's
name), `writer` (`agent` or `person`), `evidence` (what the number is made of, in one or two
sentences, ending with the source) and `source-url` when there is one.

A `relationship` signal has no numbers: a champion leaving, a new sponsor, an executive escalation,
what a person heard on a call. It does not change the score by itself — it is often the earliest
warning, so the CS agent reads it when proposing a play.

### plays

`title` (what will be done), `account`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner`, `due-date` (before the renewal), `proposed-by`, `cause` (why the account is slipping, from
the signals) and `plan` (the concrete steps and when to re-check).

### reviews

`title` ("Week of Oct 27 – Nov 2"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `arr-at-risk`, `at-risk-count`, `written-by`, and `body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
seat usage   = active / paid for            ≥ 0.70 → 20 · ≥ 0.50 → 12 · ≥ 0.30 → 6 · else 0
usage trend  = active / active before − 1   ≥ 0    → 20 · ≥ −0.10 → 12 · ≥ −0.25 → 6 · else 0
urgent tix   = open urgent tickets          0      → 20 · 1       → 12 · 2       → 6 · else 0
NPS          = latest answer, 0–10          ≥ 9    → 20 · ≥ 7     → 12 · ≥ 5     → 6 · else 0
billing      = days overdue                 0      → 20 · ≤ 15    → 12 · ≤ 45    → 6 · else 0

a part with no reading scores 10            (unknown is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → healthy · 50–69 → watch · under 50 → at-risk
```

The app computes the same rule (`model.js#healthParts`, `#healthFor`) and shows each part's points
on the account page, so a score that disagrees with its fields is visible at once. Never set a
score or a light by feel.

"Renewing soon" means within 90 days. A `watch` account renewing soon needs a look as much as a
red one renewing next year.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the fields that source keeps (table above).
2. For each account whose number moved, write one `signals` row: previous value, new value, today,
   your name in `written-by`, `writer: agent`, and the evidence. If you cannot reach the source,
   skip the account and say so — never carry an old number forward as if it were new.
3. Update the account's field to the new value.

### Re-score an account

After any signal field changes: compute the five parts and the score by the rule, write
`health-score`, `health`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences.
If the account turned `at-risk` and has no open play, add one `plays` row with the cause and a
concrete plan; the owner is the account's `csm`, the due date before its renewal.

### Answer "which customers might churn?"

Read only. Total ARR at risk (the sum of `arr` over `at-risk` accounts); then every `at-risk`
account, soonest renewal first, with its score, its weakest part and its open play; then `watch`
accounts renewing within 90 days. One screen, numbers first.

### Brief before a call

Read only. ARR, renewal, the score with each part, the last five signals and who wrote them, open
plays, and two questions worth asking.

### Write the Monday retention review

From the records only: headline, ARR at risk and its change since the last review, every at-risk
account with cause and play, `watch` accounts renewing within 90 days, and what changed. Write it
with `status: draft`; a person changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- ARR, plan, renewal date and owner belong to people. An agent never changes them, never offers a
  discount or credit on its own, and never contacts a customer; it proposes, a person acts.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
