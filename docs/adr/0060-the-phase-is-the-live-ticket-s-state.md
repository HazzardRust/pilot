---
status: amended
date: 2026-10-01
tags: [tickets, gates]
supersedes: [0029]
superseded_by: [0065, 0066, 0085, 0105, 0117]
paths: [docs/design/ticket-states/architecture.md]
---
# The phase is the live ticket's state, stored on the ticket, and the chain takes a ticket instead of resolving it

The deck's green/yellow/red phase was derived across a whole repository from gate threads after a cycle start (ADR 0057), so a session could plan one ticket at a time and a ticket carried no state of its own; the chain resolved a ticket the moment it took it (run-chaining L4), so nothing could be stored on a ticket once it was in flight. The user wanted the phase to live on the ticket — "canonically stored in the tickets themselves" — so that one sitting plans several tickets to yellow and an autonomous session later takes the yellow queue. So we decided the ticket is the unit of state and the deck reads it.

- **A ticket carries a stored `state` (L3, L8).** `green` while planning, `yellow` once its `gate1` is signed, `red` once its `gate2` is *posted*, `closed` once its closing `report` is posted. Its only writer is the store's transition for that event, in the same write; a gate resolved without Sign off leaves it unchanged (L11). The page labels the words planning / implementing / concluding and colours from them.
- **The live ticket is marked on the item (L4, L9).** `live: true` plus `takenAt`; one per repository, `take` refused while another is live, naming it, `park` in any state keeps the state and clears `live`, and closing the ticket (its report, or resolving it outright) clears it too. `take` and `park` are `deck_ticket` actions. The tab's colour is the live ticket's state, read from items alone; no live ticket, no colour. `runPhaseOf` and the cycle-start rules of ADR 0057 go.
- **Gates and the closing report name their ticket (L6, L7).** A required `ticket` field on `gate1`, `gate2` and `report`; `gate1` also carries `branch` and `sliceCount` so the plan and its estimate can be written onto the ticket. A gate naming no ticket, a closed ticket, a ticket in the wrong state or a ticket that is not live is refused by name; the closing report may name a parked ticket.
- **The chain takes, it does not resolve (amends run-chaining L4).** `chainNext` marks `nextTicketOf`'s pick live; the ticket stays open through yellow and red.
- **A `gate2` may be posted while its ticket's questions are open; signing it is refused until they close (L22, amends ADR 0029).** Red must be reachable by an autonomous run that has stashed questions.

Rejected:
- Deriving the state from the gate items at read time: pure, but a dismissed gate would change the answer, and the user named storage.
- The record naming the live ticket: one more input to the tab renderer, and a record exists only once a run has started.
- Inferring a gate's ticket from the live pointer: a gate that names its ticket can be refused for naming the wrong one, and a report may still close a parked ticket.
- Editing ADR 0057 in place: the record of why the phase moved would be lost.

**Consequences**:
- Existing decks are read as-is (L12): a ticket with no `state` reads green while open and closed once resolved; a run in flight at upgrade has no colour until its next take.
- A ticket reads closed with its PR still unmerged; the merge stays a human step in the closing report.
- Every gate post carries a ticket id; a run started from a direct request first posts a ticket from the user's words (L17).

Recorded in `docs/design/ticket-states/architecture.md` (§5 L3, L4, L6, L7, L9, L11, L12, L16, L17, L22); deck threads itm_aed1a5d68b25, itm_f8b20562d8b8, itm_3c1d604acac5, itm_eacc820c542a.
