---
status: accepted
date: 2026-10-09
tags: [crew, hooks]
supersedes: []
superseded_by: []
paths: [agents/pilot-co-pilot.md, agents/pilot.md, docs/design/co-pilot-successor/architecture.md]
---
# A co-pilot pauses itself at its advisory mark

A co-pilot past its hard mark got the crew agent's notice: commit `wip:` to a slice branch it does not own, message `main`, stop. Whether its ticket went on depended on the pilot reading a prose handoff and choosing to spawn again, and the user wanted the co-pilot to hand off "without the pilot in any way". So we decided a co-pilot pauses itself at its advisory notice and the main session spawns its successor from three ids.

- **The trigger is the advisory notice, not the hard one.** A subagent with a live background child cannot finish, so the co-pilot spawns nothing after the notice and drains what is in flight in the tokens between the two marks. Past the hard mark still undrained, it waits on its children and stops none of them.
- **The outcome is `paused`, not a new one.** `pilot.md`'s Yellow section already releases a `paused` co-pilot (ADR 0089); the co-pilot's last `deck_status` carries every row, each slice still in flight as `draft PR #n` with its branch, and `next`: the self-pause, the feature branch's tip and the exact next move. It never commits `wip:`.
- **The main session spawns the successor**, woken by the hand-back's notification, with no user turn: `release`, `deck_ticket co-pilot`, one `Agent` call whose brief is the ticket id, the `crew-handoff` item id and the run record's location. The successor reads the signed plan, the record (`GET /api/record?ticket=`) and the item itself, and continues the rows.

Rejected:
- (a) The co-pilot spawns its own successor: Claude Code withholds `Agent` three layers below the main conversation, so the successor's implementer could spawn no reviewer, a second successor nothing; and a subagent waits on its background children, so the predecessor would stay live past 260,000 tokens until its successor finished.
- (b) A headless co-pilot started from `deck/run.mjs`: it re-opens ADR 0088's removal of the second-session sub-deck, and its hand-back could reach the pilot only by a cross-session message.
- (c) A hook that respawns the co-pilot: no hook can call `Agent`, and `SubagentStop`'s `additionalContext` only continues the stopping agent.
- A new `handed off` outcome: a `pilot.md` clause paid from a budget at its pin, for no different action.
- The hard mark as the trigger: a slice in flight would carry the co-pilot far past 260,000 tokens before it could stop.

**Consequences**:
- `pilot.md`'s Yellow section gains one clause, the successor's three-id brief; the pilot's prompt pin moves by its measured cost.
- The guard's own texts and item for a co-pilot (S2 of the feature) are what deliver the notice this decision acts on.

Recorded in `docs/design/co-pilot-successor/architecture.md` (§2 spec 1, 2, 3, 5; §5 L1, L2, L3, L5).
