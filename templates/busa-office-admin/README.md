# Administration Desk / 行政管理工作台

An independent administration workspace with certificates, supplier agreements, document provenance and owner-assigned verification tasks.

## Install

```bash
busabase-cli install ./templates/busa-office-admin --into-folder administration-desk
```

Four Bases, two native Views per Base, one read-only AirApp and a folder Skill with bilingual scenario prompts. Each Base seeds four fictional records. No other office template, external integration or credential is required.

## Daily Work

Review upcoming expiry dates, open certificates or contracts, inspect the original evidence, and ask an agent to draft follow-ups. Conflicting source dates remain unresolved until an owner checks the original. Changes use Busabase ChangeRequests and native review.

## Develop

```bash
cd templates/busa-office-admin
node scripts/sync-content.mjs --check
cd content/busa-office-admin-app
npm ci
npm run check
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3000/?demo=1`. Use `lang=zh-CN` for Chinese. Gallery scenes are `#overview`, `#certificates`, `#attention`. Demo fixtures also support `state=empty`, `partial`, `stale`, `error` and `permission` for state review.

`references/workflow.json` is the canonical declaration. Run `node scripts/sync-content.mjs` when changing schemas, samples or prompts. Demo and installed samples are generated together. `npm run build:sdk` refreshes the vendored exact-pinned SDK after dependency changes; deployment only runs `node server.js`.

The app reads one 50-row page per Base; Load more reads one page. Search and review subtotals cover loaded records. Runtime resolves an owned installation by metadata, including a renamed folder nested under a test folder, and refuses duplicate or missing ownership. The application allowlist is a code invariant; workspace permissions remain the platform security boundary.

No real original files are included. The sample archive records demonstrate provenance only. Screenshots must be recaptured from the running app before generating the catalog cover.
