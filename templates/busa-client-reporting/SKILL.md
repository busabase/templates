---
name: busa-client-reporting
description: Agency client-reporting desk (Busabase App-in-Skill) that keeps, per client, project progress, deliverable status, KPI snapshots, milestones and next steps, and shares one read-only report page with each client. Use when the user invokes $busa-client-reporting or /busa-client-reporting, or mentions client reporting, agency reports, monthly/quarterly client reports, deliverable tracking for a client, KPI snapshots, client milestones, or preparing, reviewing or sharing a report with a client.
metadata:
  category: marketing
  tags:
    - risk:read-only
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-client-reporting
    resources:
      - clients
      - projects
      - deliverables
      - metrics
      - milestones
      - reports
    risk: read-only

---

# Busa Client Reporting

## Overview

Busa Client Reporting is a Busabase Cloud App-in-Skill for an agency or
service provider that reports to clients on a cadence. For each client it
keeps the projects in flight, the deliverables promised and sent, the KPI
numbers for each period, the milestones ahead, and the narrative report the
client actually reads.

The AirApp is the client-facing report desk and it is **read-only in v1**:
it never writes, never sends, and never falls back to demo data in
production. People open it to see the Overview (every client with its
rollups), a single client's Report page, and the Reports list. All editing
happens in the Bases themselves, or through this skill acting on the
operator's instructions via ChangeRequests.

One report surface is shared with each client: when a report is Ready to
Share, a person creates a **node-level read-only share link** on the
report/app node in the Busabase product UI and sends that link to the
client outside the app. The template does not generate links and no field
pretends to hold one — `Shared Link Note` only records where the link was
sent and when.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behaviour.
2. Read and follow `$busabase-app-creator` for resource modelling, the
   AirApp runtime contract, and validation.

## Busabase Resources

Resolve the installed Folder and Bases by `resourceKey`, never by a
workspace's ids. Template installation prefixes Base slugs with the Folder
slug (`busa-client-reporting-<key>`); the app config declares that prefixed
form and `scripts/sync-content.mjs` generates each `base.json` from it.

| Resource | Holds |
| --- | --- |
| `clients` | One row per client: name, primary contact, contact email, industry, status (Active / Paused / Former Client), reporting cadence. `Notes` are **internal**. |
| `projects` | One row per engagement: client (relation), service type, status (Not Started / In Progress / At Risk / On Hold / Completed), start/due dates, client-safe summary. `Owner` is **internal**. |
| `deliverables` | One row per promised deliverable: project + client (relations), status (Planned / In Progress / In Review / Sent to Client / Approved / Revision Requested), due/delivered dates, link. `Notes` are **internal**. |
| `metrics` | One row per KPI snapshot: client (+ optional project), metric, period (e.g. `2026-10`), value, previous value, target, unit, source. `Notes` are **internal**. Change vs previous and vs target is **computed by the app — never store a computed percentage as a field**. |
| `milestones` | One row per milestone: project + client (relations), due/completed dates, status (Upcoming / In Progress / Done / Missed), notes (client-visible). |
| `reports` | One row per report for one client + period: title, status (Draft / In Review / Ready to Share / Shared), executive summary, highlights, next steps, shared link note. `Risks & Blockers` are **internal**. |

Field-by-field detail: `references/client-reporting-schema.md`.

## The internal / client-visible boundary

This boundary is the template's core safety property. It is enforced in
code (`INTERNAL_FIELDS` and `buildClientReport()` in
`content/busa-client-reporting-app/app/js/reporting-model.js` — the client
page is built only from client-visible fields) and it binds the agent too:

**Internal — never on the client report page, never quoted to a client:**
`clients.notes`, `projects.owner`, `deliverables.notes`, `metrics.notes`,
`reports.risks_blockers`.

**Client-visible:** client name/industry/cadence; project name, service
type, status, dates and summary; deliverable name, status, dates and link;
KPI label, value, previous value, target, unit and source; milestone name,
status, dates and notes; report title, period, status, executive summary,
highlights and next steps.

Draft and In Review reports are not client surfaces either: the client
page shows only the latest Ready to Share or Shared report for a period.

## The reporting workflow

1. **Collect.** During the period, keep `deliverables` and `milestones`
   current (statuses, delivered dates, links) and record the period's KPI
   numbers in `metrics` — value, previous value, target, unit, source —
   using only numbers the operator or a named source provides.
2. **Draft.** Create the `reports` row for the client + period in Draft:
   executive summary, highlights and next steps in client-safe language;
   anything candid goes in `Risks & Blockers` (internal) only.
3. **Review.** Move to In Review while a person checks the narrative
   against the deliverables and KPI rows. No number appears in the
   narrative that is not in `metrics`.
4. **Ready.** When approved, set status to Ready to Share.
5. **Share.** A person opens the report/app node in Busabase, creates a
   **node-level read-only share link** there, and sends it to the client
   through the agency's normal channel (email, chat) — outside this app.
6. **Log.** Set status to Shared and write into `Shared Link Note` where
   the link was sent and when (e.g. "Read-only link emailed to the primary
   contact on 2026-11-04"). Never invent or guess a URL for this field.

## Safety boundary — what this skill and app must never do

- Never send anything to a client from inside the app or this skill: no
  email, no message, no share. Sharing is a human step in the product UI
  plus the agency's own channel (workflow step 5).
- Never invent metric numbers, dates, links or client facts. A KPI row
  exists only when a person or a named source supplied the figure; leave
  unknown fields empty.
- Never expose internal fields (above) on the client page, in a summary
  intended for the client, or in any client-bound draft.
- Never store a computed change percentage in `metrics`; the app computes
  change vs previous and vs target at read time.
- Never approve or merge your own ChangeRequests. Writes follow the
  operator's permission: omit `autoMerge`, report whether the write landed
  or is waiting for review, and let a human merge anything pending.
- Never write a share URL into `Shared Link Note` — it is a note about
  where/when a link was sent, not the link, and links are created on the
  node in Busabase, not by this template.

## Data budgets

- The app reads at most **50 records per Base per page**, one page per user
  action, with Load More following `nextCursor`. No hidden full scans.
- Agent reads follow the same discipline: bounded, server-filtered pages;
  state plainly when a summary covers only the loaded page.
- Sample data is capped at 50 rows per Base by the template format; this
  template ships 4 clients, 5 projects, 8 deliverables, 10 metrics,
  6 milestones and 3 reports.

## Sample data

All sample rows are fictional: an invented agency roster (Harbor Lane
Outfitters, Fernbrook Dental Group, Copperfinch Software, Alder Peak
Hotels) on `.example` domains. No real people, companies or numbers. Demo
mode (`?demo=1`) serves the same fictional set read-only and is labelled
as demo; the production provider never falls back to it silently.

## Completion criteria

- The `busa-client-reporting` Folder, all six Bases and the AirApp exist.
- `node scripts/sync-content.mjs --check` passes (base.json is generated
  from the app config, never hand-edited).
- The app's `pnpm check` (static checks + model tests) passes, including
  the metric-change and internal-field-exclusion tests.
- A Ready to Share report can be opened as a client page showing summary,
  KPI cards with computed change, deliverables by status, the milestone
  timeline and next steps — with no internal field anywhere on it.
