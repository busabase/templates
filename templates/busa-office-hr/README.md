# People & Payroll Desk / 人事薪酬工作台

An independent HR workspace for employee records, labor contract renewals, salary proposals and monthly payroll review.

## Install

```bash
busabase-cli install ./templates/busa-office-hr --into-folder people-payroll-desk
```

Four Bases, two native Views per Base, a read-only AirApp and a folder Skill. Four synthetic records per Base give a ready-to-review month with missing inputs, unsigned and expiring contracts, a proposed raise and an approved future change. No finance or cashier template is needed.

## Daily Work

Start with the authoritative employee roster. Review expiring labor contracts and compare salary proposals with confirmed salary inputs. Check payroll by month and employee business code; missing inputs stay missing. Approved payroll is distinct from paid payroll. The Skill uses ChangeRequests for requested proposals; no payment, payslip sending or tax formula is included.

## Develop

```bash
cd templates/busa-office-hr
node scripts/sync-content.mjs --check
cd content/busa-office-hr-app
npm ci
npm run check
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3000/?demo=1`; add `lang=zh-CN` for Chinese. Screens are `#overview`, `#payroll`, `#attention`, plus each Base. `state=empty`, `partial`, `stale`, `error` and `permission` exercise user-visible recovery states.

Edit `references/workflow.json`, then regenerate using `node scripts/sync-content.mjs`. The demo and installed seed rows come from the same specification. `npm run build:sdk` produces the vendored SDK; production starts only the Hono server.

Every Base read is capped at 50 rows and continues only on Load more. Search and net pay are explicitly loaded-row views, and net pay includes only approved or paid rows with confirmed finite inputs in the selected month. Employee headcount is never inferred from contract or payroll counts. The application resolves resource ownership metadata and refuses ambiguous installations; the viewing user's workspace permissions govern access.

All names, salaries and payment evidence are fictional. Restrict real employee and payroll nodes with workspace permissions. Verify real install-and-open separately from deterministic local gallery screenshots.
