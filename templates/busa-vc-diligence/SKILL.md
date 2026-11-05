---
name: busa-vc-diligence
description: Due-diligence desk for a VC investment team on Busabase — a target pipeline, a diligence request list by workstream, an evidence register that keeps every claim labelled verified, unverified or contradicted, findings and red flags tied to evidence, interviews and references logged as claims, and an IC memo drafted from the record. Use when the user invokes $busa-vc-diligence or /busa-vc-diligence, mentions due diligence or DD on a startup, opening diligence on a company, a data-room or request list, checking a company's claims, red flags, reference calls, or drafting an investment-committee (IC) memo.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-vc-diligence
    resources:
      - targets
      - diligence-requests
      - evidence
      - findings
      - interviews
    risk: gated-write
---

# Busa VC Diligence

## Overview

Busa VC Diligence is a Busabase-backed due-diligence desk for a venture
investment team. It exists to turn "getting to know a company" into a record
chain an investment committee can trust:

**Claim → Evidence → Verification → Finding → Decision.**

Everything a target company, a founder, a reference or a press report says
enters the desk as a *claim*. A claim becomes a fact only when an Evidence
Register row behind it is marked **Verified**. A claim that conflicts with
evidence becomes a **Finding**. A claim nobody has checked stays listed as
**Unverified** — visible, owned, and never silently promoted. By IC day,
nothing load-bearing lives in someone's chat history or inbox: it is in one
of the five Bases, with its status on it.

The desk runs one loop, **Open · Request · Verify · Flag · Memo**:

1. **Open.** A target enters Targets with a two-sentence thesis and a stage.
2. **Request.** The agent builds the request list by workstream — what the
   company must produce, marked Critical where it gates IC.
3. **Verify.** Material that arrives is registered in the Evidence Register
   with source, date and verification status. Interviews are logged the
   same way: as sources of claims, tested against the register.
4. **Flag.** Mismatches, gaps and uncomfortable arithmetic become Findings,
   each linked to its evidence, severity-rated, and left Open until a human
   resolves, mitigates, prices or accepts them.
5. **Memo.** The IC memo is drafted from the Bases in the fixed skeleton
   the Playbook doc carries — Verified facts, Red flags and Unverified in
   separate sections, recommendation left blank for the committee.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node
   discovery, ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling and the
   template/package contract.

If a dependency is unavailable, preserve this skill's local artifact and
product contracts, stop before the unavailable Busabase operation, and
report the exact missing dependency.

## Boundary

- **This desk never contacts anyone.** It does not email, message or call
  the target company, its founders, its customers, experts or references —
  not to chase documents, not to book calls, not to "help move things
  along". Humans run every external conversation; the desk records what
  comes back.
- **Reported is not audited, and company-stated is not verified.** Never
  present a press-reported, founder-stated or third-party-estimated figure
  as an audited or verified fact — in a record, in a memo, or in chat.
  Every figure keeps its provenance: audited, management-reported,
  press-reported, or company-claimed.
- **No investment recommendations.** The desk records diligence; it never
  says invest or pass, never fills in the memo's Recommendation section,
  and never prices a deal. Severity ratings and findings inform the
  committee — the committee decides.
- **Findings about unconfirmed figures are questions, not conclusions.**
  Phrase them as what is not yet known and what would settle it. An open
  verification question must never be written, summarised or repeated as
  an adverse finding about a company.
- **No fabricated data.** If a document has not been received, its contents
  do not exist for this desk. Estimates from third-party databases are
  labelled as such and never averaged into a single "true" number.
- **Writes follow the person's own permission.** Propose changes through
  ChangeRequests with `autoMerge` omitted; a write that lands as a pending
  ChangeRequest is reported as waiting, never quietly treated as done, and
  the agent never approves or merges its own proposals.
- **Sensitive by default.** Diligence material is confidential deal
  information. Never copy it outside the desk's Folder, and never commit
  real deal terms, credentials or tokens into this package.

## Busabase Resources

Five Bases, one Doc and one AirApp under one application Folder
(`busa-vc-diligence`), declared under `content/`.

- `busa-vc-diligence-app` (Diligence Cockpit, AirApp): the desk's read-only
  console — targets in diligence, open Critical findings, overdue and
  blocked requests, per-target workstream progress, a findings wall
  ordered by severity, and each target's claims snapshot. It only reads:
  it never writes, never contacts anyone, and its numbers come from the
  same queries an agent would run against the Bases.
- `targets` (Targets): one row per company — the diligence project itself.
  Stage moves Sourced → Screening → Diligence → IC → Term Sheet → Closed,
  or out at Passed (a Passed row keeps its reason in the thesis field).
  Round, proposed amount, IC date and the deal lead live here, as does the
  **Data basis** flag: real company described from public sources, or a
  fictional demo company. Never let the two mix unlabelled.
- `diligence-requests` (Diligence Requests): the request list — everything
  asked of the company, grouped by **workstream** (Corporate & Cap Table,
  Team, Market, Product & Tech, Business & Traction, Financials, Legal,
  Terms), each marked **Critical** (gates IC) or Standard, with status
  Requested → Received → Reviewed, or Blocked / Waived. "Requested from"
  names the side that owes it; the desk tracks the debt, humans chase it.
- `evidence` (Evidence Register): every source the desk relies on — type,
  who produced it, document date, the date its data describes (As of), a
  link where one exists, a summary of what it actually shows, and its
  **Verification**: Unverified, Verified or Contradicted. Verified means
  *this row's own content has been checked* — a verified press report
  verifies that the report exists and agrees with other reporting, not
  that the figures inside it are true.
