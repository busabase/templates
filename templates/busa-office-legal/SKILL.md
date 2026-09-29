---
name: busa-office-legal
description: Case progress, preservation deadlines, settlement evidence, and legal follow-up. Use for legal case progress, preservation, court deadlines, settlements and counsel tasks. 案件进度、保全期限、和解凭证及法务跟进；用于案件进展、保全、法院期限、和解及律师待办。
metadata:
  category: legal
  tags: [risk:gated-write]
  busabase:
    template: true
    folderSlug: busa-office-legal
    resources:
      - cases
      - deadlines
      - settlements
      - updates
      - tasks
    risk: gated-write
---

# Legal Case Desk / 法务管理

## English

### Scope and connection

Read the Busabase connection skill first. Work only inside the installed folder; resolve native nodes by the install-stamped resourceKey and verify the folder before reading or proposing changes. Never reuse another install's records. The AirApp is a read-only projection. All agent writes use ChangeRequests; inspect the returned status and never review or merge your own request. Never contact, sign, file, publish or transfer money without explicit user authority for that external action.

### Daily procedure

1. Read one bounded page (50 rows maximum) per relevant Base. Read at most 20 relevant pending ChangeRequests only if needed, filtered to this folder's exact node IDs. Cite the page scope and next cursor; do not infer a complete total from a partial list. Full exports require an explicit separate request.
2. Match business codes exactly. If a parent code is missing or ambiguous, stop that proposed association and ask for evidence. Do not match by a person's name alone.
3. Inspect status, responsible owner, source evidence and dates. Unknown is different from zero, absent, rejected or completed. Do not manufacture evidence, authority, outcomes or dates.
4. Prepare a factual change proposal with before/after fields, source references, human owner and reason. Submit through ChangeRequests, retaining returned ID and status.
5. Summarize review items and unresolved evidence, with a next action and owner. External execution remains a separate explicitly authorized step.

### Bases and field rules

#### Cases / 法务案件

