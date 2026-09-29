---
name: busa-office-admin
description: Operate an administration desk for certificates, office supplier contracts, original-document provenance and verification tasks. Use when tracking renewals, checking document evidence or assigning administrative follow-ups. / 管理证照、办公供应商合同、原件来源和核验待办；用于跟踪续期、核对文件证据或分派行政跟进事项。
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

## English

Read this manual before working on this folder. Find the installed folder by its ownership metadata (`appId: busa-office-admin`, `resourceKey: app-root`), then its own children by `resourceKey`. A same-name node elsewhere is not this template. If multiple installations are visible, request the intended folder before operating; the AirApp fails closed on ambiguity.

### Recurring Work

1. Read a bounded page from the relevant Base, preserving its continuation cursor. For lists, say whether the answer covers only loaded rows. Do not claim global totals from the first 50 records.
2. Identify the document and entity using business references and title. Keep certificate validity, contract lifecycle, provenance and follow-up tasks separate.
3. Compare original evidence with the archive summary. Preserve conflicting dates verbatim and assign a named owner to verification. Do not guess which date is correct.
4. Draft a renewal or verification task with owner, due date, source reference and next step. Search for the same source reference and task before proposing another row.
5. Create record changes through Busabase ChangeRequests only when requested. Read the returned status to distinguish pending from merged. Report source evidence and remaining uncertainty.

### Resources And Fields

| Base | Meaning and fields | Lifecycle |
| --- | --- | --- |
| `certificates` | `title`, `entity`, `owner`, `issued`, `expires`, `source-ref`, `notes`; `expires` can be disputed when `status=conflict`, never a confirmed legal fact in that state. | `verified`, `expiring`, `unverified`, `conflict` |
| `contracts` | `title`, `counterparty`, `entity`, `owner`, `expires`, `source-ref`, `notes`; operational supplier contracts, not labor or litigation records. | `signed`, `renewal`, `review` (signature pending), `archived` |
| `sources` | `title`, `source-ref`, `custodian`, `received`, `location`, `notes`; provenance index, no real originals included in this package. | `original`, `copy-only`, `conflict` |
| `checks` | `title`, `source-ref`, `owner`, `due`, `notes`; verification and renewal follow-up. `notes` states the missing evidence and next action. | `open`, `blocked`, `completed` |

Dates use ISO calendar dates. Match sources using `source-ref` business codes. A reference not present in the loaded source page is unresolved; fetch the relevant bounded page or state the gap. A completed task does not automatically approve a document. Archived expired contracts are retained for audit history and are excluded from active renewal alerts.

### Review Rules

- Certificate or active contract expiry within 60 calendar days needs review, including an overdue expiry. Explicit conflict, unverified and renewal states also need review.
- Before a contract is considered signed, retain signature evidence. Pre-review notes are administrative observations and do not imply legal approval.
- Never replace conflicting expiry dates, discard a source version, or represent an unsigned agreement as approved.
- Document storage locations are references, never credentials. Do not paste original identity documents, passwords or credential values into chat.
- The AirApp is read-only. Native Views and the folder Skill handle requested proposals; no sending, government filing or other external side effect is included.

### Runtime And Installation

Install this complete package independently. It requires no HR, finance or cashier template. The app resolves one owned installation within a depth-three metadata tree, gets its folder, resolves Bases by `appId` and `resourceKey`, then delegates ownership checks to `inspectProvisionedResources`. Ambiguous or incomplete ownership stops the read. No IDs from the source workspace are shipped and the app performs no metadata repairs or automatic provisioning.

Four Bases each contain four fictional records. Demo mode consumes the same generated records as installation. English and Simplified Chinese are supported. Live reads use one 50-row page per Base and exact count calls; additional pages require Load more. Search and filters apply to loaded rows. Loaded review subtotals are explicitly scoped and never presented as canonical totals.

### Source And Verification

`references/workflow.json` is the canonical schema, samples and prompt specification. Run `node scripts/sync-content.mjs` after editing it and `node scripts/sync-content.mjs --check` in review. The independent project is `content/busa-office-admin-app`; `npm run check`, `npm run typecheck`, `node --check server.js` and `busabase-cli check .` validate it. Real install-and-open acceptance remains distinct from local deterministic screenshots.

## 简体中文

操作本文件夹前先阅读本手册。通过归属元数据（`appId: busa-office-admin`、`resourceKey: app-root`）定位已安装的文件夹，再按 `resourceKey` 定位其子节点。其他位置的同名节点不属于本模板。如果可见多个安装实例，操作前请用户指定文件夹；APP 遇到归属歧义时停止读取。

