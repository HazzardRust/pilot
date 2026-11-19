---
status: proposed
date: 2026-11-18
tags: [teacher, lesson, store, cli]
supersedes: []
superseded_by: []
paths: [docs/design/teacher-method/architecture.md]
---
# The teacher teaches by teach-me's moves; a large lesson leaves as a shape-checked md report

We decided that a lesson too large for the deck leaves as one md report, written to the store by `pilot lesson-report <lesson id>`, and that the teaching moves of the user's teach-me skill join `teaching-a-decision` beside its six rules (ADR 0032), with nothing long-horizon taken from it.

## Context

`pilot-teacher` teaches one decision in a lesson it owns (ADR 0053). Some gaps are background outside the decision itself, too long for a deck thread; the user takes those to a claude.ai session running teach-me, which can open neither this repository nor the deck. The teacher has no Write or Edit, and its Bash ran `pilot wait` alone.

## Decision

- **L1** The report is written by `pilot lesson-report`, not by the teacher: the md is piped on stdin through a quoted heredoc (delimiter `LESSON_REPORT_END`), shape-checked by `reportProblems` in `scripts/lesson-report.mjs`, and refused naming each problem: a missing or empty heading of the six, fewer than 3 dot points, a goal without "checked by", a link to a non-http target, a credential shape (`findCredential`), over 60,000 bytes. The teacher keeps no Write or Edit.
- **L2** The report lives in the store, `<store>/lessons/<lesson id>.md` (`PILOT_DECK_DIR` overriding); the id is checked as `itm_<12 hex>` before any path is built, and the write is atomic.
- **L3** teach-me's in-the-moment moves join the skill as `## Teaching moves` beside the six rules, not in place of them.
- **L4** teach-me is credited in the skill's provenance and the ledger, never vendored: no teach-me text is copied.
- **L5** No prompt-phrase pins (ADR 0180): the size call and the moves are evidenced by structural lints, a read and the walkthrough; only the CLI's checker is unit-tested.
- **L6** The size call is the teacher's, made once after the diagnostic: large when the gap is background outside the decision and needs more than 5 steps. The user may force either way by replying `report` or `here` (A1); nothing returns from an off-deck lesson, and the original thread's press still decides (A2).

## Rejected

- Giving the teacher Write: breaks the crew-waits lint and leaves the shape unchecked.
- Posting the report on the deck: the user must upload a file to claude.ai, and deck bodies are capped.
- The repository as the report's home: a shared checkout, a public repository, and a teacher writing into a working tree.
- A new skill for the moves (two copies of the method) or copying teach-me's text (personal and long-horizon).
- A mid-lesson switch to a report by step count: a stalled small lesson already has rule 6's worked step.
