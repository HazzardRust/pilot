---
status: proposed
date: 2026-10-21
tags: [pilot, fundamentalist, review, decisions, crew]
supersedes: []
superseded_by: []
paths: [agents/pilot-fundamentalist.md, agents/pilot.md, agents/pilot-co-pilot.md]
---
# The fundamentalist attacks decisions first

We decided that the fundamentalist is an adversarial reviewer of the design's decisions first and a code reviewer second: a **decisions pass** runs before its subtraction pass, reads every L, A and S of the artefact against the built diff, and opens report item 1 (**The case against**) with a decisions table of one row per id.

## Context

The fundamentalist looked at the wrong things. Of its 15 logged findings 13 were code-level (helpers, duplicates, assertions) and the 2 decision-level ones were dropped. Its definition was diff-level, with one paragraph arguing against the design. The user keeps its code review but wants the big-picture decisions attacked adversarially, from where the feature now stands built: what could the system achieve with less. The practitioner basis is SEI's ATAM (each architectural decision enumerated and scored against its rationale) and Klein's pre-mortem (assume it failed, say why).

## Decision

- **L1** Item 1 keeps its name; the decisions table opens **The case against** and its three pinned phrases stay.
- **L2** `## The decisions pass` sits before `## The subtraction pass`, whose "point of the run" becomes the code pass's lead.
- **L3** Every row is argued from the built diff. A `needed` verdict carries evidence too: agreeing with the artefact is not evidence. Verdicts are exactly one of needed, drop, simplify.
- **L4** Step 7's brief passes the artefact's path beside every slice file's path.
- **L5** Each drop or simplify row is one `deck_status` `findings` line, id first; a needed row gets none.
- **L6** A kept decision finding that moves a decision (drops or simplifies an L or overturns an A) always reaches the user; the co-pilot's cost bar does not apply to it.
- **L7** No code changes: the deck, `verdicts.mjs`, the evidence runner and the auditor stay untouched.
- **A1** A decision question does not block the run; a drop answer before the Gate 2 sign-off is built as a fix round or an added slice.
- **A2** The agent enumerates the rows in prose; QA's replay counts them against the ids.
- **A3** The 65-line report bound stays; rows are one line each.

## Rejected

- *A new report item before item 1* (L1): it breaks the pinned case-against test.
- *Folding decisions into the subtraction pass* (L2): it keeps the diff framing.
- *Rows only for suspects* (L3): a decision passes unexamined.
- *Pasting §5 and §6 into the brief* (L4): it drifts from the artefact.
- *A new `decisions` field in the deck* (L5): a deck change for no consequence.
- *The co-pilot deciding a moved decision* (L6): that is how the recorded decision findings were dropped.
- *QA waiting on the answer* (A1): it idles the run at its end.
- *A `decisionIds()` script beside `assumedIds()`* (A2): about 30 lines for a count a pin already makes.
- *Raising the report bound* (A3): it loosens a pin three landed runs hold.

## Consequences

Short-path tickets keep skipping the fundamentalist (ADR 0168), so their decisions go unattacked. The report's row count grows with the artefact; a long artefact leaves less of the 65 lines for tools and findings.
