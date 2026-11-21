# archive-page: every local record, readable

Ticket `itm_2fe34eca6f66`. Base `pilot` (4fee6665) on `origin`; PR target `pilot`.

> **Re-cut** 2026-11-21 on Rune's landing (`origin/pilot` 4fee6665): S1-S3 re-cut onto the Rune view API
> (`GET /api/view`, `deck/view/*.mjs`, `deck/rune/src/regions/*.rs`); spec 1, 2, 4, 7 and 9 moved to it; S4-S10
> unchanged but for S6's and S10's route wording.

## 1. Problem

The deck stores a lot on this machine and shows the user almost none of it. Out of sight today:

- closed tickets
- closing reports once they are hidden
- every closed item older than 30 days, which sits in month files (ADR 0157 A9)
- run records and friction rows
- the classifier log
- the usage and memory logs
- the deck's own logs

The user's words: "an entire separate ui page for me to view logging ... organised, sortable, searchable, and then separated by date ... any state we store locally i want it to be human readable on that page."

## 2. Spec

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | The Rune deck has a separate Archive screen, `GET /api/view?screen=archive`. An Archive button beside Items in the right strip opens it (A9). | A view test gets 200 and the `archive` region on a scratch store; a Rune test clicks `strip-archive` and finds the rows. The user opens it on the running Rune deck. |
| 2 | Closed tickets are listed, both from the live store and from the month files (`deck.archive-YYYY-MM.json`). Pressing a row opens its detail on the same screen (`&id=<id>`) with the ticket's thread replies, its plan and its closing report. | Scratch store with 3 closed tickets, 1 of them only in a month file: exactly 3 rows. Each detail shows its report's title. |
| 3 | Every local store has a view, under a kind the user can filter by (L9). The kinds:<br>• closed tickets<br>• closing reports<br>• hand-offs (`handoff`, `crew-handoff`)<br>• every other settled thread<br>• run records<br>• friction rows<br>• the classifier log<br>• usage windows<br>• memory samples<br>• audit reports<br>• the switch files (`alerts.json`, `usage-log.json`, `start-settings.json`)<br>• `deck.log` and `wrapper.log`<br>• hand-off trace rows (`handoff-trace.jsonl`, A8) | One seeded record of each kind appears under its kind, and a kind's filter shows exactly its seeded count. A coverage test fails on a thread kind or a store file that has neither a view nor a never-shown entry. |
| 4 | Rows sort by any column, both ways. A search box and a kind filter narrow the rows in the Rune deck itself, with no request per keystroke. | Rust test: a date sort gives the exact order ascending and descending; searching one ticket title leaves exactly its rows; typing makes no request. |
| 5 | Rows are grouped by date the way the home page groups settled threads (`daySections`: today, then each day, then each month). | Same headings and counts as `daySections` on 3 seeded dates (today, yesterday, last month). The user answered "Home page day sections" on itm_50eb0e5833dc. |
| 6 | Every record reads as named fields: labels, local dates, bodies through `rune-kit`'s `Markdown` (Rune L8), never raw JSON. | Per-kind test over all 13 kinds: each kind's labels are present and 0 rows hold `{"`. The user looks at it on the walkthrough. |
| 7 | The screen only reads. It makes GETs only, and visiting it or a detail changes no stored byte and clears no notice. | Test: all 3 sha256s, of `deck.json`, the month files and `classifier.log`, are unchanged after `screen=archive` and every `&id=`, including for an item that carries a notice, on a current-format store (L10). |
| 8 | Credentials are withheld. `deck.secret`, `deck-open.html` and `logs/*.log` are never opened. Every string shown passes `findCredential` and is replaced by `<withheld: credential>` on a hit. *practitioner: security reviewer* | A seeded classifier row and a `deck.log` line, each holding an `sk-` token, render withheld. A spy shows the three never-shown paths are not read. |
| 9 | The Archive screen copes with the real store's scale: about 1,500 live items plus 2 month files and the logs. *practitioner: log-explorer engineer* (assumed A5) | The view is served in under 2 s from a copy of `~/.claude/pilot` under `PILOT_DECK_DIR`, timed 3 times; a Rune frame over 10,000 rows with Today open draws in under 50 ms, 3 runs. |

