---
name: busa-agent-shelf
description: Agent shelf / agentic commerce optimization desk (Busabase App-in-Skill) for e-commerce and DTC sellers — tracks whether AI shopping agents (ChatGPT, Gemini, Meta Muse, Amazon Rufus, Perplexity) recommend your products for the questions buyers actually ask, records who they pick instead and why, and turns each gap into a sourced, reviewable listing fix. Use when the user invokes $busa-agent-shelf or /busa-agent-shelf, asks about agentic commerce optimization (ACO), AI shopping agent visibility, "does ChatGPT / Muse / Rufus recommend my product", share of shelf in AI answers, why a competitor gets recommended, 智能体电商优化, AI 购物助手推荐, 被 AI 推荐, or wants product-data fixes reviewed before they reach a store.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - industry:ecommerce
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-agent-shelf
    resources:
      - questions
      - observations
      - competitors
      - fixes
      - settings
    risk: gated-write
---

# Busa Agent Shelf

## Overview

When a shopper asks an AI agent for "a carry-on that works for two kids on a
long flight", the agent reads structured product data — attributes, price,
availability, reviews, warranty — and returns two or three answers. The
product record has become the storefront, and a seller who is not in those
answers never gets the click.

Busa Agent Shelf is where a seller watches that shelf and fixes what it
shows. It keeps the buyer questions worth winning, what each shopping agent
answered on each check, the competitors picked instead and what their
listings carry, and a review queue of proposed product-data changes. Agents
do the volume — asking, recording, comparing, drafting fixes. A person
decides which fixes become true, because a buying agent repeats whatever the
listing says as fact.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling, AirApp
   runtime limits, security, validation, and deployment.

If a dependency is unavailable, stop before the Busabase operation and report
the exact missing dependency. Do not invent a second data backend.

## Boundary

- **The AirApp never contacts a shopping agent.** It reads Busabase records
  and records a person's decision on a listing fix. Asking ChatGPT, Gemini,
  Meta Muse, Amazon Rufus or Perplexity is done by the operator's agent,
  through the product's normal user interface or an official API the
  operator is entitled to use. Do not build scrapers, rotate accounts, or
  automate at a volume that breaks a platform's terms.
- **Never invent an observation.** `our-position`, `picked-instead` and
  `reason-given` must come from an answer that was actually returned, with an
  `answer-excerpt` and, when available, an `evidence-url` or screenshot link.
  If an agent refused or gave no product answer, record position `0` and say
  so in the excerpt.
- **Answers vary between runs.** Treat one check as a sample, not a verdict.
  Compare checks over time; do not propose a fix from a single answer unless
  the gap is also visible in the listing itself.
- **The AirApp only decides.** Its single write is a ChangeRequest that sets a
  listing fix's `status` (`approved` / `changes-requested` / `blocked`) and
  `decision-note`. It never creates questions, answers, competitors or fixes,
  and never edits a store, marketplace, or catalog.
- **Only approved fixes are applied.** Applying a fix to Shopify, Amazon, a
  PIM or any other system is done by the operator's agent outside the app,
  after the fix is `approved`, and is then recorded as `applied` with
  `applied-on`. Never apply `proposed`, `changes-requested` or `blocked`
  fixes.
- **Every proposed value needs a source.** A fix without a document, page or
  measurement behind its `proposed-value` is a claim; leave `source` empty or
  `(none)` so the app flags it, and mark risk `high`. Never copy a
  competitor's number (a weight, a warranty term, a "40% more space") onto
  our listing because it helped them rank.
- No marketplace or agent credentials live in this template or in Busabase
  records. Never commit exports, cookies or tokens.

## Busabase Resources

Five Bases under one application Folder (`busa-agent-shelf`), declared in
`content/busa-agent-shelf-app/app/js/config.js` and mirrored in the template
sidecars under `content/`:

