# test-body-git: test bodies spawn far fewer git

Ticket `itm_07647401bb5e`. Grilling depth: forks, assumed by timeout (L1). Brief: `brief.md`.
Base `main` at `6701cc7`; S10 to S13 wait for land-batching in the base (A1).

## 1. Problem

land-batching (`itm_7a100ab43411`) cut product git, but a full `npm test` still starts 12,823 processes, 11,682 of
them git (CI windows-latest, land-batching's ceiling fix `510fe3f`), over the signed 11,000 / 10,000. The user lowered
land-batching's bars to the measured run and ticketed the rest: the fixture git that lives in test bodies, which that
plan kept out of scope. This ticket folds it into shared fixtures and puts the signed bars back.

## 2. Spec

Line 1's cut is 1,824, not the ticket's 1,700: only git is cut, so the 11,000 total bar binds first (12,823 − 11,000).

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | A full suite run starts at most 11,000 processes, at most 10,000 of them git, on the highest runner. | `npm run test:cost` on the feature tip prints `spawns <t> (… git <g> …)` with t ≤ 11,000, g ≤ 10,000, recorded as `cost-after.txt`; the feature PR's CI windows run reads the same bars. Today 12,823 / 11,682: git must fall ≥ 1,824. |
| 2 | The gate holds the signed bars: `SPAWN_CEILING` 11000, `GIT_CEILING` 10000 in `scripts/gate.mjs`; cheap-suite spec 3 / A4 and land-batching's rows name them. | `scripts/test/gate-spawns.test.mjs`: 11,001 total red, 10,001 git red, 11,000 / 10,000 green (3 cases, land-batching's); a full run prints both at or under them. |
| 3 | No assertion is removed or weakened, no test deleted, skipped or `todo`. | `assert-count.mjs` per touched file, base against tip: tests equal, asserts equal or higher, 0 files lower; its table in every slice report and the feature PR body; full suite test total equals the base's plus added tests. |
| 4 | practitioner: test-infrastructure engineers — a per-test-file fixture git census, before and after, sits beside the design. | `census-before.txt` (S1) and `census-after.txt` (S13): fixture git per file split builder / body / lib, from `census.mjs`; each covers ≥ 99% of the run's fixture git. |
| 5 | *added (S14, S15)*: S14 and S15 fold enough of the remaining per-test fixture git for the full suite to meet L7's 11,000 / 10,000. | Each slice's census cut of 300 or more; S13's `test:cost` run. |
| 6 | *added (S16)*: S16 folds body and lib git in the land test files so the full suite meets L7's 11,000 spawns. | Census cut ≥ 150 over the owned files; per-file product git identical to the base for every owned file; `test:cost` after S13. |

Cannot mean: any product-code change. Product git is land-batching's; this run edits test code, test helpers, the two
gate constants and docs only (L6).

## 3. Findings

**Probe, 2026-11-26** (110 test files with git ≥ 10 in land-batching's `cost-after.txt`, on S6 `824ef96`; the other
29 files hold 109 git): 11,293 git, of which product 7,198 and fixture 4,095 (census owner "fixture" 4,197).

| Class | git | Top argv |
|---|---|---|
| built: inside a `gitFixture` build, once per file and key | 2,050 | commit 415, add 359, checkout 348, push 283, init 159, clone 156 |
| body: a test body's own `git(...)` | 1,701 | rev-parse 438, commit 145, checkout 142, add 137, push 132, config 81, init 56 |
| lib: a `scripts/test/lib` helper called from a body | 344 | rev-parse 99, add 44, commit 44, push 37 (all `land-repos.mjs`) |

Top files by fixture git: release 197, branches 150, integrate-slice-commit 129, integrate-base 128, worktrees 114,
integrate 113, glossary-diff 105 (no `gitFixture`), land 103, restack 101, sync 100. 79 files use `gitFixture`;
glossary-diff, rules-ledger, landing-recreate, audit-context, glossary-stale and gitignore build repos per test.

**What the design leans on**
- `scripts/test/lib/git-fixture.mjs:75` `gitFixture(t, key, build)`: build once per process (= per file under
  `node --test`), restore in place per test (git-light-tests A1, which rejected copying `.git` to a new path).
