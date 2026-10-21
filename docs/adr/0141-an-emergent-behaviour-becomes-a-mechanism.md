---
status: proposed
date: 2026-10-13
tags: [principles, pilot]
supersedes: []
superseded_by: []
paths: [agents/pilot.md, skills/audit/areas/rederived.md]
---
# An emergent positive behaviour becomes a deterministic mechanism

We decided that when agents reach a good move on their own, the move is turned into a step, a record or a refusal that no agent has to re-derive, and that the auditor looks for such moves and reports them as a cost.

## Context

The user, on the Add thread (deck item itm_6f60cec0f386), after the pilot said that weighing an assumed decision "is close to what happens informally now":

> i want emergent positive behaviours such as this to be replaced by more deterministic mechanisms so that it can keep the behaviours without the overhead of having to come to that behaviour on it's own every time. it creates more consistency but also reduces token overhead - that is a principle i have discovered

## Decision

- A behaviour agents reach unprompted, and that no step, record or refusal pins, is a candidate for a mechanism.
- The mechanism is the cheapest one that cannot be skipped: a refusal the deck makes, else a step or record, else the pilot's prose, in that order of preference.
- The first instance is the verdict pass (ADR 0142). The auditor's "behaviour re-derived per run" rows find the next ones.

## Rejected

- *Leaving the behaviour to the model*: it is re-derived every run at token cost and is not consistent.

**Consequences**: each re-derived behaviour costs one mechanism to build and removes its per-run reasoning; the auditor keeps the list of candidates honest.
