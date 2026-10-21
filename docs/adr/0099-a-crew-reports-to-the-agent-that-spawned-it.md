---
# Builds on ADR 0088's co-pilot, whose crew still sent to `main`.
status: accepted
date: 2026-10-07
tags: [crew, threads]
supersedes: []
superseded_by: []
paths: [docs/design/co-pilot-reports/architecture.md, agents/pilot-co-pilot.md]
---
# A crew reports to the agent that spawned it

On the first yellow ticket a co-pilot built, its crew sent its messages to the main session: an ADR renumbering, a seam change, QA's tip request and QA's walkthrough-posted report. The pilot relayed four of them by hand and the co-pilot never saw QA's report. The user: "the messages should travel to the co-pilot, and it can send you messages if it needs." So we decided a crew agent sends to the agent that spawned it, and the co-pilot sends `main` only what is the user's or the architect's (`docs/design/co-pilot-reports/architecture.md`, L1 to L5).

- **The co-pilot's address travels in the hello's `from` (L1).** The co-pilot cannot read its own id: `Agent(...)` returns it to the caller only, and no environment variable carries it. A received message does carry its sender's. So right after each spawn the co-pilot sends the child one message, `co-pilot of <ticket>: send me what your definition sends main`, and the child sends to that message's `from`.
- **A child sends nothing to its co-pilot before the hello arrives, and never falls back to `main` (L2).** The hello lands at the child's next tool round. A child the main session spawned gets no hello and sends to `main` as before.
- **QA's addressee becomes `main` once its walkthrough-posted report has gone to the co-pilot (L3).** The co-pilot hands back then, and a send to a finished agent resumes it.
- **Reviewers are out of scope (L4).** They have no `SendMessage`; their verdict returns to the spawner as the ticket result.
- **The co-pilot sends `main` four things (L5):** a question for the user, a seam change that moves a spec line or a locked decision, a crew hand-off it cannot resolve, and its hand-back table. A seam change inside the rails is the co-pilot's, recorded in the owning slice file on `feat/<slug>`; one that breaks a later slice's files or tests is a hand-off it cannot resolve, because only `main` resumes the architect.

Rejected:
- `main` sending the co-pilot its own id after the spawn: it races the co-pilot's first spawn, makes the co-pilot wait on `main`, and writes an agent id into the pilot's prose, which ADR 0089 avoided.
- Falling back to `main` when no hello has arrived: that is the bug itself.
- QA always addressing the co-pilot: after the hand-back, every QA message would wake a co-pilot with nothing left to do.
- Editing `rules/orchestration.md`, which says questions go "to `main`": the install never overwrites an installed copy, so the edit would not reach this machine. Each crew definition says who its addressee is in its own words instead.

**Consequences:**
- No crew message is relayed by hand; the main session sees only what the co-pilot forwards.
- No agent id is written into any definition; the address exists only at run time.
- A crew definition that names `main` as its addressee is now a bug unless the main session spawned it.