- `name`: Name (text). Required.
- `code`: Case code (text).
- `counterparty`: Counterparty (text).
- `owner`: Case owner (text).
- `status`: Case stage (text).
- `due`: Next hearing (date).
- `next`: Next action (text).
- `notes`: Dispute summary (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Preservation & deadlines / 保全与期限

- `name`: Name (text). Required.
- `code`: Deadline code (text).
- `case`: Case code (text).
- `owner`: Responsible counsel (text).
- `status`: Verification state (text).
- `due`: Verified due date (date).
- `source`: Deadline authority (text).
- `notes`: Preservation notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Recoveries & costs / 回款与成本

- `name`: Name (text). Required.
- `code`: Entry code (text).
- `case`: Case code (text).
- `owner`: Finance reviewer (text).
- `kind`: Entry type (text).
- `amount`: Amount (number).
- `currency`: Currency (text).
- `status`: Evidence state (text).
- `due`: Posting date (date).
- `source`: Evidence reference (text).
- `notes`: Reconciliation notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Case timeline / 案件进展

- `name`: Name (text). Required.
- `code`: Update code (text).
- `case`: Case code (text).
- `owner`: Author (text).
- `status`: Evidence state (text).
- `due`: Occurred on (date).
- `source`: Source reference (text).
- `notes`: Factual update (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Legal follow-up / 法务待办

- `name`: Name (text). Required.
- `code`: Task code (text).
- `case`: Case code (text).
- `owner`: Responsible owner (text).
- `status`: Task state (text).
- `due`: Action due (date).
- `next`: Required action (text).
- `notes`: Review context (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.


### Legal controls

Cases use investigation → litigation / settlement → closed; a stage change needs source evidence and counsel/business owner review. Case closure requires reconciliation and an approved closure record. Deadline state uses unverified, needs_review, verified, overdue or completed. A court notice, service date and qualified counsel validation establish a deadline; never calculate a statutory deadline from memory. Preserve the source authority in source and set due null if unknown. Preserve prior factual updates; add corrections as new chronological entries rather than replacing history.

Recoveries and costs are positive nonnegative amounts labeled by kind (recovery or cost) and ISO currency. Only verified entries with bank receipt/invoice evidence count as realized amounts. Group sums by currency; never add CNY and USD and never interpret quote-only rows as payment. Settlement acceptance, concessions, filings, signatures, releases and payments require specific human authorization and competent counsel. No legal outcome guarantees. Limit privileged and personal data to approved readers.

### Views, attention and limits

Overview and attention derive only from loaded rows and display that scope. Attention includes missing feedback, unverified evidence, blocked approvals and overdue unfinished work. Closed/complete/accepted records never become overdue merely because an old date is present. The legal chronological timeline sorts strict valid dates first; missing or invalid dates are explicitly unknown. Search and status filters apply only to the loaded rows. Load more requests exactly one next page and deduplicates results. Live failure never falls back to sample data.

### Example data and language

All installed seed rows and screenshots are fictional. Replace them via reviewed changes before operating real legal work. Example codes cannot substitute for actual source documents. The AirApp switches between English and Simplified Chinese; native names, descriptions and example narratives retain both languages. Keep business codes, field slugs, machine statuses, currencies and dates stable when translating copy. Example personal and company names remain unchanged.

## 简体中文

### 范围与连接

先阅读 Busabase 连接 Skill。只在此模板已安装的目录内工作；根据安装时写入的 `resourceKey` 解析原生节点，在读取或拟定变更前核验所属目录。不得复用其他安装实例的记录。AirApp 仅用于只读展示。所有 Agent 写入均使用 ChangeRequests（变更申请），检查返回状态，不得自行审核或合并自己的申请。任何对外联系、签署、提交、发布或资金划转，均须用户对该外部行为明确授权。

### 日常流程

1. 对相关 Base 只读取一页，每页最多 50 条。仅在需要时读取相关待审核变更申请，最多 20 条，并按此目录的准确节点 ID 筛选。报告本页范围及下一页游标；不得从部分列表推断完整总数。完整导出须另行获得明确请求。
2. 业务编号须准确匹配。上级编号缺失或存在歧义时，停止拟议关联并请求证据，不得只凭姓名关联。
3. 核查状态、负责人、来源证据及日期。未知不等于零、不存在、被拒绝或已完成。不得编造证据、权限、结果或日期。
4. 拟定基于事实的变更草案，包含字段变更前后值、来源引用、人工负责人及原因。通过变更申请提交，并保留返回的 ID 及状态。
5. 汇总待复核事项及未解决的证据缺口，给出下一步和负责人。外部执行仍是须单独明确授权的步骤。

### 数据表与字段规则

#### 法务案件 / Cases

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 案件编号 | 文本 |
| `counterparty` | 相对方 | 文本 |
| `owner` | 案件负责人 | 文本 |
| `status` | 案件阶段 | 文本 |
| `due` | 下次开庭日 | 日期 |
| `next` | 下一步行动 | 文本 |
| `notes` | 争议摘要 | 长文本 |

#### 保全与期限 / Preservation & deadlines

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 期限编号 | 文本 |
| `case` | 案件编号 | 文本 |
| `owner` | 负责律师 | 文本 |
| `status` | 核验状态 | 文本 |
| `due` | 已核验的到期日 | 日期 |
| `source` | 期限依据 | 文本 |
| `notes` | 保全备注 | 长文本 |

#### 回款与成本 / Recoveries & costs

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 流水编号 | 文本 |
| `case` | 案件编号 | 文本 |
| `owner` | 财务复核人 | 文本 |
| `kind` | 流水类别 | 文本 |
| `amount` | 金额 | 数值 |
| `currency` | 币种 | 文本 |
| `status` | 凭证状态 | 文本 |
| `due` | 记账日期 | 日期 |
| `source` | 凭证编号 | 文本 |
| `notes` | 对账说明 | 长文本 |

#### 案件进展 / Case timeline

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 进展编号 | 文本 |
| `case` | 案件编号 | 文本 |
| `owner` | 记录人 | 文本 |
| `status` | 证据状态 | 文本 |
| `due` | 发生日期 | 日期 |
| `source` | 来源编号 | 文本 |
| `notes` | 事实记录 | 长文本 |

#### 法务待办 / Legal follow-up

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 待办编号 | 文本 |
| `case` | 案件编号 | 文本 |
| `owner` | 负责人 | 文本 |
| `status` | 待办状态 | 文本 |
| `due` | 行动期限 | 日期 |
| `next` | 所需行动 | 文本 |
| `notes` | 复核背景 | 长文本 |

以上各表均使用保存的原生工作表编辑记录。日期使用 `YYYY-MM-DD`，未核验时使用 `null`。编号是稳定的业务标识，不是工作区 ID。负责人须是承担责任的人；备注须引用来源证据，并区分观察事实与建议。

### 法务控制

案件阶段依次为 `investigation`（调查）→ `litigation`（诉讼）或 `settlement`（和解）→ `closed`（结案）。阶段变更须有来源证据，并由律师及业务负责人复核；结案须完成对账并有已批准的结案记录。

期限状态为 `unverified`（未核验）、`needs_review`（待复核）、`verified`（已核验）、`overdue`（逾期）或 `completed`（完成）。法院通知、送达日期及具备资格的律师核验共同确立期限；不得凭记忆计算法定期限。在 `source` 中保留依据来源，不知道日期时将 `due` 设为 `null`。保留既有事实进展，纠错应追加新的时间顺序记录，不得替换历史。

回款与成本金额须非负，用 `kind` 标明 `recovery`（回款）或 `cost`（成本），并注明 ISO 币种。只有具有银行回单或发票证据且状态为 `verified` 的记录计入已实现金额。金额按币种分别汇总，不得将 CNY 与 USD 相加；仅有报价的记录不代表付款。接受和解、让步、对外提交、签署、权利释放及付款，均须具体人工授权及合格律师参与。不得保证法律结果；受保密特权保护的材料及个人数据仅向获准读者开放。

### 视图、关注事项与限制

总览及关注事项只从已加载记录计算，并显示该范围。关注事项包括缺少反馈、未核验的证据、受阻的审批以及已逾期且未完成的工作。已关闭、已完成或已接受的记录，不得仅因旧日期而被视为逾期。案件时间线优先按严格有效的日期排序，缺失或无效日期明确标为未知。搜索与状态筛选只针对已加载记录；加载更多每次准确请求下一页，并对结果去重。实时读取失败时绝不回退到示例数据。

### 示例数据与语言

所有安装的示例记录及截图均为虚构。开展真实法务工作前，须通过可复核的变更替换这些记录。示例编号不能替代真实来源文件。AirApp 可切换 English / 简体中文；原生名称、描述及示例叙述同时保留中英文。翻译文案时保持业务编号、字段 slug、机器状态值、币种及日期不变，示例人物及公司名称也保持不变。
