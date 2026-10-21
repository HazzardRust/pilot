---
status: accepted
date: 2026-10-12
tags: [deck, runs]
supersedes: []
superseded_by: []
paths: [deck/store-runs.mjs, deck/client.mjs, deck/runs.mjs, docs/design/session-row/architecture.md]
---
# A session keeps its run when it registers again

We decided that a session registering again (a client timeout after the store had already created its run, a join retry) keeps its run row: same id, same `startedAt`, feature name and slice table, with only `lastSeenAt` moving.

## Context

`registerRun` already dropped the row with the same pid and repo, so one session never showed as two rows, but every registration minted a fresh `run_<hex>` (ADR 0023), and `setSlices` keys the feature name and slice table on that id: a retry emptied the run's tab.

## Decision

- Each client process mints a session key once at module load (`crypto.randomUUID()`, A1) and sends it at every registration.
- The store keeps the row when pid, repo and session key all match (L1); otherwise it replaces the row as before. A row with no key, from an older client, is replaced as before (L2).
- Over HTTP the second `POST /api/runs` answers 200 with the same run; `JOIN_ATTEMPTS` and the startup retry are unchanged.
- This amends ADR 0023's "fresh at every registration" to "fresh at every session"; the deck number, keyed on the directory, is untouched.

## Rejected

- *Pid and repo alone*: an OS reusing a dead session's pid in the same repo would hand a new session the old feature name and table.
- *Refusing a register without a key*: it breaks a session mid-upgrade.
