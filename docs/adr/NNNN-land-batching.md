---
status: proposed
date: 2026-11-25
tags: [landing, git, cost]
supersedes: []
superseded_by: []
paths: [scripts/git-view.mjs, scripts/land.mjs]
---
# A command reads git through one view

We decided that a command which reads its repository many times, `pilot land` first, reads git through one view built at its entry and threaded down, which asks each read once until a write passes.

## Context

A full suite spawns about 12,500 git processes, over the signed bar of 10,000 (land-batching spec 1). One landing asks the same questions several times over: the run remote, HEAD, pilot's tip, the worktree list. `oncePerRunner` remembers one answer per runner, but callees build runners of their own, so it misses across them, and it does not cover the reads that change when the landing writes.

## Decision

- **L2** One view per command: `gitView(cwd, { run })` answers `(args) => string`, the shape every callee already takes, so it is created at the command's entry and passed down where the runner went. `land` wraps whatever runner it is given.
- **L3** A read is answered once per epoch. Any other argv is a write: it runs every time, and then, thrown or not, every remembered answer is dropped. A write made outside the view (`commitRecords`, a fetch through `holds`, `mergeIntoPilot`'s own worktree) is followed by `git.forget()`. A throw is rethrown as it came and never remembered.
- **L4** The reads are rev-parse, symbolic-ref naming one ref, `config --get <key>`, ls-remote, for-each-ref, `worktree list` and `merge-base --is-ancestor`. A global option first (`-c`, `-C`) is never a read. Nothing is kept past the process.

## Rejected

- *A cache file across processes*: stale between commands, a new failure mode.
- *A long-lived `git cat-file --batch` process*: asynchronous, and a held process on Windows under ADR 0163's live-process rules.
- *Per-ref invalidation*: a merge moves HEAD and refs at once; guessing which moved is the bug class this must not add.
- *Widening the reads to rev-list, diff and log*: read-only, and worth one more memo hit each in a landing, but outside the signed definition of a read (land-batching S1, co-pilot's answer).
