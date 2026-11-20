---
status: proposed
date: 2026-11-20
tags: [crew, evidence, security]
supersedes: []
superseded_by: []
paths: [agents/pilot-evidence-runner.md, agents/pilot-fundamentalist.md]
---
# The evidence runner installs a worktree with no node_modules, once, before its first check

We decided that `pilot-evidence-runner` is the one installer: when its worktree has a `package-lock.json` and no `node_modules`, it runs `npm ci --ignore-scripts` under a scratch `HOME` and `USERPROFILE`, once and never retried, before its command table, and a failed install turns the Node diff coverage and diff mutation rows into `not run: install failed (exit <n>)`. Run `coverage-install`, `docs/design/coverage-install/architecture.md`.

## Context

ADR 0185 (L11) put the install in the fundamentalist, before it spawns the runner. A spawner that skipped that step, or a second spawner that never had it, left the runner measuring a worktree with no `node_modules`: the Node coverage cell's test command failed on missing modules, and coverage came back unmeasured with nothing naming why.

## Decision

- **L1 One installer, the runner.** The runner is what needs `node_modules`, whoever spawns it. The install moved from `agents/pilot-fundamentalist.md` ("Where you work") to `agents/pilot-evidence-runner.md` ("Before the first run"); the fundamentalist installs nothing and reports a failed install as `install failed (exit <n>)`.
- **A1 Install in the runner, not in each spawner.** The rejected path kept the fundamentalist's step and added the same to the co-pilot: two copies of one step, the second of which is the one handoff-cache showed being skipped.
- Only when there is no `node_modules` (`npm ci` deletes it first, and an agent's may be a link to a shared checkout), and outside the six-check table, so its no-environment-override test holds.

## Consequences

- The runner now writes the ignored `node_modules` of its worktree and reaches the npm registry for the lockfile's packages, beyond its table's ephemeral `npx`, `uvx` and `go run` fetches; its description says so. `--ignore-scripts` keeps a package's install script from running, and the scratch home keeps a user `.npmrc` (and any token in it) unread.
- The install row is the first row of the runner's table, so a failed install shows with its exit code instead of as a coverage failure.
- Whether auto mode allows `npm ci` from the runner is read off the first runs; a refusal is a blocked step, not routed around.
