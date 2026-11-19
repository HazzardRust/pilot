---
status: proposed
date: 2026-11-18
tags: [deck, tickets, recut, yield, pilot, architect, co-pilot]
supersedes: [0153]
superseded_by: [NNNN]
paths: [deck/recut.mjs, deck/server-tools.mjs, deck/landing.mjs, deck/store-tickets.mjs, agents/pilot.md, agents/pilot-architect.md, agents/pilot-co-pilot.md]
---
# A stale plan is re-cut as standard, and a yield drains before it frees the lane

This amends ADR 0153's L3. We decided that the deck checks a signed plan for drift at its first co-pilot grant and after every landing, sends a drifted ticket red in the same call, and that an architect judges whether the landed change altered the plan's nature; and that a yield drains every live slice before the lane is freed.

## Context

A plan signed at Gate 1 was built days later against an `origin/pilot` that had moved under its owned files, and nobody was charged with noticing (itm_37c47ae69a4a, itm_2f4fa531782f). A yield told the co-pilot to hand back while slices were still in flight, four times on 2026-11-16/17. The user: "it has to be conceptual, we cant be deterministic with this one. if the nature of the functionality changes, then that is probably gonna be a re-cut".

## Decision

- **The deck checks drift, at the first grant and after every landing** (L2): the check costs no agent tokens and cannot be skipped.
- **Files trigger, the architect judges** (L3): any file a slice owns changed on `merge-base(plan.sha, origin/pilot)..origin/pilot` triggers; it never decides. The architect reads the landed change against the plan: nature unchanged, rebase and `deck_ticket replan`; changed, a real re-cut whose gate1 carries `Changed since <sha7>:`, keeping every locked decision and re-posting none of its questions.
- **Only before the first slice** (L4): a successor's grant skips the check; `pilot integrate` and the gate carry later drift.
- **Always re-cut; an unchanged plan keeps its signature** (L5): `replan` restores yellow at the new sha with no press when `docs/design/<slug>/` is textually unchanged; a gone old sha always takes a gate1.
- **Drain, then free the lane** (L6): a yield marks the ticket `yielding` and the slot stays held; the deck line `Yielding <id>` has the pilot send the pause, the co-pilot starts nothing and waits on every live child, and the flip to green and paused happens on the pilot's `release` after the `paused` hand-back.
- **A drift re-cuts in the same call that finds it** (L7): the grant or the landing moves the ticket red itself; the pilot reads `Re-cut check due <id>` or `Re-cut by this landing` and spawns an architect, briefed re-cut, to judge it.

## Rejected

- *The co-pilot's first act, or the architect per landing, checking drift* (L2): it costs tokens and can be skipped.
- *The deck deciding alone; any change on pilot as the trigger* (L3): the first cannot judge nature, the second costs an architect pass per landing.
- *Re-cutting a live ticket's unbuilt slices* (L4).
- *Re-sign always; co-pilot slice edits* (L5).
- *Freeing the lane at once* (L6): two co-pilots live, one unseen.
- *A mark the pilot must act on* (L7): it can be missed.
