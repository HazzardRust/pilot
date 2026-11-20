# archive-page: every local record, readable

Ticket `itm_2fe34eca6f66`. Base `feat/ci-gate` (203bcfb6) on `origin`; PR target `pilot`.

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
| 1 | The deck has a separate Archive page at `GET /archive`. An "Archive" link in the header of every deck page leads to it. | A route test gets 200 on a scratch store. The link is on `/`, `/items` and `/thread/<id>`. The user opens it on the running deck. |
| 2 | Closed tickets are listed, both from the live store and from the month files (`deck.archive-YYYY-MM.json`). Each row opens `/archive/<id>` with the ticket's thread replies, its plan and its closing report. | Scratch store with 3 closed tickets, 1 of them only in a month file: exactly 3 rows. Each detail page shows its report's title. |
| 3 | Every local store has a view, under a kind the user can filter by (A2). The kinds:<br>• closed tickets<br>• closing reports<br>• hand-offs (`handoff`, `crew-handoff`)<br>• every other settled thread<br>• run records<br>• friction rows<br>• the classifier log<br>• usage windows<br>• memory samples<br>• audit reports<br>• the switch files (`alerts.json`, `usage-log.json`, `start-settings.json`)<br>• `deck.log` and `wrapper.log` | One seeded record of each kind appears under its kind, and a kind's filter shows exactly its seeded count. A coverage test fails on a thread kind or a store file that has neither a view nor a never-shown entry. |
| 4 | Rows sort by any column, both ways. A search box filters rows on the page, with no request. | Client test: a date sort gives the exact order ascending and descending. Searching one ticket title leaves exactly its rows. |
| 5 | Rows are grouped by date the way the home page groups settled threads (`daySections`: today, then each day, then each month). | Same headings and counts as `daySections` on the same dates. The user answered "Home page day sections" on itm_50eb0e5833dc. |
| 6 | Every record reads as named fields: labels, local dates, bodies through the existing markdown renderer, never raw JSON. | Per-kind test: the kind's labels are present and no row holds `{"`. The user looks at it on the walkthrough. |
| 7 | The page only reads. It makes GETs only, and visiting changes no stored byte and clears no notice. | Test: the sha256 of `deck.json`, the month files and `classifier.log` are unchanged after `/archive` and every `/archive/<id>`, including for an item that carries a notice. |
| 8 | Credentials are withheld. `deck.secret`, `deck-open.html` and `logs/*.log` are never opened. Every string shown passes `findCredential` and is replaced by `<withheld: credential>` on a hit. *practitioner: security reviewer* | A seeded classifier row and a `deck.log` line, each holding an `sk-` token, render withheld. A spy shows the three never-shown paths are not read. |
| 9 | `/archive` copes with the real store's scale: about 1,500 live items plus 2 month files. *practitioner: log-explorer engineer* (assumed A5) | `/archive` is served in under 2 s from a copy of `~/.claude/pilot` under `PILOT_DECK_DIR`, timed 3 times. |

Cannot mean here: `~/.claude/pilot/handoff-trace.jsonl`, which belongs to crew-handoff-trace and has not landed. That run adds one record-kind file here (§7).

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
  - `GET /thread/<id>` clears a notice (`deck/server-routes.mjs:195`).
  - `readDeckFile` (`deck/store-recovery.mjs:80`) is a pure read.
- **Routes:**
  - Every route is secret-guarded except `OPEN_ROUTES` (`deck/server-routes.mjs:75,108`).
  - Any `.mjs` file in `deck/ui/js/` is served as `/ui/<name>` with no registration (`deck/server-wait.mjs:58-64`).
  - Templates are filled by `renderTemplate` (`deck/ui/render-parts.mjs:73`).
  - The page header is static HTML in `home.html`, `index.html` and `thread.html`. The run strip `<nav class="runs-strip">` sits inside it, and ten tests index its links, so the Archive link goes outside it.
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
  | `deck.secret` and `deck-open.html` | hold the secret | |
  | `logs/*.log` | raw test output, unfiltered | |

- **Tests:**
  - `tempDeck` and `deckOnAPort` are in `deck/testUtils.mjs:68,99`. `aSandbox` and `loadPage` (`:221-255`) cover client modules.
  - Month files are planted as in `deck/test/store-archive.test.mjs:27`.
