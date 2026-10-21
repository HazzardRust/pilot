---
status: amended
date: 2026-10-05
tags: [runs]
supersedes: [0060, 0065, 0066]
superseded_by: [0088]
paths: [agents/pilot.md, docs/design/pilot-branch/architecture.md]
---
# The sub-deck replaces implementation mode

ADR 0060 and the ticket-states run gave one pilot session two modes: attended, which planned and concluded, and autonomous, which implemented the yellow queue, switched by a toggle on the deck and read from `mode` in `GET /api/record`. One session could hold only one of them at a time, so planning stopped while yellow work ran. The pilot branch runs both at once instead (pilot-branch spec 7, 12): a second pilot session, the sub-deck, carries the yellow queue while the user plans and concludes at the main deck. So we decided the mode is gone and a session's role replaces it.

- **The record answers `role`, not `mode` (L8).** `role` is `main` or `sub`; `nextTicketOf(items, repo, role)` gives the sub-deck the yellow head that is not live and never gives the main deck a yellow ticket. The toggle, `POST /mode` and the stored mode map are removed.
- **The prompt names the role, not the mode.** `agents/pilot.md`'s "Modes" section is "Sub-deck": as sub-deck, start at step 4 from the hand-off's plan and the record, never post or sign a gate, `need` at QA's walkthrough and finish `needed`; the chain hands on. As main deck, take green and red, and conclude red from the record.
- **The agents a session holds are the record's `budget` (L18, L27)**, a number the prompt never states.
- **A refused call is a blocked step (L24, ADR 0086)**, recorded with its command and listed in the `gate2` body for the user.
- **A pause stops the sub-deck at a slice's end (L17)**: told once on its next wait, it integrates the slice in flight, parks the ticket and finishes `paused`.

This supersedes the mode half of ADR 0060's account (its "an autonomous session later takes the yellow queue" and "reachable by an autonomous run") and the "autonomous" wording of ADRs 0065 and 0066: read each as the sub-deck. Their decisions on ticket state stand.

Rejected:
- Keeping `mode` as a hidden setting beside `role` (spec 12 removes it).
- One session switching between the roles: planning would still stop while yellow work runs.

**Consequences**:
- With no sub-deck running, a yellow ticket waits until one starts (ADR 0084).
- A red fix stays on the main deck, held to its budget; only a pivot sends a ticket back to the sub-deck.

Recorded in `docs/design/pilot-branch/architecture.md` (§5 L8, L17, L18, L24, L27).
