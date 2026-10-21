---
# Superseded by ADR 0083: every run is cut from the pilot branch, and no `Stands on` line is written or read.
status: superseded
date: 2026-10-04
tags: [git, runs]
supersedes: []
superseded_by: [0083]
paths: [docs/design/runs-build-on-each-other/architecture.md]
---
# A stack of runs is written once, in the PR body, and the stacked PR targets the default branch

Runs that follow each other were each cut from the default branch while the earlier ones were unmerged: on 2026-10-04, PRs #289, #290 and #297 were built that way, and when #290 merged, #297 conflicted in 3 files and #289 in 7, each after its Gate 2. A later run has to be cut from the earlier run's branch instead, and something has to say which run stands on which. So we decided a run that stands on another says so in one place, the line `Stands on #N.` in its feature PR's body, and its PR still targets the default branch.

- **The PR body is the only record (L2).** Code reads the line from GitHub; no `base` field is added to the run record, which would cost the pilot's prompt pin through `deck_status` and say the same thing twice.
- **One module finds the open runs (L3).** `deck/stack.mjs` crosses the deck's records (which runs belong to this directory) with `gh` (which of their PRs are open), and serves `pilot base`, `pilot integrate` and `pilot tickets --open`. `gh` reaches it as an injected function (L8).
- **The line is trusted with checks (L10).** #N must be a PR of the same repository (`isCrossRepository: false`) whose head is a `feat/` branch and whose author is the account `gh` is signed in as. PR numbers and branch names reach `git` and `gh` as argv, never in a shell string.
- **A run stacks on the user's own most recent feature PR, signed or not (L13).** The base is the top of the stack, the newest run's, draft included; a PR another account authored is never a candidate.
- **The stacked PR targets the default branch (L11).** Until #N merges its diff shows #N's changes too; once #N merges it shows only its own, with no retarget.

Rejected:
- A `base` field in the run record: only the deck would write it, but the pin has about 5 tokens of headroom and the PR would still need to say it for the reader.
- `gh pr list` alone to find open runs: it cannot tell one deck's runs from another's.
- Stacking only on PRs past Gate 2: runs follow each other while the user is away, so both would be cut from the default branch and conflict as before.
- Targeting #N's branch: this repository merges with merge commits and keeps branches, so after #N merges the PR still targets `feat/<n>` and pressing Merge lands it there, silently, unless someone retargets it first.

**Consequences**:
- Anyone who can edit a PR body can point a run at another `feat/` branch of the same repository; they could push to the run's branch anyway. A fork or a command can never be named.
- Merging a stacked PR before the one it stands on lands both in the default branch, visibly, rather than one into the other's branch.

Recorded in `docs/design/runs-build-on-each-other/architecture.md` (§2 spec 1, 2, 5; §5 L2, L3, L8, L10, L11, L13).
