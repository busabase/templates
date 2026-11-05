---
name: dealflow-meeting-notes
description: Turn a meeting transcript, call notes or a filed document into one structured meeting record in the Deal Flow desk — minutes, key findings, open questions and follow-ups — linked to the right existing project without creating a duplicate, then update the project's latest finding, next step and last-meeting date. Use when someone hands over a recording transcript, 会议转写, 会议纪要, 访谈记录, a pitch deck or board pack and says log / file / 整理 this meeting. Read busa-dealflow first.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
---

# Transcript → minutes → follow-ups

Read `busa-dealflow` in the same folder first (tables, fields and the rules). This skill covers
turning one meeting into records. Write in the language of the transcript and the team.

## Input

- A meeting transcript or notes (expect recognition errors, nicknames, mixed languages).
- Or a document (pitch deck, board pack, diligence report) — then `kind` is `document`.
- The person may say "this is today's call with Spruce"; what they say wins.

`examples/sample-transcript-spruce.md` (English) and `examples/sample-transcript-spruce-zh-CN.md`
(Chinese) are invented transcripts for trying the whole flow on the sample data.

## Steps

1. **Identify the company.** Pull the company name, short names and founder names from the
   transcript. Search `deals` by `name`, `company` and `aliases`, then `grep` for short names.
   - Exactly one match → use it.
   - Several, or unsure → stop and ask which one.
   - None → tell the person "there is no project for this company"; create one (usually stage
     `first-meeting`) only after they confirm.
2. **Pick type and phase.** `kind`: first time we met → `intro`; later meetings → `follow-up`;
   checking facts with customers, experts or management → `diligence`; investment committee → `ic`;
   a portfolio company's review → `board`; only received material → `document`. `phase` follows the
   project stage: sourcing / first meeting / diligence → `pre`, IC → `during`, portfolio → `post`.
3. **Write the meeting record** (one per meeting, `bases create-change-request` into `meetings`):
   - `title`: `YYYY-MM-DD · Project · Type`.
   - `summary`: 4–8 facts — who said what, and whether a number is their claim or verified.
   - `highlights`: 2–4 findings, **one per line, each readable on its own**; leadership reads them in
     the weekly view. Write what is *new* compared with earlier meetings: which questions closed,
     what changed.
   - `questions`: what is still unverified and the risks they raised.
   - `recorded-by` is the person who handed it over; `logged-via` is you (the agent); `attendees` our
     side first, a semicolon, then theirs.
   - `transcript`: the original text (an excerpt beyond about 20,000 characters; ask the person to
     attach the full file).
   - No amounts, valuations, revenue or profit figures, even if the transcript has them. Write
     "they walked through operating figures; materials filed".
4. **Split out follow-ups** (`bases create-bulk-change-request` into `followups`): only things
   someone promised to do. Each needs an `owner` (for something the other side promised, our person
   who chases it, with that in the title: "Chase Spruce for two customer contacts"), `due-on`
   (convert what was said into YYYY-MM-DD; check the weekday — "next Monday" from a Thursday; leave
   empty if no date), `deal`, `meeting` (the record from step 3), `status: open`. Update an open
   follow-up with the same content instead of adding a duplicate.
5. **Update the project** (`records change-request --operation update`): `latest-finding` becomes
   this meeting's most important finding, `next-step` / `next-step-due` the nearest follow-up,
   `last-meeting-on` the meeting date; add any new short name to `aliases`. **Change the stage only
   if the meeting decided it** (e.g. the partner agreed to start diligence), and say so in the minutes.
6. **Report back:** one sentence on what you wrote (one meeting, N follow-ups, which project fields),
   with links to the meeting record and the project; if anything came back `in_review`, say who reviews it.

## Write examples

```bash
npx --yes busabase-cli@latest bases create-change-request --base-id <meetings base id> \
  --fields-json @meeting.json --message "Log the 11-05 Spruce diligence interview: delivery time and algorithm team checked" \
  --playbook skill:<this skill's node id> --output json
# relations are arrays in meeting.json: "deal": ["<project record id>"]
npx --yes busabase-cli@latest bases create-bulk-change-request --base-id <followups base id> \
  --records-json @followups.json --message "Three follow-ups from the 11-05 Spruce interview" \
  --playbook skill:<this skill's node id> --output json
npx --yes busabase-cli@latest records change-request --record-id <project record id> --operation update \
  --fields-json @deal-update.json --message "Spruce: update latest finding, next step and last meeting" \
  --playbook skill:<this skill's node id> --output json
```

## Checklist before you report

- [ ] No duplicate project; the meeting's `deal` is the right company.
- [ ] Title format is right; `kind` / `phase` make sense.
- [ ] One finding per line, each new for this meeting.
- [ ] Every follow-up has an owner; converted dates are correct.
- [ ] No financial figures; the IC table untouched (unless the person is leadership and asked).
- [ ] Links in your reply.