- **Overlaps:**
  - The Rune run (`feat/rune-deck-ui`, 9 of 22 slices landed) owns no `deck/ui` HTML file. Its L4 keeps the HTML deck.
  - Rune and crew-handoff-trace both edit `deck/server-routes.mjs`, which costs a rebase only.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| archive (`deck/archive.mjs`) | `archiveRows()`, `archiveKinds()`, `NEVER_SHOWN` | pure reads of the store and the month files, record-kind discovery, credential withholding | local-substitutable (temp `PILOT_DECK_DIR`) |
| record kind (`deck/archive-kinds/*.mjs`) | `{ kind, label, files, rowsOf(source) }` | each store's parsing and field labels | in-process; 12 adapters, a real seam |
| month files (`deck/store-archive.mjs`) | `archivedItem(id)`, `archivedItems()` | `readMonth` across every month file | local-substitutable |
| archive detail (`deck/archive-detail.mjs`) | `archiveDetail(id)` | the join of an item, its plan and its closing report | local-substitutable |
| archive render (`deck/ui/render-archive.mjs`, `render-archive-detail.mjs`) | `renderArchivePage`, `renderArchiveDetail` | reuse of `daySections`, escaping, field lists | in-process |
| page script (`deck/ui/js/archive.mjs`) | `sortRows`, `filterRows` | DOM sort, search and kind filter | in-process (`aSandbox`) |
| routes (`deck/server-routes.mjs`) | `GET /archive`, `GET /archive/<id>` | the guard, read-only serving | local-substitutable (`deckOnAPort`) |

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
- **L6** The server renders every row inside its day sections. The page script only sorts, filters and searches in the DOM.
  - *Rejected:* a JSON API with rendering in the client, which would make a second render path.
- **L7** The run's ADR is `docs/adr/NNNN-archive-page.md`, cited as ADR NNNN and written in S10. The landing numbers it.

## 6. Assumed decisions

- **A1 Built in today's HTML deck now, not after Rune.** *Posted as itm_c499d801a364.*
  - *Default:* HTML now. Rune owns no `deck/ui` HTML file, and its L4 keeps the HTML deck. The `archiveRows` seam means a later Rune view is one module.
  - *Trades:* Rune has no Archive page until then.
  - *Rejected:* waiting the rest of the Rune run.
- **A2 Every local store gets a view.** Exceptions: `deck.secret`, `deck-open.html` and `logs/*.log`.
  - *Answered:* "Every store (default)", itm_37996b6195d4.
  - *Rejected:* the named kinds only, which would have been 3 fewer slices.
- **A3 Detail opens on its own route, `/archive/<id>`, not `/thread/<id>`.**
  - *Trades:* a second thread renderer.
  - *Rejected:* reusing `/thread/<id>`, whose GET clears a notice and so breaks spec 7.
- **A4 Sorting by a column other than date orders the rows inside each day section.** Sorting by date also flips the order of the sections.
  - *Trades:* there is no flat cross-day sort.
  - *Rejected:* dropping the sections while a column sort is on, which breaks spec 5.
- **A5 No pagination.** Every row is rendered, with the 2 s bar of spec 9.
  - *Trades:* a page of several MB on the real store.
  - *Rejected:* server paging, which would split search across requests.
- **A6 Text logs show their newest 2,000 lines each, one row per line.** This covers `deck.log`, `wrapper.log` and `wrapper.log.old`. A row takes its timestamp from the line where one parses, and the file's mtime otherwise.
  - *Trades:* older lines are not shown.
  - *Rejected:* the whole file.
- **A7 Items show only once settled** (closed or resolved). Open items stay on the deck itself. Run records, logs and switch files show whatever is current.
  - *Rejected:* duplicating the open queue.
- **A8 `handoff-trace.jsonl` is out until crew-handoff-trace lands.** That run adds `deck/archive-kinds/trace.mjs`, and S10's coverage list names the file as pending.
  - *Rejected:* building against an unlanded format.

## 7. Out of scope

- Any write from the page: no reopening, deleting or replying.
- The Rune view of the archive (A1).
- The trace kind (A8).
- Changing the Tickets tab.
- Paging, export, and retention of the stores themselves.

## 8. Slices

Width 8; longest stem 3

