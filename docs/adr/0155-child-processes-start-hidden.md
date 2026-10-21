---
status: accepted
date: 2026-10-12
tags: [windows, child-process, testing]
supersedes: []
superseded_by: []
paths: [scripts/test/hidden-spawns.test.mjs, scripts/integrate.mjs, scripts/land.mjs, scripts/sync.mjs, scripts/pilot-branch.mjs, deck/tickets.mjs, docs/design/hidden-spawns/architecture.md]
---
# Child processes start hidden, enforced by a source scan

We decided every child process the pilot's scripts, deck, bin and hooks start passes `windowsHide: true`, with one source-scan test over those directories as the single rule, and the user's own interactive `claude` as the one named exemption.

## Context

On Windows a process with no console of its own, the detached deck daemon above all, gives each `child_process` child it starts a console window unless `windowsHide` is set. The user saw bursts of about five windows flash open: once on a ticket click, once at random. The install's spawns were hidden in the PATH feature (ecebaa7b) with an install-only test; 21 other call sites in ten files were still unhidden, among them the deck's gate1 lineage check, which runs about five git calls from the console-less daemon.

## Decision

- Every `spawn*`, `exec*`, `execFile*` and `fork` call in the non-test sources under `scripts/`, `deck/`, `bin/` and `hooks/` passes `windowsHide: true`, including calls through injected callee names (`spawnChild`, `spawnOpener`, a `spawn` parameter).
- One test, `scripts/test/hidden-spawns.test.mjs`, scans those directories and fails on any call without it; the install-only scan folds into it so the rule lives in one place.
- `deck/run.mjs` `startPlain`, the user's interactive `claude` with inherited stdio, is the one exemption, named in the test with its reason.
- Each call is edited in place; no shared git/gh runner is introduced.

## Rejected

- *Hide only the four files the request named*: the daemon's gate1 path, the likeliest cause, was not among them.
- *A shared hidden runner in place of six per-module one-liners*: it changes stdio, timeout and fsmonitor handling in eight modules for no behaviour the user sees; a candidate ticket of its own.
- *A lint rule instead of a test*: the repo has no lint step in its gate; a test runs where the gate already runs.

## Consequences

- A new child-process call without `windowsHide: true` fails `npm test` before it reaches a user.
- The exemption list is in one test; adding to it is a reviewed diff.
