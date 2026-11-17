---
status: proposed
date: 2026-11-17
tags: [methodology, slices, crew, rules, prompts]
supersedes: []
superseded_by: []
paths: [rules/vertical-execution.md, rules/orchestration.md, scripts/check-slices.mjs, scripts/integrate.mjs, skills/vertical-slicing/SKILL.md, skills/tdd-workflow/SKILL.md, agents/pilot-implementer.md, agents/pilot-architect.md, agents/pilot-co-pilot.md, agents/pilot-fundamentalist.md, CONTEXT.md]
---
# The crew builds from the spec, not test-first; absolutes stay only on gates, safety, destructive actions and secrets

We decided that a slice is built to its behaviours, each shown with the evidence its kind names (`test`, `run`, `look` or `read`), that a test is required only where the behaviour is deterministic logic, and that `pilot integrate` refuses a new-shape slice missing a behaviour's evidence. Run `spec-first`, `docs/design/spec-first/architecture.md`.

## Context

Test-first made the crew invent tests for things that are not logic: asked for a more concise README, an implementer wrote tests such as "no sentence over 1 line" and the prose came out badly. The phase gate in `rules/vertical-execution.md` asked every slice for "a test that failed before the change and passes after", and the slice file's `## Tests` listed red steps for every slice. The crew's prompts carried 221 never/always/must at a3b7d463; absolutes crowd out judgement.

## Decision

- **L1** The slice file's `## Tests` becomes `## Behaviours`; each line is `` <k>. `<name>` (<kind>): <evidence> ``, and a `test` line keeps `` `<symbol>` → <result> `` with the symbol in the Interface block. `Rewrite check:` is required only when a `test` line exists; `Misses:` stays on every slice.
- **L2** The architect marks the kind; the implementer may raise any behaviour to `test` and may swap one non-test kind for another, saying why in the row; lowering a `test` is a seam change to its addressee.
- **L3** `pilot integrate` refuses a new-shape slice unless each behaviour has one `Evidence: B<k> …` trailer, which the co-pilot (or pilot) copies from the report.
- **L4** The implementer drops `tdd-workflow` from `skills:` and loads it with the Skill tool when the slice has a `test` behaviour or the brief is a bug in logic.
- **L5** The old `## Tests` shape stays valid in `check-slices` and needs no `Evidence:` trailer, so a signed run's slices still pass.
- **L6** The fundamentalist's coverage and mutation checks stay as they are; its Rewrite-check finding applies to `test` behaviours.
- **L7** Only the plugin's `rules/` copies change; the session-start repair (ADR 0079) carries them to `~/.claude/rules/`.
- **L8** The sweep keeps every gate, safety, destructive and secret absolute, rewrites the rest as a reason plus the default, and cuts restatements; each slice owns one or two definitions.
- **L9** Grilling depth is `forks`: only a question whose paths give materially different deliverables goes to the deck.
- **L10** Headroom comes from the sweep's cuts, never from a raised pin; a pinned slice's bar is its own share at least 100 under its pin.
- **L11** The fundamentalist installs from the lockfile (`npm ci`) before it spawns the evidence runner, which still installs nothing; the co-pilot's base-ancestry check is prose over the base merge `pilot integrate` already does.

This amends ADR 0180's consequence on Tests: the implementer reads the slice file's Interface and Behaviours as the agreed seams, and only a `test` behaviour is a seam a test is written at.

## Rejected

- *A separate Evidence section beside Tests* (L1): two lists to keep in step.
- *The implementer marks the kind alone* (L2): Gate 1 would not see where tests go.
- *The co-pilot reads the report alone* (L3): no record on the commit, and a gate in prose.
- *Keeping the `tdd-workflow` preload and telling it to skip* (L4): about 1.1k tokens per slice for an unread skill.
- *Migrating never-stuck Run 2's slice files* (L5).
- *Dropping coverage and mutation* (L6): they are the check on the `test` lines.
- *Editing the user's home rules in a slice* (L7): outside the repository.
- *One sweep slice over all twelve definitions* (L8): one diff past 400 lines, conflicting with four runs.
- *Every stash on the deck* (L9).
- *Raising the pins* (L10): spec 6 says no larger.
- *A new `pilot` verb for the ancestry check* (L11): integrate already merges the base before every slice.

## Consequences

- A prose slice integrates with no test of its wording; a logic slice still shows red then green.
- The always-loaded rules stay at or under 3,500 tokens, and the rules ledger gains the two new hashes, so a session-start repair replaces the stale home copies.
