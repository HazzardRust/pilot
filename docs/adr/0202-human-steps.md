---
status: proposed
date: 2026-11-20
tags: [deck, tickets, reports, human-steps]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/items-bounds.mjs, deck/store-steps.mjs, deck/store-items.mjs, deck/owed.mjs, deck/ui/render-cards.mjs, deck/ui/render-rail.mjs, hooks/lib/deck.js]
---
# Human steps are a green thread

We decided that the steps a user does by hand after a landing live in a `steps` thread of their own under the ticket, and the ticket stays open and green until the user presses Done on that thread, which closes both in one write.

## Context

The user closes closing reports as records and does not read them, so the human steps inside them (merge the main PR, set an environment variable, remove a kept worktree) were forgotten. They asked for the steps out of the report, in a thread after Gate 2, with the ticket left in the green section until they press Done. It is a reminder list: nothing waits on it and nothing monitors it.

## Decision

- **A known kind kept out of `POSTABLE_KINDS`** (L3): `KIND_STEPS` in `deck/items.mjs`, like the chat. `deck_post` refuses it; `postSteps` is its one writer, so its schema cannot be bypassed.
- **Standing and a record** (A4): in `STANDING_KINDS` and `RECORD_KINDS` on both sides of the hooks line (`hooks/lib/deck.js`, pinned by `hooks/test/join.test.js`), so it is never in Yours, never holds the Stop gate, takes no reply, and wakes no waiter.
- **Step schema** (L5): 1 to 20 steps, each one trimmed line of 1 to 300 characters, credentials refused; stored as `{ text }` so a later tick is a field.
- **The report's close yields to an open steps thread** (L2): a report on a ticket an open steps thread names clears `live` and `concludedBy` and leaves it green; with none it closes it as before. Both closes go through `closeTicket`, the one list of a close's fields.
- **Done** (L4): `closeItem` on a steps thread writes `CLOSED_BY_USER` and closes its ticket in the same write, with no reply and no `seq`, so no `pilot wait` or `deck_wait` is handed it. `resolveItem` refuses a steps thread for every author.
- **Owed nothing** (L6): `isReportOwed` is false once a report names the ticket. No lane holds it: its signed gate2 already makes it `isLanding`.
- **The reminder is the ticket** (A4): its row reads `human steps` while the thread is open, with the thread under it.

## Rejected

- *Reusing `closeItem`'s user reply* (L4): it carries a `seq` and wakes the owner.
- *A postable kind the pilot posts* (L3): nothing ensures it is posted, and it is a second writer.
- *A Yours card* (A4): it would hold the Stop gate for something nothing waits on.

## Consequences

- A landed ticket can stay green for days; it holds no lane and no next-ticket pick.
- A closed steps thread is not reopened: its Done closed the ticket too, and reopening one alone would split them.

Amended 2026-11-24 (ADR 0216): A4's "never in Yours" stands for agents only. An open steps thread is queued for the user (`isQueued`), an owed press drawn as a home card, and its ticket's row reads `waiting on your steps`, not `human steps`. `STANDING_KINDS`, its hooks mirror and the Stop gate stand.

## Amends

- ADR 0148: `RECORD_KINDS` holds `steps` beside `report`.
- ADR 0154 A2: the report no longer always closes its ticket; an open steps thread keeps it green until Done.
