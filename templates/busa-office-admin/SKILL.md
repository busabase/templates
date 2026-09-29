---
name: busa-office-admin
description: Operate an administration desk for certificates, office supplier contracts, original-document provenance and verification tasks. Use when tracking renewals, checking document evidence or assigning administrative follow-ups.
metadata:
  category: ops
  tags:
    - office
    - administration
    - risk:read-only
  busabase:
    template: true
    folderSlug: busa-office-admin
    resources:
      - certificates
      - contracts
      - sources
      - checks
    risk: read-only
---

# Administration Desk / 行政管理工作台

Read this manual before working on this folder. Find the installed folder by its ownership metadata (`appId: busa-office-admin`, `resourceKey: app-root`), then its own children by `resourceKey`. A same-name node elsewhere is not this template. If multiple installations are visible, request the intended folder before operating; the AirApp fails closed on ambiguity.

## Recurring Work / 日常流程

1. Read a bounded page from the relevant Base, preserving its continuation cursor. For lists, say whether the answer covers only loaded rows. Do not claim global totals from the first 50 records.
2. Identify the document and entity using business references and title. Keep certificate validity, contract lifecycle, provenance and follow-up tasks separate.
3. Compare original evidence with the archive summary. Preserve conflicting dates verbatim and assign a named owner to verification. Do not guess which date is correct.
4. Draft a renewal or verification task with owner, due date, source reference and next step. Search for the same source reference and task before proposing another row.
5. Create record changes through Busabase ChangeRequests only when requested. Read the returned status to distinguish pending from merged. Report source evidence and remaining uncertainty.

先读取所属文件夹的业务台账；分页读取，不将已加载记录伪装为全量。证照有效期、合同状态、原件来源与待办分别管理。证据冲突时保留两个版本并落实核验责任人。新增事项前检查相同业务编号和待办，修改通过变更申请。

## Resources / 资源与字段

| Base | Meaning and fields | Lifecycle |
| --- | --- | --- |
| `certificates` | `title`, `entity`, `owner`, `issued`, `expires`, `source-ref`, `notes`; `expires` can be disputed when `status=conflict`, never a confirmed legal fact in that state. | `verified`, `expiring`, `unverified`, `conflict` |
| `contracts` | `title`, `counterparty`, `entity`, `owner`, `expires`, `source-ref`, `notes`; operational supplier contracts, not labor or litigation records. | `signed`, `renewal`, `review` (signature pending), `archived` |
| `sources` | `title`, `source-ref`, `custodian`, `received`, `location`, `notes`; provenance index, no real originals included in this package. | `original`, `copy-only`, `conflict` |
| `checks` | `title`, `source-ref`, `owner`, `due`, `notes`; verification and renewal follow-up. `notes` states the missing evidence and next action. | `open`, `blocked`, `completed` |

Dates use ISO calendar dates. Match sources using `source-ref` business codes. A reference not present in the loaded source page is unresolved; fetch the relevant bounded page or state the gap. A completed task does not automatically approve a document. Archived expired contracts are retained for audit history and are excluded from active renewal alerts.

## Review Rules / 核验规则

- Certificate or active contract expiry within 60 calendar days needs review, including an overdue expiry. Explicit conflict, unverified and renewal states also need review.
- Before a contract is considered signed, retain signature evidence. Pre-review notes are administrative observations and do not imply legal approval.
- Never replace conflicting expiry dates, discard a source version, or represent an unsigned agreement as approved.
- Document storage locations are references, never credentials. Do not paste original identity documents, passwords or credential values into chat.
- The AirApp is read-only. Native Views and the folder Skill handle requested proposals; no sending, government filing or other external side effect is included.

## Runtime And Installation

Install this complete package independently. It requires no HR, finance or cashier template. The app resolves one owned installation within a depth-three metadata tree, gets its folder, resolves Bases by `appId` and `resourceKey`, then delegates ownership checks to `inspectProvisionedResources`. Ambiguous or incomplete ownership stops the read. No IDs from the source workspace are shipped and the app performs no metadata repairs or automatic provisioning.

Four Bases each contain four fictional records. Demo mode consumes the same generated records as installation. English and Simplified Chinese are supported. Live reads use one 50-row page per Base and exact count calls; additional pages require Load more. Search and filters apply to loaded rows. Loaded review subtotals are explicitly scoped and never presented as canonical totals.

## Source And Verification

`references/workflow.json` is the canonical schema, samples and prompt specification. Run `node scripts/sync-content.mjs` after editing it and `node scripts/sync-content.mjs --check` in review. The independent project is `content/busa-office-admin-app`; `npm run check`, `npm run typecheck`, `node --check server.js` and `busabase-cli check .` validate it. Real install-and-open acceptance remains distinct from local deterministic screenshots.
