---
status: proposed
date: 2026-10-18
tags: [architect, design, check-slices]
supersedes: []
superseded_by: []
paths: [agents/pilot-architect.md, scripts/check-slices.mjs, scripts/vocabulary.mjs, docs/design/architect-deeper/architecture.md]
---
# The architect works deeper, not wider

We decided the architect asks 3 depth questions before it designs, attacks its own cut by walking the real red steps, and holds every spec line to a bar a user could check, and that `check-slices` refuses an artefact that shows none of this.

## Context

The user asked for some of the philosophy of Felix Rieseberg's essay "How to be more ambitious: a tutorial for humans with models" (felixrieseberg.com, 2026-10-13) to be built into the system, and judged the architect the right place. The essay names four kinds of ambition: speed, altitude, depth and range. The ticket keeps **depth** (work the way a top expert would, with their instruments, unreasonable targets, challenged assumptions and an outside judge) and range's **red team** (attack the work by doing what an attacker does, not by role-play). Altitude's "take the human out of the loop" and a general push to be ambitious are out. The architect goes deeper on the stated ask and never wider.

## Decision

- **The depth step** (L1): `agents/pilot-architect.md` gains a `## Depth first` section between `Merge first` and `Read before you design`. It asks what a top practitioner of the feature's domain would do that the brief did not ask, what raw material they would start from, and what outside the architect and the user would confirm the result. Each answer becomes a spec line tagged `practitioner: <who>`, inside the stated ask.
- **The red-team pass**: after the deepening pass the architect walks each slice's first red step against the code, names a slice that would break and every seam two slices each half-build, or writes `red team: none found` with what it attacked, and records each finding in the assumed decisions or the slice table as a `red team:` line.
- **The bar** (L4): every spec line carries a numeral outside code spans and identifiers, a number word from zero to twenty, or a bound phrase (at most, at least, exactly, within, under, no more than, fewer than). A digit inside an identifier or after a reference word is not a bar.
- **The check** (L2): `check-slices`, given a path ending `architecture.md`, refuses each spec line with no bar by line number, an artefact with no `practitioner:` tag, and one with no `red team:` line (ADR 0141: a good move becomes a refusal no agent re-derives).
- **Reading outside the repo** (L6): practitioner knowledge not in the repo goes through a `pilot:pilot-explorer` brief within the architect's child budget.
- **The guard** (L7): the vocabulary guard exempts `docs/design/architect-deeper/`, this ADR and its index row, 3 paths and no more.

## Rejected

- *A paragraph inside Read before you design* (L1): it leaves a pin untouched but the step reads as research.
- *A deck gate1 refusal like ADR 0142* (L2): stronger, but it reaches `deck/lineage.mjs` and the gate route, wider than the ask.
- *A section reader shared with `verdicts.mjs`* (L3): one consumer each, so a hypothetical seam.
- *Any digit counts as a bar* (L4): every table row would pass through its `#` cell.
- *Free web search in the depth step* (L6): the wider path.
- *Wording pins only* (A1): they prove the prompt says it, not that a run did it.

## Consequences

An architect run that skips the depth step or the red team fails `check-slices` on its own artefact. Older artefacts are never refused, because only the paths given are checked.
