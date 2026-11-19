---
status: proposed
date: 2026-11-19
tags: [handoff, cache, plain-session, install]
supersedes: [0170]
superseded_by: []
paths: [docs/design/handoff-cache/architecture.md, docs/design/handoff-cache/ledger.md, scripts/audit-session-start.mjs, scripts/reach.mjs]
---
# A hand-off is measured before it is changed, and a plain session reads nothing by default

We decided that every change to the hand-off is built only after a probe's number clears its bar, that the lines
whose numbers fell under their bars close in `docs/design/handoff-cache/ledger.md` with the number, and that an
install with no `reach.json` reads `nothing`. This supersedes ADR 0170's absent-reach lines (:31, :45), which say an
absent reach reads everything.

## Context

The user asked whether a fresh session after a hand-off reuses the prompt cache, and for plain `claude` to carry
nothing of pilot. Eleven slices answered it; the ledger holds each measured line's row and number.

## Decision

- **L1** Measure, then build: a build slice reads its probe's number against its bar and, under it, closes with no
  code change and a ledger row.
- **L2** One instrument: `scripts/audit-session-start.mjs --first-turn`, over the transcripts' own usage counters.
- **L3** Probes ship nothing: they live under `docs/design/handoff-cache/probes/` and run with `--plugin-dir` in a
  scratch headless session.
- **L4** The hand-off frame opens with `PICKUP_MARK`, the first bytes a reorder keeps.
- **L5** Section trims touch the main pilot session only.
- **L6** `pilot update` wraps the `claude plugin` CLI; no downloader of its own.
- **L7** A restart replaces `/clear` only when first-turn uncached input plus cache write drops 1,000 tokens or more
  and the pickup prompt runs 3 of 3.
- **L8** A probe may copy the login for its run only, into a per-run temp config dir deleted when the run ends, never
  committed, logged, printed or posted. overridden: real token readable in temp for a run's length; auto mode may
  refuse the copy again.

Assumed decisions and their verdicts:

- **A1** An absent `reach.json` reads `nothing` for every install. Verdict: stands, the user chose "Every install"
  on itm_26a410398bc2.
- **A2** A lost crew message is held via the deck. Verdict: stands, conditional on a loss; the probe found none in 15
  runs, so nothing was built on it.
- **A3** Line 1 measures transcripts already on disk. Verdict: stands; QA's scratch hand-off confirms live.
- **A4** Line 3 is built only for a miss of 1,000 tokens or more. Verdict: stands as a rule for the ledger; S3's bar
  read the whole 15,871-token miss while the frame it reorders gains about 190 tokens (752 shared bytes), under the
  bar, so line 3 reads ruled out and S3's code was reverted at step 7.
- **A5** Probes run headless on `--model sonnet`, about 30 scratch sessions. Verdict: stands, the user chose scratch
  sessions on itm_5556a16a5dec.

## Consequences

ADR 0170 stands for the reach levels and `pilot run`; its two lines that an absent reach reads everything, and that
an upgraded machine keeps everything until `pilot reach` runs, no longer hold: such a machine reads `nothing`, and
a user who relied on pilot in plain sessions runs `pilot reach everything`. Lines 3, 4, 5 and 7a closed with their
numbers and no code; the next such question starts from `ledger.md`.
