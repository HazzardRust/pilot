---
status: accepted
date: 2026-10-12
tags: [git, branches, remotes]
supersedes: []
superseded_by: []
paths: [scripts/remotes.mjs, README.md, docs/design/pilot-fork/architecture.md]
---
# Run branches live on the run remote

We decided that a run's `pilot`, `design/`, `slice/`, `fix/` and `qa/` branches live on the run remote, named by the git setting `pilot.remote` (unset means `origin`, `none` means local refs only), and that a branch is deleted once it is merged and never before.

## Context

Run branches piled up on origin. The bloat was never that the branches exist, only that nothing deleted them. A fork or a per-user namespace was considered as the default home, and so was keeping them local; the first adds a second repository for every user, and the second leaves unfinished work with no cloud copy.

## Decision

- Default home is origin, pruned on merge (L14). `feat/<slug>` is always pushed to origin, so the feature PR is never cross-repository.
- `pilot.remote` is the opt-out: `none` is local mode, and any other value names a remote that `git remote` lists (L2, validated before it reaches argv or a ref path).
- `runRemote(git)` is the only reader of `pilot.remote`, and `runRef` the only code that turns a run branch into a ref (L1).
- With `pilot.remote` unset, every git and gh argv is unchanged (L3).
- Deletion has its own guard, `assertDeletable`, and `assertPushable` stays the one push guard (L4).
- "Merged" means gh reports the branch's PR `MERGED`, or, with no PR, that its tip is an ancestor of the branch it went into as fetched (L5).
- `pilot branches prune` deletes the merged branches that remain, and has no allow rule: the user runs it.

## Consequences

- A user who changes nothing sees the same pushes as before, and fewer branches left over.
- Off origin there is no PR page for a slice; its merge is judged by ancestry.
- A bad `pilot.remote` stops the command and names the key.
