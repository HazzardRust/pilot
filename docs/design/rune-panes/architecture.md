# Rune side panes match the HTML deck

Ticket `itm_f9162b87414f` · slug `rune-panes` · base `origin/pilot` 86957ec · ADR NNNN (`docs/adr/NNNN-rune-panes.md`, S1)

## 1. Problem

The Rune deck (`deck/rune/`, landed by "Deck UI rebuilt in Rune") still reads differently from the HTML deck in its
side panes: Status, Notifications, Tickets, Chat and Agents, and their empty texts. Worse, a thread does not scroll at
all, so its bottom is unreachable: "i cant scroll to the bottom of a thread, i cant scroll at all". The user wants the
Rune panes to read like the HTML deck's, and threads to scroll.

## 2. Spec

Every `test` line runs in `cargo test --manifest-path deck/rune/Cargo.toml` on a seeded view (or a scratch daemon) and
in CI's `Rune deck` job; every `look` line is the user's, on the walkthrough, beside the HTML deck.

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1a | The status ticket selector lists one ticket per line as "<lane> · <title>", the chosen one with a 2 px left bar. | Rune test on a seeded two-lane view | 2 lines, each with " · "; 1 bar, on the chosen row only |
| 1b | An http or https URL inside a State cell is a link that opens in the browser; other schemes stay text. | Rune test: press the link, read `take_url_requests` | 1 request, the URL without trailing punctuation; 0 for `file:` |
| 1c | A held ticket with no slice record says "no slice table yet", on its deck and under its overview heading. | view test and Rune test on a seeded held ticket | 1 sentence per such ticket; 0 on a tab with no ticket |
| 2 | An open notification row ends " · <tab name>". | view test and Rune test on a seeded open notice | 1 of 1 seeded rows ends " · <tab>"; 0 suffix for an unknown repo |
| 3a | "blocking" and "re-cut" are red 1 px outlined badges on a ticket row. | Rune test on seeded rows | 2 badges stroked in the `red` token; 0 when neither applies |
| 3b | The fold holding the in-hand or co-pilot ticket opens itself, whatever the saved folds say, and a press does not shut it. | Rune test with empty prefs | 1 held fold open from empty prefs; still open after 1 press |
| 3c | An open queue with no ticket says "none". | Rune test | 1 "none" per empty open fold |
| 3d | A row's live, state, re-cut and questions sit on one line under the title, `next` above it, as the HTML deck does. *assumed A6* | Rune test at the default side width | 4 parts on 1 line |
| 4 | Chat lists the tab's Create threads above the messages, even with no chat open; each opens its thread. | view test; Rune test on a seeded view with two | 2 rows above the first message; a press opens that thread |
| 5 | Agents rows read "<type> · started N mins ago" (the HTML deck's `relative` words); the overview has one section per deck. *A1, the user's pick* | view test; Rune test on a seeded roster of two decks | 2 section headings; every row in that form |
| 6 | Empty texts match the HTML deck: "no tickets"; nothing for notifications, chat and status. *A2, the user's pick* | `tests/empty.rs` on an empty scratch deck | 4 of 4 as the HTML deck draws them |
| 7 | Starts after "Deck UI rebuilt in Rune" landed. | the base carries `deck/rune/` | 1 landing: `deck/rune/` present at the base, 86957ec |
| 8 | The centre column scrolls on every screen: a thread by wheel, keys and scrollbar to its last message, opening at the bottom and following new messages while there; home and the items page open at the top. *A3, A4, A5* | Rune test on a seeded 60-message thread in a 900 px window; the user's look | wheel and End each put the last message inside the window; PageUp leaves it; 0 offset change on a live refetch while scrolled up |
| 8a | *practitioner: desktop-app engineer*: a key typed in the reply box never scrolls the centre. | Rune test with the reply box focused | End moves the caret, 0 scroll |

## 3. Findings

- **Scroll, the first step of spec 8**: only the centre column fails, on every screen. `app::center`
  (`deck/rune/src/app.rs:236-291`) is a plain `col()` with no `.scroll(..)`, and `layout::strips` gives it
  `.grow(1.0).min_w(0)` but no `min_h(0)` (`layout.rs:595`). The side area (`layout.rs:504-516`), dragged pane
  bodies (`layout.rs:445`) and chat (`regions/chat.rs:103`, `stick_bottom: true`) are viewports; chat's has a wheel
  test (`tests/chat.rs:233-280`). Rune needs a bounded height and `min_h(0)` on every flex column between
  (`rune/src/el/scroll.rs:9-13`); `ScrollSpec { stick_bottom }` opens a new viewport at the bottom and follows growth
  (`scroll.rs:258-265`); `Tx::scroll_page`, `scroll_to_bottom`, `scroll_to_y` move one by key
  (`el/tx/scroll.rs:84-118`); headless `Runtime::wheel(x, y, dy)` (`runtime/input/api.rs:74`).
- Scroll bars: Rune draws an overlay bar while scrolling on Windows (`platform/scroll_bars.rs`, default
  `WhenScrolling`). The HTML thread page has no scroll script (`deck/ui/js/`): it opens at the top.
- Keys: `app::key` (`app.rs:103-115`) takes Alt+arrows, then `regions::thread::key`, which never takes a key a text
  field holds (rune-deck-ui spec 12).
- Status: selector `format!("{} {}", lane, name)` in a row (`regions/status.rs:97-117`), HTML `"${stage} · ${title}"`
  with `box-shadow: inset 2px 0` (`ui/render-rail.mjs:474-482`, `ui/deck.css:710-711`). State is plain text
  (`status.rs:171-181`); HTML links URLs (`ui/render-strip.mjs:19-33`, `URL_IN_TEXT`). A held ticket with no record
  yields `{tickets: [], rows: []}` (`view/status.mjs:60-69`), the same as an empty tab; HTML: `render-rail.mjs:539`.
  `Tx::open_url` opens http, https and mailto only and headless keeps the requests (`rune/src/open_url.rs:1-10`).
- Notifications: `view/notifications.mjs:24-27` sends `{id, title, href, writes}`; HTML adds `tabFor(tabs,
  item.repo).name` (`render-rail.mjs:371-388`).
- Tickets: "re-cut" is grey text (`regions/tickets.rs:407`), no blocking badge (`:412-423`); HTML `.blocking, .recut`
  (`deck.css:349`), the colours of theme.json's `red` token. A fold opens only from prefs (`tickets.rs:582, 609`);
  HTML opens a held fold and never remembers it (`ui/js/bookmarks.mjs:84-93`). Rows carry `mark` and `live`
  (`view/tickets.mjs:60`). An open empty queue draws nothing (`tickets.rs:610-632`); HTML says "none"
  (`render-rail.mjs:218`). The one-line layout already matches (`tickets.rs:381-410` against `deck.css:359-362`).
- Chat: `view/chat.mjs:21-27` returns `{id, messages}`; HTML lists `kind === KIND_USER` items of the tab's repo above
  the messages, even with no chat (`render-rail.mjs:425-445`, `items.mjs:61`).
- Agents: `view/agents.mjs:15-19` sends a flat roster of `{name, kind, since, quietS, quiet}`; Rust drops `since`
  and draws `"{quiet_s}s"` (`regions/agents.rs:45-65`, rune-deck-ui L11). HTML: `"<type> · started N min ago"`
  and a `run-section` per deck on the overview (`render-rail.mjs:304-305, 543-551`). The page writes the ISO stamp
  and `ui/js/time.mjs` `relative` turns it into "3 mins ago" in the browser; the view already calls `relative`
  server-side for usage resets (`view/usage.mjs:13, 27`), the precedent S6 follows.
- Empty texts are pinned in one table, `tests/empty.rs:9-18` (`SENTENCES`), from rune-deck-ui spec 21.
- Build here: cargo 1.100 is on PATH on this laptop; on origin/pilot 86957ec, after `npm ci`, `cargo test --locked
  --no-fail-fast` builds and passes 177 of 177 across 27 test binaries, scratch daemons and headless frames included
  (without `npm ci` every scratch-daemon test fails at `tests/support/mod.rs:33`); CI's `Rune deck` job (`.github/workflows/ci.yml`, `windows-latest`) builds and tests on PRs to `pilot`
  that touch `deck/**`. `deck/test/facades.test.mjs` caps only `deck/*.mjs` and `deck/ui/*.mjs` at 800 lines.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Deck view | `<region>View(reads, query)` in `deck/view/<region>.mjs` → the region's JSON | tab names, held flags, Create threads, deck groups, all resolved server-side | in-process (pure) |
| Regions | `regions::<r>::draw(&Value, &Local, &mut Cx<State>) -> El` | parse, labels, badges, folds, links per pane | in-process |
| Centre viewport | `app::center(&State, &mut Cx<State>) -> El`, `app::key`, `app::CENTRE` | the scroll spec per screen, the keys that move it | in-process |

Deepening: no fold changes code. The deletion test keeps every view module (the HTML renderers are not the view's
source, rune-deck-ui L4) and every region file; the centre's scroll stays inside `app::center` rather than a new
module, since one caller draws it. Every `test` behaviour targets one of these three seams.

## 4. Ubiquitous language

- **HTML deck**: `deck/ui/`, the reference; unchanged by this run. **Rune deck**: `deck/rune/`.
- **Pane**: one left-side region (status, notifications, tickets, chat, agents).
- **Centre**: the column between the side area and the right strip: header, queue or thread, reply, history.
- **Create thread**: an item of kind `user`, opened by the strip's Create.
- **Held ticket**: the ticket a lane holds (in hand) or a co-pilot directs.

## 5. Locked decisions

- **L1** Grilling depth: forks, the user's own press on itm_d3782556b608.
- **L2** The HTML deck is the reference and is not edited. Rejected: aligning both to a third look.
- **L3** Data a pane needs comes from its view module, every string resolved there (rune-deck-ui L2); Rust draws.
  Rejected: Rust deriving tab names or groups from raw ids.
- **L4** The centre is one viewport keyed per screen and thread, so a new thread opens fresh at the bottom and a
  live refetch keeps the offset. Rejected: a viewport per region (the reply box and history would scroll apart).
- **L6** QA runs the Rune deck built on this laptop, on a scratch deck with seeded data, beside the HTML deck: the
  user's press on itm_b58bc6c5879e. Rejected: the user's live deck.
- **L5** One slice per pane, each owning its region file, view module and tests; the empty texts last, since
  `tests/empty.rs` and four regions' empty lines are shared. Rejected: one empty-text edit per pane slice (a
  shared table edited by four parallel slices).

