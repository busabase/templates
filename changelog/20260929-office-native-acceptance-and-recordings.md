---
title: 2026-09-29 Office native acceptance and recordings
---

# Office Native Acceptance And Recordings

Date: 2026-09-29
Author: AI Assistant
AI Agent: OpenAI Codex

## Prompts & Instructions

**Original Request:**
> 继续验收到绿色，并给我 PR。模板录屏、封面都搞了。使用 kapps 的 busabase-template-creator skill。你自己本地 npx busabase 做测试。

**Refined Instructions:**
- Complete all six independent office templates with bilingual gallery recordings.
- Verify installed apps through the native local Busabase Run surface.
- Document actual evidence and scope, then update the existing PR for review.

## What Changed

- Added twelve silent bilingual workflow recordings, tracked by Git LFS.
- Declared the primary video for each template and regenerated the catalog.
- Updated the acceptance report with local native runtime evidence and publishing checks.

## Why

The catalog needs demonstrable workflows, and the user selected local Busabase for the final acceptance target.

## Files Affected

- `templates/busa-office-*/busabase.json` - primary gallery video declarations.
- `templates/busa-office-*/assets/recordings/*.mp4` - six English and six Chinese walkthroughs.
- `templates.json` - generated catalog with primary video URLs.
- `docs/office-management-verification.md` - publishing gate, native runtime, screenshots and recording results.

## Breaking Changes

None.

## Testing

- Fresh isolated `npx busabase@latest` 0.90.2 installation: six templates, 25 Bases, 89 records, 41 views.
- Live SDK schema, record, count and relation verification passed for all six installs.
- Playwright native Run: all business tabs, detail, typed search, empty result, both locales and 390px layout passed.
- Every runtime reported browser hosting without a development proxy; no page errors or invalid record reads.
- Strict CLI format checks and generated cover checks passed for all six; catalog current.
- All twelve recordings decoded, contained moving nonblank frames, returned to their initial view, and played to completion in Chromium.
- Recording interaction frame OCR found no upstream branding. All media links were checked before publishing the report.
- Existing 50 domain/provider tests and scoped typechecks remain documented in the original acceptance report; this follow-up changes media and metadata only.

## Known Limits

Cloud login and OAuth were outside the user-selected local acceptance scope. Existing instance-conflict handling, generated manual prompt transport and loaded-record summaries are documented in the verification report.
