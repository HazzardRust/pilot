---
status: proposed
date: 2026-10-15
tags: [deck, pilot, states]
supersedes: []
superseded_by: []
paths: [deck/pilot-state.mjs, deck/ui/render-pages.mjs]
---
# The pilot's state is read, never set

We decided that the deck infers the pilot's state for a repository at render time from what it already sees, and that no agent sets, stores or clears it.

## Context

The user opened the threads page, saw no threads and could not tell why; the CLI showed the pilot handing off at its context limit. The deck already holds every signal that says what the pilot is doing: open hand-offs, parked waits, runs and their last writes, the crew roster. An agent-managed state was ruled out by the user, because a state an agent must remember to set is wrong exactly when the agent has stopped.

## Decision

- **Derived, never stored** (L1, ADR 0105's precedent): `pilotStateOf(tab, items, held, now)` is pure over what the home page reads; no item field, no tool argument and no store write names the state.
- **Its own module** (L2): `deck/pilot-state.mjs`, not beside `accentOf` in `deck/items.mjs`, which two adjacent runs own.
- **Precedence** (L3): handing off > listening > no session > picked up > working > quiet (amended by the user on itm_291acc92a53d: an ended session never reads `picked up` or `working`). An open hand-off is the fact the user needs most; a parked wait is fresher than a pickup; a pickup is news for its window.
- **Signals** (L4): `handing off` from any open `handoff` in the repository, plain or chain; a `crew-handoff` is a crew agent's and is ignored. `working` from a run's `lastSeenAt` or the crew roster.

## Rejected

- *A `deck_status` field the pilot sets*: the agent-managed state the user ruled out.
- *Beside `accentOf` in `items.mjs`*: three runs rebasing on one file.
- *Newest signal wins*: it flickers between a wait's hold and its own write.
- *A new per-call stamp in `runTool`*: it duplicates `lastSeenAt` on another run's file.

**Consequences**: the line is right whenever the page is rendered, whatever any agent remembers; a state needs a signal the deck already sees, so a state the deck cannot observe (the seconds before `pilot handoff` posts) reads as the one before it.
