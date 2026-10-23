# Changelog

## 2026-10-23 — Public installation and first-deck instructions

### Request

A user could install the public Busabase skills but could not finish PPT
Factory setup because its manual required an unavailable private author
skill. Fix the prerequisite and verify the workflow after installation.

### Changes

- Make the end-user contract self-contained and give the installation
  commands for the public workspace-operation and app-maintenance skills.
- Separate local Agent installation, workspace resource installation, and
  trusted PPTX generation, including partial-installation recovery.
- Resolve script paths from the actual installed skill root, provide a
  dependency lockfile for `npm ci`, and ignore private exports and local
  credential files.
- Explain that built-in PPTX files are drafts with visual-brief text, and
  require rendering and visual QA before client delivery.

### Verification

- CLI 0.98.0 template check: zero errors and warnings before and after.
- Generated catalog index and checked it against the repository; checked
  permission-aware AirApp writes.
- Installed both public dependencies into a new project and installed the
  complete revised skill from a clean distribution into another new Agent
  directory. With no preinstalled `node_modules`, `npm ci` and the trusted
  generator's help command succeeded.
- Installed into a new local Busabase OSS/PGlite workspace: seven Bases,
  three package sample rows, an AirApp, and a Skill; zero pending requests.
- Opened the real installed AirApp from Home and its Folder, using the
  browser Nodepod runtime. The app read separate fictional acceptance
  records through real HTTP; no demo provider was used.
- A deck with status `approved` but no `decision-action` was refused by the
  generator. Approved its two slide cards and the deck through the AirApp,
  generated a real two-slide PPTX, and read the generated deck/export fields
  back through HTTP. Rendered it with LibreOffice for visual inspection.
- Existing AirApp checks and all eleven model tests passed. No resource
  schema, application UI, or generation layout was changed.

### Existing limitations

- The built-in generator produces drafts, not finished illustrations or
  client-ready designs. Render QA remains a separate workflow step.
- Existing `sync-content.mjs --check` reports all seven Base sidecars stale:
  they already contain node agent prompts absent from the config, and the
  old generator would remove those prompts. This change leaves both the
  Base sidecars and sync script untouched.
- This validates the local OSS/Nodepod and trusted-process path, not a new
  production deployment or every external Agent client.
