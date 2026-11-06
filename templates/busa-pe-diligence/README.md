# Busa PE Diligence

A due-diligence desk for private-equity teams, as an installable Busabase
template: target pipeline, nine-workstream request lists, an evidence
register that keeps every claim's verification status honest, a red-flag
wall with severity and valuation impact, interviews whose claims are tested
against the evidence, and an IC memo drafted only from verified facts.

The desk's unit of work is the record chain — **claim → evidence →
verification → finding → committee decision** — not the checklist.

## What's inside

- `SKILL.md` — the manual an agent reads before touching this desk's data.
- `busabase.json` — the template manifest (category: finance).
- `content/` — five Bases (Targets, Diligence Requests, Evidence Register,
  Findings & Red Flags, Interviews & Site Visits), the IC Memo and
  Diligence Playbook Doc, and the read-only Diligence Cockpit AirApp
  (`content/busa-pe-diligence-app/`).
- `blueprint.json` — the schema-version-1 blueprint the package was built
  from (runtime binding; no workspace ids — a template materialises fresh
  resources in the installer's Space).
- `scripts/check-consistency.mjs` — drift guard: the AirApp config mirrors
  `content/<base>/base.json`, and this script fails if they ever disagree.

## Demo data

One worked example at the Diligence stage — NVIDIA Corporation, built from
its public Form 10-K FY2026 — plus two clearly-labelled fictional targets
(Screening and Passed). Example built from public sources for demonstration
only: not a live deal, not investment advice, not a recommendation on any
named company.
