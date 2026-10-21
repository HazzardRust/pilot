---
status: accepted
date: 2026-09-13
tags: [hooks]
supersedes: []
superseded_by: []
paths: []
---
# The context guard recommends a handoff and never blocks

Agents degrade as their context fills, and a degraded agent is the one least likely to notice. A shared PostToolUse module measures each agent's context (a subagent from the tail of its own transcript, the pilot from the statusline snapshot) against its model's window: at its advisory threshold it advises finishing the step in hand, at its hard threshold it tells the agent to commit work in progress, write a handoff and stop, and it posts a `handoff` item to the deck itself so the pilot learns of it whether or not the agent complies. It never denies a tool call or refuses a stop, because a hook that blocks is the kind that traps a session when it misfires, and the deck item already covers the non-compliant case.

**Consequences**: thresholds are fractions of a per-model window table that must be kept current; a model missing from the table gets no guard, and a test fails when an agent declares a model the table lacks.
