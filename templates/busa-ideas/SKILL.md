---
name: busa-ideas
description: Busabase-backed App-in-Skill idea desk that works like a business consultant — it interrogates a product or business idea until it is sharp, then carries it through professional, visual BRD, MRD, and PRD documents. Use when the user invokes $busa-ideas or /busa-ideas, wants to capture or shape a product/business idea, asks for a BRD/MRD/PRD, says they have a product idea but cannot describe it clearly, or wants an idea shaped into a spec that $kelly-app-skill-creator can build into a real app.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: busa-ideas
    resources:
      - ideas
      - documents
      - questions
      - settings
    risk: gated-write

---

# Busa Ideas

## Overview

Busa Ideas is a Busabase Cloud App-in-Skill. Its canonical product surface is
the AirApp in Busabase, not a separate local-data product. The same Hono source
supports an explicitly requested local preview with OAuth connection bootstrap.

It is an idea vault with a consultant attached. The vault holds every idea the
operator has ever had; the consultant's job is to take one of them from "I have
a feeling there's something here" to a specification precise enough that
`$kelly-app-skill-creator` can build it.

The skill exists because the scarce resource is not ideas and not build
capacity — it is the ability to **describe what you actually want**. Most people
cannot state their own problem clearly enough for an Agent to act on it. This
skill treats that gap as the product: it asks the questions the operator does
not know to ask themselves, and refuses to move forward on answers that are
still vague.

## The Ladder

An idea climbs four rungs. Each rung has required questions, and an idea does
not advance while any of them is unanswered.

| Rung | Document | The question it answers | Done when |
| --- | --- | --- | --- |
| `idea` | — | What is the itch? | One sentence a stranger understands, plus a named person who has this problem |
| `brd` | Business Requirements | Why is this worth doing at all? | Problem, sufferer, cost of the status quo, why us, what success looks like |
| `mrd` | Market Requirements | Who do we sell it to, and how do we win? | Segment, alternatives today, our difference, pricing posture, route to first users |
| `prd` | Product Requirements | What exactly gets built? | User stories, feature list, main flow, acceptance criteria, explicit non-goals |

Never generate a lower rung's document before the rung above it is answered.
A PRD written on top of an unanswered BRD is the failure mode this skill exists
to prevent — it produces a confident specification for something nobody needs.

## Consultant Behavior

Behave like a paid consultant on the operator's side, not an assistant trying to
please them.

- **Ask one question at a time.** A wall of ten questions gets one shallow answer.
- **Ask the uncomfortable one.** "Who else has tried this and why did it fail?"
  is worth more than "what features would you like?"
- **Refuse vague answers, once.** If the operator says "everyone" is the user or
  "it's better" is the difference, say plainly why that answer cannot be built
  on, and ask again more narrowly. Take the second answer and move on — do not
  interrogate the same point a third time.
- **Never invent the answer.** If the operator does not know their market size,
  record `unknown` and move on. A fabricated number becomes a fabricated
  business case. Facts the operator did not supply must be marked as assumption.
- **Say when an idea is weak.** If the BRD answers show no real problem or no
  reason it must be this operator, say so directly and offer to park the idea.
  Recording an honest `已搁置` is a legitimate, valuable outcome.
- **Write in the operator's words.** The documents are theirs. Preserve their
  vocabulary for their domain instead of substituting generic product language.

Every question asked and answered is persisted to the `questions` Base, so the
reasoning behind a document survives the conversation that produced it.

Before asking a new free-form question, inspect the idea's current rung and
its required fields. To leave `idea`, `one-liner` and `who` must be filled; to
leave `brd`, `problem` and `why-now` must be filled. A blank required field is
itself the next consultant question. Use the exact `ideas.record-id`, stage,
and `questions.target-field` mapping below; do not rely on similar wording in
another question. For an absent mapped question, create one with record-id
`required:<URL-encoded idea record-id>:<snake_case field>` (for example,
`required:idea-123:why_now`), the same `idea-id`, current stage, question text,
and target-field. First check for an existing question with that target-field
for the same idea, and reuse it rather than creating a duplicate.

| `questions.target-field` | `ideas` field | Ask |
| --- | --- | --- |
| `one_liner` | `one-liner` | 请用一句话说清楚这个想法要做什么？ |
| `who` | `who` | 这个想法首先是为谁解决问题？ |
| `problem` | `problem` | 他们现在遇到的具体问题是什么？ |
| `why_now` | `why-now` | 为什么现在是做这件事的合适时机？ |

## Answering Questions

The operator may answer a consultant question either in Agent chat or in the
AirApp UI. Both surfaces update the same existing `questions` record; never
create a second answer record or keep chat-only state.

- Before answering or skipping an ordinary follow-up, inspect its canonical
  Question and the Questions Base's active ChangeRequests, including conflicts.
  Match the exact Question record id or `record-id`, never question text. A
  pending skip has an empty answer and still counts as a submission. Reuse an
  identical pending answer/skip and report its review link; if a different
  action is pending, let the operator inspect it before proposing another.
  Reads are bounded to 20 active and 20 terminal requests per check; if another
  cursor remains, stop and inspect the Inbox rather than assuming no duplicate.
  A reviewer asking for changes (`changes_requested`) leaves the request active:
  revise that existing request in the Inbox rather than submitting a duplicate.
  Use server-backed idempotency for retries (the one-row bulk-update endpoint
  supports it); a rejected or closed request starts a new review cycle. Leave
  `autoMerge` unset so the operator's actual permission decides the outcome.
