---
status: amended
date: 2026-10-12
tags: [deck, tickets, lanes]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/lanes.mjs, agents/pilot.md, docs/design/session-row/architecture.md]
---
# With no yellow open, green goes first

We decided that `nextTicketOf` takes a ticket with a queued question first; then, with no yellow ticket open in the directory, the green head before any red; with one open, red before green as before.

## Context

After a long unattended run there is no yellow, some green and some red. Picking red first left the background lane idle while the user worked through red; the user wants a green ticket planned and implemented in the background while they work on red.

## Decision

- "Yellow open" is any open yellow ticket in the directory, held by a co-pilot or queued (L7).
- A questioned ticket stays first in both cases; with yellow open the order is the old one, the first red-or-asked in deck order, then green (L8).
- The test lives inside `nextTicketOf`; `lanesFrom`, the chain and the rail stay its readers, so the idle-main-lane refusal, the SessionStart lane line and the hand-off `next` name the same pick (ADR 0123).
- The pilot's Yellow section states the same rule: a queued question first; with no yellow open, green then red; else red then green.

## Rejected

- *Only a live co-pilot counts as yellow open*: a queued yellow is refilling already, and picking green would plan a second run beside it.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
