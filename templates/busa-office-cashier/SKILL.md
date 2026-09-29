---
name: busa-office-cashier
description: Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money. Use when reviewing Bank accounts, Daily balance checks, Payment requests, Cash ledger.
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

## Start here

Read this manual before operating any node. The AirApp is a read-only evidence desk. Install this template independently; it does not depend on another office template. All supplied records, people, entities, bank names, reference numbers and amounts are fictional. They are sample bookkeeping evidence, not real approvals, bank statements, invoices or filings. Replace them through reviewed changes before real use.

## Resources and fields

### accounts / 银行账户

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

States: `active` → `restricted` → `closed`. These are distinct recorded facts, not automatic progress.

### checks / 每日余额走查

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

States: `pending` → `matched` → `exception`. These are distinct recorded facts, not automatic progress.

### payments / 付款申请

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

States: `draft` → `pending` → `approved` → `paid` → `blocked`. These are distinct recorded facts, not automatic progress.

### ledger / 收付流水

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

States: `unmatched` → `reconciled` → `exception`. These are distinct recorded facts, not automatic progress.

## Operating workflow

1. Resolve resources inside the installed Folder by resourceKey; do not reuse an author Space, Base or record id. Read a bounded page (50 records maximum per Base), preserving cursors. Explicitly request additional pages; a loaded page cannot establish a complete population or monetary total.
2. Inspect original evidence, entity, currency, owner and date. Never infer approval from a request, payment from approval, invoice issuance from an issuance request, filing from a checklist, or reconciliation from payment.
3. Draft additions or corrections through a Busabase ChangeRequest and report its returned status. Do not set autoMerge or review/merge your own proposal. A merge may happen immediately when the caller has write permission; report that fact honestly. Human decision evidence remains required independently of CR merge status.
4. Record reviewer/date/reference only from explicit supplied evidence. Missing or conflicting source documents remain blocked or pending. Keep original amount and currency; never aggregate different currencies or invent exchange rates.
5. Mark execution facts only after a human provides actual receipts or acknowledgments. This template has no bank, invoice issuance or filing integration.

## Boundaries

Do not transfer money, access bank credentials, issue tax invoices, submit tax filings, manufacture approval evidence, provide legal deadline guarantees, or silently post reconciliation differences. Mask account numbers; never store full banking credentials. Dates in the filing calendar are operator reminders that require confirmation against authoritative notices. Monthly actuals are provisional management records unless reviewer evidence says otherwise; they are not audited financial statements. Bank balances show their stated check timestamp and become stale after 24 hours.

## 中文操作规范

先核对原始资料、币种、主体、负责人和时间。待审批、已批准、已付款、已对账各自代表不同事实，不可自动跳转。提交变更申请并明确返回状态；不可自行批准、合并或执行外部付款、开票、申报。缺失证据保留待处理，过期余额明确标注。示例全部虚构，正式使用前需替换。
