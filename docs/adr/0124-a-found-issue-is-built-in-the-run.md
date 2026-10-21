---
status: accepted
date: 2026-10-11
tags: [agents, scope, slices, tickets]
supersedes: []
superseded_by: []
paths: [skills/grilling/SKILL.md, agents/pilot.md, agents/pilot-architect.md, agents/pilot-qa.md, agents/pilot-co-pilot.md, skills/ticket-making/SKILL.md, skills/audit/SKILL.md, agents/pilot-auditor.md, docs/design/bigger-jobs/architecture.md]
---
# A found issue is built in the run

We decided an issue an agent finds during a run is added to the live ticket as a spec line and slice and built, without asking, and 20 slices is an aim, not a bound.

## Context

Recommended defaults deferred found work to later tickets: on itm_113930f2ed32 the default was to sweep three flaky tests "later", and the user chose the run. The user: "pushing it into tech debt is a slower moving machine ... spot an issue, add it to the ticket and build it all without having to even ask the user". Audits posted ten one-slice tickets; each small ticket costs its own grilling, Gate 1, QA pass and Gate 2.

## Decision

- Grilling states the rule once; the pilot, architect, QA and co-pilot name it.
- An added slice carries its own added spec line, PR and reviewer, within the per-slice diff limit, and is named at Gate 2. Only one rail still makes a question: it moves no locked decision. The caps "at most 2 a run, never past 14 slices" go.
- Past 20 slices the architect cuts one run unless the user asks for a split; ticket-making aims at 20 and re-cuts one- or two-slice rows before proposing.
- An audit posts one ticket per surface (`pilot audit spec <report> <id>...`).

## Rejected

- *Higher caps on added slices*: a cap is the incentive the user named.
- *Asking before each added slice*: the user removes after the fact instead.
- *A surface field on audit rows*: the auditor groups by judgement; no schema for it.
