---
status: proposed
date: 2026-11-16
tags: [deck, github, agents, host]
supersedes: []
superseded_by: []
paths: [scripts/feature-pr.mjs, deck/pr-writes.mjs, deck/host.mjs, docs/design/deck-writes-github/architecture.md]
---
# The deck writes to GitHub, the crew never does

This amends ADR 0154. We decided that the feature PR and its QA comment are written by the deck, from the run record, by one fixed spawn (`pilot pr --ticket <id>`), and that every `gh` process the deck and its scripts start goes through one module, `deck/host.mjs`; a crew agent pushes its own branch and opens its own draft slice PR, and writes nothing else to GitHub.

## Context

Crew agents kept hitting denied commands: QA's `gh pr comment` and `gh api -X PATCH`, the pilot's `gh pr edit --base pilot` for a dropped stacked base, a co-pilot's `pilot land`. Each denial stalled the run until the user was back, and another allow rule would only move the next denial. The deck already runs `pilot land` on the gate2 press, so a deck write is a pattern the daemon has (ADR 0154).

## Decision

- **The daemon still runs no `gh` (L1)**: it spawns `node <PILOT_BIN> pr --ticket <id>`, the second fixed verb after `pilot land`.
- **One verb does every feature-PR write (L2)**, reading the record over `/api/record` and the artefact from `origin/feat/<slug>`; the daemon passes its own port and store dir, so a scratch deck's verb reads the scratch record.
- **Writes are idempotent (L3)**: the PR is found by head, its body and base compared before an edit, the comment found by a hidden marker; a missing `feat/<slug>` on origin prints one line and exits 0.
- **Triggers coalesce per ticket (L4)**: one spawn in flight, at most one rerun queued. `PILOT_DECK_NO_LAND` also stops deck writes (L5), so no daemon test reaches GitHub.
- **QA's comment rides on its own posts (L6)**: a `comment` field on the walkthrough and on every gate2.
- **The base is the record's `base` (L7')**, `pilot` or `feat/<N>`; the deck retargets when GitHub's differs.
- **QA runs against real throwaway PRs on a scratch deck (L9)**, the stated exception to ADR 0173.
- **A1 Only feature-PR writes move**: slice PRs stay the implementer's. **A2 The PR body is the deck's alone**, QA's corrections and the non-additive migrations section move into the QA comment. **A3 "One plain command"** binds commands that push or write GitHub. **A4 The deck retargets a dropped base** from `deck_status base: pilot`. **A5 QA's comment on the walkthrough and on every gate2.** **A6 `pilot integrate --default` stays refused**, a lint only.
- **Every `gh` call goes through `deck/host.mjs`**: one process start and one allowlist (`assertHostVerb`); a call outside it is refused before any process starts.

## Rejected

- *`gh` in the daemon* (L1): a second process discipline, untested there.
- *A temp record file* (L2): cleanup, and a second source of the record.
- *Storing the PR number or comment id in the record* (L3): state that drifts from GitHub.
- *One spawn per call* (L4); *a second switch for the tests* (L5).
- *Giving QA `deck_status`* (L6): it could move rows.
- *Keeping the base at `pilot`* (L7'): a stacked PR's base would stay a crew write.
- *The user's own deck for QA* (L9): fixture writes among real tickets.
- *The deck opening slice PRs too* (A1); *a deck-owned marked section inside a body others edit* (A2); *an allow rule `pilot --dir * integrate *`* (A3); *the pilot keeping the retarget as the one exception* (A4); *the comment at gate2 only* (A5); *dropping the `--default` lint* (A6).

## Consequences

- A denied GitHub write no longer stalls a run: the crew names none, and `scripts/check-references.mjs` refuses one in crew prose.
- A failed deck write puts one line on the ticket's thread, `feature PR not updated: <line>`, once, and the next trigger retries; nothing blocks on the user.
- A retarget waits on the next deck write (A4).
- This amends ADR 0154: the daemon spawns a second fixed verb, `pilot pr`; ADR 0154's landing stays as it was.
- `deck/host.mjs` is an argv allowlist for `gh`, not a host abstraction: a second host (GitLab, Gitea, plain git) is a later ticket.
