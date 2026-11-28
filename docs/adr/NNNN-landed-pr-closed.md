---
status: proposed
date: 2026-11-28
tags: [git, landing, pr, pilot-branch, agents]
supersedes: [0200]
superseded_by: []
paths: [scripts/land.mjs, scripts/base.mjs, deck/runs.mjs, deck/gate2-evidence.mjs, agents/pilot.md, agents/pilot-lander.md, docs/OPERATING.md, docs/design/landed-pr-closed/architecture.md]
---
# One line: every run is cut from and lands on the pilot branch

We decided that every run is cut from the pilot branch and lands on it, and that main gets features only through the one release PR, which the user merges. A landing whose run still has an open PR on another base moves that PR onto the pilot branch before the pilot push, so the push merges it and no draft is left behind. This supersedes ADR 0200's cutting and landing-line rules, and amends ADR 0218 L2 and ADR 0139.

## Context

ADR 0200 cut a run on origin with a host from the default branch and gave it its own feature PR to main, while the pilot branch stayed the private line Gate 2 lands on. ADR 0218 L2 reaffirmed that cutting rule. In practice 21 of the 25 run records since 11-21 were cut from the pilot branch anyway, the release PR lived on, and the user kept merging it. A main-cut feature therefore reached main twice: portable-store's #149 stayed open as a draft after its landing at `e634fdd8`, while its commits rode release PR #167. Nothing marked it ready or closed it, because ADR 0139's ready press was dropped under ADR 0167 and ADR 0200 never put it back. Main was also 175 commits behind the pilot branch, so a main-cut run built on stale code.

## Decision

- **L1** Grilling depth is forks: only a question whose paths give materially different deliverables goes to the user. The user answered the one fork: "One line: release PR only".
- **L2** The landing retargets a run's open own-repo PR to the pilot branch before the pilot push, never after (`retargetOwn`, `scripts/land.mjs`). The push onto a base that already holds the head is the merge the host reads, and the landing ends on the release PR line, `main gets pilot: #<n>`, like every other landing. This amends ADR 0139: a PR merged by the push needs no ready press.
- **L3** No migration. Stored run records with base `main` stay as written and land through L2.
- **L4** The deck refuses a new run record write whose `base` is anything but the pilot branch, the legacy `pilot` or `feat/<slug>`, checking the incoming field only, so stored records still read. `pilot base` prints the pilot branch for an unchained run on origin with a host. This amends ADR 0218 L2, which kept ADR 0200's cutting rule.
- **L5** This ADR is allocated its number at landing, and supersedes ADR 0200's cutting and landing-line rules.

## Rejected

- Per-feature PRs to main (ADR 0200's shape): it forces runs onto a main 175 commits stale, needs a `ready` host verb the allowlist lacks, and retires the release PR the user still merges.
- Closing the left-behind PR with `gh pr close`: a new host verb the allowlist lacks, and the PR would read closed when its commits did land; retargeted, it reads merged, which is true.
- Retargeting after the push: whether the host accepts a base edit onto a branch already holding the head is unverified.

## Consequences

A feature no longer shows on main as its own PR; the release PR carries every landed feature. A gate1 shows its run's `Base:` line, so the user sees at Gate 1 what the run was cut from. `pilot restack`, `prBase`'s main and `feat/` arms, closing-report's feature line and lineage's main path stay for a follow-up ticket, since they serve no open PR today. Reverting the feature PR restores ADR 0200's behaviour; no record or PR is rewritten.
