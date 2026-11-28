# The deck's store is portable, with export and import

Ticket `itm_d9b831208266` · slug `portable-store` · base `main` at 69e315c · design branch `design/portable-store`

## Overview

- **What changes**: The deck's saved state no longer names this computer's folders, and two commands move it to another computer.
- **Why**: Moving the state by hand broke whenever the user name or drive differed, and secrets travelled in the copy.
- **What you'll notice**: One export on the old machine, one import on the new; threads, queue and chat read as before.
- **Can it be undone**: One-way for the saved state. It upgrades in place, with a backup kept beside it. An older plugin refuses it.

## 1. Problem

"Make the system more plausible to export and transfer the state, and we can think about syncing later";
"restructure so that stuff doesn't get in the way, the absolute paths and whatnot". On 2026-11-21 the store was
moved desktop → laptop by hand (a zip, `deck.json` dropped over the laptop's). It read only because the Windows
user name matched; the session open on the laptop lost its run, landings and lanes named a foreign pid and
worktrees, and secrets rode in the zip unless left out by hand.

## 2. Spec

Each line: the behaviour, *evidence*, **bar**. "A copy of the real store" means the live `~/.claude/pilot` copied
into a scratch home (`PILOT_DECK_DIR`), never the live store itself.

1. No absolute path in a structured path field or path-keyed map of the store; each is `@<root>/<rel>` against
   the machine's roots. *A scan of a migrated copy of the real store over the fields of §3 F2:* **0** drive or
   home paths; **every** item and record resolves its repo; the distinct stored repo spellings equal the
   distinct `pathKey`s before (29 spellings today collapse to one per repo). Prose fields keep their text (A1).
2. Machine-bound state (run sessions, pids, co-pilot leases, lane switches, a ticket's live flag, a landing's
   pid, root overrides) lives in `machine.json`, beside the existing `deck.secret` and `deck.pid` (A4); nothing
   in `deck.json` names any of them. *A test deletes `machine.json` from a scratch store:* the deck starts,
   writes a new one, and **every** thread, ticket and chat reads as before; `deck.json` holds **0** `pid`,
   `session` or `lastSeenAt` keys.
3. The existing store is migrated in place to version 4, the backup written first. *A copy of the real store
   (about 3,300 absolute paths) migrated:* the backup `deck.v3-<date>.json` is byte-equal to the store before;
   the scan of spec 1 reads **0**; item and record counts are **equal** before and after; month archives and
   audit directories are migrated the same way with **one** backup each; a second start changes **0** bytes.
4. `pilot store export [<file>] [--logs]` writes one bundle of the portable part, never `machine.json`,
   `deck.secret`, `deck.pid` or a backup. *A scratch store exported:* the bundle holds **0** occurrences of the
   secret's value and **0** `pid` keys; its manifest counts equal the store's; with `--logs` it is larger by at
   least the size of `deck.log`.
5. `pilot store import <bundle> [--root <name>=<path>]... [--replace] [--dry-run]` unpacks a bundle on another
   machine: `home` maps to this home, a drive root to the same drive, any other root must be given; it writes a
   fresh `machine.json`; it refuses over a non-empty store without `--replace`, and while a deck serves. *A
   bundle imported into a second scratch home with a different home path:* the deck opens **every** thread, the
   ticket queue in order and the chat; a second import without `--replace` exits non-zero and leaves the
   store's bytes **unchanged**; a crafted bundle (an entry name with `..`, a stored path escaping its root, an
   absolute path, a newer store version, a checksum mismatch) exits non-zero and writes **0** files.
6. No sync: nothing copies the store on its own. *§7 names sync; a grep of the feature diff finds **0**
   timers, watchers or hooks that run export or import.*
7. ADR 0207 L2 ("nothing syncs, exports, imports or commits the store") is reworded to exportable by hand, not
   synced, with why. *The ADR's diff on the feature branch, **one** bullet changed, named at Gate 1.*
8. An imported store carries no live state of the old machine (A3): runs have no session, lanes and co-pilot
   leases are released, a landing running or queued reads `interrupted on <host>`. *A copy of a store with a
   running landing, exported and imported:* **0** waits on a foreign pid; the landing's line names the source
   host; the landing item's state reads `interrupted` (**1** of 1).
