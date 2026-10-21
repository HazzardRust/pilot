---
status: accepted
date: 2026-10-09
tags: [threads, hooks]
supersedes: []
superseded_by: []
paths: [deck/wait.mjs, docs/design/listener-worktree/architecture.md]
---
# A wait listens on its session's repository

ADR 0091 made `pilot wait` listen on the main checkout its cwd belongs to. A `pilot run` session launched in a worktree stamps its own posts with that worktree (`PILOT_RUN_REPO`, `deck/client.mjs`), so its wait listened on the main checkout and never heard the threads the session itself had posted; a shell that drifted into another session's worktree made it worse. So we decided a wait inside a `pilot run` session listens on the session's repository. This amends ADR 0091's first bullet; the rest of 0091 stands.

- **The listening repository is `PILOT_RUN_REPO` when it is set and not empty**, trimmed (`sessionRepo(env)` in `deck/wait.mjs`); otherwise `listeningRepo(cwd)`, the main checkout as ADR 0091 says. Outside a `pilot run` session nothing changes.
- **`wait()` takes `env` as a parameter**, default `process.env`, and reads nothing else from the environment for this. The suite passes its own `env`, because a suite run inside a `pilot run` session inherits `PILOT_RUN_REPO` and would otherwise listen on the real repository.
- **The join stays client side, once per wait.** The daemon's `sameRepo`, `repoKey` and `forRun` are unchanged, so a worktree's own deck stays a separate deck.

Rejected:
- Widening `sameRepo` or `forRun` to fold a worktree into its main checkout: it merges every worktree deck into the main one, and a main-checkout wait would take, and mark delivered, replies meant for a worktree session.
- Asking `/api/runs` which candidate repository is live: a network read for what the environment already holds.
- Listening on both the worktree and the main checkout: `deck_wait` takes one repository.

**Consequences**:
- Inside a `pilot run` session, line 1 names the session's repository wherever the shell is.
- Every `wait()` call in the suite passes an `env`; a new one that does not fails when the suite runs inside a `pilot run` session.

Recorded in `docs/design/listener-worktree/architecture.md` (§2 spec 4; §5 L1, L2, L3).
