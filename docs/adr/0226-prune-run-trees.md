---
status: proposed
date: 2026-11-27
tags: [worktrees, landing, safety]
supersedes: []
superseded_by: []
paths: [scripts/worktrees.mjs]
---
# A run's trees are named by tag, branch, land dir and, guarded, by name

We decided that one function, `runTrees(repo, slug)`, names every worktree of a run with how it was reached (`tag`, `branch`, `land` or `name`), and that `pilot worktrees prune --run` selects through it on the landed path and the not-landed one alike. Untagged trees are reached by name, with a guard that lets the longest known slug win. This amends ADR 0225 L7 (the run set is now widened by name, in tree membership only) and ADR 0171 (a landed prune reaches the trees a name gives the run).

## Context

After `prune --run prune-worktrees` landed, 8 of the run's trees stayed registered and 2 were named. The other 6 were clean and landed: five `fix/prune-worktrees-<any>` fix-round trees and the detached `pilot-fund-prune-worktrees`. `isRunBranch` takes `fix/<slug>` and `fix/<slug>-s<n>` only, a detached tree is the run's only by its `pilot-run` tag, and 0 of the 41 trees then registered in this repository carried a tag, because the installed agents do not yet tag the trees they add. The not-landed prune selected by `isRunBranch` alone, and the deck's landing always takes that path.

## Decision

- **L1** Membership widens in `runTrees`, never in `isRunBranch`: `pilot branches prune` deletes remote branches through `isRunBranch`, and a prefix match there would delete another run's.
- **L2** The not-landed path selects through `runTrees` too, less the land dir, which the landing removes itself after `prune`; the landed path takes the land dir. One selection, so every run tree gets exactly one line on both paths.
- **L3** One fold per tree: `by` travels with the path, so `prune` never re-derives how a tree became the run's. A tree is `land` when it is the land dir, else `tag`, else `branch`, else `name`.
- **A1** *assumed*: an untagged tree is the run's by name when it is on `fix/<slug>-<any>` (not a run branch), on `design/<slug>-recut`, or detached at `<home>-fund-<slug>`, and no longer known run claims it by its own run branch or name. A known run is a slug with a `feat/<s>` or `design/<s>` ref, local or on any remote, or a tree tagged to it; a `design/` ref ending `-recut` makes no known run, since it is its run's re-cut.
- **A2** *assumed*: a tree reached by name alone keeps its untracked files even after a landing and is never forced (prune-run-trees S2).

## Rejected

- *A prefix match in `isRunBranch`*: it would reach other runs' remote branches through `pilot branches prune`.
- *Two selections, one per path*: the bug; the not-landed path named none of the trees above.
- *Tags only*: they reach none of the trees registered today.
- *One removal rule for every tree*: a wrong name guess would delete untracked work.

## Consequences

`runWorktrees`, now `runTrees`' paths, gains the reach for its other callers too: the closing report's "Worktrees left" and the abandon prune. A run with no ref and no tag can still have a tree claimed by a guess of a shorter slug; A2 bounds what that costs.
