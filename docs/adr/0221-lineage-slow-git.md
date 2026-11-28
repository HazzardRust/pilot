---
status: proposed
date: 2026-11-26
tags: [deck, tests, git, gate1]
supersedes: []
superseded_by: []
paths: [deck/server-tools.mjs, scripts/test/lib/git-fixture.mjs, deck/test/gate1-lineage.test.mjs, deck/test/gate1-verdicts.test.mjs, deck/test/lineage-base.test.mjs, deck/test/verdict-record.test.mjs, deck/test/deck-user-branch.test.mjs, scripts/test/handoff-lineage-remote.test.mjs]
---
# Gate1 lineage tests arm their own deadline; the deck's live 5 s stays

We decided that a test of a gate1's lineage or verdict check that is not about the deadline passes its own generous deadline, and the deck's live 5 s deadline stays as it is. Run `lineage-slow-git`, `docs/design/lineage-slow-git/architecture.md`.

## Context

Three signed landings in a row stopped red on `git did not answer on a gate1's branch design/x within 5 s`, in tests their features did not touch. The gate1 lineage tests ran real git under the deck's live `LINEAGE_MS` (5000 ms), which one check's up to ~11 sequential git spawns share, inside a suite that spawns thousands of git processes. A deadline that a test is not about belongs to the test, not to production.

## Decision

- **L1** The post path's deadline is injected as `callTool`'s `deps.lineageTimeout`, passed to both `assertOnPilotTip` and `assertVerdicts`; unset, both keep `LINEAGE_MS`. Rationale: `deps` is already `callTool`'s test seam. Rejected: an env var (`PILOT_DECK_LINEAGE_MS`), a knob a live deck could read; a module-level setter, shared state across tests.
- **L2** One test constant, `GIT_SLOW_MS = 120_000`, exported from `scripts/test/lib/git-fixture.mjs`, the real-git fixture every armed file imports. Rejected: `deck/testUtils.mjs`, whose import redirects HOME and drops `PILOT_DECK_DIR`, which `handoff-lineage-remote` does not take; `timeout: Infinity`, which lets a hung git hang the file instead of failing it.
- **L3** `LINEAGE_MS` and the refusal text stay as they are. Rejected: raising the live deadline, which was not asked for.
- **A1** The 5 s refusal is proved by a deadline already spent (`timeout: 0`): the two existing direct tests, plus one `callTool('deck_post', …, { lineageTimeout: 0 })` test that the injected deadline reaches the check and stores no gate1. Rejected: a PATH `git` script that sleeps past 5 s, which Windows never runs (`spawnSync` without a shell finds only `git.exe`) and which adds at least 5 s a test. The user chose this default.

**Consequences**: a new gate1 lineage or verdict test against a real repository arms `GIT_SLOW_MS` (or `lineageTimeout: GIT_SLOW_MS` through `callTool`), or it runs on the live 5 s again. No test runs against a git that is itself slow, so whether 120 s suffices on a slower machine, and whether load is the cause, is read off CI and QA's `npm test`.