9. Export lists what is not on the remote (A2: lists, never refuses): for each open run, a worktree that exists
   here with uncommitted changes or commits not on its upstream, and a landing in flight. *A scratch repo with
   **one** unpushed commit on a run's worktree:* export prints that worktree and the count **1**, and still
   writes the bundle (exit 0).
10. After an export, the exporting deck warns that the queue may now be owned elsewhere (A3). *After `pilot
    store export` on a scratch store:* `pilot doctor`'s `exported` row names the time, and the next deck start
    posts **one** notice item; a second start posts **0** more.
11. Import prints one rebuild command per open run whose worktree is missing here (A3). *The import of spec 8:*
    **one** `git -C <repo> worktree add <worktree> <branch>` line per such run, and **0** worktrees created.
12. practitioner: backup-tool author (restic, `pg_dump`). The bundle carries a manifest (format, store version,
    source host, counts, a sha256 per entry) and `--dry-run` prints what an import would write without writing.
    *A round trip export → import → export of a copy of the real store:* the two manifests' counts are **equal**;
    `--dry-run` writes **0** files.

Field note (itm_09fb851511e2 reply) → spec: folded in as 8 (import marks gone), 9 (export lists unpushed),
10 (exported mark), 11 (rebuild commands, printed not run). Left out (§7): a gate2 surviving a run-record
commit (`scripts/land.mjs`, its own ticket), merging two queues, rebuilding worktrees automatically.

## 3. Findings

- F1 The store: `deck/store-core.mjs` (774 lines; facade bar 800). `STORE_VERSION = 3` at :49; `readDeck`
  refuses a newer version (:162), backs up the raw bytes as `deck.v<n>-<date>.json` through `backUp` (:231,
  link-never-overwrite) and calls `upgradeStore` (:191) for an older one; `writeDeck` (:296) goes through
  `refuseGateHomeWrite`, `keepBackup` (`deck.json.bak`) and `atomicWriteFileSync`. No file lock: the daemon is the
  one writer by convention; `pilot store restore` (`deck/store-restore.mjs`) refuses while a deck serves, through
  `storePid` reading `deck.pid` and `/api/health`.
- F2 Measured on this machine's store (967 items, 161 records): 3,290 absolute-path strings. Structured, ~2,590:
  `records[].record.slices[].worktree` 1021, `items[].repo` 966, `records[].repo` 161, `record.worktree` 149,
  `report.worktreesLeft[]` 76, `items[].dir` 60, `qa.worktree` 40, `runs[].repo` 1, `added[].repo`; map keys of
  `decks`, `coPilots`, `switches`, `budgets`. Prose, ~700: `replies[].text` 210, `body` 190, `url` 95, `title`
  86, `landing.line` 38, `screens` 37, friction ~45.
- F3 Repo identity is one function, `pathKey` (`hooks/lib/platform.js:49`: resolve, cached realpath, lower-case
  on win32), aliased `repoKey`/`sameRepo` (`deck/items.mjs:21,542`) and `samePath` (`hooks/lib/deck.js:242`).
  Map keys and `records[].repo` are stored folded; `items[].repo`, `runs[].repo`, worktrees and `added[]` raw.
  `registerRun` dedupes on raw `existing.repo === run.repo` (`deck/store-runs.mjs:475,483`): two spellings of
  one repo make two runs.
- F4 Machine-bound in `deck.json`: `runs[].pid/session/lastSeenAt` (liveness asked of the OS, `deck/runs.mjs:10`),
  `coPilots` (lane lease, `store-runs.mjs:382`), `switches` (lane handovers tied to live holders,
  `store-tickets.mjs:188`), `items[].live`, `items[].landing.pid`. Portable: items, `seq`, `records`, `decks`,
  `deckSeq`, `budgets`, `added`, `grantsStamped`, runs' slice tables.
- F5 Store-dir files: `deck.secret` is read by 14 modules through `hooks/lib/deck-secret.js` and by the Rune
  client (`deck/rune/src/client.rs:138`), regenerated when missing; `deck.pid` is `<pid> <port>`, read by
  `launch.mjs:66` and `store-restore.mjs:25`. The port is stored nowhere: `PILOT_DECK_PORT` or 4321
  (`deck/tools.mjs:50`). Portable besides `deck.json`: `deck.archive-YYYY-MM.json` (closed items, carry `repo`),
  `audits/<dir>/` (named from a hash of the folded absolute repo, `deck/audit.mjs:244`), `rune-deck.json` (UI
  prefs). Logs: `deck.log`, `classifier.log`, `usage.jsonl`, `memory.jsonl`, `logs/`, `wrapper.log`. Machine:
  `deck-open.html` (embeds the secret), `start-settings.json`, `reach.json`, `command/`, `rules-root/`, `live/`,
  `landings/`, `defender-advised.json`.
