---
status: amended
date: 2026-10-04
tags: [crew, tickets]
supersedes: []
superseded_by: []
paths: [docs/design/merge-first/architecture.md]
---
# The architect merges first, in a thread it owns

This extends ADR 0041's owner kinds and follows ADR 0058 (the auditor) and ADR 0061 (a crew agent waits in a background shell). The rule that same-surface green tickets merge into the live one before the design was one clause in the pilot's instructions. On the slice-estimates run it was skipped: the deck did not check it, the run record had no field for it, a session resumed from the record started past it, and judging surfaces meant reading every green ticket's body, more than one deck read returns. The user asked for the merge to be "the first step, so we can make the cut 1 time", to be "the architect's job" with "its own thread", and for "the mechanics [to be] encapsulated in the architect rather than giving the pilot yet another job". So we decided the merge is the architect's first act and the deck holds Gate 1 on it.

- **The architect merges before any research (L6).** It reads the green queue, posts what it would merge and why, waits on that thread, calls `deck_ticket merge` itself and resolves the thread. The rule is written once, in the architect; the pilot's instructions lose their merge sentence and ticket-making points at the architect.
- **`architect` is an owner kind and not a pass kind (L3).** It owns what it posts, as the auditor does; a merge thread that falls back to the pilot stays the pilot's.
- **The merge thread is a `question` naming the live ticket (L4).** No new thread kind. With no answer the architect merges nothing: a merge cannot be undone.
- **The architect has the deck's post, reply, resolve and ticket tools, limited by its instructions (L11).** One merge thread and the merge action. The deck adds no author check: any local caller can already name any author, so a check would not be a boundary. It reads the queue with the read-only `pilot tickets`, never `deck_read`.
- **The merge decision is derived, never stored (L5).** One helper reads it off the deck's threads; `pilot tickets` and the Gate 1 check both use it.
- **The deck refuses a `gate1` whose merge step has not run (L13).** While the repository has another open green ticket and no merge decision names the live ticket, the post is refused by name.

Rejected:
- Keeping the rule in the pilot with a stronger sentence: it is how the step was skipped, and it spends the pilot's context on reading the queue.
- A `merged` field the pilot fills in on the gate: it proves nothing.
- Giving the architect `deck_read`: every open thread of the directory, and it marks replies delivered.
- The deck refusing take, park and reorder from the architect: an author check a local caller steps around.
- A new `merge` thread kind: the kinds are a closed list (ADR 0051) and a question naming the ticket already holds Gate 1.

**Consequences**:
- A user away at the start of planning holds the architect on its merge thread; it keeps reading meanwhile and sends no finding until the thread resolves.
- With an empty green queue nothing is posted and the Gate 1 check passes; with candidates on other surfaces the architect posts and resolves the thread itself, as the record.
- Any path that posts a `gate1` without an architect having run is refused while other green tickets are queued.
- The architect's description no longer says it never waits for the user.

Recorded in `docs/design/merge-first/architecture.md` (§5 L3–L6, L9, L11, L13); deck threads itm_9aa2494af867, itm_3ff6f7efe7c6, itm_5856545a2804.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.