| Slice | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 The Archive tab lists closed tickets by day | 1, 2, 5, 7, 8 | `deck/archive.mjs` (new), `deck/archive-kinds/tickets.mjs` (new), `deck/store-archive.mjs`, `deck/server-routes.mjs`, `deck/ui/render-archive.mjs` (new), `deck/ui/archive.html` (new), `deck/ui/home.html`, `deck/ui/index.html`, `deck/ui/thread.html`, `deck/test/archive-page.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 A row opens its thread, plan and closing report | 2, 6, 7 | `deck/archive-detail.mjs` (new), `deck/ui/render-archive-detail.mjs` (new), `deck/server-routes.mjs`, `deck/test/archive-detail.test.mjs` (new) | S1 (`deck/server-routes.mjs`, archive seam) | typescript, security | [S2](slices/S2.md) |
| S3 Rows sort, filter by kind and search | 4 | `deck/ui/js/archive.mjs` (new), `deck/ui/deck.css`, `deck/test/archive-client.test.mjs` (new) | S1 (row markup in `render-archive.mjs`) | typescript | [S3](slices/S3.md) |
| S4 Closing reports, hand-offs and every settled thread | 3, 6 | `deck/archive-kinds/reports.mjs` (new), `deck/archive-kinds/handoffs.mjs` (new), `deck/archive-kinds/threads.mjs` (new), `deck/test/archive-items.test.mjs` (new) | S1 (record-kind seam) | typescript | [S4](slices/S4.md) |
| S5 Run records and friction rows | 3, 6 | `deck/archive-kinds/runs.mjs` (new), `deck/archive-kinds/friction.mjs` (new), `deck/test/archive-runs.test.mjs` (new) | S1 (record-kind seam) | typescript | [S5](slices/S5.md) |
| S6 The classifier log, credentials withheld | 3, 6, 8 | `deck/archive-kinds/classifier.mjs` (new), `deck/test/archive-classifier.test.mjs` (new) | S1 (record-kind seam) | typescript, security | [S6](slices/S6.md) |
| S7 Usage windows and memory samples | 3, 6 | `deck/archive-kinds/usage.mjs` (new), `deck/archive-kinds/memory.mjs` (new), `deck/test/archive-telemetry.test.mjs` (new) | S1 (record-kind seam) | typescript | [S7](slices/S7.md) |
| S8 Audit reports and switch files | 3, 6 | `deck/archive-kinds/audits.mjs` (new), `deck/archive-kinds/switches.mjs` (new), `deck/test/archive-audits.test.mjs` (new) | S1 (record-kind seam) | typescript | [S8](slices/S8.md) |
| S9 Deck and wrapper logs, line by line | 3, 6, 8 | `deck/archive-kinds/textlogs.mjs` (new), `deck/test/archive-textlogs.test.mjs` (new) | S1 (record-kind seam) | typescript, security | [S9](slices/S9.md) |
| S10 Every store is covered, at real scale | 3, 9 | `deck/test/archive-coverage.test.mjs` (new), `scripts/archive-timing.mjs` (new), `docs/adr/NNNN-archive-page.md` (new) | S4 (thread kinds claimed), S5 (records kinds), S6 (classifier kind), S7 (usage, memory kinds), S8 (audits, switches kinds), S9 (text-log kinds) | typescript | [S10](slices/S10.md) |

Walking skeleton: S1. It touches every layer: a pure store read, the month files, one record kind, withholding, the route, the render with day sections, and the header link.

## 9. Acceptance evidence

What the user sees, in the order they meet it:

1. An "Archive" link in the header of every deck page (1).
2. `/archive` grouped Today / day / month (5).
3. Closed tickets, including one older than 30 days (2).
4. A kind filter that reaches every store (3), each record shown as labelled fields (6).
5. Sort and search (4).
6. A ticket's detail with its thread, plan and report (2).
7. A planted token shown as `<withheld: credential>` (8).
8. `deck.json`'s hash unchanged after the visit (7).
9. The page served in under 2 s on the real store's copy (9).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 5, 7, 8 |
| S2 | planned | | | | S1 | 2, 6, 7 |
| S3 | planned | | | | S1 | 4 |
| S4 | planned | | | | S1 | 3, 6 |
| S5 | planned | | | | S1 | 3, 6 |
| S6 | planned | | | | S1 | 3, 6, 8 |
| S7 | planned | | | | S1 | 3, 6 |
| S8 | planned | | | | S1 | 3, 6 |
| S9 | planned | | | | S1 | 3, 6, 8 |
| S10 | planned | | | | S4, S5, S6, S7, S8, S9 | 3, 9 |
| archive-page | planned | feat/archive-page | | | S1-S10 | 1-9 |
