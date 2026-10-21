# Deck polish: eleven small fixes to the deck, one run — architecture artefact

Feature: **deck-polish** · slug `deck-polish` · integration branch `feat/deck-polish` · base `main` at `585cc2e` (0.7.11) ·
architect branch `design/deck-polish`. Grilling depth for this run: **forks** (L1). Seven slices, one run.

## 1. Problem

The deck (`deck/`) has accumulated eleven small irritations, named by the user over 2026-09-27/28: a button with the
wrong name, choices that forget they were pressed, tables that do not read in the chat, a chat that jumps to the bottom,
no way to add a deck by path, closing reports that cannot be dismissed, a noisy `deck <n>` status-line segment, a panel
that resizes under the thread header, no Close on a user thread's card, a "time ago" that ignores replies, and a Reopen
that wakes the pilot. On 2026-09-28 a Reopen reached the pilot as the reply "Reopened." and it read that as a withdrawn
decision. The user: "one run, small deck changes, one QA pass". The user's chat thread is itm_0bfcf27836de, and the
run's hand-off is itm_b51ffc308ee6.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | An ended deck's Remove control reads **Close**, and its confirm step's button reads **Close deck**. What it does is unchanged: it archives the deck and deletes nothing. | The strip's right rail shows Close. Pressing it shows the Close deck button, and pressing that takes the tab off. |
| 2 | While a thread is open, the option the user's newest reply chose is drawn pressed, on its card and on its page. Nothing is stored for it, so a closed thread marks none. | Press an option, go to the overview and reload: the card shows it pressed. Close the thread: nothing is marked. |
| 3 | A table in a Chat message keeps readable columns and scrolls sideways inside its message. | The four-column table in itm_0bfcf27836de reads as rows and columns in the Chat panel. |
| 4 | A live update leaves the Chat panel where the user scrolled it. It follows a new message only if it was already at the bottom. | Scroll up and post from another deck: the view does not move. At the bottom, a new message comes into view. |
| 5 | A **+** tab at the end of the strip takes a directory path and adds it as a deck. The deck gets a number and a chat, and it stays on the strip until closed, across a restart. A path that is not absolute, does not exist, is not a directory, or carries a credential is refused with the reason. A path that is already a tab goes to that tab. | Add a path and restart the daemon: the tab is still there. A file path is refused with "not a directory". A later `pilot run` in that directory lands on the same tab. |
| 6 | Each Closing reports row has an ×, as a Notifications line does, and pressing it takes the row off that panel in this browser. | Reload: the row is still gone, and its thread still opens at its address. |
| 7 | The CLI status line no longer shows the `deck <n>` segment. The `D<n>` deck number stays. | With items waiting on the deck, the line shows `D<n>` and no `deck <n>`. |
| 8 | On a thread page, an open rail panel paints above the sticky header. | Drag a panel's resize grabber up over the header on a thread page: the panel stays visible and on top the whole time. |
| 9 | A `user` thread's card has Close, with the same two-step confirm as its page. It closes the thread without opening it and returns to the page it was pressed on. | Press Close, then sure: the card leaves the queue, the thread never opened, and it is still closed after a reload. |
| 10 | A thread's "time ago", on its card and its page, counts from its newest message, whoever sent it, and from its posting only while it has none. Every list but the Tickets queue orders and groups its cards by that same time; the Tickets queue keeps deck order. | A thread posted 19 hours ago with a reply a minute old reads "1 min", sits first among the open cards, and is grouped under today in the settled lists; a ticket commented on keeps its place in the queue. |
| 11 | Reopen only reopens: the thread takes a message again. It stores no "Reopened." and wakes nothing. A reply typed into a closed thread still reopens it and wakes the pilot, as that reply. | Press Reopen: a reply box shows, the thread holds no "Reopened.", and a running `pilot wait` stays asleep. |

These eleven lines are the user's draft (from the brief), sharpened against the code and not yet confirmed. Changes from the
draft: line 3 was a layout fault, not a parse fault (F3). Line 4's cause was found by reading the code, so no reproduction
was needed (F4). Line 5 gained the rules for which paths are refused and when a tab stays. Line 9 gained the confirm step
and where the press returns to.

