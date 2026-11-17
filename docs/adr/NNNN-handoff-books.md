---
status: proposed
date: 2026-11-17
tags: [audit, handoff, friction, pilot, hooks]
supersedes: [0146]
superseded_by: []
paths: [deck/audit.mjs, hooks/session-handoff.js, bin/pilot.mjs, agents/pilot.md, hooks/context-size-guard.js]
---
# The hand-off is when the run keeps its books

This amends ADR 0146's last bullet and handoff-mod's L9. We decided that the audit offer comes due every 20 pilot hand-offs a repository has picked up, counted at the SessionStart lane's claim, instead of every 10 counted runs, and that the hand-off is where the friction rows not yet sent are written.

## Context

The audit was offered every 10th run the pilot counted by hand with `pilot audit count` at step 1, and the hand-off asked for no friction (ADR 0146: "the hand-off writes no friction summary"), so rows not yet sent were lost at `/clear`. The user asked for the hand-off to be the moment the run keeps its books, and for the audit to follow hand-offs, every 20.

## Decision

- **The count lives in the audit record** as `handoffs: [hand-off id]`, each id once, reset by an offer or a saved report as `counted` was (L2).
- **`pilot audit count` and `counted` go** (L3). A record holding `counted` and no `handoffs` reads as no hand-offs, and the next write drops `counted`.
- **The SessionStart lane counts** (L4, A4): after it claims a pilot `handoff` item, chain hand-offs included, it calls `countHandoff` through a dynamic `import()` of `deck/audit.mjs`. A failed count is the log line `lane: hand-off not counted (<why>)` and the notice is still delivered. This amends handoff-mod L9, which put the count at the look's `cleared`: the lane also sees a `/clear` typed with mods off.
- **Due is 20** (`OFFER_EVERY_HANDOFFS`); `auditDue` still answers `first` for a repository never offered nor audited (A2).
- **The hand-off that makes it due says so** in one `AUDIT DUE` line of its notice, and the pilot offers the audit then (A6).
- **Friction is written before the hand-off** (L5): the pilot's hand-off step 1 `deck_status` carries every row not yet sent and its drains; a crew agent's handoff carries its row. This replaces ADR 0146's last bullet.

## Rejected

- *A counter in the run record*: it is per run, not per repository, and lost when the run lands.
- *Keeping `pilot audit count` as a no-op*: a call that does nothing, paid for in pilot.md tokens.
- *Spawning `pilot audit` from the lane*: a process per session start.
- *Counting in the daemon*: it does not see a `/clear`.
- *Counting crew hand-offs and co-pilot pauses* (A3): the audit would come on harness noise, not on the pilot's context.

**Consequences**: the audit offer follows how often the pilot fills its context in a repository, not how many runs it starts; a run that never hands off never brings the audit nearer.
