---
status: amended
date: 2026-10-11
tags: [deck, lanes, wait, hooks]
supersedes: []
superseded_by: []
paths: [deck/lanes.mjs, deck/server-routes.mjs, deck/wait.mjs, docs/design/idle-main-lane/architecture.md]
---
# An idle main lane is refused while a red or green ticket is queued

We decided that a directory whose main lane is idle (no live ticket, no pending main switch, and a red or green ticket for `nextTicketOf` to pick) is a refused state, enforced by the tools rather than remembered: the pilot's `pilot wait` ends at once with `main lane empty; itm_X is queued <red|green> — deck_ticket take it first`, and the rule and every spelling of it live once, in `deck/lanes.mjs`.

## Context

A session's hand-off and the SessionStart notice spoke only of the co-pilot's lane, and `pilot wait` parked an idle main lane without complaint while a green ticket sat queued (ticket itm_5717249cf87a). The rule "take `nextTicketOf`'s pick" was prose nothing enforced. The user wants it refused by the tools, with one correction: an idle main lane is fine while nothing red or green is queued.

## Decision

**One rule, one module (L2).** `lanesFrom(items, repo, { switching, co-pilot })` in `deck/lanes.mjs` is built on `deckStateOf` and `nextTicketOf` and answers `Lanes = { main, co-pilot, mainClause, refusal }`: the lane lines, the `Main:` clause and the refusal line, spelled once. `lanesOf(repo)` is the same on one store read. The hooks are CommonJS and cannot import it; every surface prints the strings it hands them.

**It reaches clients on `GET /api/record` as `lanes` (L3).** Every client already reads that route, and it marks nothing delivered.

**Only the pilot's wait is refused (L4).** An architect's, QA's, teacher's or auditor's wait never reads the lanes; only the main session holds the main lane.

**At the start and after each empty poll (L5).** No new wake path in the daemon: a ticket queued mid-wait ends the wait one poll later.

**A deck that does not answer refuses nothing (L6).** The wait's lane read failing is its existing exit 1; a deck that answers no `lanes` refuses nothing.

**An open hand-off exempts the refusal (L7).** While an open `handoff` item stands in the directory, the session told to stop for its `/clear` must be able to stop.

## Rejected

- *Recomputing the rule in each hook from `deck_read`*: capped at the open-read limit, and a second spelling to drift.
- *A new route*: one more contract, where `/api/record` already reaches every client.
- *Refusing every kind's wait*: it would end crew waits on a lane they cannot take.
- *A daemon wake when a ticket turns red or green mid-poll*: a larger change for one poll's latency.
- *Refusing on a deck that does not answer*: a dead deck must not trap the pilot.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
