# Busa Client Reporting

Busa Client Reporting is a Busabase-backed App-in-Skill for agencies and
service providers: keep each client's projects, deliverables, KPI snapshots
and milestones in one place, and share a single read-only report page with
the client.

## What It Shows

- **Overview** — every client as a card with its rollups: active projects
  (flagging any at risk), deliverables awaiting the client, and the status
  of its latest report. Pick a client to open its report page.
- **Client Report** — the client-facing page for one client and period:
  the executive summary and highlights from the latest Ready to Share or
  Shared report, KPI cards with change versus the previous period and
  versus target (computed, never stored), deliverables grouped by status,
  a milestone timeline, and next steps. Internal fields — internal notes,
  project owners, risks & blockers — never render here.
- **Reports** — every report and where it stands: Draft, In Review, Ready
  to Share, Shared, with a detail drawer.

The app is **read-only in v1**. Editing happens in the Bases or through
the agent following the `busa-client-reporting` skill; sharing happens by
creating a node-level read-only share link on the report/app node in
Busabase and sending it to the client outside the app. See
`content/reporting-guide.md` for the sharing flow and `SKILL.md` for the
full operator manual.

## Run It

```bash
cd content/busa-client-reporting-app
pnpm install
pnpm dev
```

Add `?demo=1` to see the deterministic fictional demo data without a
Busabase connection:

```text
/?demo=1#/overview
/?demo=1#/report
/?demo=1#/reports
```

Demo mode never reads or writes Busabase.

## Data

All persistent data lives in six Busabase Bases under the
`busa-client-reporting` Folder — `clients`, `projects`, `deliverables`,
`metrics`, `milestones`, `reports`. See `SKILL.md` for the resource map
and `references/client-reporting-schema.md` for the field-by-field schema.
The sample rows are fictional (`.example` domains throughout).

Regenerate the package's `content/` after editing the app config — the
Base declarations are generated, never hand-edited:

```bash
node scripts/sync-content.mjs        # regenerate
node scripts/sync-content.mjs --check # verify
```
