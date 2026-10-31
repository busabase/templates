# Busa LinkedIn Desk

Busa LinkedIn Desk is a Busabase-backed desk for LinkedIn sales and customer
conversations. LinkedIn is where the conversation happens; the desk is where
it is kept. An agent triages DMs in chat and drafts replies, a human approves
every send, and the human's approval notes are distilled into an Experience
table the agent re-reads before drafting again — so the desk gets more
accurate the more it is used.

## What It Holds

- **Contacts / 联系人** — people, identified by LinkedIn profile URL, never by
  name alone; unmatched senders wait as unverified candidates.
- **Messages / 消息表** — one row per message, in or out, deduplicated by
  message ID, classified by intent and urgency. The Pending triage / 待分诊 view
  is the triage queue.
- **Replies / 回复表** — one row per proposed reply: the draft, the human
  verdict with its exact words, and the text that actually went out. The
  Pending approval / 待审批 view is the approval queue.
- **Actions / 处理表** — follow-ups, escalations, meetings, materials and
  CRM-field proposals, each with an owner, a due date and a written outcome.
- **Experience / 经验表** — one row per lesson distilled from approval
  notes. Adopted lessons are the standards the agent reads before drafting;
  proven ones are promoted into the skill by ChangeRequest.
- **ICP 与话术口径 (Doc)** — the human's standards: ICP, what may and may not
  be said, and the price / commitment / date red lines.
- **Companies / 公司** — a minimal anchor for contacts. If you also run
  Busa CRM, its Companies and Deals stay canonical for pipeline; this desk
  ships no Deals base on purpose.

## How It Runs

The desk is driven from the agent chat and the Bases' queue views,
following the loop **Chat · Review · Act · Log · Learn**. Since v0.2.0 it
also ships a read-only AirApp console, the **Daily Report & Approval
Console / 日报待审批台** — it renders in English or 简体中文 (header
switcher, or `?lang=zh-CN`): the pending-approval queue with each draft and its
source message, today's triage counts and intent mix, due/overdue actions,
threads quiet for over seven days, candidate experience rows, and the
copyable daily report. The console never writes — approvals still happen
in chat, and changes still reach the tables through Change Requests:

1. The agent triages new conversations into Messages and drafts replies
   into Replies (status: pending). Nothing is sent.
2. You verdict each draft in chat: approve, approve with edits, or reject
   with a reason. Your words are saved verbatim.
3. Approved replies are sent in their approved versions, and the sent
   body, time and message ID are written back.
4. Follow-ups become Actions with owners and due dates.
5. Weekly, your approval notes become candidate Experience rows; you
   adopt the proven ones, and the agent reads them before the next draft.

Busabase has no native LinkedIn integration. Conversations reach the agent
by a route you set up: pasted/exported conversations (recommended for the
first cycles), your own logged-in browser session, or a third-party
messaging API you configure with your own account. See the Boundary
section of `SKILL.md` before automating anything — platform terms and
account risk are real, and price, commitments and dates are never the
agent's to give.

## Data

All persistent data lives in Busabase Bases and one Doc under a single
Folder. See `SKILL.md` for the operating manual, 
...[truncated 277 chars]