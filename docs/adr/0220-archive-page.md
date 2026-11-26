---
status: proposed
date: 2026-11-25
tags: [deck-ui, archive, store, rune]
supersedes: []
superseded_by: []
paths: [deck/archive.mjs, deck/archive-kinds/, deck/archive-detail.mjs, deck/view/archive.mjs, deck/test/archive-coverage.test.mjs, scripts/archive-timing.mjs, docs/design/archive-page/architecture.md]
---
# The Archive page reads every local store, read-only, one kind module per store

We decided that the Rune deck gets a separate Archive screen, `GET /api/view?screen=archive`, drawing every record the deck keeps on this machine as named fields, grouped by day, from one read-only seam; each store is one module under `deck/archive-kinds/`, and a coverage test fails on a thread kind or a store file that has neither a view nor a never-shown entry.

## Context

The deck stores far more than it shows: closed tickets and every item older than 30 days (month files, ADR 0157 A9), run records, friction rows, the classifier log, usage and memory samples, audit reports, the switch files, the deck and wrapper logs and the hand-off trace. The user asked for "an entire separate ui page for me to view logging ... organised, sortable, searchable, and then separated by date", with every locally stored state human-readable on it. On the real store the page serves about 3.9 MB in about 780 ms (three timings, 785, 778 and 763 ms, from a copy).

## Decision

- **One read-only seam** (L3): `archiveRows` reads the files with `readDeckFile`, `archivedItems` and `readFileSync`, never `readDeck` or a store writer, because `readDeck` upgrades the store and recovers from `.bak`, and both are writes.
- **One module per store** (L4): kinds are found by reading `deck/archive-kinds/`, the way `deck/ui/js/` is served, so a kind slice adds one file and touches no shared one.
- **Credentials are withheld once, at the seam** (L5): every string of every row passes `findCredential`, and `deck.secret`, `deck-open.html` and `logs/*.log` are refused by name before anything is read (`NEVER_SHOWN`, L9).
- **The server computes every row** (L6, L11): the `archive` and `archiveDetail` regions carry display strings and day sections; Rune draws, sorts, filters and searches the rows it holds, with no request per keystroke. The regions are `{}` off their screen, so no other screen reads the archive.
- **Detail opens on the archive screen** (A3), `screen=archive&id=<id>`, because `screen=thread` clears a notice and would break the page's read-only promise.
- **Every store has a view** (L9): coverage is a test, `deck/test/archive-coverage.test.mjs`. It checks each thread kind has one claiming view, and each store file literal found in the deck's and hooks' source matches a kind's `files` or `NEVER_SHOWN`; a literal that is not a store file, or whose content another view carries, is named in the test with its reason, never by a pattern.
- **No pagination** (A5): every row is in the view; day sections fold with Today open, so a frame draws only open sections. `scripts/archive-timing.mjs <copy of the store>` times the view three times and exits 1 over 2000 ms; it refuses the live store (ADR 0194).
- **Text logs show their newest 2,000 lines each** (A6), items show once settled (A7), and `handoff-trace.jsonl` is a kind (A8, overturned when its Gate 2 was signed).

## Rejected

- *Building in the HTML deck now* (L8): the user chose to wait for Rune to land; the data layer is the same either way.
- *`listItems()` for the read* (L3): it reaches `readDeck`.
- *One `switch` in `archive.mjs`* (L4): it would put six slices in a row on one file.
- *Filtering credentials in each adapter* (L5): one forgotten field would leak.
- *Server-side paging, sort or search per keystroke* (A5, L6): it splits search across requests.
- *Reusing `history` and its `Card`* (L11): no fields, and its press opens `screen=thread`.

## Consequences

- Adding a store file name to a writer fails the coverage test until a kind lists it or `NEVER_SHOWN` names it; a store file written under a computed name is the miss, and the principles review reads the writers for it.
- The view is a fetch of several MB, refetched on each live change while the screen is open; the 2 s bar and the Rune frame bar guard that cost.
- The coverage test's two named lists are a standing cost: a new non-store `.json` literal in `deck/` or `hooks/` is added to the first with its reason.
