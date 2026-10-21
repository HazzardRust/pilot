---
status: proposed
date: 2026-10-20
tags: [pilot, co-pilot, gate, lanes, crew]
supersedes: []
superseded_by: []
paths: [agents/pilot.md, deck/items.mjs, deck/lanes.mjs, deck/short-path-shape.mjs, deck/store-items.mjs, deck/ui/render-rail.mjs]
---
# A small ticket takes the short path

We decided that a ticket whose signed plan has 2 slices or fewer takes the **short path**: the pilot claims the implementing lane with `deck_ticket co-pilot`, spawns one `pilot-implementer` per slice itself and integrates each, spawns no co-pilot, fundamentalist, evidence runner or QA, and posts the one gate2 the user presses.

## Context

A one-slice ticket paid grilling, Gate 1, a co-pilot, an implementer, a reviewer, the fundamentalist and its evidence runner, QA, a walkthrough, Gate 2 and a landing: ten agents and two presses for about 100 lines. The deck already allowed the path: `deck_ticket co-pilot` only records a lane claim, the pilot may post a gate2 on a yellow ticket, and the post turns it green and releases the claim. The user asked for a systematic change, not another rule.

## Decision

- **L1** Depth *forks*: only questions whose paths fork went to the user (A1, A2).
- **L2** Derived, not stored: `isShortPath` reads `ticket.plan.sliceCount` (`SHORT_PATH_MAX = 2`).
- **L3** The deck changes only its wording and the gate2's evidence; it spawns nothing, so the short path is the lane's line plus the pilot's prose.
- **L4** The short-path gate2 carries its evidence in the body: one `Verdict:` line per slice and a `Gate:` line, which the deck checks on short-path tickets only.
- **L5** The short-path implementer and its children count in the `yellow` half of `pilot budget`, since they hold the yellow lane.
- **L6** Numbered 0168; a collision at the base merge is renumbered by the pilot.
- **L7** Each slice's reviewer findings are fixed inside its own slice loop; there is no feature-level fix round.
- **A1** One implementing lane: a short ticket claims the same lane, so it waits behind a long ticket and a long one behind it.
- **A2** A gate1 of 2 slices or fewer names `surface`; with `surface: true` the pilot posts the walkthrough from the implementer's live check, and the deck refuses that gate2 without one.
- **A3** The path is fixed at Gate 1: a found-issue slice that takes the ticket to 3 keeps it short.

The full suite still runs once, at the landing (ADR 0166); it is the referee for the skipped QA pass.

## Rejected

- *A full grilling round over every branch* (L1).
- *A stored `path` field* (L2): it could disagree with the plan (ADR 0151's reason).
- *Refusing `deck_ticket co-pilot` on a short ticket* (L3): the pilot would hold no lane claim, breaking yield and pause.
- *Prose only, or new gate2 fields* (L4): nothing would check prose, and the PR body already carries the verdicts.
- *The main half of the budget* (L5): it would starve planning.
- *A second implementing lane beside the co-pilot* (A1): a new claim record, a lanes and rail change, and two tickets building at once.
- *A surface takes the long path* (A2): most deck-UI tickets would lose the saving; *prose only*: a forgotten walkthrough is never caught.
- *Re-evaluating the path at each added slice* (A3): it would spawn the long-path crew mid-run.

## Consequences

- A 1- or 2-slice ticket spawns no co-pilot, fundamentalist, evidence runner or QA, and the user presses once.
- A short ticket that grows to 3 slices skips the principles review.
- A short-path walkthrough is thinner than QA's: the implementer's live check, posted by the pilot.
- The co-pilot's, QA's and the architect's definitions are unchanged; so is trivial work.
- A short ticket that grows past 2 slices still needs only the plan's count of `Verdict:` lines, since the plan decides (L2, A3); the added slice's verdict is the pilot's to write, not the deck's to count.
