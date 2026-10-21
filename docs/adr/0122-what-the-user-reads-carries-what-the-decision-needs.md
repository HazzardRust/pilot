---
status: accepted
date: 2026-10-11
tags: [agents, voice, deck, qa]
supersedes: []
superseded_by: []
paths: [agents/pilot.md, agents/pilot-architect.md, agents/pilot-teacher.md, agents/pilot-auditor.md, agents/pilot-explorer.md, agents/pilot-qa.md, deck/walkthrough-shape.mjs, scripts/test/crew-voice.test.mjs, docs/design/short-by-default/architecture.md]
---
# What the user reads carries what the decision needs

We decided that the text the user reads from the pilot, QA, the architect, the teacher, the auditor and the explorer carries what the decision needs (the decision, the recommended default and its cost in a line, what happens next), that the rest goes to the PR, the run record or `Teach me` and comes up only when asked, and that an answer is general unless asked, ending with one line on what it can be made specific on.

## Context

ADR 0056 made deck text and reports short by default with detail on request, one section per definition, and forbade brevity wording because it reads as an incentive to think less. The rule said *short* but not *what goes in*, and the user still sorted through paragraphs (QA's especially) for the one thing a decision needed (ticket itm_f679fbab1ae9). QA's walkthrough body carried its checks table by rule (ADR 0090), and the pilot's question body asked for "the evidence".

## Decision

**The rule is content, not length (L1).** Each section names what goes in and where the rest goes; no line or word cap is written in prose.

**One section per definition (L2).** The content sentence joins the existing `## Voice` or "Writing to the user" section, pinned by `USER_FACING` in `scripts/test/crew-voice.test.mjs`; the pilot's question body drops "the evidence".

**Only the walkthrough gets a deck refusal (L3)**: a QA-authored walkthrough body over 10 non-blank lines is refused, beside the command check in `deck/walkthrough-shape.mjs`. Replies and reports stay prompt rules. Overridden by the user on itm_03d153719048, since outliers need more than 10 lines: the refusal stays, with a backdoor. A QA walkthrough posted with `longer`, one line saying why it needs more room, is stored at any length.

**One QA comment (L4)**, posted before the walkthrough with the checks table, edited at sign-off with `--edit-last` for migrations, fixes, seed data and prerequisites.

## Rejected

- *A line or word cap in prose*: brevity wording, which ADR 0056 forbids.
- *A shared preloaded voice skill*: every agent would pay for it on every turn.
- *Caps on replies and reports*: they would refuse the security and irreversible-data cases where longer is allowed.
- *A second QA comment at sign-off*: it splits the record into two places.
