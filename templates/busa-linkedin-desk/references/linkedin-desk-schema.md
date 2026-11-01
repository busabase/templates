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
- Installed names (Base, field, view, choice) are plain English;
  below, each choice's display name is given in that form. The AirApp
  config additionally carries each name split as
  `localizedName: {en, "zh-CN"}` and renders the half for the active
  language, so the console can still present the Chinese names while
  the installed nodes stay single-language.

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
| `verification` | select | `unverified` (Unverified), `verified` (Verified) |
| `tier` | select | `a` / `b` / `c` — a human's call; the agent may only suggest |
| `owner` | member | who owns this relationship |
| `source` | select | `manual` (Manual), `import` (Import), `conversation` (Conversation match) |

Views: `unverified` (Unverified) — verification equals `unverified`.

## Messages (`messages`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label, e.g. 「Alex：问私有化部署」 (zh-CN seed story) |
| `thread-id` | text | required; one per conversation thread |
| `message-id` | text | required — **deduplication key** |
| `contact` | relation → `contacts` | single; matched by profile URL |
| `direction` | select | `in` (Received), `out` (Sent) |
| `channel` | select | `linkedin` / `whatsapp` / `email` / `wechat` / `other` |
| `sent-at` | date (with time) | when the message actually happened |
| `body` | longtext | necessary excerpt only; long sensitive originals stay a controlled reference |
| `intent` | select | `interested` (Interested), `objection` (Objection), `referral` (Referral), `not-now` (Not now), `wrong-person` (Wrong person), `rejected` (Rejected), `question` (Question), `other` (Other) |
| `urgency` | select | `high` / `medium` / `low` |
| `status` | select | `pending-triage` (Pending triage), `triaged` (Triaged), `drafted` (Drafted), `handled` (Handled), `no-action` (No action) |
| `reply` | relation → `replies` | single; the reply this message produced |

Views: `pending-triage` (Pending triage) — status equals `pending-triage`, sorted
by `sent-at` ascending.

## Replies (`replies`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label |
| `message` | relation → `messages` | single; the message being answered |
| `contact` | relation → `contacts` | single |
| `draft` | longtext | the agent's drafted version |
| `version` | number | increments per revision |
| `approval-status` | select | `draft` (Draft), `pending` (Pending), `approved` (Approved), `approved-edited` (Approved with edits), `rejected` (Rejected), `sent` (Sent) |
| `approver` | member | who gave the verdict |
| `approval-notes` | longtext | **verbatim** — the raw material of Experience |
| `sent-body` | longtext | the exact text sent; its diff against `draft` is the standard |
| `sent-at` | date (with time) | |
| `sent-message-id` | text | written back on send; also logged as an `out` row in Messages |
| `outcome` | select | `replied` (Replied), `no-reply` (No reply), `continued` (Continued), `meeting-booked` (Meeting booked), `declined` (Declined) |

Views: `pending-approval` (Pending approval) — approval-status equals `pending`.

## Actions (`actions`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required, record label |
| `type` | select | `follow-up` (Follow-up), `escalate` (Escalate), `meeting` (Meeting), `send-material` (Send material), `update-crm` (Update CRM field), `new-deal` (New deal), `other` (Other) |
| `source-message` | relation → `messages` | single; use this or `source-reply` |
| `source-reply` | relation → `replies` | single; use this or `source-message` |
| `owner` | member | |
| `due-date` | date | required in practice for `follow-up` |
| `status` | select | `open` (Open), `in-progress` (In progress), `done` (Done), `cancelled` (Cancelled) |
| `result` | longtext | what actually happened — closing is a written outcome, not a status flip |
| `evidence-url` | url | send receipt, meeting link, document link |

`update-crm` rows are proposals: stage/amount changes are applied through
a ChangeRequest showing old value, candidate value and source — never
written directly.

Views: `open` (Open) — status equals `open`, sorted by `due-date`
ascending.

## Experience (`experience`)

| Field slug | Type | Notes |
| --- | --- | --- |
| `title` | text | required — the lesson in one sentence |
| `type` | select | `script` (What works), `objection` (Objection handling), `triage-rule` (Triage rule), `cadence` (Cadence), `forbidden` (Red line) |
| `source-reply` | relation → `replies` | single; use this or `source-action` |
| `source-action` | relation → `actions` | single; use this or `source-reply` |
| `approval-quote` | longtext | the approver's exact words, unedited |
| `scope` | text | which audience / industry / situation this holds for |
| `limits` | longtext | counter-examples — when it does not apply |
| `status` | select | `candidate` (Candidate), `adopted` (Adopted), `promoted` (Promoted to skill), `retired` (Retired) |
| `promoted-to` | url | where the lesson landed when promoted (Skill or Doc link) |
| `last-verified` | date | when this lesson last held in a real round |

Views: `candidates` (Candidates) — status equals `candidate`;
`adopted` (Adopted) — status equals `adopted`.

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
