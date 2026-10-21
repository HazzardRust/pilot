---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing the architecture artefact's glossary, or recording or editing an ADR.
---
<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/domain-modeling/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the glossary is written into the run's architecture artefact, section 3, instead of a CONTEXT.md tree
ledger: vendor/methodology.md
-->

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* the glossary for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## Where the model is written

A run's design lives in one architecture artefact, `docs/design/<feature>/architecture.md`, and its glossary is that artefact's **section 3, "Ubiquitous language"**. There is no context map and no per-module glossary: a run is one context by construction, and a second file would drift from the artefact the user approved at Gate 1.

Decisions that outlive the run go to `docs/adr/NNNN-<slug>.md` at the repository root, numbered in sequence. A locked decision in the artefact's section 4 and an ADR are not alternatives: the artefact records that the decision was taken for *this* run, the ADR records it for whoever reads the repository a year later.

Write both lazily: a section 3 entry the moment the first term is resolved, an ADR when a decision first qualifies under the three tests below.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the language already in section 3, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update the glossary inline

When a term is resolved, edit the artefact's section 3 right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

Section 3 should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions: the artefact has sections 4 and 5 for decisions and section 7 for slices. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
