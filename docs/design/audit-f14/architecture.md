# audit-f14: dead exports go private, and each feature is its own PR to main

Ticket itm_4be41dcb9ee3 · audit 2026-11-17T00-56-45-000Z F14 · base `origin/pilot` fa28b73b · merge: decided before (itm_08346d099667 merged itm_d6215dda631e)

## 1. Problem

Two parts, one ticket by the user's press.

1. Six names are exported but no other file imports them, so an agent reads them as public API.
2. Every landed feature reaches main folded into one `pilot → main` release PR. The user's SOP wants each feature to stay a separate entity that can be addressed: "someone viewing the repo ... will only see feature A coming off of it's own branch, and feature B coming off it's own branch. they will see the pilot branch, but nothing will come off of it into main." Everything else stays the same. The user's answer to the risk: "worst case is a regression and we go back".

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | `PR_WRITE_TIMEOUT_MS`, `deckConcluding`, `trialOnPilot`, `ROWS`, `RUN_REMOTE_KEY` and `EXCEPTIONS` are no longer exported. | `git grep -nE "export .*\b<name>\b" -- deck scripts` per name | 0 of 6 exported |
| 2 | Each of the six is still used in its own file and is imported nowhere else. practitioner: knip-style unused-export audit | `git grep -nw <name> -- . ':!docs'` | 6 of 6 hit only their defining file |
| 3 | The F14 diff is only the six keywords, and the gate is green. | `npm test`; S1's `git diff --stat` | exit 0; 6 files, ±6 |
| 4 | A feature's PR (the deck's draft at gate1) has base main, or `feat/<N>` while N's PR is unmerged. No tool opens a PR with head `pilot` for a run cut this way. | stub-host tests for each base; landing test | 0 PRs with head `pilot` |
| 5 | A run on origin is cut from main, and `pilot integrate` merges main into it, never pilot, so its PR shows only its own commits. practitioner: gitworkflows(7) topic branches, forked from the oldest base and never merged up from the integration branch | temp repo, B on A: `main..feat/A` and `feat/A..feat/B` | 0 commits of another feature, 0 of pilot's merges |
| 6 | When the lower PR merges into main, `pilot restack` retargets the upper PR to main. After a merge commit nothing is rewritten. After a squash the upper branch is rebased onto main. The user runs no git. | temp-repo test per method | base main; 0 of A's commits in B's range; 1 run of `pilot restack` |
| 7 | The merge method into main is a setting (`pilot.merge`: `merge` by default, or `squash`). It words the human step. Restack works the method out from ancestry and never reads it. | config test each way | 2 of 2 values worded; any third value refused |
| 8 | `pilot` stays the private line. Gate 2 lands on it and the full suite runs on the combined tree. It is never rewritten (L12): under squash, `pilot sync`'s tree-identical merge pushes nothing (`scripts/sync.mjs:262`). | landing test unchanged; squash test | 0 non-fast-forward pushes of pilot; pilot's tree = main plus the open features |
| 9 | A feature PR carries its final ADR number: the landing commits the rename on `feat/<slug>`, not in pilot's merge. | landing test | 0 `NNNN-` paths in `main..feat/<slug>` after landing |
| 10 | A change on a lower PR reaches every PR stacked on it by `pilot restack`, by merge with no rewrite. A conflict exits 3, names the file and pushes nothing. | temp-repo test, clean and conflicting | B holds the fix; the conflict names its path |
| 11 | The closing report's human step names the feature's own PR, bottom of the stack first: "Merge #A, then #B with a merge commit". | report test, stack of two | order A then B; the method word |
| 12 | Cutover: a run whose record base is `pilot` (in flight today) lands as before, with the release PR. No new run takes that path, and there is no setting (L11). *assumed* A3 | `scripts/test/release.test.mjs` unchanged and green | 9 of 9 release tests pass |
| 13 | A gate1 on a design branch cut from the run's base is accepted: the lineage check reads the base, not pilot. | lineage test with a main-cut branch | 0 refusals for it; a branch with 1 copy still refused |
| 14 | The crew and the docs say the new shape: the lander, the pilot, OPERATING and the run's ADR name the feature PR line, not `main gets pilot`. | `git grep -n "main gets pilot" agents docs/OPERATING.md` | hits only under the legacy (A3) wording |

