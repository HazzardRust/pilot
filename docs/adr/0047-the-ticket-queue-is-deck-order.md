---
status: amended
date: 2026-09-29
tags: [tickets]
supersedes: []
superseded_by: []
paths: [deck/chain.mjs, deck/items.mjs, deck/store.mjs]
---
# The ticket queue is deck order

A repository's queue of tickets needed to be reorderable (ticket-making spec 7): small up and down arrows on the Tickets tab, and later the pilot moving a ticket through the same mechanism. Every reader of that queue already reads it in the order the deck holds its items: `postItem` appends, the chain hands off the first open ticket of the repository (`deck/chain.mjs`), and the tab lists them as they stand with the head marked `next`. So we decided that the queue *is* that order, and a move is a swap in `deck.items` of the ticket with its nearest open ticket of the same repository, one place up or down. `ticketQueueOf` in `deck/items.mjs` is the one spelling of the queue, and `moveTicket` in `deck/store.mjs` is the one write that changes it; the page's `POST /move` calls it, and the pilot's tool will too.

Rejected:
- A `rank` or `order` field on each ticket that every reader sorts by. Three readers would each have to sort, every existing ticket would need a backfill, and a reader that forgot to sort would silently disagree with the others.
- Sorting in the renderer, or a reorder done only in the browser. The chain would take a head the user never saw, and a reload would put the old order back.
- A second write path for the pilot, such as a tool that posts to the HTTP route. Two ways to move a ticket are two rules to keep in step.

**Consequences**:
- Moving a ticket changes array positions, so anything that reads items "oldest first" by index now reads queue order for tickets. Nothing but the queue depends on a ticket's position.
- The head refuses up and the tail refuses down; a ticket that is closed, or an item that is not a ticket, is in no queue and cannot move.

**Amended 2026-10-19 (stage-queue-tail):** a move is not the only write that changes the queue. `enterStage` in `deck/store-stage.mjs` writes a ticket's state and its place in `deck.items` together, so the queue stays deck order and no rank field is added. A ticket entering a stage joins that stage's tail, on a need, a gate2 post, a signed gate1 and a reopen; one already in the stage, or the only one, keeps its place. A resume returns to the yellow head through `enterStage`. A pivot lands in `greenAt` (first green entry) order ahead of never-green tickets, with unstamped pre-ship tickets after the stamped ones. `greenAt` is written once and never backfilled; it is the one stored timestamp, read only by the pivot placement, while every reader keeps deck position.
