---
status: proposed
date: 2026-10-14
tags: [deck, handoff, threads, pilot]
supersedes: []
superseded_by: []
paths: [deck/owed.mjs, hooks/session-handoff.js, scripts/handoff.mjs, agents/pilot.md]
---
# A hand-off carries every owed user thread

We decided that the daemon computes the user threads the pilot owes an answer, serves them on `/api/record`, and that the hand-off lists them and refuses while one is unanswered.

## Context

On 2026-10-13 a hand-off dropped a chat reply the old session had promised to continue, because only the record's `next` survives a hand-off and no notion of a promise existed.

## Decision

- **Owed threads are computed in the daemon** (L6), `owedThreadsOf` in `deck/owed.mjs`, and served as `/api/record`'s `owed`, as lanes are; the CommonJS hooks read them over HTTP.
- An owed thread is an open `chat` or `user` thread whose last message is the user's (*unanswered*) or whose last pilot reply carries `promise` (*promised*).
- **Promise is a `deck_reply` field** (A2), `promise: true`, set by the pilot; a later pilot reply discharges it.
- Each is listed by id with its last line clipped to 120 characters (A3) in the hand-off item and both SessionStart notices, also with no run record. `pilot handoff` refuses only on *unanswered* threads and carries *promised* ones.

## Rejected

- *A second implementation in `hooks/lib/deck.js`*: two readers of one rule drift.
- *A phrase list to detect promises*: it misfires.

**Consequences**: a pilot that forgets the flag owes nothing, which is the cost of A2; a promise it does flag survives `/clear`.
