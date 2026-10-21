---
status: accepted
date: 2026-10-08
tags: [git]
supersedes: []
superseded_by: []
paths: [docs/design/audit-fixes/architecture.md, scripts/worktrees.mjs]
---
# Prune removes only merged-clean worktrees

Merged worktrees piled up beside the checkout (32 at the audit, 24 merged), so Glob, Grep and branch choice saw stale copies, and nothing in the crew removed them (`docs/design/audit-fixes/architecture.md`, F14, L5, L6, L10). So we decided `pilot worktrees` lists every worktree by state against a fetched base, and `pilot worktrees prune` removes only the merged-clean ones, in one module, `scripts/worktrees.mjs`.

- **Merged-clean**: not the main checkout, not locked, moved since it was created (HEAD differs from the oldest entry of its branch's reflog, if on one, and of its own HEAD reflog), HEAD an ancestor of the base, and `git status --porcelain --untracked-files=all` empty. No reflog, a failed status or a missing directory reads as `open`.
- **The removal**: `git worktree remove` without `--force`, then `git branch -d`, never `-D`, so git itself refuses a dirty tree or an unmerged branch if our classification were wrong. A refusal is reported and exits 1; it is never retried harder.
- **The base**: fetched first; a failed fetch, or a base that is not a remote-tracking ref, stops the prune before anything is removed.

Rejected:
- Deleting directories with `fs.rm`: bypasses every check git makes.
- Deleting remote branches (`push --delete`): irreversible for other clones; GitHub's own setting handles them.
- Judging merged by the upstream or PR being gone: needs `gh`, and a just-pushed branch has neither.
- A minimum age instead of the reflog test: a guess that is wrong both ways.

**Consequences:**
- A worktree just cut from the base, or at an already merged tip, stays: another session's agent may be about to work in it.
- `git branch -d` judges against the branch's upstream or the main checkout's HEAD, so a merged branch whose upstream lags can survive its worktree; the prune names it.
- `git worktree remove` without `--force` refuses tracked changes and untracked files but deletes ignored ones (`.env`, build output). A worktree whose only extra files are ignored counts as clean and loses them; regenerate or keep them outside the worktree.
- A worktree added on an existing branch counts as moved only once its own HEAD reflog moves, so re-adding a merged branch does not make it prunable.
