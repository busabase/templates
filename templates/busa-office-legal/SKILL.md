---
name: busa-office-legal
description: Case progress, preservation deadlines, settlement evidence, and legal follow-up. Use for legal case progress, preservation, court deadlines, settlements and counsel tasks.
metadata:
  category: legal
  tags: [risk:gated-write]
  busabase:
    template: true
    folderSlug: busa-office-legal
    resources:
      - cases
      - deadlines
      - settlements
      - updates
      - tasks
    risk: gated-write
---

# Legal Case Desk / 法务管理

## Scope and connection

Read the Busabase connection skill first. Work only inside the installed folder; resolve native nodes by the install-stamped resourceKey and verify the folder before reading or proposing changes. Never reuse another install's records. The AirApp is a read-only projection. All agent writes use ChangeRequests; inspect the returned status and never review or merge your own request. Never contact, sign, file, publish or transfer money without explicit user authority for that external action.

## Daily procedure

1. Read one bounded page (50 rows maximum) per relevant Base. Read at most 20 relevant pending ChangeRequests only if needed, filtered to this folder's exact node IDs. Cite the page scope and next cursor; do not infer a complete total from a partial list. Full exports require an explicit separate request.
2. Match business codes exactly. If a parent code is missing or ambiguous, stop that proposed association and ask for evidence. Do not match by a person's name alone.
3. Inspect status, responsible owner, source evidence and dates. Unknown is different from zero, absent, rejected or completed. Do not manufacture evidence, authority, outcomes or dates.
4. Prepare a factual change proposal with before/after fields, source references, human owner and reason. Submit through ChangeRequests, retaining returned ID and status.
5. Summarize review items and unresolved evidence, with a next action and owner. External execution remains a separate explicitly authorized step.

## Bases and field rules

### Cases / 法务案件

- `name`: Name (text). Required.
- `code`: Case code (text).
- `counterparty`: Counterparty (text).
- `owner`: Case owner (text).
- `status`: Case stage (text).
- `due`: Next hearing (date).
- `next`: Next action (text).
- `notes`: Dispute summary (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Preservation & deadlines / 保全与期限

- `name`: Name (text). Required.
- `code`: Deadline code (text).
- `case`: Case code (text).
- `owner`: Responsible counsel (text).
- `status`: Verification state (text).
- `due`: Verified due date (date).
- `source`: Deadline authority (text).
- `notes`: Preservation notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Recoveries & costs / 回款与成本

- `name`: Name (text). Required.
- `code`: Entry code (text).
- `case`: Case code (text).
- `owner`: Finance reviewer (text).
- `kind`: Entry type (text).
- `amount`: Amount (number).
- `currency`: Currency (text).
- `status`: Evidence state (text).
- `due`: Posting date (date).
- `source`: Evidence reference (text).
- `notes`: Reconciliation notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Case timeline / 案件进展

- `name`: Name (text). Required.
- `code`: Update code (text).
- `case`: Case code (text).
- `owner`: Author (text).
- `status`: Evidence state (text).
- `due`: Occurred on (date).
- `source`: Source reference (text).
- `notes`: Factual update (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Legal follow-up / 法务待办

- `name`: Name (text). Required.
- `code`: Task code (text).
- `case`: Case code (text).
- `owner`: Responsible owner (text).
- `status`: Task state (text).
- `due`: Action due (date).
- `next`: Required action (text).
- `notes`: Review context (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.


## Legal controls

Cases use investigation → litigation / settlement → closed; a stage change needs source evidence and counsel/business owner review. Case closure requires reconciliation and an approved closure record. Deadline state uses unverified, needs_review, verified, overdue or completed. A court notice, service date and qualified counsel validation establish a deadline; never calculate a statutory deadline from memory. Preserve the source authority in source and set due null if unknown. Preserve prior factual updates; add corrections as new chronological entries rather than replacing history.

Recoveries and costs are positive nonnegative amounts labeled by kind (recovery or cost) and ISO currency. Only verified entries with bank receipt/invoice evidence count as realized amounts. Group sums by currency; never add CNY and USD and never interpret quote-only rows as payment. Settlement acceptance, concessions, filings, signatures, releases and payments require specific human authorization and competent counsel. No legal outcome guarantees. Limit privileged and personal data to approved readers.

中文：案件阶段变更、结案、和解、保全续期必须有来源证据并经负责律师及业务负责人复核。日期未核验时留空，不凭经验推算法定期限；按币种核算已核验回款与成本，报价不等于付款。所有签署、提交、和解承诺及付款都是单独授权的外部行为。

## Views, attention and limits

Overview and attention derive only from loaded rows and display that scope. Attention includes missing feedback, unverified evidence, blocked approvals and overdue unfinished work. Closed/complete/accepted records never become overdue merely because an old date is present. The legal chronological timeline sorts strict valid dates first; missing or invalid dates are explicitly unknown. Search and status filters apply only to the loaded rows. Load more requests exactly one next page and deduplicates results. Live failure never falls back to sample data.

## Example data

All installed seed rows and screenshots are fictional. Replace them via reviewed changes before operating real hiring or legal work. Example codes cannot substitute for actual source documents.
