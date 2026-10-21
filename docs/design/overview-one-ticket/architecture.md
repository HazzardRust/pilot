# The overview feeds one ticket at a time

Feature `overview-one-ticket` · deck ticket itm_70e85babf58c (four jobs merged) · base `origin/main`
bfd7616 (after #270, #282) · design branch `design/overview-one-ticket`

## 1. Problem

The deck's overview lists the open threads of every ticket at once. When several tickets finish
their yellow phase together, the user comes back to all of them "vomited onto my overview". They
want to be fed one ticket at a time: red tickets first, then green. Around that surface: the tab shows
no colour and no ticket is highlighted when nothing is live; the Tickets panel is hard to move through
with 20 green tickets; and a ticket turns red only when its `gate2` is posted, while the user means red
as "the user is NEEDED, it is impossible to move forward without the user".

## 2. Spec

Agreed with the user on the deck (itm_127a0238b9d2, itm_2dbd54abbff4). The **ticket in hand** is defined in §4.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | In either mode (L16), the overview's queue and each tab's queue show, per repository, only the threads that name its ticket in hand, plus every unticketed thread. | Two red tickets each with an open question: only the first's question is listed. |
| 2 | With no live ticket, the ticket in hand is `nextTicketOf` attended: the first ticket in deck order that is red or named by an open question, else the first green (L13). | A green ticket ahead of a red one in deck order: the red one's threads are listed. |
| 3 | A live ticket is always the ticket in hand. | Take a green ticket while a red one waits: the green one's threads are listed. |
| 4 | When the ticket in hand closes or is parked, the next one's threads arrive on the next live swap, with no reload. | Post the head's closing report: the next ticket's question appears on the open page. |
| 5 | A thread that names no ticket (sign-off, lesson, hand-off, audit, user thread, a question without `ticket`) stays on the overview whatever is in hand (A3). | An unticketed question is listed beside each ticket in hand in turn. |
| 6 | Every Tickets row with open threads naming it (questions, walkthrough, gate1, gate2) shows a `threads` disclosure linking each; the links open as today. | The second ticket's question opens from its row while hidden from the overview. |
| 7 | The thread page's arrows and the strip's counts walk and count the shown queue, not the whole one. | From the last shown thread, › goes nowhere; the tab's count equals the cards listed. |
| 8 | Autonomous, the same rule holds: only the threads of the ticket in hand (spec 3, 11) and the unticketed ones are shown, walked and counted; another ticket's threads wait, open and hidden, until that ticket is in hand (L16). | Autonomous, a yellow ticket live and a parked green ticket holding an open question: the question is not listed; take the green ticket and it is. |
| 9 | The tab's colour is the ticket in hand's state, live or parked. | Two parked red tickets and none live: a red tab. |
| 10 | The ticket in hand's row carries today's live highlight, and only it. | None live: the `next` row is highlighted; one live: that row only. |
| 11 | Autonomous with no live ticket, the ticket in hand is the yellow head the chain takes next; with none, the tab has no colour and no row is highlighted (L12). | Autonomous, two yellow tickets, none live: a yellow tab, the first yellow row highlighted. |
| 12 | Green, Yellow and Red each fold and unfold on a press of their heading. | With 20 green tickets, one press hides them and the Yellow heading is on screen. |
| 13 | All three start folded, except the group holding the ticket in hand, which always arrives open and whose closing is not remembered (A6); a group the user opened stays open across reloads in that browser, per repository (A2). | A fresh browser shows the in-hand group open and the other two folded; open another, reload, it is open. |
| 14 | Each heading shows its count. | "Green 20", "Yellow 2", "Red 0", matching the rows unfolded. |
| 15 | `deck_ticket need` turns an open yellow ticket red. Refused by name unless an open question, walkthrough or gate2 names the ticket (L7). | Walkthrough posted, `need`: red with no gate2. `need` with nothing open: refused. |
| 16 | Posting a walkthrough moves no state. | A walkthrough posted while QA still fixes leaves its ticket yellow. |
| 17 | Posting a `gate2` turns its ticket red, as today. | `deck/test/ticket-state.test.mjs` unchanged and green. |
| 18 | `deck_ticket pivot` turns a red ticket yellow and, in the same write, closes its open gate2 as `superseded by pivot`, unsigned; a later gate2 can be posted. Refused by name on a ticket that is not red. | `pivot`: yellow, gate2 closed; a new gate2 posts and turns it red again. |
| 19 | `agents/pilot.md` says when to call `need` (nothing can move without the user: the walkthrough waits and no agent has independent work, or only end-saved questions are left) and `pivot` (the user's feedback needs a substantial change from the plan, said on the thread). | Pinned in `scripts/test/`; the pilot's prompt share stays at or under its pin. |
| 20 | Autonomous, the moment the pilot turns its ticket red (by `need`, or by posting its gate2), it parks that ticket and takes the next yellow ticket in the same session; it stops only when no yellow ticket is left or it is blocked (L17). | A sentence pin in `agents/pilot.md`; on a scratch deck with two yellow tickets, `need` on the live one and `park` leave it red, and the next yellow ticket is the ticket in hand. |
| 21 | An autonomous run ends yellow only by `need`: once QA's walkthrough is posted and nothing else can move, the pilot calls `deck_ticket need`; it never posts the `gate2` while the user has not walked. The `gate2` is posted in red, after the walkthrough's sign-off (L18). | Sentence pins in `agents/pilot.md`; no "posting the `gate2`" in the autonomous paragraph. |
| 22 | A blocker ends in `need` too: the pilot works around a blocking question until nothing more can move, then calls `need`. No ticket is parked yellow as blocked and no run finishes `blocked` (L19). | The "Blocked" rule is gone from `agents/pilot.md`; the chain names no `blocked` finish. |
| 23 | The ticket in hand: attended, the first red or asked ticket that is not yellow, else the first green, never a yellow ticket; autonomous, the first yellow ticket, with no skip for a blocking question (L19, L20). | Attended with a parked yellow ticket holding a question: it is not in hand. Autonomous: it is. |
| 24 | A blocking question is behind and shown with its ticket like any other thread; its ticket's row in Tickets counts and links it whatever is in hand (L19; A5 reverted). | A blocking question on a ticket not in hand: off the overview, on its row. |

## 3. Findings

| Area | What exists | Anchor |
|---|---|---|
| Next ticket | `nextTicketOf(items, repo, mode)` skips the live ticket; attended: first red or question-named, else first green; autonomous: first unblocked yellow. The chain and the `next` marker read it. | `deck/items.mjs:686-697`, `deck/chain.mjs:99` |
| Live ticket, phase | `liveTicketOf`, `livePhaseOf`; `tabsOf` sets `tab.phase = livePhaseOf` and takes no modes. | `deck/items.mjs:654-666`, `deck/tabs.mjs:87,140` |
| State writes | Post ticket: green; signed gate1: yellow; posted gate2: red; report: closed; reopen: red. Nothing else moves a state. | `deck/store.mjs:603,620-626,869,933` |
| `deck_ticket` | `up`, `down`, `take`, `park`, `merge`. | `deck/tools.mjs:351`, `deck/server.mjs:889-900`, `deck/store.mjs:1014-1090` |
| Ticket field | `ticket` on question, walkthrough, gate1, gate2, report; none on signoff, lesson, handoff, audit. | `deck/items.mjs:349-392` |
| Queue | `queueOf(items)` is deck-wide; a tab's `open` is it narrowed. The home page, the strip counts and the thread arrows all read it. | `deck/status.mjs:488`, `deck/ui/render.mjs:1116,1965,2067` |
| Mode | Two spellings of one lookup: `modeIn(modes, tab)` and `modeFor(repo)`. | `deck/ui/render.mjs:1215`, `deck/store.mjs:352` |
| Tickets panel | Three `<section class="ticket-queue">` with `<h3>`; previews only on the head row, only when it is red or asked; the bookmark then opens itself (ticket-states spec 20) and `showFirstRed` scrolls to the first red row (QA D1). | `deck/ui/render.mjs:1376-1416,1680-1694`, `deck/ui/js/bookmarks.mjs:54-61`, `deck/ui/js/page.mjs:35` |
| Highlight | `.tickets-list li:has(> .live)`. | `deck/ui/deck.css:1061` |
| Fold memory | Tree branches, sections and days are re-folded on every live swap; panel open state is `sessionStorage`, hidden reports `localStorage`. | `deck/ui/js/live.mjs:155-168`, `deck/ui/js/bookmarks.mjs`, `deck/ui/js/notifications.mjs:83-93` |
| Pilot prose | Modes section and Gate 2 ("Posting it turns the ticket red"); own-share pin 10336.75 at zero headroom. | `agents/pilot.md:131-168,493-497`, `scripts/test/measure-prompt.test.mjs:106-112` |
| Merge-first (#290, unmerged) | Its `resolveItem` refuses an unsigned gate (its L12) and Dismiss closes a gate unsigned; it edits `pilot.md` and lowers the same pin; it edits `server.mjs`'s `deck_ticket` merge branch. No change to `nextTicketOf`, tabs, the Tickets panel or state writes. | `origin/feat/merge-first` `deck/store.mjs:879-885,997-999,1096-1111` |

## 4. Ubiquitous language

- **Ticket in hand**: per repository, the live ticket, else `nextTicketOf(items, repo, mode)`. One function, `inHandOf`; the overview, the tab's colour and the highlight all read it.
- **Behind**: a thread that names an open ticket of its repository other than the ticket in hand, in either mode. Hidden from the overview, never from its ticket's row.
- **Unticketed**: a thread whose `ticket` field is empty. Never behind.
- **Shown queue**: `queueOf` less what is behind. What the overview lists, the arrows walk and the strip counts.
- **Need**: the pilot's word that the run cannot move without the user; yellow to red.
- **Pivot**: the pilot's word that the user's feedback sends the ticket back to implementing; red to yellow.

## 5. Locked decisions

| Id | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *forks* (the user, itm_804024d99554). | The user. | *every* |
| L2 | The ticket in hand is `liveTicketOf ?? nextTicketOf` in one pure `inHandOf(items, repo, mode)` in `deck/items.mjs`. | The overview, the tab, the `next` marker and the chain never name different tickets. | A red-then-green ordering beside `nextTicketOf` (two head functions; ticket-states L19 rejected the same). |
| L3 | "Behind" is read from items and modes at render time; nothing is stored. | A read-side filter; existing decks need nothing. | A `hidden` flag on threads (a second writer that drifts). |
| L4 | The filter applies per repository on the overview and on a tab alike, through one `shownOf`. | A tab is the overview narrowed (`tabsOf`); two rules would disagree. | Overview only (a tab would still list every ticket's threads). |
| L5 | `tabsOf` gains a `modes` argument for the phase (spec 9, 11). | Its only missing input; every page renderer already holds `modes`. | Computing the phase in the renderer (the tab object would carry a stale `phase`). |
| L6 | The deck's one `modeOf(modes, repo)` lives in `deck/items.mjs`; `modeIn` calls it. | `inHandOf`'s callers need it outside the renderer. | A third copy. |
| L7 | Red-by-need is stored, written by `deck_ticket need`, refused unless an open question, walkthrough or gate2 names the ticket (the user, itm_33c6a4a6550b; was A4). | Ticket-states L3: one writer, the store, in the event's own write. The guard keeps "needed" true by construction. | Deriving red from open items; a `deck_status` field (records are per run, not per ticket); the Stop hook (it cannot see background agents still working). |
| L8 | `pivot` closes the ticket's open gate2 inside the store write as `superseded by pivot`, not through `resolveItem`. | Ticket-states F4 refuses a second open gate2; merge-first L12 refuses unsigned resolves through `resolveItem`. | Asking the user to Dismiss first (two steps, and a yellow ticket with a live gate2). |
| L9 | Folds are `<details class="ticket-queue">` with the count in `<summary>`, served shut; the open set lives in `localStorage` keyed by repository and state, re-applied on every live swap the way `live.mjs` re-applies days. | The page's existing fold pattern; `localStorage` because "across reloads". | `sessionStorage` (lost with the browser tab); server-stored folds. |
| L10 | No store version bump. A ticket already waiting on its walkthrough stays yellow until the pilot calls `need`. | Additive, as ticket-states L12. | A migration that guesses. |
| L11 | ADR 0065, the ticket in hand (S1 writes it, S2 adds the tab), and ADR 0066, red means needed (S4), amending 0060. Numbered past merge-first's 0063 and 0064 (PR #290, unmerged). | The record of why ticket-states' "tab shows the live ticket only" and "red on gate2 only" moved. | Editing 0060 in place. |
| L12 | Autonomous with no live ticket, the ticket in hand is the yellow queue's head; none waiting means no colour and no highlight (the user, itm_127a0238b9d2). | The tab is not blank between chained sessions. | Nothing in hand, no colour. |
| L13 | With no live ticket, attended, a yellow ticket named by an open question ranks with the red ones: `nextTicketOf` as it stands (the user, itm_2dbd54abbff4; was A5). | One rule behind the overview, the `next` marker and the chain; a running ticket's question still reaches the user. | Strictly red, then green (a second rule beside `nextTicketOf`). |
| L14 | QA runs against a scratch deck: `PILOT_DECK_DIR` a temporary store, `PILOT_DECK_PORT` a free port, seeded as §9 says; the user's walkthrough runs there (the user, itm_48bb893bdbe0). | The live deck runs the installed plugin, not this branch, and seeding it would litter the real queue. | The live deck on 4321. A spawned agent's deck tools reach only 4321, so the pilot's own `need` and `pivot` calls rest on tests and QA's hand-made calls. |
| L15 | `pivot` is the pilot's own call, made after the user's feedback and explained on the thread; it signs nothing, and a fresh gate2 must be posted and signed by the user (the user, itm_4849dde6ed13). | The user has already said what to change; the feature PR stays draft throughout. | A "Back to implementing" press that only the user can make (one more press, a larger slice, and the run waits on it). |
| L16 | The one-ticket rule holds in implementation mode too; spec 1 and 8 moved by the user after Gate 1 (chat itm_0bfcf27836de, 2026-10-04: "we should only have 1 ticket on a deck at a time"; "the answer would just sit and wait until we got to that ticket, so we may as well just answer it when we get to that ticket"). A parked ticket's open threads stay open and hidden; nothing is closed or re-posted. | An answer to a ticket that is not in hand is used by nobody until that ticket is taken. `isBehind` loses its mode branch. | Autonomous unchanged from `main` (the plan as signed). Closing and re-posting the questions (a second writer, and the thread ids change). |
| L17 | A ticket turning red hands the session on: in autonomous mode the pilot parks it and takes the next yellow ticket, same session (the user, chat itm_0bfcf27836de, 2026-10-04, after Gate 1: "shouldnt you have moved on to the next yellow ticket since this one reached red?"; "that should have been automatic"; "not posts it's gate 2, but when it turns it's respective ticket red, then it moves onto the next yellow ticket"). Spec 20, in S5. | Red means the user is needed, so the session has nothing left to do on that ticket and the yellow queue should not wait for a fresh session. | Stop after the gate2 post and leave the next ticket to a new session (the rule in `agents/pilot.md` today; nothing moved until the user asked). |
| L18 | Yellow ends when the ticket turns red, and the pilot's `need` is the one way an autonomous run gets there; the `gate2` is posted inside red (the user, itm_478ca5be81f4, 2026-10-04: "we established that it isnt gate 2 that marks the end of the yellow phase"; itm_8967377a2230: "Only need ends yellow: fix on this branch"). Spec 21, in S6. | Red means the user is needed; a gate2 posted before the walkthrough is walked asks for a signature nobody can give yet. | The ticket-states route kept beside it: post the `gate2` straight after QA, its body the run's report. |
| L19 | A blocking question does not park its ticket: the pilot works around it and calls `need` when it cannot go on; the question hides and shows with its ticket (the user, itm_cff266811f2e: "hitting a blocking question should cause the agent to work around it until it cannot complete any more work"; "once it flips the ticket to red, it hides the question until that ticket comes up"; "there should be no more parking of a yellow ticket unless implementation mode was turned off"). Supersedes A5 and ticket-states B4. Spec 22-24, in S6. | One reason to be red, one way to get there. | A5: a blocking question is never behind. Ticket-states B4: park it yellow, finish `blocked`, skip it in `nextTicketOf`. |
| L20 | Turning implementation mode off parks the yellow ticket and hides its threads until the mode is on and the ticket resumes; attended never has a yellow ticket in hand (the user, itm_cff266811f2e: "in which case it parks the ticket and hides it's items until that ticket resumes again"). Its Tickets row still counts and links its questions ("sure it wont be on the overview but that is fine"). | Attended is for red and green; yellow work belongs to the mode that does it. | A parked yellow ticket coming into hand in attended mode because a question names it. |

## 6. Assumed decisions (sent to `main`)

| Id | Question | Default taken | Tradeoff |
|---|---|---|---|
| A2 | Folds against ticket-states spec 20's auto-open and QA D1's scroll to red? | Both go: the overview now feeds the ticket in hand, and every group starts folded. | One press more to see red rows in Tickets. |
| A3 | Which threads belong to a ticket? | Those whose `ticket` names it; sign-offs, lessons and hand-offs stay unticketed. | A parked ticket's leftover sign-off still shows; an optional `ticket` on signoff is one more slice. |
| A4 (confirmed by the user, itm_478ca5be81f4) | After a gate 2 in autonomous mode, who starts the next yellow ticket: the pilot (L17) or the daemon's chain (`deck/chain.mjs`)? Both fire today. Asked as itm_478ca5be81f4, user away. | The pilot: `gate 2 posted` leaves the autonomous chain list; `blocked` and a clean finish still chain. Fix round. | No fresh context per ticket; the pilot's own hand-off covers a full one. |
| A5 (superseded by L19; the user, itm_cff266811f2e) | A blocking question on a parked yellow ticket is hidden (L16) and `nextTicketOf` skips its ticket, so it can never surface. Asked as itm_cff266811f2e, user away. | A blocking question is never behind. Fix round. | One exception to L16's one-ticket rule, for the thread that stops work. |
| A6 | All three groups start folded (spec 13), so the highlighted in-hand row (spec 10) is hidden until its group is opened (QA, 326c375). Open that group by default? Asked as itm_5678e88f5d05, user away. | Answered by the user on itm_5678e88f5d05, 2026-10-04: "The ticket in hand's group starts open". The in-hand group is served open on every arrival; the other two keep their remembered folds. | Closing the in-hand group lasts only until the next page or live swap. |

## 7. Out of scope

- Browser notifications for a thread that is behind: unchanged.
- The `/items` history page: lists everything, as today.
- A `ticket` field on sign-offs (A3).
- Any red without the pilot's call; the Stop hook is unchanged.
- Merge-first's own changes; each slice names where it collides.

## 8. Slices

One run of 5 slices; estimate as `skills/ticket-making` "Estimates": 5 × minutes per slice.

| # | Slice | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | The overview lists only the ticket in hand's threads (walking skeleton) | 1–8 | `deck/items.mjs`, `deck/status.mjs`, `deck/ui/render.mjs`, `deck/test/overview-one-ticket.test.mjs` (new), `docs/adr/0065-the-overview-feeds-the-ticket-in-hand.md` (new) | – | [S1](slices/S1.md) |
| S4 | `deck_ticket need` and `pivot` | 15–18 | `deck/store.mjs`, `deck/tools.mjs`, `deck/server.mjs`, `deck/test/ticket-need.test.mjs` (new), `docs/adr/0066-red-means-the-user-is-needed.md` (new) | – (beside S1) | [S4](slices/S4.md) |
| S2 | The tab's colour and the highlight follow the ticket in hand | 9–11 | `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/store.mjs` (the one `tabsOf` call), `deck/test/in-hand.test.mjs` (new), ADR 0065 | S1, S4 | [S2](slices/S2.md) |
| S3 | Ticket groups fold, start folded and show their counts | 12–14 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/ui/js/live.mjs`, `deck/ui/js/bookmarks.mjs`, `deck/ui/js/page.mjs`, `deck/test/ticket-folds.test.mjs` (new), `deck/test/resize.test.mjs` | S2 | [S3](slices/S3.md) |
| S5 | The pilot calls `need` and `pivot`, and moves on when its ticket turns red | 19, 20 | `agents/pilot.md`, `scripts/test/pilot-need.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S4 | [S5](slices/S5.md) |
| S6 | Only `need` ends yellow, and a blocker ends in `need` (added at Gate 2) | 21–24 | `deck/items.mjs`, `deck/chain.mjs`, `deck/runs.mjs`, `agents/pilot.md`, their tests, ADR 0065 and 0066 | S1–S5, fix round | [S6](slices/S6.md) |

DAG: S1 ∥ S4; S2 after both (it shares `render.mjs` with S1 and `store.mjs` with S4); S3 after S2;
S5 after S4, beside S2 or S3. Existing tests that render a deck holding questions on several
tickets with the default (attended) modes will change; each slice names the ones it must update.

## 9. Acceptance evidence

On a scratch deck (`PILOT_DECK_DIR` a temp directory, `PILOT_DECK_PORT` a free port, never 4321),
one repository seeded with: a green ticket, two red tickets each with an open question, a yellow ticket
with an open walkthrough, an unticketed question, and 20 more green tickets.

1. The overview lists the first red ticket's question and the unticketed question, nothing else (1, 2, 5).
2. › from the last card goes nowhere; the tab's count is 2 (7).
3. The tab is red with no ticket live; the first red row is highlighted (9, 10).
4. Tickets shows "Green 21", "Yellow 1", "Red 2", all folded; open Red, reload, still open (12–14).
5. The second red ticket's row opens its question (6).
6. Close the first red ticket (answer, gate2 signed, report): the second's question arrives without a reload (4).
7. `deck_ticket take` the green ticket: its threads replace them (3).
8. Switch to implementation mode: the yellow head is in hand, the red tickets' questions leave the overview, the unticketed one stays; the tab shows yellow (8, 11).
9. `deck_ticket need` on the yellow ticket: red. Post a gate2, then `pivot`: yellow, gate2 closed superseded (15–18).
10. `agents/pilot.md`'s need and pivot sentences, and `npm test` green (19).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | `slice/overview-one-ticket-s1` | #304 | | – | 1–8 |
| S4 | integrated | `slice/overview-one-ticket-s4` | #302 | | – | 15–18 |
| S2 | integrated | `slice/overview-one-ticket-s2` | #305 | | S1, S4 | 9–11 |
| S3 | integrated | `slice/overview-one-ticket-s3` | #306 | | S2 | 12–14 |
| S5 | integrated | `slice/overview-one-ticket-s5` | #303 | | S4 | 19, 20 |
| Fix round | integrated | `fix/overview-one-ticket-principles` | #307 | `pilot-overview-one-ticket-fix` | S3 | A4, A5, findings |
| S6 (added) | integrated (#308, 26b21e5) | `slice/overview-one-ticket-s6` | | `pilot-overview-one-ticket-s6` | fix round | 21–24 |
| feature | in QA | `feat/overview-one-ticket` | #297 | | S1–S6 | 1–24 |

## 11. Principles verdicts (review at 326c375)

| Verdict | Finding | Reason |
|---|---|---|
| kept | `store.mjs` `modeFor` re-spells the mode rule | L6: one `modeOf`. |
| kept | `pilot.md` "Red hands on" has no mode qualifier | Spec 20 is autonomous only; an attended pilot would park and move on. |
| kept | Three missing tests: mode changes the ticket in hand with none live; an open thread on a closed ticket is listed; `need` then `pivot` with no gate2 | Surviving mutants and an untested path. |
| kept | A4: `gate 2 posted` leaves the autonomous chain list | The pilot and the chain both started the next ticket. |
| kept | A5: a blocking question is never behind | It could never surface. |
| kept | A parked red ticket with no open gate2 reads "needs you", not "awaiting sign-off" | `need` turns a ticket red with no gate2. |
| dropped | Fold `isBehind` into `shownOf` | L3 and L16 name `isBehind` as the seam; A5 lands in it; 12 ms at 4300 items is no cost at this deck's size. |
| dropped | Delete `modeIn` | L6 locks "`modeIn` calls it". |
| dropped | Thin `bookmarks.mjs`'s storage checks | `localStorage` is browser state another version can write; the guard is cheap. |
| dropped | Nits: `isBehind`'s ticket guard, `KIND_GATE2` in `NEEDING_KINDS`, `renderStrip`'s two arguments, `livePhaseOf` inline | Zero or one line each against pin churn. |
| dropped | Restore "merge into live" in `deck_ticket`'s description | The pilot's prompt pin has no headroom; `pilot.md` and ticket-making say it. |
