# handoff-cache: the hand-off keeps the cache, and plain `claude` stays plain

Ticket itm_3997fa784e4b (itm_93cdec375a75 merged in, itm_32123bfa2dd0) · base `feat/handoff-cache` from `origin/pilot`
(fa28b73b at design time) · ADR NNNN (`docs/adr/NNNN-handoff-cache.md`, written by S11).

## 1. Problem

> is there any way we could like clear all the tokens from PART of the context window, and leave the ones at the start
> cached because all sessions will have them injected? what about just something instead of a /clear?
> [...] we can consider modifying the system prompt to optimise pilot because i know that mods can do that

> we want a system to ensure that they are kept alive, because a while ago we actually used to do this, but every once
> in a while it would die mid hand-off because of an untimely request back to the main session which got lost in the
> /clear [...] this may now be possible with mods so it is worth exploring that is all

> removing pilot from any session that wasnt started through pilot start. ie leave a normal claude code session as
> normal. that means we need to add a pilot update command (itm_93cdec375a75)

A hand-off ends in a mod-run `/clear` and a fresh context. Nobody has measured how much of the prompt cache that
fresh context reuses, whether a mod can restart more cheaply or change the system prompt, or whether the crew and its
messages to main survive the clear. Separately, every plain `claude` session carries the whole plugin, because no
`reach.json` reads as `everything`. Lines 1-7a are measured first; something is built only where a number proves it.

