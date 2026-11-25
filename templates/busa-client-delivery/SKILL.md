---
name: busa-client-delivery
description: Client-delivery desk that agents keep current — every client project an agency, studio or consultancy is delivering, with client, service line, account lead, project manager, contract value, last client check-in and five measures (budget burn against work done, milestone slip, age of unbilled work, unsigned scope changes, client pulse), evidence-backed signals, delivery actions and a Monday delivery review. Use when the user asks which client projects are slipping or at risk, how much contract value is at risk, how much work is unbilled or what can be invoiced, which clients have gone quiet, wants projects re-scored from time-tracking, project-plan, accounting, change-order or client check-in data, logs something a client said, plans an action to fix a project, briefs before a client call, or writes or compares the weekly delivery review.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:client-delivery
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-client-delivery
    resources:
      - projects
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Client Delivery Desk

One place where every client project in delivery is scored the same way every week. Each agent
reads its own source — time tracking, the project plan, the accounting system, the change-order
log, client check-ins — and writes a signal with the evidence; the project is re-scored by one
rule; a project that is slipping gets an action while the margin is still there, not after the
final invoice.

```txt
 time tracking ─────┐
 project plan ──────┤
 accounting ────────┤  each agent writes a signal (evidence · its own name)
 change-order log ──┤                    │
 client check-ins ──┘                    ▼
             projects: five measures ──► score 0–100 ──► on track / watch / at risk
                                                              │ red ⇒ action (what is wrong · plan · owner · date)
                                                              │ no check-in in 14 days ⇒ call list
                                                              ▼
     Monday delivery review: contract value at risk, unbilled work, every project at risk, every client gone quiet
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-client-delivery" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `projects`, `signals`, `actions`, `reviews`. If two desks
are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `projects` | One client project in delivery | People own the client, service line, account lead, project manager and contract value; agents keep the check-in date, the five measures, unbilled work and the score current |
| `signals` | One movement of one project's measure, or one note, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done for a project that is slipping or whose client has gone quiet | An agent proposes; a person owns it |
| `reviews` | The weekly delivery review | An agent, every Monday |

### projects

- `name`, `client`, `service` (`web`, `product`, `brand`, `campaign` — rename the choices to your
  own service lines), `account-lead`, `project-manager`.
- `contract-value` — the signed contract value in dollars, including signed change orders.
- `checked-in-on` — the date of the last client check-in, written with `client-pulse`.
- `budget-used-pct` and `complete-pct` — budget spent and work done, both in %, from time tracking
  and the project plan. `unbilled` — delivered work not yet invoiced, in dollars.
- The five measures, numbers only, each from one source:

  | Field | Source | Kept by |
  | --- | --- | --- |
  | `burn-gap` | Time tracking: `budget-used-pct` − `complete-pct`, in percentage points (positive = spending ahead of work done) | Time-tracking agent |
  | `slip-days` | Project plan: days the next milestone is past its planned date (0 when on time) | Project-plan agent |
  | `wip-days` | Accounting system: age in days of the oldest delivered work not yet invoiced | Billing agent |
  | `unsigned-changes` | Change-order log: scope changes requested or being worked on without a signed change order | Contracts agent |
  | `client-pulse` | Client check-in: the client's answer to "how is the project going?", 1–5 | Client-pulse agent |

- `score` (0–100) and `status` (`on-track`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored the project and when. `summary` — one or two
  sentences: where the project stands and why.

### signals

One row per movement: `title` ("Budget ahead of work: +9 → +21 pts"), `project`, `kind` (`budget`,
`schedule`, `billing`, `scope`, `client`, `note`), `recorded-on`, `previous-value`, `new-value` (in
the measure's own unit; no `previous-value` for a first reading), `written-by` (the agent's name
and tool, e.g. `Billing agent · Codex`, or the person's name), `writer` (`agent` or `person`),
`evidence` (what the number is made of — hours, invoice amounts, change-request numbers, what the
client said — in one or two sentences, ending with the source) and `source-url` when there is one.

A `note` has no numbers: a vendor delay, a client reorganisation, something an account lead heard
on a call. It does not change the score by itself — it is often the earliest warning, so read it
when proposing an action.

### actions

`title` (what will be done), `project`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner` (the person who can fix it — the account lead, the project manager or finance),
`due-date`, `proposed-by`, `cause` (what is wrong, from the signals) and `plan` (the concrete steps
and when to re-check).

