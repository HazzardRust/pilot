---
status: accepted
date: 2026-09-15
tags: [workflow, review]
supersedes: []
superseded_by: []
paths: []
---
# The fundamentalist reports, the pilot decides, an implementer fixes, and the review subtracts first

The principles review used to send its blocking findings straight to the slice's QA agent, which fixed them before the user looked: nobody weighed whether a finding was worth its diff, and the reviewer's additive instincts (a wrapper here, a guard there) went in unchallenged. We decided that the fundamentalist only reports, with a subtraction pass run before the principles pass and every finding stating its fix as a removal where one exists and its net line change; that the pilot judges each finding against the diff and by consequence, preferring the removal, and takes a fix past the small-diff limit to the user; and that a fresh implementer with a fix brief makes the kept changes on the same branch, since the slice's first implementer has already ended and the PR keeps one writer. The review also runs once more over the whole feature when the last slice is in, where subtraction across slices is the point. Letting the fundamentalist fix was rejected because the reviewer that found a thing is the wrong judge of whether it matters; a removals-only remit was rejected because the mutation-testing findings it is best at name missing assertions, which are additions; a weighing-only tweak was rejected as too weak to change what the tools and the pass order look for.

**Consequences**: a kept finding costs a spawn to fix, so the pilot's triage is where a run's diff budget is spent, and the QA agent no longer carries the fundamentalist's findings at all.
