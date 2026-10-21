---
status: proposed
date: 2026-10-21
tags: [git, lander]
supersedes: []
superseded_by: []
paths: [docs/design/lander-tail/architecture.md, scripts/worktrees.mjs, agents/pilot-lander.md]
---
# A landed run's prune keeps only tracked dirt

After a landing the lander's `pilot worktrees prune --run <slug>` left most of the run beside the checkout: the feat tree read `open` because the deck mirrored a run-record commit onto it after landing, an unmoved qa or slice tree read `open` (ADR 0081 L10), an untracked or ignored file such as `node_modules/` read `merged-dirty`, and the detached `<checkout>-land-<slug>` dir was never the run's at all (`docs/design/lander-tail/architecture.md` §3, spec 3). So we decided that once a run has **landed**, its prune takes every run worktree but one with tracked dirt, amending ADR 0081 L5 and L10 for landed runs only.

- **Landed**: `feat/<slug>`'s head, less a trailing run of single-parent commits that change only `docs/design/<slug>/run.json`, has moved since the branch was cut (its reflog) and is an ancestor of the fetched base (`landedRun`, A1), so a feat branch just cut from the base is not landed. Only the CLI's `--run` sets it; `prune` without `landed`, as land's `clear()` calls it, is ADR 0081 unchanged (L5, A2).
- **The run's trees**: `runWorktrees`, the run's branches (`isRunBranch`) and the land dir at `keptDir(<checkout>, feat/<slug>)`, never the main checkout.
- **What goes**: a merged tree, its record-only tail stripped likewise, whether it moved or not, whatever untracked or ignored files it holds (A4), by `git worktree remove --force` and its branch by `git branch -D`.
- **What stays**: a tree whose `git status --untracked-files=no` shows a change other than its run.json modified in place (`kept merged-dirty <path>`), a live holder (`kept live <pid> <path>`, ADR 0163, A5), a locked tree, an unmerged one. The tracked status is read again right before `--force`, after the run.json copy is restored. A holder is never killed. Remote branches are never touched.

Rejected:
- Always relaxing: a fresh worktree of a live run would go (ADR 0081 L10's reason).
- Unmoved only, untracked still keeping a tree: QA's leftovers keep the qa tree after every landing (A4, answered "Both").
- Stopping the run-record mirror after landing: changes the record seam, and `finished` itself mirrors (A1).
- `fs.rm` of the directory: leaves a `prunable` entry and bypasses git's lock check.
