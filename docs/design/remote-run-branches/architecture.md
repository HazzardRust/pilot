# A landing deletes every branch of its run on origin

Feature `remote-run-branches` · ticket `itm_233f0feecc01` · base `main` at `71a98d6` · amends ADR 0134 (which merged run
branches a landing deletes) and pilot-fork spec 6, 8 (the landing's exact-name selection)

## Overview

- **What changes**: When a finished run lands, all of its leftover branches on GitHub are now cleaned up. That includes fix-round, re-cut and extra test or slice branches.
- **Why**: After the last two landings, origin still held the run's `fix/<slug>-drift`, `-macos`, `-windows` and similar branches, so they had to be found and deleted by hand.
- **What you'll notice**: The landing's `deleted:` line lists more branches, and `pilot branches prune --slug <slug>` clears the same set for runs that already landed.
- **Can it be undone**: A deleted branch can be pushed again from its sha. Only branches whose work is already in the feature are deleted, so no commit is lost. Another run's branch and any unmerged branch stay, and are named.

## 1. Problem

After a landing, origin still holds some of the run's branches. The landing selects only exact names and `-s<n>` names
(`scripts/land.mjs:183-186`), so `fix/<slug>-drift`, `-macos`, `-windows` and `design/<slug>-recut` stay. Today origin
holds 5 `fix/prune-worktrees-*` branches, all merged into `feat/prune-worktrees`, and 5 more merged leftovers of other runs
(`qa/<slug>-2`, `slice/<slug>-s8fix`, `slice/<slug>-base`).

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | After a landing, the run's merged `fix/<slug>`, `fix/<slug>-<any>`, `slice/<slug>-<any>`, `qa/<slug>-<any>` and `design/<slug>-recut` branches are deleted on the run remote, as `design/<slug>`, `qa/<slug>` and the `-s<n>` names are today (L6). `feat/<slug>` is never deleted by a landing. | Test on a scratch bare remote: a landed run with `fix/x`, `fix/x-drift`, `slice/x-base`, `qa/x-2` and `design/x-recut` pushed and merged into `feat/x`: 5 of 5 in `deleted:`, 0 of them in `git ls-remote`, and `feat/x` still listed. |
| 2 | Another run's branch is never deleted: a branch belongs to the longest known slug that names it, so `fix/prune-worktrees-drift` is not run `prune`'s while `prune-worktrees` is a known run. | Test: runs `x` and `x-y` (`feat/x-y` on the remote), `fix/x-y-drift` and `design/x-y-recut` merged into `feat/x`: landing `x` deletes 0 of them. The land-prune pin `design/x-y`, `fix/x-y-s1` kept holds unedited. |
| 3 | An unmerged branch of the run is kept and named. | Test: an unmerged `fix/x-late`: the landing's `kept:` line names `fix/x-late (not merged into origin/feat/x)`, 1 of 1 kept, and `git ls-remote` still lists it. |
| 4 | `pilot branches prune --slug <slug>` selects by the same rule, `feat/<slug>` included as today (L7). | Test: `prune --slug x` deletes a merged `fix/x-drift` and keeps `fix/x-y-drift` (with `feat/x-y` known); 1 deleted, 1 kept; output `deleted fix/x-drift`. |
| 5 | Over this repo's real origin, no branch is claimed by two known runs. *(implied)* *practitioner: release engineer, the real `git ls-remote`* | Run, read-only: `runOwns` for every slug of `knownRuns` over `git ls-remote --heads origin`: 0 names in two sets. Probe at design time: 104 heads, 57 known, 91 claimed, 0 twice. |
| 6 | The leftovers already on origin can be listed with nothing deleted. *(implied)* *practitioner: release engineer, a dry run before a bulk delete* | Run on this repo: `pilot branches prune --slug prune-worktrees --dry-run` prints `would delete` for 5 of 5 `fix/prune-worktrees-*` and `kept slice/prune-worktrees-s9: not merged …`; `git ls-remote origin` still lists them all afterwards. |

## 3. Findings

- **F1** Two remote selectors, one deleter. The landing uses land.mjs `ours` (`:183-186`: `design|qa/<slug>`, `fix|slice/<slug>-s<n>`,
  no exact `fix/<slug>`). `pilot branches prune` uses `isRunBranch` (`scripts/worktrees.mjs:272`, `scripts/branches.mjs:190`).
  Both pass `select` to `deleteMerged` (`scripts/branches.mjs:106`). `integrate` passes `name === slice` (`scripts/integrate.mjs:659`).
- **F2** `deleteMerged` deletes only a merged branch (`whyKept`, `:150-172`): its PR merged at its tip, or, with no PR, its tip a
  proper ancestor of `origin/<into>`, which is `feat/<slug>` for a landing. A wrongly attributed name can therefore only lose a
  ref whose commits feat/<slug> already holds. The prefix guard `DELETABLE` (`:23`) still refuses anything outside
  `slice|fix|qa|design|feat/`.
- **F3** `qa/prune-worktrees` is merged, has no PR and is already selected, yet it is still on origin. Its tip predates the
  landing, and the landing's output was not recorded, so the cause cannot be seen. A re-push by the concluding QA is
  likely. Out of scope; spec 6's dry run shows it.
- **F4** prune-run-trees (signed, unbuilt) counts every `design/<s>` ref as a known run, so `design/x-recut` makes `x-recut`
  known and it claims its own tree. The pilot is correcting that run's S1 with this run's rule.
- **F5** `isRunBranch` also picks the local worktrees a landed prune force-removes (`scripts/worktrees.mjs:333,353`). ADR 0225
  L7 and prune-run-trees L1 keep it exact, so this run leaves it alone.
- **F6** `select` callers pass one argument, so a second argument `known` changes no existing caller or test
  (`scripts/test/branches.test.mjs` `only(...)`).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Run ownership | `knownRuns(names)`, `runOwns(branch, slug, known)` in `scripts/run-names.mjs` | land.mjs `ours`; `branches prune`'s use of `isRunBranch` | in-process (pure) |
| Merged deletion | `deleteMerged({ git, host, select, into, … })`, `select(branch, known)` | the known set built from every ref it reads | local-substitutable (a scratch bare remote) |

Deletion test: removing `run-names.mjs` would bring its rule back in two callers, so it stays. land.mjs `ours` and
`branches prune`'s `isRunBranch` use go: each is a one-line call to `runOwns`. `isRunBranch` stays for worktrees (F5).

## 4. Ubiquitous language

- **known run**: a slug with a `feat/<s>` ref, or a `design/<s>` ref where `s` does not end `-recut`, on any remote read or locally.
- **owner**: the longest known run whose slug names the branch, or the slug asked for when no longer known run does.
- **leftover**: a run branch still on the remote after its run landed.

## 5. Locked decisions

- **L1** Grilling depth: `every`, chosen by the user on itm_bb7c1eef1d7e. Every user-answerable default went to the deck.
- **L2** Ownership is decided by name plus the longest-known-slug guard, and `deleteMerged`'s merged check stays the second
  guard (F2). Rationale: probing the rule over the 104 real heads finds 0 claimed twice. Rejected: tags on remote branches,
  which nothing writes.
- **L3** A design name ending `-recut` is never a known run (F4). Rejected: counting every `design/<s>`, which makes each
  re-cut branch its own run.
- **L4** `isRunBranch` is not changed (F5). Rejected: widening it, which moves which local trees a landed prune force-removes.
- **L5** The known set is built from every ref `deleteMerged` reads (each remote's list plus local refs), which errs towards
  more known runs and so fewer deletions. Rejected: origin alone, which on a non-origin run remote misses its runs.
- **L6** *the user, itm_9ca233492317 "Include all"*: `slice/<slug>-<any>`, `qa/<slug>-<any>` and exact `fix/<slug>` join
  fix-any and design-recut. Trade: more names deleted per landing. Rejected: fix and recut only.
- **L7** *the user, itm_a9964690b786 "Same rule"*: `pilot branches prune --slug` selects through `runOwns`. Trade: the
  manual sweep deletes more names. Rejected: landing only.
- **L8** *the user, itm_6c53cab8c823 "New run-names module"*: the rule lives in a new pure `scripts/run-names.mjs`. Trade:
  one more module. Rejected: widening `isRunBranch` (L4).
- **L9** *the user, itm_7712c1b311db "Stand alone on main"*: cut from main. The files are disjoint from prune-run-trees S1
  (`worktrees.mjs`), so the two runs go in parallel; that run's guard, fixed for `-recut` at 4a04a18, can later adopt
  `runOwns`. Trade: two guards until then. Rejected: cut from feat/prune-run-trees, a stack behind an unbuilt run.
- **L10** *the user, itm_b66d248fd026 "By hand, per slug"*: leftovers of already-landed runs are swept with
  `pilot branches prune --slug <s> [--dry-run]`; no new command. Trade: a manual step per old slug. Rejected: a sweep-all
  command that bulk-deletes on origin.
- **L11** *the user, itm_bfcc0a17a91b*: real deletes run only against a scratch remote; on this repo only
  `pilot branches prune --slug prune-worktrees --dry-run` and read-only `ls-remote`. Rejected: a live sweep of origin in QA.
- The run's ADR, `docs/adr/NNNN-remote-run-branches.md`, records L2-L10. The landing numbers it.

## 6. Assumed decisions

None open: every default went to the user (L1) and was answered (L6-L11).

- red team: S1's first behaviour, walked against `scripts/test/land-prune.test.mjs:58,92`. `design/x-y` makes `x-y` known, so
  `fix/x-y-s1` stays `x-y`'s and the pin holds. Without L3, a `design/x-recut` in the same fixture would be its own run and
  spec 1 would fail; L3 covers it, and S1 pins it.
- red team: the S1/S2 split. `deleteMerged`'s `known` argument is built in S1, where the landing already needs it, so S2
  only reads it and no seam is half-built by two slices. Both edit `scripts/branches.mjs`, hence S2 after S1.
- red team: unknown slug. A branch like `fix/wait-50` with no `feat/wait-50` is claimed by a run `wait`, but only if merged
  into `feat/wait` (F2), so it costs a name, never a commit.

## 7. Out of scope

`isRunBranch` and local worktrees (prune-run-trees). Odd prefixes (`drift/`, `fix2/`, `qa3/`), which the guard refuses.
`feat/<slug>` deletion by a landing. Why `qa/prune-worktrees` survived (F3). A sweep-all command (L10).

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A landing deletes every merged branch it owns (walking skeleton) | 1, 2, 3, 5 | `scripts/run-names.mjs` (new), `scripts/branches.mjs` (`deleteMerged` known set), `scripts/land.mjs` (`deleteRunBranches`), `scripts/test/run-names.test.mjs` (new), `scripts/test/land-prune.test.mjs`, `docs/adr/NNNN-remote-run-branches.md` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | `pilot branches prune --slug` clears the same leftovers | 4, 6 | `scripts/branches.mjs` (`main`'s select), `scripts/test/branches.test.mjs` | S1 (`scripts/branches.mjs`, `runOwns`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

## 9. Acceptance evidence

In a scratch repo with a bare remote, on Windows, never this repo's origin for a real delete:

1. A landed run `x` with `fix/x`, `fix/x-drift`, `slice/x-base`, `qa/x-2`, `design/x-recut` merged: `deleted:` names all 5,
   `git ls-remote` lists none, and `feat/x` stays (spec 1).
2. Beside it, a run `x-y` with `feat/x-y`: none of `fix/x-y-drift`, `design/x-y-recut` deleted (spec 2).
3. An unmerged `fix/x-late`: named on the `kept:` line, still listed (spec 3).
4. `pilot branches prune --slug x` on the same remote deletes `fix/x-drift` and keeps `fix/x-y-drift` (spec 4).
5. On this repo, read-only: `runOwns` over origin's heads, 0 claimed twice (spec 5), and
   `pilot branches prune --slug prune-worktrees --dry-run` lists the 5 leftovers and deletes nothing (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5 |
| S2 | planned | | | | S1 | 4, 6 |
| remote-run-branches | planned | feat/remote-run-branches | | | S1-S2 | 1-6 |
