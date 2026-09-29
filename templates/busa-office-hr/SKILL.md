---
name: busa-office-hr
description: Operate an HR and payroll review desk for employee records, labor contract renewals, salary proposals and monthly payroll inputs. Use when checking payroll readiness, missing employee data or contract renewal responsibilities. / 管理员工档案、劳动合同续签、薪酬提案和月度工资输入；用于检查工资准备情况、缺失员工资料和合同续签责任。
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

## English

Read this manual before working on the folder. Discover the owned installation (`appId: busa-office-hr`, `resourceKey: app-root`) and its own resources; never choose a same-name Base from another folder. If two installations exist, ask which folder is intended before operating. Workspace permissions must restrict employee and compensation information.

### Monthly Workflow

1. Confirm the payroll month and authoritative employee roster. Read bounded pages and preserve cursors. Employee headcount is based solely on employee records, never the number of contracts or payroll rows.
2. Compare the roster with the month's payroll by `employee-code` and `period`. Flag missing people, duplicates, unexpected payroll rows and missing inputs. A partially loaded roster cannot certify completeness.
3. Confirm salary and attendance evidence. Proposed salary changes never overwrite `employees.confirmed-salary`. An approved future change does not enter earlier payroll months. Preserve missing deductions and salaries as missing, never assume zero.
4. Draft one payroll row per month and employee business code. Check `(period, employee-code)` first for idempotency. Keep evidence notes and the reviewer.
5. Summarize aggregate readiness first: missing inputs, approvals needed and confirmed subtotal. Do not dump each person's salary or sensitive details into chat. Provide person-level details only for an explicitly requested authorized review.
6. Propose changes through Busabase ChangeRequests when requested. Preserve approval evidence and read response status; pending is not merged, approval is not payment.

### Resources And Fields

| Base | Meaning and fields | Lifecycle |
| --- | --- | --- |
| `employees` | `title`, `employee-code`, `department`, `owner`, `joined`, `confirmed-salary`, `notes`; the employee roster is the only source of employee identity and current confirmed salary. | `active`, `incomplete`, `leave` |
| `labor-contracts` | `title`, `employee-code`, `owner`, `starts`, `expires`, `notes`; contract renewal and original-signature evidence. | `signed`, `renewal`, `unsigned` |
| `salary-changes` | `title`, `employee-code`, `owner`, `effective`, `proposed-salary`, `approval-ref`, `notes`; proposed salary and decision history are separate from confirmed employee salary. | `proposed`, `approved` (not yet applied), `applied`, `rejected` |
| `payroll` | `title`, `employee-code`, `period`, `owner`, `due`, `gross-pay`, `deductions`, `notes`; each amount is an explicit input, not a tax-engine output. | `draft`, `in-review`, `approved`, `paid`, `rejected`, plus `missing-input` and `review` attention states |

Business references link the independent Bases without shipping real record IDs. Dates are ISO calendar dates and `period` is `YYYY-MM`. Amounts use CNY solely for these fictional examples. No jurisdictional tax or social insurance formulas are supplied. Before using another currency or pay cycle, explicitly define the policy and revise the schema rather than mixing units.

### Decision Boundaries

- Payroll follows draft -> in-review -> approved -> paid or rejected. `paid` requires an authorized payment result, date and reference in evidence notes; approved does not authorize transfer or prove settlement.
- Only approved or paid payroll items with both finite explicit `gross-pay` and `deductions` enter confirmed net pay (`gross-pay - deductions`). Drafts, missing inputs and attendance reviews are excluded. The AirApp labels this as a loaded subtotal for the selected month.
- Applying a salary change requires confirmed approval evidence and an effective date. The read-only AirApp does not apply changes, send payslips, submit tax declarations or make payments.
- Contract expiries within 60 days, unsigned contracts, proposed or approved-but-unapplied salary decisions, and incomplete payroll inputs need human review.
- External approval or payment integrations are optional future work requiring explicit authorization and trusted execution; this template has none and requires no other office template.
- Restrict payroll node access in the workspace. Do not copy private compensation tables or credentials into public files, gallery images or chat summaries.

### Runtime And Installation

Install the complete package independently. Runtime binding reads one depth-three metadata tree, selects exactly one owned root, gets its folder, matches each owned child by `resourceKey`, and passes runtime IDs/slugs to SDK `inspectProvisionedResources`. The static package has no workspace IDs, does not repair ownership and stops on ambiguity or missing resources. Live queries fetch one page of at most 50 rows per Base, plus exact count calls. Load more fetches one additional page; loaded-row search never claims to search the entire Base.

Each Base contains four synthetic rows, shared between demo and fresh install. Sam has no confirmed salary and no computed pay; Alex's proposed raise is excluded; Riley's November change is excluded from September; Jamie's attendance and deduction review remains unresolved.

### Source And Verification

Edit `references/workflow.json`, run `node scripts/sync-content.mjs`, then `node scripts/sync-content.mjs --check`. The independent project is `content/busa-office-hr-app`. Run `npm run check`, `npm run typecheck`, `node --check server.js` and `busabase-cli check .`. Local deterministic gallery screenshots and API tests are evidence of their own paths, not a substitute for installed Busabase Run acceptance.

## 简体中文

操作本文件夹前先阅读本手册。通过 `appId: busa-office-hr` 和 `resourceKey: app-root` 定位所属安装实例及其资源，不选择其他文件夹的同名台账。如存在两个安装实例，操作前请用户指定目标文件夹。工作区权限必须限制员工与薪酬信息访问。

