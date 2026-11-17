---
name: busa-live-commerce
description: Live-commerce desk that agents keep current — every live-selling session on TikTok Shop, Douyin, Taobao Live, Kuaishou, Xiaohongshu or Shopee Live from two weeks before it airs to 30 days after, with host, producer, hero product, GMV target and five measures (stock in the warehouse, pre-live checklist, GMV vs target, viewer conversion, 7-day refunds), evidence-backed signals, live actions and a Monday live review. Use when the user asks which live sessions are slipping or at risk, what goes live soon without stock or a finished checklist, how GMV compares with target, wants sessions re-scored from warehouse, run-of-show, shop-analytics or after-sales data, logs something noticed about a session, plans an action to fix one, briefs before or after a session, checks go-live readiness, or writes or compares the weekly live review.
metadata:
  category: ecommerce
  tags:
    - surface:busabase
    - workflow:live-commerce
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-live-commerce
    resources:
      - sessions
      - signals
      - actions
      - reviews
    risk: gated-write
---

# Live Commerce Desk

One place where every live-selling session is scored the same way, from two weeks before it airs
to 30 days after. Each agent reads its own source — the warehouse system, the run-of-show
checklist, shop analytics, orders and returns — and writes a signal with the evidence; the session
is re-scored by one rule; a session that is about to go live without its stock gets an action
before the host is on air, not in the post-mortem.

```txt
 warehouse system ──────┐
 run-of-show checklist ─┤  each agent writes a signal (evidence · its own name)
 shop analytics ────────┤                    │
 orders & returns ──────┘                    ▼
               sessions: five measures ──► score 0–100 ──► on track / watch / at risk
                                                                │ red, or live soon and not ready
                                                                ▼   ⇒ action (what went wrong · plan · owner · date)
                 Monday live review: GMV vs target, every session at risk, what goes live not ready
```

