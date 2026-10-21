# Tickets tab: Add beside the title

Feature `tickets-add-button` · ticket `itm_28891dcb8357` · base `pilot` at `e7c389e4`

## 1. Problem

"the add button in the tickets panel is sitting in a weird spot can we sit it in line with the 'TICKETS' title horizontally"

Today the panel's quiet uppercase title "TICKETS" takes a line of its own, and Add starts on the line below it with nothing beside it.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | On a repository tab's Tickets panel, Add stands on the title's row at its right-hand end, its text on the same baseline as "TICKETS". This holds with tickets queued and with none, at the panel's minimum width (12rem), at its default width, and resized wider. | Screenshots of the Tickets panel on a scratch deck at its minimum and default widths, with and without a queued ticket; the CSS pin `the Add button shares the panel title's row` in `deck/test/make-tickets.test.mjs`. |
| 2 | *(assumed, implied)* What follows Add (the three queues, or "no tickets") starts on the row below and spans the panel's full width, with the same gap under the title row as before. | The same screenshots. |
| 3 | *(assumed, implied)* Every other panel's title (Notifications, Chat, Graph, Status, Agents, Closing reports) is drawn exactly as before. | `deck/test/tabs.test.mjs` `.panel::before` pin green; the new rule is scoped to `#tickets > .panel` (pinned); a screenshot of Status unchanged. |
| 4 | Add still opens a user thread titled `Add`, and its markup is unchanged. | `make-tickets.test.mjs`, `standing.test.mjs` (one form, one button) and `deck-state.test.mjs` (the region starts with `.tickets-state`) green; a live press on the scratch deck opens a thread titled `Add`. |

## 3. Findings

- The title is not an element. It is `.panel::before { content: attr(data-name); display: block; padding: 0.7rem 0 0 }` (`deck/ui/deck.css:990`), drawn from `data-name="Tickets"` on the live region (`deck/ui/strips.html:81`). Spec 33 put it there so that a live swap (`live.mjs` replaces `innerHTML`) cannot lose it. `deck/test/tabs.test.mjs:905` pins `display: block`.
- Add is `renderMakeTickets(repo)` (`deck/ui/render-rail.mjs:257`). It is the first child of `<div class="tickets-state" data-deck-state data-co-pilot-state>` (`render-rail.mjs:510`), and the queues or `<p class="nobody">` come after it. So the block `::before` puts Add on the next line.
- `.panel > form.make-tickets { padding-bottom: 0.6rem }` (`deck.css:1075`) is dead: since `.tickets-state` wrapped the panel content, the form has not been a child of `.panel`.
- `.tickets-state` carries no style and no script reads it (grep over `deck/ui`). Only the tests read it: `deck-state.test.mjs:36,144` (L5 of deck-state: the region *starts with* `<div class="tickets-state"`, inside the live region, never on it).
- The plain `button` rule (`deck.css:585`) has `align-self: flex-start` and `padding: 0.4rem 1rem`, so the row grows to the button's height. The label keeps its baseline.
- Tests pin CSS by regex over `deck.css` text (`uiFile('deck.css')`, e.g. `tabs.test.mjs:907`). No test drives a browser, so the live screenshot is the slice's live gate.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Tickets panel layout (`deck/ui/deck.css`) | `#tickets > .panel` grid (`1fr auto`, `align-items: baseline`); `#tickets .tickets-state { display: contents }`; `.tickets-state > form.make-tickets` (row 1, column 2); `.tickets-state > :not(form.make-tickets)` (`grid-column: 1 / -1`) | the dead `.panel > form.make-tickets` gap rule, replaced by the live selector | in-process |
| `renderMakeTickets(repo): string` (`render-rail.mjs`) | unchanged; reused as is | nothing | in-process |

Deletion test: `renderMakeTickets` keeps the form's markup in one place for two tests and one caller, so it stays and is untouched. Deleting `.tickets-state` would break deck-state's L5, so it stays in the markup and drops out of the layout through `display: contents`. Nothing shallow to fold.

## 4. Ubiquitous language

- **Title row**: the first row of the Tickets panel. It holds the panel's name (the `::before` from `data-name`) and Add.
- **Add**: the `form.make-tickets` button that opens a user thread titled `Add` (`TICKET_MAKING_TITLE`).
- **Panel title**: `.panel::before`, the bookmark's word drawn by the stylesheet. Every panel has one.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | CSS only. The markup is unchanged. | The title is a pseudo-element of `.panel`. A grid on `.panel` with `.tickets-state` as `display: contents` makes the form the next grid item, so auto-placement puts it in row 1, column 2. Deck-state's L5 pin and both Add tests stand untouched. | Moving the form out of `.tickets-state` breaks L5 (`deck-state.test.mjs:144`). Rendering a real heading inside the content brings back the label a swap could lose, which spec 33 removed. `position: absolute` on the form overlaps the title at 12rem and depends on matching padding by hand. |
| L2 | Scoped to `#tickets > .panel`. | No other panel has a control on its title row (spec 3). | Changing `.panel::before` for all panels. |
| L3 | `align-items: baseline`. | Add's text sits level with "TICKETS" whatever the button's padding, and the label keeps its own `0.7rem` top padding. | `center`, which drifts by half the padding difference. |
| L4 | The gap below the title row moves from the dead `.panel > form.make-tickets` to the live selector. | It is the same 0.6rem the rule always meant. Leaving the dead rule in place leaves a lie in the stylesheet. | Leaving it in place. |
| L5 | A regex pin over `deck.css`, plus a markup pin that the form is the first child of `.tickets-state`. | That is how this suite pins layout (`tabs.test.mjs:905`). Auto-placement depends on that order, so the order is pinned too. | A headless-browser layout test, which this repository has no harness for. |
| L6 | Grilling depth is forks: only an assumed decision whose answer changes the deliverable goes to the user. | The user's choice, itm_5d5daf4c967a. | Every assumed decision posted; no grilling. |
| L7 | Add sits at the right-hand end of the title row (`grid-template-columns: 1fr auto`). Locked by the user, itm_a1ba407cc486 (was A1). | The usual header-action place; the title stays steady as the panel resizes. | Directly after the word "TICKETS" (`auto 1fr`): the button moves with the title's length. |

## 6. Assumed decisions

| # | Decision | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A2 | Spec 2 and 3 (implied lines) | Taken as stated. | None beyond scope. |
| A3 | QA environment | A scratch deck on this machine (`pilot deck --scratch --port <spare>`), opened in the user's browser, never the deck on 4321. | A screenshot without the live press would miss spec 4. |

## 7. Out of scope

- Every other panel's title, and the bookmark rail.
- The Add button's own style (the plain `button` rule), its label and its route (`POST /create`).
- Closing reports, which has no control to place.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Add sits on the Tickets panel's title row (walking skeleton) | 1, 2, 3, 4 | `deck/ui/deck.css`, `deck/test/make-tickets.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

No security trigger: no route, input or process change. Estimated at about 30 changed lines.

## 9. Acceptance evidence

1. Open a repository tab on the scratch deck and open Tickets. "TICKETS" is on the left and Add is at the right-hand end of the same row (spec 1).
2. "no tickets", or the queues once a ticket is posted, start on the row below at full width (spec 2).
3. Drag the panel to its narrowest. Add is still on the title's row (spec 1).
4. Open Status and Notifications. Their titles look as before (spec 3).
5. Press Add. A thread titled `Add` opens (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1, 2, 3, 4 |
| tickets-add-button | planned | – | – | – | S1 | 1–4 |
