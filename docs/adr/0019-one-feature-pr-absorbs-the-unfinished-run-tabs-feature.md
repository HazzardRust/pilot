---
status: accepted
date: 2026-09-18
tags: [workflow]
supersedes: []
superseded_by: []
paths: []
---
# The deck-usability feature is cut on top of the unfinished run-tabs feature and absorbs it

Line 9 of the deck-usability spec, a tab per run, was already two-thirds built on `feat/deck-run-tabs` — three slices integrated, one in an unreviewed draft PR, one planned — by a pilot that ran out of context mid-slice, and that branch was twenty-three commits behind `main` and owed a reconciliation of its `renderBookmarks` against `main`'s `renderStrips` in the same two files every UI slice of this feature touches. We decided the new integration branch is cut from run-tabs' tip, its two remaining slices become this feature's first two, its feature PR is closed with a pointer, and the merge of `main` happens inside this feature's walking skeleton, where the two renderers become one set of edge panels on every page; a dry-run merge at Gate 1 conflicted in exactly those files, which made it design work rather than a branch operation. Rejected: basing on `main` and waiting for run-tabs to land first, which stalls this run behind a feature nobody is driving and makes the reconciliation bigger with every slice landed here; and cherry-picking run-tabs' commits, which lands the same code twice while its PR stays open.

**Consequences**: one feature PR carries two features and one Gate 2 covers both, so the user's procedure at the end walks run-tabs' behaviours as well as this feature's; and any slice of this feature that starts before the walking skeleton lands is branched from a tip that does not yet contain `main`, and rebases when it does.
