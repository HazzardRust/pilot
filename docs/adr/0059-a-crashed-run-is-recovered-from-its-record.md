---
status: accepted
date: 2026-10-01
tags: [runs, hooks]
supersedes: []
superseded_by: []
paths: [docs/design/thread-kinds/architecture.md]
---
# A crashed run is recovered from its record by the SessionStart lane, with `next` as the save state

A run that died with the host, without `pilot handoff`, left nothing to pick it up: the SessionStart lane returns before reading the record when no open hand-off is for the directory, and the record itself was written only by a `deck_status` with a slug, first sent at slice-table time, so steps 1-3 of a run had none (thread-kinds spec 22-24, F15). The user asked that a crash lose at most the last move. So we decided the record is the save state and the lane is the way back.

- **A run has a record from step 1 (spec 22).** The pilot's first `deck_status` lands before the architect is spawned, with `slug`, `feature` and a `next` naming the open items and the design branch.
- **`next` is the save state (spec 24).** `pilot.md` says every `deck_status` that moves a row carries the current `next`, so a crash loses at most the move since the last call.
- **Recovery is a third lane branch after the hand-off pick (L11).** With no open hand-off for the directory, `recordFor(cwd)` unfinished, and no live run in the directory but this session's (`GET /api/runs?live=1`), the lane hands the record to the fresh session as a *recovered* run: the hand-off's payload shape (record plus open threads) under a notice that says recovered, not handed off. It claims `recovered-<slug>-<updatedAt>`, so one saved state is delivered once and a later `deck_status` (a new save) is deliverable after the next crash. It never takes the chain branch; it is built from the record, not an item.
- **`chainNext` is unchanged (L12).** With a record from step 1, `pilot run` where a run crashed during grilling says "a run is unfinished" instead of chaining the next ticket, because `atStart` already refuses on an unfinished record; the recovered lane is how that run is picked up. The user ends an abandoned one by having the pilot finish it as abandoned (assumed A9).

Rejected:
- Re-delivering on every start: a `/clear` or a second terminal would be handed a live run.
- A claim on the slug alone: a second crash of one run would deliver nothing.
- A recovery-specific chain rule: `chainNext`'s existing refusal already does the work.
- Writing the record only at slice-table time, as before: a crash during grilling would lose everything.

**Consequences**:
- A days-old unfinished record still blocks the chain at `pilot run` until it is finished (A9); an age cut-off would unblock it but could drop a real run.
- A second terminal opened beside a live run is told nothing; a crashed host's replacement is.
- `item.repo` is matched exactly, so a run started in a subdirectory is recovered only from that directory.

Recorded in `docs/design/thread-kinds/architecture.md` (§5 L11, L12; §6 A9); deck thread itm_1f8e3533ae5f.
