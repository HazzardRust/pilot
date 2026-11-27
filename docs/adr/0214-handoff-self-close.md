---
status: proposed
date: 2026-11-25
tags: [deck, handoff]
supersedes: []
superseded_by: []
paths: [deck/crew-handoff.mjs, deck/crew-settle.mjs, deck/server-wait.mjs, deck/server-tools.mjs, deck/trace.mjs, agents/pilot.md, docs/design/handoff-self-close/architecture.md]
---
# The deck closes a crew-handoff once its ticket leaves yellow

We decided that the deck closes an open, ticketed crew-handoff itself once its ticket is no longer yellow, by a
level-triggered settle run after every deck change, through `resolveItem` with one `resolved` trace row per close;
that the `co-pilot` grant keeps its own close (ADR 0208 L3); and that neither closes an item whose Handoff failed
press the pilot has not answered. This extends ADR 0208 L3.

## Context

Crew-handoff `itm_f93c340ba2f1` (2026-11-20) did not fail: its co-pilot handed back and its ticket went to
concluding. The item stayed open 1h18m until the pilot closed it by hand, because only the grant closed a
crew-handoff and every other close depended on the pilot remembering (`agents/pilot.md`). A ticket leaves yellow at
six store sites (`needTicket`, `concludeOn` twice, `recutTicket`, `closeTicket`, `resolveItem`, `mergeTicket`).

## Decisions

- **L1 Level-triggered settle, not event hooks.** `settleCrew` runs first in `armHandoffs`, which `announceChange`
  calls after every write, and closes on state: a ticket green (`moved to concluding`), red (`sent back to
  planning`), or closed or gone (`closed`). A store written while the deck was down, or a path not listed, is closed
  on the next write. Rejected: a close in each of the six store sites, which misses a seventh and cannot write trace
  rows from inside a store write. Cost: one store read per change, as `armCrewWaits` already pays.
- **L2 Close through `resolveItem`**, one write per item, as the grant does, so ownership, notice and archive rules
  stay one code path. Each close writes a `resolved` row with `agent=deck`, which `pilot trace` reads as the end of
  the hand-off, since no successor will be spawned. A refused close is logged once per item and never retried; the
  settle re-announces only when it closed something, so it recurses at most once. Rejected: closing inside the write
  that moves the ticket (atomic, but a second close path).
- **L3 The grant keeps its close** and takes the press rule: an item whose last user message is Handoff failed, with
  no pilot message after it, is left open by the grant and the settle alike, so the press still reaches the pilot.
  Once the pilot has replied, the next grant or settle closes it. Rejected: folding the grant into the settle, since
  a paused co-pilot is still live until release, so state cannot tell a grant from the old holder.

## Consequences

The pilot closes only a ticketless crew-handoff, or one it has answered whose ticket is still yellow. A pivot back
to yellow after `need` finds its crew-handoff already closed; a fresh one is posted if a successor is needed.