- F6 The CLI: `bin/pilot.mjs` dispatches `pilot store restore` at :555; `store export`/`store import` sit beside
  it. No archive dependency (`package.json`: only `@modelcontextprotocol/sdk`); `node:zlib` unused so far.
- F7 Tests isolate through `deck/testUtils.mjs` (a temp home per file); the gate's home-store guard is
  `PILOT_GATE_HOME_STORE` (`deck/store-dir.mjs`); `backUp` does not pass through it (store-core.mjs:231).
  Existing store tests: `deck/test/store-upgrade.test.mjs`, `store-v3.test.mjs`, `store-archive*.test.mjs`,
  `store-restore.test.mjs`.
- F8 (re-cut, 2026-11-28) `encodePath` resolves before it encodes (`deck/store-codec.mjs` `spelled`), so a win32
  path reads back with backslashes whatever it was given: 177 live items carry `C:/Users/jrylk/Projects/pilot`
  and will read `C:\...`. The Rune keys a repo's ticket folds on the API's repo string
  (`deck/rune/src/regions/tickets.rs:244,602`); the live `rune-deck.json` fold key is already native. Two Rune
  tests keyed on `C:/work/alpha` went red on feat at 697d10d (S9).

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Store codec `deck/store-codec.mjs` (new) | `encodePath(abs, roots)`, `decodePath(stored, roots)`, `toStored(deck, roots)`, `fromStored(stored, machine, roots)`, `upgradeV3(deck, roots)` | every path field and path key of F2, the machine split of F4, the v3→v4 rewrite; today spread over ~40 raw readers | in-process (pure) |
| Machine file `deck/machine.mjs` (new) | `readMachine(dir)`, `writeMachine(dir, machine)`, `rootsOf(machine, home, platform)` | roots defaults (`home`, one per drive or `/`) and overrides, sessions, leases | local-substitutable (a temp dir) |
| Store persistence `readDeck`/`writeDeck` (existing) | unchanged | calls the codec on read and write; callers keep absolute paths in memory | local-substitutable |
| Bundle `deck/store-bundle.mjs` (new) | `packBundle(dir, { logs })`, `unpackBundle(buffer)` | the allowlist of entry names, manifest, sha256, gzip bound | in-process (pure over bytes) |
| Store move `deck/store-move.mjs` (new) | `exportStore(argv, deps)`, `importStore(argv, deps)` | CLI parsing, the remote check, refusal rules, roots mapping, marking gone | true external (git, a live deck) behind `deps` |

