# Verification Record

Date: 2026-09-29

## Method And Result

- `busabase-cli check . --strict --output json`: package, Skill, template and AirApp layers passed; 0 errors, 0 warnings.
- `node scripts/sync-content.mjs --check`: 12 generated files match the canonical specification; 16 sample records.
- AirApp `pnpm check`: 9 tests passed, 0 failures. Tests exercise expiry boundaries, preservation of conflicting source dates, complete record text, renamed nested installation ownership, ambiguity rejection before record access, one bounded initial page per Base, explicit continuation, partial permission failure and page normalization/deduplication.
- `npm run typecheck`: TypeScript `allowJs/checkJs` on pure domain and runtime resource-binding modules passed. DOM wiring is covered by browser acceptance and `node --check app/js/app.js`; this command does not claim whole-project strict TypeScript coverage.
- `node --check server.js`: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- Playwright opened the actual Hono app in deterministic Demo mode at 1440x900, 1280x820 and 390x844. English and Simplified Chinese navigation, detail, loaded-row search/clear, status filtering, guide Escape, mobile drawer and back passed. Empty, partial, stale, error and permission recovery states rendered. No browser page errors or horizontal page overflow.
- Six desktop WebP gallery screenshots show overview, certificates and attention in both locales. Mobile and dark screenshots are additional evidence. Images contain no rendered resource IDs.
- The standard cover renderer ran after screenshot capture; its check passed: first gallery asset, 1440x900 WebP, actual overview screenshot source. OCR across both templates' 14 gallery images found no upstream workspace or author branding.

## Limits

Local Demo screenshots prove the interface and deterministic data path. They do not prove the Busabase viewer's ambient session or hosted engine. The integration owner performs isolated scratch installation, canonical record readback and deployed Run verification separately. No real identity document, workspace ID, credential or original source material is distributed.
