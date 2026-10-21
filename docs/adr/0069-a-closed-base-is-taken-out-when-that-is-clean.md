---
# Superseded by ADR 0083: with no stack there is no base PR to close, and the take-out is deleted.
status: superseded
date: 2026-10-04
tags: [git, runs]
supersedes: []
superseded_by: [0083]
paths: [docs/design/runs-build-on-each-other/architecture.md]
---
# A base closed unmerged is taken out of the run automatically, but only when that is clean

A run that stands on PR #N (ADR 0067) carries #N's commits. When the user closes #N without merging, they have rejected that work, and the run above still holds it. The architect's default was to stop and ask every time. The user chose to have it taken out automatically (itm_1e5748e2b6f7); the pilot objected that a revert cannot always be made unattended, and the user settled it as "clean only". So we decided `pilot integrate` takes #N's changes out itself when that is clean, and stops and asks when it is not.

- **Clean means no conflict and a green full test run (L12).** The take-out is one revert commit of #N's own non-merge commits, those reachable from #N's head and not from the default branch. It is pushed only after the tests have judged it.
- **Anything else is a stop.** On a conflict or red tests the branch is reset to where the call found it, nothing is pushed, integrate exits 3 naming #N, and the pilot asks the user.
- **The revert commit is the record.** Its subject names #N; integrate reads it to know #N is already out and takes the default branch as the base from then on. Nothing is written to the PR body or the run record.

Rejected:
- Always stop and ask: the run waits on the user for a decision closing #N has already made.
- Always automatic: where the run has edited lines #N added, someone has to resolve the conflict, and unattended that is a guess, or a red branch carried on.
- Keeping #N's changes in the run: closing #N would no longer reject its work; it would reach the default branch through the run above.

**Consequences**:
- The stacked PR's body still reads `Stands on #N.` after the take-out; the integrate line and the Gate 2 body say #N was taken out.
- #N's merges of the default branch are not reverted, so what reached the run from the default branch through #N stays.

Recorded in `docs/design/runs-build-on-each-other/architecture.md` (§2 spec 4, 13; §5 L12).
