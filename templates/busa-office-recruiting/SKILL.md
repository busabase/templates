---
name: busa-office-recruiting
description: Hiring positions, candidate pipelines, interviews, and reviewed offers. Use for hiring positions, candidate assessment, structured interviews and offer review.
metadata:
  category: hr
  tags: [risk:gated-write]
  busabase:
    template: true
    folderSlug: busa-office-recruiting
    resources:
      - positions
      - applicants
      - interviews
      - offers
    risk: gated-write
---

# Recruiting Desk / 招聘管理

## Scope and connection

Read the Busabase connection skill first. Work only inside the installed folder; resolve native nodes by the install-stamped resourceKey and verify the folder before reading or proposing changes. Never reuse another install's records. The AirApp is a read-only projection. All agent writes use ChangeRequests; inspect the returned status and never review or merge your own request. Never contact, sign, file, publish or transfer money without explicit user authority for that external action.

## Daily procedure

1. Read one bounded page (50 rows maximum) per relevant Base. Read at most 20 relevant pending ChangeRequests only if needed, filtered to this folder's exact node IDs. Cite the page scope and next cursor; do not infer a complete total from a partial list. Full exports require an explicit separate request.
2. Match business codes exactly. If a parent code is missing or ambiguous, stop that proposed association and ask for evidence. Do not match by a person's name alone.
3. Inspect status, responsible owner, source evidence and dates. Unknown is different from zero, absent, rejected or completed. Do not manufacture evidence, authority, outcomes or dates.
4. Prepare a factual change proposal with before/after fields, source references, human owner and reason. Submit through ChangeRequests, retaining returned ID and status.
5. Summarize review items and unresolved evidence, with a next action and owner. External execution remains a separate explicitly authorized step.

## Bases and field rules

### Positions / 招聘职位

- `name`: Name (text). Required.
- `code`: Position code (text).
- `department`: Department (text).
- `owner`: Hiring owner (text).
- `headcount`: Approved headcount (number).
- `status`: Status (text).
- `due`: Target start (date).
- `notes`: Requirements (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Applicants / 候选人

- `name`: Name (text). Required.
- `code`: Candidate code (text).
- `position`: Position code (text).
- `owner`: Recruiter (text).
- `status`: Hiring stage (text).
- `due`: Next step date (date).
- `next`: Next step (text).
- `notes`: Evidence and notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Interviews / 面试安排

- `name`: Name (text). Required.
- `code`: Interview code (text).
- `candidate`: Candidate code (text).
- `owner`: Interviewer (text).
- `status`: Feedback state (text).
- `due`: Interview date (date).
- `notes`: Structured feedback (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

### Offer review / 录用复核

- `name`: Name (text). Required.
- `code`: Offer code (text).
- `candidate`: Candidate code (text).
- `owner`: Approver (text).
- `amount`: Monthly salary (number).
- `currency`: Currency (text).
- `status`: Review state (text).
- `due`: Decision due (date).
- `notes`: Conditions (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.


## Hiring controls

Positions use open, paused or closed; approved headcount is a nonnegative integer. Applicants use screening → interview → offer_review → offered → hired, with on_hold, rejected and withdrawn as explicit branches. Require completed rubric-based interview evidence and budget approval before an offer proposal; candidate acceptance evidence is required before hired. Do not treat a recorded offer as sent or accepted. Interviews use scheduled, feedback_missing or completed; assess role skills from documented observations, never protected characteristics. Offers use needs_review, blocked, approved, sent, accepted or declined; monthly salary is nonnegative with an ISO currency. Approval, sending and acceptance are distinct events. No automatic outreach, invitations, offer delivery, background checks or applicant rejection. This is recruiting employees; it does not support resume-based customer acquisition or JDR lead generation. Retain the minimum personal data and honor authorized retention/deletion requests.

中文：职位人数必须经批准；候选人阶段变化需结构化面试证据。薪酬预算审批、发送录用通知、候选人接受和正式录用是不同事件，不能互相推断。仅按岗位能力和事实评估，不涉及受保护属性。不会自动联系、发邀请、发送录用或拒绝通知，也不用于 JDR 简历获客。

## Views, attention and limits

Overview and attention derive only from loaded rows and display that scope. Attention includes missing feedback, unverified evidence, blocked approvals and overdue unfinished work. Closed/complete/accepted records never become overdue merely because an old date is present. The legal chronological timeline sorts strict valid dates first; missing or invalid dates are explicitly unknown. Search and status filters apply only to the loaded rows. Load more requests exactly one next page and deduplicates results. Live failure never falls back to sample data.

## Example data

All installed seed rows and screenshots are fictional. Replace them via reviewed changes before operating real hiring or legal work. Example codes cannot substitute for actual source documents.
