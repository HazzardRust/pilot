---
status: accepted
date: 2026-09-15
tags: [workflow, review]
supersedes: []
superseded_by: []
paths: []
---
# QA runs once per feature, on an integration branch, and no slice PR leaves draft

Until 2026-09-15 every slice went through its own QA walkthrough and its own Gate 2, and its PR merged to the default branch as soon as the user was satisfied. That cost the user a walkthrough per slice, most of them on half a feature, and it meant the flows that cross slices were exercised by nobody before merge. We decided that QA happens once, on the whole feature: the pilot creates `feat/<slug>` at Gate 1 with a draft feature PR, every slice PR targets that branch and is merged into it by the pilot once its principles review and fix round are done, no slice PR is ever marked ready, and when the last slice is in a QA agent takes the whole branch through a preview and hands the user one step-by-step procedure, whose clean return is Gate 2 and flips only the feature PR. Stacked drafts against the default branch were rejected because every fix in a lower slice would force a re-chain of every higher one on every review cycle, not only when the user had asked to stack; slice branches without slice PRs were rejected because the per-slice PR body and review record are what the closing report and a bisect read.

**Consequences**: the default branch receives one merge per feature, the user's one walkthrough is longer and comes later, and a slice merged into `feat/<slug>` by hand relies on GitHub recording its PR as merged, with a close-and-comment as the fallback.
