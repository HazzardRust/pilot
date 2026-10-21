---
status: proposed
date: 2026-10-14
tags: [deck, record, friction, pilot]
supersedes: []
superseded_by: []
paths: [deck/runs.mjs, agents/pilot.md, agents/pilot-co-pilot.md]
---
# Friction rows survive every session

We decided that the run record's `friction` array is appended to and never replaced, that it holds the pilot's own drains beside the crew's rows, and that the closing report's friction is derived from it.

## Context

The closing report's friction was a fresh list the pilot wrote at finish, so every row a previous session collected was lost at the hand-off, and the pilot's own context drains were never recorded at all.

## Decision

- **Friction appends in `nextRecord`** (L8): each `deck_status` that sends `friction` adds its rows; the record is mirrored to `run.json` and committed by `pilot handoff`.
- Agent rows are `{agent, what, evidence, size?}`; drain rows are `{kind: "drain", what, size}`. The four drains are a foreign item read, a hook notice acted on, an output read twice, and a large read done in the pilot.
- **The newest 40 rows are kept** (A6); an append past 40 drops the oldest and says so in the reply.
- **The report ranks by `size`** (A7): `report.friction` is the top 5 agent rows and the top 5 drains, derived; a `report.friction` sent by the caller is refused.
- The hand-off writes no friction summary; the record already holds it.

## Rejected

- *A fresh list at finish*: it drops every earlier session's rows.

**Consequences**: the "make agents cheaper here" section reads rows from every session of the run, ranked the same way each time.