### 日常流程

1. 从相关台账读取有上限的一页，保留续读游标。返回列表时说明是否仅覆盖已加载记录，不将前 50 条记录当作全量统计。
2. 按业务编号和名称识别文件与公司主体，分别管理证照有效期、合同生命周期、原件来源和跟进待办。
3. 比较原件证据与归档汇总，逐字保留冲突日期，并指定具名负责人核验，不猜测哪一个日期正确。
4. 拟定续期或核验事项，注明负责人、截止日期、原件业务编号和下一步。新增记录前检查是否已有同一来源编号及待办。
5. 仅在用户要求时通过 Busabase 变更申请修改记录。读取返回状态，区分待审核与已合并，并汇报依据的原件证据和仍未确定的问题。

### 资源与字段

| 台账 | 含义与字段 | 生命周期 |
| --- | --- | --- |
| `certificates`（证照台账） | `title` 证照名称、`entity` 公司主体、`owner` 负责人、`issued` 签发日期、`expires` 到期日期、`source-ref` 原件业务编号、`notes` 核验说明。`status=conflict` 时，到期日期存在争议，不能当作已确认的法律事实。 | `verified` 已核验、`expiring` 待续期、`unverified` 未核验、`conflict` 证据冲突 |
| `contracts`（行政合同） | `title` 合同名称、`counterparty` 对方主体、`entity` 公司主体、`owner` 负责人、`expires` 合同到期、`source-ref` 原件业务编号、`notes` 审阅说明。用于办公供应商合同，不用于劳动合同或诉讼记录。 | `signed` 已签署、`renewal` 待续约、`review` 待签署、`archived` 已归档 |
| `sources`（原件来源台账） | `title` 原件名称、`source-ref` 业务编号、`custodian` 保管人、`received` 收件日期、`location` 归档位置、`notes` 来源说明。此表是来源索引，模板包不含真实原件。 | `original` 已核对原件、`copy-only` 仅复印件、`conflict` 版本冲突 |
| `checks`（核验待办） | `title` 待办事项、`source-ref` 证据业务编号、`owner` 负责人、`due` 截止日期、`notes` 下一步。用于核验与续期跟进，说明中记录缺失证据和后续行动。 | `open` 待处理、`blocked` 受阻、`completed` 已完成 |

日期使用 ISO 日历日期，按 `source-ref` 业务编号匹配来源。引用的来源不在已加载页中时，该关联仍未确认；读取相关的有上限分页或明确说明缺口。待办完成不自动批准文件。保留已到期并归档的合同供审计追溯，不纳入当前续期提醒。

### 核验规则

- 未来 60 个日历日内到期的证照或有效合同需要复核，已逾期的也需复核。明确处于证据冲突、未核验或待续期状态的事项同样需要复核。
- 将合同认定为已签署前，必须保留签署证据。预审说明仅是行政观察，不代表法律批准。
- 不覆盖冲突的到期日期，不丢弃某个来源版本，不将未签协议表示为已批准。
- 文件存储位置仅是索引，不能包含凭据。不要把身份证明原件、密码或凭据值粘贴到聊天中。
- APP 只读。用户要求的提案通过原生视图及文件夹 Skill 处理；模板不包含外部发送、政府申报或其他外部副作用。

### 运行与安装

独立安装整个模板包，无需人事、财务或出纳模板。APP 从深度为三层的元数据树中解析唯一所属安装实例，获取文件夹，按 `appId` 与 `resourceKey` 定位台账，并交由 `inspectProvisionedResources` 检查归属。归属不明确或资源不完整时停止读取。模板不携带来源工作区 ID，不自动修复元数据，也不自动创建资源。

四张台账各含四条虚构记录；演示模式与安装使用同一份生成记录。支持英语和简体中文。在线读取每张台账一页，最多 50 行，并另行调用精确计数；后续分页需点击“加载更多”。搜索和筛选仅作用于已加载记录。复核小计明确标注已加载范围，不当作权威全量统计。

### 源文件与验证

`references/workflow.json` 是台账结构、示例和提示词的唯一规范源。编辑后运行 `node scripts/sync-content.mjs`，审核时运行 `node scripts/sync-content.mjs --check`。独立 APP 项目位于 `content/busa-office-admin-app`，通过 `npm run check`、`npm run typecheck`、`node --check server.js` 和 `busabase-cli check .` 验证。真实安装后打开 APP 的验收，与本地确定性截图是不同的验证路径。
