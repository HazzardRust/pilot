---
status: accepted
date: 2026-10-10
tags: [deck, modules, refactor]
supersedes: []
superseded_by: []
paths: [deck/server.mjs, deck/server-wait.mjs, deck/store.mjs, deck/ui/render.mjs, deck/run.mjs, deck/items.mjs, deck/test/facades.test.mjs, docs/design/audit-f1-f7/architecture.md]
---
# Deck modules are flat siblings behind facades

We decided every deck source file over 800 lines is split by concern into flat, prefixed siblings beside it, and the old path stays as a facade that re-exports the names it had.

## Context

The audit (feature audit-f1-f7, spec 13) found five deck files over the 800-line bar an agent can hold: `deck/ui/render.mjs` (2267), `deck/store.mjs` (2144), `deck/server.mjs` (1729), `deck/items.mjs` and `deck/run.mjs` (5 lines over). The first proposal named subdirectories such as `deck/store/`. But `deck/` is flat, `UI_DIR` is resolved from `import.meta.url`, and `deck/ui/js/` is the browser's served allowlist, so a subdirectory would move those resolutions and nothing new may go under `deck/ui/js/`. The recommended default split only the first three files; the user chose "Split all five" (itm_949553df1d2f) and held it after pushback.

## Decision

**Flat siblings (L9).** The new modules sit beside the file they came from, with its name as a prefix: `deck/server-*.mjs`, `deck/store-*.mjs`, `deck/ui/render-*.mjs`, and the same for `run` and `items`. No subdirectory. `deck/README.md`'s module list stays a plain `ls`.

**Facades.** The old path keeps exactly the export names it had at the split's base, re-exported by name from the siblings; never `export *`. Every import specifier in the repository is unchanged. `deck/test/facades.test.mjs` pins each facade's names and each sibling's line count against the bar.

**Moves, not edits.** A split moves whole regions in order. It edits no function body, renames nothing and reorders nothing within a region; the only new lines are imports, export lists and the pins. A sibling the stdio client must not reach is named in `deck/test/daemon.test.mjs`'s leak guard.

**All five (L14).** The bar holds for every non-test deck source file, so `run.mjs` and `items.mjs` are split too, as the last two mechanical moves.

## Rejected

- *Subdirectories (`deck/store/`)*: they move `import.meta.url` resolutions and the served allowlist, and the module list stops being one `ls`.
- *Splitting three files only*: the recommended default; the user chose all five.
- *Rewriting importers to the new paths*: every caller would change in a move slice; the facade keeps them unchanged.
- *`export *` facades*: the facade's names would follow the siblings silently, and the pin could not say what the old path promises.
