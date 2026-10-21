---
status: amended
date: 2026-10-17
tags: [tickets, deck, lanes, landing, gate2]
supersedes: []
superseded_by: []
paths: [deck/chain.mjs, deck/landing.mjs, deck/store-items.mjs, deck/server-tools.mjs, deck/lane-ticket.mjs, agents/pilot.md, agents/pilot-qa.md]
---
# Gate 2 frees the lane: the deck owns the landing and the report

We decided that the user's Sign off on a gate2 takes its ticket off the concluding lane at once, that the deck lands the feature, retries the ready step and posts the closing report itself, and that a landing conflict goes to a short-lived resolver instead of waiting on a busy pilot.

## Context

The user's words: "i often get to gate 2, press sign off, and then have to wait a significant amount of time before finding out whether it succeeded, or it failed in which case i have to press it again and restart the process in some cases." Merge conflicts at landing fall to a pilot that is busy elsewhere ("like the pilot will be handling other things"). And "the pilot is woken to write the closing report, but nothing really ensures that it actually gets done." Until now the signed ticket held the concluding lane through the whole landing, a `pr ready failed` blocked on the user, and the report waited on the pilot.

## Decision

- **Landing is derived, not stored** (L1): `isLanding` reads the newest gate2's stored Sign off on an open green ticket; `liveTicketOf` skips it, so in-flight signed tickets leave the lane on deploy with no migration.
- **The press fills lanes in place** (L2): `fillLanes` takes each queued stage lane's head, concluding first, never through a chain hand-off that would `/clear` a busy pilot.
- **The deck's finish never chains** (L3): it writes the ticket's own record (`recordForTicket`); the lanes were filled at the press.
- **Ready is retried by the deck** (L4): `pilot land --ready` three times at `READY_DELAYS_MS = [0, 60_000, 300_000]`, still the one fixed spawn shape; past the bound one blocked `Mark #N ready` question goes up.
- **`Land again`** (L5): the pilot's reply on a conflicted gate2, accepted only from the pilot and only on a `refused` landing with a `conflict`; the deck runs land and `resume()` accepts only a merge of the signed source onto pilot.
- **The resolver is a `pilot-implementer` on a fix brief** (L6), reviewed by one fresh language reviewer; there is no new agent type.
- **`Resolving`** (L7): the pilot's reply on the gate2 is its turn on a conflict and stops the `CONFLICT_TURN_MS` timer.
- **`deck/lanes.mjs` is not touched** (L8): the fill lives in `chain.mjs`.
- **A1 `CONFLICT_TURN_MS` is 15 minutes** (assumed, the user took the default): without a `Resolving` in that time the conflict becomes one blocked question on the signed ticket.
- **A2 Past the ready bound the deck writes the report anyway** and closes the ticket (assumed, the user took the default); its first human step names the draft PR and the open `Mark #N ready` question.
- QA runs against a scratch deck plus `npm test`, never the live deck (L9).

## Rejected

- *A `landing` mark or a fifth state* (L1): it needs a write and a migration.
- *`chainNext` at the press or on `landed`* (L2, L3): it `/clear`s mid-work, or hands off a lane already filled.
- *Rerunning `pilot land` whole, or a daemon-side `gh` call* (L4): the suite repeats; the spawn shape stays fixed.
- *The pilot or the resolver running `pilot land`* (L5): auto mode refuses it from the crew; *a second user press* (L5).
- *A `pilot-resolver` definition* (L6): the implementer already owns fix briefs.
- *Inferring a pilot turn from tool-call telemetry* (L7): the reply is the only observable.
- *Folding the fill into `lanesFrom`* (L8).
- *5 or 60 minutes for `CONFLICT_TURN_MS`* (A1); *holding the report until the user answers* (A2).

## Consequences

- The user reads `landing started`, then `landed ... at <sha>` or `NOT landed`, on the gate2 thread, and the lane is already free.
- A ready failure retries without the user; the ticket may read closed while one GitHub click is still theirs (A2). This amends the pilot prose that waited for the closing report.
- A press while another landing runs is queued, not refused, and a deck-written finish never ends the pilot's `deck_wait` while a lane still holds a live ticket.
- A conflict is resolved in the kept worktree without the user, who is asked only after a failed review or `CONFLICT_TURN_MS`.
- The pilot's prompt pin moves by the measured cost of the new wording.

Amended 2026-10-18 by ADR 0161: the lander replaces the resolver. L6 ("a `pilot-implementer` on a fix brief; there is no new agent type") is reversed, because the agent now also prunes, gates and hands back, so it is a new agent type that the pilot spawns on the press. L5 stands for `pilot land` (neither the pilot nor the crew runs it), but `Land again` is now accepted from the lander on any `refused` gate2, not only from the pilot on a conflict (ADR 0161 L7). L7's `Resolving` is accepted from the lander on any signed gate2, not only the pilot on a conflict. A1's 15-minute clock still stops on it. Every other line here stands.

Amended 2026-10-19 by ADR 0167: `pilot land` keeps one open PR `pilot → main` and marks no feature PR ready, so L4's ready retry (`pilot land --ready`, `READY_DELAYS_MS`, the blocked `Mark #N ready` question) is gone, and A2's report names the main PR's merge as its first human step instead. Every other line here, and the 0161 amendment above, stands.
