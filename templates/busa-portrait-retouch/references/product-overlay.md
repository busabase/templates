# Product Overlay

## User And Outcome

Portrait owners and content operators create natural, identity-preserving
retouch candidates locally, then select one reviewable version without exposing
filesystem access or portrait bytes to browser business logic.

## App Type And Operating Loop

The AirApp is a focused review queue with list/detail comparison.

- Research: the trusted CLI inspects dimensions, face coverage, metadata policy,
  and source limitations. A source SHA-256 plus preset, strength, and engine
  version forms the idempotency key.
- Plan: the requested preset and strength define one candidate plan. The
  `settings` Base supplies reviewed defaults.
- Action: a trusted Agent runs the local CLI, uploads image-shaped artifacts
  through Busabase Assets, and upserts one job plus one candidate. The AirApp
  performs no image processing or external side effect.
- Retrospective: human verdicts, comments, quality checks, and blocked reasons
  stay attached to the candidate version. Aggregate tuning is intentionally not
  automated from one review.

## Human Attention And Agent Responsibilities

Humans compare before/after imagery and issue exactly one verdict: `approve`,
`request_changes`, or `block`. Every verdict is a Busabase ChangeRequest against
the exact head commit, and it follows the person's own permission: with write
access it lands at once; without it, it waits for someone who has write access,
and the app says so. The trusted Agent owns processing, asset upload,
idempotent record writes, and any requested revision. Approval only makes a
candidate eligible for an explicitly requested export; it never publishes or
replaces an original.

## Readiness And Onboarding

Runtime readiness requires explicit authentication/Space selection, the owned
app Folder, three compatible Bases, and schema version 1. Product onboarding is
separate and persists one structured `config` record with default preset,
default strength, privacy policies, completion time, and onboarding version.
No live workflow rows are returned before both dimensions are ready. With write
access the configuration lands at once; without it, the configuration
ChangeRequest remains `in_review` until someone who has write access approves it.

## Resource Map

| Resource | Type | Stable slug | Purpose | Writer | Mutation path | Version |
| --- | --- | --- | --- | --- | --- | --- |
| App root | Folder | `busa-portrait-retouch` | Ownership and discovery | AirApp setup | Node ChangeRequest | 1 |
| Jobs | Base | `busa-portrait-retouch-jobs` | Idempotent processing runs | Trusted Agent | Base/record ChangeRequest | 1 |
| Candidates | Base | `busa-portrait-retouch-candidates` | Provenance, checks, versions, verdicts | Agent + reviewer | Base/record ChangeRequest | 1 |
| Settings | Base | `busa-portrait-retouch-settings` | Structured onboarding and defaults | Reviewer | Base/record ChangeRequest | 1 |
| Portrait files | Busabase Assets | content-addressed asset IDs | Source, candidate, comparison binaries | Trusted Agent | Assets upload contract | 1 |

No Vault requirement exists because image processing is local. The browser sees
only safe node IDs, Base IDs, schema version, and resolved asset URLs.

## Screens And Delivery

The AirApp opens on an Overview (the only page with a hero and the metrics
band: first-review and changes-requested totals, plus flagged checks) followed
by the queue, approved, exported, and blocked views. Each view is one toolbar
row over a full-bleed table. Detail modes (`ui.detail_modes` in the app
config): the queue is a `split` — worked top to bottom, the comparison beside
the list; approved, exported and blocked open a `drawer`. Any candidate can
open as a full page (`#/<view>/<id>`), and on a phone every mode is a page.
Help & Settings is a dialog. Native
Views are not required because the human decision depends on an image comparison
surface unavailable in a generic table/gallery. The canonical project is
`content/busa-portrait-retouch-app/`; local Hono preview and AirApp deployment use the same source. Demo mode
is deterministic, explicitly labeled, read-only, and never establishes runtime
readiness for live data.

## Exclusions

No facial geometry changes, automatic publishing, external model upload,
original overwrite, secret entry in the AirApp, browser-side image processing,
or local-file persistence backend.
