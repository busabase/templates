---
name: busa-linkedin-desk
description: LinkedIn outreach desk on Busabase — an agent triages sales and customer DMs in chat, drafts replies for human approval, logs every message, reply and follow-up action, and distils the human's approval notes into an Experience table it re-reads before drafting again. Use when the user invokes $busa-linkedin-desk or /busa-linkedin-desk, mentions LinkedIn outreach or DMs （领英外联/私信）, conversation records （沟通记录）, reply approval, running the desk's daily triage or weekly experience review, or asks what a LinkedIn conversation's history or next step is.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-linkedin-desk
    resources:
      - companies
      - contacts
      - messages
      - replies
      - actions
      - experience
    risk: gated-write
---

# Busa LinkedIn Desk

## Overview

Busa LinkedIn Desk is a Busabase-backed outreach desk for LinkedIn sales and
customer conversations. The channel and the record are different things:
LinkedIn is where the conversation happens; this desk is where it is kept.
An agent works in chat — reading new messages, triaging them, drafting
replies — and a human approves every send. Everything lands in Busabase
Bases: every message, every draft and verdict, every follow-up action, and
the lessons distilled from the human's approval notes.

The desk runs one loop, **Chat · Review · Act · Log · Learn**（聊 · 审 · 办 ·
记 · 学）:

1. **Chat.** Work starts and ends in the agent chat: triage proposals,
   drafts and the daily report are brought to the human there.
2. **Review.** The human gives one of three verdicts on each draft —
   approve, approve with edits, or reject with a reason. All three are
   training signal: an approval is a positive example, an edit *is* the
   standard (the diff between draft and sent text), a rejection with a
   reason is a negative example and a boundary.
3. **Act.** Only approved versions are sent or executed. Price,
   commitments and dates are never the agent's to give — they escalate.
4. **Log.** Every message, reply and outcome is written back, deduplicated
   by message ID, linked to its contact and its source.
5. **Learn.** Approval notes become candidate rows in the Experience base.
   A human adopts the proven ones at the weekly review; the agent reads
   adopted lessons before drafting. Lessons that keep proving out are
   promoted into this skill by ChangeRequest, with a diff and an approver.

The point is not that the model gets smarter. It is that the team's
standards get written down, one verdict at a time, and are actually read
on the next round.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node
   discovery, ChangeRequests, review, and merge behavior.
2. Read and follow `$busabase-app-creator` for resource modeling and the
   template/package contract.

If a dependency is unavailable, preserve this skill's local artifact and
product contracts, stop before the unavailable Busabase operation, and
report the exact missing dependency.

## Boundary

- **Nothing is sent without a human verdict on that specific reply.** A
  general instruction ("handle my DMs") never substitutes for approval of
  a draft. Standing approval, if the operator ever grants it, covers only
  the exact scope they named.
- **Price, commitments, and dates are human-only.** Never quote a price,
  hint at a discount, promise a feature, an outcome, or a go-live /
  delivery date. Answer with the general range the ICP doc allows and
  escalate via an Actions row.
- **Busabase has no native LinkedIn integration, and neither does this
  desk.** Conversations reach the agent only by a route the operator
  sets up: pasted or exported conversations (the recommended first
  cycle), the operator's own logged-in browser session, or a third-party
  messaging API/MCP the operator configures with their own account.
  LinkedIn's official API does not offer a personal DM inbox for this
  use. Never present a route as a product integration.
- **Platform terms and account risk are real.** Automated access sits
  awkwardly with LinkedIn's user agreement and accounts do get
  restricted. Keep volumes human, never bulk-blast, and prefer manual
  feeding while the desk is being learned.
- **Privacy minimisation.** Log the excerpt a reviewer needs plus a
  controlled reference to the source — never copy whole sensitive
  conversations into multiple places.
- **A draft is not a send, and a proposal is not a merge.** A reply counts
  as sent only when its sent message ID is written back. Writes follow
  the person's own permission: omit `autoMerge`; a write that lands as a
  ChangeRequest is reported as waiting, never quietly treated as done.
- Treat all contact and conversation data as sensitive. Never commit real
  customer details, tokens, or Busabase credentials into this package.

## Busabase Resources

Six Bases, one Doc and one AirApp under one application Folder
(`busa-linkedin-desk`), declared under `content/`. Exact field shapes live in
`references/linkedin-desk-schema.md`.

- `busa-linkedin-desk-app` (Daily report & approval console / 日报待审批台,
  AirApp): the desk's read-only console — the pending-approval queue with each draft and its source
  message, today's triage counts and intent mix, due and overdue Actions,
  threads quiet for over seven days, candidate Experience rows, and the
  copyable daily report. It only reads: it never sends, approves, or writes.
  When a user asks "what is waiting for me", answering from the console's
  sections or from the same queries against the Bases is equivalent — the
  approval itself still happens in chat, with the human.

- `companies` (Companies / 公司): the minimal anchor for contacts — name, LinkedIn
  company page, industry, website, notes. When Busa CRM is installed
  alongside, its Companies and Deals stay canonical for pipeline; this
  desk deliberately ships no Deals base.
