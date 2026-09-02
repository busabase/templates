# Changelog

## Unreleased

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
