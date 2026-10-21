---
status: accepted
date: 2026-10-10
tags: [install, permissions, security]
supersedes: []
superseded_by: []
paths: [docs/design/install-allow-land/architecture.md]
---
# The install allows the pilot's own merge commands

We decided the install writes three allow rules, `Bash(pilot sync *)`, `Bash(pilot integrate *)` and `Bash(pilot land *)`, beside the pilot-branch feature's L22 ask rules, amending L22's "adds no allow or deny rule".

## Context

On 2026-10-08, after the user signed Gate 2 (itm_44285f624faa), Claude Code's auto-mode classifier refused the pilot's `pilot land` as "Merge Without Review". The classifier reads the command text and cannot see the signed gate, so the landing went back to the user (itm_38b3049df6ba). L22 (`docs/design/pilot-branch/architecture.md`) had the install write ask rules only, so nothing settled the pilot's own merge commands.

## Decision

- `scripts/install-settings.mjs` gains `pilotMergeStep`, a step beside the ask step in the one read, one write and one backup. The command line always runs it; the library runs it only with `pilotMerge: true` (L5, A1).
- Each rule is `Bash(<cmd> *)` with a space, which matches the bare command and not `pilot landfoo` (L2). `sync` is the third rule at the user's word (L10, itm_52e743e90913).
- A rule the user's `deny` or `ask` covers is named and not added, tested with the ask step's `denyCovers` unchanged: either beats an allow, so the rule would read as a grant that never takes effect (L3). An allow rule counts as present only on an exact match (L6).
- The push stays guarded in code: `assertPushable` refuses the default branch for `land` and `integrate` whatever a rule says (L7, L23). The commands take no `--test`, so an allowed command line carries no shell text of its own (L11).

## Rejected

- Ask rules for the three commands: ask still prompts in auto mode, and a background lane has nobody at the prompt.
- `Bash(pilot land*)`, which also matches `pilot landfoo`.
- A flag or an install question to opt out (A1): step 9 of the pilot needs the rules on every install.

## Consequences

An auto-mode session runs `pilot sync`, `pilot integrate` and `pilot land` without a classifier refusal. The rules trust the repository's test command: each of the three runs `npm test` or `git config pilot.test`, which the agent can set only by a Bash `git config` the classifier sees (`.git/config` is a protected path), and no classifier then sees what that runs. The rules close the one-call injection of `--test` (L11), not every route from an edited worktree to running code. They are safe only once `--test` is gone from all three commands (S2), so the feature ships with both slices or not at all. Recorded in `docs/design/install-allow-land/architecture.md` §5 (L2 to L7, L10, L11) and §6 (A1).
