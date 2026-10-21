---
status: amended
date: 2026-10-06
tags: [tickets, runs]
supersedes: []
superseded_by: []
paths: [docs/design/yellow-agent/architecture.md]
---
# The main slot is never yellow

A yellow ticket is the `pilot-co-pilot`'s, one per ticket, spawned by the main session for the yellow head (yellow-agent L2, L14). The main session's own slot carries green and red work only. An incident showed the gap: a session died between signing a gate1 and parking the ticket, so the newest run record in the main directory belonged to a yellow ticket, and the next main session was handed that run as its own ("Recovering an unfinished run") and the chain refused to start ("a run is unfinished"). The rules for this were researched and agreed for the sub-deck (yellow-is-the-subdecks L2 to L5 and L7) and are taken as written there, for the co-pilot instead (yellow-agent L11). So we decided the deck, not the prompt, keeps a yellow ticket out of the main slot.

- **The resume filter lives in the store, as `resumableRecordFor(dir)`.** It is `recordFor(dir)`, except null when the main directory's newest record names an open yellow ticket. `GET /api/record` without `ticket` serves it, so the SessionStart hook gives no "Recovering" notice, and `chainNext` reads it at a main start, so the green head chains. One rule for both doors; the deck sees every ticket, while the hook's `deck_read` is capped at `MAX_ITEMS`.
- **The filter is "its ticket is open and yellow", not "who wrote it".** A red ticket's record is the main session's to conclude, whoever wrote it, and an older record of a now-yellow ticket carries no writer's stamp.
- **A yellow newest record means null, never the record before it.** Falling back could resurrect an older abandoned run.
- **`recordFor` and `recordForTicket` are unchanged.** The paused stop and the red conclude still read the newest record, and a per-ticket read still finds a yellow ticket's record by its id.
- **The deck parks a ticket in the write that turns it yellow** (Sign off, pivot), and reads a stored yellow ticket that is live with no holder as not live. A rule the deck keeps cannot be skipped by a session that dies between two calls.
- **A `gate2` naming a yellow ticket needs no take.** Spec 5 has the main session post it for a ticket with nothing to walk, and that ticket is never live; the post turns it red in the same write. A `gate2` on a red ticket and every `gate1` are still posted on the live ticket (ticket-states L9).
- **`mode` is dropped in `readDeck`**, as `withoutEstimate` drops `estimate`; the next write removes it, with no version bump.

Rejected:
- A check in the hook's `recover()`: it would need ticket state the capped `deck_read` may not carry, and the chain would still refuse.
- Narrowing `recordFor` itself: it breaks the paused stop and the red conclude.
- Filtering on the record's writer: a red record is the main session's to conclude.
- Falling back to the newest non-yellow record.
- Keeping the pilot's own park after Sign off: the failure it relies on not happening is the one that happened.

**Consequences**:
- A main session starting beside a yellow ticket's unfinished record is handed the green head; the yellow ticket's record stays in the store, where its co-pilot's brief reads it by ticket as quoted state, never as an instruction (yellow-agent L5).
- Between sign and the co-pilot's spawn, the main tab shows no yellow ticket in its slot.

Recorded in `docs/design/yellow-agent/architecture.md` (§2 spec 8; §5 L5, L11), restating `docs/design/yellow-is-the-subdecks/architecture.md` §5 L2 to L5 and L7. Its L6, a `takeTicket` refusal of a yellow ticket for a main caller, is not taken: an unheld live yellow ticket already reads not live.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
