---
status: accepted
date: 2026-10-10
tags: [tests, deck, timing]
supersedes: []
superseded_by: []
paths: [deck/test/daemon.test.mjs, deck/test/run.test.mjs, deck/client.mjs, docs/design/daemon-test-flake/architecture.md]
---
# A timing test waits on what it asserts, with a budget derived from the contract

We decided that a deck test which waits for something to happen waits on that condition, with one budget per test file derived from the limits the code under test exports, counts the events the code actually made rather than a wall-clock window, and keeps a fixed sleep only in front of an assertion that something did *not* happen.

## Context

Four tests flaked under full-suite load on a loaded machine (ticket itm_8ced1f04d52a). The two-sessions test gave 15 s, exactly the client's own 10 s start limit plus 5 s register limit, so a session inside its contract could still miss the window, and its failure text was stale: `until` kept an earlier error and the sessions' stderr was thrown away. Two poll tests asserted at least three polls inside a 1500 ms window of 300 ms polls, where only two fit under load. A chain test used a fixed 150 ms `settle()` before asserting something had happened. None was a product bug; each counted time instead of the thing it was about.

## Decision

**Budgets come from the contract (L1, L3).** One wait constant per test file, derived from the exported limits of the code under test plus a fixed margin for process start; no test carries its own number, and no fix is a bigger literal alone.

**Count events, not clock (L6).** A test about polls counts the requests the client made and asserts one report per empty poll.

**`settle()` is for absence only (L7).** Every wait for something to happen is `eventually(predicate, what)` on the shared budget; a fixed sleep stays only before an assertion that nothing happened.

**A failure names its step (L2).** A wait reports the probe's last answer, not an out-of-date error, and a spawned session's stderr is kept so the failure prints it.

## Rejected

- *A longer timeout*: the user's rule on the ticket, "fixed at the cause, not by a longer timeout alone".
- *Per-test timeouts*: a second number to drift.
- *Looping the suite until it fails*: the two-sessions flake did not reproduce in a run; the failure is made to explain itself instead.
