---
name: busa-office-recruiting
description: Hiring positions, candidate pipelines, interviews, and reviewed offers. Use for hiring positions, candidate assessment, structured interviews and offer review. 职位需求、候选人进度、面试反馈与录用复核；用于招聘职位、候选人评估、结构化面试及录用复核。
metadata:
  category: hr
  tags: [risk:gated-write]
  busabase:
    template: true
    folderSlug: busa-office-recruiting
    resources:
      - positions
      - applicants
      - interviews
      - offers
    risk: gated-write
---

# Recruiting Desk / 招聘管理

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

#### Positions / 招聘职位

- `name`: Name (text). Required.
- `code`: Position code (text).
- `department`: Department (text).
- `owner`: Hiring owner (text).
- `headcount`: Approved headcount (number).
- `status`: Status (text).
- `due`: Target start (date).
- `notes`: Requirements (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Applicants / 候选人

- `name`: Name (text). Required.
- `code`: Candidate code (text).
- `position`: Position code (text).
- `owner`: Recruiter (text).
- `status`: Hiring stage (text).
- `due`: Next step date (date).
- `next`: Next step (text).
- `notes`: Evidence and notes (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Interviews / 面试安排

- `name`: Name (text). Required.
- `code`: Interview code (text).
- `candidate`: Candidate code (text).
- `owner`: Interviewer (text).
- `status`: Feedback state (text).
- `due`: Interview date (date).
- `notes`: Structured feedback (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.

#### Offer review / 录用复核

- `name`: Name (text). Required.
- `code`: Offer code (text).
- `candidate`: Candidate code (text).
- `owner`: Approver (text).
- `amount`: Monthly salary (number).
- `currency`: Currency (text).
- `status`: Review state (text).
- `due`: Decision due (date).
- `notes`: Conditions (longtext).

Use the saved working table for native record editing. Dates use YYYY-MM-DD or null when unverified. Codes are stable business identifiers, not workspace IDs. Owner must name the accountable person; notes must cite source evidence and distinguish observed facts from recommendations.


### Hiring controls

Positions use open, paused or closed; approved headcount is a nonnegative integer. Applicants use screening → interview → offer_review → offered → hired, with on_hold, rejected and withdrawn as explicit branches. Require completed rubric-based interview evidence and budget approval before an offer proposal; candidate acceptance evidence is required before hired. Do not treat a recorded offer as sent or accepted. Interviews use scheduled, feedback_missing or completed; assess role skills from documented observations, never protected characteristics. Offers use needs_review, blocked, approved, sent, accepted or declined; monthly salary is nonnegative with an ISO currency. Approval, sending and acceptance are distinct events. No automatic outreach, invitations, offer delivery, background checks or applicant rejection. This is recruiting employees; it does not support resume-based customer acquisition or JDR lead generation. Retain the minimum personal data and honor authorized retention/deletion requests.

### Views, attention and limits

Overview and attention derive only from loaded rows and display that scope. Attention includes missing feedback, unverified evidence, blocked approvals and overdue unfinished work. Closed/complete/accepted records never become overdue merely because an old date is present. Search and status filters apply only to the loaded rows. Load more requests exactly one next page and deduplicates results. Live failure never falls back to sample data.

### Example data and language

All installed seed rows and screenshots are fictional. Replace them via reviewed changes before operating real hiring work. Example codes cannot substitute for actual source documents. The AirApp switches between English and Simplified Chinese; native names, descriptions and example narratives retain both languages. Keep business codes, field slugs, machine statuses, currencies and dates stable when translating copy. Example personal names remain unchanged.

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

#### 招聘职位 / Positions

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 职位编号 | 文本 |
| `department` | 部门 | 文本 |
| `owner` | 招聘负责人 | 文本 |
| `headcount` | 已批准人数 | 数值 |
| `status` | 状态 | 文本 |
| `due` | 目标到岗日 | 日期 |
| `notes` | 任职要求 | 长文本 |

#### 候选人 / Applicants

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 候选人编号 | 文本 |
| `position` | 职位编号 | 文本 |
| `owner` | 招聘专员 | 文本 |
| `status` | 招聘阶段 | 文本 |
| `due` | 下一步日期 | 日期 |
| `next` | 下一步 | 文本 |
| `notes` | 证据与备注 | 长文本 |

#### 面试安排 / Interviews

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 面试编号 | 文本 |
| `candidate` | 候选人编号 | 文本 |
| `owner` | 面试官 | 文本 |
| `status` | 反馈状态 | 文本 |
| `due` | 面试日期 | 日期 |
| `notes` | 结构化反馈 | 长文本 |

#### 录用复核 / Offer review

| 字段 | 含义 | 类型与要求 |
| --- | --- | --- |
| `name` | 名称 | 文本，必填 |
| `code` | 录用编号 | 文本 |
| `candidate` | 候选人编号 | 文本 |
| `owner` | 审批人 | 文本 |
| `amount` | 月薪 | 数值 |
| `currency` | 币种 | 文本 |
| `status` | 复核状态 | 文本 |
| `due` | 决策期限 | 日期 |
| `notes` | 录用条件 | 长文本 |

以上各表均使用保存的原生工作表编辑记录。日期使用 `YYYY-MM-DD`，未核验时使用 `null`。编号是稳定的业务标识，不是工作区 ID。负责人须是承担责任的人；备注须引用来源证据，并区分观察事实与建议。

### 招聘控制

职位状态为 `open`（开放）、`paused`（暂停）或 `closed`（关闭）；已批准人数须为非负整数。候选人阶段依次为 `screening`（初筛）→ `interview`（面试）→ `offer_review`（录用复核）→ `offered`（已发录用通知）→ `hired`（已录用），另有 `on_hold`（暂缓）、`rejected`（未通过）及 `withdrawn`（退出）分支。拟定录用草案前，须具备已完成的评分标准面试证据和预算批准；标记 `hired` 前须有候选人接受凭证。录用记录不代表通知已发送或已被接受。

面试状态为 `scheduled`（已安排）、`feedback_missing`（缺少反馈）或 `completed`（已完成）。依据有记录的观察评估岗位能力，不得依据受保护属性。录用状态为 `needs_review`（待复核）、`blocked`（受阻）、`approved`（已批准）、`sent`（已发送）、`accepted`（已接受）或 `declined`（已拒绝）。月薪须为非负数并注明 ISO 币种；批准、发送和接受是不同事件。

不得自动联系候选人、发送邀请或录用通知、进行背景调查或拒绝候选人。此模板用于招聘员工，不支持根据简历获取客户或 JDR 线索生成。只保留最少必要的个人数据，并遵守已授权的保留和删除要求。

### 视图、关注事项与限制

总览及关注事项只从已加载记录计算，并显示该范围。关注事项包括缺少面试反馈、未核验的证据、受阻的审批以及已逾期且未完成的工作。已关闭、已完成或已接受的记录，不得仅因旧日期而被视为逾期。搜索与状态筛选只针对已加载记录；加载更多每次准确请求下一页，并对结果去重。实时读取失败时绝不回退到示例数据。

### 示例数据与语言

所有安装的示例记录及截图均为虚构。开展真实招聘工作前，须通过可复核的变更替换这些记录。示例编号不能替代真实来源文件。AirApp 可切换 English / 简体中文；原生名称、描述及示例叙述同时保留中英文。翻译文案时保持业务编号、字段 slug、机器状态值、币种及日期不变，示例人物姓名也保持不变。