## 3. Findings

- **F1 Remove.** `renderRemove` (`deck/ui/render.mjs:1121-1138`) draws `Remove` three times and posts `/remove-deck`
  (`deck/server.mjs:1034`), which calls `removeDeck` (`deck/store.mjs:1469`). It is drawn only when `tab.ended`. The tests
  (`deck/test/remove-deck.test.mjs:149-167`) pin the form classes and not the label text. A thread's `/close`
  (`server.mjs:1078`) already exists and is a different route.
- **F2 Choices.** A press is an immediate reply. `deck/ui/js/reply.mjs:222-273` marks the button `sent` and disables the
  row. The press is remembered only in a closure, `answered` (`reply.mjs:39`), and `/reply` stores it as the reply text
  through `replyFrom` (`server.mjs:167`, choice + blank line + text). The item has no chosen field (`store.mjs:647`). The
  choice rows are drawn by `renderChoice`/`renderChoiceRow` (`render.mjs:192`), on the card through `renderCardAnswers`
  (`:563`) and on the page through `renderReplyForm` (`:327`).
- **F3 Chat tables.** Chat messages go through `renderMarkdown` (`render.mjs:134-143`, `:1357`), the same parser the
  thread pages use. Both table messages in itm_0bfcf27836de parse to a `<table>` with 4 rows (probed 2026-09-30). The
  Chat panel is `--panel: 19rem` (`deck/ui/deck.css:57`), and `.md table` is `width:100%` with no overflow
  (`deck.css:1127-1129`), so a four-column table is squeezed into columns a few characters wide.
- **F4 Scroll jump.** `time.mjs` rewrites every `<time>`'s text as "n min ago". So the Chat region's live `innerHTML`
  never equals the server's fresh HTML at `deck/ui/js/live.mjs:201`. Every SSE `changed` or `open` event from any deck
  therefore swaps the panel and calls `chat.toBottom()` (`live.mjs:207`, `deck/ui/js/chat.mjs:40-42`), and nothing checks
  where the user was. `deck/test/live.test.mjs:421-434` pins "an unchanged panel does not move" with stubs that never
  run `stamp()`, so the test misses the bug.
- **F5 Tabs.** A tab is one per repository path (`deck/tabs.mjs:87-110`), built from stored runs and open items. A run
  record is kept only while it is live or its repository has a queued item (`store.mjs:1204-1215`), and the chat is not
  queued (`items.mjs` `isQueued`). An ended tab with nothing open therefore drops off: no existing state keeps a bare
  directory on the strip. `registerRun` mints the D-number (`mintDeckNumber`) and adds the chat (`store.mjs:1218-1219`).
  Page writes are guarded by `fromOwnPage` (`server.mjs:834`) and a loopback Host check (`:313`), and the daemon binds
  127.0.0.1. Nothing on a page path runs `fs.stat` or `realpath` on a repository (`requireRepoPath`, `store.mjs:313`, checks
  only that it is non-empty). The strip is `renderStrip` (`render.mjs:982`), a live region `data-live="tabs"`.
- **F6 Reports.** `renderReportRow` (`render.mjs:1188`) has no control. A Notifications ×, `.notice .drop`, is
  client-only: `deck/ui/js/notifications.mjs` stores its state under `localStorage` `deck.seenThreads` (`:52`), and
  `rehide` (`:238`) re-applies it after each live swap. The server's `/dismiss-item` refuses known kinds, and a report is one.
- **F7 Status line.** `buildLine` pushes `deckSegment(deckCount)` (`hooks/context-usage-statusline.js:285`). The count
  comes from `deckOpenCount` (`:330-335`). `D<n>` is `deckNumberSegment` (`:250-256`). The pins are in
  `hooks/test/context-usage.test.js:919-1017`, `:1119` and `:1156-1208`.
- **F8 Resize.** On thread pages the header is `position:sticky; z-index:2` (`deck.css:152-159`), and the rail
  `.strip` is `position:fixed; z-index:1` (`deck.css:651`). Every panel sits inside that stacking context, so a panel
  can never paint above the header. The fixed `h1` is `z-index:3` (`deck.css:307-320`). The resize is the native
  `resize: both` (`deck.css:876`), and `size.mjs` only observes it.
