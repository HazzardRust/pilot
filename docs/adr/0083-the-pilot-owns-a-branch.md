---
# Supersedes ADR 0067 and ADR 0069; amends ADR 0068 and step 9 of `agents/pilot.md`.
status: amended
date: 2026-10-05
tags: [git, runs]
supersedes: [0067, 0068, 0069]
superseded_by: []
paths: [agents/pilot.md, docs/design/pilot-branch/architecture.md]
---
# The pilot owns a branch, cuts every run from it and lands every run on it

Every finished run ended as an open feature PR against the default branch, and the next run was cut from the top of that stack. By 2026-10-05 the stack was four deep (#318 to #321), two runs at once would each have taken the last open PR as their base, and the pilot could not be allowed to merge to the default branch to clear it. The user wanted one branch the pilot owns and treats as its default. So we decided every run is cut from the pilot branch, `pilot`, and lands on it at Gate 2, and promotion to the default branch stays the user's, one feature PR at a time, in order.

- **One pilot branch per repository (L12).** `pilot base` creates `pilot` from the default branch's tip when the remote has none, and prints `base pilot <sha>`. No stack, no exit 3.
- **The stack machinery is deleted (L5).** `deck/stack.mjs`, the `Stands on` line, the closed-base take-out and `MAX_STACK` are gone, which supersedes ADRs 0067 and 0069. ADR 0068 stands with its base renamed: `pilot integrate` takes `origin/pilot` on every call.
- **Taking a ticket syncs first (L20).** The pilot runs `pilot base`, then `pilot sync`, a `--no-ff` merge of the default branch into `pilot`; `sync` refuses a repository with no `pilot` branch, which `base` creates. `pilot land` runs sync as its first act. A conflict or a red run pushes nothing.
- **Gate 2 lands the feature (L14).** After the `gate2` is signed the pilot runs `pilot land` in the feature worktree: it takes the pilot tip, tests, and fast-forwards `origin/pilot` to the feature's tip, never forced, with no PR against `pilot`. Then `gh pr ready` on the feature PR. Land is the only merge the pilot makes. This amends step 9, which left the merge to the user and let a standing rule in `CLAUDE.md` hand it to the pilot: no standing rule does that now.
- **One feature PR per feature, promoted by the user in order (L15).** The feature PR is `feat/<slug>` against the default branch, a draft from Gate 1 with no `Stands on` line, ready at Gate 2. The closing report names the landing SHA and the human step "Merge <merge first>, then #<this>, oldest first, each with a merge commit, never squash", taken from `land`'s `merge first` line. Teardown keeps `feat/<slug>` while its PR is open.
- **The guard is in code (L4, L23).** Every push `base`, `integrate`, `land` and `sync` make passes `assertPushable`, which refuses the default branch by name.

Rejected:
- Keeping the stack as a fallback beside the pilot branch: two bases is the bug.
- A PR against `pilot` merged with `gh pr merge`: it needs a ready PR and GitHub-side checks that differ by repository.
- One combined `pilot`-to-default PR: there is no per-feature unit to review or revert.
- A per-feature branch cut from the default branch with the feature cherry-picked: any merge order works, but the two branches diverge and every sync conflicts.

**Consequences**:
- A later feature PR's diff shows every earlier unmerged feature too, and narrows as each one merges. Merging out of order brings the earlier feature in with it.
- The default branch's changes enter a run through sync without that run's reviewers reading them, and a conflicting sync stops a ticket at its start.
- When `merge first` reads `none` the human step is this PR alone, and when it reads `unknown (...)` land's own line says to list the open `feat/` PRs on `pilot` by hand. The prompt leaves both readings to the pilot, because its budget pin has no room for them.
- A hand-typed `git push origin main` in a session passes the guard; only the install's ask rules and the user's branch protection stand in its way.

Recorded in `docs/design/pilot-branch/architecture.md` (§2 spec 1 to 6; §5 L4, L5, L12, L14, L15, L20, L23).

Amended 2026-10-19 by ADR 0167: `pilot` is the one integration line. L15's feature PR targets `pilot`, not the default branch, and reads merged once the landing pushes; L14's `gh pr ready` and L15's merge-first order are gone, and main gets pilot through one open PR `pilot → main`, which `pilot land` keeps open and the user merges with a merge commit, reversing the rejected "one combined `pilot`-to-default PR" because the per-feature unit is now the landing on `pilot`. L20's sync stays at the take but no longer runs inside `pilot land`. Every other line here stands.