`handoff-trace.jsonl` (crew-handoff-trace, Gate 2 signed 2026-11-21) is a kind here once that run lands: S11 (A8 overturned).

## 3. Findings

- **No list for closed or archived items.**
  - The Tickets tab lists open queues only, in deck order (`deck/items.mjs:598 ticketQueueOf`, `deck/ui/render-rail.mjs:188 QUEUES`).
  - It has no date groups, no search and no sort. Spec 5 therefore follows the home page.
  - Archived items are reachable only by id: `deck/store-archive.mjs:103 archivedItem`, with the private `readMonth` at `:29`.
- **The date grouping:**
  - `daySections(items, now)` is already exported (`deck/ui/render-pages.mjs:122`).
  - It reads `lastSaidAt` (`deck/items.mjs:448`): a reply's time, `postedAt`, or `resolvedAt`.
  - `renderDayHeading` is at `:150`. `deck/ui/js/time.mjs` relabels the headings Today and Yesterday.
- **The read paths write:**
  - `readDeck` writes an upgraded store and recovers a corrupt one from `.bak` (`deck/store-core.mjs:160-175`).
  - `GET /thread/<id>` and `GET /api/view?screen=thread` clear a notice (`deck/server-routes.mjs:199`, `seeThread`).
  - `readDeckFile` (`deck/store-recovery.mjs:80`) is a pure read.
  - Every `/api/view` reads its chrome through `deck/view/reads.mjs readDeck` -> `listItems` (`deck/store-runs.mjs:71`) -> the store's `readDeck`: a write only on a store needing upgrade or `.bak` recovery (L10).
- **The Rune view API** (landed 4fee6665):
  - `GET /api/view?screen=` checks `SCREENS` (`deck/view/index.mjs:26`, home, thread, items) and computes every region in `REGIONS` (`:24`) for every screen; each region decides from `query.screen` what to emit. An archive region must short-circuit off its screen.
  - Rune navigates by `go(s, Query)` (`deck/rune/src/app.rs:50`); `Query.screen` is a free string (`client.rs:59`), so `client.rs`, `live.rs` and `act.rs` need no edit.
  - `center` maps screens to regions by hard-coded `if`s (`app.rs:281-289`); `history` draws on every screen but `thread`, with the empty text "No finished threads yet." (`regions/history.rs:164`), so the archive screen must withhold it.
  - The only non-tab page link is the right strip's Items / Back button, server-driven by `strip.items` (`deck/view/strip.mjs`, `regions/strip.rs:63-83, 132 items_page, 312-319`).
  - Rune has no row sort, filter or search anywhere; `text_input` exists in chat, reply, strip and tabs. The centre column has no scroll of its own (`layout.rs:445, 512` show the `ScrollSpec` pattern).
  - Rust tests start a real scratch daemon (`deck/rune/tests/support/mod.rs:42 Scratch::start`), draw with `Runtime::frame`, and assert on element keys (`tests/history.rs:19-61`). Run: `cargo test --manifest-path deck/rune/Cargo.toml --test <name>`.
- **Stores** (under `storeDir()`, with `PILOT_DECK_DIR` overriding it in tests):

  | Store | What it holds | Written by |
  |---|---|---|
  | `deck.json` | `items[]` (13 kinds), `records[{repo, record}]`, where friction is `record.friction[]` with at most 40 rows (`deck/runs.mjs:320`) | the store |
  | month files | `{items}` | `deck/store-archive.mjs` |
  | `classifier.log` | JSONL `{when, repo, ticket, agent, reason, tool, command, verdict}`, already withheld on write | `deck/classifier-log.mjs:89 readRefusals` reads it |
  | `usage.jsonl` | windows | `deck/telemetry.mjs` |
  | `memory.jsonl` | samples | `deck/memory.mjs` |
  | `audits/<repo>/` | `record.json` and `<stamp>.json` | `deck/audit.mjs` |
  | `alerts.json`, `usage-log.json`, `start-settings.json` | switch files | |
  | `deck.log`, `wrapper.log(.old)` | text | |
  | `handoff-trace.jsonl(.old)` | JSONL hand-off steps (crew-handoff-trace, unlanded at re-cut) | `hooks/lib/wrapper-log.js traceFile`; read by `deck/trace.mjs` |
  | `deck.secret` and `deck-open.html` | hold the secret | |
  | `logs/*.log` | raw test output, unfiltered | |

