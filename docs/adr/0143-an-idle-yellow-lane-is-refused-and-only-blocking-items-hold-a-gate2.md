---
status: proposed
date: 2026-10-14
tags: [deck, lanes, gates, pilot]
supersedes: []
superseded_by: []
paths: [deck/lanes.mjs, deck/items.mjs, deck/blocked-shape.mjs, scripts/install-settings.mjs, agents/pilot.md]
---
# An idle yellow lane is refused, and only blocking items hold a gate2

We decided that the daemon refuses a pilot that waits while a yellow ticket has no live co-pilot, that a ticket's gate2 is held only by its open blocking items, and that a ticket-making proposal is a flagged question that holds no gate.

## Context

Twice on 2026-10-11 the deck showed no yellow ticket active while one was planned: the co-pilot had been released and nothing refused the idle lane. A crew agent's blocked step went up as a plain walkthrough, so the gate2 could pass over it, while a plain ticket-making proposal held a red ticket's Gate 2 press. The post and the press read two different gate2 rules. A nested QA was refused `pilot deck --scratch`.

## Decision

- **The yellow refusal is `lanesFrom`'s `refusal`** (L2): the main lane's first, then the yellow lane's, printed unchanged by `pilot wait` and the Stop hook (ADR 0123). The lane line reads `co-pilot: empty → next itm_…`.
- **One gate2 rule** (L3): `gate2Blockers` is read by the post and the press alike, so the press's open-question predicate goes by deletion. A walkthrough accepts `blocking`.
- **A proposal is a flag** (L4): `proposal: true` and no `ticket`; it never holds a gate1, signoff or gate2.
- **Blocked steps are posted by ADR 0137's hooks** (L5). The deck adds a backstop: a `Blocked:` question or walkthrough naming a ticket without `blocking` is refused; a blocked step titled otherwise is not caught by it (A1).
- **Scratch decks are allowed** (L7): the install allow-list gains `Bash(pilot deck --scratch *)`; ADR 0135's leash bounds what one leaves behind, and `deck/scratch.mjs` already gives each one a fresh temp-directory store and no browser, and its stop refuses the user's deck on 4321.

## Rejected

- *A second refusal field every hook reads*: the hooks print one daemon string.
- *Patching the press predicate*: two rules drift again.
- *Posting a proposal unticketed without a flag*: an unticketed open question holds every gate1.
- *A new `blocked:` post field*: the hooks already post the structured item.
- *Keeping the scratch-deck ban*: the nested QA hits it every run.

**Consequences**: an idle lane, a slipped blocked step and a proposal holding a press each become a refusal or a non-event instead of a habit the pilot must remember.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
