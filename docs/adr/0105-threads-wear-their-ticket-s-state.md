---
status: accepted
date: 2026-10-09
tags: [deck-ui, tickets, threads]
supersedes: [0052, 0060, 0065]
superseded_by: []
paths: [deck/items.mjs, deck/tabs.mjs, deck/ui/render.mjs, deck/ui/deck.css, docs/design/ticket-state-accents/architecture.md]
---
# Threads wear their ticket's state, and the tab says no phase

The user holds two tickets at once, a green or red one on the main slot and a yellow one a co-pilot builds in the background, and the tab's one phase word ("planning", in green) cannot say two states at once; on 2026-10-07 the user could not tell which ticket was being built. In the user's words: "just have the individual threads own the state of their parent ticket … green, yellow, red, plain for everything that is old and closed, blue for questions that don't owe to a ticket". So we decided the state moves off the tab and onto the threads. This amends ADR 0052's L11 slot (thread-types-phase), ADR 0060's tab colour and ADR 0065's `tab.phase`; the rest of each stands.

- **The co-pilot and the switch reach the renderer as maps from one store read (L3).** `deckLanes()` gives `{ co-pilots, switches }`, which the server passes into `tabsOf` as `tab.coPilot` and `tab.switching`. No flag is written on a ticket item.
- **The reads are pure and live beside `isBehind` (L4).** `accentOf` in `deck/items.mjs` computes a thread's accent from items, and the switch slices put `deckStateOf` and `coPilotStateOf` beside it; the renderer writes their words as attributes, so the UI reads back the names the code defines. Nothing stores an accent or a state.
- **No new event path (L5).** Accents ride on the existing announce and region swap; every accent attribute sits inside a `data-live` region, never on one.
- **A merged ticket's threads take the host's accent (L6)**, through `mergedInto`, one hop.
- **The tab says no phase (L7).** `tab.phase` is gone from `tabsOf`; `renderStripLink(href, text, count, current, ended, unacknowledged)` draws the name, `ended` once the deck's sessions have gone, and the count. The `.phase[data-phase]` selectors leave `deck.css`; the `.ticket-state` and queue summary colours stay. `livePhaseOf` stays: the store's own checks read it.

Rejected:
- Flags on the ticket items for the co-pilot or the switch: they would duplicate the record `pilot run` holds its `/clear` on (clear-waits-co-pilot L3).
- Storing an accent or a state: it would be one more thing to keep in step with the ticket.
- Keeping the tab's word beside the thread accents: one word cannot name two lanes, and a second span puts two states on one tab, which ADR 0052 already rejected.

**Consequences**:
- A tab reads its name and its count, plus `ended`; where a ticket stands is read on its threads and in the Tickets panel.
- A test that wants the in-hand ticket's state reads `inHandOf` or the Tickets panel's `in-hand` row, not the strip.

Recorded in `docs/design/ticket-state-accents/architecture.md` (§2 spec 3, 5; §5 L3, L4, L5, L6, L7).
