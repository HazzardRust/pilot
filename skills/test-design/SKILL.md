---
name: test-design
description: What makes a test worth keeping, where its seams go, and which anti-patterns to refuse. Use when deciding what to test and at which seam, writing or reviewing a test, or naming the anti-pattern a test trips. The red-green mechanics are tdd-workflow's.
---
<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/tdd/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: renamed tdd to test-design for its job (ADR 0180); the glossary is the artefact section 3; under a piloted slice the slice file's Interface and Tests are the agreed seams, off it the seams are agreed on the deck, naming per seam what its test catches and misses; anti-patterns gain prose pin, hand-written fixture, dependent tests and happy path only; siblings are named under pilot:
ledger: vendor/methodology.md
-->

# Test design

The red → green loop is `pilot:tdd-workflow`. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read the artefact's section 3 glossary so test names and interface vocabulary match the run's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Under a piloted slice the seams are already agreed: the slice file's Interface block and its Tests, signed at Gate 1. Write each test through the Interface symbol its line names, in the order Tests lists them, and ask no seam question.

Off a piloted slice, write down the seams under test and put them to the user as a deck `question` item: "What is the public interface, and which seams should we test?" For each seam, name what its test catches and what it misses, so the user agrees to the gap as well as the coverage.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "pilot:codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.
- **Prose pin**: the test passes only while a doc, prompt, skill, ADR, README or help text contains a phrase. The tell: rewording a sentence, with no behavior changed, turns it red. A structural lint in code (a heading, step or field exists; a command is absent) is not a prose pin.
- **Hand-written fixture**: a parser's input typed by hand in the format its own writer emits, so the test shares the writer's assumptions instead of checking them against the real producer. The tell: no line of the fixture was captured from the program that produces it in use.
- **Dependent tests**: a test that only passes when another ran first. The tell: it fails alone. Each test builds its own fixture.
- **Happy path only**: no empty, null, boundary or error-branch case. The tell: no test reaches the error branch, the one nobody runs by hand.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `pilot:code-review` skill), not the red → green implementation cycle.
