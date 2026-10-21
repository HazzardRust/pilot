---
status: accepted
date: 2026-10-10
tags: [deck, pilot-branch, design-branch]
supersedes: []
superseded_by: []
paths: [scripts/pilot-branch.mjs, scripts/integrate.mjs, deck/server.mjs, deck/lineage.mjs, docs/design/design-docs-only/architecture.md]
---
# A design branch is pilot plus docs commits only

We decided a design branch must have pilot's tip as an ancestor and carry no copy of a pilot commit, and that the deck refuses a gate1 for one that does not.

## Context

An architect re-anchored its design branch by replaying pilot's commits onto it. The branch then
carried copies of commits pilot already had, and `pilot integrate` failed to take the base with no
word of why. The user asked that a design branch's merge-base with `origin/pilot` be pilot's tip
(itm_196ba3065083, spec 2 and 3 of `docs/design/design-docs-only/architecture.md`).

## Decision

**One seam (L3).** `pilotLineage(cwd, ref)` in `scripts/pilot-branch.mjs` answers both the deck and
`pilot integrate`: `tip`, whether pilot's tip is an ancestor of `ref`, and `copies`, how many of
`ref`'s own commits carry the same patch as one of pilot's, read against `origin/pilot` as last
fetched. Null when there is no `origin/pilot`; it throws when `ref` does not resolve.

**Where the deck checks (L4).** In the daemon's `callTool('deck_post')`, beside `isWorktree` and
before `postItem`, for a `gate1` only, in the item's `repo`, synchronously with a 5 s bound on every
git call (`pilotLineage` runs in process, from `deck/lineage.mjs`, since `server.mjs` names no `child_process`, `deck/test/create.test.mjs`). Every writer, the MCP client and a hand post
to `/api/tool`, passes there; `postItem` stays git-free. No fetch on the post path (L5). Git gets the
branch name as an argument, never through a shell, and the repo's own `core.fsmonitor` is turned off for those calls, so a gate1 naming a hostile repository does not run its fsmonitor command.

**What refuses (L6).** Copies above 0, or pilot's tip not an ancestor; a branch merely behind pilot
is refused too. Both refusals name the branch and the fix, `git rebase origin/pilot`, which clears
both at once; the copy refusal names the count. A git repository with no `origin/pilot` is refused
naming the `pilot base`; a branch git cannot resolve, or answer on within 5 s, is refused naming the
branch. A `repo` that is not a git repository is not checked (A2).

## Rejected

- *The check written twice*, in the deck and in integrate: two places to get the patch comparison right.
- *In the stdio client*: a hand post would skip it.
- *In `postItem`*: the store's gate1 tests would need repositories.
- *`git fetch origin pilot` first*: the network on a post path.
- *The ancestor test alone*: a branch that merged pilot after a replay passes it yet carries copies.
- *Copies alone*: a stale branch would pass.

## Consequences

A gate1 post in a git repository costs a few git calls, and holds the
daemon for at most 5 s. A gate1 posted before `origin/pilot` was fetched is refused until it is.
