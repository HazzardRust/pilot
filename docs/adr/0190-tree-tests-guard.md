---
status: proposed
date: 2026-11-18
tags: [gate, tests, selection]
supersedes: []
superseded_by: []
paths: [scripts/select-tests.mjs, scripts/test/tree-census.test.mjs, docs/design/tree-tests-guard/architecture.md]
---
# The narrow loop runs the vocabulary guard and the census with every selection

We decided that `TREE_TESTS` lists `scripts/test/vocabulary-guard.test.mjs` and the census test, so every
selection runs both. The census test lives in its own file, `scripts/test/tree-census.test.mjs`, moved out of
`select-tests.test.mjs`.

## Context

A diff touching only a `.md` file selected no test that walks the tree, so `npm run test:changed -- --since=HEAD`
skipped the vocabulary guard, which reads every tracked file through `scripts/vocabulary.mjs`. The census that keeps
`TREE_TESTS` whole sat in `select-tests.test.mjs`, which is not itself listed, so a new tree-reading test missing
from the list went red only when `select-tests.mjs` or that test file changed.

## Decision

- **L1**: `vocabulary-guard.test.mjs` is a `TREE_TESTS` entry. Its walk is in a non-test module, which the census
  cannot see, so it is added by hand and the comment above the list names that kind.
- **A1**: the census moves, body unchanged, to `tree-census.test.mjs`, which is a `TREE_TESTS` entry. Listing
  `select-tests.test.mjs` instead would run all of its fixture tests (12 s) in every selection.

## Consequences

- Every selection runs two more files, each under 3 s alone.
- A tree-reading test missing from the list goes red in the narrow loop.
- A walk inside a non-test module is still missed until someone lists it by hand.
