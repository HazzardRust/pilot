---
status: accepted
date: 2026-10-08
tags: [testing, crew]
supersedes: []
superseded_by: []
paths: [docs/design/deep-modules/architecture.md, scripts/check-slices.mjs, skills/vertical-slicing/SKILL.md, agents/pilot-architect.md, agents/pilot-implementer.md, agents/pilot-fundamentalist.md]
---
# Tests aim at the design's seams; a wording pin only where the wording is the product

Slice files named tests by behaviour alone, so an implementer could satisfy one by reaching into internals or by asserting a file's source text, and this repository grew pins on code it could have run and on prompts that merely named a command (`docs/design/deep-modules/architecture.md`, spec 1-4, L2, L7, L9, L12). So we decided every test aims at one of the design's seams: the architect records them in the artefact's Seams table after a deepening pass, each slice's Tests line names an Interface symbol and the result observed through it, the slice carries one `Rewrite check:` line, and the fundamentalist's one pass over the feature judges every test the diff adds or changes against them.

- **Seam-first test**: `` `<name>`: `<Interface symbol>` → <observable result> ``, the symbol in that slice's Interface block; `scripts/check-slices.mjs` checks the shape on the paths it is given.
- **Findings**: a test reaching past the interface, a test whose rewrite check would fail, and a prose pin standing in for a behaviour (a code file's source text, or a prompt merely naming a command or tool).
- **Wording pin**: an assertion on text whose wording is itself the product (a prompt's rule sentence, a sentence a hook injects, a token budget). It stays, and is not a finding: a prompt has no executable behaviour to stand in for its wording.

Rejected:
- Replacing a prompt's rule-sentence pins with live model runs: tokens on every run and no determinism (L12).
- A per-slice test review: the fundamentalist runs once, at the end (L7).
- Testing past the interface "for now" when a symbol is missing: that is a seam change through `main` (ADR 0038, L8).

**Consequences:**
- A test that needs a symbol the Interface block lacks returns the decision to planning instead of widening the test.
- Earlier features' slice files predate the shape and are not checked (L3).
- Prompt files keep their wording pins; only pins standing in for something executable migrate.
