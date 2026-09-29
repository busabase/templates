# Verification Record

Date: 2026-09-29

## Method And Result

- `busabase-cli check . --strict --output json`: package, Skill, template and AirApp layers passed; 0 errors, 0 warnings.
- `node scripts/sync-content.mjs --check`: 12 generated files match the canonical specification; 16 sample records.
- AirApp `pnpm check`: 9 tests passed, 0 failures. The payroll test confirms that only approved/paid, finite explicit inputs in the selected month are included; drafts, missing deductions and other months are excluded. The fixture confirms proposed raises never change confirmed salary and missing salary remains undefined. Complete record text, ownership, pagination, partial failure and normalization paths are also exercised.
- `npm run typecheck`: TypeScript `allowJs/checkJs` on the pure domain and resource-binding modules passed. DOM wiring is exercised by browser acceptance and syntax checks, not presented as whole-project strict TypeScript coverage.
- `node --check server.js` and `node --check app/js/app.js`: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- Playwright opened the actual Hono app in Demo mode at 1440x900, 1280x820 and 390x844. English and Chinese routes, details, search/clear, status filter, guide Escape, mobile drawer and back passed. Empty, partial, stale, error and permission states rendered. No browser page errors or horizontal page overflow. Review metrics were compressed so the working list remains visible on mobile.
- Six desktop WebP gallery images show overview, monthly payroll and attention in both locales. Mobile and dark screenshots provide additional evidence. No resource IDs are rendered.
- Standard cover generation ran after screenshots and passed its structural check: first gallery asset, 1440x900 WebP, actual overview source. OCR across both templates' 14 gallery images found no upstream branding.

## Limits

Demo screenshots validate the interface, not the hosted viewer's session or engine. Real scratch installation, seed readback and deployed Run acceptance are handled by the integration owner. Salary examples, names and payment references are fictional. This package includes no payment integration, payslip sending or tax calculation.
