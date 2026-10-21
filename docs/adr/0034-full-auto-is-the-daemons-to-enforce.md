---
status: accepted
date: 2026-09-26
tags: [deck]
supersedes: []
superseded_by: []
paths: [docs/design/independence/architecture.md, deck/store.mjs]
---
# Full auto is the daemon's to enforce

The user asked for a mode "for non-commercial, non-user-facing work" where the pilot decides its own open questions, specs, signoffs and walkthroughs rather than waiting on the deck (independence spec 5, 6). L5, A3 of `docs/design/independence/architecture.md` place the rule in the store, behind a toggle drawn only on a tab, rather than in the pilot's own prose.

- **One map, keyed like the deck's numbers.** `deck.auto` holds `{merge, at}` per `repoKey`, written by `deck/store.mjs`'s `setAuto`/`clearAuto`, read by `autoFor` and `listAutos` — the same shape `decksOf`/`listDeckNumbers` already use for a repository's own state.
- **`postItem` enforces it, not the pilot.** A `question`, `spec`, `signoff` or `walkthrough` posted for a repository in the map is stored already `resolution: 'auto'`. The rule becomes a check the store makes on every write, so a session that forgets the toggle still gets closed items rather than a wait nobody answers.
- **`deck_post` says so.** `callTool`'s `deck_post` branch, on an auto-resolved item, answers `full auto: decide it yourself and record it as assumed; merge to main is <allowed/not allowed>` instead of the usual "posted, the human answers it" — merge read fresh off the map, because it is the repository's state, not the one post's.
- **The confirm is the only place `merge` is ever set.** `POST /auto`'s `merge` field is read only when present; an unticked box never reaches the route at all (a browser never submits an unchecked checkbox), so a bare `on` can never mean "and merge" (A3).
- **Items already open stay the user's.** Turning auto on writes one map entry and touches no item. `refuseOverOpenQuestions` still gates a `spec` or `signoff` behind an open `question` from before the toggle, exactly as it did without full auto — the toggle changes what a *new* post becomes, not what an old one still is.

Rejected:
- The pilot polling a flag before every post: a session that forgot would still wait.
- Retroactively closing open items when auto is switched on: spec 6's own prohibition.
- Folding `merge` into the item itself: it is the repository's state and would drift the moment two items disagreed about it.

**Consequences**:
- `deck.json` gains one optional top-level map, `auto`, and stays `STORE_VERSION 1`.
- A session discovers full auto is on for it at its first `deck_post`, not before; nothing here changes what `GET /api/record` answers.
- The actual merge to `main` on a ticked box is the pilot's own doing through its existing integration path; this ADR is the gate that permits or refuses it, not the merge itself.
