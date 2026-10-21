# Ticket-state accents and ticket switching, both lanes

Feature `ticket-state-accents` · ticket itm_f1eb46885542 (itm_2f6e4ffe0495 merged in, 2026-10-09) · base `pilot` bcc17744

## 1. Problem

The user holds two tickets at once: a green or red one on the main slot, and a yellow one the co-pilot
builds in the background. On 2026-10-07 the co-pilot was live on itm_eb35ade648ba, but the Tickets panel
did not mark it, so the user could not tell which ticket was being built. No thread showed which ticket
it belonged to. The tab's one phase word ("planning", in green) cannot say two states at once. In the
user's words: "just have the individual threads own the state of their parent ticket … green, yellow,
red, plain for everything that is old and closed, blue for questions that don't owe to a ticket", and
"the threads always just follow whatever their ticket's state is".

The merged ticket: on 2026-10-08 the pilot took a green ticket ahead of a red one it had just marked
needed. The user's answer on A2 (itm_a4601baa5a2f) widened that into a mechanic of its own:

> we need a generalised mechanic for swapping tickets. from the tickets panel, i want a button on each ticket so that i can swap to it. ensure it has a confirmation step. ensure that we define the state of a deck; what determines when a ticket is in hand, what determines when there is no ticket in hand. we need to standardise with protocols the transition from one ticket to another. that way when we press a "continue ticket" button, we can decide what happens and how that is managed. for example, we may want to lock all other "continue ticket" buttons or other potentially disruptive buttons during the transition stage. we can also use deterministic in-code definitions to give the user feedback on the state of the transition, such as highlighting the button that was pressed to indicate that the ticket is actively attempted to being switched to, whilst the highlighted ticket indicated what is actually in hand.

> this run

On A7 (itm_4cea49f1a04f) the user extended the mechanic to the co-pilot's lane:

