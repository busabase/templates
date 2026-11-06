---
name: busa-pe-diligence
description: PE due-diligence desk on Busabase — a private-equity team's target pipeline, workstream request lists, an evidence register that marks every claim verified, contradicted or still unverified, a red-flag wall with severity and valuation impact, interviews whose claims are tested against the evidence, and an IC memo drafted only from verified facts. Use when the user invokes $busa-pe-diligence or /busa-pe-diligence, mentions due diligence or DD on a target company, a quality-of-earnings (QoE) review, a data room or request list, red flags on a deal, an investment committee (IC) memo, or asks what is actually proven about a company the fund is looking at.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-pe-diligence
    resources:
      - targets
      - diligence-requests
      - evidence
      - findings
      - interviews
    risk: gated-write
---

# Busa PE Diligence

## Overview

Busa PE Diligence is a Busabase-backed due-diligence desk for private-equity
deal teams. It exists for the weeks between "we like this company" and the
investment committee, when the team's real job is to find out what is
actually true about a target — and to be able to prove, afterwards, how each
conclusion was reached.

The desk's unit of work is not the checklist. It is the **record chain**:

**claim → evidence → verification → finding → committee decision.**

A seller's teaser makes claims. Management makes claims on calls. The press
makes claims with dates on them. This desk gives every claim somewhere to
land, something to be checked against, and a status — verified,
contradicted, or still unverified — that survives to IC day. What the
committee is asked to believe without evidence is listed as unverified, in
the open, never blended into the facts.

The Folder holds five Bases, one playbook Doc, and one read-only AirApp:

| Resource | What it holds |
| --- | --- |
| **Targets** | One row per target company: stage, deal type, target stake, indicative enterprise value, financial snapshot, deal lead, target IC date, next action. |
| **Diligence Requests** | The request list: everything asked for, by workstream, with criticality, status, and internal + external-advisor owners. |
| **Evidence Register** | One row per piece of evidence: type, source, source date, facts-as-of date, verification status, and what it establishes. |
| **Findings & Red Flags** | Each finding states the claim tested, what the evidence shows, a severity, and the impact on valuation or terms — and links the evidence behind it. |
| **Interviews & Site Visits** | Management calls, expert calls, customer references, site visits: who claimed what, and whether the evidence agrees. |
| **IC Memo and Diligence Playbook** (Doc) | The desk's standard: the nine-workstream checklist, the severity rubric, and the IC memo skeleton. |
| **Diligence Cockpit** (AirApp) | Read-only: pipeline progress, the red-flag wall, overdue requests, one target's full picture. |

## Mandatory dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behaviour.
2. Read the **IC Memo and Diligence Playbook** Doc in this folder before
   drafting any memo or judging any severity: it carries the workstream
   checklist, the severity rubric, and the memo skeleton. Where this skill
   and the playbook disagree, the playbook is the standard and the
   disagreement is worth raising with the deal lead.

## The workflow

1. **Open the target.** Add a Targets row at Screening (or Sourced), with
   deal type, target ownership stake and indicative enterprise value. State
   the thesis in the snapshot's terms — as claims, because that is what
   they are at this point.
2. **Build the request list.** Generate the standard PE list across all nine
   workstreams — Corporate, Financial / QoE, Tax, Legal & Compliance,
   Commercial, Operations, HR & Org, Tech & IT, ESG — critical items first,
   each with who it is requested from (seller, data room, advisor), an
   internal owner, an external-advisor owner where one is engaged, and a
   due date. Move the target to Diligence.
3. **Work the list.** Statuses move Requested → Received → Reviewed, or
   Blocked with the reason in Notes, or Waived with the reason in Notes.
   A waived critical item is a fact the IC memo must carry.
4. **Register evidence as it lands.** Every document, filing, transcript and
   report becomes an Evidence row on arrival — Unverified by default, even
   if it looks authoritative. The original files live with the deal's
   documents; this register is the index and the verdict.
5. **Verify.** Check each item against its primary source. Verified only
   when the primary source says the same thing; Contradicted when it does
   not; the summary says what was checked. Filings and audited statements
   are primary sources. Transcripts verify what was *said*, never that it
   is true.
6. **Log every conversation.** Management calls, expert calls, customer
   references and site visits go to Interviews with the key claims in the
   speaker's terms and consistency marked *Not yet tested*. Test them
   against the register as evidence lands; update the consistency mark,
   never the claims.
7. **Raise findings.** Where evidence and claim disagree — or where the
   evidence itself is the problem, like concentration disclosed in a
   filing — write a Finding: the claim, what the evidence shows, severity
   from the playbook rubric, status, owner, resolve-by date, and the impact
   on valuation or terms. **A finding must link its evidence.** A concern
   with no evidence behind it is recorded as an unverified item in the
   target's record, not as a finding.
