---
status: proposed
date: 2026-11-25
tags: [gate, tests, ledger, security]
supersedes: []
superseded_by: []
paths: [scripts/test-ledger.mjs, scripts/test-cli.mjs, scripts/integrate.mjs, scripts/sync.mjs, agents/pilot-implementer.md]
---
# A test run is recorded once and an unchanged green tree is not tested again

We decided that every test run the pilot's tools make leaves one row in a local ledger, written by `runTests` from the test process's own exit status, and that a later run over the exact same tree reuses a green, complete row instead of starting the tests again.

## Context

A slice's tests ran at the implementer's gate, again at integrate, again at QA and again at land, each over a tree often identical to the last. Nothing recorded those runs, so nothing could tell that a tree had already passed; and the one record that existed, the implementer's own report, was a claim: a slice was pushed twice while red on a wrapper's exit code.

## Decision

- **L3** A row is written only by `runTests` (`scripts/integrate.mjs`), after `spawnSync` returns, its `exit` the test process's own status. Nothing parses output for pass or fail, and no CLI argument, trailer or agent report writes or sets a row. A run that did not exit 0 is written with its exit and is never reused. A run that threw before exit writes no row.
- **L4** Reuse (`reusableRun`, `scripts/test-ledger.mjs`) matches the exact tree, never a branch name or sha alone: the worktree's contents, untracked files included and `docs/design/*/run.json` taken from HEAD. The row must also have `since` equal to the one asked or null (a full run), a scope line deferring nothing, and the same `process.platform` and node major. A stale row is still proof of identical content, since `package-lock.json` is in the tree. The ledger is `~/.claude/pilot/tests/ledger.jsonl`, mode 0600. Any process of the user can append to it, as to the deck store, so agents are told never to write it; land's full run and CI remain the backstop.
- **L5** Agents run tests only through `pilot test` (`scripts/test-cli.mjs`), so every run is recorded: the implementer's gate runs `pilot test --as implementer --scope slice --since origin/feat/<slug>`. `--scope slice` sets `PILOT_TEST_SCOPE=slice` for the run.
- **L6** QA's reuse of CI is `provenTree` (ADR 0212), at least three green `gate (<os>)` jobs.
- **L7** The deck copies a feature's ledger rows into `record.tests` on each record write, so the `run.json` mirror stays a byte copy.
- **L8** A run inside the suite (`PILOT_GATE_HOME_STORE` set) writes no row unless its caller passes `home`.

## Rejected

- As the proof, git notes (pushed, so the trust is shared with every clone) or the implementer's trailer (a claim, not a status; L3).
- A ledger write in `gate.mjs`, which other repositories lack (L5); a second committed file for the rows (L7).

## Consequences

An implementer re-gating an unchanged tree runs nothing; a flaky green is reused once more. A forged row by a process of the user, or a change only to ignored files, a submodule or a symlink's target, is not seen; CI and land's run catch what it hides.
