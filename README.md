<div align="center">

# Busabase Templates

**Complete apps you can install into a Busabase workspace.**

</div>

---

A template here is not a set of empty tables. It is an **app**: its tables, an
AirApp that renders them, sample rows so it is not blank when you open it, and —
the part that matters — the manual its author wrote for the agent that will
operate it.

That manual is why an installed template is usable immediately. Ask an agent to
"triage this morning's mail" and it does not have to guess your schema; the
template installed the instructions alongside the data.

## Install one

From the dashboard, open **Templates** in the workspace menu, pick one, and
review what it would create before confirming.

Or from a terminal:

```bash
npx busabase-cli install https://github.com/busabase/templates --skill busa-email
```

Review the package before installing: it includes executable app and agent
instructions. Installation is permission-aware. With write access, content
can merge immediately; use `--require-review` when you want it held for review.
Template sample records merge by default so the first screen has data.
`--no-sample-records` proposes those rows for review instead.

## Office Management

These six templates install independently. Each includes its own workflow
tables, fictional examples, agent manual, scenario prompts and a read-only desk.

| Template | Workflow |
| --- | --- |
| [Administration Desk](templates/busa-office-admin) | Certificates, administrative contracts, original-document provenance and verification tasks |
| [Office Finance](templates/busa-office-finance) | Reimbursements, invoice requests, monthly actuals and filing review |
| [Cashier Desk](templates/busa-office-cashier) | Bank checks, payment requests, cash movements and reconciliation evidence |
| [People & Payroll](templates/busa-office-hr) | Employees, labor contracts, salary changes and payroll review |
| [Recruiting Desk](templates/busa-office-recruiting) | Hiring positions, applicants, interview feedback and offer review |
| [Legal Case Desk](templates/busa-office-legal) | Case progress, preservation dates, recovery evidence and counsel follow-up |

For example:

```bash
npx busabase-cli install https://github.com/busabase/templates --skill busa-office-admin
```

The desks organize evidence and human decisions. Actual payments, invoice
issuance, filings, offer sending and legal commitments are separate authorized
operations; installing a template does not execute them.

## What is in a template

```
busa-email/
├── SKILL.md          the manual — what the tables mean, and what the app must never do
├── busabase.json     the manifest, plus the catalog metadata (category, screenshots, prompts)
├── content/          the resources, as plain files
│   ├── reviews/base.json + records.ndjson
│   └── busa-email-app/          the AirApp — a real Node project you can run locally
└── assets/screenshots/
```

The same directory works two ways: `npx skills add` treats it as an Agent Skill,
and Busabase treats it as an installable package. One source, so the two can
never drift.

## Publishing one

Export a folder you have already built:

```bash
npx busabase-cli export <folder-slug> -o ./my-template --template
```

That writes this layout, and generates a `SKILL.md` draft from your folder's
structure if it has no Skill node yet. Fill in its TODOs — an agent acts on what
that file says — then open a pull request here.

`templates.json` is the catalog the dashboard reads. It is generated, not
hand-edited:

```bash
npx busabase-cli index . --repo busabase/templates -o templates.json
```

Whether a template is listed is decided by the same rules that decide how it
installs, so a card can never promise something its install does not do. A
template that declares itself one and does not qualify is reported in the
catalog's `rejected` list with the reason.

## Why this is not in `busabase/skills`

That repository holds the two general-purpose Busabase skills, and people clone
it to install them. Templates carry an entire app each — source, screenshots,
sample data — so keeping them there would make every skill install pay for every
template. They are separate repositories for the same reason a package manager
does not ship its examples inside its client.

## License

MIT, unless a template says otherwise in its own `busabase.json`.
