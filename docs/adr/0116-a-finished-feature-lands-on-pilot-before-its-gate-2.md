---
status: amended
date: 2026-10-10
tags: [gates, git, pilot-branch]
supersedes: []
superseded_by: []
paths: [bin/pilot.mjs, agents/pilot.md, agents/pilot-co-pilot.md]
---
# A finished feature lands on pilot before its Gate 2

This amends L14 of ADR 0083 and the refusal routing of ADR 0111. ADR 0083 had a feature reach `pilot` only once the user signed its Gate 2, by fast-forwarding `origin/pilot` to the feature's tip; ADR 0111 moved that landing to the deck's Sign off press and routed a `NOT landed` to the user as a human step. A ticket that goes red then holds its work off `pilot` until the user walks it, so the next ticket is cut without it and has to wait on it. So we decided a finished feature lands on `pilot` at the end of its fix round, before QA's pass, and `pilot` carries features whose Gate 2 is still open (red-lands-on-pilot spec 1, 3, 5).

- **Step 7 lands (L1, A1).** Where step 7 ran `pilot integrate` alone, the co-pilot runs `pilot land`, and QA gets the tip SHA of the fix round once it has. This deliberately amends ADR 0111's "`pilot land` stays a command for the user's own hand": the co-pilot runs it once as a plain command, which ADR 0110's install allows, and a `NOT landed` or a refused call is a blocked step, never retried or routed around. No MCP tool lands, and the deck's press is unchanged.
- **A merge, never a rewind (L2).** `pilot land` merges `feat/<slug>` into `pilot`: after `pilot sync`, the merge commit is made and the full suite run in a temporary worktree at `origin/pilot`, then pushed, never forced. A red run leaves `pilot` unmoved. Gate 2's fixes land at the press as one more merge of the same branch.
- **A conflict is resolved in `pilot`'s merge (L5).** On a conflict `land` keeps its worktree and names it in its line. A `NOT landed` at step 7 is a blocked step in the co-pilot's hand-back and QA gets `feat/<slug>`'s tip; nothing waits on it (L4). At the gate2 press step 9 sends the line to QA, who resolves in that worktree with `resolving-merge-conflicts` and commits, and the next press tests that merge and pushes it.
- **A feature never takes a later one (L6).** Once a feature has landed, `pilot integrate` takes no base into `feat/<slug>`, so a pivot's slices never pull later features into an earlier PR.
- **A rejection is a revert (L10).** A feature rejected at Gate 2 leaves `pilot` by a revert commit landed through the same press, a human step the closing report names. `pilot` is never rewound.

Rejected:
- Merging `pilot` into the feature and fast-forwarding `pilot` (the recommendation the user overrode on itm_49d87121223d): an earlier PR would then carry later, unsigned work that was never its own. Merge queues, Gerrit and Chromium, and trunk-based development keep the integration branch moving by merges and back out by revert, and a feature PR holds only its own work and what it was cut on.
- QA merging `pilot` into the feature to resolve a conflict: it brings later work into the feature.
- Holding QA until a refused landing goes through: a refusal would stall the lane that can act on it.
- Rewinding `pilot` to drop a rejected feature: `pilot` is never force-pushed.

Recorded in `docs/design/red-lands-on-pilot/architecture.md` (§2 spec 1, 3, 5; §5 L1, L2, L4, L5, L6, L10, L13; §6 A1).

Amended 2026-10-18 by ADR 0161: L5's resolver is the lander. A conflict at the gate2 press is no longer resolved by QA in the kept worktree; the lander resolves it there, with `resolving-merge-conflicts`, and the deck lands the result. A `NOT landed` at step 7 is still a blocked step in the co-pilot's hand-back. L1, L2, L4, L6 and L10 stand.
