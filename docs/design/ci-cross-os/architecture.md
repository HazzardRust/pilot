# ci-cross-os: the suite passes on macOS and Windows CI

Ticket `itm_b8a9e3785d28`. Branch `design/ci-cross-os`, cut from `origin/pilot` at 18a5d2f0.

## 1. Problem

The full suite fails on macOS and Windows CI. In run 39530951687 (f931bc7, `workflow_dispatch`) the macOS job failed
10 tests and the Windows job 8, all in the land, sync, integrate and closing-worktrees tests. Ubuntu is green.

## 2. Spec

Agreed by the user on itm_bd456e7439b3, line 3's PR evidence added on itm_0109445d1941.

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | `gitFixture` hands every build the realpath of its temp dir (`fs.realpathSync.native`), so tests compare the spelling git and the source print: `/private/var` on macOS, `runneradmin` not `RUNNER~1` on Windows. | A git-fixture test pointing `TMPDIR`/`TMP`/`TEMP` at a symlink (junction on win32) sees `dir === realpathSync.native(dir)`, red before on local Windows and WSL; the dispatched Gate's failing-test lists. | 0 of the 8 path tests (closing-worktrees-left:62, land-conflict:102, land-clear:271, :284, :296, sync-resume:67, sync:145, integrate-trial:74) fail on the Windows job; 0 of the 7 not hit by ENOENT on the macOS job. |
| 2 | The macOS `ENOENT … work/.git/objects` in the fixture's first snapshot is diagnosed on the runner and fixed in the fixture. | A probe run's output naming the cause; the PR body states it; the three tests on the macOS job. | integrate-copies:99, integrate-trial:58 and :74 pass on the macOS job in 3 dispatched runs of 3. |
| 3 | The Gate's three jobs are green on the feature tip and on `pilot` after landing. | `gh run list --workflow gate.yml` / `gh run view --json jobs`, and the feature PR's own check run. | ubuntu, macos and windows `success` on the feature PR's head sha, in the PR's own check run, and on `pilot`'s landing sha: 6 of 6 jobs. |

Implied: no assertion of a failing test is edited (L1); the local Windows suite and WSL Linux suite stay green
(practitioner: CI maintainer — a fix proved only on the runner that was red is not a cross-OS fix).
Found: `gate.yml:8` runs `pull_request` only for bases `main` and `feat/**`, so a feature PR (`feat/<slug>` → `pilot`)
never ran the Gate; L6 adds `pilot`. Draft slice PRs still skip it (`gate.yml:25`), so slice evidence is a dispatched run.

## 3. Findings

- **F1. One seam makes every failing path.** All 8 path failures build their dirs through `gitFixture`
  (`scripts/test/lib/git-fixture.mjs:42-45`: `tempDir` = `mkdtempSync(path.join(os.tmpdir(), prefix))`, no realpath).
  The code under test prints git's spelling (`git worktree list`, `rev-parse`) or realpaths itself (`scripts/land.mjs:151`,
  `scripts/sync.mjs:186`, `deck/store-core.mjs:721`). The macOS log shows `+ /private/var/…/work-qa` vs `- /var/…/work-qa`;
  Windows shows `C:/Users/runneradmin/…` against `RUNNER~1`. `fs.realpathSync` (JS) keeps 8.3 short names; `.native`
  (GetFinalPathNameByHandle) expands them. Precedent: mac-linux L3 made `realpathSync.native` the repo's path key.
  None of the 50 `gitFixture` callers compares its dir with `os.tmpdir()`.
- **F2. The macOS ENOENT is in the first snapshot, not the restore.** Stack: `copy` ← `gitFixture:64` (`copy(dir, template)`)
  ← each builder; three tests, not two (integrate-trial:74 fails here on macOS, on its path assert on Windows). Node 26
  `cpSync` with no filter runs the native `cpSyncCopyDir` (`lib/internal/fs/cp/cp-sync.js:154`), which iterates the source
  with `std::filesystem::directory_iterator` and names a path in its error. All three builders end in `commit`/`push`/`fetch`
  in a local clone, each of which runs `git maintenance run --auto`, detached by default (`maintenance.autoDetach` ←
  `gc.autoDetach`, both true). Runner git: macOS 2.55.0, Ubuntu 2.55.0, Windows 2.56.0, so the version is not the
  difference; timing is the suspect. **Not proven**: whether git forks at these object counts and which file vanishes.
  S2 proves it on the runner first.
- **F3. Gate triggers** (`.github/workflows/gate.yml:6-29`): push to `main`, PR to `main`/`feat/**` (non-draft or label
  `all-os`), schedule, dispatch; three OS for dispatch and public PRs. Pinned by `scripts/test/gate-workflow.test.mjs`.
- **F4. Cosmetic, left:** on Windows land prints `removed C:\…` but `kept concluding C:/…`; `slashes()` in
  `land-clear.test.mjs:247` normalises only the separator, so with F1's realpath the tests match.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/test/lib/git-fixture.mjs` | `gitFixture(t, key, build)`; on import, `GIT_CONFIG_GLOBAL` | `tempDir` (realpath, S1), the quiet-git config (S2) | local-substitutable (fs, git) |

Deletion test: deleting `gitFixture` scatters build, snapshot and restore over 50 test files; it stays. `tempDir` and
`copy` are internal and stay private. No fold slice.

## 4. Ubiquitous language

