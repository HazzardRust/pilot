# Probe: the crew across the mod's clear (S5, spec 7)

Claude Code 2.1.328 · 2026-11-19 · `--model sonnet` · Windows 11 · 12 scratch headless sessions, $1.23 in all.

## How it ran

`node docs/design/handoff-cache/probes/crew/run.mjs --at <point> --runs <n> --model sonnet`. Each run is one
`claude -p --input-format stream-json` session in a fresh temp repository, user settings skipped
(`--setting-sources project`, so no installed plugin loads), `--strict-mcp-config`, and one plugin: a copy of
`probes/crew/` whose mod clears main the way `hooks/handoff-mod.mjs` does (`$.command.run({ command: 'clear' })` at
main's first turn end, then `$.prompt.submit`). Main spawns one background `general-purpose` agent that waits for
the mod's signal, `SendMessage`s main a unique token, works 20 s more and finishes. Main's old context is told to
answer a message with `OLD-SAW <text>`; the fresh prompt asks for `RECEIVED: <text>`, so the reply says which
context held the message.

| Point | Where the send fell |
| --- | --- |
| before | The agent's `SendMessage` returned while main was idle and the mod held its turn end; the clear started 3 s later. |
| during | Inside the `SessionStart:clear` hook: after `command.run` started, before it resolved and before the fresh prompt (every `during` log: `clear-start`, `clear-hook-sent: true`, `clear-end`, `submitted`, the `sent` stamp between the first and third). |
| after | Once the fresh context's first turn had ended. |

**Alive** is `$.agent.list()` listing the agent right after `command.run` resolved, and its `done` stamp written
at the end of its task. **Received** is a main reply `RECEIVED: <token>` in the fresh context.

## Runs

| run | at | listed after clear | finished | alive | sent | received by new context | old context saw it | ended by | cost $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | before | yes | yes | yes | yes | yes | no | settled | 0.076 |
| 2 | before | yes | yes | yes | yes | yes | no | settled | 0.065 |
| 3 | before | yes | yes | yes | yes | yes | no | settled | 0.075 |
| 4 | before | yes | yes | yes | yes | yes | no | settled | 0.080 |
| 5 | during | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 6 | during | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 7 | during | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 8 | during | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 9 | after | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 10 | after | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 11 | after | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 12 | after | yes | yes | yes | yes | yes | no | settled | 0.107 |

Agent ids, in order: aca64b4fcc1c68f17, a702a1c1939a81bbc, a3192093d9b57f67a, a385aedf1b80bb848,
a6b1cfc0ce0b95176, ae998886ae7ca6b19, a783ddcb5c577afe9, a3fc7e2ebdfcf5ced, a47c95e8cca5e5d74, a4faf1d72a9b6280b,
a0db0142b77653859, a022e7d1d3b2e7392.

## What else was seen

- In all 12 runs main's replies were `SPAWNED`, `NONE YET`, `RECEIVED: <token>`, then a note on the agent's
  completion. A message sent before or during the clear was not in the fresh context's first turn: the host held it
  and delivered it as the next turn, after the fresh prompt's.
- `$.agent.list()` showed the agent `running` right after the clear and `completed` at the last fresh turn end.
- The `session.receive` hook never fired (0 of 12), so the mod saw no delivery event; the delivery is visible only
  as a turn.
- Not covered: an interactive TTY session, an agent life longer than about 70 s, and a send in the 1 s between
  `command.run` resolving and `$.prompt.submit`. QA's hand-off with a live implementer is the interactive check
  (architecture §9).

verdict: no loss, 12 of 12
