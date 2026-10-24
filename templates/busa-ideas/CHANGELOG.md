# Changelog

## 0.2.2 — 2026-10-24 — Distinguish PRD stage from reviewed handoff

Request: community `fsyqhi` reports an unfinished PRD being shown as finalized.
The PRD-rung shortcut returned complete without inspecting any document.

- Keep stage progression separate from document readiness. PRD overview lists
  missing body/status/gaps, required details, unanswered questions, duplicate
  PRDs and incomplete reads; a ready record asks the human to read and confirm
  handoff explicitly, never starts building.
- Share the canonical document check across list/detail badges, document
  metrics, and clarity: nonempty body, `已完善`, and no meaningful gaps.
  Invalid legacy gaps remain visible; whitespace-only entries are omitted.
  Inconsistent complete labels display as draft without rewriting data.
- Add a PRD review/handoff overview panel and English/Chinese explanations.
  Clarify professional review responsibility, proposals versus merged data,
  and preserving existing installs during upgrades.
- Add an explicit read-only recheck: exact Idea lookup, one filtered page per
  Documents/Questions Base (50 each), and bounded existing review projections.
  It refreshes only the selected Idea and its review cards, preserves drafts,
  ignores late navigation responses, and permits retry after a failed read.
- Keep schemaVersion 2 and existing SDK 0.99.0 helper adoption. No schema,
  fields, mutation actions, generated SDK bundles, or seed records changed.

Scoped recheck also recalculates loaded waiting/ready/parked counters while
retaining the authoritative Idea total. Compact list badges keep the same
readiness rule and fit Chinese/English390px cells; full detail guidance stays.

Validation: all 50 app unit/regression tests pass, independently rerun by the
reviewing agent. Six real browser stories against OSS0.99.0/PGlite cover the
readiness matrix, owner Inbox review/merge, English/Chinese,390px and dark,
global versus selected-Idea page boundaries, and a delayed real response after
navigation. An additional targeted browser run verifies recheck updates the
waiting counter and preserves the authoritative total. Real provider+HTTP
regression preserves a half-merged required pair alongside an ordinary pending
answer and clears only the merged side. Fresh package installation has no
warnings or pending resources; deployed runtime files are read back against
the reviewed source. Strict template, content sync, catalog index and existing
write/shared-helper guards pass. Screenshots and validation details are attached
to the PR.

Acceptance environment: published OSS0.99.0 omits declared Shiki runtime files
needed by its homepage. The private acceptance-host copy restores those declared
Shiki3.23.0 dependencies without changing application/API source. No production
deployment is claimed.

Known boundary: metadata checks cannot evaluate arbitrary prose or prove
semantic quality. Existing apps need a reviewed code update and restart.
Reads stay bounded; this change never adds an automatic full scan.


## 0.2.1 — 2026-10-24 — Keep ordinary question submissions visible during review

Request: fix the Ideas answer workflow reported in community post `x8xvmc`:
operators could not tell whether an answer needed review and submitted again.

- Ordinary follow-up answers and skips now restore active review state after a
  refresh, display the exact submitted answer, and link to the Workspace Inbox.
  Hosted Nodepod uses its observable parent dashboard when referrer is empty;
  standalone previews keep the selected OAuth origin and Space.
- Identical submissions use a server idempotency key on a one-record bulk
  update. A different pending action is refused, and rejected or closed
  requests can be submitted in a new review cycle. A changes-requested review
  remains active and points to revising the existing request in the Inbox.
- UI actions are disabled during submission. Drafts survive failed writes and
  refreshes; success followed by a failed refresh is described separately.
- Checks remain bounded: 20 active and 20 rejected/closed requests per action;
  an incomplete read blocks a new submission rather than guessing.
- Align template, app, and private tooling package version at 0.2.1; refresh
  existing versioned browser imports. Keep schemaVersion 2 (no data migration).
  The AirApp sidecar has no version key and remains unchanged; the deployed
  app package identifies its code version.
- Required Question/Idea paired-write recovery remains intact; its wording is
  separate from ordinary one-record answers. No schema or data migration.
- Added English/Chinese workflow and safe existing-installation upgrade notes.

Validation: 23 existing model tests and 11 new review regression stories pass.
Real HTTP/browser acceptance is recorded separately by the reviewing agent.

Boundary: existing installations require an explicit app-code update and
restart. Existing duplicate requests are not removed or auto-approved. Two
clients proposing different answers simultaneously may each create a proposal;
merge conflict handling protects canonical data, and the Inbox exposes both.

Additional browser regression: a required Question and its Idea update produce
two real proposals; merging the Question alone keeps its pending card, and
merging the Idea side clears pending and updates the canonical field. Mobile
Chinese copy and the exact Inbox link fit at390px after the existing sidebar
transition settles; no CSS changed. Hosted Nodepod initially exposed an empty
referrer, which the final parent-dashboard resolution now handles.

Acceptance environment: the published OSS0.98.0 package omitted the Shiki
runtime dependency files needed by its host homepage. The reviewing agent used
a private copy with its declared Shiki3.23.0 dependencies restored; application
and API source stayed unchanged. This is not a production deployment test.