- **F9 Close.** `renderCloseConfirm` (`render.mjs:308`) and `renderCloseForm` (`:390`) draw a thread page's Close for
  `CLOSABLE_KINDS` (`items.mjs`, question and user). `/close` 303s to the thread (`server.mjs:1085`), and the other
  routes take `back` through `backPath` (`server.mjs:975`). `renderCard` (`render.mjs:654`) draws no Close.
- **F10 Time.** `renderTime` (`render.mjs:108`) emits the ISO time, and `deck/ui/js/time.mjs` makes it relative. The card
  (`render.mjs:662`) and the page (`:1876`) both pass `item.postedAt`. Every reply carries `repliedAt`. The queue is in
  deck order, and settled cards are grouped by `postedAt` day (`daySections`, `render.mjs:1604`).
- **F11 Reopen.** `reopenItem` (`store.mjs:765-795`) re-pushes the resolution as a pilot line with no seq, then pushes
  a user `REOPENED` with `++deck.seq`. A session wakes only on a user message carrying a new seq (`awaitsPilot`,
  `items.mjs:480`), and `pilot wait` takes its baseline from the seq (`deck/wait.mjs:186`). `addReply` on a closed thread
  calls `reopenItem` first (`store.mjs:660`). `chain.mjs:22` filters `REOPENED` out of ticket comments, so the constant
  stays for old data. Pins: `deck/test/reopen.test.mjs`, `close.test.mjs`, `dismiss-item.test.mjs`.

## 4. Ubiquitous language

| Term | Means |
|---|---|
| **Close** (a deck) | The ended tab's control, formerly Remove: it archives the tab's open items. It is never a thread's Close. |
| **Added deck** | A directory the user added by path with **+**. It is stored until closed and is a tab like any run's. |
| **Chosen option** | The option that the user's newest reply begins with, on an open thread. It is derived and never stored. |
| **Last said** | The newest message's time, else the posting time. It is what "time ago" reads. |
| **At the bottom** | The Chat panel scrolled to within a few pixels of its end, read just before a swap. |

## 5. Locked decisions

- **L1 Grilling depth is forks** (user, itm_62f483dce41b, 2026-09-30). Only a decision whose paths give materially
  different deliverables goes to the user as an item. Every other decision is assumed with its default and listed in §6
  for Gate 1.
- **L2 The chosen option is derived, not stored.** The deck already stores the reply, so reading the option back from it
  is enough. Clearing on close then comes free, because a closed thread draws no choices. *Rejected*: a `chosen` field
  written by `/reply` and cleared by four close paths (resolve, close, dismiss, reopen), which is four places to forget
  one. The tradeoff: a typed reply after a press unmarks the press, and the newest answer is the one shown.