## Find this desk — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-live-commerce" && n.metadata?.resourceKey === "app-root")) {
    console.log(`desk ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `sessions`, `signals`, `actions`, `reviews`. If two desks
are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `sessions` | One live session, from two weeks before it airs to 30 days after | People own the channel, host, producer, live date, hero product and GMV target; agents keep the five measures, the GMV and the score current |
| `signals` | One movement of one session's measure, or one note, with evidence | The agent that reads that source, or a person |
| `actions` | What will be done for a session that is slipping or not ready | An agent proposes; a person owns it |
| `reviews` | The weekly live review | An agent, every Monday |

### sessions

- `title`, `channel` (`tiktok-shop`, `douyin`, `taobao-live`, `kuaishou`, `xiaohongshu`,
  `shopee-live` — rename the choices to your own channels), `host`, `producer` (the person who runs
  the session and owns its actions), `slot`, `hero-product`.
- `live-date` and `target-gmv` — they come from the producer; an agent never changes them. A row
  stays on the desk until 30 days after it airs; after that, archive it.
- `gmv` — GMV in dollars after cancellations, from shop analytics, once the session has aired.
- The five measures, numbers only, each from one source:

  | Field | Source | Read | Kept by |
  | --- | --- | --- | --- |
  | `stock-pct` | Warehouse system: units in the warehouse for the session's products, of the units planned, in % | Before it airs; final at the start of the session | Inventory agent |
  | `prep-pct` | Run-of-show checklist: script, product cards, coupons and vouchers, samples on set, audio and network checks — items done, in % | Before it airs | Producer agent |
  | `gmv-pct` | Shop analytics: `gmv` ÷ `target-gmv`, in %, rounded | The day after it airs, then after cancellations | Shop-analytics agent |
  | `conversion-pct` | Shop analytics: buyers ÷ unique viewers, in % | The day after it airs | Shop-analytics agent |
  | `refund-pct` | Orders and returns: orders refunded within 7 days of the session, in %; empty until the window closes or a refund trend is clear | Up to 7 days after it airs | After-sales agent |

- `score` (0–100) and `status` (`on-track`, `watch`, `at-risk`) — set by the rule below.
  `scored-by` / `scored-on` — who last scored it and when. `summary` — one or two sentences: where
  the session stands and why.

### signals

One row per movement: `title` ("Stock in the warehouse: 100% → 80% of planned units"), `session`,
`kind` (`stock`, `prep`, `gmv`, `conversion`, `refund`, `note`), `recorded-on`, `previous-value`,
`new-value` (in %; no `previous-value` for a first reading), `written-by` (the agent's name and
tool, e.g. `Inventory agent · Codex`, or the person's name), `writer` (`agent` or `person`),
`evidence` (what the number is made of — PO, shipment, order or checklist item numbers — in one or
two sentences, ending with the source) and `source-url` when there is one.

A `note` has no numbers: a customs hold, a carrier problem, a platform rule change, something a
producer or host noticed. It does not change the score by itself — it is often the earliest
warning, so read it when proposing an action.

### actions

`title` (what will be done), `session`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner` (the person who can fix it — the producer, operations, the warehouse, never the host on
air), `due-date` (before the live date, for anything that must be ready on air), `proposed-by`,
`cause` (what went wrong or what is missing, from the signals) and `plan` (the concrete steps and
when to re-check).

### reviews

`title` ("Week of Nov 2 – Nov 8"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `week-gmv` (GMV of the sessions that aired in the week),
`on-track-count`, `at-risk-count`, `not-ready-count`, `written-by`, and `body` in Markdown.

## The score — one rule, everywhere

Five parts, 20 points each:

```txt
stock        = stock-pct        ≥ 100 → 20 · ≥ 90 → 12 · ≥ 75 → 6 · else 0
checklist    = prep-pct         ≥ 100 → 20 · ≥ 90 → 12 · ≥ 75 → 6 · else 0
GMV          = gmv-pct          ≥ 100 → 20 · ≥ 85 → 12 · ≥ 70 → 6 · else 0
conversion   = conversion-pct   ≥ 4   → 20 · ≥ 3  → 12 · ≥ 2  → 6 · else 0
refunds      = refund-pct       ≤ 5   → 20 · ≤ 8  → 12 · ≤ 12 → 6 · else 0

a part with no reading scores 10          (not measured yet is neither good nor bad)

score = sum of the five parts, 0–100
score ≥ 70 → on-track · 50–69 → watch · under 50 → at-risk
```

So a session that has not aired yet, with all its stock in and the checklist done, scores
20 + 20 + 10 + 10 + 10 = 70: on track. The conversion and refund bands suit beauty and home goods;
a team selling other categories may change them, in this file and in `model.js#scoreParts`
together. The app computes the same rule (`model.js#scoreParts`, `#statusFor`) and shows each
part's points on the session's page, so a score that disagrees with its fields is visible at once.
Never set a score or a status by feel.

"Going live soon" means the live date is within 7 days. Any session going live soon whose
`stock-pct` is below 100 is **not ready** and needs attention whatever its status: selling out on
air and waitlisting buyers is the most expensive live-commerce failure there is.

## Workflows

### Scan one source (weekly, or the day after a session, per agent)

1. Read only your own source, and write only the field that source keeps (table above).
2. For each session whose number moved, write one `signals` row: previous value, new value, today,
   your name in `written-by`, `writer: agent`, and the evidence with PO, shipment, order or
   checklist item numbers. If you cannot reach the source, skip the session and say so — never
   carry an old number forward as if it were new.
3. Update the session's field to the new value (and `gmv` with `gmv-pct`).

### Re-score a session

After any measure changes: compute the five parts and the score by the rule, write `score`,
`status`, `scored-by`, `scored-on`, and rewrite `summary` in one or two sentences. If it turned
`at-risk`, or goes live within 7 days and is not ready, and has no open action, add one `actions`
row with the cause and a concrete plan; the owner is whoever can fix it.

### Answer "which sessions are slipping?"

Read only. GMV in the last 30 days against target and how many sessions are on track; then every
`at-risk` session, nearest to today first, with the score, the weakest part and the open action;
then every session going live within 7 days that is not ready, and what is missing. One screen,
numbers first.

### Check go-live readiness

Read only. Every session going live within 7 days, soonest first: what is still missing (stock,
product cards, coupons, script, samples, audio or network checks), who owns each gap, and whether
it will be fixed before the session airs.

### Brief before or after a session

Read only. Channel, host, live date, hero product, GMV against target, the score with each part,
the last five signals and who wrote them, open actions, and two things to fix before the next
session.

### Write the Monday live review

From the records only: headline, GMV in the week against target and its change since the last
review, how many sessions are on track, every at-risk session with what went wrong and the action,
every session going live within 7 days that is not ready, and what changed. Write it with
`status: draft`; a person changes it to `final`.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Prices, discounts, coupons, GMV targets, live dates, hosts and stock orders belong to people. An
  agent never changes them, never places a purchase or transfer order, never publishes a coupon or
  a product card, and never posts in a live room, replies to a buyer or issues a refund; it
  proposes, a person acts.
- Buyers are not records here. Write counts and rates; never paste a buyer's name, address, phone
  number or order message into a signal.
- Never edit a past signal to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
