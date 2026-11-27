---
status: proposed
date: 2026-11-28
tags: [git, branches, remotes, landing, safety]
supersedes: []
superseded_by: []
paths: [scripts/run-names.mjs, scripts/branches.mjs, scripts/land.mjs]
---
# A run owns the branches its name names, unless a longer known run does

We decided that one pure rule, `runOwns(branch, slug, known)` in `scripts/run-names.mjs`, says which run a remote branch belongs to, and that a landing deletes every merged branch its run owns through it. A run owns `feat|design|fix|qa/<slug>`, `fix|slice|qa/<slug>-<any>` and `design/<slug>-recut`, unless a longer known run names the branch too. This amends ADR 0134, whose landing deleted only `design/<slug>`, `qa/<slug>` and the `-s<n>` names, so every other branch of a run stayed on the remote after it landed.

## Context

A landed run left `fix/<slug>`, `fix/<slug>-<any>`, `slice/<slug>-<any>`, `qa/<slug>-<any>` and `design/<slug>-recut` on origin, because the landing's selector named only exact names. Two selectors fed one deleter: the landing's own, and `pilot branches prune`'s `isRunBranch`. Widening a prefix match alone would hand run `x` the branches of run `x-y`.

## Decision

- Ownership is a name plus the longest-known-slug guard, and `deleteMerged`'s merged check stays the second guard, so a misattributed name can only lose a ref whose commits `feat/<slug>` already holds (L2). Probed over this repository's origin: 107 heads, 58 known runs, 93 claimed, 0 claimed twice.
- A known run is a slug with a `feat/<s>` ref, or a `design/<s>` ref where `s` does not end `-recut`; a re-cut design branch is never its own run (L3).
- `isRunBranch` is not changed: it also picks the local worktrees a landed prune removes (L4).
- The known set is built from every name `deleteMerged` reads, each remote's list and the local refs, which errs towards more known runs and fewer deletions (L5). `select` is called as `select(branch, known)`; a one-argument select is unchanged.
- The landing takes `slice/<slug>-<any>`, `qa/<slug>-<any>` and exact `fix/<slug>` beside `fix/<slug>-<any>` and `design/<slug>-recut` (L6), and never `feat/<slug>`.
- `pilot branches prune --slug` selects by the same rule (L7).
- The rule lives in its own pure module, not in `isRunBranch` (L8).
- The work was cut from main beside prune-run-trees, whose own guard can later adopt `runOwns` (L9).
- Leftovers of already-landed runs are swept by hand with `pilot branches prune --slug <s> [--dry-run]`; there is no sweep-all command (L10).

## Consequences

- A landing deletes more names per run, and none of a longer known run's.
- A run with no `feat/` or `design/` ref is unknown, so a shorter slug may claim its merged branches; the merged check bounds that to a name, never a commit.
- Two guards name a run's things until prune-run-trees adopts `runOwns`: this one for remote branches, `isRunBranch` for local worktrees.
