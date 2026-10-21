---
status: amended
date: 2026-10-13
tags: [landing, gates, github]
supersedes: []
superseded_by: []
paths: [scripts/land.mjs, deck/landing.mjs, agents/pilot.md, scripts/install-settings.mjs, docs/design/gate-no-stall/architecture.md]
---
# The landing is the only ready press

We decided that `pilot land`, run by the deck on a signed Gate 2, is the only place the feature PR is marked ready: it prints a `ready:` line on every landing (`ready: #n`, `ready: none (...)` or `pr ready failed: ...`), a failed ready becomes a blocking item from `deck/landing.mjs` on settle, and `agents/pilot.md` step 9 never tells the pilot to run `gh pr ready`.

## Context

`land.mjs` has readied the PR since clean-landing S9, but it printed nothing when no PR matched, and the pilot's instructions still had it retry `gh pr ready` on a `pr ready failed` line; that retry was the denied call of the 2026-10-12 incident.

## Decision

- `ready()` keeps its filter; a `readyLine` names what was readied or why not, every time (L6).
- A `pr ready failed` landing posts a blocked item on the ticket; the pilot carries on with what does not stand on it.
- The install allowlists `Bash(pilot landing *)` beside the other pilot commands, so the landing itself never meets the classifier.

## Rejected

- *The pilot retrying `gh pr ready` itself*: the incident.

Amended 2026-10-19 by ADR 0167: the feature PR targets `pilot` and reads merged once the landing pushes, so nothing marks it ready and `pilot land` prints no `ready:` line; its last line is `main gets pilot: #<n>`. The rejection stands: neither the pilot nor the crew runs `gh pr ready`.

Amended 2026-10-21 by ADR 0176: the landing still never closes the feature PR and waits up to 30 s for GitHub to read it merged before it comments `landed on pilot at <sha>`; the rejection of a ready press, and of `gh pr merge`, stands. Every other line here stands.
