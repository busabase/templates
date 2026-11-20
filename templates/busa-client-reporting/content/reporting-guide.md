---
name: Reporting Guide
description: How the agency shares a report with a client — the read-only sharing flow, what the client sees, and what never leaves the building. Read before the first share.
position: 7
agentPrompts:
  - key: walk-through-sharing
    label: "Walk me through sharing a report"
    intent: read-only
    body: "Read the `busa-client-reporting` skill in this folder, then walk me through the sharing steps in this guide for the report I name: what state it must be in, where the read-only link is created, and what to log afterwards. Do not share anything yourself."
  - key: check-report-client-safe
    label: "Check a report is client-safe before sharing"
    intent: read-only
    body: "Read the `busa-client-reporting` skill in this folder, then check the report I name against this guide: every number traceable to a KPI snapshot, no internal field (notes, owner, risks & blockers) in the client-visible text, and next steps the client can act on. List each problem you find. Do not edit the report."
---

# Reporting Guide — sharing a report with a client

This guide is the agency's own playbook for the last mile of reporting:
turning a finished report into something a client opens. The app never
sends anything; sharing is a person, in Busabase, following these steps.

## What the client sees

The client opens **one read-only surface**: the report page for their
client record and period. On it:

- the report's executive summary and highlights;
- KPI cards — value, change versus the previous period, change versus
  target (all computed from the KPI snapshots, never typed in);
- their projects with status and summaries;
- deliverables grouped by status, with links to the delivered work;
- the milestone timeline;
- next steps.

## What the client never sees

Internal fields exist so the agency can be candid somewhere — that
somewhere is not the report page:

- `Notes` on Clients, Deliverables and KPI Snapshots;
- `Owner` on Projects;
- `Risks & Blockers` on Reports.

Draft and In Review reports do not appear on the client page at all. Only
a report marked **Ready to Share** or **Shared** renders there.

## The sharing flow

1. Finish the workflow in the skill: collect deliverables and KPI
   snapshots for the period, draft the report, review it, and set its
   status to **Ready to Share**.
2. Open the report (or the app node) in Busabase and create a
   **node-level read-only share link** on that node. Read-only matters:
   the client reads; they do not edit the agency's records.
3. Send the link to the client's primary contact through your normal
   channel — email or chat, outside this app. The app does not send, and
   no template field generates the link.
4. Set the report's status to **Shared** and write into **Shared Link
   Note** where the link went and when — for example, "Read-only link
   emailed to the primary contact on 2026-11-04". The note is a log line,
   not the URL.
5. If a report changes after sharing, update the report, tell the client
   through the same channel, and extend the Shared Link Note.

## Before you share — a 60-second check

- Every number in the summary appears in the period's KPI snapshots.
- The narrative contains nothing copied from an internal field.
- Deliverable statuses match what the client has actually received.
- Milestones past their date are marked Done or Missed, not left Upcoming.
- The client is Active — a Paused client's reports stay internal until
  the engagement resumes.
