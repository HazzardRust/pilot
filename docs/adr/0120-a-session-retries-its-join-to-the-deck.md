---
status: accepted
date: 2026-10-10
tags: [deck, client, startup]
supersedes: []
superseded_by: []
paths: [deck/client.mjs, deck/test/startup.test.mjs, docs/design/daemon-test-flake/architecture.md]
---
# A session retries its join to the deck

We decided that a session whose first attempt to join the deck fails does not stay off the deck for its whole life: a failed join is not cached, the next call tries again, and startup tries at most three times.

## Context

`ensureOnTheDeck` (`deck/client.mjs`) tried once. If the deck took longer than its 10 s start limit or the register longer than 5 s, the session logged to stderr and never tried again, so a session started under load could spend its whole life unregistered — the suspected cause of the two-sessions flake, which could not be reproduced to prove it. The recommended default fixed only the test and made this a later ticket; the user chose to build it in the run ("retry the client join in this run", itm_0a85e393126d), under their bias to bigger jobs (itm_113930f2ed32).

## Decision

A failed join is forgotten rather than remembered as final, so the next client call attempts it again; startup attempts the join up to `JOIN_ATTEMPTS = 3` times, which caps a session at three daemon starts. The limits themselves do not change. The security reviewer reads the slice because it changes when a process is started.

## Rejected

- *Fix the test only and queue the retry*: the recommended default, overridden by the user.
- *Unbounded retries*: a daemon start per retry with no cap.