- `questions` (Buyer Questions): the shopping questions worth winning, in the
  buyer's own words. `market`, `intent` (discover / compare / buy),
  `priority`, `target-products` (the SKUs that should be the answer, as text),
  `status` (tracking / paused).
- `observations` (Agent Answers): one row per question × shopping agent ×
  check. `question` relates to Buyer Questions; `agent`; `checked-on`;
  `our-position` (1 = first; **0 = not shown**); `our-product`;
  `picked-instead` (ranked list as text); `reason-given` (the agent's stated
  reason for its top picks); `answer-excerpt`; `evidence-url`.
- `competitors`: products agents pick instead of ours. `times-picked` counts
  appearances across recent checks; `what-they-have` lists what their listing
  states that ours does not.
- `fixes` (Listing Fixes): the review queue. One row changes **one field of
  one product**: `product` (SKU), `gap-type`, `field-name`, `current-value`,
  `proposed-value`, `source`, `evidence` (which answers exposed the gap),
  `risk`, `status` (proposed → approved / changes-requested / blocked →
  applied), `decision-note`, `applied-on`. `question` optionally relates to
  the buyer question the fix is meant to win.
- `settings`: one row — `brand`, `agents` to check, `cadence`, and the
  `review-policy` in plain words.

Share of shelf is derived, never stored: for each agent, the share of
tracking questions where `our-position > 0` on the latest `checked-on` date,
compared with the previous check date.

## Workflow

1. **Set up.** Fill the Settings row: brand, agents to check, cadence, review
   policy. Add 5–20 buyer questions — real phrasing from reviews, support
   tickets, search terms — each with the SKUs that should answer it.
2. **Check.** On each cadence, ask every `tracking` question in each agent
   from Settings, in a fresh session with no brand hint in the prompt. Write
   one `observations` row per question × agent with the same `checked-on`
   date for the whole run.
3. **Compare.** Update `competitors` from `picked-instead`. For each question
   where we rank low or are not shown, read `reason-given` next to our own
   listing and name the concrete difference (a missing attribute, an
   unsupported claim, a price mismatch across channels, stock status,
   reviews, shipping or returns information).
4. **Propose.** Create one `fixes` row per field, `status: proposed`, with
   current and proposed value, the source, and the observation rows that
   justify it in `evidence`. Set `risk: high` for price, warranty,
   certification, safety or compatibility wording, and for any fix without a
   source.
5. **Decide.** The operator reviews in the AirApp's Listing fixes screen and
   approves, requests changes, or blocks, with a note.
6. **Apply.** For `approved` fixes only, the operator's agent makes the change
   in the store or catalog, then sets `status: applied` and `applied-on`.
7. **Re-check.** The next check shows whether the fix moved the position.
   Report movement per question and agent; do not claim causation from one
   run.

## Local App

Default behavior is AirApp-first — give the user the clickable AirApp URL.
Start `pnpm --dir content/busa-agent-shelf-app dev` only when local preview or
debugging is explicitly requested.

Views (hash routes): `#/overview` (share of shelf per agent with change since
the previous check, what needs attention, fixes waiting), `#/questions`
(question × agent grid of latest positions), `#/answers` (every check with
excerpt and reason), `#/competitors`, `#/fixes` (the review queue: current →
proposed, source, evidence, risk; approve / request changes / block), and
`#/settings`.

`?demo=1` opens deterministic demo data (the same rows as the template's
sample records) and never reads or writes Busabase; decisions in demo mode
change in-memory state only.

## Safety Defaults

- Record what the agent answered, not what we hoped it would answer.
- One field per fix, one source per value; unsourced means high risk.
- Price, warranty, certification and compatibility changes always wait for a
  person, whatever the review policy says about copy edits.
- Keep `checked-on` identical across one run so trends compare like with like.
- Use stable record keys so repeated writes are idempotent.

In normal use, invoke `/busa-agent-shelf` and open the AirApp.
