# The Notifications bookmark gets a "mark all seen"

Ticket `itm_99df897efcaa` · feature `notifications-seen` · base `pilot` at `2b7fdc2` · extends ADR 0097 and
deck-workspace spec 26 (L24, L25); changes nothing deck-token (yellow) owns

## 1. Problem

The user's words: "can you just quickly close all the notifications i have / i have 385 notifications", and
later, "also that is the functionality i would want from a 'clear notifications' button". Today the panel
offers only a × per row. That is 385 presses: the lit open threads (a per-browser "seen" mark) and over 300
closed-thread notices (a server-side `notice` field). The user wants one press that leaves the count at 0.

## 2. Spec

The user agreed lines 1-6 as written (`itm_cc1ef0e22614`, "Agreed"). Line 2 is reworded from the ticket, which said the
press "sends nothing to the deck"; line 4 needs a deck write.

| # | Behaviour a user can watch | Evidence |
| --- | --- | --- |
| 1 | One **Mark all seen** control at the top of the Notifications panel marks every listed open thread seen, each at its own `data-said`. Its lines hide and its share of the count goes. A later pilot write lights only that thread. | `notifications.test.mjs`: the press hides every `[data-thread]` line, and `deck.seenThreads` maps each id to its `data-said`; a raised `data-said` on one line brings back only that line |
| 2 | For the open threads, the press writes only this browser's `deck.seenThreads` and fetches nothing. The deck's one write is the notices' clearing. No thread closes, and no item changes except that its `notice` field goes. | `notifications.test.mjs`: the press's click fetches nothing; `notices.test.mjs`: the store after the press equals the store before it with only the `notice` fields removed |
| 3 | The per-thread × and the per-notice × are unchanged. | the existing × tests in `notifications.test.mjs` and `notices.test.mjs` pass unedited |
| 4 | The same press clears every closed-thread notice on the deck, in one store write with one `announceChange`. The control is a form, so a page running no script still clears them (ADR 0097). | `notices.test.mjs`: one own-Origin press leaves `noticesOf(listItems())` empty, and a foreign or missing Origin gets 403 with the notices kept; the served `NOTIFICATIONS_SUMMARY` has no `data-count` afterwards |
| 5 | The control is drawn only when the panel has a row. An empty panel shows no button. | `notices.test.mjs` render test on an empty deck and on a deck with one row |
| 6 | The notices' share of the count goes to 0 when the live swap after the POST lands, not on the click itself. The open threads' share goes at once. | `notifications.test.mjs`: after the click the count is the notices' share; after the swap with none drawn, there is no `data-count` |