8. **Draft the IC memo** to the playbook skeleton: thesis, QoE conclusions,
   verified facts, red flags, unverified items, valuation and
   deal-structure protections, exit path. Only Verified evidence may be
   stated as fact. Everything else goes to the Unverified section, named
   as such.

## Field notes

- **Targets.stage** is the deal's truth about where it stands: Sourced →
  Screening → Diligence → IC → Signing → Closed, or Passed. A Passed target
  keeps its record and its findings; the pass reason is the lesson.
- **Requests.criticality** — Critical means the IC memo cannot be honest
  without it. Standard means the work is better with it.
- **Evidence.verification** is the desk's most load-bearing field. Do not
  mark Verified on the strength of a second-hand summary, a data page, or
  management's assurance. Market figures from third-party data pages stay
  Unverified until re-based on a dated primary source.
- **Evidence.as-of date** separates "true when published" from "checked
  today". Figures age; the register remembers how old each one is.
- **Findings.severity** follows the playbook rubric: Critical changes the
  decision, High changes the price or structure, Medium changes the
  underwriting assumptions, Low is noted and owned. Severity is about
  consequence, not surprise.
- **Findings.status = Deal-breaker** is reserved for what the rubric calls
  critical-and-unmitigable. Deal-breakers are findings, not deletions: the
  record of why a deal died is diligence too.
- **Interviews.consistency** is the claim-vs-evidence verdict: Consistent,
  Partly consistent, Contradicted, or Not yet tested. Most rows should sit
  at Not yet tested for a while. That is the system working.

## The cockpit

The AirApp is read-only and answers three questions: what is in diligence
and how far along is it, what has been found, and what is stuck. It reads
one page of up to 50 records per Base and offers Load More; headline counts
are exact totals from the server, not page arithmetic. It never writes,
never provisions, and never substitutes for the Bases — it is a window,
not a second record.

## Boundaries — what this desk must never do

- **Never contact the target company, its management, its customers, or
  anyone outside the deal team** — no emails, no calls, no messages, no
  meeting requests. This desk records diligence; humans conduct it.
- **Never present management, seller or teaser figures as audited or
  verified.** If the Evidence Register does not mark it Verified, it is a
  claim, and it is written as one everywhere — summaries, memos, briefs.
- **Never invent a figure** — not a market size, not a margin, not a
  customer count, not a date. If the number is not in a record with a
  source, the honest entry is *not yet known*.
- **Never give an investment recommendation.** The desk assembles what is
  proven, what is flagged, and what is unverified. Whether to invest, at
  what price, belongs to the investment committee.
- **Never mark your own proposals merged.** Writes go through Change
  Requests like everyone's; a pending Change Request is reported as
  pending.
- **Never soften a finding to keep a deal alive.** Severity follows the
  rubric. If a finding is wrong, correct it with the evidence that proves
  it wrong — in the open, as a new state of the record.

## Demo data and the real-company example

The template ships with one worked example at the Diligence stage:
**NVIDIA Corporation (NASDAQ: NVDA)**, built entirely from public sources —
Form 10-K FY2026 (fiscal year ended January 25, 2026, filed February 25,
2026) — so every figure in it can be checked against the filing itself:
FY2026 revenue $215.9B (+65.5%), net income $120.1B, gross margin 71.1%
(down from 75.0%), Data Center revenue $193.7B (about 90% of total), two
direct customers at 22% and 14% of revenue, and the $4.5B Q1 FY2026 charge
tied to H20 export-licence requirements. Its three findings rest on that
filing alone. One market-capitalisation figure (about $5.0T, November 3,
2026) is deliberately left **Unverified** — it comes from third-party
market data, and the desk's discipline applies to the demo too.

Two further targets, **HarborMed Supplies Ltd** and **BrightCart Retail
Group**, are fictional examples, labelled fictional in their records, so
the Screening and Passed stages are not empty.

> Example built from public sources for demonstration only — not a live
> deal, not investment advice, and not a recommendation on any named
> company. Delete the example records before using the desk on a real
> target, or keep them clearly separated by stage.

## Keeping the desk honest over time

- When a workstream's standard list proves incomplete on a live deal, add
  the missing request to the playbook by Change Request — the next deal
  inherits the lesson.
- When a finding's severity is disputed, resolve it against the rubric in
  the playbook, and record the resolution in the finding.
- The weekly rhythm is one pass over: overdue and blocked requests,
  unverified evidence older than the deal can afford, findings without an
  impact statement, and interviews still untested. The cockpit's overview
  is built to make that pass take minutes.