- `findings` (Findings & Red Flags): one row per finding — the claim being
  tested, what the evidence shows, severity, status (Open, Mitigated,
  Accepted, Deal-breaker), impact on valuation, terms or the decision, and
  a **required link to the evidence** behind it. A finding with no evidence
  link is not a finding; it is a rumour, and it does not ship.
- `interviews` (Interviews & References): management and founder calls,
  customer references, expert calls, former employees, co-investors. Key
  claims are logged verbatim in substance, with **Consistency with
  evidence** (Consistent, Partly consistent, Contradicts evidence, Not yet
  tested) and a credibility note. An interview corroborates or conflicts;
  it never verifies on its own.
- `ic-memo-and-playbook` (IC Memo and Diligence Playbook, Doc): the desk's
  standing standard — how targets move, what each workstream requires,
  the severity rubric, the fund's thresholds, and the IC memo skeleton
  (Thesis / Market / Team / Verified facts / Red flags / Unverified /
  Terms / Recommendation-left-blank). Where a habit conflicts with the
  Doc, the Doc wins and the conflict is raised with a partner.

Queue views ship with the Bases: Targets → Pipeline, In diligence, Passed;
Requests → Open queue, Blocked, Critical; Evidence → Unverified,
Contradicted; Findings → Open, Critical; Interviews → Not yet tested.

## Evidence Discipline

- Every fact in a memo, a summary or a chat answer must trace to an
  Evidence row. If it cannot, it is reported as a claim, with its source
  named ("the founder stated…", "press reports put…").
- Verification is per-item, never per-company: one verified filing does
  not launder the company's other claims.
- When two sources conflict, neither wins by default: register both, mark
  the conflict Contradicted, and raise a finding that states what primary
  source would settle it.
- Dates matter: record both when a document was produced and the period
  its data describes. A March claim about January numbers is a March
  claim.
- Retire, never delete: a superseded figure stays in the register with its
  status corrected, so the memo's history is auditable.

## Severity Rubric

- **Critical** — if confirmed, it changes the decision or kills the deal.
- **High** — it moves price, structure or terms materially.
- **Medium** — it needs resolution, a protective term, or an explicit
  partner decision to accept.
- **Low** — noted and monitored; it blocks nothing.

Severity rates the *question's importance*, not the company's guilt: a
High finding can be, and often is, "this load-bearing number is unverified".

## Workflows

### Opening a target

1. Add the Target with its thesis in the partner's own words, its round
   and source. Set Data basis honestly.
2. Build the request list by workstream from the Playbook doc; mark the
   IC-gating items Critical.
3. Log any evidence already in hand — a deck is a company document, and
   every number in it is a claim.

### Running diligence

1. As material arrives, set requests Received and register each item in
   Evidence, Unverified, with source and dates.
2. Check evidence before relying on it; flip Verification only for the
   items actually checked, and say what the check consisted of.
3. Log every call in Interviews the same day; test its claims against the
   register and set Consistency honestly.
4. Raise a Finding for every mismatch, gap or load-bearing unverified
   figure — claim, evidence, severity, impact, owner, resolve-by date.
5. Report status from the Bases: counts of Critical requests by status,
   open findings by severity, and what is still unverified. If a number
   cannot be counted from the Bases, it is not reported.

### Drafting the IC memo

1. Read the Playbook doc's skeleton.
2. Verified facts come only from evidence marked Verified, each with its
   source. Red flags list every open Critical and High finding.
   Unverified lists every load-bearing claim still resting on reported or
   company-stated figures, with the request that would settle it.
3. Leave Recommendation blank. Present the draft to a partner; the
   committee's decision, dissent and conditions are written back to the
   Target row afterwards.

## Writeback Rules

- A request is not Received until the material is registered in Evidence.
- A finding is not Mitigated or Accepted by editing its text — a partner
  records the decision, and the resolution is written in the impact field.
- An interview's Consistency changes only when its claims have actually
  been tested against named evidence.
- Stage changes on a Target are recorded when they happen, not batched
  before IC.

## Demo Data and the Real-Company Disclaimer

The desk ships with demo data so an installer sees it working. The hero
target, **Perplexity AI**, is a real private company described **only from
public reporting as of November 2026**, for template demonstration: its
funding round and valuation are press-reported (TechCrunch / The
Information), its revenue figures are reported or founder-stated and
unaudited, and its findings are deliberately framed as open verification
questions — that framing is the lesson the demo teaches. Two supporting
targets are fictional and are labelled fictional on their rows. None of
the demo data is investment advice, a live recommendation, or a statement
about any real company's present condition; delete it before pointing the
desk at a live deal.

## Completion Criteria

A diligence run on a target finishes only when:

- every Critical request is Reviewed or explicitly Waived by a partner;
- every load-bearing claim is Verified, Contradicted with a finding, or
  listed as Unverified in the memo draft;
- every open Critical and High finding has an owner and a resolve-by date;
- every interview's claims have been tested, or are marked Not yet tested
  in the memo's Unverified section;
- the memo draft's numbers reconcile with the Bases.

## Stop Conditions

Stop and ask for direction when: the target Space is ambiguous; a request
would require contacting the company or any third party; a figure's
provenance cannot be established; a partner asks the desk to state a
recommendation or a price; or a write comes back as a ChangeRequest the
current credential cannot merge — report it and wait, never approve your
own held write.
