---
status: amended
date: 2026-10-04
tags: [deck-ui, tickets]
supersedes: [0060]
superseded_by: [0085, 0105]
paths: [deck/items.mjs, deck/status.mjs, docs/design/overview-one-ticket/architecture.md]
---
# The overview feeds the ticket in hand, one ticket at a time, read from items at render time

The overview listed every open thread of every ticket at once (`queueOf`, deck-wide), so when several tickets finished their yellow phase together the user came back to all of them "vomited onto my overview". They want to be fed one ticket at a time, and after Gate 1 they moved the rule into implementation mode too: "we should only have 1 ticket on a deck at a time"; an answer to a ticket that is not in hand "would just sit and wait until we got to that ticket". So we decided each repository's queue shows only its ticket in hand's threads and every unticketed one; this amends ADR 0060, whose overview showed every ticket's threads.

- **The ticket in hand is one function (L2).** `inHandOf(items, repo, mode)` in `deck/items.mjs`: the live ticket, else `nextTicketOf(items, repo, mode)`. Attended that is the first red or question-named ticket in deck order that is not yellow, else the first green (L13, L20); autonomous, the first yellow, a blocking question or not (L12, L19). There is no second head function.
- **"Behind" is read, never stored (L3, L16).** `isBehind(item, items, modes)`: the thread names an open ticket of its repository that is not that repository's ticket in hand, in either mode. A thread with no `ticket`, or naming a closed ticket, is never behind; a blocking question hides and shows with its ticket like any other (L19). Nothing is closed, re-posted or flagged; a parked ticket's threads stay open and wait.
- **One filter for the overview and a tab (L4).** `shownOf(queue, items, modes)` in `deck/status.mjs` is a queue less what is behind. The home page lists it, the strip counts it and the thread arrows walk it. `queueOf` stays whole: the Stop hook and `/items` read it.
- **One spelling of a repository's mode (L6).** `modeOf(modes, repo)` in `deck/items.mjs`; the renderer's `modeIn` calls it.
- **The tab's colour and the highlight follow the ticket in hand (L5, L12; spec 9-11).** `tabsOf` takes the stored mode map and `tab.phase` is `stateOf(inHandOf(...))`, live or parked, so two parked red tickets and none live draw a red tab where it drew none. The Tickets row of that ticket carries `class="in-hand"`, the one row `deck.css` highlights; with a ticket live that is the live row alone. Autonomous with no yellow ticket waiting nothing is in hand: no colour, no highlight. `livePhaseOf` stays the live ticket's state for the store's own checks; neither phase nor highlight is stored.
- **A hidden thread is a press away.** Every Tickets row with open threads naming it (questions, walkthrough, gate1, gate2) carries a `threads` disclosure linking each, not the head row alone.

Rejected:
- A stored `hidden` flag on threads: a second writer that drifts from the tickets it describes.
- Red first, then green, beside `nextTicketOf`: two head functions that would name different tickets (ticket-states L19 rejected the same).
- Filtering the overview only: a tab is the overview narrowed (`tabsOf`), and two rules would disagree.
- Attended only, autonomous unchanged (the plan as signed at Gate 1): moved by the user (L16).
- Closing and re-posting a parked ticket's questions: a second writer, and the thread ids change.

**Consequences**:
- Existing decks need nothing: the filter is read-side, and a deck upgraded mid-run shows one ticket's threads at its next render.
- A parked ticket's leftover sign-off, lesson or hand-off still shows: those kinds carry no `ticket` (A3).
- Browser notifications, `/items` and the status table's `Yours` link are unchanged and still name every open thread.

Recorded in `docs/design/overview-one-ticket/architecture.md` (§5 L2, L3, L4, L5, L6, L12, L13, L16); deck threads itm_127a0238b9d2, itm_2dbd54abbff4, itm_0bfcf27836de.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
