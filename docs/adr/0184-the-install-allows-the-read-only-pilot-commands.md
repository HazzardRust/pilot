---
status: proposed
date: 2026-11-17
tags: [install, permissions, security]
supersedes: []
superseded_by: []
paths: [docs/design/blocked-steps/architecture.md]
---
# The install allows the read-only pilot commands and the source-tree scratch deck

We decided the install writes five more allow rules, `Bash(pilot wait)`, `Bash(pilot wait *)`, `Bash(pilot budget)`, `Bash(pilot tickets)` and `Bash(node bin/pilot.mjs deck --scratch *)`, amending ADR 0110, whose allow list held only the pilot's merge and process-gc commands.

## Context

An auto-mode session's classifier sometimes returns no verdict, and a command it never settles costs the user a blocked step or the lane a reissue turn. The pilot's read-only commands (`wait`, `budget`, `tickets`) change nothing, and QA starts its branch deck from the source tree as `node bin/pilot.mjs deck --scratch`, which `Bash(pilot deck --scratch *)` does not match.

## Decision

- The five rules join `PILOT_MERGE_ALLOW` in `scripts/install-permissions.mjs`, under ADR 0110's rules: one written only where absent, one the user's deny or ask covers named and left out, and the doctor's `pilot allow rules` row naming any missing (L4).
- `Bash(node bin/pilot.mjs ` joins the own-rule prefixes behind `isOwnAllow`, so `pilot uninstall` takes the node-spelling rule back with the rest.
- The source-tree scratch rule is written at the user's word (A3, 2026-11-17).
- No `git` rule (A6), and nothing wider than the five: no `Bash(pilot *)`, no `Bash(node *)`.

## Rejected

- `git status`, `git log` and `git diff` allow rules (A6): a user-level rule covers every repository on the machine, and those commands run a repository's configured fsmonitor, diff drivers and pager.
- No source-tree rule (A3): QA's branch deck stays one blocked step per run.
- `PILOT_PLUGIN_ROOT=<dir> pilot deck --scratch`: no allow rule matches it by its prefix.
- A second list and step for the reads (L4).

## Consequences

`pilot wait`, `pilot budget`, `pilot tickets` and the source-tree scratch deck never reach the classifier after `pilot install`. The node rule trusts the file: in any repository on the machine with a `bin/pilot.mjs`, that file runs unreviewed when called with `deck --scratch`. A user's `Bash(pilot *)` ask or deny does not cover that rule, since it is a `node` command; they deny it by its own text. Recorded in `docs/design/blocked-steps/architecture.md` §5 L4 and §6 A3, A6.