- **Path test**: one of the 8 tests that failed on a path spelling (§2 row 1).
- **Realpath**: `fs.realpathSync.native` of an existing path; never the JS `realpathSync`.
- **Snapshot**: `copy(dir, template)`, the first build of a key; **restore** is `copy(template, dir)`.
- **Quiet git**: fixture git that forks no auto maintenance (`maintenance.auto=false`, `gc.auto=0`, both `autoDetach=false`).
- **Dispatched run**: `gh workflow run gate.yml --ref <branch>`, the only three-OS evidence for a draft or `pilot`-based PR.

## 5. Locked decisions

- **L1. Fix the fixture, not the tests.** One line in `tempDir` fixes 8 tests and every future fixture user. Rejected:
  `realpathSync` at each of the 8 assertions (8 edits, the next test repeats the bug).
- **L2. `realpathSync.native`, not the JS `realpathSync`.** Only `.native` expands `RUNNER~1`. Rejected: JS realpath.
- **L3. No retry around `copy`.** A retry makes the race rarer and hides it. Rejected: retry-on-ENOENT; a `git clone
  --mirror`/bundle snapshot (changes restore semantics and every key's timing; kept as L4's fallback only).
- **L4. S2 diagnoses before it fixes, and stops if the probe disagrees.** A probe on a scratch branch prints the git
  processes and the source `objects/` at the failure on the macOS job; the slice fixes only the cause it shows. If the
  probe names another cause or the fix leaves a red run in 3, S2 stops and `main` re-cuts (a third slice then, with that
  probe as its evidence). Rejected: ship the config on the hypothesis alone.
- **L5. macOS bar is 3 dispatched runs of 3.** A race passing once proves little; public-repo minutes are free.
- **L6. `pilot` joins `gate.yml:8`'s `pull_request.branches`, in S2** (user, itm_0109445d1941). Every feature PR then
  runs the Gate, three OS on this public repository once it is non-draft. Pinned in `scripts/test/gate-workflow.test.mjs`.
  Rejected: dispatch-only evidence, which leaves every future feature PR unchecked.
- **L7. QA environment: the Gate runners by `gh workflow run gate.yml`, plus the local Windows suite and the WSL Linux
  suite** (user, itm_2d54552bb823). On this short path the implementer's live check is the dispatched run; QA inherits it.
- **L8. Grilling depth: forks** (user, itm_71f6141969d0). Only an A<n> whose paths fork the plan is posted; the rest stay
  assumed here. A1 does not fork it: L4 already routes a disproved cause back to `main`, so A1 is not posted.

## 6. Assumed decisions

- **A1. The ENOENT fix is quiet git in the fixture's global config** (`maintenance.auto=false`, `maintenance.autoDetach=false`,
  `gc.auto=0`, `gc.autoDetach=false`), conditional on L4's probe. Tradeoff: fixture git no longer exercises auto
  maintenance, which no test asserts on. Rejected: retry (L3), mirror snapshot (bigger diff). Not posted (L8).
- A2 and A3 settled: the PR trigger became L6 (itm_0109445d1941); the spec was agreed (itm_bd456e7439b3).

red team: attacked (a) S1's red step — a fixture on local Windows/WSL already has a real tmp, so a plain assert passes
before the change; fixed by pointing `TMPDIR`/`TEMP` at a symlink/junction (no privilege on win32). (b) S1 moving every
fixture to realpath breaking a test that compared with `os.tmpdir()`: grep finds none among the 50 users. (c) S2's
hypothesis tested on pre-S1 paths: S1 changes the copy's source spelling to `/private/var`, so S2's probe runs on S1's
tip (S2 after S1). (d) S2 and S1 half-building one seam: both own `git-fixture.mjs`, serialised, no other shared seam.

## 7. Out of scope

- The mixed `\` and `/` in land's Windows output (F4).
- The 113 tests that make their own `mkdtempSync` dirs: green on all three OS in run 39530951687.
- Draft PR #1's stale rules ledger; any change to gate.yml beyond L6's one line.

## 8. Slices

Width 1; longest stem 2 (S1 → S2).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: the fixture hands every build its realpath | 1 | `scripts/test/lib/git-fixture.mjs` (`tempDir`), `scripts/test/git-fixture.test.mjs` | – | ts | [S1](slices/S1.md) |
| S2 | The macOS fixture copy is diagnosed and its git kept quiet | 2, 3 | `scripts/test/lib/git-fixture.mjs` (global config), `scripts/test/git-fixture.test.mjs`; `.github/workflows/gate.yml` (line 8), `scripts/test/gate-workflow.test.mjs` | S1 (`git-fixture.mjs`) | ts | [S2](slices/S2.md) |

S1 sonnet (precise); S2 opus (open diagnosis, L4).

## 9. Acceptance evidence

1. Locally: `node --test scripts/test/git-fixture.test.mjs` green on Windows and in WSL; `npm test` green on both.
2. S1's dispatched run: the Windows job lists none of the 8 path tests; macOS lists only the three ENOENT tests.
3. S2's probe run: the macOS job prints the cause; the PR body names it.
4. S2's three dispatched runs: ubuntu, macos, windows `success` in each.
5. The feature PR's own check run: three jobs `success` (L6).
6. After landing: a Gate run on `pilot`'s landing sha with all three jobs `success`.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 2, 3 |
| ci-cross-os | planned | | | | S1, S2 | 1, 2, 3 |
