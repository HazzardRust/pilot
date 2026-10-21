---
status: accepted
date: 2026-10-09
tags: [crew, deck]
supersedes: []
superseded_by: []
paths: [agents/pilot-co-pilot.md, deck/schedule.mjs, bin/pilot.mjs, docs/design/co-pilot-successor/architecture.md]
---
# The co-pilot starts slices from the graph

A co-pilot ran its slices one after another even where the graph let two stems run at once, because the pilot's step 4 calls the pipeline and parallel lanes relaxations and a prose rule leaves the call to whoever reads it. Spec 6 needed a scheduling test, and no paragraph can be one. So we decided scheduling is code: `deck/schedule.mjs`'s `startable` over the run record's rows, behind `pilot ready --ticket <id> --slots <n>`, and the co-pilot runs it after every spawn and every integration and starts each slice it prints, from the tip it names.

- **One function serves the test and the co-pilot (L8).** `startable` is what `deck/test/schedule.test.mjs` pins, and `pilot ready` prints its answer; the co-pilot's definition names the command, not the rule.
- **The co-pilot passes `--slots` (L9):** its yellow budget less every live agent, itself and its reviewers included. Only the co-pilot sees its live children; the record does not.
- **A single-blocker stem pipelines; a join waits (L12).** A slice with exactly one blocker starts once that blocker has a draft PR, branched from its tip; a slice with two or more waits for all of them integrated. Answered with the default on itm_3987773a595e.
- **Each dot moves when the work does.** One `deck_status` per move: `implementing`, `draft PR #n`, `integrated`, `fixing`, `in QA`, each a state `phaseOf` knows.

Rejected:
- A paragraph alone: untestable, and the reading it leaves open is the one that ran slices in series.
- The deck pushing starts: the co-pilot owns its spawns and its budget.
- The CLI counting `doing` rows for the slots: it misses reviewers and QA.
- Pipelining joins too: a join stacked on unmerged PRs breeds conflicts.
- Integrated-only for every slice: it gives up the pipeline the user allowed.

**Consequences**:
- `agents/pilot.md` is unchanged; its step 4 relaxations stay the pilot's own, and the co-pilot's lane reads them as the rule.
- A record whose rows lack `after` schedules as if every slice were independent; the architect's blockers are what keep the order.

Recorded in `docs/design/co-pilot-successor/architecture.md` (§2 spec 6, 7, 9, 10; §5 L8, L9, L10, L12).
