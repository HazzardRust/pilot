---
status: proposed
date: 2026-11-20
tags: [deck, tickets, recut, drift, replan, pilot, architect, co-pilot]
supersedes: [0187]
superseded_by: []
paths: [deck/recut.mjs, deck/landing.mjs, deck/server-tools.mjs, deck/store-tickets.mjs, deck/lineage.mjs, agents/pilot.md, agents/pilot-architect.md, agents/pilot-co-pilot.md]
---
# A re-cut is the pilot's or co-pilot's decision, and a plan goes on pilot by a merge

This amends ADR 0187's L2, L5 and L7. We decided that the deck notes a drifted plan and never re-cuts it on its own; that the pilot or the co-pilot puts the plan on the new pilot by `git merge` and `deck_ticket replan` moves it there with no press; and that only a change to what the user signed comes back to them as a Gate 1.

## Context

A landing over a file a signed plan owned sent the ticket red and asked the user for a new Gate 1 while the user was away, so nothing completed (the 2026-11-19 landings ffeb730 and 3586886 over itm_7d3455d28cd6 and itm_0dcd9aa67146). The user: "the re-cut thing is triggering and nothing will get completed whilst i am gone. we need to make some express changes to turn it off so the tickets stay yellow". An architect that rebased a pushed design branch then needed a force-push, which is the user's to allow (itm_43233104ddcc). The design is `docs/design/recut-decision/architecture.md`.

## Decision

- **No grilling** (L1): the user pressed "No grilling"; every open decision was assumed and given a verdict at Gate 1.
- **The deck never re-cuts on its own** (L2, amending 0187 L2 and L7): the landing sweep and the first grant write one drift line naming the files and the slices owning them, and the ticket stays yellow; `recutTicket` is reached only by the pilot's `deck_ticket recut`.
- **Put on pilot is a merge** (L3): a pushed branch takes pilot by `git merge <remote>/pilot`, never a rebase, so no force-push is asked; the gate1 lineage check already accepts a merge of pilot, and its off-tip refusal now names `git merge`. A branch carrying copies of pilot's commits is still refused with `git rebase`, since a merge keeps the copies; that rebase of a pushed branch is the one force-push left, and it stays the user's to allow.
- **One `deck_ticket replan` for both cases** (L4, amending 0187 L5): a red ticket carrying a re-cut mark, and an open yellow signed one, which keeps `grantedAt`.
- **This ADR** (L5): the run's record, numbered at the landing.

## Assumed decisions

- **A1** Replan passes when §2 spec, §5 locked decisions and §8 slices of `architecture.md` are unchanged; any other edit passes and is named on the ticket line. Verdict: overturned from "byte-unchanged `architecture.md`": the user's spec line 3 says a wording-only change passes unasked, and landings fix anchors in §3.
- **A2** Tickets already red from the old sweep are not migrated; the pilot replans each by hand. Verdict: stands, none is red now.
- **A3** The co-pilot gets no `deck_ticket`: it merges pilot into `feat/<slug>`, pushes and sends `main` the sha; the pilot replans. Verdict: stands.
- **A4** QA runs the deck tests on a scratch store and reads `pilot tickets` once; no live landing. Verdict: stands, the plan has no surface a user looks at.

## Rejected

- *An env switch turning the sweep off* (L2): it leaves no record of the drift.
- *Rebase, then force-with-lease* (L3): the force-push is the user's question this run removes.
- *A new `deck_ticket` action for the yellow case* (L4): more interface for the same diff check.
- *Widening the co-pilot's tool list with `deck_ticket`* (A3): agent configuration for one relay.
- *The deck parsing a free-text why* (A1): no floor under it.