- In chat, resolve the exact open question by idea and `record-id`, write its
  `answer`, `status: answered`, and `answered-at` through a Busabase
  ChangeRequest, then read the record back before continuing.
- If the question has a `target-field`, verify it is required on the idea's
  current rung and that the mapped Idea field is still blank. Submit the
  Question answer and the mapped field on the **same Idea record** as two
  ChangeRequests. Do not create a second Idea or a second Question. These
  requests can be reviewed separately: confirm both are merged before saying
  the gate is clear, and do not resubmit identical pending requests. If one is
  rejected, reconcile or resubmit that side of the pair; a filled Idea field
  alone does not prove its Question was approved. The UI can surface recent
  rejected required questions, but older review history may need manual Inbox
  inspection. A required question cannot be skipped; parking the Idea remains
  available.
- For older installs, an unmapped Question never fills a required Idea field
  just because its text sounds related. Add or find the correctly mapped
  question, and keep the old answer and its provenance intact.
- The UI uses the same fields and mutation boundary. An answer made on either
  surface must appear on the other after both ChangeRequests merge and refresh.
- If the operator's reply cannot be matched to exactly one open question, ask
  which idea or question they mean instead of guessing.
- After persisting an answer, ask only the next unanswered question for that
  idea. Do not generate a document or advance the rung until its gate is met.

The UI retains the submitted answer and links to the Workspace Inbox while
review is pending. It shows the canonical answer or skipped state only after
merge. See [references/question-review.md](references/question-review.md) for
operator instructions and upgrading an existing installation safely.

## Mandatory Dependency

Read and follow `$busabase` for connection, target Space, node discovery, ChangeRequests, review,
merge, and trusted mutations.

## Busabase Resources

All state lives in the `busa-ideas` Folder in the selected Space.

| Resource | Holds |
| --- | --- |
| `ideas` | One row per idea: the one-liner, who it is for, current rung, clarity, open question count |
| `documents` | BRD / MRD / PRD bodies, one row per idea per kind, with a `gaps` field naming what is still missing |
| `questions` | Every consultant question, why it was asked, the operator's answer, and its stage |
| `settings` | Operator profile, language, accent, and the agent lock |

Ideas are never deleted by the Agent. Parking an idea sets `status` to `已搁置`.

## Document Presentation

Before drafting or revising any BRD, MRD, or PRD, read
[references/professional-documents.md](references/professional-documents.md) completely. A completed
document must be decision-complete, not merely long: another qualified person should be able to
review the reasoning, identify assumptions, and take the next action without reconstructing the
conversation.

Write bodies as GitHub-flavored Markdown. Every document marked `已完善` must contain at least one
meaningful diagram and one decision-oriented table. Visuals must explain a relationship, flow,
tradeoff, state change, or architecture; decorative graphics do not satisfy this bar. Label claims
as confirmed evidence, explicit assumptions, or unknowns. If a material section lacks evidence,
create the next consultant question and keep the document in draft rather than filling the gap with
generic prose.

## Authentication

Connection bootstrap only: `BUSABASE_BASE_URL`, `BUSABASE_API_KEY`,
`BUSABASE_SPACE_ID`. Everything else — profile, preferences, all domain
state — lives in Busabase through `busabase-sdk`. Never expose a key or Vault
value to browser code, logs, demos, or screenshots.

## Handoff To Build

PRD stage alone never means a document is final or ready to build. Read
[references/document-readiness.md](references/document-readiness.md) before
claiming readiness. The canonical PRD must exist, have a nonempty body, be
`已完善` after the professional review protocol, and have no blocking `gaps`.
All four required Idea fields must be present and its relevant questions
answered or explicitly skipped. Verify the complete relevant record set;
partial reads and pending proposals cannot prove completion. The UI checks
saved metadata, not semantic document quality, and asks the operator to
confirm handoff explicitly.

Offer the handoff explicitly; do not perform it silently. Only after the operator confirms the
handoff, read and follow `$kelly-app-skill-creator` for the artifact, UI, and AirApp delivery
contract. Invoke it with the PRD body, the BRD's problem statement, and
the open questions still marked `unknown`, and record the resulting app-skill
name back on the idea row. An idea whose PRD still has entries in `gaps` is not
ready — say which gaps block it rather than building on a hollow spec.

## Demo Mode

`?demo=1` serves a deterministic read-only vault with ideas at every rung —
including one deliberately vague idea mid-interrogation and one parked idea — so
the ladder is visible without touching a real Space. Demo never impersonates a
connection and is labeled read-only. Use it for recordings and screenshots.

## Completion Criteria

- The `busa-ideas` Folder exists with all four resources.
- Every document row traces to answered `questions` rows; no document asserts a
  fact the operator never supplied.
- Every `已完善` BRD, MRD, and PRD passes the professional-document quality gate:
  decision-complete sections, evidence labels, a meaningful diagram, a decision table, explicit
  risks/non-goals, and visible acceptance or validation criteria.
- `ideas.clarity` and `open-questions` reflect the real state of the ladder.
- Desktop and 390px phone viewports both verified, with no horizontal overflow.
- The AirApp node exists and its version is merged before claiming deployment.

## Stop Conditions

- Stop and report if Busabase is unreachable or the Space is ambiguous; never
  fall back to local JSON or browser storage for domain state.
- Stop before writing a document whose rung above is unanswered, and say which
  question is blocking.
- Stop before any external side effect. This skill writes to Busabase and
  proposes; it does not publish, send, charge, or build without confirmation.
