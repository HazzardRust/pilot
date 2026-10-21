---
status: accepted
date: 2026-10-13
tags: [hooks, deck, permissions]
supersedes: []
superseded_by: []
paths: [hooks/permission-refuse.js, hooks/lib/blocked.js, docs/design/gate-no-stall/architecture.md]
---
# Every pilot prompt in a live run is refused onto the deck

We decided that while a run is live, every permission prompt in the pilot's own session, including one from the user's own `ask` rules and auto mode's fallback after three blocks in a row, is refused by `hooks/permission-refuse.js` with the blocked-step message and posted as a blocking item, so no prompt ever waits in the terminal mid-run.

## Context

`permission-refuse.js` already denied crew agents' prompts and left the main session's to the user. The `PermissionRequest` payload does not say whether a prompt is auto mode's fallback or an `ask` rule, so the two cannot be told apart within the hook.

## Decision

- `permission-refuse.js` becomes async to ask the deck for live runs; with none, or outside a pilot lane, it answers nothing and the prompt shows as today (L5).
- With a live run it denies and posts through `postBlocked` (ADR 0137), the same item a denial produces (L10).

## Rejected

- *Refusing only after a recorded denial in the session*: state across hooks, for a payload that cannot name the fallback anyway.
- *Counting denials to catch only the fallback prompt*: the payload does not say a prompt is a fallback.

**Consequences**: an `ask` rule cannot be answered in the terminal while a run is live; it reaches the deck as a blocked item instead.
