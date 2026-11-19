# S4 probe: each mod restart, tried once

Claude Code 2.1.328, 2026-11-19, `--model sonnet` (claude-sonnet-5-5). Scratch headless sessions only (A5): `node
probes/restart/run.mjs --mode <MODE>` starts `claude -p --input-format stream-json --plugin-dir probes/restart
--strict-mcp-config` in a temp repository. **All 12 sessions below ran on the copied login**: a temp
`CLAUDE_CONFIG_DIR` holding a copy of `~/.claude/.credentials.json`, removed after each run. The runner no longer
does that: a rerun needs `PROBE_CONFIG_DIR` (a scratch config dir the user logged into) or `ANTHROPIC_API_KEY`,
and stops without one. The driver sends a short opening turn, then about 44k tokens of numbered filler; on the second main
`turn.complete` the mod runs the mode's call, then `$.prompt.submit`s `Probe pickup: reply with the single word
PICKED.` Usage is the pickup turn's own `assistant` usage from stream-json, checked equal to the mod's
`turn.complete` `usage`.

**First turn** = the pickup turn. **L7 measure** = its uncached input plus cache write. **Context after** = its
uncached input + cache read + cache write. Before the restart the context stood at 68,362 tokens (clear run:
4 + 24,561 + 43,797).

| Mode | Call | Result | What came back | Context after | First turn: input / cache read / cache write | L7 measure | vs `/clear` | Pickup ran |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clear | `$.command.run({command:'clear'})` | works | resolved `{text}`; `$.session.messages()` 4 → 0; `conversation_reset` | 24,755 | 2 / 19,249 / 5,504, the same in all 3 runs | 5,506 | baseline | 3 of 3 |
| compact | `$.session.compact({instructions})` | refused | threw `restartprobe: $.session.compact: not available in a headless (-p / SDK) session yet: compaction here runs inside a turn (a /compact prompt); catch it and carry on`; messages 4 → 4 | 68,433 (not cut) | 4 / 68,344 / 85 | n/a | n/a | 1 of 1, on the uncut context |
| compact-keep-head | `$.command.run({command:'compact'})` with the `session.compact` hook returning `{messages: e.messages.slice(0, 2)}` | works | hook fired with `{trigger, messages}`, 4 messages; resolved `{text}`; `compact_boundary`; context cut to the opening exchange (68,362 → about 28-32k) and no summary call | 31,645 / 28,386 / 31,648 | 4 / 24,561 / 7,080; 4 / 24,563 / 3,819; 4 / 24,563 / 7,081 | 7,084 / 3,823 / 7,085 | +1,578 / -1,683 / +1,579 | 3 of 3 |
| branch | `$.command.run({command:'branch'})` | absent | threw `restartprobe: $.command.run: no command named /branch in this session`; messages 4 → 4 | 68,433 (not cut) | 4 / 68,344 / 85 | n/a | n/a | 1 of 1, on the uncut context |

- **compact**: the refusal names headless only; whether an interactive session accepts `$.session.compact` is
  untried (A5 runs headless). The kept-head row takes the route the refusal names, a `/compact` prompt through
  `command.run`.
- **compact-keep-head**: the transcript after `compact_boundary` holds the opening user message and `OK1`, then
  the `/compact` caveat lines and the pickup; the filler turn is gone. Every session's first turn wrote either
  about 14.0k or 10.7k tokens of cache (a 3.26k-token attachment present in some sessions and not others, mode
  aside); like for like with the clear run (both 14.0k), the kept head writes 1,578 more than `/clear`, not
  fewer. The one saving (-1,683) is the run without that attachment.
- **Order check**: a first pass put the filler first, so a two-message head kept the bulk (clear 24,755 after vs
  kept head 65,281 after, L7 measure 5,506 vs 3,822). It measured keeping the filler, not keeping the opening a
  hand-off would keep, so the driver was reordered and the clear and kept-head rows above rerun.
- **Rerun on the final runner** (after review, works needs the PICKED turn's usage, a cut below the context
  before, and for the kept head the hook; the mod tags its pickup turn): clear works, 2 / 19,249 / 5,504;
  compact refused, same message; compact-keep-head works, hook 4 messages, 68,359 → 31,642, 4 / 24,559 / 7,079
  (L7 measure 7,083, +1,577); branch absent, same message. Stream-json usage equalled the mod's `turn.complete`
  usage in all four. Same verdict.
- **All rows**: the scratch session still read `~/.claude/rules/*.md` from the real home (read-only) with the temp
  config dir set; it sits in every mode's cached prefix alike.

Spend: 12 scratch sessions (clear 3, compact 2, kept head 5, branch 2), each about 60k cache write and 65k cache
read on Sonnet, about $4.50 API-equivalent in all, inside A5's 12 for S4.

verdict: /clear stays, compact-keep-head saves 1,000 tokens in 1 of 3 runs (L7 measure 7,084 / 3,823 / 7,085 vs 5,506, pickup 3 of 3); compact refused headless; branch absent
