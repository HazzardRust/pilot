---
status: proposed
date: 2026-11-16
tags: [qa, deck, gates, agents]
supersedes: []
superseded_by: []
paths: [agents/pilot-qa.md, agents/pilot.md, agents/pilot-co-pilot.md, docs/OPERATING.md, deck/store-items.mjs, deck/gate2-evidence.mjs, docs/design/walkthrough-surface/architecture.md]
---
# A walkthrough only for a surface

This amends ADR 0090: QA posts its walkthrough only when the ticket's signed plan has `surface: true`; on `surface: false` it posts the gate2 on its evidence, with its checks table in the body, and that gate2 is the user's one press.

## Context

ADR 0090 made the walkthrough a look for taste, and QA posted one on every full run, so a feature with nothing to look at still cost the user two presses: Sign off on a walkthrough that showed nothing, then Sign off on the gate2. Whether a feature has a surface is known at Gate 1, before anything is built (`docs/design/walkthrough-surface/architecture.md` §2 spec 1, 2, 7).

## Decision

- **Every gate1 names `surface: true` or `false` (L1)**, true when some slice's evidence is something only the user can look at; the signed plan stores it, `false` included. A plan without it is legacy and unchanged (L2).
- **QA walks only a surface.** On `surface: false` QA posts no walkthrough and puts the checks table (spec line | result | evidence) in the gate2 body; the table also stays in QA's PR comment, which the landing record reads (L6).
- **A surface gate2 without a walkthrough says why (L11)**: its body carries `surface planned, no walkthrough: <reason>`, or the deck refuses it.
- **The deck refuses only QA's walkthrough on `surface: false` (L3)**; the pilot's wizard stages are untouched.
- `agents/pilot-qa.md`, `agents/pilot.md` steps 2, 8 and 9, `agents/pilot-co-pilot.md`'s hand-back outcome and `docs/OPERATING.md` say the same.

## Rejected

- *A walkthrough on every full run* (ADR 0090 as it stood): a second press with nothing to judge.
- *Detecting a surface from the diff*: guesswork after the build; the plan states it before.
- *`surface` optional above two slices*: cheaper fixtures, but a forgotten flag goes uncaught.
- *Refusing a surface gate2 without a walkthrough outright* (A1): a QA that cannot leave the surface running would have no way to Gate 2; the stated reason keeps Not yet as the guard.

## Consequences

- A full run with `surface: false` ends with one gate2 and no walkthrough; the user judges it on the table.
- A planned surface can reach Gate 2 unseen on QA's stated reason; Not yet on the gate2 is the remaining guard.
- No test reads a prompt for this wording; the deck's refusals carry the rule, and `scripts/check-references.mjs` and the measure-prompt pins hold the prose.
