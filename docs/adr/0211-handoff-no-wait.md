---
status: proposed
date: 2026-11-23
tags: [handoff, crew, deck, hooks]
supersedes: []
superseded_by: []
paths: [deck/run-look.mjs, scripts/handoff.mjs, hooks/lib/guard-advice.js, agents/pilot.md, docs/design/handoff-no-wait/architecture.md]
---
# A pilot hand-off never waits on the co-pilot

We decided that a context or chain hand-off clears at the first turn end after `pilot handoff`, whatever the
co-pilot is doing: no pause is sent to it and no hold is applied, because the clear already keeps the crew
running. The look's `turn` answers `clear` or `none`, never `held`. This amends ADR 0089 and held-handoff
(L4-L6), which held the clear for up to 20 minutes while the deck said a co-pilot was live.

## Context

When the pilot's context fills it hands off and the session is cleared. The co-pilot and its implementers are
children of that session, so the pilot first sent the co-pilot a pause and waited for its `paused` hand-back, and
the hand-off mod held the `/clear` for up to 20 minutes while the deck held a live co-pilot. During that wait the
pilot did nothing. On 2026-11-22 a co-pilot told to pause at 10:23 was still working at 11:20: its second hand-back
was refused while its implementers ran, so the clear waited on a message that could not arrive.

Probes on Claude Code 2.1.330 (handoff-no-wait §3, E1-E5) showed the clear keeps every live agent: a
background agent wrote 47 s after the clear, a depth-2 worker 67 s after it, and a `SendMessage` to `main` 56 s
after it was read by the fresh session. The clear drops only the queued notices of the cleared conversation's own
backgrounded tool calls, and no crew message is one of those.

## Decision

- **L2** A hand-off clears with no regard to the co-pilot. `turn` answers `clear` or `none`, never `held`; the
  `pilot handoff` line and the context advisory ask for no pause.
- **L3** The hold is deleted, not disabled: `holdFor`'s co-pilot gate, `sayHeld`, `/api/hold`, `markHold` and its
  re-arm, the `held` card note, `HOLD_BOUND_MS`, and the mod's hold timers.
- **L4** The deck stamps the co-pilot's agent id on its entry from a roster heartbeat: type `pilot:pilot-co-pilot`,
  this repository, a live entry, and a time after its `at`; the latest such heartbeat wins.
- **L5** The fresh session's notice names the survivor by id and says `SendMessage <agentId> resync <clearedAt>`,
  spawn none. With no answer, `deck_ticket release`, then spawn (held-handoff's fallback, kept).
- **L6** Resync recovers the reports the old context read but had not acted on: the survivor repeats every
  question and hand-back it sent `main` since `<clearedAt>`.
- **L7** A new Claude Code process still releases the directory's co-pilot (handoff-mod L13), and the co-pilot's
  own self-pause at its own mark is unchanged (ADR 0208).
- **L8** Yield and SWITCH keep the pause, since there the co-pilot really does stop. Only the hand-off's pause goes.
- **L9** Survival is re-proved by a script, `node scripts/probe-clear-survival.mjs`, not a test in the suite: it
  costs model calls and needs a signed-in `claude`, so QA runs it, and anyone runs it after a Claude Code update.

## Considered options

- **Clear and keep the crew** (taken). The existing clear already keeps it; what made the pilot wait was the
  pilot's own hold.
- **A faster co-pilot pause.** Rejected: any pause still costs the slice in flight or waits for it, and the
  hand-back cannot land while children run.
- **Crew outside the pilot session**, a separate `claude` process. Rejected: it survives a crash too, but needs a
  cross-session channel, its own permissions and window, and a new spawn path, roughly three times the slices.
- **`$.session.compact` in place of `/clear`.** Rejected: a summary carries context forward, which defeats a fresh
  session.
- **A flag that turns the hold off.** Rejected: dead code with a switch.

## Consequences

The pilot hands off in seconds rather than up to 20 minutes, and the crew's slice in flight is never cut short by a
pause. Survival rests on undocumented host behaviour, guarded by L9's probe, and a crash of the Claude Code process
still kills the crew.
