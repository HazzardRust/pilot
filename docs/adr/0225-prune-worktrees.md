---
status: proposed
date: 2026-11-25
tags: [worktrees, landing, safety]
supersedes: []
superseded_by: []
paths: [scripts/worktree-remove.mjs, scripts/worktrees.mjs]
---
# Every worktree is pruned when its job ends, through one guarded removal

We decided that every removal of a worktree goes through one guarded function, `removeTree`, behind `pilot worktrees remove|prune`, which unlinks a tree's links before git removes it, checks the dir is gone, and otherwise keeps the tree and names it in one line `kept <state> <dir>`. This amends ADR 0081 (what a prune may take) and ADR 0171 (a landed run's forced prune).

## Context

Trees outlived their jobs: design trees beside their feat trees, detached QA scratch trees, and dirs git no longer listed. On git 2.56.0.windows.4, `git worktree remove --force` on a tree whose `node_modules` is a junction into a sibling tree exits 0, drops the registration, keeps the target's files and leaves the dir and the junction on disk (architecture F5): an orphan dir that trusting git's exit code never sees. Each crew agent removed trees its own way, `Remove-Item -Recurse -Force` among them.

## Decision

- **L1** One guarded removal, `removeTree(repo, dir, { landed, holder, remove })`; every crew removal is `pilot worktrees remove|prune`. `sync.mjs`'s `removeWorktree` stays for the deck's own temp dirs.
- **L2** Links and junctions among a tree's untracked and ignored entries are unlinked first, never followed; after the remove step the dir must be gone, else `kept leftover`. A removal git refuses is `leftover` too.
- **L3** The deck's `docs/design/*/run.json` is never dirt, modified, added or untracked: it is put back to HEAD, or deleted when HEAD has none, before the removal. A deleted or renamed record is dirt.
- **L4** A live holder keeps a tree (`live <pid>`) and is never killed (ADR 0163). A locked tree, the main checkout, a dir git does not list, and a tree holding another worktree inside it (`nested`) are kept. Nothing in a tree is changed before every keep check has passed.
- **L5** Remote branches are never touched. A tree's HEAD, less a run.json-only tail, must be a safe head, reachable from a remote-tracking ref, the local pilot branch (its name read, never a literal) or a local `feat/*` other than the tree's own branch; else `kept unpushed`, branch and all. A removed tree's local branch goes with it.
- **L6** `--force` only on a landed run, after the tracked status is read clean again (ADR 0171 kept). Mid-run an untracked non-ignored file keeps a tree; once landed only tracked dirt does.
- **L7** The run set is not widened by branch name; new trees are tagged at creation instead.

## Rejected

- *Each caller keeping its own `git worktree remove`*: the F5 orphan and every agent's own policy.
- *Trusting git's exit code*: F5.
- *Matching only the `--run` slug's record*: a feat tree with another slug's mirrored record would read dirty forever.
- *Widening `isRunBranch` to `slice/<slug>-*`*: it would move `pilot branches prune`'s selection and claim `clean-landing`'s branches for `clean`.
