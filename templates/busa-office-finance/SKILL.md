---
name: busa-office-finance
description: Expense evidence, invoice requests, monthly actuals and filing deadlines in one review desk. Use when reviewing Expenses & reimbursements, Invoice requests, Monthly actual reports, Filing calendar.
metadata:
  category: finance
  tags:
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-office-finance
    resources:
      - expenses
      - invoices
      - reports
      - filings
    risk: gated-write
---

# Office Finance / 财务管理

## Start here

Read this manual before operating any node. The AirApp is a read-only evidence desk. Install this template independently; it does not depend on another office template. All supplied records, people, entities, bank names, reference numbers and amounts are fictional. They are sample bookkeeping evidence, not real approvals, bank statements, invoices or filings. Replace them through reviewed changes before real use.

## Resources and fields

### expenses / 费用与报销

Review pending and blocked expense claims, list missing evidence and duplicates before suggesting approval.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `amount`: Amount.
- `currency`: Currency.
- `due`: Due date.
- `evidence`: Evidence reference.
- `approval`: Approval reference.
- `paidAt`: Paid date.
- `receipt`: Payment receipt reference, distinct from expense invoice evidence.
- `notes`: Notes.

States: `draft` → `pending` → `approved` → `paid` → `blocked`. These are distinct recorded facts, not automatic progress.

### invoices / 开票申请

Check invoice requests against supplied customer and contract details; flag missing tax information without inventing it.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `amount`: Amount.
- `currency`: Currency.
- `due`: Due date.
- `evidence`: Evidence reference.
- `approval`: Approval reference.
- `invoice`: Invoice reference.
- `notes`: Notes.

States: `draft` → `pending` → `approved` → `issued` → `blocked`. These are distinct recorded facts, not automatic progress.

### reports / 月度实际报告

Compare monthly actual reports against their evidence, identify incomplete sources and explain variances without presenting this as an audited statement.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `period`: Period.
- `currency`: Currency.
- `revenue`: Revenue actual.
- `cost`: Cost actual.
- `due`: Due date.
- `reviewer`: Reviewer.
- `evidence`: Evidence reference.
- `notes`: Notes.

States: `draft` → `review` → `accepted` → `blocked`. These are distinct recorded facts, not automatic progress.

### filings / 申报日历

List planned and unfiled deadlines, owners and missing evidence. Treat dates as operator-entered reminders, not legal advice.

- `title`: Title.
- `entity`: Entity.
- `owner`: Owner.
- `status`: Status.
- `period`: Period.
- `due`: Due date.
- `evidence`: Evidence reference.
- `reviewer`: Reviewer.
- `notes`: Notes.

States: `planned` → `preparing` → `review` → `filed` → `blocked`. These are distinct recorded facts, not automatic progress.

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
