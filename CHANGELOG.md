# Changelog

## Unreleased

- Add a B2B CRM Sales Overview with exact account and Deal-stage counts, a multi-currency Revenue Rail, bounded follow-up attention, and responsive activity and outcome views.
- Replace character and hand-drawn B2B CRM controls with a tree-shaken, locally bundled Lucide icon system; add restrained iconography to navigation and actions, plus large left-column icons and deep-green values for Overview KPIs.
- Expand B2B CRM's isolated Demo provider to 30 related records, covering every Deal stage and a varied seven-day Activity rhythm without changing installed Base sample data.
- Give Overview work, activity, and outcome panels a consistent surface background, light border, 8px radius, and responsive chart height against the neutral canvas.
- Refine Overview KPI icons into borderless square containers and add a once-per-tab, reduced-motion-aware entrance sequence for KPI count-up, Revenue Rail fills, Activity bars, and panel groups.
- Add restrained semantic row backgrounds to Today's focus for overdue, closing-soon, incomplete, and complete states while retaining status dots as a secondary cue.
- Add a shared, repeatable Base UI rollout for both single-stylesheet and cascade-layer AirApps.
- Upgrade B2B CRM and Busa Email to the canonical type, radius, surface, motion, and component tokens.
- Add native dark color-scheme support while preserving each template's existing DOM and JavaScript behavior.

## Verification

- Both app checks and the rollout unit tests pass; Busa Email passes 10 tests with its existing
  live-server conformance test skipped when `BUSABASE_LIVE_TEST_URL` is absent.
- Strict template validation reports zero errors and zero warnings, and the generated catalog is current.
- Light/dark desktop/mobile browser matrices pass without horizontal overflow; sticky and modal
  header backgrounds are asserted to change with the selected color scheme.
- Local Demo verification does not validate a deployed Busabase ambient session.
