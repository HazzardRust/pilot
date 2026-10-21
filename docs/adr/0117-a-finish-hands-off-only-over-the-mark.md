---
status: amended
date: 2026-10-10
tags: [deck, chain, context]
supersedes: [0060]
superseded_by: []
paths: [deck/chain.mjs, deck/server.mjs, hooks/context-size-guard.js, docs/design/handoff-over-mark/architecture.md]
---
# A finish hands off only over the context mark

We decided a clean finish posts the chain hand-off, and so gets a `/clear`, only when the finishing session is past the context guard's advisory mark; under it the chain takes the head ticket live in the same session, and the finish reply says so. This amends ADR 0060's chain, which took the ticket and posted a hand-off on every clean finish.

## Context

A red run finished cleanly while its session still held three red tickets and a co-pilot; the daemon posted the hand-off and `pilot run` typed `/clear`, throwing that context away. The user: "i could be working on many small red runs and i might not need to /clear" (ticket `itm_22ad234ca009`, spec agreed on `itm_e307ffa50bdc`, `docs/design/handoff-over-mark/architecture.md`).

## Decision

**The take stays, the post goes (L1).** `chainNext(repo, { pastMark })` still takes the head ticket in the same tick under the mark; it posts no hand-off item, so `pilot run`'s `clearOnce`, which clears only on a posted hand-off, types nothing. It returns `{ handoff: null, reason: 'under the mark', taken: <id> }`.

**The reply tells the session (L2).** The `deck_status` finish reply ends `; took <id> live here.` No byte of `agents/pilot.md` changes.

**The guard owns the mark (L3).** `hooks/context-size-guard.js` exports `pastAdvisoryAt(dir, snapshot?)`, the status line's `decks[dir]` reading as tokens against `marksFor(PILOT_REFERENCE_WINDOW).advisory`; the chain imports it through `createRequire`, and no number is copied into `deck/`, a test says so.

**No session check (L4).** The daemon does not know the finishing session's id; the directory's entry is read as it stands.

**The start is unchanged (L5).** `atStart` never asks: a starting session has no context to measure.

**No reading is over (L9).** Only `false` is under. No snapshot, no entry, or no figure hands off as before, since the guard is silent too and in place would leave nothing to ever clear that session.

## Rejected

- *The pilot takes the next ticket by `deck_ticket take`*: a clause in `agents/pilot.md`, which has no headroom, and a step that can be forgotten.
- *Copying the advisory number into `deck/`*: two places for one mark to drift.
- *The guard writing a verdict file on every tool call*: a write per call for a read per finish.
- *Carrying the session id on the finish call*: a new `deck_status` field and author-hook work, for the rare case of two sessions in one directory.
- *Always in place*: a session with no reading would never be cleared.

## Consequences

Small red runs finish into the next ticket without a `/clear`. Two sessions in one directory can read each other's entry; either outcome is recoverable (one `/clear` too many, or one ticket taken in a session that later hits the mark and hands off). The chain now reads one file under the home directory on each clean finish.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
