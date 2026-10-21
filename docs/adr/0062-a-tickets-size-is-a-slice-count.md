---
status: accepted
date: 2026-10-04
tags: [tickets]
supersedes: []
superseded_by: []
paths: [docs/design/slice-estimates/architecture.md]
---
# A ticket's size is a slice count, and nothing measures it

This supersedes the estimate decisions of the ticket-states runs (ticket-states spec 7–8, L15). A ticket carried an `estimate` in minutes, the deck measured minutes per slice from closed runs (the median of the last 20, 30 until one existed) and wrote a Gate 1 estimate from it. The user asked for the minutes to go and for the measurement to go with them: "get rid of the time estimates and just replace it with n of slices … aim for n = 15", "get rid of the self evaluations, it's unnecessary mechanism". The live store agreed: one closed plan recorded 5 minutes for 5 slices, the measurement at its floor. So we decided a ticket has one size, in slices, given when it is posted.

- **The field is `sliceCount`, and `estimate` is retired (L13).** It is the property `deck_post` already declares for `gate1` and the plan already stores, so a ticket and its plan use one word. A post carrying `estimate` is refused by name by the store's existing unknown-field refusal; no new check exists for it.
- **The measured estimate is deleted, not converted (L2).** `minutesPerSlice`, its default and window, `plan.estimate` and the skill's measured bullets go. Nothing derives a size from a finished run.
- **Slices are the only unit (L3).** Nothing converts a slice count to time: not the row, the merge answer, the chain hand-off or an audit pick.
- **The target is 15 and the one-run bound is 20 (L8).** ticket-making aims a ticket at 15 slices and cuts by surface; a ticket past 20 is still one ticket, and the architect groups its slices into runs at Gate 1.
- **Stored minutes are dropped on read (L11).** A ticket's `estimate` and a plan's `estimate` are stripped idempotently and are gone at the store's next write. Nothing is converted.

Rejected:
- Keeping `estimate` with slices as its meaning: 90 minutes and 90 slices are the same integer, so a minute-sized post could not be refused and old values would read as slices.
- A measured slices-per-run figure in place of minutes per slice: the same mechanism with a new unit.
- Converting stored minutes at 30 a slice: it invents a count nobody chose, from the measurement being deleted.
- A ceiling on the count to catch minute-sized numbers: new mechanism for what the rename already does.

**Consequences**:
- A ticket stored before this change shows no size until Gate 1 gives it the plan's count.
- A row shows the planned count once Gate 1 is signed and the posted count before (L4); a merge adds the two counts (L5).
- Anything still posting `estimate` is refused until it is updated.
- The audit's ranking by minutes saved and every timeout counted in minutes are untouched: neither is a ticket size.

Recorded in `docs/design/slice-estimates/architecture.md` (§5 L2, L3, L8, L11, L13); deck threads itm_1214816b3789, itm_02b1d791ad82, itm_303f112f9d53.
