---
name: busa-agent-orders
description: Agent-channel orders and price guardrails desk (Busabase App-in-Skill) for e-commerce sellers whose products are bought by AI shopping agents — orders by agent channel (Meta Muse, ChatGPT, Gemini, Perplexity) with the price paid versus the price listed, per-SKU price guardrails, a review queue for agent-proposed price changes, and order exceptions such as sold below floor or a channel price mismatch. Use when the user invokes $busa-agent-orders or /busa-agent-orders, asks about agentic commerce orders, orders from Meta Muse / ChatGPT checkout / Gemini, AI agent sales by channel, repricing agent approvals, price floors or MAP-style guardrails, "an agent bought at the wrong price", 智能体订单, 智能体渠道销售, 改价审批, 价格护栏, or channel price consistency.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - industry:ecommerce
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-agent-orders
    resources:
      - orders
      - guardrails
      - proposals
      - exceptions
      - settings
    risk: gated-write
---

# Busa Agent Orders

## Overview

Once an AI shopping agent can check out on a buyer's behalf, a price is no
longer something a person reads and questions. It is an instruction the agent
executes. A stale promo price on one channel, or a repricing agent that
matched a competitor below cost, turns into paid orders before anyone looks.

Busa Agent Orders keeps the agent channel honest. It records the orders agents
bring in with the price paid and the price listed at that moment, per-SKU
guardrails every price must stay inside, a review queue for price changes a
repricing agent proposes, and the exceptions where an order went through as it
should not have. Agents do the volume — importing orders, spotting mismatches,
proposing prices. A person decides which prices become real and how each
exception is closed.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling, AirApp
   runtime limits, security, validation, and deployment.

If a dependency is unavailable, stop before the Busabase operation and report
the exact missing dependency. Do not invent a second data backend.

## Boundary

- **The AirApp never touches a store, a payment, or a price.** It reads
  Busabase records and records a person's decision. Its writes are
  ChangeRequests that set a price proposal's `status` and `decision-note`, or
  an exception's `status` and `resolution`. It never creates orders,
  guardrails, proposals or exceptions.
- **Orders come from the operator's systems.** The operator's agent imports
  them from a store export or an API the operator is entitled to use. Record
  what the order says; never infer the agent channel from guesswork. If the
  source does not identify the agent, use `other`.
- **Only approved proposals are applied.** Changing a price in Shopify, a
  marketplace, or an agent checkout is done by the operator's agent outside
  the app, after the proposal is `approved`, and is then recorded as
  `applied` with `applied-on`. Never apply `proposed`, `changes-requested` or
  `blocked` proposals.
- **Guardrails are not advisory.** A proposal that breaches a guardrail must
  say so in `breaches`, whatever the reason. Never lower a floor or widen a
  step limit to let a proposal through; propose the guardrail change
  separately and let a person decide.
- **Refunds, disputes and chargebacks are handled in the store or payment
  provider.** This app only records that they happened and how they were
  closed.
- No store, payment or agent credentials live in this template or in Busabase
  records. Never commit exports, tokens or card data.

## Busabase Resources

Five Bases under one application Folder (`busa-agent-orders`), declared in
`content/busa-agent-orders-app/app/js/config.js` and mirrored in the template
sidecars under `content/`:

- `orders` (Agent Orders): one row per order line that arrived through an AI
  shopping agent. `order-no`, `agent` (meta-muse / chatgpt / gemini /
  perplexity / other), `store`, `sku`, `quantity`, `paid-price` (unit price
  the buyer paid), `listed-price` (the store's price at order time),
  `currency`, `ordered-on`, `status` (paid / fulfilled / refunded /
  disputed).
- `guardrails` (Price Guardrails): one row per SKU — `floor-price`,
  `ceiling-price`, `max-change-pct` per step, `same-price-everywhere`,
  `owner`.
- `proposals` (Price Proposals): the review queue. One row per SKU:
  `current-price`, `proposed-price`, `channels`, `reason`, `source`,
  `breaches` (every guardrail it crosses, in plain words; empty means none),
  `status` (proposed → approved / changes-requested / blocked → applied),
  `decision-note`, `applied-on`.
- `exceptions` (Order Exceptions): orders that should not have gone through as
  they did. `order` relates to Agent Orders; `type` (below-floor /
  channel-mismatch / out-of-stock / refund-dispute), `sku`, `detected-on`,
  `impact` (signed amount in the store currency), `status` (open / resolved /
  accepted), `resolution`.
- `settings`: one row — `store-name`, `agent-channels`, `currency`,
  `review-policy`.

Channel totals, week-over-week change and guardrail checks are derived in the
app from these rows; they are never stored.

## Workflow

1. **Set up.** Fill Settings. Add a guardrail for every SKU that sells through
   an agent channel.
2. **Import.** On a regular cadence, import agent-channel orders with both
   `paid-price` and `listed-price`. Upsert by `order-no` + `sku`.
3. **Detect.** For each order paid below its listed price or below the SKU's
   floor, or where channels showed different prices, open an `exceptions`
   row with its impact, unless one exists.
4. **Propose.** When a repricing agent (or a person) wants a price change,
   write a `proposals` row with the reason, the source, and every breached
   guardrail.
5. **Decide.** The operator approves, requests changes, or blocks proposals,
   and resolves or accepts exceptions, in the AirApp.
6. **Apply.** For `approved` proposals only, the operator's agent changes the
   price in the named channels, then sets `status: applied` and `applied-on`.

## Local App

Default behavior is AirApp-first — give the user the clickable AirApp URL.
Start `pnpm --dir content/busa-agent-orders-app dev` only when local preview or
debugging is explicitly requested.

Views (hash routes): `#/overview`, `#/orders`, `#/proposals`, `#/exceptions`,
`#/guardrails`, `#/settings`. `?demo=1` opens deterministic demo data (the same
rows as the template's sample records) and never reads or writes Busabase.

## Safety Defaults

- Record the price the agent actually paid, never the price you meant.
- A proposal that breaches a guardrail always waits for a person.
- One SKU per proposal; the source is required for anything below the
  current price.
- Use stable keys (`order-no` + `sku`) so repeated imports are idempotent.

In normal use, invoke `/busa-agent-orders` and open the AirApp.