> yellow ticket but different mechanic - swaps what the co-pilot is working on. we need to do the same state defining for what the co-pilot is working on, it the same feedback needs to show up in the tickets panel for what the co-pilot is working on. we should probably differentiate between a co-pilot owned ticket and a pilot owned ticket - yellow-orange is the colour of a pilot owned ticket, we can change it to blue for the co-pilot and also add a vertical label that is written sideways that says co-pilot.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The Tickets panel marks the yellow ticket this repository's live co-pilot holds with its own mark, `co-pilot-held` (drawn per spec 21), and serves its Yellow fold open. The mark leaves on `release`, or when the ticket is no longer open and yellow. | A render test: a live `co-pilots` entry marks that row only; after `release` none. |
| 2 | No other row's highlight changes: the main slot's `in-hand` and `next` stay as they are. A yellow ticket without a live co-pilot is never highlighted. The yellow head, the ticket the next `deck_ticket co-pilot` takes, carries only a quiet `next` chip in the lane's blue when no co-pilot is live (spec 16). | The overview-one-ticket, in-hand and ticket-folds suites pass unchanged. A render test: with no co-pilot, the yellow head carries the blue `next` chip and no row carries `co-pilot-held`. |
| 3 | Every card and thread page carries an accent from its ticket's current state: green, yellow or red. It is plain when the thread or its ticket is closed, and blue when the thread is open and names no ticket (*A3*). A ticket's own thread wears its own state; a merged ticket's threads wear the host's. | A render test of five threads draws the five accents; no item field is written. |
| 4 | The accent follows the ticket: a state change recolours its open threads on the next redraw, with no reload. | Scratch deck: `deck_ticket need` on a yellow ticket turns its walkthrough's card and thread-page mark red, read from the DOM. |
| 5 | The tab drops the phase word and its `data-phase` colour. | The strip test asserts no `class="phase"`. |
| 6 | The pilot's `deck_ticket take` refuses a green ticket while a red or asked ticket waits, naming it. The take that completes a switch (13) is exempt: Continue is the user's way to take out of order. | A store test: refused and named; taking the red one succeeds; a pending switch's take succeeds. |
| 7 | *Withdrawn* (L10): a reply no longer swaps a ticket; the swap is explicit (10-15). | – |
| 8 | A thread page names its ticket and where that ticket stands: `in hand`, `co-pilot`, `parked` or `closed`. | A render test: a walkthrough under a parked ticket shows its title and `parked`. |
| 9 | `pilot.md` states both lanes' states and both `SWITCH` lines: on the main lane, stash then take; on the co-pilot lane, pause, wait for the hand-back, then `deck_ticket co-pilot <to>` and spawn. No other take or co-pilot call happens mid-switch. | A wording pin in `scripts/test/pilot-agents.test.mjs`, within the prompt budget. |
| 10 | **Deck state.** `deckStateOf` gives each repository exactly one word for the main lane, written on the Tickets panel as `data-deck-state`: `held`, `queued`, `empty` or `switching` (§4). **Invariant** (L21): while any open red or green ticket exists, exactly one is in hand and its row is marked. It is `held` when that ticket is live, and `queued` when it is untaken (the next in the deck's order). The state is `empty` only when no open red or green ticket exists. Yellow tickets are the co-pilot's lane and do not count (*A13*). `switching` keeps `from` in hand and lights `to` as pending; the two are never both in hand. The co-pilot's ticket never changes the word. | A table test, one case per word; a render test reads the attribute. A deck with only queued (untaken) tickets always marks exactly one row `in-hand`, in each mix of red, green and asked tickets. A deck whose only open tickets are yellow reads `empty` and marks no `in-hand` row. A `switching` deck has exactly one `in-hand` row (`from`) and one `pending` button (`to`). |
| 11 | **Continue ticket.** Every open red or green row that is not in hand carries a Continue button; yellow rows get theirs in spec 17 (L16). As amended at the walkthrough (itm_de3054766ae1, L9): it is an icon-only play button, a right-facing triangle named Continue for a screen reader, at the row's right edge between the up arrow at the top and the down arrow at the bottom. Its first press blanks the whole row to its confirm step alone ("Switch to <title>?" and Confirm); a press anywhere else, or Escape, puts the row back and writes nothing. | A render test of the button and its confirm step, and a `confirm.mjs` test of the takeover and its revert; in the browser, a press off Confirm leaves the deck unchanged. |
| 12 | **Request.** Confirm is one write: the switch record `{ from, to, at }` for the repository, plus a user reply on the `to` ticket carrying `switch`. The pilot's `pilot wait` prints `SWITCH <from> -> <to>`. With no live session in the deck, that same write completes the switch (L20). | A store test of the single write; a `printed()` pin; a route test with no session. |
| 13 | **Complete or cancel.** While a switch is pending, `deck_ticket take <to>` parks `from`, takes `to` live and clears the record, all in one write. Cancel on the lit button clears the record and tells the pilot with a reply. | Store tests for take-completes, cancel-clears and the pilot's reply. |
| 14 | **Lock.** While switching, every other Continue is drawn disabled and its POST refused. The red and green arrows, Start and End are refused naming the switch, and so are agents' take, park, merge and pivot on either ticket, except the completing take (L12). | Render and route tests; store refusal tests. |
| 15 | **Feedback.** The pressed row's button is lit `data-switch="pending"` and reads "switching…" while the in-hand mark stays on `from`. When the take lands, the mark moves to `to` and the button goes, with no reload. | Scratch deck: the DOM read after Confirm and again after `deck_ticket take`. |
| 16 | **Co-pilot state.** `coPilotStateOf(items, repo, lanes)` gives the co-pilot lane exactly one word, written on the Tickets panel as `data-co-pilot-state`: `held`, `queued`, `empty` or `switching`. `held` means a live co-pilot builds a ticket; only that row is highlighted (`co-pilot-held`). `queued` means no co-pilot is live and a yellow ticket waits: the yellow head (the first open yellow ticket in deck order, `ticketQueueOf(items, repo, 'yellow')[0]`) carries a `next` chip in `--lane-co-pilot`, the same form as the main lane's `next` span, and no highlight (L22). `empty` means no open yellow ticket. `switching` keeps `from` held and lights `to` as pending. | A table test, one case per word; a render test reads the attribute. A render test: with no co-pilot, the yellow head carries the blue `next` chip and no row carries `co-pilot-held`. |
| 17 | **Co-pilot Continue.** Each open yellow row the co-pilot does not hold carries Continue, with the same confirm step. Confirm is one write: `switches[repoKey].coPilot = { from, to, at }` plus a user reply on `to` carrying `switch` with lane `co-pilot`. The pilot's `pilot wait` prints `SWITCH co-pilot <from|none> -> <to>`. | A store test of the single write; a `printed()` pin. |
| 18 | **Co-pilot complete or cancel.** While a co-pilot switch is pending, `deck_ticket co-pilot <to>` replaces the co-pilot entry with `to` live and clears the record, in one write; a `release` of `from` beforehand is allowed but not required. The pilot gets there through the existing pause and hand-back (L23). Cancel clears the record and tells the pilot. | Store tests: the completing call, cancel, and the pilot's reply. |
| 19 | **Co-pilot lock** (L12 on this lane). While the co-pilot lane is switching, the other yellow Continues are drawn disabled and refused. `co-pilot`, `release`, `need` and `pivot` on `from` or `to` are refused, except `release from` and `co-pilot to`. The lanes lock independently (L17). | Render tests; store refusal tests. |
| 20 | **Co-pilot feedback.** The pressed yellow row's Continue is `pending`, and the co-pilot mark stays on `from` until the completing call, then moves, live. | Scratch deck: the DOM read after Confirm and again after `deck_ticket co-pilot <to>`. |
| 21 | **Two marks told apart.** The pilot's in-hand row keeps today's amber (`--state-waiting` background and 3px inset bar, `deck.css:1067`, the user's "yellow-orange"). The co-pilot's row is blue, a new `--lane-co-pilot` token, with a sideways `co-pilot` label (`writing-mode: vertical-rl`) down its edge. | A render test of both rows; a screenshot of the panel. |

## 3. Findings

- **Co-pilot record**: `deck.coPilots[repoKey] = { ticket, live, at }` (`deck/store.mjs:1457-1505`), with `coPilotFor`'s rule at `:1471`. It is not in `items`, so it reaches the renderers through `tabsOf` the way `wrapped` does (`deck/tabs.mjs:87`, `:139`). The switch record is the same shape of fact: deck-level, per repository.
- **In hand today**: `inHandOf` is the live ticket, else `nextTicketOf` (`deck/items.mjs:715-727`, ADR 0065). It is never yellow (ADR 0087). `isBehind` (`:735`) feeds the overview from it.
- **Marks**: `marked` (`deck/ui/render.mjs:1710`), `renderTicketRow` (`:1394`), `renderTicketQueue` (`:1421`). The arrows go through `POST /move` (`deck/server.mjs:1356`), behind `fromOwnPage`.
- **Phase word**: `tab.phase` (`tabs.mjs:145`), `renderStripLink` and `stateSpan` (`render.mjs:1069-1081`), and `deck.css:321-324`. It is pinned by `phase.test`, `in-hand.test` and `number-shown.test`, and decided by ADR 0060, ADR 0065 and thread-types-phase L11.
- **Live path**: every `deck_ticket` call and every browser press announces `changed` (`server.mjs:965`, `:1209`). `deck/ui/js/live.mjs:159-186` refetches and swaps each `[data-live]` region's innerHTML. The Tickets panel is `data-live="tickets"` (`strips.html:81`).
- **Confirm**: `deck/ui/js/confirm.mjs` is the one confirm step for Create, Start, End and Remove. With no script, one press posts.
- **Wait**: `repliesSince` (`store.mjs:1200`) carries every user reply, of any item and with all its fields, to `deck_wait`. A field on the reply therefore reaches the pilot without a new channel. `deck/wait.mjs:93` `printed()` prints id, title, text and the fallback note.
- **Ticket writes**: `takeTicket` (`store.mjs:1075`) refuses when another ticket is live. `parkTicket` is at `:1088`, `mergeTicket` at `:1105`, `needTicket` at `:1140` and `pivotTicket` at `:1162`. Each does one readDeck and one writeDeck.
- **Start and End**: `/start-session` (`server.mjs:1306`) and End (`:1326`). A session is live when `liveRuns(tab.runs)` is non-empty (`tabs.mjs:142`).
- **Colour clash**: the state words already use amber for "waiting" and blue for "with the pilot" (`deck.css:42-43`).
- **Pilot mark**: `.tickets-list li.in-hand` is `--state-waiting` (amber, `#d97706`) as a 14% background and a 3px inset bar (`deck/ui/deck.css:1067`). The thread-state word "with the pilot" is already blue, `--state-pilot` (`:43`).
- **Co-pilot pause**: `agents/pilot-co-pilot.md:74-77`. On `main`'s pause, the co-pilot integrates the slice in flight through its gate and review, starts nothing else, and hands back `paused`; the ticket stays yellow. `setCoPilot` overwrites the repository's one entry (`store.mjs:1493`).
- **Prompt**: `agents/pilot.md:133-140` already gives the take order (questions, then red, then green).

## 4. Ubiquitous language

- **Accent**: `accentOf(item, items)`: `green`, `yellow`, `red`, `plain` or `blue`. It is never stored.
- **Deck state**: `deckStateOf(items, repo, switching)`, exactly one of:
  - `held`: a ticket of this repository is live on the main slot. *In hand* is that ticket.
  - `queued`: none is live; `nextTicketOf` names one. *In hand* is that ticket, untaken, the next in the deck's order (questions, red, green).
  - `empty`: no open red or green ticket exists. *No ticket is in hand.* This is the only way to reach it.
  - `switching`: a main switch record is pending. *In hand* is still its `from`, and `to` is only lit as pending.
  - **Invariant** (L21): while any open red or green ticket exists, exactly one is in hand and marked; `to` is never in hand before completion. Yellow tickets are outside this lane (A13). It holds by construction, because `nextTicketOf` yields an open non-yellow ticket whenever one exists (`deck/items.mjs:715-720`), and the state is computed on every draw, never stored.
  The co-pilot's ticket is outside the deck state: it is the co-pilot lane.
- **Co-pilot state**: `coPilotStateOf(items, repo, lanes)`, exactly one of:
  - `held`: a live co-pilot entry names an open yellow ticket (`coPilotFor`'s rule). That ticket is the co-pilot's, and its row alone is highlighted (`co-pilot-held`).
  - `queued`: no live co-pilot, and an open yellow ticket exists. The **yellow head**, the first open yellow ticket in deck order, is what the next `deck_ticket co-pilot` takes. It carries a blue `next` chip and no highlight.
  - `empty`: no open yellow ticket.
  - `switching`: a co-pilot switch record is pending. `from` is still held, and `to` is only lit as pending.
  - **Highlight means held** (L22): on the co-pilot lane, the row style marks a ticket a live co-pilot is building and nothing else.
- **Lane**: `main` (the pilot session's ticket in hand) or `co-pilot`. Each lane has its own state, switch record, lock and mark.
- **Switch**: the record `deck.switches[repoKey][lane] = { from: id | null, to: id, at }`. It is written by Confirm and cleared by the completing call (`take` on main, `co-pilot` on the co-pilot lane) or by Cancel.
- **Transition protocol**: request, then complete or cancel (§5 L13-L15, L18-L20). There is no other path from one ticket in hand to another.
- **Swap feedback**: `data-switch` on a row's Continue: `idle`, `pending` (the pressed one) or `locked` (every other in the same lane while switching).
- **Marks**: `in-hand` (the main lane's ticket, amber) and `co-pilot-held` (the co-pilot's ticket, blue, with the sideways label).

## 5. Locked decisions

- **L1** Grilling depth is *forks* (itm_4e32a4fd2887).
- **L2** QA runs on a scratch deck daemon in a browser through chrome-devtools (itm_630a14d3c646). A co-pilot entry is set with `deck_ticket co-pilot`.
- **L3** The co-pilot and the switch reach the renderer as maps from one store read, `deckLanes()` → `{ co-pilots, switches }`, which the server passes into `tabsOf` as `tab.coPilot` and `tab.switching`. *Rejected*: flags on the ticket items, which would duplicate the record `pilot run` holds its `/clear` on (clear-waits-co-pilot L3).
- **L4** `accentOf`, `deckStateOf` and `coPilotStateOf` live in `deck/items.mjs` beside `isBehind`, as pure reads. Render writes their words as attributes, so the UI reads back the very names the code defines. *Rejected*: storing an accent or a state.
- **L5** No new event path. Accents and switch feedback ride on the announce and region swap. Each attribute sits **inside** a `data-live` region, never on one.
- **L6** A merged ticket's threads take the host's accent (`mergedInto`, one hop).
- **L7** The phase word is removed outright; `livePhaseOf` stays. ADR 0105 amends 0060's tab colour and thread-types-phase L11.
- **L8** The take refusal sits in `takeTicket` and reads `nextTicketOf`, so the chain cannot bypass it. A pending switch's `to` is exempt (added by S7).
- **L9** Continue reuses `confirm.mjs`'s confirm step and `/move`'s `fromOwnPage` guard. *Rejected*: a `confirm()` dialog, which the deck has never used.
  *Amended by the walkthrough* (itm_de3054766ae1, 12:50-12:52): "let's replace it with just a play button, no text, just a symbol like a video is paused and you need to play it, a triangle facing right. it should have a confirm step still, but lets have it different. the confirm step should have the entire card go blank, with the confirmation step just taking up the card. clicking anywhere reverts the card's state." and "i want the arrows to stay on the very right of the card, but i want the one that goes up to be at the top, and the one that goes down to be at the bottom. in between can sit the play button." Continue's step is still driven by `confirm.mjs`, but as its in-place variant: no Cancel, the row taken over, any other press or Escape reverting it; Create, Start, End and Remove keep the shared popout step unchanged.
- **L10** A reply does not swap a ticket; switching is explicit (the user's A2 answer). *Overridden*: the pilot's recommendation to queue the mechanic as its own ticket, at the cost of a design round and about 3 more slices before Gate 1.
- **L11** The accent is a 3px left stripe on the card and a leading mark on the thread page, in the ticket-state palette (`deck.css:322-324`) plus blue; the state words keep their hues (the user's A1 answer, itm_d14e0d413546).
- **L12** The lock set while switching: the other Continues, the ticket arrows, Start and End, and agents' take, park, merge, need and pivot, except the completing take; replies, Sign off, Close and Add stay open (the user's A8 answer, itm_65bb86edbfa3).
- **L13** The request is one write: the switch record plus a user reply on `to` carrying `switch`. That reply is the pilot's wake, through the existing `repliesSince`. *Rejected*: a new wait channel.
- **L14** Completion is `takeTicket(to)` while the record is pending: park `from`, take `to`, clear the record, in one write. *Rejected*: a new `deck_ticket switch` action, which would be a second verb for the same take.
- **L15** With no live session in the deck, the request write also completes the switch, because nobody is there to stash. A stalled switch is ended by Cancel; there is no timeout (assumed, named in A6).
- **L16** The co-pilot lane gets the same mechanic: a state, Continue, feedback, and a blue mark with a sideways `co-pilot` label set apart from the pilot's amber (the user's A7 answer, itm_4cea49f1a04f, quoted in §1).
- **L17** The two lanes are independent: each has its own record, its own lock and its own completing call. A main switch locks no yellow row, and a co-pilot switch locks no main row. *Rejected*: one deck-wide lock, which would make a co-pilot swap block the user's own ticket. *Reading taken* (fix round): L12's lock set names either ticket of the main switch, so a main switch refuses no `need` on a yellow ticket and no yellow arrow; spec 14 amended to match.
- **L18** The co-pilot switch completes with the existing `deck_ticket co-pilot <to>`, which already overwrites the repository's one entry. *Rejected*: a new verb.
- **L19** The switch record is per lane, `switches[repoKey] = { main?, co-pilot? }`, read by S5's `deckLanes()`.
- **L20** A switch is two-phase: the press requests and the pilot completes, so the lit button and the mark can differ (the user's A6 answer, itm_c0b6539be03e). *Rejected*: an immediate park and take, with the pilot told after.
- **L21** There is always a ticket in hand while one exists (the user's A5 answer, itm_4bcbf4081ff9): "i want this to be better defined - there should always be a highlighted ticket - the only way for the deck to reach a state of no ticket in hand is if there are no tickets. there always needs to be a ticket in hand, and that should remain separate from the ticket that is being switched to." So `queued` counts as in hand, and `empty` means no open red or green ticket. A switch record whose `from` or `to` is no longer an open red or green ticket (closed by the user's Close, which L12 leaves open) is read as none, so the invariant never rests on a stale record. *Rejected*: in hand meaning live only.
- **L22** The co-pilot lane has `queued`, shown by a chip and never by the highlight (the user's A10 answer, itm_75b3d9d42d6b): "I am fine with a ticket looking like it is owned, i care about it looking like it is active when it isnt however. the highlight on a ticket is what signifies that it is in hand. we can signify what ticket will be in hand if a co-pilot spawns again, i am okay with that". The yellow head is `ticketQueueOf(items, repo, 'yellow')[0]`, the head the pilot's Yellow section already spawns for (`agents/pilot.md:137-138`). *Rejected*: no `queued` (the earlier default), and a highlighted yellow head, which would look active when no co-pilot is.
- **L23** A co-pilot switch completes at the co-pilot's next hand-back point (the user's A11 answer, itm_0f4c6e32a151): the pilot sends the existing pause, the co-pilot takes its in-flight slice through gate and review and hands back `paused`, then the pilot runs `deck_ticket co-pilot <to>` and spawns. No in-flight work is lost; the lane reads `switching` for up to one slice. *Rejected*: TaskStop at once, which loses the in-flight slice's uncommitted work.

## 6. Assumed decisions awaiting the user

- **A3** Blue scope (named in A1). *Default*: every open unticketed thread. *Trades*: a hand-off reads blue like a question.
- **A9** Two blues (assumed). A3's blue unticketed-card stripe stays, because it is on a different surface: the card stripe in the main column, while the co-pilot mark is on a Tickets row. No place draws them side by side. A yellow ticket's own card is yellow-striped, and a row's previews carry no accent. *Trades*: blue means "unticketed" on a card, "co-pilot" on a row and "with the pilot" on a state word (noted to the user in A10's body).
- **A12** No live session (assumed). A co-pilot switch request waits, and the next pilot session's wait hears its reply.
- **A13** Yellow does not count toward the main lane (assumed). A repository whose only open tickets are yellow reads `empty` on the main lane, and its co-pilot lane says what is being built. *Trades*: the user's "there should always be a highlighted ticket" read literally would light a yellow row amber, against ADR 0087.

## 7. Out of scope

- Titles set off from prose (itm_e24283466e43).
- Recolouring the state words.
- A Continue on the overview, which has no Tickets panel.
- A switch timeout.
- Removing `livePhaseOf`.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | The co-pilot's ticket is marked in blue with its sideways label (walking skeleton) | 1, 2, 21 | `deck/store.mjs` (`liveCoPilots`), `deck/tabs.mjs`, `deck/server.mjs` (page routes), `deck/ui/render.mjs` (page renderers, `renderStrips`, `renderTicketRow`), `deck/ui/deck.css` (`--lane-co-pilot`, `li.co-pilot-held`), `deck/test/co-pilot-mark.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | Cards and thread pages wear their ticket's accent, live | 3, 4, 8 | `deck/items.mjs` (`accentOf`, `standingOf`), `deck/ui/render.mjs` (`renderCard`, thread KIND), `deck/ui/deck.css`, `deck/test/accents.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 | The tab says no phase | 5 | `deck/tabs.mjs`, `deck/ui/render.mjs` (strip), `deck/ui/deck.css`, `deck/test/phase.test.mjs`, `deck/test/in-hand.test.mjs`, `deck/test/number-shown.test.mjs`, `docs/adr/0105-…` (new), `docs/adr/README.md` | S2 | [S3](slices/S3.md) |
| S4 | Take refuses green while red waits | 6 | `deck/store.mjs` (`takeTicket`), `deck/test/take-order.test.mjs` (new) | S1 | [S4](slices/S4.md) |
| S5 | Both lanes name their state | 2 (chip), 10, 16 | `deck/items.mjs` (`deckStateOf`, `coPilotStateOf`), `deck/store.mjs` (`deckLanes` replaces `liveCoPilots`), `deck/tabs.mjs` (`tab.switching`), `deck/server.mjs` (page routes), `deck/ui/render.mjs` (`data-deck-state`, `data-co-pilot-state`, the yellow head's `next` chip), `deck/ui/deck.css` (the chip in `--lane-co-pilot`), `deck/test/deck-state.test.mjs` (new), `docs/adr/0106-…` (new, from `adr-0106-draft.md`), `docs/adr/README.md` | S3, S4 | [S5](slices/S5.md) |
| S6 | Continue ticket requests a main switch | 11, 12, 15 | `deck/store.mjs` (`requestSwitch`), `deck/server.mjs` (`POST /switch`), `deck/ui/render.mjs` (Continue on `renderTicketRow`), `deck/ui/deck.css`, `deck/ui/js/confirm.mjs`, `deck/test/switch-request.test.mjs` (new) | S5 | [S6](slices/S6.md) |
| S7 | The pilot hears a main switch and completes it | 12, 13, 15 | `deck/store.mjs` (`takeTicket` completes, `cancelSwitch`), `deck/server.mjs` (`POST /switch-cancel`, no-session path), `deck/wait.mjs` (`printed`), `deck/ui/render.mjs` (Cancel), `deck/test/switch-complete.test.mjs` (new) | S6 | [S7](slices/S7.md) |
| S8 | Nothing disruptive runs mid-switch | 14 | `deck/store.mjs` (`refuseMidSwitch`), `deck/server.mjs` (Start, End, `/switch`), `deck/ui/render.mjs` (`locked`), `deck/test/switch-lock.test.mjs` (new) | S7 | [S8](slices/S8.md) |
| S10 | Continue on a yellow row requests a co-pilot switch | 17, 20 (pending) | `deck/store.mjs` (`requestSwitch` lane `co-pilot`), `deck/server.mjs` (`/switch` lane), `deck/wait.mjs` (`SWITCH co-pilot`), `deck/ui/render.mjs` (yellow-row Continue), `deck/test/co-pilot-switch.test.mjs` (new) | S8 | [S10](slices/S10.md) |
| S11 | `deck_ticket co-pilot <to>` completes a co-pilot switch; Cancel clears it | 18, 20 (completion) | `deck/store.mjs` (`setCoPilot` completes, `cancelSwitch` lane), `deck/server.mjs` (`/switch-cancel` lane), `deck/ui/render.mjs` (Cancel on the yellow row), `deck/test/co-pilot-switch-complete.test.mjs` (new) | S10 | [S11](slices/S11.md) |
| S12 | Nothing disruptive runs mid co-pilot switch | 19 | `deck/store.mjs` (`refuseMidSwitch` lane `co-pilot` in `setCoPilot`, `needTicket`, `pivotTicket`), `deck/ui/render.mjs` (yellow `locked`), `deck/test/co-pilot-switch-lock.test.mjs` (new) | S11 | [S12](slices/S12.md) |
| S9 | The pilot follows both protocols | 9 | `agents/pilot.md` (Yellow, Red, Phase A take), `scripts/test/pilot-agents.test.mjs` | S11 | [S9](slices/S9.md) |

Unchanged: S2, S3, S4, S6, S7 and S8. Revised: S1 (blue mark and sideways label, spec 21) and S5 (both lanes, the per-lane record). S9 now comes after S11 and covers `SWITCH co-pilot`. New: S10, S11 and S12. After S1, the S2→S3 line runs beside S4. S5–S8 and S10–S12 are serial, because all of them edit `store.mjs` and `render.mjs`. S9 runs beside S12. That makes 12 slices, each within a 300-line diff.

## 9. Acceptance evidence

On a scratch deck in a browser (L2), in the order a user meets them:

1. The tab shows no phase word (5). The Tickets panel reads `data-deck-state="held"` and `data-co-pilot-state="held"` (10, 16).
2. The green row in hand is amber. The yellow row the co-pilot holds is blue, with `co-pilot` running sideways down its edge, and its fold is open. `release` clears that row's mark live and leaves the green row untouched (1, 2, 21).
3. Cards show green, yellow and red stripes, a blue chat card and plain settled cards (3). `deck_ticket need` turns a yellow walkthrough red, live (4). Its thread page names the ticket and its standing (8).
4. `deck_ticket take` of a green ticket while a red one waits is refused, naming the red one (6).
5. Play on the red row blanks it to its confirm step, and a press anywhere else puts it back and changes nothing (11). Confirm lights that button `switching…` while the green row stays in hand, and the other main Continues grey out (15, 14). `pilot wait` prints `SWITCH` (12). `deck_ticket take <red>` moves the amber mark, live (13). With the session ended, Continue completes at once (12).
6. Continue on a second yellow row lights it `pending` while the blue mark stays put. The other yellow Continues grey out, but the main rows do not (17, 19, 20). `pilot wait` prints `SWITCH co-pilot` (17). `deck_ticket co-pilot <to>` moves the blue mark, live (18, 20). A further co-pilot switch is cancelled from its lit button (18).
7. The `pilot.md` wording pin is green (9).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 21 |
| S2 | planned | | | | S1 | 3, 4, 8 |
| S3 | planned | | | | S2 | 5 |
| S4 | planned | | | | S1 | 6 |
| S5 | planned | | | | S3, S4 | 2, 10, 16 |
| S6 | planned | | | | S5 | 11, 12, 15 |
| S7 | planned | | | | S6 | 12, 13, 15 |
| S8 | planned | | | | S7 | 14 |
| S10 | planned | | | | S8 | 17, 20 |
| S11 | planned | | | | S10 | 18, 20 |
| S12 | planned | | | | S11 | 19 |
| S9 | planned | | | | S11 | 9 |
| ticket-state-accents | planned | | | | S12, S9 | 1-6, 8-21 |
