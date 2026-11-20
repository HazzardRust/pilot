# Probe: the crew across the mod's clear (S5, spec 7)

Since S13 the runner spawns each session in a temp config dir holding a copy of the login (L8); the counts below were taken before, on the real config.

Claude Code 2.1.328 · 2026-11-19 · `--model sonnet` · Windows 11 · 15 scratch headless sessions, $1.52 in all.

## How it ran

`node docs/design/handoff-cache/probes/crew/run.mjs --at <point> --runs <n> --model sonnet`: one `claude -p
--input-format stream-json` session per run in a fresh temp repository, `--setting-sources project` (no installed
plugin loads), `--strict-mcp-config`, and a copy of `probes/crew/` whose mod clears main as `hooks/handoff-mod.mjs`
does. Main spawns one background agent that waits for the mod's signal, `SendMessage`s main a unique token, works
20 s more and finishes. The old context answers a message `OLD-SAW <text>`, the fresh one `RECEIVED: <text>`.

| Point | Where the send fell |
| --- | --- |
| before | The agent's `SendMessage` returned while main was idle and the mod held its turn end; the clear started 3 s later. |
| during | Inside the `SessionStart:clear` hook: after `command.run` started, before it resolved and before the fresh prompt (every `during` log: `clear-start`, `clear-hook-sent: true`, `clear-end`, `submitted`, the `sent` stamp between the first and third). |
| after | Once the fresh context's first turn had ended. |

## Runs

**Alive**: listed by `$.agent.list()` right after the clear, and `done` stamped. **Received**: a `RECEIVED: <token>` reply.

| run | at | agent id | listed after clear | finished | alive | sent | received by new context | old context saw it | ended by | cost $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | before | aca64b4fcc1c68f17 | yes | yes | yes | yes | yes | no | settled | 0.076 |
| 2 | before | a702a1c1939a81bbc | yes | yes | yes | yes | yes | no | settled | 0.065 |
| 3 | before | a3192093d9b57f67a | yes | yes | yes | yes | yes | no | settled | 0.075 |
| 4 | before | a385aedf1b80bb848 | yes | yes | yes | yes | yes | no | settled | 0.080 |
| 5 | during | a6b1cfc0ce0b95176 | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 6 | during | ae998886ae7ca6b19 | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 7 | during | a783ddcb5c577afe9 | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 8 | during | a3fc7e2ebdfcf5ced | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 9 | after | a47c95e8cca5e5d74 | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 10 | after | a4faf1d72a9b6280b | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 11 | after | a0db0142b77653859 | yes | yes | yes | yes | yes | no | settled | 0.122 |
| 12 | after | a022e7d1d3b2e7392 | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 13 | before | a0cbe05a66c57a37f | yes | yes | yes | yes | yes | no | settled | 0.065 |
| 14 | during | aa8d520b5b8e8e72e | yes | yes | yes | yes | yes | no | settled | 0.107 |
| 15 | after | ae264eaae8a8ef3b5 | yes | yes | yes | yes | yes | no | settled | 0.122 |

## What else was seen

- Runs 13-15 are the rerun, one per point, on the runner as committed (its log parse made tolerant): same counts.
- Main replied `SPAWNED`, `NONE YET`, `RECEIVED: <token>`, then a completion note, in all 15: a message sent before
  or during the clear missed the fresh first turn, and the host delivered it as the next turn.
- The `session.receive` hook never fired (0 of 15): a delivery shows only as a turn.
- `claude plugin validate docs/design/handoff-cache/probes/crew` passes, with two warnings.
- Not covered: an interactive TTY, an agent life past 70 s, a send between the clear and the submit (QA's §9 check).

verdict: no loss, 15 of 15

## after S6

S6 read the verdict above against its bar (architecture.md §5 L1) and built nothing: no crew prompt changed, no
rerun. Line 7a's row for S11's ledger:

ruled out: no loss in 15 runs

## QA: a send between the clear and the submit

3 runs, sonnet, each RECEIVED, mod.jsonl order clear-end < sent < submitted. Run by QA on 2026-11-19 from the crew probe with a `between` point.
