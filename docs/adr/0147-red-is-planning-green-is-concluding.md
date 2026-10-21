---
status: proposed
date: 2026-10-14
tags: [tickets, deck, states]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/store-core.mjs, deck/ui/render-rail.mjs, agents/pilot.md, skills/ticket-making/SKILL.md, CONTEXT.md]
---
# Red is planning, green is concluding

We decided that a ticket is red while it is planned, yellow while it is implemented and green while it is concluded, so a ticket reads red → yellow → green.

## Context

Since ticket-states a ticket was green while it was planned and red while it was concluded, and ADR 0066 made red "the user is needed". Every agent already speaks red/green TDD, where red is the start and green is the finish, so a green ticket that had not begun and a red ticket that was nearly done read backwards to anyone meeting the deck, and the overview's colours said the opposite of the run's progress.

## Decision

- **The colours swap, the states do not** (yellow-lane spec 12, 14): red is planning, yellow is implementing, green is concluding. What each state means, who writes it and when it changes are as ADR 0066 and ADR 0133 left them; only the colour each is called by moves.
- **One sweep, last** (L9): the deck's readers and writers, its rail and the prose change in the run's last three slices, so no slice writes the old words under the new ones.
- **A store written before the swap is upgraded once** (A4): store version 2 swaps each ticket's `green` and `red` on load, so no ticket changes state.
- **The ADRs that named the old words are amended, not rewritten**: each carries one line naming this ADR. ADR 0066's "red means the user is needed" now reads green, and ADR 0133's "with no yellow, green goes first" now reads red first.

## Rejected

- *Keep the colours and rename the TDD steps*: the TDD words are the literature's, not ours.
- *Accept both spellings for a release*: two meanings of one word on one deck is the confusion this removes.
- *Swap first, as a stem* (L9): it serialises every deck slice behind the renamed tests.

**Consequences**: anyone reading the deck, the agents, the skills or the rules meets red → yellow → green in the order the work goes; an older ADR is read through its amendment line.
