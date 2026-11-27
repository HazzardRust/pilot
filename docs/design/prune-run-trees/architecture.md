# prune --run reaches every tree of a run

Feature `prune-run-trees` · ticket `itm_01399e7fa4db` · base `main` at `71a98d6` · amends ADR 0225 (which trees are the
run's) and ADR 0171 (the landed rule's reach)

## Overview

- **What changes**: Cleaning up after a finished run now finds every working copy the run made and says what happened to each.
- **Why**: After a landing, six clean copies were left behind with no word about them, and the user had to hunt them down.
- **What you'll notice**: The cleanup lists one line per copy, removed or kept with a reason. Leftover fix-round and review copies disappear on their own.
- **Can it be undone**: One-way for each copy removed, but only clean copies whose work is already landed go. Copies with changes stay and are named.

## 1. Problem

After a landing, `pilot worktrees prune --run <slug>` leaves some of the run's worktrees registered and names none of
them. After `prune --run prune-worktrees`, 8 trees were still registered and only 2 were named (`kept merged-dirty` s2,
`kept open` s9). The other 6 were clean, with HEAD already in the pilot branch: `fix/prune-worktrees-drift`, `-drift2`,
`-drift3`, `-macos`, `-windows`, and the detached `pilot-fund-prune-worktrees`. The prebuilt-rune landing left a
`-drift` slice tree and a `design/<slug>-recut` tree the same way. The user found and removed them by hand.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | `pilot worktrees prune --run <slug>` reaches the run's slice trees and also its fix-round trees (`fix/<slug>-<any>`), its re-cut tree (`design/<slug>-recut`) and the fundamentalist's detached tree (tagged, or untagged at `<repo>-fund-<slug>`). | Test: a landed fixture with one clean tree of each kind; prune's output has 4 of 4 `removed` lines and `git worktree list` names 0 of them. |
| 2 | Every tree of the run gets exactly one line (`removed`, `kept <state>` or `NOT removed`), on both the landed path and the not-landed one; none is passed over silently. | Test: on both paths, the set of paths in prune's lines equals `runTrees`' set (land dir aside off the landed path, F4). After a landing, `git worktree list` names 0 trees of the run that prune did not name. |
| 3 | Another run's tree is never reached. `fix/prune-worktrees-drift` is not run `prune`'s while `prune-worktrees` is a known run, and the longest known slug wins. *(implied)* *practitioner: git maintainer, false-positive deletion* | Test: slugs `x` and `x-y` with `fix/x-y-drift`: 0 trees claimed by `x`, 1 by `x-y`; the `isRunBranch` pins in `worktrees.test.mjs` hold unedited. |
| 4 | *assumed (A2)*: a tree reached by name alone (untagged, not an exact run branch) keeps its untracked files. It prints `kept dirty <dir>` and is never forced. | Test: a guessed fix tree with one untracked file after a landing prints `kept dirty`, and the file is still on disk; a tagged tree in the same state is removed, as today. |
| 5 | Over this repository's real registered trees, no tree is claimed by two runs. *(implied)* *practitioner: the real `git worktree list`* | Run, read-only: `runTrees` for every known slug over the shared checkout's 41 trees; 0 paths in two sets. |

Line 1 cannot widen `isRunBranch`: `pilot branches prune` deletes remote branches through it (`scripts/branches.mjs:190`), and
prune-worktrees F3 ruled the prefix match out for that reason. Name inference lives in the tree membership only.

## 3. Findings

- **F1** Two selections (`scripts/worktrees.mjs:331-333`). The landed path takes `runWorktrees` (tag ∪ `isRunBranch` ∪ land dir,
  `:210-217`). The not-landed path takes `isRunBranch` alone. The deck's landing (`scripts/land.mjs:213`) passes no `landed`, so
  it always takes the second.
- **F2** `isRunBranch` (`:272-276`) takes `fix/<slug>` and `fix/<slug>-s<n>` only, so `fix/<slug>-drift` and
  `design/<slug>-recut` never match. A detached tree is the run's only by its `pilot-run` tag (`:166-199`).
- **F3** 0 of the 41 trees registered in the shared checkout carry a tag. The installed plugin's agents (cache 0.9.11) do
  not yet call `pilot worktrees add --run`, so every detached fund or qa tree today is reachable by nothing.
- **F4** `land.mjs`'s `clear` removes the land dir itself after `prune` (`:215-216`). If the not-landed path took the land
  dir, the landing would print `kept open` and then `removed` for one dir.
- **F5** `removeTree(…, { landed: false })` (`scripts/worktree-remove.mjs:181-184`) already counts untracked files and never
  forces. Spec 4 is a per-tree choice of that flag, not a new rule.
- **F6** `runWorktrees` also feeds the closing report's "Worktrees left" (`deck/closing-report.mjs:243`) and the abandon
  prune (`:390`). Both gain the reach and keep their own rules.
- **F7** `landedRun` (`:154-160`) reads the local `feat/<slug>`. Once the landed prune has removed the feat tree with `-D`, a
  second `prune --run` takes the not-landed path, which spec 2 now covers.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Run membership | `runTrees(repo, slug, view?)`, `runWorktrees` its paths | tag map, `isRunBranch`, land dir, name inference with the known-run guard; `prune`'s second selection (`:333`) | local-substitutable (a temp repo) |
