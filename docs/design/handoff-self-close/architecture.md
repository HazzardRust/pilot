# handoff-self-close: a crew hand-off item closes itself

Ticket `itm_a28fc03b3ae5` · base `main` (da9a644) · merge thread `itm_531dc27b41b3` (merged none) · ADR NNNN

## 1. Problem

> did this one fail? if not, we need to find out how to systemically fix either the thread remaining or the handoff not working

Crew-handoff `itm_f93c340ba2f1` (posted 2026-11-20 11:27 UTC) did not fail: the co-pilot handed back and its ticket
went to concluding. The item stayed open 1h18m until the pilot closed it by hand, because closing it depends on the
pilot remembering (`agents/pilot.md:603`). The deck should close these itself, and show the ones that are stuck.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | A `co-pilot` grant on a ticket closes its open crew-handoffs as `successor granted` (built by crew-handoff-trace S5, ADR 0208 L3; kept). | Existing `deck/test/crew-handoff.test.mjs` stays green: 1 item closed, 0 `deck_resolve` calls. |
| 2 | When a crew-handoff's ticket leaves implementing, the deck closes the item with a resolution naming the move: `closed by the deck: <ticket> moved to concluding` (need, gate2, concluding walkthrough), `… sent back to planning` (recut), `… closed` (report, merge, outright close, or gone from the store). A pivot back to yellow closes nothing. *A2 assumed: `need` closes.* | Scratch-deck test, one case per move: 3 moves, 3 items closed, each resolution names its move; a yellow ticket's item stays open. |
| 3 | practitioner: SRE / controller author. The close is level-triggered: a reconcile after every deck write closes any crew-handoff whose ticket is not yellow, so a path the design did not list, or a store written while the deck was down, is still closed on the next write. | Test: a ticket's state set green directly in the store, then one deck write: the item reads closed. |
| 4 | practitioner: on-call reading the trace. Each deck close writes one `resolved` trace row, so `pilot trace <item>` ends `done`. | Test with a temporary home: the row exists with the item and ticket ids; `timeline` tail reads `done`. |
| 5 | A crew-handoff open 10 min or more (`CREW_WAIT_MS`) reads `waiting <age>` (e.g. `waiting 11m`) on its card and thread page, in both decks, and repaints at the 10-minute mark without a reload. Ticketless ones included (A3). | `threadState(item, posted + 11 min)` = `waiting 11m`; at 9 min it is not; a timer test sees one repaint at 10 min. |
| 6 | Handoff failed still reaches the pilot. An item whose press the pilot has not answered is never auto-closed and keeps the press's state, not `waiting`. *A1 assumed: once the pilot has replied after the press, the next grant or move closes it.* | Deck test: press → pilot's wait gets the reply within one wait; a grant and a `need` leave it open (0 closes); after a pilot reply the next settle closes it (1 close). |
| 7 | The card note and `agents/pilot.md` say the deck closes a ticketed crew-handoff; the pilot resolves only a ticketless one or a pressed one. | Read: 2 places changed, the note in `deck/items.mjs` and the `pilot.md` clause, at most as long as before; the `measure-prompt` pin moves down only. |

Line 1 is already delivered; it stays as a regression line because S1 moves its code. Lines 3 and 4 are implied
(a close that misses a path is the failure this ticket is about; ADR 0208 L1 has every step traced by its observer).
Not meant: closing at the agent's hand-back message (a SendMessage the deck never sees), or at `release` (a paused
co-pilot is released before its successor's grant, and the item must stay open through that gap).

## 3. Findings

- `deck/server-tools.mjs:56` `closeCrewHandoffs(ticket)`: called only on a `co-pilot` grant (`:525`, `:532`), via
  `resolveItem(id, 'successor granted')`, writing a `resolved` trace row. It closes over a Handoff failed press today.
- `deck/crew-handoff.mjs` (35 lines): `openCrewHandoffsOf`, `successorOwedOf`, `CREW_WAIT_MS` (10 min), `crewWaitOf`.
  The 10-minute wake to the pilot (`store-tickets.mjs:413 noteCrewWait`) exists; nothing shows the user.
