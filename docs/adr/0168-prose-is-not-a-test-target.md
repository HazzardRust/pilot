---
status: proposed
date: 2026-10-19
tags: [tests, methodology, skills, crew]
supersedes: []
superseded_by: []
paths: [skills/test-design/SKILL.md, skills/tdd-workflow/SKILL.md, skills/diagnosing-bugs/SKILL.md, agents/pilot-implementer.md, agents/pilot-lander.md, scripts/check-slices.mjs]
---
# Prose is not a test target; `test-design` sits beside `tdd-workflow`; a stuck red hands back hypotheses

> Numbered 0168 because 0167 is claimed by one-integration-line's S10, which also renumbers at its landing; if either lands out of order, the later one renumbers.

We decided that no test asserts a phrase in prose, that Pocock's `tdd` skill is renamed `test-design` and preloaded by the implementer beside `tdd-workflow`, and that `diagnosing-bugs` ends a stuck red with a ranked hypothesis list to the agent's addressee after two failed fixes. Run `crew-tests-behaviour`, `docs/design/crew-tests-behaviour/architecture.md`.

## Context

About 400 test blocks in 70 files passed only while an agent prompt, skill, rule, README, runbook, ADR or help text contained a phrase (#891, #892, #899, #900 among them). They went red on a reword that kept the meaning and stayed green on a change that broke it. The repository already carried Pocock's `tdd` and `diagnosing-bugs` skills, but no crew agent loaded either: the implementer preloaded only `tdd-workflow`, which put refactoring inside the loop where `tdd` put it outside, and named none of those anti-patterns.

## Decision

- **L5, L6** A test that requires a phrase in prose is cut. A rule worth keeping returns as a structural lint in code: a heading, step or field exists, or a command is absent, with `// lint: <rule>` beside it. A phrase pin is never rewritten as another phrase or moved into a script. Prompt changes are evidenced by `check-references`, `measure-prompt`, `check-provenance` and `build-vendor-ledger --check`.
- **L2** Two skills, each named for its job: `test-design` (what a test is, the seams, the anti-patterns, now including the prose pin and the hand-written fixture) and `tdd-workflow` (the runner, the RED gate, checkpoints). Refactoring is outside the loop in both. The upstream path stays in `test-design`'s provenance.
- **L3** The escalation lives in `diagnosing-bugs`: an agent without `deck_post` sends Phase 3's ranked list to its addressee and keeps testing; after two failed fixes it sends the list and makes no third. The implementer and the lander load the skill on a stuck red; QA keeps its on-demand load.
- **A1** Each slice file carries one `Misses:` line, refused by `check-slices` when absent.

## Rejected

- *Keeping or rewording the prose pins* (L6): they guard wording, not behaviour; the guard a prompt edit loses is accepted.
- *Folding the two TDD skills into one* (L2): a bigger diff against two ledgers for the same reach.
- *A standalone diagnoser agent* (L1): a spawn and a re-brief per stuck red.
- *The escalation rule in each prompt* (L3): three copies, and QA has no headroom.

## Consequences

- Rewording any agent, skill, rule or doc no longer turns the suite red; adding a forbidden command, or dropping a linted step, still does.
- A prompt edit that drops a rule nobody lints passes the suite; the language reviewer and the fundamentalist name prose pins and hand-written fixtures in new tests instead.
- The implementer reads the slice file's Interface and Tests as the agreed seams and posts no seam question.
