---
title: 2026-09-29 Complete bilingual office template packages
---

# Complete Bilingual Office Template Packages

Date: 2026-09-29
Author: AI Assistant
AI Agent: OpenAI Codex

## Prompts & Instructions

**Original Request:**
> 补齐整个模板包的中英双语。

**Refined Instructions:**
- Complete English and Simplified Chinese coverage for all six office templates, including manuals, catalog prompts, native labels, specific node prompts and sample prose.
- Keep business identifiers, workflow values, amounts, dates and relations stable.
- Refresh real screenshots, generated covers and bilingual recordings; verify new local installations and update PR #28 in English.

## What Changed

- Added complete bilingual Skills, READMEs and template verification references.
- Added paired catalog prompts, specific translated node actions and native label/description translations from canonical declarations.
- Completed fictional sample narratives and localized missing accessibility labels.
- Fixed mobile header wrapping in Finance and Cashier after real browser verification found overflow.
- Added locale coverage and installed-label checks; regenerated content, media and catalog.

## Why

The apps were bilingual, but the package-level manuals, catalog prompts and native resources had incomplete translation coverage.

## Files Affected

- `templates/busa-office-*/SKILL.md`, `README.md`, verification references - equivalent language sections.
- `templates/busa-office-*/busabase.json` - paired bilingual scenario prompts.
- Canonical workflow/config/sample files and sync scripts - native labels, specific prompts and sample prose.
- Generated `content/**/base.json`, `records.ndjson` and node sidecars - installable bilingual resources.
- App message/accessibility files and Finance/Cashier styles - localized labels and mobile wrapping.
- Template screenshot, cover and recording assets - refreshed running UI evidence.
- `scripts/check-office-templates.mjs`, `scripts/check-office-live.mjs` - coverage and installed native label checks.
- `templates.json` - regenerated catalog.
- `docs/office-management-verification.md` - bilingual scope and evidence.

## Breaking Changes

None. Machine identifiers, field types, choice IDs, relation targets and saved view configuration remain stable.

## Testing

- Independent scoped checks and typechecks for all six apps; 50 domain/provider tests.
- Static bilingual coverage, source/generated parity and strict CLI checks for all six packages.
- Fresh isolated local Busabase installation: 25 Bases, 89 fictional records and 41 views.
- Live SDK schema/record/relation checks and installed native bilingual label checks.
- Installed manual readback compared with canonical source for all six.
- Native Run browser acceptance with navigation, detail, search, locale switching and mobile detail layout.
- Refreshed real stills and covers; all 12 recordings decoded, checked for motion/loop continuity, OCR-reviewed and played in Chromium.

## Known Limits

Native names and catalog prompts are scalar strings in the current package format, so they show both languages together. Machine codes and proper names are intentionally preserved. The local verification scope and upstream Shiki packaging limitation remain documented in the acceptance report.
