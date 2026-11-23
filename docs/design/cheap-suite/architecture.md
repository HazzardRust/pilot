# cheap-suite: the test suite is cheap enough to never time a landing out

Ticket `itm_52b72e87a2a3`. Grilling depth: forks (L1). Brief: `brief.md`.

## 1. Problem

"still going? why are the tests taking so long?" On 2026-11-22 two signed landings of PR #133 timed out at the deck's
30-minute limit (`deck/landing.mjs:35`) with no test failing (the ticket's count). The user wants the
suite cheaper and each test's worth examined ("maybe dont run as many tests? like we should check how reasonable they
are"), not a higher limit.

## 2. Spec

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | One command prints every test file's time and process starts (node, git, other), slowest first, with totals. | `npm run test:cost`: one row per file the run started (607 today), its table in the S1 report. |
| 2 | Every test group has a verdict the user read before anything changed: kept, merged or cut, what it guards, and for a cut what still guards it. Verdicts are rules, re-applied at build time to tests other runs land meanwhile. | The verdict table below; the user's answer on A1. 0 test deleted that the table does not name. |
| 3 | The tests that stay start fewer processes. *assumed* (A4) | `test:cost` before/after: total spawns ≤ 11,000 and git ≤ 10,000 (from 14,140 / 13,073); `SPAWN_CEILING` = measured + 10%. |
| 4 | The full node suite finishes well inside the limit with other gates beside it. *assumed* (A4) | One timed `npm run test:quiet` with two other full suites live: ≤ 15 min (half the limit; 19.5 min today with one or two beside). |
| 5 | A landing reruns only what green CI did not prove (A2, user: trust a proved tree). | Land tests: a proved tip runs `selected <n> of <m> ... since <tree7>`; an unproved one runs the full suite, naming why. |
| 6 | No protection is lost silently. | Per merging slice: line coverage of the production modules its tests reach not lower, and an assert census not lower except listed exact duplicates; S10: 20 sampled mutants each on `land.mjs`, `sync.mjs`, `integrate.mjs` killed as before. |
| 7 | The Rune deck's build is shared across worktrees and bounded. | A second fresh worktree's `cargo test` builds in < 2 min (7m32s cold today); one target dir instead of 13 GB per worktree. |
| 8 | A selected gate that changes nothing under `deck/` runs no cargo. | Gate test both ways; the skip line in a scripts-only slice gate. |
| 9 | practitioner: Rust build engineers (matklad, "Delete Cargo Integration Tests") — the Rune tests link as one binary. | 172 tests in one target; cold `--no-run` time and size lower than before. |
| 10 | (added, user, itm_52b72e87a2a3) The plugin's version is bumped with this feature. *assumed* (A5) | read: every file that carries the plugin version on feat/cheap-suite reads one version higher than on the base, and they agree with each other. |

Lines 1-9 are main's working spec (accepted 2026-11-22); the bars in 3 and 4 are mine from the measurement (A4).

### Verdict table (spec 2; A1 open)

Measured run, design tip `da9a644`, one or two slice gates beside it: 4971 tests, 1167 s wall, 4161 s summed,
spawns 14,140 (node 788, git 13,073, other 279), `left running: none`.

| Group | Files | Tests | Summed s | Git | Guards | Verdict (default) |
|---|---|---|---|---|---|---|
| Landing e2e: land, sync, integrate, restack, worktrees, branches, release | 72 | 479 | 2302 | 10,378 | every landing path on real git: conflicts, ADR numbering, prune, remote modes; each a field case | kept; 7 duplicate runs merged (S8); land reads remote config once (S6) |
| Deck store, view, tickets | 267 | 2390 | 634 | 531 | the deck's state machine | kept (0.27 s/test) |
| Scripts other | 93 | 498 | 483 | 1319 | CLI verbs, install, checks | kept; `install-command` keeps 1 real `npm install -g` of 10 (S8) |
| Gate and selection | 45 | 265 | 221 | 608 | the gate, census, selection | kept; `test-quiet` tests the reporter, not a nested gate (S8) |
| Hooks | 40 | 502 | 201 | 68 | stop gate, inbox, guards | kept; `inbox` one daemon per file, holds 1.5 s to 0.2 s (S7) |
| Deck daemon and HTTP | 33 | 327 | 169 | 45 | routes, wait, rejoin | kept; injected start budget (S7), one deck per file (S9) |
| Tree and prose pins | 57 | 477 | 150 | 124 | wording that is the product (ADR 0082) | kept |
| Rune deck (Rust) | 25 | 172 | 128 warm | – | the native deck's screens | merged into one binary (S2) |

Cut: none outright. The user's alternatives are on A1.

## 3. Findings

- **F1** `scripts/gate.mjs` already counts every spawn with its owning test file (`count-spawns.mjs`, PILOT_GATE_OWNER) but prints owners only over the ceiling (`spawnLines`, gate.mjs:181); no per-file time exists.
- **F2** Cost is concentrated: top 10 files 24% of summed time, top 40 57%, top 80 79%. Slowest: `land-clear` 166 s, `release` 128 s, `inbox` 105 s, `land` 102 s, `sync` 95 s.
- **F3** git-light-tests (ADR-less, `docs/design/git-light-tests/`) already folded the 45 fixture builders behind `gitFixture` (8,113 git then). Spawns grew back to 13,073 because over half of git is production code under test (its F1), and new landing tests landed since. Fixture work is done; this run does not repeat it.
- **F4** Production git per landing, `GIT_TRACE` on `land-clear` (12 tests): `config --get pilot.remote` 90, `ls-remote --symref origin HEAD` 71 (each also starts `upload-pack`), `reflog show` 142, `status` 85. `runRemote` (`scripts/remotes.mjs:19`) and `remoteDefaultBranch` (`scripts/pilot-branch.mjs:95`) re-ask per call.
- **F5** The Rune step (`cargoStep`, gate.mjs) builds into `deck/rune/target` of each worktree: 7m32s and 7m54s cold in two landings, 13,091 MB per worktree (10 worktrees measured, 130+ GB). It runs on a `--since` gate too (ui-design-workflow S6 log).
- **F6** 25 Rune test files are 25 test executables, each compiling `mod support` and linking the GUI crate.
- **F7** Load dominates: the same suite summed 1896 s in one landing log and 4161 s here. Git starts in ~45 ms quiet (probe: 50 `rev-parse`).
- **F8** `land` already refuses unless the tip's checks are green (`checksGate`, `scripts/checks.mjs:59`, called at `scripts/land.mjs:219`), through the `Host` seam (`deck/host-github.mjs:197`).
- **F9** A `pull_request` run tests GitHub's merge commit; the run API exposes only `head_sha`. The landing's own merge also numbers the ADR, so exact tree equality almost never holds; a tree diff plus selection does. Draft PRs to `main` skip Gate today (`gate.yml` job `if`).
- **F10** Outliers' costs (explorer, static): `inbox` 45 daemon starts; `test-quiet` a nested gate with syntax and ledger passes over the repo; `install-command` 10 real npm installs; `client-rejoin` `START_TIMEOUT_MS` 10 s (`deck/client.mjs:68`); `host-contract` a node copy per stub; `daemon` 25 deck starts.
- **F11** The fourth landing wrote no new log under `~/.claude/pilot/logs` (main's check); not chased here, named for the deck's owner.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/test-cost.mjs` (new) | `costReporter`, `costTable` | per-file timing, joined with `spawnCount` owners | In-process |
| `scripts/count-spawns.mjs` | `spawnCount(file)` | owners split by kind | In-process |
| `scripts/gate.mjs` `cargoStep` | `cargoStep(env, which, platform, selection?)` | target dir, skip rule | Local-substitutable (cargo) |
| `scripts/rune-target.mjs` (new) | `runeTargetDir`, `boundTarget` | the shared dir and its bound | Local-substitutable (fs) |
| `Host` (`deck/host*.mjs`) | `testedTrees(sha)` | check runs and their annotations | True external (GitHub), two adapters |
| `scripts/checks.mjs` | `provenTree({ host, git, sha, base })` | the proof rule beside `checksGate` | In-process over the Host |
| `scripts/select-tests.mjs` | `selectTests({ cwd, since })`, now `changed`, tree `since` | exact tree diff | Local-substitutable (git) |
| `scripts/remotes.mjs`, `scripts/pilot-branch.mjs` | `runRemote(git)`, `remoteDefaultBranch(git)` | one answer per `git` runner | Local-substitutable (git) |

Deletion test: `test-cost` deleted, its join reappears in every slice's evidence; `provenTree` deleted, the rule
reappears in land and any future gate; `rune-target` deleted, the bound reappears in the gate. No new seam has one
adapter except `rune-target`, which is internal to the gate.

## 4. Ubiquitous language

- **Cost table**: `test:cost`'s output, one row per test file: summed seconds, tests, spawns by kind.
- **Proved tree**: the one tree every green Gate job on the exact tip annotated as tested.
- **Delta selection**: the selection of tests reached from what differs between the proved tree and the landing merge.
- **Scenario run**: one expensive call (land, sync, integrate) on one fixture; a merge joins tests sharing one.
- **Shared Rune build**: the one cargo target directory every worktree's gate builds into.

## 5. Locked decisions

- **L1** Grilling depth is forks (the user's press on `itm_08dc85b0abf8`): only A1 and A2 were posted.
- **L2** Measure with the gate's own counter and a reporter, under the gate's caps; rejected: a separate tracer, which would measure a different run.
- **L3** Cheapen before cutting: a test goes only as an exact duplicate run or with its guard named; rejected: cutting by cost rank, which drops field cases.
- **L4** `test:cost` is a gate flag; rejected: a script outside the gate (its concurrency and caps would differ).
- **L5** The shared Rune target lives in `%LOCALAPPDATA%\pilot\rune-target`; rejected: under `~/.claude/pilot` (the deck's store, which `itm_d9b831208266` exports) and per worktree (13 GB each).
- **L6** Rune tests as one binary, `debug = "line-tables-only"`; rejected: `autotests = false` (a new file would silently not run).
- **L7** The proof is read through the `Host` seam from check-run annotations; rejected: job logs (parsing, redirects) and artifacts (download).
- **L8** The run's ADR (`ADR NNNN`, written in S5) amends ADR 0166 L4 and L8: the landing runs the delta selection on a proved tree.
- **L9** Verdicts are rules applied at build time against the then tree, so tests that queued runs land (handoff-no-wait, reply-markdown, archive-page, ui-design-workflow) are judged, never deleted blind.
- **L10** A landing with no proof still runs the full suite, the census and the home-store check unchanged.

## 6. Assumed decisions

- **A1** Test verdicts (posted `itm_c8e56cfbea64`, a fork). Default: keep and cheapen, as the verdict table. Trades the
  larger cut for keeping every field case. Rejected: a slow tier off the local full run; cutting landing e2e to one test per command.
  Verdict: stands — the deck took the default after 20 min with no answer (itm_c8e56cfbea64), not the user; it keeps the ticket's rule that nothing is deleted before the user has seen it
- **A2** Security: the landing trusts a proved tree (posted `itm_2fe6194a937e`). **Answered by the user: "Trust a proved
  tree (default)".** Proof = at least three Gate jobs, all success, on the exact tip, one annotated tree; full when
  the feature touches `.github/`, `package*.json` or a `FULL_TRIGGERS` file. Proves: every test green on three OSes on
  that tree, and reached tests green locally on the delta. Does not prove: a test the selection misses on the delta,
  this machine's environment for unchanged areas, or a test that prints a forged annotation in its own job; the push
  run on `pilot` is the backstop. Draft PRs to `main` get Gate too. Rejected: always full, made fast (~10-12 min).
  Verdict: stands — the user pressed "Trust a proved tree (default)" on itm_2fe6194a937e
- **A3** The shared Rune target is wiped above 400 fingerprint units (about 50 worktree builds). Trades one cold build
  per ~50 worktrees for bounded disk. Rejected: no bound (unbounded growth); a size walk per gate (slow). Not a fork.
  Verdict: stands — the queued prebuilt-Rune ticket itm_ff5ace129388 concerns a plugin install, not the worktree build cache
- **A4** Bars: spawns ≤ 11,000 and git ≤ 10,000; full suite ≤ 15 min with two other suites live. Trades a weaker bar
  than the draft's "far fewer" for one the measured levers reach (F3, F4: most git is distinct scenarios). Not a fork.
  Verdict: stands — 15 min is the ticket's own "under half the 30-minute limit"; no queued ticket sets another bar
- **A5** The version bump of spec 10 is a patch bump (the artefact names no other). Recorded by the co-pilot as assumed; the user asked for "a version bump" (itm_52b72e87a2a3, 2026-11-22). Which files carry the version is S10's to find (last bump: 2530153).

## 7. Out of scope

- Raising `LANDING_TIMEOUT_MS`. Windows Defender or Dev Drive settings for temp dirs (a machine setting, unmeasured; a
  human step if S10 misses spec 4). CI's own wall time beyond what the cuts give it. Rewriting landing e2e as unit tests
  over a git seam. The missing landing log (F11). Prebuilt Rune binaries (`itm_ff5ace129388`).

## 8. Slices

Width 7; longest stem 4 (S1 → S3 → S5 → S10).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | One command prints what each test file costs | 1 | `scripts/test-cost.mjs`, `scripts/count-spawns.mjs`, `scripts/gate.mjs`, `package.json`, tests | – | typescript | [S1](slices/S1.md) |
| S2 | The Rune deck's tests link as one binary | 7, 9 | `deck/rune/tests/**`, `deck/rune/Cargo.toml`, guard test | – | rust | [S2](slices/S2.md) |
| S3 | The gate's Rune tests share one build and skip a change that cannot reach them | 7, 8 | `scripts/gate.mjs`, `scripts/select-tests.mjs`, `scripts/rune-target.mjs`, tests | S1 (`scripts/gate.mjs`) | typescript, security | [S3](slices/S3.md) |
| S4 | A green CI run proves the tree it tested | 5 | `.github/workflows/gate.yml`, `deck/host*.mjs`, `scripts/checks.mjs`, tests | – | typescript, security | [S4](slices/S4.md) |
| S5 | A landing runs only what green CI did not prove | 5 | `scripts/land.mjs`, `scripts/select-tests.mjs`, tests, ADR | S3 (`scripts/select-tests.mjs`), S4 (`provenTree`) | typescript, security | [S5](slices/S5.md) |
| S6 | A landing asks git for its remote once | 3 | `scripts/remotes.mjs`, `scripts/pilot-branch.mjs`, tests | – | typescript | [S6](slices/S6.md) |
| S7 | Hook and client tests share their daemon and stop waiting on fixed budgets | 2, 3, 6 | `hooks/test/inbox.test.js`, `deck/client.mjs`, `deck/test/client-rejoin.test.mjs` | – | typescript | [S7](slices/S7.md) |
| S8 | Script tests drop duplicate landings and nested gates | 2, 3, 6 | five `scripts/test/land*.test.mjs`, `test-quiet`, `install-command`, `cli-wiring` tests | – | typescript | [S8](slices/S8.md) |
| S9 | Deck tests reuse one deck and one fixture per file | 2, 3, 6 | `deck/test/daemon`, `gate2-base`, `landing-recut`, `classifier-log` tests | – | typescript | [S9](slices/S9.md) |
| S10 | The suite is measured cheaper under load | 3, 4, 6, 10 | `scripts/gate.mjs` (`SPAWN_CEILING`), `scripts/test/cost-bars.test.mjs`, `cost-after.txt` | S1 (`test:cost`), S2 (`deck/rune/tests`), S3 (`cargoStep`), S5 (`selectTests`), S6 (`runRemote`), S7 (`inbox.test.js`), S8 (`land-*.test.mjs`), S9 (`daemon.test.mjs`) | typescript | [S10](slices/S10.md) |

red team: (1) S3 and S5 both edit `select-tests.mjs` (`changed`, tree `since`): S5 after S3, not beside it. (2) S1
and S3 both edit `gate.mjs`: chained. (3) S4's `testedTrees` widens the `gh` allowlist, a seam S5 only reads: S5 names
S4's symbol, never restates it. (4) S6's memo can serve a stale default branch inside one land call if a test renames
it mid-call; S6 behaviour 2 pins that a new runner asks again. (5) Spec 4 is at risk if S6-S8 save less than estimated
(F7: load doubles time); S10 says so with numbers and names the Defender step, it does not raise the limit. (6) S7 and S9 reshape `inbox.test.js` and `daemon.test.mjs`, files the queued runs (handoff-no-wait, reply-markdown, archive-page, ui-design-workflow) also add tests to: each starts from the then `feat/cheap-suite` tip and re-applies its rule to tests found there (L9), never to today's list. (7) S9 was `Model: sonnet` while delivering spec 2 (A1) and 3 (A4), both assumed: now opus.

## 9. Acceptance evidence

1. `npm run test:cost` prints the cost table (S1), before and after (S10).
2. A scripts-only slice gate prints `rune deck: nothing under deck/ changed since <sha7>, skipped` (S3).
3. A second worktree's Rune build under 2 minutes; one shared target dir (S3, S2).
4. A Gate run's three jobs each show `tested-tree` (S4); a landing prints `ci proved <tree7> on 3 jobs` and a selection (S5).
5. `npm run test:quiet` with two suites beside it: ≤ 15 min, spawns ≤ 11,000 (S10).
6. Coverage and the mutant sample no worse (S7, S8, S9, S10).

## 10. Status table

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 1 |
| S2 | planned | – | – | – | – | 7, 9 |
| S3 | planned | – | – | – | S1 | 7, 8 |
| S4 | planned | – | – | – | – | 5 |
| S5 | planned | – | – | – | S3, S4 | 5 |
| S6 | planned | – | – | – | – | 3 |
| S7 | planned | – | – | – | – | 2, 3, 6 |
| S8 | planned | – | – | – | – | 2, 3, 6 |
| S9 | planned | – | – | – | – | 2, 3, 6 |
| S10 | planned | – | – | – | S1, S2, S3, S5, S6, S7, S8, S9 | 3, 4, 6, 10 |
| cheap-suite | planned | feat/cheap-suite | – | – | – | 1-9 |
