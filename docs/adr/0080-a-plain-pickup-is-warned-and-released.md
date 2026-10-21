---
status: accepted
date: 2026-10-08
tags: [hooks, threads]
supersedes: []
superseded_by: []
paths: [docs/design/audit-fixes/architecture.md, hooks/session-handoff.js, hooks/post-tool.js, hooks/lib/deck.js]
---
# A plain pickup is warned and released

`pilot run` always starts the pilot with `--agent pilot:pilot`, but a hand-off is also picked up by plain `claude`, or by `/clear` outside the wrapper, and that session has neither the pilot's prompt nor its tools: it spends about 32k tokens holding a run it cannot carry. SessionStart, where the hand-off is delivered, carries no `agent_type` (probed live); a tool call's payload does, for a main session started with `--agent`. So we decided the pickup is judged at the session's first tool call, inside the PostToolUse process that already runs, from a marker the pickup lane leaves when it delivers (`docs/design/audit-fixes/architecture.md`, F2, L3, Q8).

- **The marker**: on a delivered ordinary hand-off, `hooks/session-handoff.js` writes `<stateDir>/pickups/<session_id>.json` naming the claim and the item. A chain hand-off is resolved on delivery and gets none: there is nothing left to release.
- **The judgement**: `hooks/post-tool.js` reads and deletes the marker on the main session's first tool call. An `agent_type` of `pilot:pilot` or `pilot` is silent and keeps the claim; anything else, including none, releases the claim (`release` in `hooks/lib/deck.js`), shows the user a warning naming `pilot run`, and tells the model not to act on or resolve the hand-off.
- **Once**: deleting the marker is the judgement, so a second call says nothing. A subagent's call (`agent_id` set) shares the session id and never judges.

Rejected:
- Asking the model to judge its own system prompt: unobservable and untestable.
- Warning at SessionStart: the role is not known there, so it would be a guess.
- Warning without releasing: the user is told to run `pilot run`, which would then receive nothing.

**Consequences:**
- The hand-off item is never deleted or resolved by this; only the delivery claim is given back.
- A session that makes no tool call leaves its marker until the hooks' week-old sweep, and its hand-off stays claimed.
- A chain hand-off (`item.next`, `hooks/session-handoff.js`) is delivered unwarned: it is resolved on delivery, so a release could not restore it.
