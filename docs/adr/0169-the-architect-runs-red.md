---
status: proposed
date: 2026-10-21
tags: [pilot, architect, gate, verdicts, crew]
supersedes: []
superseded_by: []
paths: [agents/pilot.md, agents/pilot-architect.md, rules/orchestration.md, scripts/verdicts.mjs, bin/pilot.mjs, deck/lineage.mjs, deck/store-tickets.mjs, deck/store-items.mjs, deck/items.mjs]
---
# The architect runs red to the Gate 1 post

We decided that the handover from the pilot to the architect is a contract of two calls, a verdict record on the ticket with `deck_ticket verdicts` and one message to the architect holding the same `A<n> Verdict:` lines and nothing else, after which the architect runs the routine rest of red itself and posts the gate1.

## Context

After the architect finished, the pilot spent about 12 calls of its own context finishing red: recording answers, a rebase, fixing the Verdict-line format, creating `feat/<slug>`, its worktree and the draft PR, posting the gate1 twice, resolving threads (deck-spawn-root's red, 2026-10-19). Only the question queue, the pushback, the Verdict pass and the Sign off are the user's through the pilot; the rest is routine.

## Decision

- **L2** Two calls, a deck record then the message. The deck cannot see a `SendMessage`, so the verdicts are stored where the gate1 check reads them; `deck_ticket` is already the pilot's on the harness's stamp.
- **L3** The architect writes the lines with `pilot verdicts <artefact>`, the message on stdin, by the grammar the deck checks with; an exit 1 names the ids missing.
- **L4** A gate1 is the pilot's thread whoever posts it (`ownerOf`), so the press wakes the pilot, not the stopped architect.
- **L5** Re-post only after a refusal. A refused post stores nothing; a stored gate1 with a fault is the pilot's to handle on its thread, never a second gate1.
- **A1** Every gate1 whose §6 has an A‹n› must match the ticket's verdict record, pilot-posted included: a pilot posting a gate1 itself records first.
- **A2** The architect re-posts a refused gate1 at most 3 times, then sends the last refusal to `main` and stops.

The architect then rebases and pushes `design/<slug>`, creates and pushes `feat/<slug>` and its worktree, opens the draft feature PR against `pilot`, sends `deck_status` with every row `planned`, posts the gate1 and hands back. `rules/orchestration.md` names the exception: the architect posts its own questions and the gate1 on the deck, where the user is.

## Rejected

- *One message only* (L2): the deck could not check the gate1 against the pilot's verdicts.
- *Parsing a pilot `deck_reply`* (L2): free text, no grammar.
- *Hand-written Verdict lines* (L3): the format miss this replaces.
- *The architect owning the gate1* (L4): it stops at the post, so the press would wake no one.
- *A record for architect-posted gate1s only* (A1): two rules, and unrecorded verdicts pass.
- *Unbounded re-posts* (A2): a loop on a cause the architect cannot fix, such as an open pilot-owned question.

## Consequences

- The pilot's red after its last grilling answer is the record, the message and a wait: at most 3 calls and no git.
- The architect holds `deck_status`, pushes two branches and opens one draft PR; it never marks one ready, merges, resolves the gate1 or sends `finished`.
- A pilot-posted gate1 (trivial work, a re-cut) costs one `deck_ticket verdicts` call first.
