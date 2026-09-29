# Cashier Desk / 出纳管理

Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money.

Standalone template with 4 Bases, fictional seed records, a workflow Skill and bilingual node prompts. The app is read-only. Search and filters apply to loaded records; monetary subtotals are labelled loaded-only and grouped by currency. No bank, invoice or tax integration is installed.

Install: `busabase-cli install . --into-folder <your-test-folder>`.

Local verification: `cd content/busa-office-cashier-app && pnpm install && pnpm check && PORT=18122 pnpm dev`; open `http://127.0.0.1:18122/?demo=1`. Demo and installed seeds share the same sample source. Local demo does not prove the hosted session bridge; installation acceptance is performed separately.

Schemas and samples: `app/js/config.js` and `app/js/samples.js` are canonical. Run `node scripts/sync-content.mjs` after edits; check parity with `--check`.
