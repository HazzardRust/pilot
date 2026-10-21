# 0106 The deck has two lanes, each with its state and one switch protocol

Status: draft (ticket-state-accents; becomes `docs/adr/0106-…` in S5). It names ADR 0065's "ticket in hand" without changing it, and gives ADR 0089's co-pilot record a state of its own.

## Context

The user switches between tickets on two lanes: their own ticket in hand, and the yellow ticket a co-pilot
builds. They could not tell what each lane held. They asked for "deterministic in-code definitions",
a defined transition, feedback that shows a switch being attempted apart from what is held, and the
two lanes told apart at a glance (itm_a4601baa5a2f, itm_4cea49f1a04f).

## Decision

**Lanes.** `main` is the pilot session's ticket in hand. `co-pilot` is the yellow ticket a live co-pilot builds (`deck.coPilots`, ADR 0089). Each lane has its own state word, switch record, lock and mark, and neither touches the other.

**Main state**, from `deckStateOf(items, repo, switching)`, drawn as `data-deck-state`:

| State | When | In hand |
| --- | --- | --- |
| `held` | a ticket of the repository is `live` | that ticket |
| `queued` | none is live; `nextTicketOf` names one | that ticket, untaken (ADR 0065) |
| `empty` | no open red or green ticket exists | no ticket |
| `switching` | `switches[repoKey].main` is set | its `from` (or none) until completion |

**Invariant.** While any open red or green ticket exists, exactly one is in hand and marked; `empty` is reachable only when none exists, because yellow tickets are the co-pilot's. During `switching`, `from` stays in hand and `to` is only pending. A record naming a ticket that is no longer open red or green reads as none.

**Co-pilot state**, from `coPilotStateOf`, drawn as `data-co-pilot-state`:

| State | When | The co-pilot's ticket |
| --- | --- | --- |
| `held` | a live entry names an open yellow ticket | that ticket |
| `queued` | no live co-pilot; an open yellow ticket exists | none; the yellow head (first in deck order) carries a blue `next` chip, never the highlight |
| `empty` | no open yellow ticket | none |
| `switching` | `switches[repoKey].coPilot` is set | its `from` (or none) until completion |

**Switch protocol**, per lane. The record is `switches[repoKey][lane] = { from, to, at }`.

1. *Request*: a confirmed Continue (`POST /switch`, own page only) on a row the lane does not hold: red or green for `main`, yellow for `co-pilot`. One write stores the record and a user reply on `to` carrying `switch`, which the pilot's wait prints as `SWITCH` or `SWITCH co-pilot`. On `main` with no live session, the same write completes.
2. *Complete*: on `main`, `deck_ticket take <to>` parks `from`, takes `to` and clears the record. On `co-pilot`, after the co-pilot's `paused` hand-back, `deck_ticket co-pilot <to>` makes `to` live in place of `from` and clears the record. Each is one write.
3. *Cancel*: the lit button's Cancel clears that lane's record and tells the pilot.

While a lane is `switching`, its other Continues and its disruptive calls are refused; replies, Sign off, Close and Add stay open. On `main`, the disruptive calls are the arrows, Start and End, and take, park, merge, need and pivot. On `co-pilot`, they are `co-pilot`, `release`, `need` and `pivot` on the two tickets. The completing calls are exempt.

**Marks.** The highlight means held and nothing else. `in-hand` is the main lane's ticket, amber (`--state-waiting`). `co-pilot-held` is the co-pilot's ticket, blue (`--lane-co-pilot`), with a sideways `co-pilot` label. `data-switch` on each Continue reads `idle`, `pending` or `locked`.

## Rejected

- *Swap on a reply*: an incidental reply would move the pilot.
- *Immediate park and take on the press*: the pilot would go on working a ticket already parked.
- *New verbs*: the completing calls are the existing `take` and `co-pilot`.
- *One deck-wide lock*: a co-pilot swap would block the user's own ticket.
- *A timeout*: a stalled switch is the user's to cancel.

## Consequences

The mark and the lit button can disagree for as long as the pilot takes to stash, or the co-pilot to finish its slice. That window is the feedback the user asked for.
