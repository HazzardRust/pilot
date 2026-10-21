# git-light-tests: cheaper git fixtures for the land, sync and integrate tests

Ticket `itm_3a7c0c04efd7` (audit F3). Grilling depth: none (L1).

## 1. Problem

The gate an agent runs on each slice takes about 5.6 minutes, and 93% of its process starts are git. The land, sync and integrate test fixtures each build real repositories with many git calls, and every slice pays for that.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | One full `npm test` reports builder git (the fixture builders' own spawns) cut by at least 80% per family, and total git under the figure S6 measures on the integrated branch plus 10%, the same number as the ceiling (spec 5). Tests only, no production change. Locked on `itm_c3f6d0631e38`; restated on `itm_10aa7f88436c` (2026-10-16): the earlier "fixture git under 1200 / total under 7700" counted git inside test bodies, which A4 and spec 4 keep; measured S1–S5: builder git −77–82% everywhere, total 8191. | gate.mjs `spawns` line; the per-file census re-run |
| 2 | `npm test` wall time is under 240 s on this machine (from 335-346 s). | two timed runs before and after |
| 3 | Every test passes, the test count is unchanged, and the census reads `left running: none`. | the run's counts and census line |
| 4 | The code under test still runs real git. Only fixture setup changes, and no assert is removed. *assumed* | the diff touches only `*/test/**` files |
| 5 | `SPAWN_CEILING` drops to the new measured total plus 10%, with a dated comment. *assumed* (A5) | a run over it prints `spawns over` |
| 6 | Each test starts from a pristine fixture, whatever the test before it in the file did, and the suite passes at concurrency 4. *assumed* (A4) | the converted files pass under the gate; the seam's own test |

Lines 1-3 were agreed on itm_d79c895a34b7. Line 1 was restated on itm_c3f6d0631e38 after F1. Lines 4-6 are implied by those lines and have not been confirmed.

## 3. Findings

- **F1 (changed the request, now settled).** The attributed per-file census at 2426af8f covered 349 files, 4 running at once: 346 s wall, 12455 git spawns, 0 files failed. Fixtures and test bodies account for 5984 of those git spawns. Production modules account for 6471 (a frame in scripts/, deck/, hooks/ or bin/ outside test/). So no fixture work can reach the original 6000, and spec 1 was restated.
- **F2.** The top files, as total git / fixture git / wall time. The other files are each under 330 total.

  | File | Total | Fixture | Wall | | File | Total | Fixture | Wall |
  |---|---|---|---|---|---|---|---|---|
  | land | 2670 | 644 | 174 s | | integrate-base | 475 | 340 | 41 s |
  | integrate | 846 | 526 | 70 s | | integrate-landed | 385 | 322 | 36 s |
  | land-prune | 821 | 478 | 54 s | | branches | 353 | 265 | 30 s |
  | land-clear | 776 | 226 | 66 s | | land-catchup | 353 | 181 | 27 s |
  | land-conflict | 741 | 237 | 54 s | | integrate-default | 339 | 248 | 30 s |
  | sync | 479 | 325 | 41 s | | worktrees | 331 | 187 | 33 s |

- **F3.** 45 test files run `git init` (7 under `deck/test/`, 38 under `scripts/test/`). Each file has its own copy-pasted builder (`repos`, `scratchRepos`, `scratch`, `scratchRun`, `pilotRepos`, `conflicting`). Each builder runs `init --bare`, a clone, 3 `git config` calls per repository, then its commits and pushes. Most of the fixture git is builder git, not test-body git: sync's `repos` (sync.test.mjs:38) runs 21 git calls and the file has 12 tests, which comes to 252 of its 325. land-prune's `scratchRun` (land-prune.test.mjs:40) costs about 68 per test across 7 tests.
- **F4.** `scripts/test/lib/fake-home.mjs` gives a process its own HOME, so a file that imports it starts with an empty global git config. That is why every builder writes `user.name`, `user.email` and `commit.gpgsign`. No file sets `GIT_CONFIG_GLOBAL` (grep: none in scripts/, deck/, hooks/). Pointing it at a file written once per process removes every `git config` spawn in every builder.
- **F5.** No converted file runs its tests concurrently: grep finds `concurrency` only in gate.test.mjs. node:test runs a file's tests one after another by default. A fixture can therefore be **restored at the same path** before each test, instead of copied to a new path with its root rewritten. Several builders return absolute paths, closures over `dir` (land.test.mjs:55 `clone`, :64 `mover`) and SHAs computed at build time (land-prune.test.mjs:74 `gate1`, `sliceMerge`). Every one of those stays valid when the path does not move, and every one of them would need rewriting if it did. Copying with a rewrite would also have to cover the backslash, forward-slash and config-escaped (`\\`) spellings of a Windows path in `.git/config`, the `.git` files and `worktrees/*/gitdir`. Restoring in place has no rewrite at all.
- **F6.** No builder is time-dependent. grep for `Date`, `--date` and `COMMITTER_DATE` in land-gc, worktrees and branches finds nothing, so a SHA reused across the tests of one process changes no assert.
- **F7 (risk to spec 2).** land alone is 174 s, of which only 644 git calls are fixture. Spec 2's wall time depends on the 4-wide schedule as well as on spawn count. The per-slice evidence records each file's wall time, so a shortfall shows early.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/test/lib/git-fixture.mjs` (new) | `gitFixture(t, key, build)` returns `build`'s value, with the fixture directory pristine at the same path. Importing it sets `GIT_CONFIG_GLOBAL` and imports `fake-home.mjs`. | The 45 builders' `config()` loops, their `mkdtempSync` and `t.after(rmSync)` cleanup, and the repeated build per test | Local-substitutable: real git on a temp directory |
| `scripts/gate.mjs` `SPAWN_CEILING` | an exported constant (gate.mjs:34) | nothing; the value changes | In-process |

The deletion test on the 45 builders: their shared half (temp dir, identity, cleanup, rebuild per test) reappears in every caller, so it moves behind the seam. Their own repository shapes are different in each file and stay there as the `build` argument. Each file's `git` and `commitFile` helpers stay where they are. Folding them is tidying the request does not ask for (§7).

## 4. Ubiquitous language

- **Builder**: a test file's function that makes its repositories. After this ticket it is the `build` argument passed to `gitFixture`.
- **Fixture key**: the string naming one builder and its arguments, for example `scratchRun:unmerged`. Each key is built once per process.
- **Template**: the snapshot of a key's directory taken right after its build.
- **Restore**: before a test, emptying a key's directory and copying its template back to the same path, timestamps preserved.
- **Fixture git**: a git spawn whose stack has a frame under a `test/` directory (F1's attribution), as opposed to production git.

## 5. Locked decisions

- **L1 Grilling depth: none** (the user, `itm_9868e970eab6`).
- **L2 Spec 1 is "builder git cut by at least 80%, total git under the S6-measured figure plus 10%", tests only** (the user, `itm_c3f6d0631e38`; restated on `itm_10aa7f88436c`, 2026-10-16, from "total under 7700, fixture under 1200": the 1200 counted test-body git that spec 4 keeps, and S5's full gate measured 8191). Rejected: making production land and sync cheaper, which is outside this ticket; an added slice rewriting test-body git, which spec 4 forbids.

## 6. Assumed decisions

- **A1 Restore in place, not copy and rewrite** (F5). The default: one directory per key per process, restored before each test. What it trades away: a test cannot hold two live fixtures of one key, so a second call in the same test builds fresh into a new temp directory, slower but correct. Rejected: `cpSync` to a new path with the root rewritten in `.git/config`, the `.git` files and `worktrees/*/gitdir`. That needs three spellings of a Windows path and breaks every returned path, closure and SHA.
  Verdict: stands
- **A2 The seam imports `fake-home.mjs`.** The default: every converted file gets a private HOME and a global git config written by the fixture (identity, `commit.gpgsign=false`, `core.checkStat=minimal`). What it trades away: the files that do not import fake-home today stop reading the real `~/.gitconfig`, which makes them more hermetic. Rejected: setting `GIT_CONFIG_GLOBAL` alone and leaving HOME real.
  Verdict: stands
- **A3 Convert all 45 files, 6 slices.** The default: four conversion slices by family plus the seam's skeleton, and the ceiling drop as its own last slice, each under 300 changed lines. What it trades away: two more slices than the 4 the pilot sketched. Rejected: converting only F2's top 12, which leaves an estimated 2000+ fixture git and misses spec 1.
  Verdict: stands — S5 edits `deck/test/wait.test.mjs`, which three-lanes S11 (yellow, ahead of this run) also extends; S5 is cut from `feat/git-light-tests` after three-lanes lands on `pilot`, and rebases otherwise.
  Hold lifted 2026-10-16 by the pilot: three-lanes at e530b663 touches `deck/test/wait-idle-lane.test.mjs`, not `wait.test.mjs`, none of S5's seven files, and merges into feat 4fddce91 clean (`git merge-tree`, 0 conflicts); S5 starts from 4fddce91 and `pilot integrate` takes `origin/pilot` when three-lanes lands.
- **A4 Spec 6 reads "a pristine fixture", not "a private copy"** (follows from A1).
  Verdict: stands
- **A5 The new ceiling is the measured total plus 10%**, the L16 rule gate.mjs:29 already states. Rejected: a tighter margin, which flakes on machine variance.
  Verdict: stands
- **A6 A file whose builder is a lone `git init`** with fewer git calls than one restore saves keeps that call and only drops its `config` calls. The implementer names each such file in the slice report.
  Verdict: stands
- **A7 The QA environment** is this machine: `npm test` timed twice, the gate.mjs census line, and the per-file census re-run.
  Verdict: stands

## 7. Out of scope

- Production git in land, sync and integrate (L2).
- Folding the 45 files' `git` and `commitFile` helpers into one module.
- F4/F5 of the audit (gate.mjs install check, test-timeout.test.mjs); this ticket touches only `SPAWN_CEILING` and its comment in gate.mjs.
- Running files' tests concurrently within a file.

## 8. Slices

Width 4; longest stem 4 (S1 → S2 → S7 → S6). S7 added 2026-10-16 by the co-pilot under the build-now rule (itm_3a70cd89282b): S6's census found the land family's builder git at −73.9% against spec 1's 80%. S8 added 2026-10-16 by the co-pilot under the same rule: S6's timed gates on the tree merged with origin/pilot 12b431f1 measured npm test at 277 s and 249 s against spec 2's 240 s; S6 follows S8.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the sync family builds once and restores per test | 1, 3, 4, 6 | `scripts/test/lib/git-fixture.mjs` (new), `scripts/test/git-fixture.test.mjs` (new), `scripts/test/sync.test.mjs`, `sync-remote.test.mjs`, `merge-into-pilot.test.mjs`, `pilot-branch.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | The land family on the seam | 1, 2, 3, 4 | `scripts/test/land*.test.mjs` (9 files), `merge-generated.test.mjs` | S1 (git-fixture seam) | ts | [S2](slices/S2.md) |
| S3 | The integrate family, branches and worktrees on the seam | 1, 2, 3, 4 | `scripts/test/integrate*.test.mjs` (7 files), `branches.test.mjs`, `worktrees.test.mjs` | S1 (git-fixture seam) | ts | [S3](slices/S3.md) |
| S4 | The remaining scripts tests on the seam | 1, 3, 4 | `scripts/test/` `audit-context`, `audit-spend`, `audit-spend-reports`, `audit-spend-runs`, `base`, `base-remote`, `cli-wiring`, `handoff`, `handoff-friction`, `handoff-lineage-remote`, `handoff-owed`, `install`, `red-line`, `remotes`, `test-command` `.test.mjs` | S1 (git-fixture seam) | ts | [S4](slices/S4.md) |
| S5 | The deck tests on the seam | 1, 3, 4 | `deck/test/` `gate1-lineage`, `gate1-verdicts`, `gate2-base`, `procs`, `schedule`, `telemetry-line`, `wait` `.test.mjs` | S1 (git-fixture seam) | ts | [S5](slices/S5.md) |
| S7 | The land family to the 80% bar (added) | 1 | `scripts/test/land*.test.mjs` gitFixture builders only | S2 (the land seam) | ts | [S7](slices/S7.md) |
| S8 | npm test under 240 s on the merged tree (added) | 2 | `*/test/**` files the per-file wall evidence picks | S7 | ts | [S8](slices/S8.md) |
| S6 | The ceiling follows the count | 1, 2, 5 | `scripts/gate.mjs` (`SPAWN_CEILING` and its comment only) | S2, S3, S4, S5, S7, S8 (the measured total) | ts | [S6](slices/S6.md) |

## 9. Acceptance evidence

On this machine (A7), in the order a user meets it:

1. `npm test` passes with the same pass and skip counts as before (3528 pass, 2 skipped at the base, plus S1's new tests) and reads `left running: none` (spec 3).
2. Its `spawns` line shows git at or under the S6 ceiling (the measured total plus 10%), and the per-file census shows builder git cut by at least 80% per family (spec 1, as restated on `itm_10aa7f88436c`).
3. Two timed `npm test` runs both come in under 240 s (spec 2).
4. `git diff <base> --stat` touches only `*/test/**` and the `SPAWN_CEILING` lines of gate.mjs (spec 4, 5).
5. A gate run with the ceiling lowered below the count prints `spawns over` (spec 5).
6. `scripts/test/git-fixture.test.mjs` shows that a test that dirties its fixture leaves the next test a pristine one (spec 6).

Known flake: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" under a concurrent gate.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 3, 4, 6 |
| S2 | planned | | | | S1 | 1, 2, 3, 4 |
| S3 | planned | | | | S1 | 1, 2, 3, 4 |
| S4 | planned | | | | S1 | 1, 3, 4 |
| S5 | planned | | | | S1 | 1, 3, 4 |
| S7 | planned (added) | | | | S2 | 1 |
| S8 | planned (added) | | | | S7 | 2 |
| S6 | planned | | | | S2, S3, S4, S5, S7, S8 | 1, 2, 5 |
| git-light-tests | planned | | | | S1-S8 | 1-6 |
