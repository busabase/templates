# Busa LinkedIn Desk Schema

Use this schema when reading or writing the desk's Busabase Bases. Field
slugs are kebab-case. Installed Base slugs are prefixed by the installer
(e.g. `busa-linkedin-desk-messages`); inside this package, relations point
at the target Base's `content/` directory name via `targetBaseSlug`, and
seed-record relation values are arrays of package-local record `key`s.

Conventions:

- The first field of every Base is the record label and is required.
- A person is identified by LinkedIn profile URL, never by name alone.
- A message is deduplicated by `message-id`; when a channel gives no ID,
  compose one from thread ID + send time.
- Approval notes are stored verbatim — they are the raw material of the
  Experience base.
- Member fields (`owner`, `approver`) are left empty in seed records;
  they name real workspace members after install.

## Companies (`companies`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `name` | text | required, record label |
| `linkedin-url` | url | company page |
| `industry` | text | |
| `website` | url | |
| `notes` | longtext | |

Minimal on purpose: when Busa CRM is installed alongside, its Companies
and Deals stay canonical for pipeline. This desk ships no Deals base.

## Contacts (`contacts`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `name` | text | required, record label |
| `role` | text | as shown on the profile; changes are traceable |
| `company` | relation → `companies` | single |
| `linkedin-url` | url | required — the identity key |
| `verification` | select | `unverified` 未核验 / `verified` 已核验 |
| `tier` | select | `a` / `b` / `c` — a human's call; the agent may only suggest |
| `owner` | member | who owns this relationship |
| `source` | select | `manual` 手工 / `import` 导入 / `conversation` 对话匹配 |

Views: `unverified` （待核验） — verification equals `unverified`.

## Messages (`messages`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label, e.g. 「Alex：问私有化部署」 |
| `thread-id` | text | required; one per conversation thread |
| `message-id` | text | required — **deduplication key** |
| `contact` | relation → `contacts` | single; matched by profile URL |
| `direction` | select | `in` 收到 / `out` 发出 |
| `channel` | select | `linkedin` / `whatsapp` / `email` / `wechat` / `other` |
| `sent-at` | date (with time) | when the message actually happened |
| `body` | longtext | necessary excerpt only; long sensitive originals stay a controlled reference |
| `intent` | select | `interested` 有意向 / `objection` 异议 / `referral` 转介 / `not-now` 现在不要 / `wrong-person` 找错人 / `rejected` 拒绝 / `question` 咨询 / `other` 其它 |
| `urgency` | select | `high` / `medium` / `low` |
| `status` | select | `pending-triage` 待分诊 / `triaged` 已分诊 / `drafted` 已起草 / `handled` 已处理 / `no-action` 无需处理 |
| `reply` | relation → `replies` | single; the reply this message produced |

Views: `pending-triage` （待分诊） — status equals `pending-triage`, sorted
by `sent-at` ascending.

## Replies (`replies`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label |
| `message` | relation → `messages` | single; the message being answered |
| `contact` | relation → `contacts` | single |
| `draft` | longtext | the agent's drafted version |
| `version` | number | increments per revision |
| `approval-status` | select | `draft` 草稿 / `pending` 待审批 / `approved` 已批准 / `approved-edited` 已改后批准 / `rejected` 已驳回 / `sent` 已发送 |
| `approver` | member | who gave the verdict |
| `approval-notes` | longtext | **verbatim** — the raw material of Experience |
| `sent-body` | longtext | the exact text sent; its diff against `draft` is the standard |
| `sent-at` | date (with time) | |
| `sent-message-id` | text | written back on send; also logged as an `out` row in Messages |
| `outcome` | select | `replied` 已回复 / `no-reply` 无回复 / `continued` 继续对话 / `meeting-booked` 已约会议 / `declined` 被拒绝 |

Views: `pending-approval` （待审批） — approval-status equals `pending`.

## Actions (`actions`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label |
| `type` | select | `follow-up` 跟进 / `escalate` 升级人工 / `meeting` 约会议 / `send-material` 发送资料 / `update-crm` 更新 CRM 字段 / `new-deal` 新建商机 / `other` 其它 |
| `source-message` | relation → `messages` | single; use this or `source-reply` |
| `source-reply` | relation → `replies` | single; use this or `source-message` |
| `owner` | member | |
| `due-date` | date | required in practice for `follow-up` |
| `status` | select | `open` 待办 / `in-progress` 进行中 / `done` 已完成 / `cancelled` 已取消 |
| `result` | longtext | what actually happened — closing is a written outcome, not a status flip |
| `evidence-url` | url | send receipt, meeting link, document link |

`update-crm` rows are proposals: stage/amount changes are applied through
a ChangeRequest showing old value, candidate value and source — never
written directly.

Views: `open` （待办） — status equals `open`, sorted by `due-date`
ascending.

## Experience (`experience`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required — the lesson in one sentence |
| `type` | select | `script` 有效话术 / `objection` 异议处理 / `triage-rule` 分诊规则 / `cadence` 节奏经验 / `forbidden` 禁区教训 |
| `source-reply` | relation → `replies` | single; use this or `source-action` |
| `source-action` | relation → `actions` | single; use this or `source-reply` |
| `approval-quote` | longtext | the approver's exact words, unedited |
| `scope` | text | which audience / industry / situation this holds for |
| `limits` | longtext | counter-examples — when it does not apply |
| `status` | select | `candidate` 候选 / `adopted` 已采纳 / `promoted` 已晋升 Skill / `retired` 已废止 |
| `promoted-to` | url | where the lesson landed when promoted (Skill or Doc link) |
| `last-verified` | date | when this lesson last held in a real round |

Views: `candidates` （候选经验） — status equals `candidate`; `adopted`
（已采纳） — status equals `adopted`.

## Doc: ICP and Voice (`icp-and-voice`)

A Doc node (`content/icp-and-voice.md`), not a Base: the human's standards
— ICP, say / never-say, the price-commitment-date red lines, escalation
rules, voice skeletons. Read before every draft. Where an Experience row
conflicts with it, the Doc wins.

## Relation map

```text
companies ──< contacts ──< messages ──< replies
                              │            │
                              └──< actions ┘ (source)
replies / actions ──< experience (source)
messages.reply ──> replies (the reply a message produced)
```
