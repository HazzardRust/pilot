---
status: accepted
date: 2026-10-10
tags: [hooks, threads]
supersedes: []
superseded_by: []
paths: [docs/design/handoff-closed-on-pickup/architecture.md, hooks/stop-gate.js, hooks/session-handoff.js, hooks/post-tool.js, hooks/lib/deck.js]
---
# A picked-up hand-off holds its session

A session handed a `handoff` was told to resolve it once it held the run, and often never did: the item stayed open on the deck after the run had moved on. So we decided the Stop hook holds the turn of the session the hand-off was delivered to while that item is open (`docs/design/handoff-closed-on-pickup/architecture.md`, spec 2, L4–L8).

- **Scoped to the session handed it (L4)**: through a held marker, not every open `handoff` of the directory. The posting session must end its turn so `pilot run` can type `/clear`, and a second session in the same directory has nothing to resolve.
- **The held marker (L5)**: `<stateDir>/pickups/<session_id>.held.json`, written by `deliver()` in `hooks/session-handoff.js` right after the pickup marker on a successful write. `plainPickup` in `hooks/post-tool.js` drops it when it releases the claim; the Stop gate drops it once the item is no longer open. The pickup marker's judge-once deletion (ADR 0080) is left as it is.
- **Never a trap (L6)**: the gate stands aside on `stop_hook_active` and for a subagent, a dead deck never blocks, and the held check never waits `HOLD_MS`; resolving is the session's own act.
- **Excluded (L7)**: a `crew-handoff` is never picked up through the lane, and a chain hand-off is resolved by the lane on delivery, so neither is held.
- **Order (L8)**: the held check runs after an answered thread and before the wait on the user, and a session with no state, no posts and no held marker is still none of the gate's business.

Rejected:
- A directory-wide block on any open `handoff`: it traps the posting session.
- Keeping the pickup marker alive past its judgement: it would change ADR 0080's once.
- A literal hold until resolved: a loop, which the gate promises it never is.

**Consequences:**
- The held item is looked for among the open items the gate already reads; one that falls outside that read counts as no longer open and frees the session.
- A session that never stops leaves its marker until the hooks' week-old sweep.
