---
status: accepted
date: 2026-09-19
tags: [workflow]
supersedes: []
superseded_by: []
paths: []
---
# Grilling depth is the user's to set, once per run

The user noticed they were getting few grilling questions and asked whether a commercial project would get the same. It would: this run put six items on the deck against twenty-one locked decisions, because the pilot skill's "if the architect's assumed default is what the user would pick, do not ask" and the user's own standing "ask only when no assumption is safe" both lower the bar without ever asking how deep the user wants it. We decided that step 1 of the pilot skill asks the depth once per run — *every* locked decision, or *forks* only, where the paths produce materially different deliverables — records the answer in the artefact, and that at *every* Gate 1 becomes a walk of the locked decisions one item at a time, each in the short form of spec line 18 with "Teach me" available, before the signoff on the whole artefact. The override lives in the pilot's own agent file and skill, where the one-question-at-a-time override already lives; the vendored `grilling` skill is not edited. Rejected: leaving it to the pilot's judgement (that is what produced six items); a third, intermediate depth (two are enough to tell the pilot which rule to apply); a separate run (the next feature would be grilled the way this one was).

**Consequences**: a run at *every* depth takes longer to reach Gate 1 and puts one item per locked decision on the deck; a run at *forks* behaves exactly as today; the depth is visible in the artefact, so a reader of the record knows what the user was and was not shown.