## 6. Assumed decisions

- **A1** Agents row: "<type> · started N min ago" on the left, and the quiet age at the right with its 30 s dimming
  kept (rune-deck-ui L11, the user's pick on itm_671096e1253c). Trade: one more number per row. Rejected: replacing
  the age (overturns L11). *sent to `main` as B1; posted itm_4b9dece272d0*
  Answer: the user pressed "Both" (itm_4b9dece272d0).
  Verdict: stands — the user pressed Both on itm_4b9dece272d0
- **A2** Empty texts follow the ticket: blank for notifications, chat and status, "no tickets" for tickets, agents and
  reports unchanged. Trade: reverses rune-deck-ui spec 21 for three regions. Rejected: keep Rune's sentences and
  reword only tickets. *sent to `main` as B2; posted itm_bc4c98f219eb*
  Answer: the user pressed "Follow the ticket" (itm_bc4c98f219eb).
  Verdict: stands — the user pressed Follow the ticket on itm_bc4c98f219eb
- **A3** Scroll bar: Rune's overlay bar, shown while scrolling and draggable then. Trade: no bar at rest, unlike the
  HTML page. Rejected: forcing an always-shown bar (no public setting confirmed at the pin). *sent to `main` as B3; posted itm_4618d7d1990a*
  Answer: the user pressed "Overlay" (itm_4618d7d1990a).
  Verdict: stands — the user pressed Overlay on itm_4618d7d1990a
- **A4** A thread opens at its bottom, as the ticket says, though the HTML thread opens at the top. Trade: a long
  ask's opening lines need a scroll up. Rejected: open at the top.
  Verdict: stands — the ticket's line 8 says a thread opens at the bottom
- **A5** The tabs header stays fixed above the centre's viewport; PageUp, PageDown, Home, End, Up and Down scroll it
  when no text field holds the key; Left and Escape still leave a thread. Trade: Up and Down no longer reach
  anything else when nothing is focused. Rejected: the header scrolling away; Space as a page key (it types).
  Verdict: stands — no queued ticket touches the centre column or its keys
- **A6** Spec 3d already holds (`next` above the title, live/state/badges on one line): pinned by a test, nothing
  moved. Rejected: joining `next` onto the state line (the HTML deck does not).
  Verdict: stands — a pin, nothing moves
- **A7** Create threads listed as the HTML deck lists them: every kind-`user` item of the tab's repo, open and
  closed, newest first as `reads.items` orders them. Rejected: open ones only.
  Verdict: stands — matches the HTML deck, as the ticket asks
- **A8** A State link uses `Tx::open_url` (http, https; trailing `.,;:!?)]}'"` trimmed as `URL_IN_TEXT` does).
  Rejected: a deck route that opens it (a new write path).

red team: walked S1 against `layout.rs:595`: the centre has no `min_h(0)`, so a viewport inside `app::center` alone
resolves to its content height and never scrolls; S1 owns that one line of `layout.rs`. Walked S1 against
`tests/thread.rs:313-360` (`drawn`, `rect_of`): a thread opening at the bottom moves pinned rects if a seeded
thread is taller than its window; S1 may raise those test windows' heights and nothing else in that file. Walked S5
against `tests/tickets.rs:358` (`folds_are_kept_per_deck`): it assumes shut-by-default folds; a held row now opens
its fold, so S5 owns that test. Walked S7 against S2-S5: each of those changes the same region files S7 edits, so S7
comes after all four. Seam two slices half-build: none (each pane's view field and its Rust reader are one slice's).
  Verdict: stands — http and https only adds no new trust boundary

## 7. Out of scope

Prebuilt Rune binaries (itm_ff5ace129388); any change to the HTML deck; panes not named (graph, reports, history);
the right strip and header; Rune upgrades past the pin; macOS and Linux runs.

## 8. Slices

Width 6; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A thread scrolls to its last message by wheel, keys and bar (walking skeleton) | 8, 8a, 7 | `deck/rune/src/app.rs` (`center`, `key`, `CENTRE`), `deck/rune/src/layout.rs` (line 595 only), `deck/rune/tests/deck/scroll.rs` (new) and its `mod scroll;` line in `deck/rune/tests/deck/main.rs`, `deck/rune/tests/deck/thread.rs` (window heights only), `docs/adr/NNNN-rune-panes.md` (new) | – | `pilot:rust-reviewer` | [S1](slices/S1.md) |
| S2 | The status pane: the selector, State links, "no slice table yet" | 1a, 1b, 1c | `deck/view/status.mjs`, `deck/test/view-status.test.mjs`, `deck/rune/src/regions/status.rs`, `deck/rune/tests/deck/status.rs` | – | `pilot:rust-reviewer`, `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | Open notifications end with their tab's name | 2 | `deck/view/notifications.mjs`, `deck/test/view-notifications.test.mjs`, `deck/rune/src/regions/notifications.rs`, `deck/rune/tests/deck/notifications.rs` | – | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | Chat lists its Create threads above the messages | 4 | `deck/view/chat.mjs`, `deck/test/view-chat.test.mjs`, `deck/rune/src/regions/chat.rs`, `deck/rune/tests/deck/chat.rs` | – | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | Ticket rows: red badges, the held fold open, "none" | 3a, 3b, 3c, 3d | `deck/rune/src/regions/tickets.rs`, `deck/rune/tests/deck/tickets.rs` | – | `pilot:rust-reviewer` | [S5](slices/S5.md) |
| S6 | Agents read "started N min ago", a section per deck | 5 | `deck/view/agents.mjs`, `deck/test/view-agents-reports.test.mjs`, `deck/rune/src/regions/agents.rs`, `deck/rune/tests/deck/agents_reports.rs` | – | `pilot:rust-reviewer`, `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | Empty panes read as the HTML deck's | 6 | `deck/rune/tests/deck/empty.rs`, the empty lines of `regions/notifications.rs`, `chat.rs`, `status.rs`, `tickets.rs` | S2 (`status.rs`), S3 (`notifications.rs`), S4 (`chat.rs`), S5 (`tickets.rs`) | `pilot:rust-reviewer` | [S7](slices/S7.md) |

S1 first by risk: the user's named bug, and the one change to the centre every walkthrough step stands on. S1-S6
share no file and run side by side; S7 follows S2-S5. Spec 7 is met by the base and recorded by S1's ADR.

## 9. Acceptance evidence

1. Open a long thread in the Rune deck: it opens at its last message; wheel up, PageUp, Home reach the top; End and
   the scroll bar's drag return to the bottom; a new message while at the bottom shows (spec 8, 8a).
2. Home and the items page scroll and open at the top (spec 8).
3. Status: "<lane> · <title>" lines with a bar on the chosen one; a URL in State opens the browser; a held ticket
   with no record reads "no slice table yet" (spec 1).
4. Notifications rows end " · <tab>" (spec 2).
5. Tickets: red outlined "blocking" and "re-cut", the held fold open, "none" in an empty open queue (spec 3).
6. Chat lists the Create threads above the messages, each opening its thread (spec 4).
7. Agents rows "<type> · started N min ago", one section per deck on the overview (spec 5).
8. An empty deck: "no tickets", and nothing in notifications, chat and status, as the HTML deck (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 8, 8a, 7 |
| S2 | planned | | | | – | 1a, 1b, 1c |
| S3 | planned | | | | – | 2 |
| S4 | planned | | | | – | 4 |
| S5 | planned | | | | – | 3a, 3b, 3c, 3d |
| S6 | planned | | | | – | 5 |
| S7 | planned | | | | S2, S3, S4, S5 | 6 |
| Rune side panes match the HTML deck | planned | `feat/rune-panes` | | | S1-S7 | 1-8 |
