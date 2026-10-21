# Usage telemetry

Slug `usage-telemetry` · branch `feat/usage-telemetry` · base `origin/main` d5629da

## 1. Problem

The account's usage is visible only as a live status-line reading. Nothing records how
the five-hour and weekly limits moved over time, or what a repository's sessions spent,
so the housekeeping audit estimates every "saving per run" against nothing measured. The
user wants a silent half-hourly log ("not an interface, just something logging it"), and
wants the audit to state its findings against measured data: that log, the per-run
analytics `pilot analytics` already computes, and the closing reports of finished runs,
kept as data rather than as prose in a deck item.

## 2. Spec

One run delivers every line (L15). Agreed by the user on
itm_9e1b27aa3ab0, 2026-09-28, lines 11 and 12 as reworded that day for L11.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | At every half-hour boundary (:00, :30) the daemon appends one JSON line to `<storeDir>/usage.jsonl`: `at`, `window {from,to}`, the status line's `snapshot` (`at` = the file's mtime, `session` and `weekly` as `{pct, resetsAt}`, `decks` as dir to context %) and `tokens` in the five kinds the reader counts, as `total`, `byModel` and `byRepo` | a fixture test's line equals the hand sum; live, a line appears at the next boundary and a one-liner over the same window gives the same `total` |
| 2 | A message counts once, by `message.id` at its largest output, `<synthetic>` skipped (ADR 0042), in the window its first entry's timestamp falls in | a message split over two entries, the second past a boundary, counts once in the first window |
| 3 | Spend is tied to a repository by each entry's `cwd` resolved to its main checkout, so a worktree session counts under its repository | a transcript whose `cwd` is a worktree lands under the main checkout in `byRepo` |
| 4 | A window with no sessions still logs a line, of zeros | test |
| 5 | A missing or malformed snapshot still logs the line, with `snapshot: null` and `snapshotError` `absent` or `malformed`; the daemon stays up | tests with the file absent and half-written |
| 6 | After a restart the next line's window starts at the last line's `to` (at most 7 days back), so windows are contiguous and no tokens fall between lines; the file is only ever appended | two daemon starts in a test give contiguous windows and the first line's bytes unchanged |
| 7 | A tick never holds the event loop longer than one file's parse, and a tick still running when the next is due skips it | stubbed-timer test; `/api/health` answers while a tick reads |
| 8 | The daemon prints the log's path once at start; an append that fails is written to stderr, never thrown | `[deck] usage log <path>` in `deck.log`; a test with an unwritable path |
| 9 | Nothing renders the log: no tab, section, tool or route | `deck/ui` is untouched, and no tool or route names the log (`deck/tools.mjs` and `deck/server.mjs` change for spec 11's `report` alone) |
| 10 | An audit report carries a `measured` block: the log path, its period, the repository's spend over it, and its three newest merged runs' (a `run.json` at HEAD) tokens, tool calls and cost (the same reader and prices as `pilot analytics`); each row shows its saving as a share of a measured run. With no log, `unmeasured` says so and the report still saves | `audit save` refuses a malformed `measured`, and a report with neither `measured` nor a `measured spend:` line in `unmeasured`; a run's tokens in `measured` equal that run's total in `pilot analytics <slug>` |
| 11 | A finished run's closing report is data in its run record in the deck's store: `report` with the feature PR, its state and its merge SHA when it has one, each slice PR and merge SHA, the assumed decisions, the friction rows with evidence, the human steps left and the worktrees left (kept and dropped findings are the record's `findings`), sent by the pilot with the closing report | `deck_status` refuses a malformed `report`; a record test round-trips it through the store |
| 12 | The audit reads the `report` of every finished run's record for the repository in the deck's store and cites at least one friction row as the evidence of a row; with no store or no report it says so and still saves | a report built against the fixture has a row whose `command` is `audit-spend` and whose `output` quotes a friction row |
| 13 | The log is on by default and one command turns it off: `pilot usage off` stops it from the next half hour with no restart, `pilot usage on` resumes it, `pilot usage status` says which; what was spent while it was off is never recorded, nor what was spent between the last half hour and the moment of off (L17), and the install guide names the log, what it records and the command (added 2026-09-28, L14) | tests with the switch off across a tick and across an on; on a scratch deck, a boundary passes with the switch off and no line appears |

## 3. Findings

- `deck/usage.mjs:139` `readUsage(deck)` returns three figures for one deck and never the
  `decks` map; the logger needs the whole snapshot, so it gains a second reader beside it.
- `hooks/context-usage-statusline.js:197-205` writes the snapshot with no timestamp of
  its own and carries `session` and `weekly` forward from the previous snapshot
  indefinitely, so a limit can be days old: hence the file's mtime as `snapshot.at`.
- The `decks` map holds context-window **percentages** per directory (`:175`), not spend:
  it cannot tie spend to a repository. The transcripts' own `cwd` field can.
- `deck/transcripts.mjs` (ADR 0042) is the one reader: `tokenCounts` (five kinds, cache
  write split 5m/1h), `usageOf` (one count per `message.id`), `readTranscript` (sync,
  whole file). `readRun` is by slug; a window reader is new and belongs here.
- `~/.claude/projects` holds 2.5 GB in 2,041 JSONL files; 5 files (6.9 MB) were modified
  in the last 30 minutes. The largest file, 26 MB, parses in 118 ms. An mtime filter plus
  one file per event-loop turn keeps a tick cheap without a worker thread.
- Entries carry `cwd`, `sessionId`, `agentId`, `timestamp`, `message.usage` (checked on
  a live transcript).
- `deck/daemon.mjs:85` `main()` is where startup lives; `startDaemon()` is what tests
  call, so a timer started in `main()` never runs in the existing suite.
- `deck/analytics.mjs:63` exports `costOf`, `:51` `loadPrices`; `mainCheckout` (`:70`) is
  private and synchronous (`execFileSync`), unfit for the daemon.
- `deck/runs.mjs:223` `RECORD_ORDER` and `:250` `recordFields` validate the record;
  `deck/tools.mjs:245` is `deck_status`'s schema; `deck/server.mjs:703` passes its args.
  The record already has `slices[].pr` and `findings` (`kept:`/`dropped:`); it has no
  merge SHAs, assumed decisions, friction, human steps or feature PR state.
- The record's `run.json` mirror is committed on `feat/<slug>` by `pilot integrate`
  (`skills/pilot/SKILL.md:256-267`); the closing report is posted after the merge
  (`:378`), so a `report` sent then would never reach main (A1).
- The same timing leaves `finished` off most committed records: 2 of the 6 `run.json` on
  main carry it. So "a finished run" for the audit is a `run.json` at the repository's
  HEAD, which on the default branch means merged, not one whose `finished` is set.
- The deck store holds 4 past closing reports as Markdown `report` items.
- Records live in `deck.records`, one per repository and slug (`deck/store.mjs:1261-1279`);
  that upsert is the only write to it, so `MAX_RUNS` and the 48-hour staleness prune
  `deck.runs` alone and a finished record is never removed (explorer, one claim checked
  by the pilot, 2026-09-28). This machine holds 9 records for this repository, 4 finished.
- `recordFor(repo)` (`deck/store.mjs:1288`) returns only a repository's newest record;
  nothing returns all of them, and no script outside the daemon reads the store today.
- The daemon is spawned detached with `env: process.env` (`deck/client.mjs:145-148`), so it
  keeps the environment of whichever session started it and a variable set later never
  reaches it (explorer, checked by the pilot, 2026-09-28). Its settings are three
  environment variables and `deck.json`; no `pilot` verb sets a persistent option today.
- `deck/audit.mjs:17` enumerates `AREAS`; `deck/test/audit-pick.test.mjs:146` requires the
  fixture to plant an item for every area file. A new area file costs both.
- `scripts/audit-context.mjs` is the pattern for a deterministic, JSON-only audit script.
- No database: every store here is a file. **No migrations.**

## 4. Ubiquitous language

- **Usage log**: `<storeDir>/usage.jsonl`, append-only, one **line** per tick.
- **Window**: the half-open interval `[from, to)` a line's tokens were counted over.
- **Snapshot**: the status line's `context-usage-state.json` as read at the tick.
- **Measured spend**: a repository's summed `byRepo` tokens over a period of the log.
- **Closing report data**: the run record's `report` field, in the deck's store; the
  Markdown item stays.

## 5. Locked decisions

| | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | A timer in the daemon, started in `main()`, `unref`'d | the daemon is already the one process per machine (ADR 0005) and outlives sessions | a Windows scheduled ticket: a second installer and a second process to keep alive |
| L2 | JSONL, one file, never rotated | a line per tick is about 2 KB, 35 MB a year; append is atomic enough for one writer | CSV: nested `byModel`/`byRepo` do not flatten |
| L3 | A new `readWindow` in `deck/transcripts.mjs`, reusing `tokenCounts` and the once-per-id rule | ADR 0042: one reader | a second reader in the logger |
| L4 | Walk files by mtime ≥ `from`, attribute a message to its first entry's timestamp | reproducible by hand; a message streams for seconds, so a boundary splits almost nothing | tailing by byte offset: state across restarts, and the draft's evidence cannot be hand-checked |
| L5 | Async reads, one file per event-loop turn, no worker | 118 ms worst case measured | a worker thread: a second module boundary for a 118 ms parse |
| L6 | Spend per repository from each entry's `cwd`, resolved by async `git rev-parse --git-common-dir` with a timeout, cached for the daemon's life; a failed resolve keys the `cwd` itself | worktree sessions belong to their repository | the snapshot's `decks` map: it holds percentages |
| L7 | Windows are aligned to half-hour boundaries of epoch time and contiguous across restarts | lines compare across days; no token is lost to downtime | a fixed 30-minute window from start: gaps on every restart |
| L8 | The audit's measured spend is a `measured` block in the report, gathered by a new `scripts/audit-spend.mjs` the auditor runs before the areas | spend is the baseline every row is stated against, not a finding | a new `spend` area: an `AREAS` entry and a planted fixture for no row of its own |
| L9 | Per-run figures come from `readRun` and `costOf`, the functions `pilot analytics` prints | equal by construction | parsing `pilot analytics` Markdown |
| L10 | `report` is one validated field of the run record, sent with `deck_status` | the record is the run's durable state (ADR 0028) and is already mirrored | a second file beside `run.json` |
| L11 | Closing report data lives in the deck's store only; the pilot sends `report` in the `deck_status` call that sets `finished`, and the audit reads the store through a new read-only `recordsFor(repo)`. Decided by the user on itm_0c7bbb6f700e, 2026-09-28, against the pilot's recommendation | a smaller change, and the report can hold the feature's merge SHA; the store never prunes a record | the repository's `run.json`, committed before the merge: survives losing the machine and travels with a clone, which this gives up, so an audit on another machine has no reports |
| L12 | Grilling depth `forks`. Decided by the user on itm_93ae65faffc2, 2026-09-28 | | `every` |
| L13 | The feature ships to every install of the plugin. The user on itm_9e1b27aa3ab0, 2026-09-28: "at one point i think i said i only wanted this feature on my machine. i actually think anyone should have it." | the audit is measured wherever the plugin runs | a build for this machine alone |
| L14 | The log is on by default with an off switch, and the install guide says so. Decided by the user on itm_59e1629749f1, 2026-09-28 | every install is measured unless its owner says otherwise | no switch: a person cannot stop a record of their usage; off until turned on: most installs stay unmeasured |
| L15 | One run for all slices. Decided by the user on itm_4210f7671b22, 2026-09-28, against the pilot's recommendation | one walkthrough and one merge | two runs in sequence: shorter runs and a usable log sooner, which this gives up |
| L16 | QA runs against a scratch deck: the feature's daemon on a spare port with `PILOT_DECK_DIR` an empty store, reading the real `~/.claude/projects` transcripts read-only; the walkthrough uses the same one. No database, no migrations. Decided by the user on itm_182ac501db65, 2026-09-28 | the live deck is this run's inbox and is never restarted by the feature | the live deck: real from the first minute, but it goes down during QA |
| L17 | Once the switch is off the deck appends nothing, so the spend between the last half-hour boundary and the moment of off is not recorded. Decided by the user on itm_ca94fe810dc1, 2026-09-28, on the pilot's recommendation, after S8's reviewer raised it | off means no further write and no transcript read; up to half an hour of spend is lost each time the log is turned off | one last line covering the boundary to the moment of off: a complete count, but a write after the user said off |
| L18 | The auditor's copied block gains `runs` in S7, not S6. Decided by the user on itm_edee9b2c1b5e, 2026-09-28, after S6's edit of `agents/pilot-auditor.md`, a file it did not own, was denied | the word lands with the slice that owns the file | the user editing it by hand; leaving `runs` out of the audit |
| L19 | Amends L6's fallback. A directory git cannot answer for because it no longer exists is looked up in the run records' worktrees, then by its folder name (`<repo>-<something>` beside a living repository); anything else keys the `cwd` itself. Decided by the user on itm_7dc91a067dc6 ("Fix before Gate 2") and itm_e8cbbd561b83 ("Run records first, then the folder name"), 2026-09-29, after the principles review measured 9.6% of seven days' tokens under removed worktrees (F11) | the per-repository split and the audit's measured spend count removed worktrees; a deleted folder that only shares a repository's name prefix is counted under it | run records only: never guesses, but the deck keeps three runs per repository; folder name only: less code, misses what a record names exactly; accepting the limit |

## 6. Assumed decisions

| | Default taken | Tradeoff | Asked |
|---|---|---|---|
| A1 | Withdrawn: the user chose the deck store (L11) | | answered |
| A2 | Past closing reports are not converted | 4 old runs are invisible to the audit's spec 12 | pilot, asked |
| A3 | Withdrawn: the spec was agreed (§2) | | answered |
| A9 | Withdrawn: answered, now L14 | | answered |
| A11 | The switch is a file of its own, `<storeDir>/usage-log.json`, written by `pilot usage on\|off` and read at every tick | one more file in the store; rejected: an environment variable (never reaches a running daemon), a key in `deck.json` (the verb would race the daemon's writes), the deck page (spec 9) | pilot |
| A12 | The off period is never backfilled: the first window after on starts when it was turned on | spec 6's contiguity holds only while the log is on | pilot |
| A10 | Withdrawn: answered, now L16 | | answered |
| A4 | Withdrawn: the user chose one run (L15) | | answered |
| A5 | The window reaches back at most 7 days after downtime | a longer outage loses its tokens; a longer reach reads more of the 2.5 GB | architect |
| A6 | `measured.runs` covers the three newest finished runs | fewer runs, noisier baseline; more, a slower audit | architect |
| A7 | Withdrawn: answered, now L12 | | answered |
| A8 | `deck.records` stays uncapped | one record per slug is a few KB; a cap would drop the reports L11 keeps | pilot |

## 7. Out of scope

Any rendering of the log (spec 9); rotation or pruning; backfilling windows older than 7
days; reconciling the log against Claude Code's `cost-state` (ADR 0042 records the gap);
changing the audit's ranking weights (L6 of housekeeping-audit); converting past reports;
a new audit area.

## 8. Slices

| Slice | Spec | Files owned | After | File |
|---|---|---|---|---|
| S1 Walking skeleton: a line of totals every half hour | 1 (window, `total`), 2, 4, 8, 9 | `deck/telemetry.mjs` (new), `deck/transcripts.mjs`, `deck/daemon.mjs`, `deck/test/telemetry.test.mjs` (new), `deck/test/fixtures/telemetry/` (new) | – | [S1](slices/S1.md) |
| S2 The line carries models, repositories and the snapshot | 1, 3, 5 | `deck/telemetry.mjs`, `deck/transcripts.mjs`, `deck/usage.mjs`, `deck/test/telemetry-line.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 Restarts leave no gap and a tick never stalls the deck | 6, 7 | `deck/telemetry.mjs`, `deck/test/telemetry-resume.test.mjs` (new) | S2 | [S3](slices/S3.md) |
| S4 A closing report is data in the run record | 11 | `deck/runs.mjs`, `deck/tools.mjs`, `deck/server.mjs`, `deck/test/record-report.test.mjs` (new), `skills/pilot/SKILL.md`, `agents/pilot.md` | – | [S4](slices/S4.md) |
| S5 The audit states the measured spend | 10 (log, period, spend) | `scripts/audit-spend.mjs` (new), `scripts/test/audit-spend.test.mjs` (new), `deck/audit.mjs`, `deck/test/audit-measured.test.mjs` (new), `agents/pilot-auditor.md` | S3 | [S5](slices/S5.md) |
| S6 The audit carries the latest runs' figures | 10 (runs, share per row) | `scripts/audit-spend.mjs`, `scripts/test/audit-spend-runs.test.mjs` (new), `deck/audit.mjs`, `deck/test/audit-share.test.mjs` (new) | S5 | [S6](slices/S6.md) |
| S7 The audit cites the closing reports | 12 | `deck/store.mjs`, `deck/test/records-for.test.mjs` (new), `scripts/audit-spend.mjs`, `scripts/test/audit-spend-reports.test.mjs` (new), `agents/pilot-auditor.md` | S4, S6 | [S7](slices/S7.md) |
| S8 The log can be turned off | 13 | `deck/telemetry.mjs`, `deck/usage-switch.mjs` (new), `bin/pilot.mjs`, `deck/daemon.mjs`, `deck/test/usage-switch.test.mjs` (new), `docs/INSTALL.md` | S3 | [S8](slices/S8.md) |
| S9 Spend from a removed worktree counts under its repository | 3 | `deck/telemetry.mjs`, `deck/test/telemetry-line.test.mjs` | S8 | [S9](slices/S9.md) |

S8 was added by the pilot on 2026-09-28 for L14; it shares no file with S5, so the two run
at once after S3.

Seven slices are over the one-run bound and the architect proposed two runs, R1 (S1 to S3)
and R2 (S4 to S7). The user chose one run (L15), so the table below is the order within it:

| Part | Slices | Spec | After |
|---|---|---|---|
| The half-hourly log | S1, S2, S3, S8 | 1–9, 13 | – |
| The audit reads measured data | S4, S5, S6, S7 | 10–12 | S3 (S5 reads the log's line shape) |

S4 has no edge into S1 to S3 and owns no file they or S5 or S6 own, so it runs beside S1
from the start.

## 9. Acceptance evidence

The log, on the machine running the deck:

1. Restart the deck; `deck.log` shows `[deck] usage log <path>` (spec 8).
2. The deck page is unchanged (spec 9).
3. At the next :00 or :30 a line appears; its `window` is the half hour before, its
   `snapshot.at` the status file's mtime, its `byRepo` naming this repository, and a
   one-liner over the same window's transcripts gives the same `total` (spec 1–3).
4. Stop the deck across a boundary, start it again: the next line's `from` is the last
   line's `to` (spec 6).
5. Rename the status file: the next line has `snapshot: null`, `snapshotError: absent`,
   and the deck still answers (spec 5).
6. Run `pilot usage off`, wait for a boundary: no line appears. Run `pilot usage on`: the
   next line's `from` is the time it was turned on (spec 13).

The audit, in a repository with a log and a finished run:

7. Finish a run: its record in the deck's store holds `report` (spec 11).
8. Run `/pilot:audit`: the posted item names the log path and period, the three newest
   runs' tokens and cost matching `pilot analytics <slug>`, each row's share of a run,
   and one row citing a friction row (spec 10, 12).
9. With `PILOT_DECK_DIR` pointing at an empty directory, the audit still posts, and
   Unmeasured says `measured spend: no usage log` (spec 10).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 Walking skeleton: a line of totals every half hour | planned | | | | – | 1, 2, 4, 8, 9 |
| S2 The line carries models, repositories and the snapshot | planned | | | | S1 | 1, 3, 5 |
| S3 Restarts leave no gap and a tick never stalls the deck | planned | | | | S2 | 6, 7 |
| S4 A closing report is data in the run record | planned | | | | – | 11 |
| S5 The audit states the measured spend | planned | | | | S3 | 10 |
| S6 The audit carries the latest runs' figures | planned | | | | S5 | 10 |
| S7 The audit cites the closing reports | planned | | | | S4, S6 | 12 |
| S8 The log can be turned off | planned | | | | S3 | 13 |
| S9 Spend from a removed worktree counts under its repository | planned | | | | S8 | 3 |
| feature Usage telemetry | planned | feat/usage-telemetry | | | | 1–13 |