- `contacts` (Contacts / 联系人): people, identified by **LinkedIn profile URL —
  never by name alone**. Role, company relation, verification state,
  tier (a human's call; the agent may only suggest), owner, source.
- `messages` (Messages / 消息表): one row per message, in or out. **Message ID is
  the deduplication key**; when a channel gives no ID, compose one from
  thread ID + send time. Thread ID, contact relation, direction, channel,
  time, body excerpt, intent, urgency, processing status, linked reply.
- `replies` (Replies / 回复表): one row per proposed reply. Draft body and version,
  approval status, approver, **the approval notes verbatim** (they are the
  raw material of Experience), the exact sent body, sent time, sent
  message ID, and the follow-up outcome.
- `actions` (Actions / 处理表): everything a conversation creates that is not a
  reply — follow-ups, escalations, meetings, materials, CRM-field
  proposals, new-deal hand-offs. One row per task: type, source message
  or reply, owner, due date, status, written outcome, evidence link.
  **CRM field changes are proposed here, never applied directly** —
  stage and amount changes go through a ChangeRequest that shows the old
  value, the candidate value, and the source.
- `experience` (Experience / 经验表): one row per lesson — the sentence, its type,
  its source reply or action, the approver's exact words, where it
  applies, its counter-examples and limits, and its status: candidate →
  adopted → promoted into this skill → retired (retire, never delete:
  knowing what stopped working is also experience).
- `icp-and-voice` （ICP 与话术口径， Doc): the human's standards — ICP,
  what may and may not be said, the price/commitment/date red lines, and
  the escalation rules. The agent reads it before every draft; where an
  Experience row conflicts with it, the Doc wins and the conflict is
  raised at the weekly review.

Queue views ship with the Bases: Messages → Pending triage / 待分诊,
Replies → Pending approval / 待审批, Actions → Open / 待办, Experience →
Candidates / 候选经验 and Adopted / 已采纳, Contacts → Unverified / 待核验.

Installed names are slash-bilingual (`English / 中文`, the shape the
installed Bases show); the console renders one language at a time —
English by default, 简体中文 with `?lang=zh-CN` or its header switcher.

## Workflows

The full, adaptable prompt texts are in `references/prompts.md` (P0–P3).

### Setup (once)

Install the template, then fill the `icp-and-voice` Doc — an empty
standard is no standard. If Busa CRM or Busa Sales Outreach are already in
the Space, reuse their Companies instead of duplicating accounts, and say
which Companies base is canonical. Run the first triage cycle manually
(paste or export the conversations) before connecting any messaging
route.

### Daily triage

1. Read the new conversations from the route the operator configured.
2. Match each sender to Contacts **by profile URL**. Unmatched senders
   become candidate contacts marked `unverified` — never merge by name.
3. Log every message in Messages, deduplicated by message ID, classified
   by intent and urgency.
4. For `interested` and `question` intents, draft a reply — after reading
   the ICP doc and the adopted Experience rows — and save it in Replies
   as `pending`. Drafts for objections follow adopted Experience for that
   objection; anything touching price, commitments or dates is not
   drafted, it escalates.
5. Bring the proposals to the human in chat, and finish with the daily
   report: new conversations, drafts waiting, actions due, threads quiet
   for over seven days. **Send nothing in this step.**

### Approval and execution

1. The human verdicts each draft in chat: approve / approve with edits /
   reject with a reason. Record the verdict, the approver, and the words
   verbatim on the Replies row.
2. Send approved replies in their approved versions only, through the
   operator's configured route.
3. Write back the sent body, sent time and sent message ID; log the sent
   message in Messages; set the source message to `handled`.
4. Create the agreed Actions (send materials, book the meeting, follow up
   by a date) with owners and due dates.
5. A failed send stops the run and is reported. Never rephrase and retry
   on your own.

### Weekly review and promotion

1. Summarise the week's Replies and Actions.
2. Distill candidate Experience rows from the week's approval notes, each
   linked to its source with the approver's words quoted.
3. The human adopts, keeps, or retires each candidate. Adopted rows are
   read before every draft from then on.
4. For lessons proven repeatedly, draft the exact change to this skill as
   a diff and propose it by ChangeRequest. Promote nothing before the
   human confirms; afterwards mark the row `promoted` and link where it
   landed.

## Writeback Rules

- Dedupe before every write to Messages: same message ID → update, never
  a second row.
- A Replies row is not `sent` until sent body, sent time and sent message
  ID are all written back.
- An Actions row is closed with a written outcome, not just a status
  flip.
- Every Experience row must trace to a source reply or action; a lesson
  with no evidence stays a candidate forever.
- Statuses move in the open: if a number is reported to the human, it
  must be countable from the Bases.

## Completion Criteria

A desk run finishes only when:

- every new message is logged and deduplicated, and every sender is
  matched or explicitly an unverified candidate;
- every draft the run produced is in Replies with a state a human can
  act on, and nothing was sent without a verdict;
- every sent reply is written back with its sent message ID;
- approval notes from the run are distilled into candidate Experience
  rows, or the run states why there were none;
- the daily report's numbers reconcile with the Bases.

## Stop Conditions

Stop and ask for direction when: the target Space is ambiguous; a
sender cannot be identified beyond a name match; a conversation touches
price, contract, legal, or security review; an existing customer raises
a fault, complaint or renewal; a send fails; or a write comes back as a
ChangeRequest the current credential cannot merge — report it and wait,
never approve your own held write.
