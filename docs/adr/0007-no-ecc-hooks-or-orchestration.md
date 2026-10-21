---
status: accepted
date: 2026-09-13
tags: [vendor, hooks]
supersedes: []
superseded_by: []
paths: []
---
# None of ECC's hooks or orchestration pipelines ship

ECC binds `*` matchers on PreToolUse, PostToolUse, Stop and SessionStart, including session telemetry whose network behaviour we did not trace, and its `orch-*`, `multi-*`, `plan-*` and loop runners are the orchestration this package replaces. We ship its single-purpose reviewers and skills as a toolbox and nothing that runs on every tool call or drives a workflow. Gating the hooks behind a flag was rejected: a hook we have not read should not be on a friend's machine at all.

**Amended 2026-09-21 (S10, ADR 0025):** this ADR's own condition was a hook we have not read, and `gateguard-fact-force.js` and `lib/shell-substitution.js` have now been read in full: no network call, no telemetry, no credential, matcher-scoped to `Edit|Write|MultiEdit` rather than `*`. That discharges the condition for these two files alone, so they are vendored verbatim as this plugin's own `PreToolUse` hook (`hooks/gateguard.js`), and the rest of this ADR — no ECC orchestration, no other ECC hook, gating behind a flag still rejected for anything unread — stands unchanged. Amended in place rather than superseded by a new ADR: the repository has no supersession convention, and inventing one for the smallest possible case would be the larger change (L11).
