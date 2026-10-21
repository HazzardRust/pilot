---
status: accepted
date: 2026-09-27
tags: [workflow, crew]
supersedes: [0036]
superseded_by: []
paths: []
---
# The housekeeping audit runs on demand, offered on first use and every tenth run, never per run

ADR 0036 said there is no separate audit pass: friction is collected from the crew's reports during a run and ranked in the closing report, because a standing pass would be paid for on every run whether or not the user wants it. That still holds inside a run. What it left out is the friction nobody meets until they measure it — how long a clean clone takes to reach a green suite, whether the suite is flaky run to run, how many tokens a repository's rules load before any work starts — and the user asked for a pass that measures those rather than guessing. We decided the housekeeping audit is one on-demand pass, `/pilot:audit` or "audit this repo for agents", run by `pilot-auditor` on Opus in a detached scratch worktree it removes, handing back one ranked `audit` item whose picked rows become `ticket` items and nothing else. The pilot offers it, as a `question` beside the grilling-depth question at step 1, on a repository's first piloted run and again once ten runs have been counted since the last offer or report (`OFFER_EVERY_RUNS`, in the user's words "maybe every 10 runs", about once a week under heavy use). It is only ever an offer: either answer re-arms the count, a saved report resets it, and under full auto nothing is posted or recorded, since either default would be wrong — yes spends 100–150k tokens unasked, no records a refusal the user never gave. The count lives in the audit's own record in the deck store, keyed by repository, and adds a run key once, so a step 1 run twice counts once. Counting features from the run records was rejected because it counts features, not runs; a standing per-run audit was rejected for 0036's reason; starting an audit unasked on the tenth run was rejected because the user's rule is that work is never started without their words.

**Consequences**: 0036 is amended, not replaced: the in-run friction section stays, and the audit is the separate pass it ruled out, made affordable by being occasional and asked for. The crew grows to seven, the pilot's step 1 pays about a hundred tokens for the offer, and existing repositories get the offer once after release because they have no audit record yet.