### reviews

`title` ("Week of Nov 9 – Nov 15"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `value-at-risk` (contract value of the at-risk projects),
`unbilled-total`, `on-track-count`, `at-risk-count`, `checkin-overdue-count`, `written-by`, and
`body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
budget     = burn-gap           ≤ 0   → 20 · ≤ 5   → 12 · ≤ 10  → 6 · else 0
schedule   = slip-days          ≤ 0   → 20 · ≤ 5   → 12 · ≤ 10  → 6 · else 0
billing    = wip-days           ≤ 30  → 20 · ≤ 45  → 12 · ≤ 60  → 6 · else 0
scope      = unsigned-changes   0     → 20 · 1     → 12 · 2     → 6 · else 0
client     = client-pulse       ≥ 4.5 → 20 · ≥ 4.0 → 12 · ≥ 3.5 → 6 · else 0

a part with no reading scores 10          (not measured yet is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → on-track · 50–69 → watch · under 50 → at-risk
```

The app computes the same rule (`model.js#scoreParts`, `#statusFor`) and shows each part's points
on the project's page, so a score that disagrees with its fields is visible at once. Never set a
score or a status by feel.

"Contract value at risk" is the sum of `contract-value` over the at-risk projects. A project with
no client check-in in the last 14 days — or never — is **overdue for a check-in** and goes on the
call list whatever its score: a client who has gone quiet is where the next surprise comes from.

## Workflows

### Scan one source (weekly, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each project whose number moved, write one `signals` row: previous value, new value,
   today, your name in `written-by`, `writer: agent`, and the evidence with hours, amounts or
   change-request numbers. If you cannot reach the source, skip the project and say so — never
   carry an old number forward as if it were new.
3. Update the project's field to the new value (and `checked-in-on` with `client-pulse`; the
   time-tracking agent also keeps `budget-used-pct` and `complete-pct`, the billing agent
   `unbilled`).

### Re-score a project

After any measure changes: compute the five parts and the score by the rule, write `score`,
`status`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If it turned
`at-risk` and has no open action, add one `actions` row with the cause and a concrete plan; the
owner is whoever can fix it.

### Answer "which projects are slipping?"

Read only. Contract value at risk, unbilled work and how many projects are on track; then every
`at-risk` project, lowest score first, with its contract value, the weakest part and the open
action; then every client overdue for a check-in. One screen, numbers first.

### What can we invoice this week?

Read only. Every project with unbilled work, largest first, with the amount, the age of the oldest
piece, and what is blocking the invoice — an unsigned change order, a missing purchase order, or
nothing.

### Brief before a client call

Read only. Client, contract value, budget used against work done, the next milestone, unbilled
work, unsigned scope changes, the client pulse and when we last spoke, the last five signals and
who wrote them, open actions, and three things to raise on the call.

### Write the Monday delivery review

From the records only: headline, contract value at risk and its change since the last review,
unbilled work, how many projects are on track, every at-risk project with what is wrong and the
action, every client overdue for a check-in, and what changed. Write it with `status: draft`; a
person changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Prices, contracts, change orders, invoices, discounts and staffing belong to people. An agent
  never sends an invoice, signs or sends a change order, changes a contract value, or messages a
  client; it proposes, a person acts.
- People are not scored here. Write hours and dates, never a named employee's performance, health
  or personal circumstances.
- Record what a client said as evidence in their words; never guess at a client's mood without a
  check-in behind it.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
