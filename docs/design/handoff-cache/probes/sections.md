# S2 probe: the prompt sections of a cold start and of an after-clear hand-off

Claude Code 2.1.328, runs of 2026-11-19 (08:30 to 08:49 UTC), `--model sonnet`, one scratch session per row, `claude plugin details pilot@pilot` read for the plugin's own parts. Source: `sections/runs.jsonl`, 14 records, each from `node sections/run.mjs`; every record holds names, sizes and sha256 prefixes, no section text. A rerun by hand reads the same table, bar the per-session values named below.

## Sections (`prompt.section`), cold against after-clear

29 sections fire once in every start, the same 29 names in both starts and in every run (their order varies run to run). The hook event carries a text only for 8 of them; for the other 21 it gives the name alone, so they have no size or hash (the first cause of the accounting gap below).

| section | bytes | cold (f-cold x2) | after-clear (f-ac x2) | same / differs |
|---|---|---|---|---|
| env_info_model | 128 | 3126d308 | 3126d308 | same |
| pronouns | 361 | 3fcd2b20 | 3fcd2b20 | same |
| context_management | 282 | 9856a95e | 9856a95e | same |
| user_privacy | 424 | 90ca9026 | 90ca9026 | same |
| env_info_simple | 622 | 6d75b23a | 6d75b23a | same |
| action_caution | 520 | 97244153 | 97244153 | same |
| session_guidance | 526 | ae493e9e | ae493e9e | same |
| memory | 2,167 | cbff2128 / 5c9dc2aa | f5250819 / d083aae9 | differs, in every run, cold or not: the text carries per-session paths |
| 21 sections, named only (communication, llm_rnd_capabilities, fable_identity, task_continuity, bg-session, tool_param_json, brief, delivering_work_max, focus_mode, act_dont_rederive, overcorrection, subagent_steer_delegation, original_games, heron_brook, opus5_reduced_delegation, finishing_work, brook_heron, notes_and_feedback, autonomy_append, willow_tern, endconv_deferred_hint) | none | name | name | same name; text unseen |

## Attachments, cold against after-clear

| attachment | bytes | cold | after-clear | same / differs |
|---|---|---|---|---|
| instructions (CLAUDE.md files) | 14,422 | f7e9e914 | f7e9e914 | same |
| model | 128 | 3126d308 | 3126d308 | same |
| date | 27 | 1dbc1cce | 1dbc1cce | same |
| session_context | 608 | a69ffc42 | a69ffc42 | same |
| remote_session_change | 547 | 705ab13f | 705ab13f | same |
| agent_listing_delta | 13,931 | 39acf67b | 39acf67b | same |
| environment | 898 | differs per run | differs per run | differs: per-session paths, same size |
| hook_additional_context | 912 | absent | cdb49f92 / e59e2c6f | differs: the hand-off frame, after clear only (its hash changes per run) |
| deferred_tools_delta | 1,010 / 1,014 | present | 1,804 / 1,732 | differs: the chrome-devtools MCP server connects about 7 s late and its tools arrive as a delta; the after-clear start is logged with more of them |
| mcp_instructions_delta | 2,049 | absent in 1 of 2 | present in 2 of 2 | differs: same late MCP connection (same hash 720be1 whenever present) |

## First-turn tokens (`turn.complete` usage)

| start | run | input + cache read + cache write = total |
|---|---|---|
| cold | f-cold 1 | 2 + 30,628 + 6,185 = 36,815 |
| cold | f-cold 2 | 2 + 30,628 + 6,933 = 37,563 |
| after-clear | f-ac 1 | 2 + 25,329 + 5,822 = 31,153 |
| after-clear | f-ac 2 | 2 + 30,815 + 346 = 31,163 |

The after-clear first call reads 25,329 from cache, which is the `/context` rows System tools (10,700) plus System prompt (14,600). So the tools and the system prompt are byte-identical between the two starts and between sessions; what differs is the parts named above. A cold first call is 5.7k to 6.4k larger than an after-clear one.

## The trim

`TRIM=<names>` makes the mod return `text: null` for the named sections. In every trimmed record the 8 sized sections show `trimmed: true` and `changed: false`.

| condition (sonnet, after-clear) | runs | first-turn totals | against untrimmed |
|---|---|---|---|
| untrimmed, no deck tools (f-ac) | 2 | 31,153; 31,163 | baseline |
| all 8 sized sections trimmed (f-trim) | 1 | 31,159 | +1 against the mean 31,158 |
| untrimmed, deck tools logged (final-ac) | 3 | 33,920; 33,909; 33,915 | baseline |
| 4 sections trimmed: memory, pronouns, context_management, session_guidance (ac-sub) | 1 | 33,930 | +15 |
| 3 sections trimmed: action_caution, user_privacy, env_info_simple (ac-three) | 1 | 33,917 | +2 |
| all trimmed (ac-trim2) | 1 | 33,915 | 0 |
| all trimmed (ft) | 3 | 33,925; 32,540; 33,920 | +10, then -1,375, then +5 |

The one early -1,394 (32,540, against the 33.9k of its neighbours) did not repeat (the next run is -10); it reads as about 1.4k of between-session noise, not a saving. In a `--agent pilot:pilot` session these sections are not in the request at all (the predecessor's observation; no record in `runs.jsonl` holds it).

Saves 0 tokens against the 1,000-token bar.

## Does a pilot first turn still run `deck_status`? (assumed, see below)

| trim | first turns that called `deck_status` |
|---|---|
| all 8 trimmed (ft, 3 runs) | 0 of 3 |
| untrimmed (final-ac, 3 runs) | 0 of 3 |

The three calls listed in each record are `deck_reply`, `deck_resolve` (and `deck_read`). A scratch hand-off has no run record, so no pickup reaches `deck_status`; the 0 of 3 holds with and without the trim. No opus run was made, since the trim is ruled out.

## Accounting: unaccounted

Behaviour 1 asked for every section accounted against the first turn's input tokens, within 5%. It is not met. Causes: 21 of the 29 sections carry no text in the hook event, so they have no size; the `deferred_tools_delta` and `mcp_instructions_delta` attachments are logged but are likely not re-sent after a clear; and the cold listing was not seen in full. The reading rests on the sized rows above and the cache-read split, not on a sum.

## Assumed decisions

- Behaviour 1's accounting is recorded as unaccounted, with no transcript reading and no rerun.
- Behaviour 3's deck_status check is 0 of 3 trimmed and 0 of 3 untrimmed on sonnet, with no opus run.

## No copy left

2026-11-19T08:49:06Z: no `sectionsprobe-*` directory under `%TEMP%`, 0 `.credentials.json` under `%TEMP%`, and every record in `runs.jsonl` has `scrubbed: true`. `run.mjs` never prints or logs the copied login (it reads only `claudeAiOauth.expiresAt` from the copy, and its errors name no token); its cleanup runs on `exit`, on SIGINT, SIGTERM and SIGHUP, and on an uncaught exception, and the next run sweeps what a SIGKILL left.

verdict: ruled out, 10
