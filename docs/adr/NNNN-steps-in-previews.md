---
status: proposed
date: 2026-11-24
tags: [deck, human-steps, queue]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/status.mjs, deck/ui/render-cards.mjs, deck/ui/render-rail.mjs, deck/view/tickets.mjs]
---
# A steps thread is queued for the user and standing for agents

We decided that an open steps thread is queued for the user, so it is a home card in both decks, an owed press that never
folds, counted in the strip and listed in Notifications, while it stays a standing kind for agents: the Stop gate and
every waiter are unchanged.

## Context

After a landing the deck posts a human steps thread per ticket, and the user could not find it: no home card, no count
and no notification in either deck, so green tickets sat unmoved on steps nobody saw. The chain that hid it:

1. `deck/items.mjs:123` `STANDING_KINDS = [KIND_TICKET, KIND_REPORT, KIND_STEPS]` (ADR 0202 A4).
2. `deck/items.mjs:522` `isQueued` returned false for every standing kind.
3. `deck/status.mjs:494` `queueOf` filters `isQueued`, so no card, strip or tab count, notification row or thread arrow.
4. `deck/status.mjs:498` `OWED_KINDS` lacked steps, and `isBehind` is true for a released green ticket that is not the
   green hand, so even queued it would fold.
5. The one way in was the Tickets row's shut `threads` fold, through a steps clause beside `isQueued` in
   `deck/ui/render-rail.mjs` and `deck/view/tickets.mjs`.

## Decision

- **Queued, still standing** (A1): `isQueued` admits an open steps thread; `isStanding` and `STANDING_KINDS` are
  unchanged, so `hooks/lib/deck.js` and `join.test.js` are too. The two `|| steps && open` clauses go: `isQueued` says it.
- **An owed press** (L2): `OWED_KINDS` gains `KIND_STEPS`, so a steps thread is a card even behind another ticket.
- **The card counts its steps** (L3): `renderKind` reads `human steps · N steps`; steps carry no tick, so N is the total.
- **One term** (L4): `STEPS_WAITING`, `waiting on your steps`, in `standingOf` and `ticketLabelOf` alike.

## Rejected

- *Dropping steps from `STANDING_KINDS`*: the Stop gate would hold a pilot's turn on steps only the user can do.
- *A steps section of its own*: a second list beside the queue, the one that was missed.
- *Queued but foldable*: the released green ticket is never the hand, so its steps would always fold.

## Consequences

- "Standing" no longer implies "not queued": `isQueued` carries one kind-specific line.

## Amends

- ADR 0202 A4: a steps thread is in the user's queue; its row reads `waiting on your steps`.