- **Tests:**
  - `tempDeck` and `deckOnAPort` are in `deck/testUtils.mjs:68,99`.
  - Month files are planted as in `deck/test/store-archive.test.mjs:27`.
- **Overlaps** (queued work):
  - itm_f9162b87414f "Rune side panes match the HTML deck" may edit `deck/rune/src/regions/strip.rs`, which S1 edits for the Archive button: a rebase only, unless A9 moves the button.
  - itm_864c47669387 reply-markdown owns `regions/reply.rs`; no shared file.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| archive (`deck/archive.mjs`) | `archiveRows()`, `archiveKinds()`, `NEVER_SHOWN` | pure reads of the store and the month files, record-kind discovery, credential withholding | local-substitutable (temp `PILOT_DECK_DIR`) |
| record kind (`deck/archive-kinds/*.mjs`) | `{ kind, label, files, rowsOf(source) }` | each store's parsing and field labels | in-process; 13 adapters, a real seam |
| month files (`deck/store-archive.mjs`) | `archivedItem(id)`, `archivedItems()` | `readMonth` across every month file | local-substitutable |
| archive detail (`deck/archive-detail.mjs`) | `archiveDetail(id)` | the join of an item, its plan and its closing report | local-substitutable |
| archive view (`deck/view/archive.mjs`, `deck/view/archive-detail.mjs`) | the `archive` and `archiveDetail` regions of `viewOf` | `daySections` reuse, the kinds' counts, the screen gate | local-substitutable (`deckOnAPort`) |
| Rune archive regions (`deck/rune/src/regions/archive.rs`, `archive_detail.rs`) | `draw(region, &view, cx)`, `sort_rows`, `filter_rows` | drawing, scroll, sort, search and kind filter in a `Local` | in-process (recorded view, `Runtime::frame`) |
| route (`deck/server-routes.mjs`, unchanged) | `GET /api/view?screen=archive[&id=]` | the guard; no `seeThread` off `thread` | local-substitutable |

Deletion test: `store-archive` survives, because three callers need it, and the month listing is folded behind `archivedItems`. No existing module is shallow enough to fold, so there is no fold slice.

## 4. Ubiquitous language

| Term | Meaning |
|---|---|
| **Archive page** | `/archive`: the read-only list of every local record. |
| **Record kind** | One adapter under `deck/archive-kinds/`. It names the store files it reads and turns them into rows. |
| **Row** | One `ArchiveRow`: kind, id, time, title and its named fields. |
| **Withheld** | A string replaced by `<withheld: credential>` because `findCredential` matched it. |
| **Never shown** | A store file the page never opens: `deck.secret`, `deck-open.html` and `logs/*.log`. |

## 5. Locked decisions

- **L1** Grilling depth is "forks": only decisions that fork the deliverable go to the user (itm_a4a50c935a18).
- **L2** Dates are grouped by `daySections` exactly, as the user answered on itm_50eb0e5833dc.
  - *Rejected:* a new grouping for the Tickets tab, which groups nothing today.
- **L3** One read-only seam, `archiveRows`, reads the files directly with `readDeckFile`, `archivedItems` and `readFileSync`. It never calls `readDeck` or a store writer, because `readDeck` upgrades the store and recovers from `.bak`, and both of those are writes.
  - *Rejected:* `listItems()`, which reaches `readDeck`.
- **L4** Record kinds are found by reading the `deck/archive-kinds/` directory, the same way `deck/ui/js/` is served. Each kind slice owns one new file, so they run side by side.
  - *Rejected:* one `switch` in `archive.mjs`, which would put 6 slices in a row on one file.
