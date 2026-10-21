---
status: proposed
date: 2026-10-21
tags: [git, landing, release, chain, agents]
supersedes: [0100]
superseded_by: []
paths: [scripts/land.mjs, scripts/release.mjs, scripts/integrate.mjs, scripts/base.mjs, deck/tickets.mjs, agents/pilot.md, agents/pilot-implementer.md, docs/design/pilot-develop-line/architecture.md]
---
# Pilot is a develop line

We decided that `pilot` reads to a team as a develop line: the pilot merges to it at any time and it stays the canonical codebase, separate from production; `main` is released from it through one labelled release PR; a slice reaches its feature branch as one reviewed commit with no PR; and the run that follows a built feature waits on it, chained by one level, instead of being cut from a moving `pilot`.

## Context

To a teammate the repository read badly. The one `pilot → main` PR was titled "main gets pilot" with an empty body and no label, a landed feature PR once read closed with a "landed by hand" comment, and every feature left its draft slice PRs behind (809 merged PRs against `feat/*` branches beside about 60 feature PRs). Features built one after another still met a merge hunk at landing, because a built feature waits unlanded in concluding while the next is cut from `pilot`'s tip and `pilot` moves under it. The user asked to "treat the pilot branch as something the pilot can merge to at any time to retain its canonical codebase state, which is separate to production or main".

## Decision

- **The release PR is derived from git (L3).** `pilot land` keeps one open `pilot → main` PR titled `Release: <slug>, <slug> +N more` (at most 120 characters), its body one row per first-parent `Merge feat/<slug> into pilot` in `<main>..pilot`, labelled `release`, rewritten whole on every landing. Only the user merges it.
- **`main gets pilot: #<n>` stays (L4)**, so the closing report and the blocked-item parse in the deck do not move.
- **The chain is depth 1 by construction (L5).** Concluding holds one green ticket, and the next run reaches Gate 2 only after that ticket's press frees the lane. While feature N waits unlanded, `pilot base` prints `base feat/<N> <sha> (concluding <ticket>)`, the run is cut from it and merges it at every slice; `pilot land` refuses N+1 while N has not landed; N's landing retargets N+1's feature PR to `pilot` (A6). A dropped N is range-reverted on `feat/<N+1>` by a fix-round implementer, reviewed, then a fresh gate2 (A2).
- **The base is recorded on the run record (L6)** (`base`, written by the pilot's `deck_status`, mirrored to `run.json`), read by `integrate` and `land` from the worktree.
- **No `gh pr merge` and no ready press (L7).** The landing waits up to 30 s for GitHub to read the feature PR merged, then comments `landed on pilot at <sha>`; it never closes it (A1).
- **A slice is one commit, not a PR (A3, A8).** `pilot integrate` merges the slice branch `--no-ff` as `feat(<slug>): S<n> <title>` carrying a `Reviewed-by:` line per reviewer; slice branches still push, only the PR goes.
- **A chained take skips `pilot sync`** (A7) and `pilot base` reads the concluding feature from the deck (A5). Release rows carry no ticket id or closing report (A4).

## Rejected

- *Stacking on any open feature PR*: the 4-deep stack (#318 to #321) that ADR 0083 L5 deleted. This chain is one level and only on a green ticket.
- *Appending release rows from the deck* (L3): lost with the deck and not idempotent.
- *A `release:` line in place of `main gets pilot` (L4)*: two deck parsers and nine tests move for a word.
- *`git config` per branch, or inferring the base from ancestry* (L6): the first is unpushed and invisible to the deck, the second breaks on fix rounds of N.
- *`gh pr merge --merge`* (A1): a ready press, host checks, and an untested tree if `pilot` moved.
- *The lander reverting a dropped N* (A2): the lander never edits `feat/`.
- *Squashing a slice* (A3): breaks `deleteMerged`, worktree prune and the pipeline.
- *Commits straight on `feat/`* (A8): parallel lanes would collide.

## Consequences

- Reverses ADR 0083 L5's "two bases is the bug" for a depth-1 chain only; the rejected stack stays rejected.
- A teammate reads one MERGED feature PR, one open `release` PR and no slice PR per feature; the PR's Commits tab lists the implementer commits (A3).
- Main's changes wait one feature longer to enter `pilot` when a take is chained (A7).
- An N+1 run that cites N's ADR before N lands cites it by N's file name; N's landing allocates the number (ADR 0167 spec 5).
- Added slice S10: the shipped-rules ledger keeps every committed hash across the squashed public history.
- The changes to `land`, `integrate`, `base` and the agents' prompts take effect after `claude plugin update`.

Recorded in `docs/design/pilot-develop-line/architecture.md` (§2 spec 1 to 6; §5 L3 to L7; §6 A1 to A8).
