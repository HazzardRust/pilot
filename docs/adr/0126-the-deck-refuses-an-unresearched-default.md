---
status: accepted
date: 2026-10-11
tags: [deck, grilling, research]
supersedes: []
superseded_by: []
paths: [deck/question-shape.mjs, deck/store-items.mjs, skills/grilling/SKILL.md, docs/design/bigger-jobs/architecture.md]
---
# The deck refuses an unresearched default

We decided a question carrying `recommended` from the pilot, the architect or QA is refused unless its body has a `Research:` line, researched or `Research: none, <skip reason>`.

## Context

This amends ADR 0119. Its rule was prose, and at research-first's QA (461887b9) 0 of 3 runs put the cited question up with research. The user wants a mechanism, not a sentence the pilot may skip.

## Decision

- `questionShapeGaps(body, { recommended, author })` in `deck/question-shape.mjs`, pure, beside `ticket-shape.mjs`. `postItem` refuses on a gap and names the rule.
- The skip reason is one of grilling's skip list: codebase fact, preference, scope call, locked decision or ADR, done this run.
- Authors other than pilot, architect and QA are not checked.

## Rejected

- *The pilot's question path spawns the explorer first*: prose again, the thing that failed.
- *A hidden schema field instead of a body line*: the user would not see why a default went unresearched.
