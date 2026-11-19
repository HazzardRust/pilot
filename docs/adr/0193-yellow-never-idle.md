---
status: proposed
date: 2026-11-19
tags: [deck, tickets, lanes, co-pilot]
supersedes: []
superseded_by: []
paths: [deck/store-items.mjs, deck/server-tools.mjs, deck/lanes.mjs, deck/agents.mjs, deck/server-wait.mjs, docs/design/yellow-never-idle/architecture.md]
---
# A walkthrough's post concludes a yellow ticket, and an idle yellow crew is told to the pilot

We decided that the pilot's or QA's non-blocking walkthrough on an open yellow ticket is the concluding move, made
in the post's own write as a gate2's is, and that a held yellow ticket whose crew has been silent for 20 minutes is
named in `lanes.refusal` and woken once by a deck line, never released by the deck itself.

## Context

On 2026-11-17 the pilot posted audit-f6's walkthrough (`itm_ab39b4603222`) on its yellow ticket and parked in
`pilot wait`. Nothing moved the ticket: only the pilot's own `deck_ticket need` turns a yellow ticket green, and it
came 9 h later. The co-pilot slot's stored `live: true` kept the lane reading `held`, so no refusal fired, and the
Stop hook never sees a parked `pilot wait`. The user asked for a system where this cannot happen, not a pilot that
tries harder.

## Decision

- **L2**: the walkthrough's post is the concluding move, in `postItem`'s write beside gate2's, through one internal
  (`concludeOn`) both share (ADR 0066: ready for concluding is "QA's walkthrough is posted"). Rejected: a hook
  forcing `need`, which still depends on the pilot.
- **L3**: only a non-blocking walkthrough by `pilot` or `qa`, gate2's posters, moves the ticket. A blocking one is
  the yield of never-stuck spec 8 and leaves it yellow. Rejected: QA only, which misses the incident (the pilot
  posted it; the short path has no QA); any author, which lets an explorer or a teacher move a ticket.
- **L4**: the idle rule lives in `deck/lanes.mjs` and reaches the Stop hook as `lanes.refusal`; `hooks/stop-gate.js`
  is not edited. Rejected: the hook reading the roster, a second copy of the rule in CommonJS.
- **L5**: liveness is observed from the yellow crew's heartbeats, never the stored `live` flag.
- **L6**: the refusal is said once per stop. Rejected: a hold until moved, which traps a quiet but working crew.
- **L7**: the wake is one `noteDeck` line on the ticket per idle episode, stamped `idleNoted` with the crew-seen
  moment. Rejected: `pilot wait` exiting on the refusal, which loops a pilot that judged the crew still working.
- **L8**: no walkthrough post is refused for a lane reason: the post always lands, as a gate2's does.

## Consequences

- Posting the walkthrough is enough: the ticket is green, the yellow lane free and the next ticket can start with
  no `need`. `deck_post`'s answer says so in one clause.
- `deck_ticket need` stays for a hand-back that is only a question.
- A dead crew is found 20 minutes late at worst; the deck tells the pilot and never releases the co-pilot itself,
  so a stalled co-pilot cannot wake beside a successor on one branch.
- Who may conclude follows the hook's author stamp, as a gate2's poster does: an unstamped post counts as the pilot's.
- The gate2 that follows names the walkthrough that concluded its ticket, and is taken on that green ticket as on
  the yellow one, since the co-pilot's ticket is never live in the main slot (ADR 0087).
