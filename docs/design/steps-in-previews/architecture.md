# steps-in-previews: Human steps threads show in the deck's thread previews

Ticket `itm_3eee1845d039` · design branch `design/steps-in-previews` from `origin/pilot` 307e236 · ADR NNNN (`docs/adr/NNNN-steps-in-previews.md`)

## 1. Problem

After a landing the deck posts a Human steps thread per ticket, and the user cannot find it: it is on no home card,
no count and no notification, in either deck, so green tickets sat unmoved waiting on steps the user never saw.
"okay where do i find the missing steps for them???? they arent on the deck with thread previews?" and
"can you get the actual tickets up on the preview".

## 2. Spec

Agreed with the pilot and relayed to the user (main, 2026-11-24); line 3 is a found issue, **added**.

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Every open steps thread is a home card, on the overview and its repository's tab, in both decks; never folded behind another ticket; counted in the strip, listed in Notifications, walked by the thread arrows. | A view test on a scratch deck with 2 open steps threads on 2 green tickets, one not in hand; the user's look. | 2 cards, 0 in the fold, strip count 2, 2 notification rows; after Done on one: 1, 1, 1. |
| 2 | Its card names its ticket and counts its steps, in both decks. | A view test and a Rune region test on a seeded thread of 3 steps. | The card's kind reads `human steps · 3 steps` and the ticket's title is on the card: HTML and Rune, 1 card each. |
| 3 | *added* Opening it in the Rune deck shows its numbered steps and a Done button; Done closes the thread and its ticket. | A Rune test against a scratch deck. | 3 numbered rows and 1 Done; one press posts `/close`; the ticket reads `closed` after. |
| 4 | The Tickets row of a ticket with an open steps thread reads `waiting on your steps`. | A view test with and without the thread. | With: the label; without: today's label (`awaiting sign-off` / `needs you`), 0 rows changed. |
| 5 | Agents are unchanged: an open steps thread never holds a pilot's turn at the Stop gate and wakes no waiter. | `hooks/test/join.test.js` unchanged and green; one new Stop-gate case. | Stop gate: 0 holds with an open steps thread posted this session. |
| 6 | The cause of the hidden threads is named, file and line, before any fix. | §3 Cause, below. | 5 links of the chain, each at file and line. |

practitioner: a triage-inbox designer — an action only the user can take ranks with the owed presses and is never folded (spec 1).
practitioner: the raw material is the live deck itself, read only: `itm_4b1f30f2ac46` (2 steps) and `itm_6acc0cd128fb` (4) are open now; QA seeds the same shape on a scratch deck.
practitioner: the user's own look at both decks on the walkthrough confirms it, beside the view tests.

## 3. Findings

### Cause (spec 6)

1. `deck/items.mjs:123` `STANDING_KINDS = [KIND_TICKET, KIND_REPORT, KIND_STEPS]` (human-steps A4, ADR 0202 line 20).
2. `deck/items.mjs:522` `isQueued` returns false for any standing kind.
3. `deck/status.mjs:494` `queueOf` filters `isQueued`: no home card (`ui/render-pages.mjs:274`, `view/queue.mjs:70`), no
   strip count (`view/strip.mjs:24`), no tab count (`view/tabs.mjs:16`), no notification row (`ui/render-rail.mjs:385`,
   `view/notifications.mjs:24`), no arrows (`ui/render-pages.mjs:401`).
4. Even queued it would fold: `deck/status.mjs:498` `OWED_KINDS` lacks steps, and `deck/items.mjs:665` `isBehind` is true
   for a released green ticket that is not the green hand.
5. The one way in is the Tickets row's shut `threads` fold (`ui/render-rail.mjs:124`; `view/tickets.mjs:77` →
   `deck/rune/src/regions/tickets.rs:436`). In Rune that page shows the body only: `view/thread.mjs:66` sends no steps,
   and `view/reply.mjs:67` sends nothing for a record, so no Done (HTML has both, `ui/render-cards.mjs:56`).

### What the design leans on

- Rune draws the daemon's view models (`deck/view/*.mjs`); a card's `kind` is `plain(renderKind(item))`
  (`view/queue.mjs:39`), so one change in `ui/render-cards.mjs:295` reaches both decks.
- HTML cards already carry the ticket and its standing (`ui/render-parts.mjs:237` `renderTicketStanding`); Rune cards
  carry none (`view/queue.mjs:29`). `view/thread.mjs:22` `standingLine` is the same line as words.
