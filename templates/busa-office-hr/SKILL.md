---
name: busa-office-hr
description: Operate an HR and payroll review desk for employee records, labor contract renewals, salary proposals and monthly payroll inputs. Use when checking payroll readiness, missing employee data or contract renewal responsibilities.
metadata:
  category: hr
  tags:
    - office
    - hr
    - payroll
    - risk:read-only
  busabase:
    template: true
    folderSlug: busa-office-hr
    resources:
      - employees
      - labor-contracts
      - salary-changes
      - payroll
    risk: read-only
---

# People & Payroll Desk / 人事薪酬工作台

Read this manual before working on the folder. Discover the owned installation (`appId: busa-office-hr`, `resourceKey: app-root`) and its own resources; never choose a same-name Base from another folder. If two installations exist, ask which folder is intended before operating. Workspace permissions must restrict employee and compensation information.

## Monthly Workflow / 月度流程

1. Confirm the payroll month and authoritative employee roster. Read bounded pages and preserve cursors. Employee headcount is based solely on employee records, never the number of contracts or payroll rows.
2. Compare the roster with the month's payroll by `employee-code` and `period`. Flag missing people, duplicates, unexpected payroll rows and missing inputs. A partially loaded roster cannot certify completeness.
3. Confirm salary and attendance evidence. Proposed salary changes never overwrite `employees.confirmed-salary`. A approved future change does not enter earlier payroll months. Preserve missing deductions and salaries as missing, never assume zero.
4. Draft one payroll row per month and employee business code. Check `(period, employee-code)` first for idempotency. Keep evidence notes and the reviewer.
5. Summarize aggregate readiness first: missing inputs, approvals needed and confirmed subtotal. Do not dump each person's salary or sensitive details into chat. Provide person-level details only for an explicitly requested authorized review.
6. Propose changes through Busabase ChangeRequests when requested. Preserve approval evidence and read response status; pending is not merged, approval is not payment.

先确认月份与花名册，用员工业务编号核对工资项目。缺人、重复项目、未确认工资和扣款均列为待复核，不猜数。月度工资按「月份 + 员工编号」去重。先汇报汇总复核情况，避免在聊天中批量公开个人薪酬；记录修改走变更申请，批准不代表已付款。

## Resources And Fields / 资源与字段

| Base | Meaning and fields | Lifecycle |
| --- | --- | --- |
| `employees` | `title`, `employee-code`, `department`, `owner`, `joined`, `confirmed-salary`, `notes`; the employee roster is the only source of employee identity and current confirmed salary. | `active`, `incomplete`, `leave` |
| `labor-contracts` | `title`, `employee-code`, `owner`, `starts`, `expires`, `notes`; contract renewal and original-signature evidence. | `signed`, `renewal`, `unsigned` |
| `salary-changes` | `title`, `employee-code`, `owner`, `effective`, `proposed-salary`, `approval-ref`, `notes`; proposed salary and decision history are separate from confirmed employee salary. | `proposed`, `approved` (not yet applied), `applied`, `rejected` |
| `payroll` | `title`, `employee-code`, `period`, `owner`, `due`, `gross-pay`, `deductions`, `notes`; each amount is an explicit input, not a tax-engine output. | `draft`, `in-review`, `approved`, `paid`, `rejected`, plus `missing-input` and `review` attention states |

Business references link the independent Bases without shipping real record IDs. Dates are ISO calendar dates and `period` is `YYYY-MM`. Amounts use CNY solely for these fictional examples. No jurisdictional tax or social insurance formulas are supplied. Before using another currency or pay cycle, explicitly define the policy and revise the schema rather than mixing units.

## Decision Boundaries / 决策边界

- Payroll follows draft -> in-review -> approved -> paid or rejected. `paid` requires an authorized payment result, date and reference in evidence notes; approved does not authorize transfer or prove settlement.
- Only approved or paid payroll items with both finite explicit `gross-pay` and `deductions` enter confirmed net pay (`gross-pay - deductions`). Drafts, missing inputs and attendance reviews are excluded. The AirApp labels this as a loaded subtotal for the selected month.
- Applying a salary change requires confirmed approval evidence and an effective date. The read-only AirApp does not apply changes, send payslips, submit tax declarations or make payments.
- Contract expiries within 60 days, unsigned contracts, proposed or approved-but-unapplied salary decisions, and incomplete payroll inputs need human review.
- External approval or payment integrations are optional future work requiring explicit authorization and trusted execution; this template has none and requires no other office template.
- Restrict payroll node access in the workspace. Do not copy private compensation tables or credentials into public files, gallery images or chat summaries.

## Runtime And Installation

Install the complete package independently. Runtime binding reads one depth-three metadata tree, selects exactly one owned root, gets its folder, matches each owned child by `resourceKey`, and passes runtime IDs/slugs to SDK `inspectProvisionedResources`. The static package has no workspace IDs, does not repair ownership and stops on ambiguity or missing resources. Live queries fetch one page of at most 50 rows per Base, plus exact count calls. Load more fetches one additional page; loaded-row search never claims to search the entire Base.

Each Base contains four synthetic rows, shared between demo and fresh install. Sam has no confirmed salary and no computed pay; Alex's proposed raise is excluded; Riley's November change is excluded from September; Jamie's attendance and deduction review remains unresolved.

## Source And Verification

Edit `references/workflow.json`, run `node scripts/sync-content.mjs`, then `node scripts/sync-content.mjs --check`. The independent project is `content/busa-office-hr-app`. Run `npm run check`, `npm run typecheck`, `node --check server.js` and `busabase-cli check .`. Local deterministic gallery screenshots and API tests are evidence of their own paths, not a substitute for installed Busabase Run acceptance.
