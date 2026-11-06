---
name: IC Memo and Diligence Playbook
description: The desk's fixed method — the PE workstream checklist, the evidence discipline, the severity rubric, and the IC memo skeleton every memo is drafted to. The skill governs day-to-day work; this doc is the standard the memos are judged against.
position: 5
agentPrompts:
  - key: draft-ic-memo
    label: "Draft the IC memo for a target"
    intent: change
    body: "Read the `busa-pe-diligence` skill in this folder and follow its workflow, then draft the IC memo for the target I name, to this doc's skeleton: thesis, QoE conclusions, verified facts, red flags, unverified items, valuation and deal-structure protections, exit path. State only verified facts as facts; everything unverified goes in the Unverified section, named as such. Show me the draft before proposing it."
  - key: memo-gap-check
    label: "What is this memo still missing?"
    intent: read-only
    body: "Read the `busa-pe-diligence` skill in this folder, then check the target I name against this playbook: which workstreams have no reviewed request yet, which memo sections would have to be written from unverified material, and which findings have no impact statement. Do not change anything."
---

# IC Memo and Diligence Playbook

This is the desk's standard, kept in one place so every deal is diligenced
the same way and every memo can be compared with the last. The skill in this
folder governs how the work is done; this doc governs what "done" means.

## 1. The evidence discipline

1. **No evidence, no conclusion.** A statement about the target is a *claim*
   until a row in the Evidence Register backs it, and a *fact* only when that
   row is marked Verified against a primary source.
2. Management figures are claims. Seller materials are claims. Press numbers
   are claims with a date on them. Filings, audited statements and signed
   documents are primary sources.
3. Every finding links the evidence behind it. A concern with no evidence
   behind it is logged as an unverified item, never as a finding.
4. Where evidence contradicts a claim, the claim does not get quietly
   dropped — it becomes a finding, with the contradiction stated.

## 2. The nine workstreams

Every target gets the full list; depth varies, coverage does not.

- **Corporate** — structure, cap table, ownership, constitutional documents,
  material contracts, related parties.
- **Financial / QoE** — audited statements, earnings quality, EBITDA
  adjustments, cash conversion, working capital, debt and off-balance-sheet
  items, forecast credibility.
- **Tax** — filing history, open enquiries, transfer pricing, the tax cost of
  the proposed structure.
- **Legal & Compliance** — litigation, regulatory history, licences,
  employment exposure, anti-corruption, data and sector regulation.
- **Commercial** — market size and growth, customer concentration, churn and
  cohort behaviour, pricing power, the pipeline's honesty.
- **Operations** — supply chain, capacity, key-person and key-supplier
  dependence, capex needs, what breaks at 2x volume.
- **HR & Org** — org chart reality vs paper, retention of the people the
  thesis depends on, incentive alignment, culture findings from site visits.
- **Tech & IT** — architecture, technical debt, security posture, licence
  and IP ownership, what the systems can and cannot report.
- **ESG** — environmental liabilities, safety record, governance quality —
  anything that becomes the buyer's problem at signing.

## 3. Severity rubric

- **Critical** — changes the decision: the thesis fails, or the price is
  wrong by a material amount, or a liability arrives with the asset.
  A critical finding that cannot be mitigated is a deal-breaker.
- **High** — changes the price or the structure: earn-outs, warranties,
  escrows, conditions precedent, or a lower underwriting case.
- **Medium** — changes the underwriting assumptions: margins, growth,
  capex, working capital. Priced in, not negotiated over.
- **Low** — noted, monitored, owned by someone with a date.

Severity is about consequence, not about how surprising the finding was.

## 4. IC memo skeleton

Draft every memo to these sections, in this order:

1. **Investment thesis** — why this company, why now, why us — in claims
   language, each claim footnoted to its evidence or marked unverified.
2. **QoE conclusions** — reported vs adjusted earnings, every adjustment
   named, the cash story, the debt story.
3. **Verified facts** — only what the Evidence Register marks Verified.
4. **Red flags** — open findings by severity, each with its impact on
   valuation or terms and its owner.
5. **Unverified** — everything the committee is being asked to believe
   without primary evidence, and what would verify it.
6. **Valuation and deal-structure protections** — price basis, and the
   warranties, conditions, escrows or earn-outs the findings demand.
7. **Exit path** — who buys this, or what it becomes, and what has to be
   true for that to work.

A memo that cannot fill a section says so, in that section. An empty
section presented as complete is the one unforgivable defect.

## 5. Red lines

- Never contact the target company, its customers, or anyone outside the
  deal team from this desk.
- Never present management or seller figures as audited.
- Never state a valuation conclusion the evidence does not carry.
- The desk records diligence. The decision belongs to the committee.