Deletion test: deleting the codec puts path handling back into ~40 readers (F3), so it earns its keep; the
machine file seam has two adapters (a real dir, a test's temp dir). `store-restore.mjs` stays as it is: its
`storePid` is reused by name, not folded.

## 4. Ubiquitous language

- **bundle**: the one file `pilot store export` writes and `pilot store import` reads. Not "archive", which is
  the month archive (`deck.archive-YYYY-MM.json`).
- **root**: a named absolute directory of this machine (`home`, `drive-c`, `/`, or one given with `--root`).
- **stored path**: `@<root>/<rel>` with `/` separators, never `..`; what `deck.json` holds.
- **machine file**: `machine.json`, the machine-bound state of F4 plus root overrides.
- **portable part**: the store-dir entries a bundle may carry (L4), nothing else.

## 5. Locked decisions

- L1 The codec sits at the persistence seam: in memory the deck keeps today's absolute paths and folded keys;
  only `deck.json`, month archives and audit dir names hold stored paths. Rejected: rewriting ~40 readers to
  carry root-relative paths (wide diff, every reader a migration risk).
- L2 Stored form is a string `@<root>/<rel>`, not an object, so every field keeps its type. Encoding resolves
  through the realpath when the path exists, so spellings collapse; decoding re-folds map keys with `pathKey`.
  Rejected: objects `{root, rel}` (every reader's type changes). The realpath clause is narrowed to case by A8.
- L3 Default roots are derived, not stored: `home` and one per drive (`drive-c`) or `/`; so a lost machine file
  loses no path. Only `--root` overrides are stored. Rejected: a root per repo parent dir (dozens, from leaked
  test scratch dirs).
- L4 The bundle is one gzipped JSON document `{ manifest, entries }`, entry names held to an allowlist
  (`deck.json`, `deck.archive-YYYY-MM.json`, `audits/<name>/record.json`, `rune-deck.json`; with `--logs` also
  `deck.log`, `classifier.log`, `usage.jsonl`, `memory.jsonl`); decompressed size bounded. No archive library,
  no extraction path: a name outside the allowlist is refused, so traversal cannot be expressed (A5).
- L5 Import trusts nothing it did not write: every stored path decodes under a root with no `..`, no absolute
  structured path, store version ≤ 4, every sha256 matches, `deck.json` passes `isDeck`; all checks run before
  the first write, and the write is staged then renamed. `--replace` sets the old store's portable files aside
  under `replaced-<date>/` (link-never-overwrite, as store-durability L2).
- L6 Version 4 is one-way like v3: an older plugin refuses it (F1); `deck.v3-<date>.json` is the way back.
- L7 Export reads the store files as they are on disk (atomic renames make each file whole) and needs no daemon;
  import refuses while one serves (`storePid`). The exported mark is its own machine-only file `exported.json`,
  so the CLI never races the daemon on `deck.json`.
- L8 The run's ADR is `docs/adr/0230-portable-store.md` (ADR 0230); ADR 0207's "No store sync" bullet is
  reworded to point at it.

Gate 1 walk, each closed on its recommended default by the deck at 2026-11-23T01:23Z, not the user's press:
L1 itm_9bdd9beb23a3; L2 itm_357c05a04599; L3 itm_bdc94d6d8d7a; L5 itm_9d84c92311fe; L6 itm_05903f711416;
L7 itm_dff14db22111; L8 itm_5156b85885e2; L4 had no walk item, A5's question (itm_ca8d6770d745) covered it.

## 6. Assumed decisions

- **A1** Prose keeps its absolute paths (body, replies, titles, urls, screens, landing lines): ~700 stay visible.
  Rejected: rewriting the user's and agents' words, irreversible. Question itm_2c3e775b59bc: closed "Keep prose verbatim", a deck default after 20 min with no answer, not the user's press.
  Verdict: stands — deck default on itm_2c3e775b59bc, not the user; rewriting their words is irreversible and no queued ticket reads a path out of prose
- **A2** Export lists unpushed work and never refuses. Rejected: refusing, which blocks a move when the source
  machine is the one that must go. Question itm_e66f243e265a: closed "List and export", a deck default after 20 min with no answer, not the user's press.
  Verdict: stands — deck default on itm_e66f243e265a, not the user; the real move of 2026-11-21 lost unpushed work silently, and a list answers that without blocking a failing machine
- **A3** Behaviours 8-11 are in this ticket. Question itm_ed56db958bf6: closed "All four", a deck default after 20 min with no answer, not the user's press.
  Grilling depth itm_6f2ecf72643f: closed "Every", the same way.
  Verdict: stands — deck default on itm_ed56db958bf6, not the user; behaviours 8-11 are the field note's breakages, and no queued ticket covers them
- **A4** `deck.secret` and `deck.pid` stay their own files; `machine.json` takes the rest (spec 2 reworded from
  "one machine file"). Trade: three machine files, not one; gain: no change to the 14 secret readers, the hooks
  or the Rune client. Rejected: moving the secret into `machine.json`. Question itm_2a13a6f2258a: closed "Keep them separate", a deck default after 20 min with no answer, not the user\'s press.
  Verdict: stands — deck default on itm_2a13a6f2258a, not the user; no queued ticket moves the secret or the pid file
- **A5** The bundle is gzipped JSON, not a zip. Trade: opened with `gunzip`, not a double-click; gain: no
  dependency and no extraction path to attack. Rejected: zip via a library or hand-written tar. Question itm_ca8d6770d745: closed "Gzipped JSON", a deck default after 20 min with no answer, not the user\'s press.
  Verdict: stands — deck default on itm_ca8d6770d745, not the user; it fits their standing preference against new dependencies
- **A6** A repo cloned at a different place under home than on the source is out: `--root` remaps whole roots only.
  Rejected: a per-repo remap flag. Question itm_a796f98cfb42: closed "Out: remap whole roots only", a deck default after 20 min with no answer, not the user\'s press.
  Verdict: stands — deck default on itm_a796f98cfb42, not the user; both of their machines share one user name and layout
- **A7** QA runs in scratch homes (`PILOT_DECK_DIR`) on a copy of the real store and two different home paths,
  never the live store; the live store migrates only when the user upgrades after Gate 2.
  Rejected: QA on the live store. Question itm_35e3a9c9a548: closed "Scratch homes, real-store copy", a deck default after 20 min with no answer, not the user\'s press.
  Verdict: stands — deck default on itm_35e3a9c9a548, not the user; the live store holds every run and is never the test bed
- **A8** L2 narrowed to case (S1 CI fix f5230910). The realpath's spelling is taken only where it differs from the
  given one by case (`projects` stores as `Projects`); a junction, symlink, 8.3 name (`RUNNER~1`) or macOS `/var`
  keeps its given spelling and reads back as it, since the full realpath changed a worktree's spelling across a
  store round trip (CI at fae3569). Map keys still collapse (`pathKey` in memory); a field such as `items[].repo`
  given in two link spellings stores two. Only a path
  absolute in the roots' own flavour is encoded; anything else is stored and read back as it is. Windows
  consequence (L2 either way, F8): a repo reads back native (`C:\work\alpha` for `C:/work/alpha`), so the API's
  repo spelling is native and a Rune fold saved under a forward-slash spelling resets once after the upgrade.
  Audit folder names take the full realpath (`realOf`, the macOS link fix 4364c19), so a link and its target
  share one folder; stored paths keep A8's case-only rule.
  Rejected: L2 as signed, the realpath always (~15 test files move to real paths; a restart re-spells
  worktrees; not undoable for a migrated store). Question itm_ad2385df32fa (2026-11-25): closed "B: collapse case
  only", a deck default after 20 min with no answer, not the user's press. Re-asked at the re-cut as
  itm_e2c73d1c2d6a (2026-11-28): closed "B: collapse case only", again a deck default after 20 min, not the user's press.

red team: (1) `store-core.mjs` sits at 774 of the 800-line facade bar: S1 and S2 may add at most 10 lines
there, the rest lives in the codec. (2) `backUp` writes beside a guarded home store (F7): S1 routes it through
`refuseGateHomeWrite`. (3) `registerRun`'s raw `===` (F3) would split a run once decoded spellings differ from a
session's cwd: S2 swaps it for `sameRepo`. (4) S4 exporting before S2 lands would carry pids: S4 comes after S2.
(5) Month archives hold `repo` too: without S3 spec 1's scan fails on them, so S3 is a slice, not a follow-up.
(6) A folded key decoded on a case-sensitive machine could miss the real case: L2 stores the realpath
spelling, and a cross-OS move is out (§7). It holds under A8: Linux keeps the given spelling, which on a
case-sensitive file system is the real case of any path that exists by that spelling (a symlink `Foo -> foo` is
not folded there).
red team (re-cut, 2026-11-28), attacked: the built S2, S3, S4 diffs and the drift fix against A8. S2 dedupes runs
on `sameRepo` (`pathKey`, realpath), S4 lists worktrees through git on decoded paths: neither reads a stored
spelling, both hold. S3's `directoryFor` hashes `encodePath(repo)`: under A8 a repo reached by two link
spellings gets two audit folders, written into A8 rather than re-cut (L2 accepts two stored spellings; behaviour
2's cross-host pin forbids hashing the win32-lowered `pathKey`). The drift fix holds under L2 and A8 alike (F8).
No built slice is re-cut; S9 is added.
  Verdict: stands — deck default twice (itm_ad2385df32fa, itm_e2c73d1c2d6a), not the user; taking a link's realpath changed a worktree's spelling across a store round trip on CI, and it is what S1 on feat already does

## 7. Out of scope

Sync of any kind, background or scheduled; merging two stores; rebuilding worktrees (11 prints the command);
a gate2 that survives a run-record commit; rewriting prose (A1); moving a Windows store to macOS or Linux;
the hard-coded `~/.claude/pilot` writers that ignore `PILOT_DECK_DIR` (F5 `wrapper.log`, `reach.json`,
`live/`, `logs/`), none of which a bundle carries; cleaning leaked test repos out of the store.

## 8. Slices

Width 5; longest stem 5 (S1 → S2 → S4 → S5 → S6). Re-cut 2026-11-28: S9 added after S1.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The store holds its paths against roots | 1, 3 | `deck/store-codec.mjs` (new), `deck/store-core.mjs`, tests | – | typescript, silent-failure | [S1](slices/S1.md) |
| S2 | Machine state lives in its own file | 2, 8 | `deck/machine.mjs` (new), `deck/store-codec.mjs`, `deck/store-core.mjs`, `deck/store-runs.mjs`, tests | S1 (`store-codec.mjs`, `store-core.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | Month archives and audit folders hold no absolute path | 1, 3 | `deck/store-archive.mjs`, `deck/audit.mjs`, tests | S1 (`encodePath`) | typescript | [S3](slices/S3.md) |
| S4 | One command exports the portable store | 4, 9, 12 | `deck/store-bundle.mjs` (new), `deck/store-move.mjs` (new), `bin/pilot.mjs`, tests | S2 (`machine.json`) | typescript, security | [S4](slices/S4.md) |
| S5 | A bundle imports on another machine and nothing else gets in | 5, 12 | `deck/store-move.mjs`, `deck/store-bundle.mjs`, `bin/pilot.mjs`, tests | S4 (`unpackBundle`, `store-move.mjs`) | typescript, security | [S5](slices/S5.md) |
| S6 | An imported store waits on nothing from the old machine | 8, 11 | `deck/store-gone.mjs` (new), `deck/store-move.mjs`, tests | S5 (`importStore`) | typescript | [S6](slices/S6.md) |
| S7 | The exporting deck warns its queue may live elsewhere | 10 | `deck/exported.mjs` (new), `deck/daemon.mjs`, `deck/doctor.mjs`, tests | S4 (`exported.json`) | typescript | [S7](slices/S7.md) |
| S8 | The ADRs say the store is exportable, not synced | 6, 7 | `docs/adr/0230-portable-store.md` (new), `docs/adr/0207-two-devices.md`, `docs/OPERATING.md` | – | typescript | [S8](slices/S8.md) |
| S9 | The Rune deck keys a repository on the spelling the store answers (added at re-cut) | 1 | `deck/rune/tests/deck/empty.rs` | S1 (`decodePath`, native spelling) | rust | [S9](slices/S9.md) |

Walking skeleton: S1, a copy of the real store read, migrated and read back with every path under a root.
red team: S6 and S7 both touched `deck/doctor.mjs`: spec 8's evidence is now the landing's state, so only S7
edits doctor. S5 and S6 both edit `store-move.mjs`: S6 puts its rewrite in `store-gone.mjs` and adds one call. Other runs: cheap-suite S7 edits `deck/client.mjs` and
S9 daemon tests; this run touches neither file but `deck/daemon.mjs` (S7), so S7 starts from the then base.
Overlaps on origin: archive-page S1 `deck/store-archive.mjs` (our S3); handoff-no-wait S4 `deck/store-runs.mjs`
(S2); stay-awake S3 `bin/pilot.mjs`, `deck/doctor.mjs` (S4, S5, S7); cheap-suite S8 `bin/pilot.mjs` (S4, S5).

## 9. Acceptance evidence

In a scratch home with a copy of the real store: start the deck (migration; backup listed; path scan 0; counts
equal) → delete `machine.json`, restart (every thread reads) → `pilot store export` (unpushed list; bundle; grep
for the secret 0) → `pilot doctor` shows `exported` and the deck shows one notice → in a second scratch home with
another home path, `pilot store import --dry-run`, then import (threads, queue order, chat; interrupted
landing; rebuild lines) → import again without `--replace` (refused, bytes unchanged) → a crafted bundle
(refused, 0 files) → export again (manifest counts equal). The ADR diffs read at Gate 1.

## 10. Status table

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | slice/portable-store-s1 | | | – | 1, 3 |
| S2 | pushed | slice/portable-store-s2 | | | S1 | 2, 8 |
| S3 | pushed | slice/portable-store-s3 | | | S1 | 1, 3 |
| S4 | pushed | slice/portable-store-s4 | | | S2 | 4, 9, 12 |
| S5 | planned | | | | S4 | 5, 12 |
| S6 | planned | | | | S5 | 8, 11 |
| S7 | planned | | | | S4 | 10 |
| S8 | integrated | slice/portable-store-s8 | | | – | 6, 7 |
| S9 | pushed | fix/portable-store-drift | | | S1 | 1 |
| Feature | implementing | feat/portable-store | #149 | | S1-S9 | 1-12 |
