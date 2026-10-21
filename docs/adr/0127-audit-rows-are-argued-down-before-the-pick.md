---
status: accepted
date: 2026-10-11
tags: [audit, fundamentalist]
supersedes: []
superseded_by: []
paths: [agents/pilot-auditor.md, skills/audit/SKILL.md, deck/audit.mjs, docs/design/bigger-jobs/architecture.md]
---
# Audit rows are argued down before the pick

We decided the auditor spawns `pilot-fundamentalist` on its report before posting, and the item shows kept rows to pick from, then cut rows with their reasons.

## Context

The user, on itm_b35e9317cfdd: the fundamentalist should "adversarially review the suggestions made by the auditor ... what of the changes are unnecessary and contribute to overengineering".

## Decision

- The brief lives in `agents/pilot-auditor.md`: argue each row down, removal first, one verdict per row (keep, cut as unnecessary, cut as overengineering) with a reason.
- Verdicts are stored on report rows as `verdict { call, reason }`; `renderReport` lists kept rows, then a Cut section.
- A cut row can still be picked.

## Rejected

- *A brief section in `agents/pilot-fundamentalist.md`*: a second home for a brief only the auditor writes.
- *Dropping cut rows*: the user should see what was dropped.
