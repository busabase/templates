---
name: IC Memo and Diligence Playbook
description: How this desk runs VC diligence, workstream by workstream, and the fixed skeleton of the investment-committee memo it produces. The agent reads this before opening a target or drafting a memo; where a habit conflicts with it, this doc wins.
position: 5
agentPrompts:
  - key: draft-ic-memo
    label: "Draft the IC memo for a target"
    intent: change
    body: "Read the `busa-vc-diligence` skill in this folder and follow its workflow, then draft the IC memo for the target I name using this doc's skeleton: Thesis, Market, Team, Verified facts, Red flags, Unverified, Terms. Pull Verified facts only from evidence marked Verified, list every open Critical and High finding under Red flags, and put everything still resting on reported or company-stated figures under Unverified. Leave the recommendation blank — that is the committee's, not yours."
  - key: playbook-for-workstream
    label: "What does the playbook require for this workstream?"
    intent: read-only
    body: "Read the `busa-vc-diligence` skill in this folder, then tell me what this playbook requires for the workstream I name: the standard requests, what counts as verified, and what blocks IC. Do not change anything."
---

# Diligence Playbook & IC Memo

This doc is the desk's standard: how diligence is run here, and the shape of
the memo it produces. The agent reads it before opening a target and before
drafting any memo. Sections marked "(to fill)" are the fund's own calls —
thresholds, check sizes, concentration limits. An empty threshold is no
threshold: fill them before the desk's first live target.

## 1. The one rule

**No evidence, no conclusion.** Everything a company, a founder, a reference
or a press report says enters this desk as a *claim*. A claim becomes a fact
only when an Evidence Register row behind it says **Verified**. A claim that
conflicts with evidence becomes a finding. A claim nobody has checked stays
visible under **Unverified** — it is never silently promoted, and never
silently dropped.

## 2. How a target moves

1. **Sourced → Screening.** A partner has read the basics and can state the
   thesis in two sentences. Open the request list.
2. **Screening → Diligence.** The thesis survives first contact: market is
   real, team is credible, no obvious deal-breaker. Build the full request
   list by workstream and mark what gates IC as Critical.
3. **Diligence → IC.** Every Critical request is Reviewed or explicitly
   Waived by a partner; every Critical and High finding is resolved,
   mitigated, priced into terms, or carried into the memo as an open risk.
   The memo is drafted from the Bases, not from memory.
4. **IC → Term Sheet / Passed.** The committee decides. The decision, the
   dissent and the conditions are recorded on the target row. A pass keeps
   its reason — a Passed row with no reason teaches the desk nothing.

## 3. Workstream standards (VC weighting)

- **Corporate & Cap Table.** Full cap table, prior-round documents,
  preference stack, option pool and vesting. Watch for: ratchets and side
  letters that change what a headline valuation means.
- **Team.** Founders' history together, key-person concentration, vesting
  status, and whether the org chart the company shows matches the headcount
  it claims. Headcount is a fact only from a primary source.
- **Market.** Bottom-up sanity over top-down claims: who pays, how many of
  them exist, what the company itself uses as its denominator. Third-party
  traffic or usage estimates are corroboration, never proof.
- **Product & Tech.** What is proprietary, what is rented from model or
  cloud providers, and what breaks if a supplier changes price or terms.
- **Business & Traction.** Cohort retention before growth headlines.
  Reported ARR growth means little until the desk has seen cohorts,
  concentration and expansion from the company's own data.
- **Financials.** Audited statements where they exist; management accounts
  and burn where they do not. A figure is *audited*, *management-reported*
  or *press-reported* — the memo must say which, every time.
- **Legal.** IP ownership and assignment from founders and contractors,
  material litigation, and sector-specific exposure (for AI companies:
  training-data provenance and publisher/content disputes).
- **Terms.** What the last rounds actually promised, what this round must
  protect, and which findings should convert into structure — preferences,
  tranching, information rights, conditions precedent.

## 4. Severity rubric

- **Critical** — if confirmed, it changes the decision or kills the deal.
- **High** — it moves price, structure or terms materially.
- **Medium** — it needs resolution, a protective term, or an explicit
  partner decision to accept.
- **Low** — noted and monitored; it does not block anything.

A finding about an unconfirmed figure is a *verification question*: phrase
it as what is not yet known and what would settle it — never as an adverse
conclusion about the company.

## 5. Fund thresholds (to fill)

- Maximum single-customer revenue concentration: (to fill)
- Minimum runway post-round: (to fill)
- Maximum entry multiple the fund will underwrite on reported figures:
  (to fill)
- Findings that are automatic deal-breakers: (to fill)

## 6. IC memo skeleton

Draft from the Bases in exactly this shape. Sections may be short; none may
be silently omitted — an empty section says "not examined", in words.

1. **Thesis** — why this company, why now, in the fund's own words.
2. **Market** — the opportunity as the evidence supports it, with the
   company's market claims separated from corroborated ones.
3. **Team** — who they are, what is verified about them, what rests on
   references alone.
4. **Verified facts** — only claims backed by evidence marked Verified,
   each with its source. If a number is not here, it is not a fact.
5. **Red flags** — every open Critical and High finding, with severity,
   the evidence behind it, and what would resolve it.
6. **Unverified** — the load-bearing claims still resting on reported or
   company-stated figures: reported revenue, self-described metrics,
   third-party estimates that conflict. Name the request that would
   settle each one and its status.
7. **Terms** — proposed structure, and how each open finding is priced,
   conditioned or accepted.
8. **Recommendation** — *left blank in every draft.* The committee writes
   this. The desk's job is that nothing the committee needs is missing,
   mislabelled or hiding in a chat thread.
