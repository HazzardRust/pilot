---
status: proposed
date: 2026-10-19
tags: [gate, landing, tests, integrate]
supersedes: []
superseded_by: []
paths: [scripts/select-tests.mjs, scripts/gate.mjs, scripts/integrate.mjs, scripts/sync.mjs, scripts/land.mjs]
---
# The full suite runs once, at the landing

We decided that every step before `pilot land` runs only the tests the diff touches, through `npm run test:changed -- --since=<ref>`, and that the full suite runs once per feature, at land's merge of the feature into `pilot`.

## Context

The full suite (about 4,190 tests, 2.5 to 4 minutes on Windows, two gate slots per machine) ran at every step: the slice gate, `pilot integrate` (base, then slice), the fix round, QA, `pilot integrate --default`, `pilot sync` and `pilot land`. A one-slice feature ran it at least 8 times in a day, and every landing queued behind someone else's suite.

## Decision

- **L2** A separate `npm run test:changed -- --since=<ref>`; `npm test` stays full, so CI, the Linux referee and other repositories are untouched.
- **L3** A changed source file no test reaches falls back to the full suite, naming the file.
- **L4** Nothing before the landing runs full, QA and the lander included.
- **L5** One module, `select-tests.mjs`, owns the policy and the scope line; the gate executes it; integrate only chooses the command.
- **L6** The diff is merge-base(since, HEAD) to the working tree plus untracked files, because integrate's slice merge is `--no-commit` when the tests run.
- **L7** An empty selection runs no `node --test`: `gateArgv` with no files would glob the whole tree.
- **L8** `mergeIntoPilot` is full unless given `since`; only `sync` passes it, so land's feature merge is the one full run with no change in land.
- **L9** The gate takes a slot only for a full run; `runTests` takes none and sets no `PILOT_GATE_SLOT` for a selecting command, so a fallback inside the gate takes its own.
- **L10** `--since` takes a ref, resolved by `git rev-parse --verify` to a sha before use, argv only; integrate and sync pass a full sha, so the composed command carries hex only (ADR 0110 holds).

## Rejected

- *`npm test` selecting by default* (L2): CI, the referee and other repositories would change under it.
- *Whole-tree tests and a warning for an unreached source file* (L3): a silent miss that only the landing would catch.
- *QA running the full suite* (L4): a second full run per feature for the same code the landing tests.
- *Selection inside integrate* (L5): other repositories and the agents' phase gates would not reach it.
- *`since...HEAD`* (L6): it misses the merge in hand.
- *A `full` flag on land's call* (L8): two places to keep in step.
- *Every run in a slot* (L9): a selected run would queue behind full suites for no reason.

## Consequences

- A one-slice feature runs the full suite exactly once, from take to landed.
- A selected run never waits for a gate slot.
- A miss in the selection reaches the landing, where the full run is the backstop.
- A repository with no `test:changed` script, or one tested by `git config pilot.test`, runs its own full test command at every step.
