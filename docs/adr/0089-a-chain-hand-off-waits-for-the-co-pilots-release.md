---
status: amended
date: 2026-10-07
tags: [runs, crew]
supersedes: []
superseded_by: []
paths: [deck/run.mjs]
---
# A hand-off waits for the co-pilot's release

When the main session posts its closing report, the daemon posts a chain hand-off, and when its context fills it posts its own (`pilot handoff`); either way `pilot run` types `/clear` into the terminal so the work goes on in a fresh session (`clearOnce`, `deck/run.mjs`, the one place the wrapper types it). A co-pilot the session spawned for a yellow ticket (ADR 0088) runs on in the background through that, and the `/clear` sometimes kills it mid-slice (2026-10-05, exit 137) and sometimes does not (2026-10-06). So we decided that `pilot run` types no `/clear` for any hand-off while the deck holds a live co-pilot for its directory, that before a context hand-off the main session pauses its co-pilot so the slice in flight finishes, and that the deck learns of the co-pilot from the main session alone (clear-waits-co-pilot L3 to L8, L11, L12).

- **The flag is a per-directory entry**, `deck.coPilots[repoKey] = { ticket, live, at }`, beside `budgets`: one co-pilot per main session per directory (yellow-agent L2). The wrapper reads it from `GET /api/record?repo=`, which marks nothing delivered; a field on the ticket item would sit outside the 20-item window `deck_read` returns.
- **Liveness is read, never inferred.** The session writes `deck_ticket co-pilot <ticket>` before it spawns and the hand-back's own write (`deck_ticket need`, or the yellow ticket's `gate2` post) releases it; `deck_ticket release` is for a co-pilot that stopped without handing back. No heartbeat, no agent id, no roster (yellow-agent L3): a co-pilot waiting on its implementers makes no tool call for longer than any TTL would allow.
- **A hold, not a timed wait.** `clearOnce` answers no while the co-pilot is live and gives its claim back; the release is a writing tool call, so its own change event retries the `/clear`. The turn wait becomes `lastTurnEnded() >= max(postedAt, co-pilot.at)`, so a `/clear` never lands inside the hand-back turn.
- **A context hand-off is held too, and the co-pilot is paused first** (the user, itm_6ddd197ab21f). The guard's advisory at 225,000 tokens tells the pilot to send its live co-pilot a pause; the co-pilot integrates the slice in flight, starts no other, and hands back `paused`; the pilot releases it, and the `/clear` follows the next turn end. The 35,000 tokens to the hard mark at 260,000 are enough for a slice, both marks are advice and not a block, and a main session waiting on a background co-pilot spends almost no context. `pilot handoff`'s answer repeats the pause while the deck still says a co-pilot is live. The hold has no time bound: a hung co-pilot is released by the session on its failure notice, by `pilot run` restarting, or passed over by the user's own `/clear`.
- **A stale flag never outlives the wrapper**: `pilot run` starting releases its directory's entry, since no co-pilot of the new session exists yet.
- **While a chain hand-off is open, `deck_ticket co-pilot` is refused** (A1): the `/clear` lands at the first hand-back and the fresh session spawns the next co-pilot from its yellow lane, rather than this session draining the whole yellow queue before the next green ticket can start.
- **A `/clear` typed by hand is untouched**: the pty forwards keystrokes as it does today.

## Considered options

- **Roster liveness or a heartbeat.** Rejected: the roster drops a silent co-pilot after 90 s, and a heartbeat check would double-spawn (yellow-agent L3).
- **A TTL on the flag.** Rejected: a co-pilot legitimately runs for hours; the wrapper's start bounds a stale flag instead.
- **Waiting inside `clearOnce`.** Rejected: it would hold the watch loop and the claim for the co-pilot's whole run.
- **Clearing a context hand-off at once.** First chosen, then reversed by the user: it costs the co-pilot exactly the slice this decision exists to save.
- **Pausing by `deck_ticket park`, `finished: "paused"` or `TaskStop`.** Rejected: `park` is the main slot's, the co-pilot never sends `finished`, and `TaskStop` kills the slice.
- **A time bound on the hold.** Rejected: the `/clear` it would force kills the slice in flight.
- **Spawning the next co-pilot on hand-back as today.** Rejected (A1): the `/clear` and the next green ticket would wait until the whole yellow queue had drained.

**Amended 2026-10-14 (yellow-lane S17, ADR 0147):** the ticket states kept their meaning and swapped colours, so planning is now red and concluding is now green, with yellow unchanged; read this ADR's green ticket as red and its red ticket as green.

**Amended 2026-10-20 (held-handoff S3, L4-L6):** the hold is bounded at 20 minutes, in place of "the hold has no time bound" and the rejected time bound above. A co-pilot that never hands back held a hand-off for hours, and none of the three releases this ADR named came. The bound counts from the earliest `hold.at` among the directory's open hand-offs, read from the items, so neither a re-posted hand-off nor a restarted wrapper resets it; `watch` looks again at that moment on its one timer, with no change event. Past it `pilot run` types the `/clear` after the next turn end since the post, with the co-pilot still live, asks the co-pilot nothing (the wrapper has no channel to it), and logs `hold on <id> past 20 min, typed /clear with the co-pilot on <ticket> live`. The slice in flight is what the bound costs; the fresh session adopting the co-pilot is the recovery.
