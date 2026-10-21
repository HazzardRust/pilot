---
status: proposed
date: 2026-10-14
tags: [hooks, handoff, context, pilot]
supersedes: []
superseded_by: []
paths: [hooks/context-size-guard.js]
---
# The hand-off is advised on work done

We decided that the context guard counts the gates signed in a directory since its newest hand-off item and advises the hand-off at a ceiling of 2, before the token mark.

## Context

The guard advised a hand-off on tokens alone, so a session carried several landings and designs of stale context into the next piece of work while still under the mark.

## Decision

- **Work is derived, not stored** (A5): `workSince(items, repo)` counts signed gate1s (designs) and gate2s (landings) from the newest `handoff` item on, in `deck/work.mjs`, and served as `work` on `/api/record`; the guard reads it there rather than reading the deck itself.
- **`WORK_CEILING` is 2**, a pinned constant: 2 landings, 1 design and 1 landing, or 2 designs each advise, naming what was counted.
- The count survives a hand-off because the deck holds it; nothing is written to a counter file.

## Rejected

- *A count in the run record*: the deck already holds the gates.
- *A per-session counter file*: a second store to keep in step.

**Consequences**: an abandoned session with no hand-off item carries its count into the next one.
