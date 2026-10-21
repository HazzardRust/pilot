---
status: proposed
date: 2026-10-15
tags: [tickets, deck, lanes, crew]
supersedes: []
superseded_by: []
paths: [deck/lanes.mjs, deck/items.mjs, deck/store-tickets.mjs, deck/store-items.mjs, agents/pilot.md, agents/pilot-architect.md, agents/pilot-qa.md, agents/pilot-co-pilot.md, skills/ticket-making/SKILL.md, CONTEXT.md]
---
# Three lanes: a planning and a concluding ticket live at once

We decided that a repository holds three lanes: one live planning ticket and one live concluding ticket, both the main deck's, beside the co-pilot's implementing ticket, and that the architect carries most of planning and QA most of concluding while the pilot keeps the gates.

## Context

As the user's ticket put it (`itm_7c9becb5d765`, the artefact's §1): while a concluding ticket sits in a 5 to 15 minute revision or retest, the user could finish a planning ticket, but the deck held one planning-or-concluding ticket live at a time. Pilot attention is the limit, so QA should carry most of concluding and the architect most of planning, the pilot keeping the gates, the pushbacks and the answers that move the spec.

## Decision

- **Three lanes, one live ticket per stage** (spec 1, L2): `planning` and `concluding` are the main deck's and `co-pilot` is the co-pilot's. The lane is the ticket's stage; `live: true` stays, with no new field and no store migration. A second take in a stage is refused, naming the live ticket.
- **Each stage lane fills from its own queue** (spec 2): `nextTicketOf(items, repo, stage)` gives the asked ticket first, then the stage's head. The cross-stage ordering goes.
- **A switch is per lane** (spec 5, L4): switch records are keyed `planning` and `concluding`; a stored `main` record reads as the lane of its `to`.
- **The architect carries planning** (spec 9, L5): it posts and records its own stashed questions, writes `brief.md`, and hands main a thread whose answer overrides its default or moves a spec line. Gate 1, the verdict pass and `deck_status finished` stay the pilot's.
- **QA carries concluding** (spec 8, L6, L12): from `need` to the Gate 2 press, posting its own `gate2`; one QA per ticket. The pilot keeps `need`, `pivot`, `pilot landing` and the closing report.
- **The prose says the stage** (spec 10, L3): planning, implementing and concluding, with the colours implied as ADR 0147 maps them.

## Rejected

- *A stored `lane` field* (L2): it could disagree with the ticket's state.
- *A store migration for switch records* (L4): the record lives seconds.
- *One QA deck-wide* (L12): it serialises a concluding retest behind a co-pilot's step 8.

**Consequences**: the user can plan one ticket while another concludes; the pilot's context goes on the gates, and a reader of the prose meets planning, implementing and concluding rather than colours.
