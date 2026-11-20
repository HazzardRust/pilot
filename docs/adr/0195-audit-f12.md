---
status: proposed
date: 2026-11-19
tags: [hooks, windows, git]
supersedes: []
superseded_by: []
paths: [hooks/shell-write-guard.js, hooks/test/shell-write-guard.test.js, hooks/hooks.json, docs/design/audit-f12/architecture.md]
---
# A PreToolUse hook refuses a pilot lane's shell edit of a tracked file

We decided that a PreToolUse hook on Bash denies a pilot lane's `sed -i`, heredoc or `echo`/`printf` write into a
git-tracked file, with a reason that sends the agent to the Edit and Write tools, and lets every other call run.

## Context

Eighteen run reports name a tracked file broken by a shell write through Git Bash on Windows: escapes mangled, line
endings changed. The crew's prose rule (write source with Edit or Write) was already in the implementer and QA
definitions and did not hold. No hook in the repository denied a call through PreToolUse before this one.

## Decision

- **L1**: deny through the PreToolUse JSON (`permissionDecision: "deny"` and a reason), exit 0. Rejected: exit 2 with
  stderr, which routes the same but is not the documented path and is not testable as a value.
- **L2**: tracked means `git ls-files` at hook time, spawned only once a candidate exists, once per distinct target
  directory (`git -C <dir>`), so an absolute path into another worktree resolves in its own repository. Rejected: an
  extension rule, which refuses a scratch `.mjs` and misses other files; a git spawn on every Bash call.
- **L3**: the refused forms are `sed` with `-i`/`--in-place`, `cat`/`tee` fed by a heredoc writing the target, and
  `echo`/`printf` redirected into it, behind any assignment, `!`, `then`, `do`, `command`, `env`, `time`, `nohup` or
  `sudo`. Heredoc bodies and quoted strings are data, never commands or redirections. Rejected: any `>` into a
  tracked file, which refuses a generator (`node gen.mjs > f`) whose bytes are not mangled.
- **L4**: the hook fails open on every error, posts nothing, and its reason says "not a blocked step". Rejected:
  failing closed, which turns a git hiccup into a lost round, the cost the hook exists to remove.

## Consequences

The forms the reports name most are refused before they run. Interpreter writers (`python -c`, `node -e`,
`perl -pi`), PowerShell, ANSI-C quoting, nested `bash -c`/`eval`, a heredoc piped into `tee`, a bare `> f`, a
group's redirection (`{ echo x; } > f`), and a relative path after a non-literal or later `cd` still run; the prose
rule stays as their guard. An `echo` whose stderr is redirected into a tracked file (`2> f`) is refused.
