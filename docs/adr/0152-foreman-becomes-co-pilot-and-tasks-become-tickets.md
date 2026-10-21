---
status: proposed
date: 2026-10-16
tags: [vocabulary, deck, crew, history]
supersedes: []
superseded_by: []
paths: [scripts/vocabulary.mjs, deck/store-core.mjs, deck/runs.mjs, agents/pilot-co-pilot.md, docs/design/co-pilot-tickets/architecture.md]
---
# Foreman becomes co-pilot and tasks become tickets

We decided that the old name for the co-pilot and the deck's old word for a ticket both read "co-pilot" and "ticket" everywhere, in code, prose, identifiers, file names and the records on disk, in two runs (Live, then History) with one shared codemod and a guard.

## Status

Proposed. Recorded by the co-pilot-tickets feature (slice S6); the artefact is `docs/design/co-pilot-tickets/architecture.md`.

## Context

The user asked: "i want to make 2 refactors to the entire codebase including docs: 'foreman' -> 'co-pilot', 'tasks' -> 'tickets'; re-write the history as well."

The pilot's default of leaving ADRs and past runs as written was overridden: `overridden: records stop matching the PRs and closing reports that cite them word for word`.

## Decision

- **L1** Depth every: code, prose, identifiers, file names, history.
- **L2** "History" is the records on disk (ADR bodies and file names, past design artefacts, briefs, slice files, run records); past commits, PR titles and closing reports stay.
- **L3** Two runs in sequence on this deck: Live (S1 to S7), then History (S8 to S15).
- **L4** QA on this machine: scratch decks with a planted store, S5 rehearsed on a copy of the live store, the live store migrating only when the user restarts the deck.
- **L5** One shared codemod, `scripts/vocabulary.mjs`, plus a permanent vocabulary guard `npm test` runs over each run's scope; the rename half is deleted when History ends.
- **L6** The stored-spelling flip and the v3 `upgradeStore` step are one slice of their own (S5), after the identifier slices.
- **L7** At most 200 hand-written changed lines per slice; codemod output is uncapped when the PR names the exact command and a re-run reproduces it.
- **L8** The plain-English old word is renamed to "ticket" or reworded by hand, never exempted; the exception list is closed.
- **L9** The codemod renames identifiers, file names, tools, CLI words and prose by default and leaves stored spellings; `--stored` flips them (S5 only).
- **L10** Before the v3 write the daemon copies the store to `deck.v2-<YYYY-MM-DD>.json` beside it, once.
- **L11** The hooks' stored spellings live in one `STORED` object in `hooks/lib/deck.js`, pinned to `items.mjs` by `join.test.js`.
- **L12** No alias for the old tool, action, CLI or route names: each stops at the release.
- **L13** The migration step and the legacy run-record reader spell the old words; they are exceptions by path.
- **L14** History is owned by directory range (S9 to S14, by the old name), so a design run landing before History falls in exactly one range.

## Consequences

- An existing store migrates one-way on first read to the next store version, after a dated backup (L10); item fields, store keys and switch records take the new spelling, and every open ticket keeps its id, state and queue order. Item bodies and raw `author` strings stay as written.
- Run records in other repositories keep reading: the reader takes `ticket`, else the legacy key.
- Because there is no alias (L12), the old tool, action, CLI and route names stop working at the release that flips the stored spellings, which bumps the plugin version by a patch.
- This ADR's quotation and `docs/design/co-pilot-tickets/` keep the user's own words, so a case-insensitive `git grep` for the old name finds those and the closed exception list only.
- Claude Code's own `Task*` tools keep their names.
