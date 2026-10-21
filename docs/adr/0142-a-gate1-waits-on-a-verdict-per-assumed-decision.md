---
status: proposed
date: 2026-10-13
tags: [deck, gates, pilot]
supersedes: []
superseded_by: []
paths: [deck/lineage.mjs, scripts/verdicts.mjs, docs/design/verdict-pass/architecture.md]
---
# A gate1 waits on a verdict per assumed decision

We decided that the deck refuses a `gate1` while the architecture artefact, read with git at the gate's sha, has an assumed decision (A‹n› in §6) with no `Verdict:` line, naming the ids it lacks. This applies ADR 0141: the pilot's weighing of the architect's defaults was informal, and is now a mechanism.

## Context

The architect stashes decisions it thinks are the user's. The pilot can see what the architect cannot (the queue, other runs' overlaps, the user's recorded preferences), but weighed them only when it happened to.

## Decision

- A verdict is an indented line inside the A‹n›'s bullet: `Verdict: stands` or `Verdict: overturned: <why>`, with a non-empty why. The bullet ends at the next top-level bullet or heading (L3).
- The check runs on the post path in `deck/lineage.mjs`, beside lineage, because only a refusal the deck makes cannot be skipped (L2).
- It reads the artefact at the gate's sha, not the working file, which can differ from what the gate signs (L4).
- It fails closed: in a git repository, an artefact unreadable at that sha refuses the gate1, naming the path and sha. A `repo` that is not a git repository is not checked (L5).
- An artefact whose §6 is empty or absent needs no verdict (L6).

## Rejected

- *A count the poster declares*: self-reported.
- *A §6 table column or a separate verdict section*: the first rewrites every artefact's shape, the second drifts from its decisions.
- *Reading the working file, or passing when the read fails*: leaves a hole in the mechanism.
