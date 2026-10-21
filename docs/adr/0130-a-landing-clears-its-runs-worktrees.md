---
status: proposed
date: 2026-10-11
tags: [git, landing, worktrees]
supersedes: []
superseded_by: []
paths: [scripts/worktrees.mjs, scripts/land.mjs, deck/store-runs.mjs, docs/design/clean-landing/architecture.md]
---
# A landing clears its run's worktrees

We decided that `pilot land`, once it has landed, removes the worktrees of its own run (branches `feat/<slug>`, `design/<slug>`, `fix/<slug>`, `slice/<slug>-*`, `fix/<slug>-*`) whose HEAD is on `origin/pilot` and whose tree is clean, with their local branches, through `pilot worktrees prune`'s refusal-safe removal, and names every one it keeps.

## Context

ADR 0081's prune ran against the default branch, which a landed feature reaches only when the user merges its PR, and the pilot's rule to run it then never fired inside a run; `git worktree list` reached 70 lines.

## Decision

**The landing clears, after it lands (L5).** `land` changes directory to the main checkout and calls `prune(repo, 'origin/pilot', { run: slug })`; its lines join land's output, which the deck writes on the gate2 thread. The feature worktree goes too (A1, assumed); a fix after landing is cut fresh from `origin/feat/<slug>`.

**Removal stays refusal-safe (L6)**: never `--force`, never `branch -D`, never a remote branch; a worktree in use, dirty or unmerged is kept and named, and no removal failure fails the landing. Another run's worktrees are never touched.

**The landing readies the PR (L9).** Beside its `landed on pilot` comment, `land` runs `gh pr ready` on the feature's open PR against the default branch; a refusal prints `pr ready failed: <why>`, the landing stays landed, and the ticket's row carries the line.

## Consequences

Amends ADR 0081: the run filter and the pilot base are new; the classification is unchanged.
