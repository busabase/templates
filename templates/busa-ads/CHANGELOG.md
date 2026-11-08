# Busa Ads changes

## 0.1.1 — Installed Skill runtime and Campaigns samples

The installer copies the root Skill (`SKILL.md`, `references/`, `agents/`,
`scripts/`) and does not npm-install dependencies. Runtime scripts imported
`busabase-sdk` plus AirApp files under `content/`, which are separate nodes,
so `node scripts/ingest_reports.mjs` failed with `ERR_MODULE_NOT_FOUND` after
install.

`scripts/package.json`, `scripts/lib/config.js`, and `scripts/lib/ads-model.js`
now travel with the Skill. Install the dependency with
`npm install --prefix scripts --ignore-scripts`, then run the scripts. The
package reader still does not install npm dependencies; the Skill manual says
so.

Campaigns sample rows used review-workflow placeholders (`needs_review`,
`approved`, `done`, and prose in `daily` / `targets`). They now use
`amazon|meta|tiktok` platforms, `active|paused` statuses, and JSON `daily`
and `targets` arrays from the Nimbus Home demo shape.
