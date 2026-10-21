---
status: proposed
date: 2026-10-17
tags: [tickets, deck, lanes, blocked]
supersedes: []
superseded_by: []
paths: [deck/lanes.mjs, deck/store-tickets.mjs, deck/items.mjs, deck/blocked-shape.mjs, deck/lane-ticket.mjs, hooks/lib/blocked.js, agents/pilot.md]
---
# A blocked yellow ticket yields the lane

We decided that the deck pauses the co-pilot's held yellow ticket when its blocking question stays unanswered for `YIELD_MS` (20 minutes), so the lane moves on, and that the pilot may close a `Blocked:` item as `Moot:`.

## Context

The user's words: "why not move onto the next task if i have not answered the blocking question after some time?" and "yes, and when it is paused, it flips to green ofcourse". Today a yellow (implementing) ticket whose blocking question waits on the user holds the co-pilot lane idle until the user comes back. Second half, in the user's words: "i see a few of the same issue occurring in blocking questions. is there a systematic fix to this?": `Blocked:` items (auto-mode denials) pile up after the step was done another way or stopped mattering, and the deck refuses the pilot's close of any of them ("it waits for their reply or Assume the default", `deck/store-items.mjs:499`).

## Decision

- **A paused ticket is green with a `paused: { question, at }` mark**, not a new state (L1).
- **The deck pauses on a timer** (L2): `armYields` arms one timer per due yield; on fire `yieldTicket` writes the flip, the release and a `from: 'deck'` line with a `seq` on the question, which wakes the pilot. A restart fires an overdue yield at once.
- **The deck never stops an agent** (L3): the line tells the pilot to send today's pause; the co-pilot integrates its slice in flight and hands back `paused`.
- **`YIELD_MS` is one constant in `deck/lanes.mjs`, 20 minutes** (L4).
- **Only the co-pilot's held ticket yields** (L5): a queued yellow ticket with a blocking item is skipped as not runnable, never flipped.
- **Lane changes stay narrow** (L6): `YIELD_MS`, `yieldsDue`, `runnableYellowOf` and the yellow `next`; `laneTicketOf` lives in `deck/lane-ticket.mjs`.
- **Moot** (A4): the pilot's close of a `Blocked:` item, its resolution starting `Moot:`, on `Blocked:`-titled items only; the user still gets the close notice as with any agent close.
- **Filing** (A2): a crew denial is filed by agent type, under the live co-pilot's ticket (else the live green one) for the co-pilot and its crew, under the live green ticket for `pilot-qa`, under the live red one for architect, explorer, teacher and the pilot; with no lane ticket it is today's plain question.
- The clock starts at the question's `postedAt` (A1); resume needs every blocking item naming the ticket answered (A3); a denied file edit posts no Blocked item (A5); paused tickets are on no lane (A6).

## Rejected

- *A fifth state `paused`* (L1): the mark on a green ticket says the same without a state to migrate.
- *The pilot pausing on a printed line* (L2): a pure read wakes no parked wait.
- *The deck killing the co-pilot* (L3): it has no channel to an agent.
- *Pausing every blocked yellow ticket* (L5): flipping queued ones spreads green over tickets nobody built.
- *`Moot:` on any blocking item* (A4): it lets the pilot answer for the user.
- *Filing by cwd, branch, slug, ticket* (A2): it needs a git call in the hook and a ticket field the run records do not hold.
