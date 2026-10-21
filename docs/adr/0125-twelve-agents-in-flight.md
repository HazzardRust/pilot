---
status: accepted
date: 2026-10-11
tags: [concurrency, budget, agents]
supersedes: []
superseded_by: []
paths: [deck/budget.mjs, rules/orchestration.md, agents/pilot-implementer.md, agents/pilot-co-pilot.md, agents/pilot-qa.md, agents/pilot-architect.md, docs/design/bigger-jobs/architecture.md]
---
# Twelve agents in flight

We decided the in-flight ceiling moves from 8 to 12, the default split from main 3 / yellow 5 to main 4 / yellow 8, and child budgets to architect 6, implementer 5, QA 3.

## Context

The ceiling of 8 was set on 2026-09-06 after a run spawned past the rate limit. The user asked for more agents an implementer can run ("dont mind bumping it up to 12 as the cap", itm_0c57995052ae).

## Decision

- `CEILING` 12 and `DEFAULT_BUDGET { main: 4, yellow: 8 }` in `deck/budget.mjs`. A split a user already stored is kept.
- Main fits the pilot, an architect and two researchers. Yellow fits the co-pilot, an implementer and its five children, plus one.
- The architect's and QA's child budgets rise by the ceiling's ratio (×1.5), and every file that names a count says the same number.
- `rules/orchestration.md` records the move from 8 and why.

## Rejected

- *Rewriting stored splits*: a stored split is the user's setting.
- *An implementer above five*: two implementers with full child sets would not fit yellow 8.
