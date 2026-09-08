# Busa Expo Leads

Busa Expo Leads is a Busabase-backed trade-show lead-capture desk: an SLA
countdown board over booth leads, plus a review queue of drafted multilingual
follow-ups awaiting human approval before they send.

## What It Shows

- Overview: SLA countdown board with three buckets (green under 24h, amber
  24–72h, red over 72h) — count and short lead list per bucket, linking to
  each lead's follow-up. This is the headline screen.
- Leads: list view, filterable/groupable by batch, showing stage, country,
  language, and SLA bucket badge.
- Follow-ups: review queue of drafted messages with editable drafts and
  Approve / Request changes / Block decisions.
- The app never sends anything itself. An approved follow-up is sent outside
  this app, only after explicit approval, and the real result is recorded
  back onto the follow-up record.

## Running Locally

```bash
pnpm --dir content/busa-expo-leads-app install
pnpm --dir content/busa-expo-leads-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=leads&lang=en#/leads
/?demo=followups&lang=en#/followups
```

Demo mode never reads or writes Busabase.

## Data

All persistent data — trade-show batches, leads, follow-ups, and settings —
lives in Busabase Bases under one application Folder. See `SKILL.md` and
`references/expo-leads-schema.md` for the resource map and record shapes.
`scripts/sync-content.mjs` regenerates the package's `content/<base>/base.json`
sidecars from the app's own declaration in `config.js` (or checks they are
current with `--check`), so the two can never drift.