Lines 4-11 are the draft's lines 1-8 sharpened, as the user settled them (L11, L12). Draft line 9 is dropped. Line 12 is the cutover (A3). Lines 13 and 14 are implied by the draft.

## 3. Findings

- **Cut.** `scripts/base.mjs:92` prints `base pilot <sha>`, or `base feat/<N>` for the deck's concluding feature (:80-85). `deck/tickets.mjs:66` offers a feature as a base only when its own base is `pilot`, which gives chain depth 1. `RUN_BASE` (`deck/runs.mjs:249`) accepts only `pilot|feat/<slug>`. `agents/pilot-architect.md:156,183,189,191` cut and rebase on `<remote>/pilot`.
- **Integrate.** `baseOf` (`scripts/integrate.mjs:306-318`) returns pilot for an unchained run. A chain ends at N's landing on pilot (:316). Today feat merges pilot, which is why a feat→main PR would carry 7 commits, 2 of them merges (`origin/main..origin/pilot` at fa28b73b).
- **Gate1 lineage.** `deck/lineage.mjs:27-48` refuses a gate1 whose branch is not on pilot's tip (`pilotLineage`, `scripts/pilot-branch.mjs:197`). A design branch cut from main would be refused.
- **Feature PR.** It is written only by `scripts/feature-pr.mjs` (`syncFeaturePr`), which the deck spawns at a gate1 post, a QA comment and a status update (`deck/server-tools.mjs:279,282,422`). Its base is `record.base ?? pilot` (:122). Each write re-edits the base to that value (:184-189), so it would undo any retarget.
- **Landing.** `landCaughtUp` (`scripts/land.mjs:206-253`) pushes feat unforced (:310), merges into pilot (`mergeIntoPilot`, `scripts/sync.mjs:56`), and calls `comment`, which polls for "reads merged" (:336-366). It then calls `retarget` (moves `feat/` PRs to pilot, :276) and `releasePr` (`scripts/release.mjs:60`), the only `pilot → main` writer. `mainLine` (:372) is parsed by `deck/closing-report.mjs:52,88-91` and `deck/store-items.mjs:424`, and pinned by 9 release tests, 10 land-main-pr tests and 3 closing-main-pr tests.
- **ADR.** `allocateAdr` (`scripts/adr-allocate.mjs:37`) amends pilot's merge commit (`sync.mjs:98`), so the number never reaches feat.
- **Host.** `deck/host-github.mjs:56-64` allows only `gh pr create|edit|comment|view|list`: no merge verb. The only forced push is `scripts/branches.mjs:108`, a leased delete. Settings are git config with a validating reader (`deck/host.mjs:24-31`, ADR 0189).
- **Squash.** `pilot sync` already skips a main merge that changes no tree (`sync.mjs:261-264`). Rebuilding pilot is not needed for line 8.
- ADR 0167 rejected "feature PRs against main". This run supersedes it and amends ADR 0176's release PR.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/stack.mjs` (new) | `prBase`, `restack` | the PR base rule from `feature-pr.mjs:122` and `land.mjs`'s `retarget`, plus the new rebase and merge-forward | true external (the host), behind `deck/host.mjs`'s adapter |
| `scripts/base.mjs` | `base` | which ref a run is cut from | local-substitutable (git) |
| `scripts/integrate.mjs` | `baseOf` | the chain's end | local-substitutable |
| `scripts/pilot-branch.mjs` | `pilotLineage` (gains `base`) | lineage against any base | local-substitutable |
| `scripts/land.mjs` | `land`, `featureLine` | `mainLine` for new runs | true external via host |
| `scripts/adr-allocate.mjs` | `allocateAdr` | where the rename commits | local-substitutable |
| `deck/closing-report.mjs` | `closingReport` steps | the main line's parse | in-process |
| `deck/host.mjs` | `mergeMethodOf` | the setting | local-substitutable |

Deletion test: `retarget` and the base rule in `feature-pr.mjs` both answer "what is this PR's base". Deleted, that rule reappears in feature-pr, land and restack. They fold into `stack.mjs`, which earns its keep. `release.mjs` survives only for A3. No fold-only slice: the fold rides in S3 and S7, the slices whose behaviour needs it.