- **L5** Credentials are withheld once, at the seam: every string in every row goes through `findCredential`. The never-shown files are refused by name, before anything is read.
  - *Rejected:* filtering in each adapter, where one forgotten field would leak.
- **L6** (re-cut) The server computes every row, its display strings and its day section in the `archive` region (Rune L2). Rune only draws, sorts, filters and searches the rows it holds.
  - *Rejected:* server-side sort and search per keystroke, a request per key; and Rust parsing store files (Rune L1).
- **L7** The run's ADR is `docs/adr/NNNN-archive-page.md`, cited as ADR NNNN and written in S10. The landing numbers it.
- **L8** The Archive page is built on the Rune deck, after `rune-deck-ui` lands. The user decided this on itm_c499d801a364, after the pilot's pushback: "leave this red ticket until after rune has landed".
  - *Overridden default:* building in today's HTML now. That would have shown stored records sooner, and the data layer (`archive.mjs` and the record-kind slices) is identical either way.
- **L9** Every local store gets a view, except `deck.secret`, `deck-open.html` and `logs/*.log`. The user answered "Every store (default)" on itm_37996b6195d4.
  - *Rejected:* the named kinds only, which would have been 3 fewer slices.
- **L10** (re-cut) The archive screen's chrome (tabs, strip, status) reads through `/api/view`'s `readDeck` like every screen; only the `archive` and `archiveDetail` regions keep L3. Spec 7's bar is measured on a current-format store, where `readDeck` writes nothing.
  - *Rejected:* a separate archive route without the chrome, which would lose the header and strip on that screen; and making `/api/view` itself write-free, which changes every screen.