- A ticket leaves yellow through `enterStage` (`deck/store-stage.mjs:19`) from `needTicket` (`store-tickets.mjs:350`),
  `concludeOn` (gate2 post and concluding walkthrough, `store-items.mjs:170-171`) and `recutTicket` (`:499`); it closes
  through `closeTicket` (`store-steps.mjs:18`), `resolveItem` (`store-items.mjs:590`) and `mergeTicket`. Six sites;
  an event hook in each would be six edits inside store writes that cannot write trace rows.
- `deck/server-wait.mjs:361 announceChange` runs after every writing tool (`server-routes.mjs:725`) and page press,
  and calls `armHandoffs`, where the deck's other timer-driven writes are armed (`armCrewWaits`, `armIdle`).
- `deck/items.mjs:786 threadState` is the one state both decks draw (`view/queue.mjs:30`, `view/thread.mjs:45`,
  `ui/render-cards.mjs:288`); an unknown label takes the `waiting` tone.
- Only co-pilot crew-handoffs carry `ticket` (`hooks/lib/guard-advice.js:76`); other crew agents post without one
  (`hooks/context-size-guard.js:589`). Live store: 7 crew-handoffs, 0 open, 2 with a press; `itm_f93c340ba2f1` has
  no `ticket`, being posted the day before the field landed.
- `deck/test/facades.test.mjs` caps deck files at 800 lines: `items.mjs` and `server-wait.mjs` are at 799 (800 by
  its count). `scripts/test/measure-prompt.test.mjs` pins `agents/pilot.md`'s size.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/crew-handoff.mjs` (pure) | `openCrewHandoffsOf`, `settledCrewHandoffsOf(items) → {item, why}[]`, `pressUnanswered(item)` | which items close and why, the press rule, for the grant and the reconcile alike | in-process |
| `deck/crew-settle.mjs` (new, I/O) | `closeCrewHandoffs(ticketId) → string`, `settleCrew(announce) → number` | the resolve loop and trace rows from `server-tools.mjs:56`; the reconcile; (S2) the repaint timers | local-substitutable (temp store and home) |
| `deck/crew-wait.mjs` (new leaf) | `CREW_WAIT_MS`, `crewWaitingOf(item, now) → string \| null` | the waiting label, importable by `items.mjs` without a cycle | in-process |

Deletion test: `closeCrewHandoffs` in `server-tools.mjs` is folded into `crew-settle.mjs` (its rule moves to the pure
seam); `crewWaitOf` survives (it wakes the pilot, a different reader). No fold slice: the moves ride S1 and S2.

## 4. Ubiquitous language

- **crew-handoff**: the deck item a crew agent's guard posts at its mark; ticketed when a co-pilot posts it.
- **settle**: the deck's reconcile that closes every open ticketed crew-handoff whose ticket is not yellow.
- **press**: the user's Handoff failed reply on the item; **unanswered** while no pilot message follows it.
- **waiting**: an open crew-handoff past `CREW_WAIT_MS`, drawn as `waiting <age>`.
- **move**: the ticket's state change that closes the item: concluding, planning, closed.

## 5. Locked decisions

- **L1 Level-triggered reconcile, not event hooks.** `settleCrew` runs inside `armHandoffs` after every change and
  closes on state (`ticket not yellow`). Rejected: a call in each of the six store sites (missed paths, no trace rows
  from inside a store write). Trade: one store read per change, as `armCrewWaits` already does.
- **L2 Close through `resolveItem`**, one write per item, as the grant does today, so ownership, notice and archive
  rules stay one code path. Rejected: an in-hand close inside the moving write (atomic, but a second close path).
- **L3 The grant keeps its close** (ADR 0208 L3) and takes the press rule. Rejected: folding the grant into the
  reconcile (a paused co-pilot is still live until release, so state cannot tell a grant from the old holder).
- **L4 The waiting label is derived from the clock at render**, like `unacknowledged`, never stored. Rejected: a
  stored flag set by a timer (drifts after a restart).
- **L5 Net-zero lines in `items.mjs` and `server-wait.mjs`**: new logic lives in the three seams; a comment line is
  trimmed for each line added. Rejected: a facade split of `items.mjs` (out of scope for 2 slices).
