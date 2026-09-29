---
title: 2026-09-29 Office Management Templates
---

# Office Management Templates

Date: 2026-09-29
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Extract reusable administration, finance, cashier, HR and payroll, recruiting,
> and legal management scenarios into six small templates for busabase/templates,
> following the busabase-template-creator skill.

**Refined Instructions:**
- Create six independent packages with synthetic examples, manuals, scenario
  prompts, real screenshots and generated covers.
- Verify installation in a dedicated test workspace folder.
- Preserve resource ownership, bounded reads and approval boundaries.

## What Changed

- Added six `busa-office-*` templates with 25 Bases, 89 synthetic records,
  41 native table views, six AirApps and six installed manuals.
- Added English and Simplified Chinese working interfaces and gallery scenes.
- Added provider ownership checks, explicit continuation, exact Base counts,
  partial-source diagnostics and Help interfaces.
- Added package and live-provider verification scripts, documented the office
  catalog and regenerated `templates.json`.

## Why

Teams need reusable operational workflows that already explain what an agent
should do with their tables. Each template owns its resources and can be
installed without another office template or the original workspace.

## Files Affected

- `templates/busa-office-admin/**` - administration and source verification.
- `templates/busa-office-finance/**` - expenses, invoices, actuals and filings.
- `templates/busa-office-cashier/**` - accounts, checks, payments and cash movements.
- `templates/busa-office-hr/**` - employees, contracts, salary changes and payroll.
- `templates/busa-office-recruiting/**` - positions, applicants, interviews and offers.
- `templates/busa-office-legal/**` - cases, deadlines, recoveries, updates and tasks.
- `scripts/check-office-templates.mjs` - declaration and sample integrity.
- `scripts/check-office-live.mjs` - canonical schema, seed and relationship checks.
- `README.md`, `templates.json` - catalog documentation and generated entries.
- `docs/office-management-verification.md` - evidence and remaining limitations.

## Breaking Changes

None. Existing templates and resources remain compatible.

## Testing

- Scoped source typechecks and 50 domain/provider tests.
- Six strict package checks and six 1440x900 cover checks.
- Real installs, canonical schema and seed reads, including linked accounts.
- Independent Playwright workflows in both languages and on desktop and phone.
- Browser integration against the test workspace through the local SDK gateway.
- Public gallery source and rendered-image branding checks.

## Follow-up Tasks

- Verify interactive OAuth and the hosted Cloud Run session separately.
- Support multiple copies of the same template in one space with an explicit
  instance selector; current ambiguous ownership fails closed.
- The current installer does not transfer custom prompts onto its automatically
  created root manual Skill node. Explicit resource nodes have specific prompts.