- **L3 An added deck is a stored list, `deck.added`** (`{ repo, addedAt }[]`), read by `tabsOf` beside runs and
  items. `removeDeck`, the Close of spec 1, drops the entry. *Rejected*: a fake run record with no pid (it would fail
  `newRun`'s pid rule and be pruned by `registerRun`), and a placeholder item (it would sit in the queue). ADR 0048.
- **L4 Path intake is checked on the server**: the path must be absolute, `fs.stat` must say it is a directory, it is
  canonicalised with `fs.realpath`, `refuseCredentials` runs on it, and the route is guarded by `fromOwnPage`. The deck
  only stores the path. It never reads, lists or runs anything in it. *Rejected*: validating in the page, which is not a
  trust boundary.
- **L5 The scroll fix is keep-or-follow, not a quieter compare.** `live.mjs` reads "at the bottom" before the swap,
  then follows or restores `scrollTop`. *Rejected*: normalising `<time>` text before the compare. That removes the swaps
  `time.mjs` causes, but not the swaps real updates cause, which also yank a reader.
- **L6 Tables scroll inside their message** (`overflow-x:auto` on the message's table, cells kept from breaking into
  single characters). *Rejected*: widening `--panel`, which moves every rail panel for one content type.
- **L7 Panels above the thread header** by stacking order: the strip rises above z 2 and stays under the `h1`'s z 3.
  *Rejected*: clamping the panel's top to the header's bottom in `layout.mjs`, which is what the user said it should
  not do ("renders under").
- **L8 Reopen is silent.** It clears the resolution and keeps the no-seq "Closed with …" history line. There is no
  `REOPENED` and no seq bump. The constant stays for `chain.mjs`'s filter of old data. ADR 0049.
- **L9 Close on a card is the thread page's Close**, reused (`renderCloseConfirm`/`renderCloseForm`), posting `/close`,
  which now honours `back` through `backPath`. It still stores the user's "Closed." with a seq, as the page's does, so
  the pilot learns the thread closed.
- **L10 The status line drops the count and the read that feeds it.** `deckOpenCount` goes if nothing else calls it.
- **L11 A remembered press is locked** (user, itm_0f194648726b, 2026-09-30). After a reload the option the newest
  reply chose is drawn pressed with the rest of the row disabled, until the thread closes; changing an answer means
  typing a reply, as today. *Rejected*: marked but still pressable, where a second press sends a new reply and moves the
  mark — two answers on one question that a `pilot wait` reading the first would miss.
- **L12 QA runs on a scratch deck on port 4397** (user, itm_dcc38bfe5822, 2026-09-30): served from the
  `feat/deck-polish` worktree with its own `PILOT_DECK_DIR` and `PILOT_DECK_NO_OPEN=1`, seeded by the Windows recipe in
  `C:/Users/Hazzard/Projects/pilot-qa-seed/ticket-making/`. The user's own 4321 deck is not touched. Line 7 is checked in
  a real Claude Code session's status line. *Rejected*: the live 4321 deck, which would run unreviewed code and take
  line 5's and line 11's writes into the real store.
- **L13 Lists sort by the newest message, except the Tickets queue** (user, itm_16de9a705345, 2026-09-30: "sort by newest
  message too", then "yep" to the carve-out). The open cards on a deck's overview, the settled lists (Everything, Closing
  reports) and the sections of a thread page order and group their cards by `lastSaidAt`, newest first; `daySections`
  keys on it instead of `postedAt`. The Tickets queue keeps deck order, the order the arrows set (ADR 0047), and only its
  "time ago" label reads the newest comment. *Rejected*: label only (the pilot's recommendation), which the user
  overruled; and sorting the queue too, which would fight the arrows.

## 6. Assumed decisions awaiting the user

- **A1** became L13 on 2026-09-30 (itm_16de9a705345).
- **A2** became L11 on 2026-09-30 (itm_0f194648726b).
- **A3 Line 5: any existing directory may be added**, a git repository or not. *Alternative*: refuse a directory with
  no `.git`, which is stricter but refuses a repository that has not been initialised yet.
- **A4 Line 6: dismissal is per browser (localStorage)**, as Notifications is. *Alternative*: a stored `hiddenAt` on
  the report, the same in every browser, at the cost of a new route and store write.
- **A5 Line 1: the confirm paragraph stays**, reworded from "Archive … take its tab off" to "Close …". Only its buttons
  change label.
- **A6** became L12 on 2026-09-30 (itm_dcc38bfe5822).

## 7. Out of scope

- The four chat-preview lines of `fix/deck-polish` (merged in #122).
- Markdown parser limits: an escaped `\|`, and a `|` inside inline code. F3 shows no user table hit them.
- Adding a deck from the CLI or the pilot, and opening a session in an added deck.
- Removing `reply.mjs`'s in-memory `answered`. It still covers a press before the swap arrives.
- Renaming the `/remove-deck` route or `removeDeck`.

## 8. Slices

Estimate 7 × ~30–40 min ≈ 4 h, under the 5–7 h band (`skills/ticket-making/SKILL.md`, Size). This is the whole request, and it
is not padded. S4 can run beside anything. S2 and S3 can run beside each other once S1 is in.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 A + tab adds a deck by path** (walking skeleton) | 5 | `deck/store.mjs`, `deck/tabs.mjs`, `deck/server.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/add-deck.test.mjs` (new), `docs/adr/0048-an-added-deck-is-a-stored-directory.md` (new) | – | [S1](slices/S1.md) |
| **S2 Reopen only reopens** | 11 | `deck/store.mjs`, `deck/test/reopen.test.mjs`, `deck/test/close.test.mjs`, `deck/test/dismiss-item.test.mjs`, `docs/adr/0049-reopen-is-silent.md` (new) | S1 | [S2](slices/S2.md) |
| **S3 The chat keeps its place and shows tables** | 3, 4 | `deck/ui/js/chat.mjs`, `deck/ui/js/live.mjs`, `deck/ui/deck.css`, `deck/test/chat-scroll.test.mjs`, `deck/test/live.test.mjs` | S1 | [S3](slices/S3.md) |
| **S4 The status line drops `deck <n>`** | 7 | `hooks/context-usage-statusline.js`, `hooks/test/context-usage.test.js` | – | [S4](slices/S4.md) |
| **S5 Close: the deck's button and a user thread's card** | 1, 9 | `deck/ui/render.mjs`, `deck/server.mjs`, `deck/test/remove-deck.test.mjs`, `deck/test/close.test.mjs` | S1, S2 | [S5](slices/S5.md) |
| **S6 A card remembers its pick, and lists read and sort by the last message's time** | 2, 10 | `deck/items.mjs`, `deck/ui/render.mjs`, `deck/test/card-history.test.mjs` (new), `deck/test/day-sections.test.mjs` (if it exists; else the pins go in card-history) | S5 | [S6](slices/S6.md) |
| **S7 Rail panels: a report takes an ×, and panels sit above the thread header** | 6, 8 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/ui/js/notifications.mjs`, `deck/test/notifications.test.mjs`, `deck/test/resize.test.mjs` | S3, S6 | [S7](slices/S7.md) |

S5 comes after S2 because both own `close.test.mjs`. S7 comes after S3 because both own `deck.css`.

## 9. Acceptance evidence, in the order the user meets it

On the preview deck from `feat/deck-polish` (A6), seeded with a run, a question with options, a `user` thread, a closing
report, and a chat holding the itm_0bfcf27836de table:

1. The strip ends in **+**. Enter a file's path: it is refused, "not a directory". Enter a scratch directory: a new tab
   D<n> opens. Restart the deck: the tab is still there (5).
2. On a thread page, open a rail panel and drag its grabber up over the header: it stays on top (8).
3. Open Chat: the table reads as columns and scrolls sideways (3). Scroll up and post from another deck: the view stays.
   Scroll to the bottom and post: it follows (4).
4. Press an option on the question, go to the overview and reload: the card shows it pressed (2). Its time reads from
   the reply, not the posting, and the card is first among the open ones; on Everything a settled thread replied to
   today sits under Today; a ticket commented on has not moved in the Tickets queue (10).
5. On the `user` thread's card press Close, then sure: it leaves the queue without opening. Reload: still closed (9).
   Open it, press Reopen: a reply box, no "Reopened.", and a `pilot wait` in a terminal stays asleep (11).
6. On Closing reports press ×, then reload: still gone. Its thread still opens at its address (6).
7. On the ended added deck, press **Close**: the confirm reads **Close deck**. Press it: the tab goes (1).
8. In a Claude Code session with items waiting, the status line shows `D<n>` and no `deck <n>` (7).
9. `npm test`, `node scripts/check-references.mjs` green.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 A + tab adds a deck by path | planned | | | | – | 5 |
| S2 Reopen only reopens | planned | | | | S1 | 11 |
| S3 The chat keeps its place and shows tables | planned | | | | S1 | 3, 4 |
| S4 The status line drops `deck <n>` | planned | | | | – | 7 |
| S5 Close: the deck's button and a user thread's card | planned | | | | S1, S2 | 1, 9 |
| S6 A card remembers its pick, and lists read and sort by the last message's time | planned | | | | S5 | 2, 10 |
| S7 Rail panels: a report takes an ×, and panels sit above the thread header | planned | | | | S3, S6 | 6, 8 |
| feature deck-polish | planned | `feat/deck-polish` | | | S1–S7 | 1–11 |