- **L6 A refused close is logged once per item and skipped**, never thrown into `announceChange`, never retried in a
  loop. The reconcile re-announces only when it closed something, so it recurses at most once.
- **L7 Grilling depth: forks** (assumed). Taken by the deck's default after 20 minutes with no answer
  (`itm_b43b3bb41f75`), not by the user.

ADR NNNN records L1-L3 as an extension of ADR 0208 L3.

## 6. Assumed decisions

- **A1 Press rule.** Default: an item with an unanswered press is never auto-closed; once the pilot has replied after
  the press, the next grant or move closes it. Trade: the pilot's reply remains one step. Rejected: never auto-close a
  pressed item (the pilot must remember again). Question `itm_962130e8bae6`.
- **A2 `need` closes.** Default: the deck closes at `need`, even though the ticket may pivot back; the lanes line then
  names the owed successor. Trade: the item's pointer to the paused branch is closed (still readable). Rejected: close
  only at gate2/report (a second rule). Question `itm_61dd35363e32`.
- **A3 Ticketless crew-handoffs.** Default: they show `waiting` and are still the pilot's to close. Trade: those keep
  depending on the pilot. Rejected: tagging them with a ticket in the guard (a hooks slice). Question `itm_9c2e0a9c4326`.
  Closed by the deck's default after 20 minutes with no answer, not by the user: "Assumed: Show waiting only".

## 7. Out of scope

Tagging non-co-pilot crew-handoffs with a ticket (A3); closing the pilot's own `handoff` kind; itm_43827dc32984's
"a pilot hand-off never waits on the co-pilot"; a tab-level badge for a waiting crew-handoff; the Rune deck's own
colour for the label (it takes the `waiting` tone from the view).

## 8. Slices

red team: walked S1's behaviour 1 against `server-wait.mjs` — at 800 lines by the facade count, an added import
breaks `facades.test`; L5 and the new modules answer it. `items.mjs` importing `crew-handoff.mjs` would make a cycle
(it imports `items.mjs`); S2's leaf `crew-wait.mjs` answers it. The grant closes over a press today; S1 owns that
change, and `trace-deck.test.mjs:81` (a press then a grant) may need its expectation moved. A refused `resolveItem`
inside `announceChange` would loop or throw into every write; L6. S1 and S2 both touch `crew-handoff.mjs`; serial.

Width 1; longest stem 2

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 The deck closes a crew-handoff when its ticket moves on | 1, 2, 3, 4, 6, 7 | `deck/crew-handoff.mjs`, `deck/crew-settle.mjs` (new), `deck/server-tools.mjs`, `deck/server-wait.mjs`, `deck/items.mjs` (line 282), `agents/pilot.md`, `docs/adr/NNNN-handoff-self-close.md` (new), `deck/test/crew-settle.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 A stuck crew-handoff reads waiting with its age | 5 | `deck/crew-wait.mjs` (new), `deck/crew-handoff.mjs`, `deck/crew-settle.mjs`, `deck/items.mjs` (threadState), `deck/test/crew-waiting.test.mjs` (new) | S1 (`deck/crew-handoff.mjs`, `deck/crew-settle.mjs`, `deck/items.mjs`) | typescript | [S2](slices/S2.md) |

## 9. Acceptance evidence

1. On a scratch deck, a co-pilot's crew-handoff is posted; at 11 minutes its card reads `waiting 11m` (spec 5).
2. The pilot `deck_ticket need`s its ticket: the card reads resolved, `closed by the deck: <ticket> moved to
   concluding`, with no `deck_resolve` (spec 2, 3); `pilot trace <item>` ends `done` (spec 4).
3. A second item, released and re-granted, closes as `successor granted` (spec 1).
4. A third, pressed Handoff failed: the pilot's wait receives the press; a `need` leaves it open; after the pilot's
   reply the next write closes it (spec 6).
5. `agents/pilot.md` and the card note say who closes what (spec 7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 4, 6, 7 |
| S2 | planned | | | | S1 | 5 |
| feature handoff-self-close | planned | feat/handoff-self-close | | | S1, S2 | 1-7 |
