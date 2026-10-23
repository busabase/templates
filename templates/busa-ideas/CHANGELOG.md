# Changelog

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