- **L11** (re-cut) The archive is a fourth `/api/view` screen, `archive`, with two new regions on each side (Rune L5): `archive` (list) and `archiveDetail` (a row's detail on `&id=`). The list region is `{}` off its screen, so no other screen reads the archive. `center` withholds `history` there.
  - *Rejected:* reusing `history` and its `Card`, whose shape has no fields and whose press opens `screen=thread` (clears a notice, spec 7).

## 6. Assumed decisions

- **A1** is settled: see L8.
  Verdict: stands — settled as L8 on the user's "Keep waiting for Rune to land" (itm_697b1f9df302); Rune landed at 4fee666
- **A2** is settled: see L9.
  Verdict: stands — settled as L9
- **A3 Detail opens on the archive screen, `screen=archive&id=<id>`, not `screen=thread`.**
  - *Trades:* a second thread drawing in Rune, without reply or options.
  - *Rejected:* `screen=thread`, whose GET clears a notice and so breaks spec 7.
  Verdict: stands — no queued ticket changes how a thread's notice clears; spec 7 needs the read-only path
- **A4 Sorting by a column other than date orders the rows inside each day section.** Sorting by date also flips the order of the sections.
  - *Trades:* there is no flat cross-day sort.
  - *Rejected:* dropping the sections while a column sort is on, which breaks spec 5.
  Verdict: stands — the Tickets tab's date grouping the user asked to match (spec 5) keeps sections
- **A5 No pagination.** Every row is in the view, with the 2 s and 50 ms bars of spec 9; day sections fold, Today open, so a frame draws only open sections.
  - *Trades:* a view of several MB on the real store, refetched on each live change while the screen is open.
  - *Rejected:* server paging, which would split search across requests.
  Verdict: stands — no queued ticket adds paging to /api/view; spec 9's bars guard the cost
- **A6 Text logs show their newest 2,000 lines each, one row per line.** This covers `deck.log`, `wrapper.log` and `wrapper.log.old`. A row takes its timestamp from the line where one parses, and the file's mtime otherwise.
  - *Trades:* older lines are not shown.
  - *Rejected:* the whole file.
  Verdict: stands — no recorded preference asks for whole logs; the files stay on disk
- **A7 Items show only once settled** (closed or resolved). Open items stay on the deck itself. Run records, logs and switch files show whatever is current.
  - *Rejected:* duplicating the open queue.
  Verdict: stands — open items are on the deck itself, and the side-panes ticket itm_f9162b87414f owns their panes
- **A8 `handoff-trace.jsonl` is out until crew-handoff-trace lands.** That run adds `deck/archive-kinds/trace.mjs`, and S10's coverage list names the file as pending.
  - *Rejected:* building against an unlanded format.
  Verdict: overturned: crew-handoff-trace's Gate 2 (itm_34bcc492a686) was signed 2026-11-21 and lands before this run implements, so handoff-trace.jsonl is in scope as a kind; spec 3 asks for everything logged
- **A9 The Archive button sits in the right strip beside Items** (`strip.archive`, as `strip.items`).
  - *Trades:* a shared file, `regions/strip.rs`, with itm_f9162b87414f (side panes); the strip, not the header, as the way in.
  - *Rejected:* an Archive entry in the header tab strip (`regions/tabs.rs`), which mixes a page among the deck tabs.
  - Answered "Strip beside Items" on itm_d1836b2773f6 (the default).
  Verdict: stands — the user pressed "Strip beside Items" on itm_d1836b2773f6

## 7. Out of scope

- Any write from the page: no reopening, deleting or replying.
- The HTML deck view of the archive (L8): `/archive` HTML routes are not built.
- Changing the Tickets tab.
- Paging, export, and retention of the stores themselves.

## 8. Slices

Width 9; longest stem 3

| Slice | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 The Archive screen lists closed tickets by day | 1, 2, 5, 7, 8 | `deck/archive.mjs` (new), `deck/archive-kinds/tickets.mjs` (new), `deck/store-archive.mjs`, `deck/view/archive.mjs` (new), `deck/view/index.mjs`, `deck/view/strip.mjs`, `deck/rune/src/regions/archive.rs` (new), `deck/rune/src/regions/mod.rs`, `deck/rune/src/regions/strip.rs`, `deck/rune/src/app.rs`, `deck/test/archive-page.test.mjs` (new), `deck/rune/tests/archive.rs` (new) | – | typescript, rust, security | [S1](slices/S1.md) |
| S2 A row opens its thread, plan and closing report | 2, 6, 7 | `deck/archive-detail.mjs` (new), `deck/view/archive-detail.mjs` (new), `deck/view/index.mjs`, `deck/rune/src/regions/archive_detail.rs` (new), `deck/rune/src/regions/mod.rs`, `deck/rune/src/app.rs`, `deck/test/archive-detail.test.mjs` (new), `deck/rune/tests/archive_detail.rs` (new) | S1 (`deck/view/index.mjs`, `regions/mod.rs`, `app.rs`, archive seam) | typescript, rust, security | [S2](slices/S2.md) |
| S3 Rows sort, filter by kind and search | 4, 9 | `deck/rune/src/regions/archive.rs`, `deck/rune/tests/archive_filter.rs` (new) | S1 (`regions/archive.rs`) | rust | [S3](slices/S3.md) |
| S4 Closing reports, hand-offs and every settled thread | 3, 6 | `deck/archive-kinds/reports.mjs` (new), `deck/archive-kinds/handoffs.mjs` (new), `deck/archive-kinds/threads.mjs` (new), `deck/test/archive-items.test.mjs` (new) | S1 (record-kind seam) | typescript | [S4](slices/S4.md) |
| S5 Run records and friction rows | 3, 6 | `deck/archive-kinds/runs.mjs` (new), `deck/archive-kinds/friction.mjs` (new), `deck/test/archive-runs.test.mjs` (new) | S1 (record-kind seam) | typescript | [S5](slices/S5.md) |
| S6 The classifier log, credentials withheld | 3, 6, 8 | `deck/archive-kinds/classifier.mjs` (new), `deck/test/archive-classifier.test.mjs` (new) | S1 (record-kind seam) | typescript, security | [S6](slices/S6.md) |
| S7 Usage windows and memory samples | 3, 6 | `deck/archive-kinds/usage.mjs` (new), `deck/archive-kinds/memory.mjs` (new), `deck/test/archive-telemetry.test.mjs` (new) | S1 (record-kind seam) | typescript | [S7](slices/S7.md) |
| S8 Audit reports and switch files | 3, 6 | `deck/archive-kinds/audits.mjs` (new), `deck/archive-kinds/switches.mjs` (new), `deck/test/archive-audits.test.mjs` (new) | S1 (record-kind seam) | typescript | [S8](slices/S8.md) |
| S9 Deck and wrapper logs, line by line | 3, 6, 8 | `deck/archive-kinds/textlogs.mjs` (new), `deck/test/archive-textlogs.test.mjs` (new) | S1 (record-kind seam) | typescript, security | [S9](slices/S9.md) |
| S11 Hand-off trace rows | 3, 6 | `deck/archive-kinds/trace.mjs` (new), `deck/test/archive-trace.test.mjs` (new) | S1 (record-kind seam) | typescript | [S11](slices/S11.md) |
| S10 Every store is covered, at real scale | 3, 9 | `deck/test/archive-coverage.test.mjs` (new), `scripts/archive-timing.mjs` (new), `docs/adr/NNNN-archive-page.md` (new) | S4 (thread kinds claimed), S5 (records kinds), S6 (classifier kind), S7 (usage, memory kinds), S8 (audits, switches kinds), S9 (text-log kinds), S11 (trace kind) | typescript | [S10](slices/S10.md) |

Walking skeleton: S1, across both sides: a pure store read, the month files, one record kind, withholding, the `archive` region and screen, the strip button, and the Rune list in day sections. Estimated near 400 lines, the brief's limit; past it, S1's implementer stops and asks main.

Red team (re-cut), each walked against the landed files:
- **red team:** `history` draws on every non-thread screen with "No finished threads yet." (`app.rs:286`, `history.rs:164`): S1 withholds it on `archive` (L11) and pins the text's absence (S1 behaviour 5).
- **red team:** `REGIONS` run on every screen (`view/index.mjs:34`): an unguarded `archive` region would read every log on each home refresh. S1 behaviour 6 pins `{}` off screen.
- **red team:** the HTML-cut S1 drew only titles; non-item kinds (logs, usage) have no detail (S2 joins items only), so S1's Rust row draws each row's fields, or spec 6 fails for S5-S9.
- **red team:** S11 reads a file whose writer is not on `pilot` at re-cut (`feat/crew-handoff-trace` a872f2c6): S11 stops and asks main if `deck/trace.mjs` is absent from its base; nothing else waits on it but S10.
- **red team:** S2 and S3 both thicken the Rune screen: the detail is its own region file (`archive_detail.rs`), so S3 owns `archive.rs` alone and the two run side by side.

## 9. Acceptance evidence

What the user sees, in the order they meet it:

1. An Archive button beside Items in the Rune deck's right strip (1).
2. The Archive screen grouped Today / day / month (5).
3. Closed tickets, including one older than 30 days (2).
4. A kind filter that reaches every store (3), each record shown as labelled fields (6).
5. Sort and search, with no wait per key (4).
6. A ticket's detail with its thread, plan and report, and Back (2).
7. A planted token shown as `<withheld: credential>` (8).
8. `deck.json`'s hash unchanged after the visit (7).
9. The view served in under 2 s on the real store's copy, and the screen scrolling without stutter (9).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 5, 7, 8 |
| S2 | planned | | | | S1 | 2, 6, 7 |
| S3 | planned | | | | S1 | 4, 9 |
| S4 | planned | | | | S1 | 3, 6 |
| S5 | planned | | | | S1 | 3, 6 |
| S6 | planned | | | | S1 | 3, 6, 8 |
| S7 | planned | | | | S1 | 3, 6 |
| S8 | planned | | | | S1 | 3, 6 |
| S9 | planned | | | | S1 | 3, 6, 8 |
| S10 | planned | | | | S4, S5, S6, S7, S8, S9, S11 | 3, 9 |
| S11 | planned | | | | S1 | 3, 6 |
| archive-page | planned | feat/archive-page | | | S1-S11 | 1-9 |
