---
name: busa-office-cashier
description: Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money. Use when reviewing Bank accounts, Daily balance checks, Payment requests, Cash ledger. / 管理银行账户、每日余额走查、付款申请和收付流水；复核付款凭证、账户核查时效或对账异常时使用，不执行资金转账。
metadata:
  category: finance
  tags:
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-office-cashier
    resources:
      - accounts
      - checks
      - payments
      - ledger
    risk: gated-write
---

# Cashier Desk / 出纳管理

## English

### Start here

Read this manual before operating any node. The AirApp is a read-only evidence desk. Install this template independently; it does not depend on another office template. All supplied records, people, entities, bank names, reference numbers and amounts are fictional. They are sample bookkeeping evidence, not real approvals, bank statements, invoices or filings. Replace them through reviewed changes before real use.

### Resources and fields

#### accounts / Bank accounts

List active bank accounts and their last checked date; flag stale balances and restricted accounts without treating book balances as live bank data.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `bank`: Bank.
- `accountHint`: Account suffix.
- `currency`: Currency.
- `balance`: Book balance.
- `checkedAt`: Checked at.
- `notes`: Notes.

States: `active` (Active), `restricted` (Restricted), `closed` (Closed). These are distinct recorded facts, not automatic progress.

#### checks / Daily balance checks

Compare each daily check with its book balance and bank evidence; list discrepancies and stale checks without inventing adjustments.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `account`: Bank account (links to busa-office-cashier-accounts).
- `currency`: Currency.
- `balance`: Book balance.
- `bankBalance`: Bank balance.
- `checkedAt`: Checked at.
- `evidence`: Evidence reference.
- `reason`: Attention reason.
- `notes`: Notes.

States: `pending` (Pending review), `matched` (Matched), `exception` (Exception). These are distinct recorded facts, not automatic progress.

#### payments / Payment requests

Review pending, approved and blocked payments, separating approval from actual payment and flagging missing invoice or bank receipt references.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `account`: Bank account (links to busa-office-cashier-accounts).
- `amount`: Amount.
- `currency`: Currency.
- `due`: Due date.
- `approval`: Approval reference.
- `receipt`: Receipt reference.
- `paidAt`: Paid date.
- `invoice`: Invoice reference.
- `notes`: Notes.

States: `draft` (Draft), `pending` (Pending review), `approved` (Approved), `paid` (Paid), `blocked` (Blocked). These are distinct recorded facts, not automatic progress.

#### ledger / Cash ledger

List unmatched and exception cash movements with bank receipt and invoice evidence; distinguish a paid request from a reconciled ledger entry.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `account`: Bank account (links to busa-office-cashier-accounts).
- `payment`: Payment request (links to busa-office-cashier-payments).
- `amount`: Amount.
- `currency`: Currency.
- `direction`: Direction.
- `due`: Due date.
- `receipt`: Receipt reference.
- `invoice`: Invoice reference.
- `reason`: Attention reason.
- `notes`: Notes.

States: `unmatched` (Unmatched), `reconciled` (Reconciled), `exception` (Exception). These are distinct recorded facts, not automatic progress. `direction` is `in` (Incoming) or `out` (Outgoing); preserve these codes.

### Operating workflow

1. Resolve resources inside the installed Folder by resourceKey; do not reuse an author Space, Base or record id. Read a bounded page (50 records maximum per Base), preserving cursors. Explicitly request additional pages; a loaded page cannot establish a complete population or monetary total.
2. Inspect original evidence, entity, currency, owner and date. Never infer approval from a request, payment from approval, invoice issuance from an issuance request, filing from a checklist, or reconciliation from payment.
3. Draft additions or corrections through a Busabase ChangeRequest and report its returned status. Do not set autoMerge or review/merge your own proposal. A merge may happen immediately when the caller has write permission; report that fact honestly. Human decision evidence remains required independently of CR merge status.
4. Record reviewer/date/reference only from explicit supplied evidence. Missing or conflicting source documents remain blocked or pending. Keep original amount and currency; never aggregate different currencies or invent exchange rates.
5. Mark execution facts only after a human provides actual receipts or acknowledgments. This template has no bank, invoice issuance or filing integration.

### Boundaries

Do not transfer money, access bank credentials, issue tax invoices, submit tax filings, manufacture approval evidence, provide legal deadline guarantees, or silently post reconciliation differences. Mask account numbers; never store full banking credentials. Dates in the filing calendar are operator reminders that require confirmation against authoritative notices. Monthly actuals are provisional management records unless reviewer evidence says otherwise; they are not audited financial statements. Bank balances show their stated check timestamp and become stale after 24 hours.

## 简体中文

### 开始使用