- `scripts/test/lib/land-repos.mjs` `buildRepos`, `commitFile`: shared by 12 land/release files, 398 built git;
  land-batching S6 (`824ef96`) edits it and found `commitFile` cannot fold (untracked path refused by `commit -i`).
- `scripts/gate.mjs` `SPAWN_CEILING`, `GIT_CEILING`, `spawnLines` and `scripts/test/gate-spawns.test.mjs`: exist only
  on `feat/land-batching` (S7, fix `510fe3f`).
- land-batching touches `land-repos.mjs`, `land-clear`, `land-suite`, `integrate-remote` and adds `land-pin`,
  `integrate-pin`, `sync-pin`, `land-tail-spawns`, `git-view*`, `lib/fixture-git` tests: those are S10 to S12's.

**Seams** (deepening pass)

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `seed` (`scripts/test/lib/seed.mjs`, new) | `seed(dir, history) → { origin, sha }` | each builder's init / add / commit / checkout -b / merge / push run that writes a history | local-substitutable (real git in a temp dir) |
| `gitFixture` (as is) | `gitFixture(t, key, build)` | body setup that every test of a file repeats | in-process |
| gate bars (land-batching's) | `SPAWN_CEILING`, `GIT_CEILING`, `runGate({ ceiling, gitCeiling })` | – | in-process |

Deletion test: the ~90 file-local `const git = (cwd, ...args) => execFileSync(...)` one-liners are pass-throughs, but
folding them saves no spawn: left alone (scope). `commitFile` stays for callers that need a working-tree commit.
No fold slice: `seed` is new code that builders adopt.

## 4. Ubiquitous language

- **fixture git**: a git process a test starts with no product frame on its stack; the thing this run cuts.
- **builder**: the function a `gitFixture` key runs once per file to make its repositories.
- **body git**: fixture git a test body starts itself, setup or assertion read.
- **seed**: one `git fast-import` writing a whole history (branches, merges) into a bare repository.
- **census**: fixture git per test file, split builder / body / lib (`census.mjs`).

## 5. Locked decisions

- **L1** Grilling depth forks, assumed by timeout: `itm_6d01850fa5fb` was closed by the deck ("no answer 20 min"), not by the user's press. Only questions whose paths give a different deliverable are posted.
- **L2** Spec as in §2, accepted by the pilot on the sharpened draft (1,824 replaces 1,700).
- **L3** History is seeded: `seed` writes origin's branches, commits and merges with one `git init --bare` and one
  `git fast-import`, commit times counting up from a fixed epoch; working copies stay `git clone`. Rejected: porcelain
  folds (S6: `commitFile` cannot fold); plumbing per commit (more spawns); copying a `.git` to a new path
  (git-light-tests A1).
- **L4** Setup every test of a file repeats moves into a `gitFixture` key; files without `gitFixture` adopt it.
  Rejected: a new fixture mechanism.
- **L5** Assertion reads may be batched (`rev-parse a b c`, one `for-each-ref`) only where each assert keeps its own
  expected value and message. Rejected: dropping a read, which weakens its assert.
- **L6** No product code: edits are confined to `scripts/test/**`, `deck/test/**`, the two gate constants and docs.
- **L7** The bars carry no headroom (land-batching A5); a final run over either bar stops S13, which reports the census
  to `main`; no ceiling above 11,000 / 10,000 without the user.
- **L8** The run's ADR is `docs/adr/NNNN-test-body-git.md` (ADR NNNN, S1): fixture history is seeded in one spawn.

## 6. Assumed decisions

- **A1** Base: `main` as `pilot base` prints. S1 to S9 own no file land-batching touches and start at Gate 1; S10 to
  S13 start once land-batching is in the base (`git merge origin/main` after it lands, or `pilot base` naming
  `feat/land-batching` concluding). Trades: a third of the cut (S10 to S12, ~930 fixture git) and the bars wait on
  land-batching's lane, queued behind archive-page. Rejected: stacking now (the deck names no concluding
  land-batching; its tip still moves with S6 and the fix); holding the whole run (idles nine slices).
  Verdict: stands — land-batching is implementing and queued behind archive-page; S10-S13 wait for it in base
