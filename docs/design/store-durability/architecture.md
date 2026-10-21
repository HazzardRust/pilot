# store-durability: the deck.json write retries, keeps a backup and archives old items

Ticket `itm_06d54e3b798b`. Merge: none (thread `itm_250f0a2e25e0`: no queued ticket shares the store's files).
Base `pilot` at f2e462ba. Grilling depth: every (`itm_087012fd2f3c`).

## 1. Problem

The user asked what missing parts keep the deck from being a thoroughly developed application, and had the
gaps made into tickets. This one holds the store's: the deck.json rename fails on Windows file locks, a bad
write has no backup to fall back to, the Weekly alerts switch writes through its own fixed-name temp file, and
the live store grows without bound (5.7 MB and 1495 items on 2026-10-17, 87 of them open).

## 2. Spec

Agreed by the user on the ticket (itm_c71fdc07acae, 2026-10-17); the Gate 1 walk kept L1–L6 and L8, and A1–A9 were each answered as their default.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The rename in `hooks/lib/atomic-write.js` retries on EPERM, EBUSY and EACCES with doubling backoff for about one second, then throws the original error with no `.tmp` left; every caller inherits it (A6). | a test whose rename fails twice then succeeds reads the new content; one failing throughout reads the original code after ≥ 900 ms and no `.tmp` |
| 2 | Every store write first keeps the store it replaces as `deck.json.bak`, and only a store this process last parsed as a deck, so `.bak` always parses (A7). | after two posts `.bak` holds the store as it stood after the first |
| 3 | A read that finds deck.json unparseable or not a deck moves it aside to `deck.json.corrupt-<date>[-n]`, never overwriting one, puts `.bak` in its place, logs one line naming both to deck.log, and serves. A newer-version store keeps today's refusal; so does a missing or unreadable `.bak` (A4). | a scratch deck whose store is corrupted answers its next request; the corrupt bytes are kept byte-identical; the log line is there |
| 4 | `pilot store restore` swaps deck.json and `deck.json.bak` and keeps the replaced store as `deck.json.replaced-<date>[-n]`, so a second restore puts it back; it refuses while a deck daemon serves (A5). | a test restores a copied store and reverses it; one with a live pid is refused naming the pid. Locked by itm_cbaecdb393d2: the refusal no longer names `pilot deck --stop`. |
| 5 | alert-switch writes through `atomicWriteFileSync`. | no `.tmp` in `deck/alert-switch.mjs`; its tests pass |
| 6 | Closed items older than 30 days (A1) move to `deck.archive-YYYY-MM.json` (A8) when the daemon starts and once a day after (A3); open items, a closed item still showing a notice, and a closed ticket any live item names stay. Live items keep their ids and order. | a test over a planted store reads the old closed items in the archive only, and the live items' ids and order identical before and after |
| 7 | The archive is written before the live store, so a failure between leaves an item in both, never in neither; the next pass drops the duplicate by id. | a test that fails the live write after the archive write loses no item, and a second pass leaves one copy |
| 8 | `deck_read`, `/api/items?id=` and the thread page find an archived item by id, read-only; a reply to it is refused saying it is archived and to post a new thread (A2). | tests read each; the reply test reads the refusal |
| 9 (added) | `pilot store restore` also refuses while a deck serving this store listens on any port: the daemon keeps `<pid> <port>` in the store dir's `deck.pid`, and restore asks that port's `/api/health` for its pid, refusing when the same pid answers or when it cannot tell; a `deck.pid` whose port answers nothing or another pid is stale and ignored, so a pid reused after an outside kill (Windows runs no handler) never refuses; with no `deck.pid`, or a stale one, the configured port is asked (S3's security review, PR #789; the principles review). | a test whose `deck.pid` port answers its pid is refused; one that cannot tell is refused; a stale one is ignored; a scratch daemon writes and removes it |

Implied and stated: the settled and done history and the reports tab list live items only (A9).
Cannot mean: a fallback only "on daemon start"; the store is read and written per request
(`readDeck`, `deck/store-core.mjs:151`), and no start-time read exists, so spec 3 acts on any read.

## 3. Findings

- `hooks/lib/atomic-write.js:24-33`: write `<target>.<pid>.tmp`, rename, unlink the tmp and rethrow on failure.
  Seven callers: `deck/store-core.mjs:311`, `deck/audit.mjs:272`, `hooks/lib/deck.js:520,574,642`,
  `hooks/context-usage-statusline.js:176`, `scripts/install-rules.mjs:196,269`, `scripts/install-settings.mjs:136`.
  The ticket's `deck/atomic-write.js` anchor is stale.
- `deck/alert-switch.mjs:29-30`: `${file}.tmp` then `renameSync`; `deck/test/alert-switch.test.mjs:46` pins the tmp's absence.
- `deck/store-core.mjs:151-193` `readDeck`: parse, shape and version checks throw `unreadableStore` (`:144`), which
  tells the user to move the file aside. `:241-270` `backUp`: the dated-sibling, link-never-overwrite pattern spec 3
  reuses. `:308-312` `writeDeck`. Every store write is read-modify-write in one call.
- A corrupt store has happened: `~/.claude/pilot/deck.json.corrupt-2026-09-14`, 10 bytes, moved aside by hand.
- Closed items (`resolvedAt`, `deck/items.mjs:499`) are read by id in `deck/read.mjs:44` (`pick`),
  `deck/server-routes.mjs:174-180` (`/api/items`), `:189-192` (the thread page) and
  `deck/store-items.mjs:237` (`threadIn`, every reply and reopen); in lists by `noticesOf` (`items.mjs:152`), the
  history pages (`ui/render-pages.mjs:278,379`) and the reports tab (`ui/render-rail.mjs:383`).
- Items reference tickets by `item.ticket` and `mergedInto` (`items.mjs:652-669`); `deck.seq` is a global counter
  on replies, not array position; `findLast`/`slice(-n)` (`read.mjs:50`, `items.mjs:426`) read array order as time.
- Ages on 2026-10-17: closed over 30 days 2 items; over 14 days 489 (1.6 MB); over 7 days 982 (3.0 MB).
- `deck/daemon.mjs:105-160` `main`: the ticking work (usage log, memory log) starts here and never in
  `startDaemon`, which the suite calls (L1 there). `deck/gc.mjs:79` `deckPidNow` finds a serving daemon.
- Test fixtures carry `resolvedAt: '2026-09-…'` in 9 places; an archive pass run on every write would move them.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| atomic write | `atomicWriteFileSync(target, contents, options?)` | the retry and its sleep; alert-switch's own tmp-and-rename | local-substitutable (fs injected) |
| store recovery | `keepBackup(file)`, `noteParsed(file, stat)`, `recoverStore(file, why)`, `isDeck(value)`; `storePid(options?)`, `restoreStore(options?)` in `store-restore.mjs` | the `.bak` rotation, the corrupt-aside naming, the swap | local-substitutable (a temp `PILOT_DECK_DIR`) |
| store archive | `archiveOld(options?)`, `archivedItem(id)` | the eligibility rule, month files, dedupe, write order | local-substitutable (a temp `PILOT_DECK_DIR`) |

Deletion test: removing `store recovery` puts rotation into `writeDeck`, recovery into `readDeck` and the swap
into `bin/pilot.mjs`, three places; removing `store archive` puts the eligibility rule into the daemon and the
lookup fallback into four readers. Both earn their keep. No existing module is shallow enough to fold here.

## 4. Ubiquitous language

- **backup**: `deck.json.bak`, the store a write replaced, always one that parsed.
- **corrupt store**: a deck.json that does not parse or is not a deck; a newer version is not one.
- **set aside**: renamed to a dated sibling that is never overwritten (`-2`, `-3` on a clash).
- **archive**: the month files of closed items moved out of the live store; read by id only.
- **live store**: deck.json.

## 5. Locked decisions

- **L1** The backup is a hard link of the current deck.json renamed onto `.bak`, taken only when the file's
  size and mtime match what this process last parsed; a copy where linking fails. Rejected: copying 5.7 MB per
  write; rotating unconditionally (a corrupt file could then become the backup).
- **L2** Recovery and restore set the old file aside with `backUp`'s link-never-overwrite naming. Rejected:
  overwriting or deleting the bad file (the restore would not be reversible).
- **L3** A version the deck does not read is never recovered from `.bak`; it keeps `unreadableStore`. Rejected:
  treating a downgrade as corruption, which would roll a newer store back silently.
- **L4** The archive pass is called from `daemon.mjs` `main` (start, then a 24 h unref'd timer), never from
  `writeDeck`, so a test process and the CLI never archive. Rejected: the ticket's "on write", which would move
  test fixtures dated September and run inside every post.
- **L5** Archive files first, live store second; a pass dedupes by id. Rejected: the reverse order, where a
  failure between drops the item.
- **L6** `deck.seq`, `deckSeq`, `decks`, `runs`, `records`, `coPilots` and `switches` never leave the live store.
- **L7** QA environment: a scratch deck (`pilot deck --scratch`) with a planted, then corrupted, store, plus
  `npm test` (thread `itm_4c8930fda810`).
- **L8** The retry sleeps with `Atomics.wait`, since the helper is synchronous and CommonJS. Rejected: an async
  helper, which changes seven call sites.

## 6. Assumed decisions

Each was posted on the ticket; all nine were answered by the user on 2026-10-17, every one as the default written here. The verdicts are the pilot's (pass on f781696a: all stand).

- **A1** Retention window: 30 days (`itm_f0d201b2bef2`). Trades an immediate shrink for history kept a month. Rejected: 14 and 7 days.
  Answered: "30 days" (the default), 2026-10-17.

  Verdict: stands — 30 days bounds growth and keeps the month the user reads back.

- **A2** A reply to an archived thread is refused, naming a new thread (`itm_a4fe81f90050`). Rejected: moving it back live, a two-way archive.
  Answered: "Refuse, start a new thread" (the default), 2026-10-17.

  Verdict: stands — a refusal is the smaller seam in store-items.mjs, which gate2-frees-lane also edits.

- **A3** The pass runs at daemon start and daily, keeping open items, notices and referenced tickets (`itm_ebe15a9ab7ab`). Rejected: every write.
  Answered: "Daily, with those rules" (the default), 2026-10-17.

  Verdict: stands — start + daily keeps the September test fixtures untouched.

- **A4** Recovery from `.bak` is automatic and logged (`itm_1514c1c18227`). Rejected: refusal until `pilot store restore`.
  Answered: "Automatic, logged" (the default), 2026-10-17.

  Verdict: stands — auto-recovery matches the user's "thoroughly developed application" ask.

- **A5** `pilot store restore` refuses while a daemon serves (`itm_d80c778a3a13`). Rejected: running live, with a write racing the swap.
  Answered: "Refuse while running" (the default), 2026-10-17.

  Verdict: stands — nothing queued runs restore live.

- **A6** The retry lives in the shared helper, so every caller gains it (`itm_077e467ce551`). Rejected: the store's write only.
  Answered: "Shared helper" (the default), 2026-10-17.

  Verdict: stands — the EPERM pain the user hits is in the hooks' writes too, so the shared helper is where it belongs.

- **A7** One backup generation (`itm_6df28284017c`). Rejected: also a daily `.bak`, seven kept.
  Answered: "One generation" (the default), 2026-10-17, after the user asked where the backups live: every file sits beside deck.json in `~/.claude/pilot/` (`PILOT_DECK_DIR` in tests), none elsewhere.

  Verdict: stands — one generation is enough beside the corrupt-<date> copies.

- **A8** One archive file per month of close (`itm_b72c04d8a762`). Rejected: one growing file.
  Answered: "One per month" (the default), 2026-10-17.

  Verdict: stands — nothing queued (daemon lifecycle, operator tooling) reads the archive.

- **A9** History and the reports tab list live items only (`itm_d56573e64688`). Rejected: reading the archive on render.
  Answered: "Live items only" (the default), 2026-10-17.

  Verdict: stands — archived items stay readable by id (spec 8).

## 7. Out of scope

- Documenting restore in INSTALL.md: Operator tooling (`itm_f520e253fe50`) owns INSTALL.md and runs after this.
- Daemon crash logging, version restarts and the lockfile: Daemon lifecycle (`itm_140d9b3c845c`).
- Searching or browsing the archive in the page; unarchiving.
- Atomic writes for files other than through the shared helper (usage-switch, audit records already use it).

## 8. Slices

Width 3; longest stem 3 (S1 → S4 → S5).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: a corrupt store recovers from its backup | 2, 3 | `deck/store-recovery.mjs` (new), `deck/store-core.mjs`, `deck/test/store-recovery.test.mjs` (new), `deck/README.md`, `scripts/vocabulary.mjs`, `docs/adr/<next>-*.md` (new), `docs/adr/README.md` | – | ts | [S1](slices/S1.md) |
| S2 | The rename retries, and alert-switch writes through it | 1, 5 | `hooks/lib/atomic-write.js`, `hooks/test/atomic-write.test.js` (new), `deck/alert-switch.mjs`, `deck/test/alert-switch.test.mjs` | – | ts, security | [S2](slices/S2.md) |
| S3 | pilot store restore swaps the backup in and back | 4 | `deck/store-recovery.mjs`, `bin/pilot.mjs`, `deck/test/store-restore.test.mjs` (new) | S1 (store-recovery.mjs) | ts, security | [S3](slices/S3.md) |
| S4 | Old closed items move to the month archive | 6, 7 | `deck/store-archive.mjs` (new), `deck/store.mjs`, `deck/test/facades.test.mjs`, `deck/daemon.mjs`, `deck/test/store-archive.test.mjs` (new), `deck/README.md` | S1 (deck/README.md) | ts | [S4](slices/S4.md) |
| S5 | An archived item reads by id and refuses a reply | 8 | `deck/read.mjs`, `deck/server-routes.mjs`, `deck/store-items.mjs` (`threadIn` only), `deck/test/store-archive-read.test.mjs` (new) | S4 (archivedItem) | ts, security | [S5](slices/S5.md) |
| S6 (added) | Restore sees a deck on any port serving this store | 9 | `deck/daemon.mjs`, `deck/store-recovery.mjs`, `deck/test/store-restore.test.mjs` | S3, S4 | ts, security | [S6](slices/S6.md) |

Overlap with runs ahead: gate2-frees-lane touches `deck/store-items.mjs` and `deck/store-runs.mjs`; S5 edits one
function there (`threadIn`) and rebases on it; nothing here touches `store-runs.mjs`. Daemon lifecycle, queued
behind, will rebase on S4's `daemon.mjs` lines. S1's ADR takes the next free number when it lands.

## 9. Acceptance evidence

In the order a user meets it, on a scratch deck (L7):
1. Post twice; `deck.json.bak` holds the first post's store (spec 2).
2. Truncate deck.json; the next page load serves, deck.log names the restore, and `deck.json.corrupt-<date>` holds the truncated bytes (spec 3).
3. Stop the daemon, run `pilot store restore`, then again: the store swaps and swaps back, `deck.json.replaced-<date>` kept; with the daemon up it is refused (spec 4).
4. Plant items closed 40 days ago, start the daemon: they are in `deck.archive-<month>.json`, the open items unchanged in order; `deck_read` finds one; a reply to it is refused (spec 6, 7, 8).
5. `npm test`: the retry, alert-switch and archive-crash tests green (spec 1, 5, 7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 3 |
| S2 | planned | | | | – | 1, 5 |
| S3 | planned | | | | S1 | 4 |
| S4 | planned | | | | S1 | 6, 7 |
| S5 | planned | | | | S4 | 8 |
| store-durability | planned | | | | S1–S5 | 1–8 |