What it cannot mean here: "every listed" is the whole deck, because the panel is deck-wide
(`render-rail.mjs:351`, L25), not the run tab. It never reaches the Closing reports bookmark
(`deck.hiddenReports`, ADR 0097's L7).

## 3. Findings

| What | Where |
| --- | --- |
| The open threads' "seen" key: a map of id to pilot-write count; `markSeen` does one read and one write per thread; `prune` and `remember` bound the key and skip an unchanged write | `deck/ui/js/notifications.mjs:191-235` |
| The × handler, delegated from `document` because the rows live in a live region | `notifications.mjs:353-374` |
| `recount` counts `[data-notice]` rows plus the unseen `[data-thread]` rows onto the `<summary>` | `notifications.mjs:264-285` |
| `clearNotice(id)` does one read and one write; an unknown id throws `DeckRefusal`, which becomes a 400 | `deck/store-items.mjs:588`; re-exported by `deck/store.mjs:31`; facade pin `deck/test/facades.test.mjs:43` |
| `POST /clear-notice`: `fromOwnPage` or 403, then `announceChange`, then a 303 to `back` | `deck/server-routes.mjs:468-478` |
| The panel: notices first, then queued threads newest first; each notice's × is a `data-in-place` form | `deck/ui/render-rail.mjs:373-394`; summary at `:567` |
| An in-place form: its submit is fetched, and a failed fetch is posted for real | `deck/ui/js/inplace.mjs:59-110` |
| The `.drop` style sits at the row's right edge | `deck/ui/deck.css:1170-1195` |
| The client harness `aPage` (stand-in DOM, `fetched`, `count()`, `drop()`); the server harness `press()` and `deckOnAPort` | `deck/test/notifications.test.mjs:67-290`; `deck/test/notices.test.mjs:28-42` |

**Seams** (deepening pass). Deletion test: each module below is earning its keep. The closest candidate
was `clearNotice`, and deleting it would spread the read-modify-write into two routes, so it stays.
No fold is needed, so there is no fold slice.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Notifications client | `install(env) -> { rehide, recount, markThisThread }`, plus the delegated `click` on `.notice .drop` and `.mark-all` | `markAllSeen` (new, internal), `markSeen`, `prune`, `remember` | in-process (stand-in DOM and `localStorage`) |
| Notice store | `clearNotice(id)`, `clearAllNotices()` | one `readDeck`/`writeDeck` | local-substitutable (`tempDeck`) |
| Deck HTTP routes | `POST /clear-notice`, `POST /clear-notices` | the `fromOwnPage` guard, `announceChange`, the 303 | local-substitutable (`deckOnAPort`) |
| Rail render | `renderStrips(...)` -> `NOTIFICATIONS` holds the `.mark-all` form | `renderNotifications` | in-process |

## 4. Ubiquitous language

- **Notice**: a closed thread's `notice: true` (ADR 0097), drawn as a `[data-notice]` row.
- **Listed thread**: an open, queued thread drawn as a `[data-thread]` row with its `data-said`.
- **Seen**: this browser's `deck.seenThreads` mark at or above a thread's `data-said`.
- **Mark all seen**: the one control. It marks every listed thread seen and clears every notice.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The control is a server-rendered `<form method="post" action="/clear-notices" data-in-place>` at the top of the panel, inside the live region. Its button is `.mark-all`, labelled "Mark all seen". The client's `click` listener marks the threads, then the submit posts the form. | It follows the notice ×'s pattern: a page with no script still clears notices, and `inplace.mjs` already posts without a reload. | A script-only button that fetches: dead without script. A control on the `<summary>`: outside the live region and pressed by every toggle. |
| L2 | `markAllSeen` reads the key once, sets every `[data-thread]` line to its `data-said`, then `remember(prune(...))` writes once. | 385 presses are 385 reads and writes through `markSeen`; one write keeps the key's "unchanged, not written" rule. | Looping `markSeen`. |
| L3 | `clearAllNotices()` deletes `notice` on every item that carries one, in one write, and writes nothing when none do. The route calls `announceChange` once. | One store write, not 300 POSTs, each of which would rewrite `deck.json` and announce. | The client firing `/clear-notice` once per row. |
| L4 | No new ADR. The press is "cleared only by the user" under ADR 0097. This artefact records the batch. | The ADR's rule is unchanged; only its arity is new. | Amending 0097. |
| L5 | The notices' share of the count waits for the live swap (spec 6). | `recount` reads the rows the deck drew; hiding notice rows before the deck took the POST would show 0 for a press that failed. | Optimistically hiding `[data-notice]` rows. |
| L6 | Depth: No grilling (the user, `itm_01e0e6e59cf3`). | The user set it for this run (ADR 0021). | The recommended forks. |

## 6. Assumed decisions

| # | Decision (default taken) | Tradeoff | Rejected path | Thread |
| --- | --- | --- | --- | --- |
| A1 | The press clears every notice on the deck at the moment of the press. | A notice closed in the instant before the panel redrew clears unseen. | Clearing only the ids the panel listed: a repeated-`id` form, and a partial failure when an id is archived meanwhile. | `itm_69f4123c7fc9` |
|  | Verdict: stands pending itm_69f4123c7fc9; nothing queued narrows it. (pilot) | | | |
|  | **Answered**: "Every notice on the deck" (the user, itm_69f4123c7fc9). The default stands as written. | | | |
| A2 | A new `POST /clear-notices` route, with `/clear-notice` and its tests untouched. | Two routes behind one guard. | `/clear-notice` taking an `all` flag or repeated ids: a mode on a route that answers 400 on an unknown id. | via the pilot |
|  | Verdict: stands, nothing queued touches the notice routes (deck-token changes the clients only). (pilot) | | | |
| A3 | One slice, on Opus with the security reviewer, because it adds a route. | No parallel lane, and a slightly larger diff to review. | Two serial slices, server then client: a second PR and QA hop for about 60 lines. | via the pilot |
|  | Verdict: stands, within the brief's limit and no other run owns notifications.mjs. (pilot) | | | |
| A4 | Spec lines 1-6 as reworded. | | | `itm_cc1ef0e22614` |
|  | **Answered**: "Agreed" (the user). | | | |
|  | Verdict: stands pending the user; it is their press, not a verdict of mine. (pilot) | | | |

## 7. Out of scope

- The Closing reports bookmark and its `deck.hiddenReports`.
- Closing or dismissing any thread. "Close all" here means seen and cleared, not resolved.
- A confirm step before the press. It is reversible for threads (a pilot write relights them), and a cleared notice's thread still opens at its address.
- Scoping the press to one run tab.
- deck-token's deck clients.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | One press on the Notifications panel marks every thread seen and clears every notice (walking skeleton) | 1-6 | `deck/store-items.mjs`, `deck/store.mjs`, `deck/test/facades.test.mjs`, `deck/server-routes.mjs`, `deck/ui/render-rail.mjs`, `deck/ui/js/notifications.mjs`, `deck/ui/deck.css`, `deck/test/notices.test.mjs`, `deck/test/notifications.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |

## 9. Acceptance evidence

On the deck at `http://127.0.0.1:4321`, with several open threads lit and several notices on the
Notifications bookmark:
1. The bookmark shows its count, and the panel's top row is **Mark all seen** (spec 5).
2. Press it. The open-thread rows vanish at once; the notice rows vanish within a second, and the count disappears (spec 1, 4, 6).
3. Reload: still no count, and no row comes back (spec 1, 4).
4. Every thread still opens at its address and is still on the home queue; nothing closed (spec 2).
5. Have the pilot reply on one thread: that one row comes back alone and the count reads 1 (spec 1).
6. The per-row × still hides one row (spec 3).
7. With script disabled, a press clears the notices and the page comes back (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/notifications-seen-s1 | – | – | – | 1-6 |
| feature | planned | feat/notifications-seen | – | – | S1 | 1-6 |
