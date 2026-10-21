---
status: amended
date: 2026-10-04
tags: [tickets, gates]
supersedes: [0060]
superseded_by: [0085]
paths: [agents/pilot.md, docs/design/overview-one-ticket/architecture.md]
---
# Red means the user is needed, and a pivot sends a red ticket back to yellow

ADR 0060 turned a ticket red only when its `gate2` was posted, so red meant "the PR is ready to sign". A run whose user was needed earlier — a walkthrough waiting while no agent had independent work, or only end-saved questions left — stayed yellow, and the overview could not tell a ticket that needs the user from one still being built. And a red ticket the user's feedback sent back for a substantial change had no way back: its open `gate2` blocked a second one (ticket-states F4), and closing it through `resolveItem` is refused for an unsigned gate (merge-first L12). So we decided red is "the user is needed", written by the pilot, and a pivot is its inverse. Amends ADR 0060's "red once its `gate2` is *posted*": that still holds, and is now one of two ways to red.

- **`deck_ticket need` turns an open yellow ticket red (L7).** Stored on the ticket in one store write, refused by name unless an open question, walkthrough or gate2 in the ticket's directory names it, so a red ticket always has something for the user to do. Posting a walkthrough moves no state; posting a `gate2` still turns its ticket red.
- **`deck_ticket pivot` turns a red ticket yellow and closes its open `gate2` as `superseded by pivot`, unsigned, in the same write (L8, L15).** It never goes through `resolveItem`; it writes no reply for the user and signs nothing. A later `gate2` can then be posted and turns the ticket red again. Refused by name on a ticket that is not red, and on a `gate2` the user has already signed off.
- **No new state and no version bump (L10).** A ticket already waiting on its walkthrough stays yellow until the pilot calls `need`.
- **One way out of yellow (L18, L19, L20).** The pilot's `need` is how a run turns its ticket red, for a walkthrough or a blocker alike: the `gate2` is posted inside red, after the walkthrough's sign-off, and an autonomous run never posts it. A blocking question parks nothing; the pilot works around it until nothing more can move, then calls `need`. No run finishes `blocked`; an autonomous run with no yellow ticket left finishes `needed`, which chains nothing. Only turning implementation mode off parks a yellow ticket, and attended never takes one in hand. A blocking question keeps its two deck rules: it refuses its ticket's `gate2` post, and it is never answered for the user. Supersedes ticket-states B4.

Rejected:
- Deriving red from open items: a closed question would silently change the colour, and ticket-states L3 keeps one writer, the store.
- A `deck_status` field: records are per run, not per ticket.
- Asking the user to Dismiss the gate2 before a pivot: two steps, and a yellow ticket with a live gate2 in between.
- A "Back to implementing" button only the user presses: the user has already said what to change on the thread.

**Consequences**:
- The pilot decides when the user is needed; `agents/pilot.md` says when (overview-one-ticket spec 19).
- A superseded gate2 reads as closed with no Sign off and its resolution says why.

Recorded in `docs/design/overview-one-ticket/architecture.md` (§2 spec 15-18; §5 L7, L8, L10, L15).

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
