---
status: proposed
date: 2026-10-19
tags: [git, landing, gate2, integrate, adr]
supersedes: [0140]
superseded_by: []
paths: [scripts/land.mjs, scripts/sync.mjs, scripts/integrate.mjs, scripts/merge-generated.mjs, scripts/adr-index.mjs, deck/gate2-base.mjs, deck/server-tools.mjs, deck/closing-report.mjs, deck/landing.mjs, bin/pilot.mjs, docs/design/one-integration-line/architecture.md]
---
# Pilot is the one integration line

We decided that `pilot` is the one integration line: after its cut a feature merges only onto `pilot`, once, at its landing; main gets pilot through one open PR `pilot → main` the user merges; the default branch enters `pilot` only through `pilot sync`, at a ticket's take or by hand; and a feature's ADR number is allocated at its landing.

## Context

A feature crossed four merge lines: main into pilot (`pilot sync`, also inside `pilot land`), pilot into feat (`pilot integrate`'s base), main into feat (`pilot integrate --default` before Gate 2, ADR 0140) and feat into pilot (`pilot land`). Each was a merge, a possible conflict, a suite run and a push race; the prose-concision landing failed on one. The user then merged each feature PR on main in merge-first order (8 open at once, #827 to #882), and parallel runs collided on ADR numbers (9 renumber commits). The user asked for one systematic change: "an actual change, not a rule".

## Decision

- **A gate2 posts at the feature's tip** (spec 1). The deck refuses it only when the tip conflicts with `pilot` (`cleanOnPilot`), never for lacking `origin/main`. `pilot integrate --default` is gone; `pilot integrate --trial` pushes the tip and tries it on `pilot`, preparing a conflicted landing for the lander (L5, A2).
- **`pilot land` runs no sync** (spec 2): one merge of the feature into `pilot`, one full suite, one push.
- **Main gets pilot** (spec 3, A1, the user's): the feature PR targets `pilot` and reads merged once the landing pushes; `land` keeps one open PR `pilot → main`, opening it when none is open, and prints `main gets pilot: #<n>`. The ready step, its retry and merge-first go.
- **The sync is main into pilot only** (spec 4): at a ticket's take or by hand, never inside a landing; a merge that would change no file pushes nothing (A3).
- **ADR numbers are allocated at landing** (spec 5, L4): a run names its ADR `NNNN-<slug>.md`, and the landing's merge renames it to one past the highest number, rewrites its citations in the files the feature changed and regenerates the index before the suite.
- This ADR takes a real number (L6): the deck lands this feature with the installed plugin's `land`, which does not allocate.

## Rejected

- *Feature PRs against main with merge-first* (A1): N merges in an order the user must keep, and a conflict `pilot` already resolved comes back on GitHub.
- *Keeping `--default` doing the trial* (A2): a name that says main.
- *A renumber commit on the feature before the merge* (L4): a second push and a race with the next landing.
- *Leaving the main-merge check in the deck* (L2): a rule, not a change.

## Consequences

- Supersedes ADR 0140: no gate2 holds the default branch, and the pin-measuring merge goes with `--default` (A8).
- Amends ADR 0083 (the feature PR targets `pilot`, one PR `pilot → main`), ADR 0139 (no ready press), ADR 0154 (L4's ready retry is gone) and ADR 0161 (L3's `--default` is `--trial`).
- The user's one step after a landing is "Merge #<n> with a merge commit" on the main PR, whenever they like.
- The open feature PRs against main close as merged once main gets pilot (A7); nothing is migrated.
- The changes to `land`, the deck's landing and allocation take effect after `claude plugin update`.

Recorded in `docs/design/one-integration-line/architecture.md` (§2 spec 1 to 7; §5 L2, L4, L5, L6; §6 A1 to A8).

Amended 2026-10-21 by ADR NNNN: "main gets pilot" becomes the release PR. The one open `pilot → main` PR is titled `Release: <slug>, <slug> +N more`, labelled `release`, its body one row per landed feature derived from git and rewritten on every landing; the line `main gets pilot: #<n>` stays. A feature merges onto `pilot` once, at its landing, as before, but a run may be cut from a concluding `feat/<N>` (a chain of depth 1) until N lands. Every other line here stands.
