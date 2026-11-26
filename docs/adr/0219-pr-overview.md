---
status: proposed
date: 2026-11-25
tags: [pr, prompts, skills, check-slices]
supersedes: []
superseded_by: []
paths: [scripts/pr-overview.mjs, scripts/feature-pr.mjs, scripts/release.mjs, scripts/check-slices.mjs, skills/pr-overview/SKILL.md, agents/pilot.md, agents/pilot-architect.md, agents/pilot-qa.md]
---
# Every PR opens with a plain overview the crew writes and the deck copies

We decided that every PR the pilot opens starts with a `## Overview` of four labelled lines a person outside the build can read, written by a crew agent into the feature's `architecture.md`, copied by the deck, and held to plain-language rules by `check-slices`. Run `pr-overview`, `docs/design/pr-overview/architecture.md`.

## Context

A feature PR's body opened with the artefact's spec table and the slice table: written for agents, so nobody could tell at a glance what the PR was. The deck runs no model, so any prose must come from a crew agent, and the deck already recomputes the body from the integration branch on every move.

## Decision

- **L2** The overview's text lives in `architecture.md` as `## Overview` above §1, so the user reads it at Gate 1 and `pilot pr` copies it; the deck writes no prose. Rejected: a model call in the deck (no model there, metered billing); a separate `overview.md` (one more file for the same reader).
- **L3** One pure module, `scripts/pr-overview.mjs`, owns the section parse, the rules and the built count; `featureBody`, `releaseNotes` and `checkSpec` call it. Rejected: the rules inline in each caller.
- **L4** No overview means today's body, byte for byte, so runs in flight are not broken. Rejected: refusing a gate1 without one.
- **L5** The built line, `Built so far: k of n parts.`, is the one line derived from the run record, counted from slice states starting `integrated`; never a slice id.
- **L6** The overview's own rules live in an adapted skill, `skills/pr-overview/SKILL.md` (from Matt Pocock's `pr` 1.3.2: brief prose, the glossary's words, the door); the architect, QA and the pilot each gain one line naming it, and `check-slices` rule `overview-plain` refuses an artefact whose overview is missing, over 150 words or 20 words a sentence on average, or carrying a slice, item, decision or ADR id or a crew role name. Rejected: the rules restated in three agent files, whose prompt pins sit at no headroom.

**Consequences**: the next architect's artefact fails its own check without an overview; QA rewrites it on `feat/<slug>` when a fix changes what a user sees, so the body never describes cut work. Whether agents write it well is read at Gate 1 and Gate 2, not tested.
