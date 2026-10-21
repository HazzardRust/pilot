---
status: accepted
date: 2026-10-08
tags: [review, security, git, runs]
supersedes: []
superseded_by: []
paths: [docs/design/security-reviewer/architecture.md, agents/pilot.md, agents/pilot-fundamentalist.md]
---
# Integration holds for the security verdict

A slice whose Reviewers line names `pilot:security-reviewer` (ADR 0102) could still reach the integration branch without that review, if the implementer skipped it. Step 5 is the one place every slice passes through before it lands. So we decided that the pilot, or the co-pilot, does not integrate a slice named for security until its report carries the security reviewer's `Verdict:` line; when the verdict is missing, the integrator spawns the reviewer on the slice PR first (`docs/design/security-reviewer/architecture.md`, L8).

- **What it checks** is the verdict line copied into the implementer's report, not the reviewer's prose.
- **The fundamentalist** cannot spawn agents. When the whole feature hits the trigger in files no slice's security review covered, it adds a "consider calling `pilot:security-reviewer`" row to its report, and the pilot or co-pilot spawns the reviewer at step 7.

Rejected:
- A warning row only: a missed review would still land.
- Giving the fundamentalist an `Agent` tool: it would break its read-only rule, which says it spawns no children.

**Consequences:**
- A skipped review costs one reviewer spawn before the merge, not a finding after Gate 2.
- The co-pilot reads steps 5 and 7 from `agents/pilot.md`, so it follows the rule with no edit of its own.