| Prune outcome | `prune(repo, base, opts) -> { removed, kept, failed }` | per-tree `removeTree` landed flag by `by` | local-substitutable |

The deletion test keeps `isRunBranch` (its remote-branch callers need the exact-name rule) and removes `prune`'s private
branch-only selection.

## 4. Ubiquitous language

- **run tree**: a registered linked worktree that `runTrees` names for a slug.
- **known run**: a slug with a `feat/<s>` or `design/<s>` ref (local or any remote) or a tag.
- **guessed tree**: a run tree reached by name alone (`by: 'name'`); it carries no tag and is on no exact run branch.

## 5. Locked decisions

- **L1** Membership widens in `runTrees`, never in `isRunBranch`. Rationale: F2 and `scripts/branches.mjs:190`. Rejected: a
  prefix match in `isRunBranch`, which would delete other runs' remote branches.
- **L2** The not-landed path selects through `runTrees` too, less the land dir. Rationale: F1, F4, spec 2. Rejected: keeping
  two selections, which is the bug.
- **L3** One fold per tree: the `by` field travels with the path, so `prune` never re-derives provenance. Rejected: a
  second lookup inside `prune`.
- **L4** Grilling depth: `forks`, assumed. itm_c083f5b319f1 closed on the deck's 20-minute default, not on the user's
  press. Rejected: a deeper grill, which waits on an answer that did not come.
- The run's ADR, `docs/adr/NNNN-prune-run-trees.md`, records L1-L3 and A1, A2. The landing numbers it.

## 6. Assumed decisions

- **A1** *assumed*: untagged trees are reached by name (`fix/<slug>-<any>`, `design/<slug>-recut`, detached
  `<repo>-fund-<slug>`), with the known-run guard. Trade: a name guess can still misattribute a tree of a run with no ref
  and no tag; A2 bounds that. Rejected: tags only, which reach none of today's 41 trees (F3).
- **A2** *assumed*: a guessed tree is judged by the strict rule (untracked counts, no `--force`) even after a landing.
  Trade: a guessed fix tree with stray scratch files stays and is named `kept dirty`. Rejected: one rule for all, which lets a
  wrong guess delete untracked work.
- **A3** *assumed, on the deck (itm_a25add987239)*: leftover remote `fix/<slug>-*` branches (land.mjs `deleteRunBranches`)
  are out of scope here and go to a separate ticket. Trade: origin keeps `fix/prune-worktrees-drift*` until then. Rejected:
  folding it in, which moves pilot-fork L4/L5 and touches the shared remote.
  Answer (user, itm_a25add987239): "Separate ticket (default)".
- **A4** *assumed, on the deck (itm_f4215582c876)*: QA runs prune for real only in a scratch git repo fixture, and
  read-only (`runTrees`, never `prune`) over this repo's registered trees. Trade: no real removal on the shared checkout is
  watched. Rejected: a live prune on the shared checkout, which could remove another session's tree.
- red team: S1's first behaviour, walked against `land.mjs:213-216`. Taking the land dir in the not-landed path printed two
  lines for one dir (F4), so L2 excludes it. A tagged tree on the not-landed path is new reach; it is judged by the strict
  rule and the existing pin `worktrees-landed.test.mjs:117-124` stays green, since the land dir is outside it.
- red team: S2 alone would half-build the provenance seam. `by` is created in S1, where L2 already uses it, so S2 only
  reads it.

## 7. Out of scope

Remote branches (A3). `isRunBranch` and `pilot branches prune`. Making the installed agents tag their trees (shipped in
prune-worktrees S6, awaiting a release). The no-`--run` sweep. `landedRun`'s reading of the local feat ref (F7).

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `prune --run` names every tree of the run (walking skeleton) | 1, 2, 3, 5 | `scripts/worktrees.mjs` (`runTrees`, `runWorktrees`, `prune` selection), `scripts/test/worktrees-run-trees.test.mjs` (new), `docs/adr/NNNN-prune-run-trees.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A guessed tree keeps its untracked files | 4 | `scripts/worktrees.mjs` (`prune` removal flag), `scripts/test/worktrees-run-trees.test.mjs` | S1 (`scripts/worktrees.mjs`, `runTrees`' `by`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

## 9. Acceptance evidence

In a scratch repo with a bare remote, on Windows:

1. A landed run with a slice, a `fix/<slug>-drift`, a `design/<slug>-recut` and a detached `<repo>-fund-<slug>` tree, all
   clean: `pilot worktrees prune --run <slug>` prints 4 `removed` lines and `git worktree list` names none (spec 1, 2).
2. The same with the local feat branch deleted first: every tree still gets one line (spec 2).
3. A run `x` beside `x-y` with `fix/x-y-drift`: prune `--run x` names no `x-y` tree (spec 3).
4. A guessed fix tree with an untracked file prints `kept dirty` and the file stays (spec 4).
5. On the shared checkout, read-only: no tree is claimed by two slugs (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5 |
| S2 | planned | | | | S1 | 4 |
| prune-run-trees | planned | feat/prune-run-trees | | | S1-S2 | 1-5 |
