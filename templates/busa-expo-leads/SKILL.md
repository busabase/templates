---
name: busa-expo-leads
description: Trade-show lead-capture desk (Busabase App-in-Skill) that turns a booth badge scan into an SLA-tracked lead and a drafted, multilingual follow-up awaiting human review. Use when the user invokes $busa-expo-leads or /busa-expo-leads, mentions trade show leads, exhibition follow-up, booth leads, lead capture at a trade fair, Global Sources, Canton Fair, exhibitor follow-up, 展会获客, 展会线索, or wants to review/approve a drafted WhatsApp/email/WeChat follow-up before it sends.
metadata:
  category: sales-crm
  tags:
    - sales-crm
    - industry:ecommerce
    - surface:whatsapp
    - surface:busabase
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-expo-leads
    resources:
      - batches
      - leads
      - followups
      - settings
    risk: gated-write

---

# Busa Expo Leads

## Overview

Exhibitors meet international buyers face-to-face over several days at a trade
show. The job this app does: capture a lead the moment the operator meets one
at the booth, and get a same-day multilingual follow-up drafted for human
approval before it sends. Most trade-show leads never get followed up, and a
follow-up sent within 24 hours converts far better than one sent a week later
— so the headline screen is an SLA countdown that shows exactly who is about
to blow past that window.

Busa Expo Leads is a Busabase Cloud App-in-Skill. Its canonical product
surface is the AirApp in Busabase, not a separate local-data product. The same
Hono source supports an explicitly requested local preview with OAuth
connection bootstrap.

Default behavior is AirApp-first. Unless the user explicitly asks only for
explanation, update Busabase directly and give the operator the clickable
AirApp URL. Start localhost only when local preview/debugging is explicitly
requested; it uses the same Busabase resources and never offers another data
provider.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling, AirApp
   runtime limits, security, validation, and deployment.

If a dependency is unavailable, preserve this skill's local artifact and
product contracts, stop before the unavailable Busabase operation, and report
the exact missing dependency. Do not invent a second data backend.

## Boundary

- The AirApp reads Busabase records, drafts follow-up messages, and records
  human decisions only through Busabase writes (a ChangeRequest, never a
  direct canonical mutation from the browser). It must never send a WhatsApp
  message, an email, or a WeChat message itself, and must never call an
  external messaging API.
- Outbound follow-up messages are always approval-required through the
  `followups` review queue. Actually sending an approved follow-up happens
  outside this app (for example through a channel-specific skill), only after
  the operator's explicit `approve` decision, using the approved, possibly
  operator-edited draft.
- Treat lead names, contact handles (WhatsApp/email/WeChat), and card photos
  as sensitive personal data. Never commit real lead data, tokens, or
  Busabase credentials.

## Busabase Resources

Four Bases under one application Folder (`busa-expo-leads`), declared in
`content/busa-expo-leads-app/app/js/config.js`:

- `batches`: one row per trade show attended — name, location, start/end
  date, notes.
- `leads`: the core table — name, company, country, language, the linked
  `batch`, an optional card-photo attachment, product interest, contact
  channel (WhatsApp/email/WeChat), contact handle, `met_at` (ISO datetime),
  and `stage` (new/contacted/replied/qualified/lost). There is no stored
  SLA/status field: the SLA bucket is always computed client-side from
  `met_at` against the `settings` thresholds, so it is never stale relative
  to "now".
- `followups`: the review queue — the linked `lead`, the follow-up language
  (copied from the lead at draft time), `draft_text`, `channel`, workflow
  `status` (needs_review/approved/sent), and the human decision fields
  (`decision_action`, `decision_comment`, `decided_at`) plus execution
  markers (`execution_status`, `execution_detail`, `executed_at`) written
  once the approved follow-up is actually handed off outside the app.
- `settings`: one row (`record-id: "config"`) with the SLA thresholds
  (`sla-24h-hours` default 24, `sla-72h-hours` default 72), a JSON-encoded
  map of default reply templates per language, and the (non-secret) env var
  names that name the WhatsApp/email sending account — never a secret value.

Resources provision lazily through an idempotent Busabase ChangeRequest the
first time the app runs in a Space.

## SLA Model

The SLA bucket for a lead is never stored — it is derived every time the app
renders, from `met_at` compared to "now" against the two thresholds on the
`settings` row:

- **green**: met less than `sla-24h-hours` hours ago.
- **amber**: met between `sla-24h-hours` and `sla-72h-hours` hours ago.
- **red**: met more than `sla-72h-hours` hours ago.

A lead whose latest follow-up is already `sent`, or whose `stage` is
`qualified` or `lost`, is excluded from all three SLA buckets — it no longer
needs a countdown. See `content/busa-expo-leads-app/app/js/expo-leads-model.js`'s
`slaStateFor`/`bucketLeads` for the exact rule.

## App UI

Required app views (hash routes):

- `#/overview`: the SLA countdown board — three buckets (green/amber/red)
  each showing a count and a short list of the leads in that bucket, with a
  link to the lead's follow-up. This is the headline screen.
- `#/leads`: list view, filterable/groupable by `batch`, showing stage,
  country, language, and the SLA bucket badge for every open lead.
- `#/followups`: the review queue — draft text, the target lead, and
  approve / request changes / block actions. Every decision writes a
  ChangeRequest; it never mutates the canonical record directly from the
  browser.
- `#/settings`: sanitized settings summary — SLA thresholds and the env var
  names configured for WhatsApp/email sending (never the secret values
  themselves).

## Review Workflow

1. A lead is captured (name, company, contact channel/handle, `met_at`) as a
   Busabase write.
2. A follow-up is drafted in the lead's own language and written to
   `followups` with `status: "needs_review"`.
3. The operator reviews the SLA board and the follow-up queue, and decides:
   approve, request changes, or block. The decision writes
   `decision_action` / `decision_comment` / `decided_at` onto the followup
   record through a ChangeRequest.
4. Only after an explicit `approve` decision does the actual send happen,
   outside this app; the real result is recorded back onto the followup as
   `execution_status` / `execution_detail` / `executed_at`.
5. Never send anything for a followup without an explicit `approve` decision,
   and never re-send a followup already `sent`.

## Demo Mode

`?demo=1` opens a deterministic, read-only mock desk for documentation and
screenshots (`content/busa-expo-leads-app/app/js/providers/demo-provider.js`).
`?demo=overview`, `?demo=leads`, and `?demo=followups` select named mock
scenes. `lang=en` or `lang=zh` forces UI chrome language. Demo mode never
reads or writes Busabase and never claims a real connection.

## Completion Criteria

Finish only when:

- the skill contains the complete canonical `content/busa-expo-leads-app/`
  project and `pnpm --dir content/busa-expo-leads-app dev` remains supported;
- all persistent config, state, decisions, and domain data use `busabase-sdk`
  and the declared resource map — no local JSON, browser storage, or
  provider choice;
- Vault values and API credentials never reach browser-visible surfaces;
- a deployed AirApp uses its ambient session, never an OAuth/API-key/Space
  picker;
- Overview, Leads, Follow-ups, and Help & Settings render on desktop and
  phone widths;
- `pnpm --dir content/busa-expo-leads-app run check` and `node --test` pass.

## Stop Conditions

Stop before consequential Busabase mutation when the target Space is
ambiguous, the current user lacks permission, or a same-slug resource is not
application-owned. Never send, publish, or otherwise mutate an external
system directly from the AirApp.