- `deck/store-steps.mjs:46` `postSteps` is the one writer; steps are `{ text }`, no tick (L5), so every step is unfinished.
- `/close` on a steps item is `doneOn` (`deck/store-items.mjs:752`); Rune's `Action::Close` posts `/close`
  (`deck/rune/src/act.rs:142`), sent with `act::send` as `regions/reply.rs:216` does.
- The Stop gate reads the hooks' own `isStanding` (`hooks/stop-gate.js:104`, `hooks/lib/deck.js:329`), never `isQueued`.
- Live deck (read only): 5 steps threads; titles are `Human steps: <short name>`, not the ticket's title.
- Overlaps: PR #137 (reply-markdown) changes `regions/reply.rs` and `tests/deck/main.rs`, so neither is touched here;
  archive-page owns `app.rs`, `regions/mod.rs`, `strip.rs`; prune-worktrees changes what a landing's steps carry
  (`closing-report.mjs`, `server-tools.mjs`), not how they show. No owned file is shared with any of them.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Queued (`deck/items.mjs`) | `isQueued(item) -> boolean` | the two `|| (KIND_STEPS && isOpen)` clauses at `ui/render-rail.mjs:124` and `view/tickets.mjs:77`, deleted | in-process |
| Owed presses (`deck/status.mjs`) | `shownOf(queue, items)`, `foldedOf(queue, items)` | `OWED_KINDS` gains steps | in-process |
| Card kind (`deck/ui/render-cards.mjs`) | `renderKind(item) -> html` | the steps count both decks draw | in-process |
| Steps label (`deck/items.mjs`) | `STEPS_WAITING`; `standingOf(ticket, items, coPilot)` | the two spellings `'human steps'` at `items.mjs:705` and `ui/render-rail.mjs:83` | in-process |
| Ticket line (`deck/view/thread.mjs`) | `ticketLineOf(item, items, lanes) -> string?` | `standingLine`, now read by `cardOf` too | in-process |
| Thread view (`deck/view/thread.mjs`) | `threadView(reads, { id })` + `steps` | — | in-process |

Deletion test: `isQueued` earns its keep (8 callers); `standingLine` deleted would reappear in `cardOf`, so it is
exported, not copied. No fold changes code on its own: each sits in the slice whose behaviour needs it.

## 4. Ubiquitous language

- **Steps thread**: an item of kind `steps`, posted by `postSteps`, closed only by the user's Done.
- **Queued**: open and waiting on the user (`isQueued`); a steps thread is queued from this run.
- **Standing**: open without holding an agent (Stop gate, waiters); a steps thread stays standing.
- **Card**: a queued thread drawn on home; **fold**: queued threads behind another ticket, counted, shut.
- **Owed press**: a press only the user can make (gate1, gate2, signoff, and now Done); always a card.
- **Ticket line**: `<ticket title> <standing>` on a card or a thread's kind line.

## 5. Locked decisions

- **L1** The fix is in the shared predicates and view models, not per-deck: Rune gets cards, counts and arrows from
  `queueOf` with no Rust change. Rejected: a Rune-side steps list (two spellings of one queue).
- **L2** A steps thread is an owed press (`OWED_KINDS`), so a card even behind another ticket (nothing-hidden L1).
  Rejected: queued but foldable — the released green ticket is never the hand, so it would always fold.
- **L3** The count reads the step total, `N steps`: steps carry no tick (human-steps L5). Rejected: `N of M left`,
  which needs a tick field nobody writes.
- **L4** One term: `waiting on your steps` replaces `human steps` in `standingOf` and `ticketLabelOf` alike, so the
  Tickets row, the card and the thread's kind line say one thing. Rejected: the row only (two words for one state).
- **L5** Rune's Done is drawn in `regions/thread.rs` from `threadView`'s `steps`, not in `regions/reply.rs`: the reply
  box stays empty for a record (ADR 0148) and PR #137's reply.rs change is not rebased on. Rejected: a `done` reply mode.
- **L6** Done in Rune posts at once, as the HTML Done does (no confirm). Rejected: Close's confirm (`reply.rs:146`).
- **L7** QA runs the native Rune window and the HTML deck against a scratch deck (`deck/scratch.mjs`) with seeded
  steps threads, never the live deck on 4321; no database.
