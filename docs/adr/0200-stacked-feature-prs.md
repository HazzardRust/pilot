---
status: proposed
date: 2026-11-20
tags: [git, landing, chain, pr, agents]
supersedes: [0167]
superseded_by: []
paths: [scripts/stack.mjs, scripts/base.mjs, scripts/integrate.mjs, scripts/feature-pr.mjs, scripts/land.mjs, scripts/adr-allocate.mjs, scripts/pilot-branch.mjs, deck/lineage.mjs, deck/closing-report.mjs, deck/host.mjs, agents/pilot.md, agents/pilot-lander.md, docs/OPERATING.md, docs/design/audit-f14/architecture.md]
---
# Each feature is its own PR to main

We decided that a run on origin with a host is cut from the default branch and reaches it through its own feature PR, based on the default branch or on the lower feature's branch while that one is unmerged; `pilot` stays the private line Gate 2 lands on, and nothing comes off it into main.

## Context

Every landed feature reached main folded into one `pilot → main` release PR (ADR 0167, amended by ADR 0176). The user's SOP wants each feature to stay an entity of its own: someone viewing the repository sees feature A off its own branch and feature B off its own, and sees the pilot branch with nothing coming off it into main. The user's answer to the risk: "worst case is a regression and we go back".

## Decision

- **Only the user moves the default branch** (L2). No host verb merges and no tool pushes the default branch; the user merges each feature PR, bottom of the stack first.
- **A feature PR's base is computed, never stored** (L5, L6). It is `feat/<N>` until N's PR reads merged, then the default branch; `feature-pr.mjs` asks `prBase` on every write, and the record's `base` is never rewritten.
- **A chain has two ends** (L5). The PR's end is N's PR reading merged; integrate's end is N's tip in the default branch by ancestry. For a squash-merged N the chain ends when the leased restack rebases the branch; between the squash and that restack the PR shows N's commits.
- **`pilot restack` levels the stack** (spec 6, 10; A5, A6): it retargets each open feature PR to its computed base, merges the lower branch or the default branch forward, never by rebase (L4), and exits 3 naming the file on a hand conflict, pushing nothing for that branch. The pilot runs it after `pilot sync` at each take; the user's step is the same command by hand.
- **One forced push, leased** (L3): after a squash, restack rebases the upper branch onto the default branch and pushes it `--force-with-lease=refs/heads/feat/<s>:<tip fetched in the same run>`, only for a feature that has landed on `pilot`, its PR retargeted in the same restack, after its leased push. It never forces `pilot`, the default branch, or a run still building.
- **`pilot` is never rewritten** (L12). Under squash, `pilot sync` merges main forward, and a tree-identical merge pushes nothing.
- **The merge method is a setting that only words the human step** (spec 7, A8): `git config pilot.merge squash`, `merge` by default; restack reads ancestry, never the setting.
- **The landing commits the ADR number on the feature** (L7), after the suite is green; feat is pushed, then `pilot`.
- **The landing's line is the feature PR** (spec 4): `feature PR: #<n> into <base>`, in place of `main gets pilot:`.
- **Cutover, no setting** (L11, A3). A run whose record base is `pilot` lands as before, with the release PR, until none remains; no new run takes that path, and the way back is reverting this feature's PR. A run under `pilot.remote` other or `none` keeps `base pilot` (L9).

## Rejected

- *Auto-merging the stack bottom-up* (L2): hands the user's SOP step to the tools.
- *Rebasing on every restack* (L3, L4): a forced push with no squash to justify it.
- *One chain end at the landing* (L5): puts `pilot`'s commits into the PR.
- *Restack writing the record's base* (L6): races the deck's status writes.
- *A `pilot.prs=release` setting* (L11): a second shape to keep alive.
- *Rebuilding `pilot` from main plus the open stack* (L12): rewrites the private line.
- *The deck polling the host to restack* (A6): a new daemon loop.

## Consequences

- Supersedes ADR 0167: features no longer reach main through `pilot`; a feature still merges onto `pilot` once, at its landing, and the sync is still main into `pilot` only.
- Amends ADR 0176: the release PR lives on only for runs based on `pilot` (A3), and is removed by a follow-up once none is open; the chain of depth 1 stands, and its end moves from N's landing on `pilot` to N's merge into the default branch.
- The user's step after a landing is "Merge #A, then #B" on the feature PRs, with the method `pilot.merge` names, then `pilot restack` if no take has run it.

Recorded in `docs/design/audit-f14/architecture.md` (§2 spec 4 to 14; §5 L2 to L12; §6 A3, A5, A6, A8).
