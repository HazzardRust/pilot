---
status: accepted
date: 2026-10-07
tags: [threads, hooks]
supersedes: []
superseded_by: []
paths: [deck/wait.mjs, agents/pilot.md, deck/runs.mjs, docs/design/user-thread-listener/architecture.md]
---
# A listener listens on the repository and says what it heard

`pilot wait` sent `process.cwd()` as its repository, and the daemon compares repositories as plain paths, so a wait started in a slice or feature worktree listened on a directory the user never posts to (2026-10-01, 2026-10-04). Its output began with the thread id and ended a timeout with a lowercase `no reply after …`, and when the harness labelled the exit "stopped at the time limit" the pilot believed the label and never read the output (2026-10-01). So we decided `pilot wait` resolves its listening repository itself, once, and says it and why it exited in the first lines it prints.

- **The listening repository is the main checkout.** `listeningRepo(cwd)` in `deck/wait.mjs` runs `git rev-parse --path-format=absolute --git-common-dir` once, synchronously, at start, and takes its parent directory; outside git, or when git fails, it is `cwd`. A worktree and a subdirectory both resolve to the checkout.
- **Line 1 is `listening on <repo>`**, printed before anything can fail.
- **The exit line is uppercase.** Each reply is `REPLY <id> "<title>"` above its text; a timeout is `NO REPLY after <n> minutes`. One grep-able token that cannot be mistaken for a harness label.
- **The pilot reads the output before any exit label the harness gives** (`agents/pilot.md`, the listener rule).

Rejected:
- Resolving in the daemon (`readRepo`): a git spawn on every inbox poll, and the CLI would still have to print the repository.
- `deck/runs.mjs` `repoOf`: it reads the `.git` file and fails in a subdirectory.
- A JSON exit line: unreadable at a glance for the user.

**Consequences**:
- One git spawn per wait, never per poll; a wait with no git on its PATH listens on its cwd as before.
- Anything that matched the old `<id> — "<title>":` or `no reply after` text must match the new lines.

Recorded in `docs/design/user-thread-listener/architecture.md` (§2 spec 1, 3, 5; §5 L1, L2, L7; the artefact numbers it 0070, renumbered because the artefact's numbers were stale).