### 月度流程

1. 确认工资月份与权威员工花名册。分页读取并保留续读游标。员工人数仅依据员工档案，不依据劳动合同或工资记录行数。
2. 按 `employee-code` 和 `period` 将花名册与当月工资核对。标出遗漏人员、重复记录、额外工资记录和缺失输入。部分加载的花名册不能证明完整性。
3. 确认工资与出勤证据。薪酬提案不得覆盖 `employees.confirmed-salary`。已批准的未来变动不计入更早月份的工资。扣款或工资缺失时仍保留为缺失，不按零处理。
4. 按月份和员工业务编号拟定工资记录。先检查 `(period, employee-code)`，保证同一事项不重复写入，并保留证据说明与复核人。
5. 先汇报整体准备情况：缺失输入、待批准事项和已确认小计。不要在聊天中批量公开每人的工资或敏感细节。仅在用户明确要求且有权限的复核中提供个人明细。
6. 用户要求时通过 Busabase 变更申请提出修改。保留审批证据并读取返回状态；待审核不等于已合并，已批准不等于已付款。

### 资源与字段

| 台账 | 含义与字段 | 生命周期 |
| --- | --- | --- |
| `employees`（员工花名册） | `title` 员工姓名、`employee-code` 员工业务编号、`department` 部门、`owner` 人事负责人、`joined` 入职日期、`confirmed-salary` 已确认月薪、`notes` 确认说明。花名册是员工身份与当前已确认工资的唯一来源。 | `active` 在职、`incomplete` 资料待补、`leave` 休假中 |
| `labor-contracts`（劳动合同） | `title` 合同名称、`employee-code` 员工业务编号、`owner` 人事负责人、`starts` 生效日期、`expires` 到期日期、`notes` 原件与续签说明。留存续签情况与签署原件证据。 | `signed` 已签署、`renewal` 待续签、`unsigned` 待签署 |
| `salary-changes`（薪酬变动） | `title` 薪酬提案、`employee-code` 员工业务编号、`owner` 审批负责人、`effective` 拟生效日期、`proposed-salary` 拟议月薪、`approval-ref` 审批证据编号、`notes` 决定说明。薪酬提案与决定历史独立于花名册中的已确认工资。 | `proposed` 待批准、`approved` 已批但尚未应用、`applied` 已应用、`rejected` 已拒绝 |
| `payroll`（月度工资） | `title` 工资项目、`employee-code` 员工业务编号、`period` 工资月份、`owner` 工资复核人、`due` 复核截止、`gross-pay` 已确认应发、`deductions` 已确认扣款、`notes` 复核说明。所有金额均是明确输入，不是税务引擎的计算结果。 | `draft` 草稿、`in-review` 审批中、`approved` 已批未付、`paid` 已付款、`rejected` 已拒绝；另有待处理状态 `missing-input` 输入待补与 `review` 出勤待核 |

独立台账以业务编号关联，不分发真实记录 ID。日期采用 ISO 日历日期，`period` 为 `YYYY-MM`。金额仅在这些虚构示例中使用 CNY，不提供任何地区的税务或社保公式。使用其他币种或发薪周期前，明确规定政策并调整结构，不混用单位。

### 决策边界

- 工资生命周期为草稿 -> 审批中 -> 已批准 -> 已付款，或已拒绝。标为 `paid` 前，须在证据说明中留存获授权的付款结果、日期和编号。已批准不授权转账，也不证明结算。
- 仅 `approved` 或 `paid` 且 `gross-pay`、`deductions` 均为明确有限数值的工资，计入已确认实发（`gross-pay - deductions`）。草稿、缺失输入和出勤复核项目不计入。APP 明确标注这是所选月份已加载记录的小计。
- 应用薪酬变动须有已确认审批证据和生效日期。只读 APP 不应用变动、不发送工资条、不申报税务、不发起付款。
- 60 天内到期的劳动合同、未签合同、待批准或已批未应用的薪酬决定，以及工资输入不完整的项目，都需人工复核。
- 外部审批或付款集成属于未来可选工作，需明确授权和可信执行环境。本模板没有这些集成，也不依赖其他办公模板。
- 通过工作区权限限制工资节点访问。不要把私人薪酬表或凭据复制到公开文件、图库图片或聊天摘要。

### 运行与安装

独立安装整个模板包。运行时读取一棵深度为三层的元数据树，选择唯一所属根节点，获取文件夹，按 `resourceKey` 匹配所属子节点，并把实际运行时 ID 与 slug 交给 SDK 的 `inspectProvisionedResources`。静态模板包不包含工作区 ID，不修复归属；归属存在歧义或资源缺失时停止。在线查询每张台账最多读取一页 50 行，另行调用精确计数。“加载更多”仅续读一页；已加载记录搜索不声称覆盖整个台账。

每张台账包含四条虚构记录，演示与新安装使用同一份数据。周杉没有已确认工资，也没有计算出的工资；林安的调薪提案不计入；陈瑞 11 月的变动不计入 9 月工资；徐嘉的出勤与扣款复核仍未解决。

### 源文件与验证

编辑 `references/workflow.json`，运行 `node scripts/sync-content.mjs`，再运行 `node scripts/sync-content.mjs --check`。独立 APP 项目位于 `content/busa-office-hr-app`。运行 `npm run check`、`npm run typecheck`、`node --check server.js` 和 `busabase-cli check .`。本地确定性图库截图与 API 测试仅证明各自路径，不替代已安装 APP 在 Busabase 内置 Run 中的验收。