- **L8** The ADR is ADR NNNN, amending ADR 0202 (A4) for `isQueued` only; `STANDING_KINDS`, its hooks mirror and
  `join.test.js` are unchanged.

## 6. Assumed decisions

- **A1** *assumed* — Steps thread queued for the user, still standing for agents (moves human-steps L6). Default:
  `isQueued` admits an open steps thread; the Stop gate and waiters unchanged. Trades: "standing" no longer implies
  "not queued"; one kind-specific line in `isQueued`. Rejected: drop steps from `STANDING_KINDS` (the Stop gate would
  hold a pilot's turn on steps only the user can do); keep L6 and add a Steps section (a second list, the one missed).
  Question `itm_d3f9528237e6`, closed at the default by the deck's 20-minute timeout, not pressed.
- **A2** *assumed* — Every Rune card that belongs to a ticket draws the ticket line, as every HTML card already does.
  Trades: one caption line on every ticketed Rune card, wider than the ask. Rejected: steps cards only (a kind-special
  line). Question `itm_a47641105921`. User, 2026-11-24: "Every card with a ticket (default)".
- **A3** *assumed* — Grilling depth: forks (the pilot's question `itm_1f544b61e001`), closed at the default by the
  deck's 20-minute timeout, not pressed.

## 7. Out of scope

- What a steps thread carries (prune-worktrees spec 7-9) and how a landing writes it.
- Ticking single steps (human-steps L5's later field).
- A Done on the home card: the card opens to the thread, where Done is.
- Rune side panes, the archive page, the reply box.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A steps thread is a home card in both decks | 1, 2, 4, 5, 6 | `deck/items.mjs`, `deck/status.mjs`, `deck/ui/render-cards.mjs`, `deck/ui/render-rail.mjs`, `deck/view/tickets.mjs`, `deck/test/steps-in-previews.test.mjs` (new), `deck/test/human-steps-reopen.test.mjs`, `hooks/test/stop-gate.test.js`, `docs/adr/NNNN-steps-in-previews.md` (new), `docs/adr/0202-human-steps.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Rune cards name their ticket and a steps thread opens to Done | 2, 3 | `deck/view/queue.mjs`, `deck/view/thread.mjs`, `deck/rune/src/regions/queue.rs`, `deck/rune/src/regions/thread.rs`, `deck/test/view-steps.test.mjs` (new), `deck/rune/tests/deck/queue.rs`, `deck/rune/tests/deck/thread.rs`, `deck/rune/tests/deck/support/seed-steps.mjs` (new) | S1 (`isQueued`: a steps card exists to draw) | `pilot:rust-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: predicate → status → card kind → HTML page and Rune window, end to end.
red team: S2's Rune tests cannot seed a steps thread through `deck_post` (it refuses `steps`, `store-items` L3), so S2
owns `seed-steps.mjs`, calling `postSteps` with `PILOT_DECK_DIR` on the scratch store (`readDeck` reads disk per call,
`store-core.mjs:133`). red team: adding `mod steps;` to `tests/deck/main.rs` would collide with PR #137, so S2's
tests live in the existing `queue.rs` and `thread.rs`. red team: `renderCardClose` (`render-parts.mjs:551`) is
user-threads only, so a steps card grows no Close despite `CLOSABLE_KINDS`; checked, no change. red team: `hooks/`
is the security trigger's path; S1 touches only a hooks test, reviewer kept anyway.

## 9. Acceptance evidence

1. Scratch deck with two landed green tickets, each with an open steps thread (2 and 3 steps): HTML home shows 2
   cards reading `human steps · 2 steps` / `· 3 steps` with their tickets' titles, none in the fold; strip count 2.
2. The Rune window on the same deck: the same 2 cards, each with its ticket line; Notifications lists both.
3. Tickets tab, both decks: both rows read `waiting on your steps`.
4. Open the 3-step card in Rune: 3 numbered steps and Done; press Done: the card is gone, the ticket closed.
5. A pilot session with an open steps thread ends its turn: the Stop gate does not hold.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/steps-in-previews-s1 | – | – | – | 1, 2, 4, 5, 6 |
| S2 | planned | slice/steps-in-previews-s2 | – | – | S1 | 2, 3 |
| feature | planned | feat/steps-in-previews | – | – | S1, S2 | 1-6 |