## 4. Ubiquitous language

- **the default branch**: origin's HEAD branch (main here). The tools never push it and never merge into it.
- **feature PR**: the one PR from `feat/<slug>`, whose base is the default branch or the lower feature's branch.
- **stack**: a feature PR whose base is another unmerged `feat/<N>`. The lower PR merges first.
- **restack**: one command bringing each open feature PR level with its base again: retarget, merge forward, or rebase after a squash.
- **landing**: Gate 2's merge of a feature into `pilot`. The landing is not a merge into main.
- **legacy run**: a run whose record base is `pilot`. It keeps the release PR (A3).

## 5. Locked decisions

- **L1** F14 drops only the `export` keyword. Rejected: deleting names, since all six are used in their files.
- **L2** Only the user moves the default branch. No host verb merges (the allowlist is unchanged), and no tool pushes the default branch. Rejected: auto-merging the stack bottom-up, which would hand the user's SOP step to the tools.
- **L3** A forced push happens in one place only: `restack`'s rebase after a squash. It is `--force-with-lease=refs/heads/feat/<slug>:<tip fetched in the same command>`, on a branch whose open own-repo PR is retargeted and whose feature has landed on pilot. It never touches `pilot`, the default branch, or a branch whose run has not landed (slice work stands on that one). Rejected: rebasing on every restack, which would force-push without a squash to justify it.
- **L4** A fix reaches the PR above by merging the lower branch into the upper, never by rebase. Rejected: rebase-always (L3).
- **L5** A chain has two ends. The PR base is `feat/N` until N's PR reads merged (`prBase`, from the host). Integrate's base is `feat/N` until N's tip is in the default branch by ancestry. `chainGuard` (N lands on pilot first) is unchanged. Rejected: one end at the landing, as today, which would put pilot's commits into the PR.
- **L6** `feature-pr.mjs` computes the base through `prBase` on every write. The record's `base` is never rewritten. Rejected: restack writing the record, which would race the deck's status writes.
- **L7** The ADR number is committed on feat in the landing worktree after the suite is green, then feat is pushed, then pilot. It is the next number past pilot's. Rejected: amending pilot's merge, which leaves the PR with `NNNN-`.
- **L8** Gate 2's clean check stays against pilot (`deck/gate2-base.mjs`), since Gate 2 lands there.
- **L9** Only a run on origin with a host is cut from the default branch. Under `pilot.remote` other or `none` there is no PR, and today's `base pilot` stands.
- **L10** This run's ADR `docs/adr/NNNN-stacked-feature-prs.md` (ADR NNNN) supersedes ADR 0167 and amends ADR 0176.
- **L11** (the user's, itm_266cda499441: "No setting, go back by revert") Draft line 9 is dropped. There is no setting for the old release-PR shape, and the way back is reverting this feature's PR. Rejected: a `pilot.prs=release` setting.
- **L12** (the user's, itm_eb1c97b72c6b: "Never rewrite pilot") `pilot` is never rewritten or force-pushed. Under squash, `pilot sync` merges main forward, and a tree-identical merge pushes nothing. Rejected: rebuilding pilot from main plus the open stack.

## 6. Assumed decisions

- **A1** *assumed*: a test importer counts as a second importer. This is moot today (0 of 6 has one). Rejected: tests not counting.
- **A2** *assumed*: no gate guard against new dead exports in this run. A guard needs a parser or a new `npx` dependency. Rejected: `scripts/check-exports.mjs` in the gate.
- **A3** *assumed* (cutover, not L11's setting): a record with base `pilot` keeps the release path until none remains, so the 3 runs in flight (yellow-never-idle, audit-f12, home-store-guard) still reach main. No new run can choose that path. Kept path: S4 gates `releasePr` on the landed record's base being `pilot`. It costs about 20 changed lines in S4, plus `release.mjs` and its 9 tests living on. It is removed once no open run record has base `pilot` (`git grep -l '"base": "pilot"' docs/design/*/run.json` on a live ticket's branch is empty), by a follow-up audit ticket and not by a slice of this run, since the condition cannot be true while the 3 runs are in flight. Rejected path: delete `release.mjs` in S4 and have the user open one last `pilot → main` PR by hand once the 3 have landed. That costs one human step and a PR that folds 3 features again, against the SOP. S4 shrinks by about 20 lines and S4 deletes the 9 release tests.
- **A4** settled by L12.
- **A5** *assumed*, answered by the user on itm_bd8900cbbaee: "Restack resolves on B (default)", the default taken: a sibling conflict (A and B both off main, the same lines) is settled by `restack` merging main into an open feature branch that no longer merges clean. Generated files are regenerated (`merge-generated.mjs`), and a hand conflict exits 3 naming the file, for the lander on `feat/B`. Trade: pilot's resolution is made again on B. Rejected: `pilot base` stacking B on any unmerged feature it overlaps at the take, which makes longer stacks and makes B wait on A.
- **A6** *assumed*, answered by the user on itm_4d35092bb57b: "At each take and by hand (default)", the default taken: the pilot runs `pilot restack` after `pilot sync` at each take, and the user's step is the same command by hand. Trade: a merge into main sits unrestacked until the next take. Rejected: the deck polling the host, which is a new daemon loop.
- **A7** *assumed*: an unchained run's record base is the default branch's own name. `RUN_BASE` accepts a branch-name shape that does not start with `-`, and the scripts check it equals `remoteDefaultBranch`. Rejected: a `default` token, which no git ref names.
- **A8** *assumed*: `pilot.merge` has a reader only (`mergeMethodOf`). OPERATING documents `git config pilot.merge squash`. Rejected: a writer verb like `pilot host`, which adds a CLI surface for one key.
- **A9** *assumed*: chain depth stays 1 and the chain base stays the deck's concluding feature, now including a feature that has landed but is unmerged. Rejected: arbitrary depth.
- **A10** *assumed*: one run, 9 slices, with no Runs table. F14 is S1 and stays in, as the user merged it.
- **A11** *assumed*: the recut check (`deck/recut.mjs:141`) keeps comparing against pilot, where the plan lands. Out of this cut.
- red team: S5 (allocating before the push) would collide. If a landing allocated 0193 on feat, pushed it and then went red, the next landing would allocate 0193 again. L7 fixes this: commit locally, push feat only after the suite is green, then push pilot.
- red team: S3 alone would be undone. `feature-pr.mjs:184-189` re-edits the base on every status write, so a retarget made by restack would revert. L6 fixes this: both go through `prBase`.
- red team: S2 alone would leave a main-cut run unable to chain. `deck/tickets.mjs:66` offers only base `pilot`. S2 owns that line.
- red team: a gate1 for any main-cut design branch would be refused by `deck/lineage.mjs`. This is spec 13, in S2.
- red team: `bin/pilot.mjs` is wanted by S7 (the verb) and by S9 (the help text for land). S7 owns all of `bin/pilot.mjs`.

## 7. Out of scope

The deck polling the host (A6). Chains deeper than 1 (A9). A dead-export guard (A2). The recut check (A11). A writer verb for `pilot.merge` (A8). Migrating any open PR: the open release PR merges once, by the user.

## 8. Slices

Width 4; longest stem 5

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Six dead exports become private | 1-3 | `deck/pr-writes.mjs`, `scripts/base.mjs`, `scripts/integrate.mjs`, `scripts/measure-plain.mjs`, `scripts/remotes.mjs`, `scripts/vocabulary.mjs` | – | typescript | [S1](slices/S1.md) |
| S2 | A run is cut from main and its gate1 is accepted | 5, 13 | `scripts/base.mjs`, `deck/runs.mjs`, `deck/tickets.mjs`, `deck/lineage.mjs`, `scripts/pilot-branch.mjs`, `agents/pilot-architect.md` | S1 (`scripts/base.mjs`) | typescript, security | [S2](slices/S2.md) |
| S3 | Its feature PR targets main and shows only its commits | 4, 5 | `scripts/stack.mjs` (new), `scripts/feature-pr.mjs`, `scripts/integrate.mjs` | S1 (`scripts/integrate.mjs`), S2 (record base) | typescript, security | [S3](slices/S3.md) |
| S4 | The landing opens no release PR for a main-cut run | 4, 8, 12 | `scripts/land.mjs`, `scripts/release.mjs` | S3 (`prBase`) | typescript | [S4](slices/S4.md) |
| S5 | The ADR number rides on the feature branch | 9 | `scripts/adr-allocate.mjs`, `scripts/sync.mjs`, `scripts/land-adr.mjs` (new) | S4 (`scripts/land.mjs` order) | typescript | [S5](slices/S5.md) |
| S6 | The closing report says merge #A then #B | 7, 11 | `deck/closing-report.mjs`, `deck/store-items.mjs`, `deck/host.mjs` | S4 (`featureLine`) | typescript | [S6](slices/S6.md) |
| S7 | Restack retargets and merges forward | 6, 10 | `scripts/stack.mjs`, `bin/pilot.mjs` | S3 (`scripts/stack.mjs`) | typescript, security | [S7](slices/S7.md) |
| S8 | Restack rebases after a squash, leased | 6, 8 | `scripts/stack.mjs` | S7 (`scripts/stack.mjs`) | typescript, security | [S8](slices/S8.md) |
| S9 | The crew and the ADR say the new shape | 14 | `agents/pilot.md`, `agents/pilot-lander.md`, `docs/OPERATING.md`, `docs/adr/NNNN-stacked-feature-prs.md` (new), `docs/adr/0167-pilot-is-the-one-integration-line.md` | S4 (`featureLine`), S7 (`pilot restack`) | security | [S9](slices/S9.md) |

Reviewer short names are `pilot:<name>-reviewer`. S2 is the walking skeleton: `pilot base` prints `base main <sha>` and a gate1 cut from it is accepted. S1 runs first only because it shares `base.mjs`. Every test file a slice adds or edits is its own. S6 rebases on yellow-never-idle (`deck/store-items.mjs`). S5's `land-adr.mjs` is a new module that `land.mjs` calls through a one-line hook S4 leaves, so S5 owns no line of `land.mjs` (see S5).

## 9. Acceptance evidence

1. `pilot base` in a fresh take prints `base main <sha>` (S2). A design branch cut from it posts a gate1 that the deck accepts (spec 13).
2. The feature's draft PR on GitHub has base `main` and lists only the run's own commits (spec 4, 5).
3. Gate 2 lands it on pilot. `pilot land` prints `feature PR: #<n> into main`, and no PR with head `pilot` opens (spec 4, 8).
4. The PR's files show `docs/adr/0193-…`, not `NNNN-` (spec 9).
5. The closing report's human step reads "Merge #<n> with a merge commit" (spec 7, 11).
6. Temp-repo tests show B on A: retarget after a merge commit, a leased rebase after a squash, a fix merged forward, and a conflict exiting 3 (spec 6, 10). Pilot's push log holds no forced update (spec 8).
7. F14's greps and `npm test` (spec 1-3). The legacy release tests stay green (spec 12).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 Six dead exports become private | planned | `slice/audit-f14-s1` | – | – | – | 1-3 |
| S2 A run is cut from main | planned | `slice/audit-f14-s2` | – | – | S1 | 5, 13 |
| S3 Feature PR targets main | planned | `slice/audit-f14-s3` | – | – | S1, S2 | 4, 5 |
| S4 No release PR for a main-cut run | planned | `slice/audit-f14-s4` | – | – | S3 | 4, 8, 12 |
| S5 ADR number on the branch | planned | `slice/audit-f14-s5` | – | – | S4 | 9 |
| S6 Closing report: merge #A then #B | planned | `slice/audit-f14-s6` | – | – | S4 | 7, 11 |
| S7 Restack retargets and merges forward | planned | `slice/audit-f14-s7` | – | – | S3 | 6, 10 |
| S8 Restack rebases after a squash | planned | `slice/audit-f14-s8` | – | – | S7 | 6, 8 |
| S9 The crew and the ADR say it | planned | `slice/audit-f14-s9` | – | – | S4, S7 | 14 |
| audit-f14 | planned | `feat/audit-f14` | – | – | S1-S9 | 1-14 |
