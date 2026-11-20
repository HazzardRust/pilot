---
status: proposed
date: 2026-11-20
tags: [deck-ui, tickets]
supersedes: []
superseded_by: []
paths: [deck/status.mjs, deck/items.mjs, deck/ui/render-pages.mjs, deck/ui/render-strip.mjs, docs/design/nothing-hidden/architecture.md]
---
# Behind folds a thread, never hides it, and never folds an owed press

We decided that a thread waiting behind another ticket is drawn on home inside one counted fold under the cards, never left off the page, and that a gate1, gate2 or signoff of any ticket is always a card; this amends ADR 0065 L3 and L4, whose filter took behind threads off home altogether.

## Context

ADR 0065 fed the overview one ticket at a time by dropping every thread whose ticket was not in hand on its stage (`shownOf` = `queue.filter(!isBehind)`). ADR 0154 L1 then put a landing ticket out of hand, so a landing ticket's gate2 became behind, and a gate2 whose landing ended short went unseen (itm_c6ad0caef772). The strip counted the same filtered list, so nothing on home said a thread was missing. The user's words: nothing waiting on them is hidden; full listing of other tickets' threads is off the table (L8).

## Decision

- **Cards** (L1): `shownOf(queue, items)` keeps every queued thread that is not behind, plus every owed press (gate1, gate2, signoff) that is: non-user threads first, then not-behind before behind, each in queue order. Every caller inherits the owed-press rule.
- **The fold** (L1): `foldedOf(queue, items)` is the rest of the queue, behind and not an owed press, in queue order; the two are the whole queue and disjoint. Home draws it under the cards as `<details class="fold"><summary>N waiting on other tickets</summary>`, only when N > 0.
- **Counts** (spec 2): the strip's Overview and tab counts read the whole queue, never `shownOf` alone, and the thread arrows walk the cards, then the fold (A6), so X/N counts both.
- **Behind keeps its rule and name** (L3): `isBehind` is unchanged and now orders and folds rather than hides.
- **ADR 0154 L1's consequence**: a landing ticket is never in hand, so its threads are behind; its gate2 stays a card until it closes, including after its landing ended short.

## Rejected

- *One `shownOf` returning `{ cards, folded }`*: it breaks the Rune callers of `shownOf` at their rebase.
- *Every other ticket's thread a card* (L8): the user took full listing off the table.
- *In-hand only, everything else folded*: a gate2 in a fold is how a signed landing went unseen.
- *Renaming `isBehind`*: pins in five tests and two ADRs for no behaviour.