- **A2** Fixtures shared per file, not cached across files (`itm_38ac1acda6fa`, posted). Default per file: est.
  −1,500 to −2,000 git, no new invalidation. Trades a thin margin on 1,824. Rejected: an on-disk cross-file template,
  ≤ ~300 git (only `buildRepos` repeats across files), path rewriting git-light-tests A1 rejected.
  **Answered**: the user pressed "Per file (default)" on `itm_38ac1acda6fa`.
  Verdict: stands — user pressed "Per file (default)" on itm_38ac1acda6fa
- **A3** No per-file git budget test (`itm_50c164279757`, posted). Default: `GIT_CEILING` plus `census.mjs` on
  demand. Trades: a regression is a suite-wide red naming product owners, not the test file. Rejected: ~90 budgets
  in the gate, edited by most future features.
  **Answered**: the user pressed "No budget test (default)" on `itm_50c164279757`.
  Verdict: stands — user pressed "No budget test (default)" on itm_50c164279757

## 7. Out of scope

Product git (deck/server-tools, base, stack and the rest); node and other spawns; suite wall time; `git-fixture.test`'s
own git (its subject); `hooks/test/*.js` (≤ 11 git each, CommonJS); merging the file-local `git` helpers.

## 8. Slices

Width 9; longest stem 4 (S1 → S10 → S11 → S13). Each fold slice cuts its owned files' fixture git by ≥ 50%, summed
(`census.mjs` on those files, base against tip); S10 cuts `buildRepos`' 398 built to ≤ 160. Bars summed: S1 57,
S2 to S9 1,411, S10 238, S11 118, S12 104: 1,928 against 1,824 needed, a margin of 104 (L7 covers a short run).
`deck/test/gate1-lineage.test.mjs` (42 fixture git) is in no slice: itm_ad02d595d1c2 owns its slowness; no bar needs it.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | One builder seeds its history in one spawn (walking skeleton) | 3, 4 | `scripts/test/lib/seed.mjs` (new), `scripts/test/lib/seed.test.mjs` (new), `scripts/test/integrate.test.mjs`, `docs/design/test-body-git/census.mjs` (new), `assert-count.mjs` (new), `census-before.txt` (new), `docs/adr/NNNN-test-body-git.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Integrate tests, part one | 1, 3 | `scripts/test/integrate-{slice-commit,base,landed,main,prune}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | Integrate tests, part two | 1, 3 | `scripts/test/integrate-{trial,copies,chain,dir,select,checks}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | Branch and worktree tests | 1, 3 | `scripts/test/{branches,worktrees,worktrees-landed,worktrees-holder}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | Sync and restack tests | 1, 3 | `scripts/test/{restack,restack-squash,sync,sync-remote,sync-noop,sync-resume,merge-into-pilot}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | Land tests on their own builders | 1, 3 | `scripts/test/land-{catchup,generated,conflict,remote,prune,record,offline,gc}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | Files that build a repo per test adopt `gitFixture` | 1, 3 | `scripts/test/{glossary-diff,merge-generated,audit-context,rules-ledger,glossary-stale,install,audit-spend-runs,gitignore,line-endings}.test.mjs`, `deck/test/{landing-recreate,telemetry-line}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | Deck, base and handoff tests | 1, 3 | `deck/test/{landing-recut,gate2-base,plan-drift,gate1-verdicts,replan,lineage-base}.test.mjs`, `scripts/test/{handoff-lineage-remote,base-remote,pilot-tip,handoff,base-main,base-chain,base}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 | Select, ADR and branch-helper tests | 1, 3 | `scripts/test/{select-tests,adr-allocate,fresh-repo,pilot-branch,select-replay,red-line,test-command,select-fallback}.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S9](slices/S9.md) |
| S10 | `buildRepos` seeds its origin | 1, 3 | `scripts/test/lib/land-repos.mjs` (`buildRepos`), `scripts/test/lib/fixture-git.test.mjs` | S1 (`seed`) | `pilot:typescript-reviewer` | [S10](slices/S10.md) |
| S11 | Land and release bodies on `buildRepos` | 1, 3 | `scripts/test/{release,land,land-suite,land-adr-branch,land-adr,land-clear}.test.mjs` | S10 (`land-repos.mjs`) | `pilot:typescript-reviewer` | [S11](slices/S11.md) |
| S12 | land-batching's pin and spawn tests | 1, 3 | `scripts/test/{integrate-remote,integrate-pin,land-tail-spawns,land-feature-line,sync-pin,land-chain,land-pin,land-checks,land-none,land-main-pr,land-merged-read,git-view-tips}.test.mjs` | S10 (`land-repos.mjs`) | `pilot:typescript-reviewer` | [S12](slices/S12.md) |
| S14 | Fold the remaining per-test fixtures (scripts and deck) *(added)* | 5 | the census's test files but `land*`, `integrate*`, `release*`, `sync*`, `restack*`, `lib/fixture-git`, `lib/seed` and `deck/test/gate1-lineage`; `docs/design/test-body-git/census-after.txt` (copied from S13) | S13's census | `pilot:typescript-reviewer` | [S14](slices/S14.md) |
| S15 | Fold the remaining land, integrate, release, sync and restack fixtures *(added)* | 5 | the census's `land*`, `integrate*`, `release*`, `sync*`, `restack*` test files | S13's census | `pilot:typescript-reviewer` | [S15](slices/S15.md) |
| S16 | Fold the land files' body and lib git *(added)* | 6 | `scripts/test/{land-clear,land-prune,land-catchup,land-remote,land,land-adr-branch,land-tail-spawns}.test.mjs` | S14, S15 (integrated) | `pilot:typescript-reviewer` | [S16](slices/S16.md) |
| S13 | The bars read 11,000 / 10,000 again | 1, 2, 4 | `scripts/gate.mjs` (the two constants and the dated line), `docs/design/cheap-suite/architecture.md`, `docs/design/land-batching/architecture.md` (spec 1, 2 rows), `docs/design/test-body-git/{cost-after,census-after}.txt` (new) | S2 to S9 (suite), S11 (suite), S12 (suite) | `pilot:typescript-reviewer` | [S13](slices/S13.md) |

S10 to S13 also wait for land-batching in the base (A1); the after column names slices only.
red team: S1 first owned `land-repos.mjs` for the skeleton (largest builder) — land-batching S6 edits it, so a merge
conflict sat under the skeleton; the skeleton moved to `integrate.test.mjs`, which land-batching does not touch, and
`buildRepos` went to S10 behind A1. red team: `integrate-remote`, `land-clear` and `land-suite` sat in S2 and S6 but
land-batching edits them: moved to S11 and S12. red team: S7's files gain `fake-home.mjs` through `gitFixture` and stop
reading the real `~/.gitconfig`; a test that relied on it (none found by grep for `--global`) would change: S7's Misses
names it. red team: `seed`'s fixed commit times could reorder `git log` output between unrelated branches; times count
up per commit in history order, so topological and date order agree (S1 behaviour 1). red team: a 50% bar per slice
on files whose body git is mostly assertion reads (L5) may not reach: the bar is summed over the slice's files, and
S13 stops on a short run (L7).

## 9. Acceptance evidence

1. `census-before.txt` against `census-after.txt`: fixture git per file, where the ≥ 1,824 went (S1, S13).
2. Each slice's assert-count table: tests equal, asserts equal or higher, per touched file (S1 to S12).
3. A full `npm run test:cost` prints spawns ≤ 11,000, git ≤ 10,000; the CI windows run of the feature PR the same (S13).
4. A gate over 11,000 or over 10,000 git reads red (`gate-spawns.test.mjs`, S13).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3, 4 |
| S2 | planned | | | | S1 | 1, 3 |
| S3 | planned | | | | S1 | 1, 3 |
| S4 | planned | | | | S1 | 1, 3 |
| S5 | planned | | | | S1 | 1, 3 |
| S6 | planned | | | | S1 | 1, 3 |
| S7 | planned | | | | S1 | 1, 3 |
| S8 | planned | | | | S1 | 1, 3 |
| S9 | planned | | | | S1 | 1, 3 |
| S10 | planned | | | | S1 | 1, 3 |
| S11 | planned | | | | S10 | 1, 3 |
| S12 | planned | | | | S10 | 1, 3 |
| S14 | planned (added) | `slice/test-body-git-s14` | | | – | 5 |
| S15 | planned (added) | `slice/test-body-git-s15` | | | – | 5 |
| S16 | planned (added) | `slice/test-body-git-s16` | | | – | 6 |
| S13 | planned | | | | S2-S9, S11, S12 | 1, 2, 4 |
| feature | planned | `feat/test-body-git` | | | | 1-4 |
