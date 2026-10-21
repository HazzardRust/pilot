---
status: amended
date: 2026-09-21
tags: [deck, crew]
supersedes: []
superseded_by: [0027]
paths: []
---
# The agent roster is observed, not declared, and lives in the daemon's memory

The user wanted to see which agents are live for a deck, and nothing in the deck knew a subagent existed: no `SubagentStart`/`SubagentStop` hook is registered and a run row carries a pid and a path and no agent. The one thing that already fires on every subagent tool call is the context guard on `PostToolUse`, holding `agent_id`, `agent_type`, `session_id` and `cwd`. We decided that the roster is fed by a throttled heartbeat from that hook over `POST /api/agents`, held in an in-memory map in the daemon keyed on working directory, with *live* meaning a tool call within a window (90 s, assumed), and announced to the page only when membership changes. Rejected: a `SubagentStop` hook (an agent that is killed never fires it, so ghosts accumulate and a staleness sweep is needed anyway — the sweep alone is the cheaper half); a `deck_agents` MCP tool (puts the roster in the agents' own hands, and its value is that it is observed); persisting the roster in `deck.json` (a write per tool call on the one file the daemon guards, to restore a list of agents that died with the daemon).

**Consequences**: an agent that thinks for longer than the window without a tool call reads as gone and returns on its next call; a daemon restart empties the roster until the next heartbeat; the roster shows an agent's type and how long it has been live and nothing about what it is doing, because the payload does not carry that.

**Amended 2026-09-23 (run-record S1, ADR 0027):** a main session started with `claude --agent pilot:pilot` does carry `agent_type` (`pilot:pilot`); only `agent_id` is absent from every main session. The roster already keys on `agent_id`, so nothing here changes but the reading of the pilot's payload.
