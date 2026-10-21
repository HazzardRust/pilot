---
status: accepted
date: 2026-09-21
tags: [workflow]
supersedes: []
superseded_by: []
paths: []
---
# Locked decisions are numbered L‹n›, so that D‹n› names a deck

The user asked for a canonical address for a run and a slice inside it — "S2 in D4" — and every artefact this crew had written already numbered its locked decisions D1, D2, D3, so a deck's number would have meant two things in the very document where slices are most often named. We decided that from the deck-workspace run on, locked decisions are `L‹n›`, assumed decisions stay `A‹n›`, slices are `S‹n› <title>` in artefacts and in `deck_status`, and `D‹n›` names a deck and nothing else. Older artefacts keep their `D‹n›` decision labels; this record is how a reader tells the two conventions apart. Rejected: a word in front of the deck number ("deck D3"), which puts a redundant word wherever the number is read most; a different letter for decks, which the user did not want.

**Consequences**: a reader of an artefact dated before 2026-09-21 reads D‹n› as a decision and after it as a deck; the pilot skill and the tests that pin its wording require the `S‹n›` form for slices; nothing in the deck itself changes for this, the number is ADR 0023's.
