# Busa MV changes

## 2026-10-28 — Keep the installed Skill runtime complete

Date: 2026-10-28
Author: AI Assistant
AI Agent: Codex

### Prompts and instructions

Continue the community follow-up for the `busa-mv` installation preflight:
verify whether omitted Skill dependencies affect real scripts, then prepare a
reviewable fix without writing to the reporter's Space or running generation.

### What changed and why

The package installer carries the root `SKILL.md`, `references`, `agents`, and
`scripts` into the Skill node. Trusted scripts previously imported the separate
AirApp's config/model and read catalog assets, so they failed after installing
only the Skill files. The SDK dependency manifest stayed outside that set too.

A generated runtime bundle now carries the config, model, starter project,
and dependency manifest inside `scripts`. `sync-skill-runtime.mjs --check`
checks those copies against their canonical sources. Command help and
source-checkout requirements are explicit. Runtime write/generation behavior,
the AirApp UI, and workspace data models are unchanged.

### Files affected

- `scripts/lib` and `scripts/data`: shipped copies of the canonical runtime dependencies.
- `scripts/package.json`: generated, pinned SDK dependency manifest.
- Trusted runtime command imports and `create_sample_project.mjs`: use the shipped bundle.
- `scripts/sync-skill-runtime.mjs`: deterministic generation and drift checking.
- Source setup/publish/sync commands: explain the full-checkout requirement.
- `README.md`, `SKILL.md`, and root `package.json`: installation and maintenance commands.
- `test/installed-skill.test.mjs`: isolated installed-file integration coverage.

### Breaking changes

None. Existing command paths remain valid. A downloaded Skill now supports
`npm install --prefix scripts --ignore-scripts` to install its pinned dependency.

### Validation

- Installed-file integration: 7 passing tests, including real npm dependency
  installation, command help, starter dry run, local readiness/Markdown export,
  and safe credential/source checks.
- AirApp checks and 9 existing model tests pass.
- `busabase-cli check`: 0 errors, 0 warnings before and after.
- Repository write-policy and SDK-helper audits pass.
- Runtime bundle drift check and Node syntax checks pass.
- Catalog regeneration introduces only a pre-existing unrelated template count
  correction; that delta is excluded. `index --check` therefore retains the
  baseline stale-catalog failure.
- Existing `sync-content.mjs --check` also retains its baseline mismatch with
  authored Base metadata; no Base sidecar is rewritten by this fix.
- No paid generation, remote Space writes, Windows run, or hosted AirApp
  installation was performed. Existing installed Skill nodes still require an
  approved refresh after this change is released.