操作任何节点前先阅读本手册。AirApp 是只读凭证工作台。本模板可独立安装，不依赖其他办公模板。所有示例记录、人物、主体、银行名称、引用编号和金额均为虚构；它们只是记账示例依据，并非真实审批、银行对账单、发票或申报记录。正式使用前，通过审核后的变更替换示例。

### 资源与字段

#### accounts / 银行账户

列出正常银行账户及最近核查时间，标记过期余额和受限账户；不将账面余额视为银行实时数据。

- `title`：事项。
- `entity`：主体。
- `owner`：负责人。
- `status`：状态。
- `bank`：银行。
- `accountHint`：脱敏账户尾号。
- `currency`：币种。
- `balance`：账面余额。
- `checkedAt`：核查时间。
- `notes`：备注。

状态：`active`（正常）、`restricted`（受限）、`closed`（已关闭）。这些是独立记录的事实，不代表自动推进的流程。

#### checks / 每日余额走查

将每日走查记录与账面余额及银行依据核对，列出差异和过期核查；不编造调整记录。

- `title`：事项。
- `entity`：主体。
- `owner`：负责人。
- `status`：状态。
- `account`：银行账户，关联 `busa-office-cashier-accounts`。
- `currency`：币种。
- `balance`：账面余额。
- `bankBalance`：银行余额。
- `checkedAt`：核查时间。
- `evidence`：原始凭证引用。
- `reason`：需关注原因。
- `notes`：备注。

状态：`pending`（待审核）、`matched`（已匹配）、`exception`（存在差异）。这些是独立记录的事实，不代表自动推进的流程。

#### payments / 付款申请

复核待审核、已批准和已阻塞的付款申请，区分审批与实际付款，并标记缺失的发票或银行回单引用。

- `title`：事项。
- `entity`：主体。
- `owner`：负责人。
- `status`：状态。
- `account`：银行账户，关联 `busa-office-cashier-accounts`。
- `amount`：金额。
- `currency`：币种。
- `due`：到期日。
- `approval`：审批依据引用。
- `receipt`：付款回单引用。
- `paidAt`：付款日期。
- `invoice`：发票引用。
- `notes`：备注。

状态：`draft`（草稿）、`pending`（待审核）、`approved`（已批准）、`paid`（已付款）、`blocked`（已阻塞）。这些是独立记录的事实，不代表自动推进的流程。

#### ledger / 收付流水

列出未匹配及存在差异的收付流水及其银行回单、发票依据；区分已付款申请与已对账流水。

- `title`：事项。
- `entity`：主体。
- `owner`：负责人。
- `status`：状态。
- `account`：银行账户，关联 `busa-office-cashier-accounts`。
- `payment`：付款申请，关联 `busa-office-cashier-payments`。
- `amount`：金额。
- `currency`：币种。
- `direction`：收付方向。
- `due`：到期日。
- `receipt`：回单引用。
- `invoice`：发票引用。
- `reason`：需关注原因。
- `notes`：备注。

状态：`unmatched`（未匹配）、`reconciled`（已对账）、`exception`（存在差异）。这些是独立记录的事实，不代表自动推进的流程。`direction` 为 `in`（收入）或 `out`（支出），须保留原始代码。

### 操作流程

1. 按 `resourceKey` 在安装后的文件夹内解析资源；不复用作者空间、数据表或记录的 ID。每张表单次最多读取 50 条，保留分页游标。需要更多记录时明确请求下一页；已加载的一页不能证明总体数量或完整金额合计。
2. 核对原始依据、主体、币种、负责人和日期。不从申请推断批准，不从批准推断付款，不从开票申请推断发票已开具，不从材料清单推断申报已提交，也不从付款推断流水已对账。
3. 通过 Busabase 变更申请（ChangeRequest）准备新增或修正，并报告返回的状态。不设置 `autoMerge`，不审核或合并自己的提案。调用者有写入权限时可能即时合并，应如实报告。无论变更是否合并，人工决策依据仍需单独提供。
4. 复核人、日期和引用只按明确提供的依据记录。缺失或冲突的资料维持已阻塞或待审核状态。保留原始金额和币种；不合并不同币种，也不编造汇率。
5. 仅在人提供真实回单或回执后记录执行事实。本模板不包含银行、开票或申报集成。

### 业务边界

不转账、不获取银行登录凭据、不代开税务发票、不提交税务申报、不制造审批依据、不保证法定截止日期，也不静默入账对账差异。账号须脱敏，不保存完整银行登录凭据。申报日历中的日期是操作人员提醒，须与权威通知核实。除非有复核人依据说明，否则月度实际数据是暂定的管理记录，并非经审计的财务报表。银行余额显示其核查时间，超过 24 小时即视为过期。
