---
status: proposed
date: 2026-11-16
tags: [deck, blocked, questions, pilot]
supersedes: [0153]
superseded_by: []
paths: [deck/blocked-shape.mjs, deck/store-items.mjs, agents/pilot.md, agents/pilot-co-pilot.md]
---
# The pilot closes a blocking question it no longer needs

We decided that the pilot may close any unanswered blocking question on a ticket itself, its resolution starting `Moot: <why>` or `Assumed: <what>` with a reason, and that this supersedes ADR 0153's A4, which allowed `Moot:` on `Blocked:` items only.

## Context

The user's words, in thread itm_3bd661057597: "have we created a ticket that allows the pilot to close blocking threads if it needs?" and "yes we need a pathway for the agent to get rid of blocking threads". Under ADR 0153 A4 every blocking question except a `Blocked: <command>` item waited on the user, paused its ticket after 20 minutes and refused its gate2, even when its answer had stopped mattering. The user chose both prefixes in itm_e0a9f965d9c8 ("Moot and Assumed"), overriding A4's rejection of "`Moot:` on any blocking item".

## Decision

- **Any blocking question** (L1): the pilot closes one whose step was done another way, was superseded or met a safe assumption. A gate1, gate2, signoff, walkthrough or proposal is never closed this way; only the user's press passes a gate.
- **Two prefixes, free text after** (L2): `Moot: <why>` when the answer no longer matters, `Assumed: <what>` when a safe assumption emerged. `Assumed:` need not match the question's `recommended`. A bare close or an empty reason is refused, and the refusal names both prefixes.
- **Only the pilot** (L3): the stamped `pilot` author closes; the owner rule is unchanged, so a thread another agent owns is taken back with a pass first. A co-pilot holds no `deck_resolve`: it sends `main` `moot <id>: <why>` and the pilot closes it (A2).
- **A needed answer waits**: a question whose answer is still needed waits on the user, as before.
- **The user's veto**: reopening a pilot-closed question restores its hold, and the pilot cannot close it again; only the user's answer clears it.
- A pilot close resumes a paused ticket as the user's answer does, and the gate2 body and the closing report list each one under `Closed by the pilot:`.

## Rejected

- *`Blocked:` items only* (ADR 0153 A4): it leaves every other stale question holding its ticket's gate2.
- *One prefix*: it loses whether the pilot judged the answer moot or assumed one.
- *`Assumed:` pinned to `recommended`*: it would refuse a better assumption than the default.
- *The co-pilot closes its crew's question*: it widens who may answer for the user past the pilot.

## Consequences

The pilot can answer for the user, so the reason is the audit: it shows in the thread, the close notice, the gate2 body and the closing report, and the user's Reopen takes the close back for good.