## 2. Spec

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | The cache reuse of a hand-off is measured: the first turn after a hand-off clear beside a cold pilot start's first turn, as uncached input, cache read, cache write (5m, 1h) and cached share, with the gap since the previous call. | `node scripts/audit-session-start.mjs <repo> --first-turn` prints 2 rows from at least 3 sessions of each kind on disk; the numbers are in `measurements.md` (S1). The user's clause was "a script run on a real session": narrowed to the transcripts already on disk (A3). *practitioner: a performance engineer, the API's own usage counters* |
| 2 | What the two starts differ in is named, part by part: tools, system prompt sections, agent file, rules, SessionStart injection. | A table in `probes/sections.md`, one row per prompt section with name, bytes and hash in each start; 0 sections unaccounted for (S2). |
| 3 | Each differing part the pilot controls is made identical or moved after the shared start, if it is worth it. | Built only if the miss before the stable text is 1,000 tokens or more (A4; the user's clause: "cached tokens of the first turn rise"); then the line 1 rows before and after, the cache read up by at least that much. Otherwise a ledger row says why not, with the number (S3). |
| 4 | Every mod restart other than `/clear` is tried once: `$.session.compact`, a `session.compact` hook returning a kept head, `/branch`, recorded as works, refused or absent. | 1 row per call in `probes/restart.md`: context tokens after, first-turn cache read, whether the pickup prompt ran; 3 calls at least (S4). Adopted only on L7's bar (S7). |
| 5 | A mod that removes or replaces pilot-session prompt sections is tried. | Start tokens with and without, from `claude plugin details` and line 1's rows; kept only if the start drops 1,000 tokens or more and the pilot's first-turn steps run 3 of 3 (S2 probe, S8 build). |
| 6 | Lines that lack the fidelity close with their numbers. | `ledger.md`: 1 row per line 1-7a, built or ruled out, each with its number; 0 lines without a row (S11). |
| 7 | Whether the crew stays alive across the mod's clear, and whether a message it sends to main at that moment arrives, is measured. | A scratch-session probe: a background agent sends to main before, during and after the clear, 10 runs; survivals and receipts counted in `probes/crew.md` (S5). A loss of 1 or more stops and goes to main as A2's question before 7a. |
| 7a | A message sent while main is clearing is held and delivered to the new session, never dropped. | Built only if 7 shows a loss: a test sends at each of 3 points of the clear and the fresh session reads all 3 (S6). |
| 8 | A session started with plain `claude` carries nothing of pilot: no agent prompt, rules, skills, deck tools or hook notices. | A plain start's first-turn row from line 1's script: 0 pilot sections, its tokens within 2% of a machine without the plugin (A1, S9). |
| 9 | A plain session is never held or spoken to by the deck. | A plain session ends its turn with a deck item open and is not blocked: 0 Stop holds; the plugin is not enabled in user settings (S9). |
| 10 | A `pilot start` session has everything it has today. | `deck/test/pilot-start.test.mjs` and `start-session.test.mjs` pass with 0 edits to them; 1 live `pilot start` shows the deck (S9). |
| 11 | `pilot update` updates the plugin from the terminal and prints the version before and after. | On a machine one version behind: 2 version lines, the new one matching the marketplace; the next `pilot start` runs it (S10). |
| 12 | `pilot update` with nothing to update, or with a live run, says so and changes nothing. | 1 test each way: exit code and line; 0 calls to `claude plugin update` (S10). |
| 13 | A crew agent spawned in a pilot session still has pilot; a subagent of a plain session has none. | 1 spawn each way in QA's walkthrough: the crew agent lists the deck tools, the plain one 0 (S9). |

Cannot mean here: a pty restart (handoff-mod L7); a whole system-prompt replace (the mod API changes sections only);
a build on any probe that does not meet its bar (L1).

## 3. Findings

| Fact | Where |
| --- | --- |
| Hand-off: the guard's advisory at 225k and hard mark at 260k; `pilot handoff` posts the item; the mod runs `$.command.run({command:'clear'})` then submits `Pick up the hand-off on the deck.` | `hooks/context-size-guard.js:72`, `scripts/handoff.mjs:162`, `hooks/handoff-mod.mjs:103`, `deck/run-look.mjs:75` |
| System prompt, agent file, tools, rules and MCP instructions are identical in a cold start and after the clear; only SessionStart additionalContext differs (frame about 880 B plus a 1-24 KB fenced body). | `deck/run-env.mjs:57`, `hooks/session-handoff.js:181` (`notice`) |
| The item id sits at about byte 100 of the frame, ahead of about 780 stable bytes: the one pilot-controlled cache breaker, worth about 200 tokens at most. | `hooks/session-handoff.js:193-201` |
| A cold start writes about 36k tokens of cache, all in the 1h bucket (real transcript usage object). | `~/.claude/projects/.../*.jsonl` |
| `measureOne` takes a file's first usage and sums the three input fields into one number; `tokenCounts` already splits them. Whether `/clear` starts a new file is assumed by the code, never checked. | `scripts/audit-session-start.mjs:95,105`, `deck/transcripts.mjs:62` |
| Mod API in 2.1.328 (binary strings; the docs page 404s): `$.session.compact({instructions})`, a `session.compact` hook that may return `{messages}`, `prompt.section` hook (`text:null` removes a section), `turn.complete` carries `usage`, `$.agent.list()`, `session.receive` hook with `{origin, agentId}`. | `claude.exe` 2.1.328 strings; `docs/design/handoff-mod/architecture.md` §3 |
| A background subagent outlives a `/clear` (a telemetry string); on record the co-pilot was killed once (exit 137, 2026-10-05) and an S5 implementer left "No transcript found". | `docs/adr/0089-*.md:11`, `docs/design/handoff-mod/run.json:261` |
| `pilot reach nothing` already keeps a plain session plugin-free; `pilot start` enables the plugin through its own `--settings`. An absent `reach.json` reads `everything`; the user's machine has none. | `scripts/reach.mjs:29`, `deck/run-env.mjs:24` |
| `claude plugin update <plugin>`, `claude plugin marketplace update [name]`, `claude plugin details` (projected token cost) and `claude plugin test` (a mod's tests) exist; no `pilot update` verb does. | `claude plugin --help` 2.1.328, `bin/pilot.mjs:72-208` |

**Seams** (deepening pass: deletion test on each touched module; nothing shallow found to fold, so no fold slice)

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| session-start measure | `measureSessionStarts({repo, home, limit, firstTurn})`, `firstTurnRows(sessions)` | none; it calls `deck/transcripts.mjs`'s `tokenCounts` instead of its own sum | local-substitutable (fixture JSONL) |
| hand-off frame | `run(input)` in `hooks/session-handoff.js` (`notice` internal) | none | in-process |
| hand-off mod | `register(on)` driven by a fake `$` in `hooks/test/handoff-mod.test.mjs` | none | true external (Claude Code engine); adapter: the fake `$` |
| prompt mod (new) | `register(on)` | none | true external; adapter: the fake `$` |
| reach | `readReach({home}) -> {level, chosen}`, `repairSettings({home, pluginRoot})` | none | local-substitutable (temp home) |
| update | `update({run, home}) -> {before, after, changed, refused}` | none | true external (`claude` CLI); adapter: injected `run` |

## 4. Ubiquitous language

- **First turn**: the first API call of a fresh context, after a clear or at a cold start; its usage is the measure.
- **Cached share**: cache read over (uncached input + cache read + cache write) of the first turn.
- **Shared start**: the prompt prefix identical in both kinds of start; what the cache can reuse.
- **Probe**: a scratch plugin plus runner under `docs/design/handoff-cache/probes/`, run in a scratch headless session; never shipped.
- **Ledger**: `ledger.md`, one row per measured line, built or ruled out, with its number.
- **Plain session**: a session started by `claude`, not by `pilot start`.

## 5. Locked decisions

- **L1 Measure, then build.** Every build slice (S3, S6, S7, S8) starts by reading its probe's number against its bar; under the bar it closes with no code change and a ledger row. Rejected: building alongside the probe, which would ship a mechanism nobody has proven.
- **L2 One instrument, extended.** Line 1 extends `scripts/audit-session-start.mjs` with `--first-turn` over `tokenCounts`. Rejected: a new script, or the mod logging usage at `turn.complete`, which would be a second instrument for the same counters.
- **L3 Probes ship nothing.** Probe plugins and runners live under `docs/design/handoff-cache/probes/`, run with `--plugin-dir` in a scratch headless session. Rejected: probe code in `hooks/`, which every session would load.
- **L4 The frame opens with `PICKUP_MARK`.** Any reorder in S3 keeps `SYSTEM NOTICE: you are picking up a run that was handed off to you.` as the frame's first bytes, since S1's pickup detection reads it (red team).
- **L5 Section trims touch the main pilot session only.** S8's `prompt.section` hook changes nothing in a crew agent or a plain session. Rejected: a trim for every session the plugin loads in, which would starve the crew of what it reads.
- **L6 `pilot update` wraps the `claude plugin` CLI.** `marketplace update pilot`, then `update pilot@pilot`; no downloader of its own. A live run is a deck session with an open run record. Rejected: copying files into the plugin cache.
- **L7 A restart replaces `/clear` only on two bars.** First-turn uncached input plus cache write drops by 1,000 tokens or more, and the pickup prompt runs 3 of 3.

## 6. Assumed decisions

- **A1 Absent `reach.json` reads `nothing` for every install** (posted itm_26a410398bc2). Trade: a user who relied on pilot in plain sessions loses it until `pilot reach everything`. Rejected: code unchanged, the user runs `pilot reach nothing` (S9 becomes a doctor line).
  User's answer (itm_26a410398bc2): Every install.
  Verdict: stands — the user chose "Every install" on itm_26a410398bc2
- **A2 A lost crew message is held via the deck.** Asked only if S5 proves a loss: then S5 stops and main posts the question before S6. Default: each crew report to main is also posted on the deck, which the fresh session reads. Trade: every crew prompt changes and adds one deck write per report. Rejected: the hand-off mod holding messages through the undocumented `session.receive` hook.
  Verdict: stands — conditional on S5's measurement; a proven loss stops and is asked before S6, so nothing is built on it unasked
- **A3 Line 1 measures transcripts already on disk**, not a newly run session. Trade: the sample is whatever hand-offs happened lately, unpaired. Rejected: a staged pair of sessions, which costs a live run.
  Verdict: stands — transcripts on disk are real sessions' own usage counters and cost no new session; QA's scratch hand-off confirms live
- **A4 Line 3 is built only for a miss of 1,000 tokens or more.** Trade: a smaller saving is left unbuilt. Rejected: building at any positive gain.
  Verdict: stands — the user's line 6 closes a line the numbers rule out; a bar of 1,000 tokens makes that rule checkable
- **A5 Probes run headless by implementers on `--model sonnet`**, about 30 scratch sessions in all (S2 3, S4 4 modes at 3 each, S5 10 or more, S6/S7/S8 reruns): 1.5M-4.5M tokens, mostly cache write and read, about $5-$20 API-equivalent at Sonnet prices; the 6 first-turn checks in S2 and S8 run on the pilot agent's own model (Opus), about 250k tokens more. The live confirmation of 4 and 7 is QA's hand-off (§9). Trade: real token spend, and headless timing may differ from an interactive clear. Rejected: probes only in the user's live sessions.
  Verdict: stands — the user chose scratch sessions on itm_5556a16a5dec; the probes' cost, about 30 sessions and $5-$20, is stated at Gate 1

## 7. Out of scope

Rewriting the guard's marks; the deck UI; changing how crew agents are spawned; a whole system-prompt replace; any
change to the merged ticket's reach levels beyond the default.

## 8. Slices

Width 6; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The first turn after a hand-off prints beside a cold start's | 1 | `scripts/audit-session-start.mjs`, `scripts/test/audit-session-start.test.mjs`, `docs/design/handoff-cache/measurements.md` | – | typescript | [S1](slices/S1.md) |
| S2 | Each prompt section of both starts is listed and a trim is measured | 2, 5 | `docs/design/handoff-cache/probes/sections/**`, `probes/sections.md` | – | typescript | [S2](slices/S2.md) |
| S3 | The hand-off frame puts its stable text first, if worth it | 3 | `hooks/session-handoff.js`, `hooks/test/session-handoff.test.js` | S1 (`--first-turn` measure) | typescript, security | [S3](slices/S3.md) |
| S4 | Each mod restart is tried once and recorded | 4 | `docs/design/handoff-cache/probes/restart/**`, `probes/restart.md` | – | typescript | [S4](slices/S4.md) |
| S5 | The crew's survival across the clear is counted | 7 | `docs/design/handoff-cache/probes/crew/**`, `probes/crew.md` | – | typescript | [S5](slices/S5.md) |
| S6 | A message sent during the clear reaches the new session | 7a | `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `agents/pilot.md` | S5 (`probes/crew.md` verdict) | typescript, security | [S6](slices/S6.md) |
| S7 | A proven restart replaces `/clear` | 4 | `hooks/handoff-mod.mjs`, `hooks/test/handoff-mod.test.mjs` | S4 (`probes/restart.md` verdict) | typescript, security | [S7](slices/S7.md) |
| S8 | A pilot session drops the prompt sections it does not need | 5 | `hooks/prompt-mod.mjs` (new), `hooks/test/prompt-mod.test.mjs` (new), `hooks/hooks.json` | S2 (`probes/sections.md` verdict) | typescript, security | [S8](slices/S8.md) |
| S9 | A plain `claude` carries no pilot | 8, 9, 10, 13 | `scripts/reach.mjs`, `scripts/install-settings.mjs`, `scripts/test/reach.test.mjs`, `scripts/test/install-settings-reach.test.mjs` | – | typescript, security | [S9](slices/S9.md) |
| S10 | `pilot update` updates from the terminal | 11, 12 | `bin/pilot.mjs`, `scripts/update.mjs` (new), `scripts/test/update.test.mjs` (new) | – | typescript, security | [S10](slices/S10.md) |
| S11 | The ledger closes each measured line with its number | 6 | `docs/design/handoff-cache/ledger.md` (new), `docs/adr/NNNN-handoff-cache.md` (new) | S3 (ledger row), S7 (ledger row), S8 (ledger row) | typescript | [S11](slices/S11.md) |

Walking skeleton: S1, real transcripts in, two measured rows out. The ready set by risk: S5 (its loss decides A2 and
S6), S4, S2, S1, then S9 and S10.

Red team (the cut assumed failed, each slice's first behaviour walked against the files):
- red team: S1 assumed `/clear` starts a new transcript file (`measureOne` reads a file's first usage). If it does not, every post-clear row is missed. S1 now segments a file at each clear marker and its first behaviour is a fixture with a clear mid-file.
- red team: S3's reorder would move `PICKUP_MARK`, which S1 reads to tell a pickup; locked as L4, and S3's test asserts the mark is still the frame's first bytes.
- red team: S6 under the mod path and S7 would both edit `hooks/handoff-mod.mjs`; under A2's deck default S6 owns the three agent files instead. If A2 is answered the other way, S6 re-cuts to `hooks/handoff-mod.mjs` and S7 goes after it.
- red team: S8's section hook would load in every crew agent of a pilot session too; L5 scopes it to the main session, and S8 has a crew-agent test.
- red team: S9 changing the default leaves `enabledPlugins` already written in user settings; S9's behaviours include the repair hook removing it once, not only the default.

## 9. Acceptance evidence

QA runs in scratch, the user's answer on itm_5556a16a5dec: headless scratch sessions in a temp repository, a scratch
deck on a spare port, a temp config dir for `pilot update` and the plain session, the user's transcripts read-only,
never the real `~/.claude`. The hand-off with a live crew agent (4, 7) is a scratch pilot session's own hand-off with
a scratch implementer.

1. `node scripts/audit-session-start.mjs <repo> --first-turn` prints the two rows, and `measurements.md` holds them (1).
2. `probes/sections.md`, `probes/restart.md` and `probes/crew.md`, each with its counted rows (2, 4, 5, 7).
3. For each build slice, either its before and after rows or its ledger row saying it was ruled out (3, 5, 7a, 4).
4. One hand-off with a live crew agent: the agent is alive after it and its report reaches the fresh context; the restart is the adopted one or `/clear` (4, 7, 7a).
5. A plain `claude` in the QA config: no deck, no pilot status line, 0 pilot sections in its first-turn row (8, 9, 13).
6. `pilot start` opens the deck as today (10); `pilot update` in the QA config prints the two versions, or says nothing to update (11, 12).
7. `ledger.md`: 1 row per line 1-7a (6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 The first turn after a hand-off prints beside a cold start's | planned | `slice/handoff-cache-s1` | – | – | – | 1 |
| S2 Each prompt section of both starts is listed and a trim is measured | planned | `slice/handoff-cache-s2` | – | – | – | 2, 5 |
| S3 The hand-off frame puts its stable text first, if worth it | planned | `slice/handoff-cache-s3` | – | – | S1 | 3 |
| S4 Each mod restart is tried once and recorded | planned | `slice/handoff-cache-s4` | – | – | – | 4 |
| S5 The crew's survival across the clear is counted | planned | `slice/handoff-cache-s5` | – | – | – | 7 |
| S6 A message sent during the clear reaches the new session | planned | `slice/handoff-cache-s6` | – | – | S5 | 7a |
| S7 A proven restart replaces `/clear` | planned | `slice/handoff-cache-s7` | – | – | S4 | 4 |
| S8 A pilot session drops the prompt sections it does not need | planned | `slice/handoff-cache-s8` | – | – | S2 | 5 |
| S9 A plain `claude` carries no pilot | planned | `slice/handoff-cache-s9` | – | – | – | 8, 9, 10, 13 |
| S10 `pilot update` updates from the terminal | planned | `slice/handoff-cache-s10` | – | – | – | 11, 12 |
| S11 The ledger closes each measured line with its number | planned | `slice/handoff-cache-s11` | – | – | S3, S7, S8 | 6 |
| handoff-cache (feature) | planned | `feat/handoff-cache` | – | – | S1-S11 | 1-13 |
