---
status: accepted
date: 2026-10-07
tags: [hooks, threads]
supersedes: []
superseded_by: []
paths: [hooks/lib/deck.js, docs/design/user-thread-listener/architecture.md]
---
# The hooks key on the project, and a user-opened thread is the pilot's

A pilot integrating slices works from a `feat/` worktree, and the hook's `cwd` is that worktree's directory. The inbox lane and the Stop gate keyed on it. So a reply on the repository's thread was not this repository's: the lane read past it and the gate let the turn end. When the gate did hold, its reason told the pilot "if you never posted this, it belongs to another session". That was literally true of a thread the user opened with Create, and of every thread a session inherited after a hand-off, because the posted list is per session. So we decided both hooks key on `projectDir(input, env)`, which is `CLAUDE_PROJECT_DIR`, else `cwd`, and that the escape goes for a user-opened thread (`user` or `chat`) and for a thread on this run's live ticket.

- **One function, in `hooks/lib/deck.js`.** It is the precedent `markTurnEnded` already used, it costs no git spawn on each tool call, and it is the directory the client registered the run with.
- **This run's ticket is the ticket `deck.record(projectDir, ticket)` hands back `live`.** It is read once per distinct ticket an answered thread names, and only when the gate is about to block, so a hand-off cannot disown the run's own questions.
- **Every other thread keeps the escape.** Another pilot in the same repository, on a ticket that is not this one, still has its way out.

Rejected:
- Running git in the hooks to find the main checkout: about 30 ms on every tool call.
- Dropping the escape for every thread of the repository: a second session in the same repository loses its way out.
- User-opened threads only: leaves the hand-off gap (the user's answer, itm_dd85dec5f22e).

**Consequences**:
- A session launched from a parent directory disagrees with its run, as it did before.
- With `CLAUDE_PROJECT_DIR` unset, the hooks key on `cwd` as they always did.

Recorded in `docs/design/user-thread-listener/architecture.md` (§2 spec 2, 6; §5 L3, L6).
