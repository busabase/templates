---
name: busa-okr
description: Company OKR cockpit that every team's agent keeps current — objectives, key results with start/target/current values, evidence-backed check-ins, recovery actions and a Monday business review. Use when the user asks which goals are at risk, wants a team's key results updated from its data, logs a new number, plans a recovery for a red key result, writes or compares the weekly business review, or drafts next quarter's OKRs.
metadata:
  category: management
  tags:
    - surface:busabase
    - workflow:okr
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-okr
    resources:
      - objectives
      - key-results
      - check-ins
      - actions
      - reviews
    risk: gated-write
---

# OKR Cockpit

One place where the whole company's quarter is visible. People set the objectives; each team's
agent keeps its own key results current from its own data, with the evidence behind every number;
the CEO asks one question instead of holding a status meeting.

```txt
 objectives (people) ──► key results (start · target · current · source)
                               ▲                       │
       each team's agent ──────┘ check-in + evidence   ▼
                                                light: on track / watch / at risk
                                                       │ red ⇒ action (cause · plan · owner · date)
                                                       ▼
                               Monday business review ──► the CEO's one question
```

## Find this cockpit — by its stamp, never by name

Install stamps the Folder and every node in it. Resolve them from that stamp; a same-name Base in
another folder is someone else's data.

```bash
npx busabase-cli nodes list --output json | node -e '
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children || [])]);
  const all = walk(JSON.parse(require("fs").readFileSync(0)));
  for (const root of all.filter((n) => n.metadata?.appId === "busa-okr" && n.metadata?.resourceKey === "app-root")) {
    console.log(`cockpit ${root.name} (folder ${root.id})`);
    for (const n of root.children || []) console.log(`  ${n.metadata?.resourceKey}: ${n.type} ${n.baseId || n.id}`);
  }'
```

Each Base is found by its `resourceKey`: `objectives`, `key-results`, `check-ins`, `actions`,
`reviews`. If two cockpits are installed, ask which one before writing.

## The Bases

| Base | One row is | Written by |
| --- | --- | --- |
| `objectives` | A company or team objective for one quarter | People (an agent may draft, a person decides) |
| `key-results` | A measurable result under one objective | Drafted by an agent; values updated by the owning team's agent |
| `check-ins` | One movement of one key result, with evidence | The owning team's agent, or a person |
| `actions` | What will be done about a key result that is off | An agent proposes; a person owns it |
| `reviews` | The weekly business review | An agent, every Monday |

### objectives

- `title` — the objective in plain words, an outcome, not a task ("Keep customers coming back").
- `level` — `company` or `team`. A team objective sets `parent` to the company objective it supports.
- `team` — `company`, `growth`, `sales`, `operations` or `support`. Company objectives use `company`.
- `owner`, `quarter` (`2026-Q4`), `summary` (one or two sentences: where it stands and why).
- `confidence` — the worst light among its own key results. Team objectives under a company
  objective keep their own lights; the company light does not inherit them.

### key-results

- `title` — the result with its number ("Store conversion rate reaches 3.0%").
- `objective` — exactly one objective. `team` and `owner` say who keeps it current.
- `unit` — `$`, `%`, `x`, `/5`, or a plain noun (`stores`, `subscribers`, `SKUs`).
- `direction` — `increase` or `decrease` (lower is better: churn, cost, stock-outs).
- `start-value`, `target-value`, `current-value` — numbers only, in the unit above.
- `source` — where the number comes from. An agent reads this source; it never estimates.
- `status` — the light, set by the rule below. `updated-by` / `updated-on` — the last check-in's writer and date.

### check-ins

One row per movement: `title` ("Paid ads return: 2.05x → 2x"), `key-result`, `checked-on`,
`previous-value`, `new-value`, `written-by` (the agent's name and tool, e.g. `Growth agent · Codex`,
or the person's name), `writer` (`agent` or `person`), `evidence` (what the number is made of, in
one or two sentences, ending with the source) and `source-url` when there is one.

### actions

`title` (what will be done), `key-result`, `status` (`open`, `in-progress`, `done`, `dropped`),
`owner`, `due-date`, `proposed-by`, `cause` (why the result is off, from the evidence) and `plan`
(the concrete steps and when to re-check).

### reviews

`title` ("Week of Oct 27 – Nov 2"), `status` (`draft` / `final`), `period-start`, `period-end`,
`headline` (one sentence), `at-risk-count`, `written-by`, and `body` in Markdown.

## The light — one rule, everywhere

```txt
progress = (current − start) / (target − start)          same formula for "decrease" results
expected = days of the quarter gone / days in the quarter
gap      = expected − progress

gap ≥ 0.30  → at-risk
gap ≥ 0.15  → watch
otherwise   → on-track
```

The app computes the same rule (`model.js#statusFor`) and draws the bar against the expected tick,
so a light that disagrees with its numbers is visible at once. Never set a light by feel.

## Workflows

### Update a team's key results (weekly, per team)

1. Read only the key results whose `team` is yours. Never write another team's rows.
2. For each, read its `source`. If you cannot reach it, skip that key result and say so — do not
   carry the old number forward as if it were new.
3. Write one `check-ins` row: previous value, new value, today, your name in `written-by`,
   `writer: agent`, and the evidence.
4. Update the key result: `current-value`, `status` by the rule, `updated-by`, `updated-on`.
5. If the light turned `at-risk` and no open action exists for it, add one `actions` row with the
   cause and a concrete plan; leave `owner` as the key result's owner.
6. Recompute the parent objective's `confidence`.

### Answer "which goals are at risk?"

Read only. Overall progress (average of key results, each clamped to 0–1) against expected; then
every `at-risk` and `watch` key result, worst gap first, with its last evidence and open action.
One screen, numbers first.

### Write the Monday business review

From the records only: headline, overall progress vs. expected, each team in two lines, every red
and yellow key result with cause and action, and what changed since the previous review. Write it
with `status: draft`; a person changes it to `final`.

### Draft next quarter's OKRs

At most three company objectives; each team objective supports one of them; two to four key
results each, every one with a start, a target, a unit, a direction and a data source. Show the
draft and wait for the person before writing.

## Boundaries

- Write only through change requests and leave `autoMerge` unset; Busabase decides from the
  writer's permission whether it lands or waits.
- Objectives belong to people. An agent may draft them; it never changes a target or deletes an
  objective on its own.
- Never edit a past check-in to change history; write a new one that corrects it.
- The app reads only. It sends nothing outside Busabase.
