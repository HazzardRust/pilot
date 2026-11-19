# crew-handoff-trace: a crew hand-off never goes missing between pilot sessions

Ticket `itm_1f8238d5a300` · base `pilot` (ebe5233c) · merge thread `itm_cd0b9bedb2a5` (merged none) · ADR NNNN

## 1. Problem

> why did the last hand off fail
> make a ticket to either fix, or make a change to logging so we can debug what happened on that hand-off

On 2026-11-19 a co-pilot on `itm_64084fb89990` (crew-refusals) paused itself and its guard posted crew-handoff
`itm_7df7fdd3e4a3` at 07:29 UTC. The item sat open until the user pressed Handoff failed at 09:13. The cause was
guessed from timestamps. The user wants it fixed, or made debuggable by logging, and never as a step they perform
(recorded preference: hand-off fixes belong in the automatic cycle).

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | Every hand-off step writes one trace row `{at, step, kind, item, ticket, agent, session}`, written by the code that sees the step, never by an agent remembering to. Crew steps: `posted`, `stopped`, `released`, `granted`, `spawned`, `resolved`, `failed` (the user's press). Pilot steps: `posted`, `handed`, `cleared`, `submitted`, `resolved`, `failed`. | A scripted crew hand-off on a scratch deck, then `pilot trace <ticket>` prints at least 6 crew rows in time order, each with its writer named in §3 Seams. |
| 2 | `pilot trace <item or ticket id>` ends with `waiting: <next step>, <age>` when the sequence is unfinished, and `done` when it is finished. | The same run stopped before the spawn: the last line reads `waiting: spawned, <n>m`, with the age within 1 minute of the wall clock. |
| 3 | The cause of the 2026-11-19 failure is stated from evidence. | §3.1: all 14 steps, each with its source or "no record". |
| 4 | When a crew-handoff is open and its ticket has no live co-pilot, the next session's first prompt names it, with its ticket, as `<item> successor owed`. The same line reaches `pilot wait`, so that session spawns the successor with no user action. | A hook test: a SessionStart against a deck with one such item prints its id and ticket. Live: the QA walkthrough's paused co-pilot gets its successor with no press. |
| 5 | The cause in line 3 is fixed in the cycle. The guard's crew-handoff carries its `ticket`. `deck_ticket co-pilot` on that ticket closes the item as `successor granted`. `pilot.md` loses "resolve the item after the spawn". | A deck test that is red on `pilot` today (the item stays open after the grant, as `itm_7df7fdd3e4a3` stayed open for 1h44m) and green after. Zero lines added to any human-steps list. |
| 6 | Agreed (itm_c044bfef3e60, "Add line 6"). A crew-handoff left open for 10 minutes with no live co-pilot on its ticket wakes the pilot's parked `pilot wait` with one deck line. | A deck test with an injected clock: a wake at 10 min, none at 9, one only per item. |
| 7 | *assumed bar.* A row carries ids, step names, kinds and times only, never an item body, title or prompt. | A test posts a body holding a marker string; zero rows in the file contain it. |
| 8 | *assumed bar.* The trace is bounded. Past 512 KB it moves aside to one `.old`, about 3,000 rows each. | A test with a 512 KB file: the next row lands in a fresh file and `.old` exists. |
| 9 | Found issue. The deck writes a `deck started` row with its code root and version. `pilot trace` prints the newest one first, so a deck running a stale plugin copy shows on the first line. | A deck test reads the row on start. On 2026-11-19 that line would have named the 0.9.9 cache, copied at 23:53 UTC, 20 minutes before never-stuck-2 landed. |
| 10 | practitioner: SRE incident reviewer. The 2026-11-19 sequence, rebuilt as rows from §3.1, is a test fixture. `timeline` over it prints `waiting: granted, 1h05m` at 09:13: a ticket released at 08:08 with no successor. | `deck/test/trace.test.mjs`, a fixture of 10 rows. |

Line 4 is narrowed from the draft: a crew-handoff alone is not owed. The ticket must also lack a live co-pilot,
or a session started mid-run would spawn a second co-pilot. Lines 7 to 9 are implied by the ask (a log that is
safe, bounded, and that would have caught the cause found here). Not meant: logging the main session *receiving*
a hand-back. No hook fires on receipt, so `stopped` (SubagentStop) followed by main's next deck call stands in for it.

## 3. Findings

### 3.1 The 2026-11-19 hand-off (spec 3)

Times are UTC. Old pilot session 7cfa40fe, new session 6aa1c273, both in
`~/.claude/projects/C--Users-Hazzard-Projects-pilot/`. Deck item store: `~/.claude/pilot/deck.json`.

| Step | Time | Source |
| --- | --- | --- |
| Guard's advisory notice to co-pilot `a4a0177a` (226k) | ≤07:29:01 | Co-pilot's hand-back text only. No guard log line exists: **no record** |
| crew-handoff `itm_7df7fdd3e4a3` posted | 07:29:01 | deck.json item `postedAt`. Not shown to the pilot, and its title is the only place the ticket appears |
| Co-pilot hands back `paused` | 07:29:53 | 7cfa40fe:1512 |
| `deck_ticket release` / `co-pilot` on itm_64084fb89990 | 07:30:04 / 07:30:07 | 7cfa40fe:1529, 1533 |
| Successor `acf7b6eb` spawned | 07:30:25 | 7cfa40fe:1543. The brief is a long prose brief, not the three ids (`agents/pilot.md:130`). The item id is absent |
| Item resolved | — | **no record**. Grep of 7cfa40fe for the id: nothing |
| Successor hands back early, one implementer still live | 07:46:20 | 7cfa40fe:1777 |
| Pilot directs the ticket itself and starts no third co-pilot | 07:46:45 | 7cfa40fe:1804. This is off the Yellow rule |
| `deck_ticket release` on itm_64084fb89990 | 08:08:31 | 7cfa40fe:1967. The reply reads `Yellow: empty, next itm_3997fa784e4b`, with no successor named |
| Pilot `handoff` `itm_fa7aaaa382a7` posted | 08:08:47 | deck.json. The body names only handoff-cache |
| New session's SessionStart | 08:08:57 | 6aa1c273:11. Lanes read `co-pilot: empty → next itm_3997fa784e4b`, and no owed line names the crew-handoff |
| New session reads `itm_7df7fdd3e4a3`, then acts on nothing | 08:09:25 | 6aa1c273:103 |
| User presses Handoff failed | 09:13:19 | deck.json `replies[0]` |
| `co-pilot` grant, successor spawned, item resolved | 09:14:01–09:14:44 | 6aa1c273:490, 526; deck.json `resolvedAt` |

**Cause, as recorded.**

- **C1.** Nothing in code joins a crew-handoff to its ticket's grant. The item has no `ticket` field
  (`deck/items.mjs:280`), and closing it is a prose clause the pilot skipped. So the item stayed open through a
  successful re-spawn.
- **C2.** At 08:08 the ticket was released with no successor, and nothing named it as owed one. The successor
  lane line (`deck/lanes.mjs:136`, commit 377439c8, never-stuck-2) would have said
  `co-pilot: empty → successor itm_64084fb89990`. The running deck and hooks were the plugin cache
  (`~/.claude/plugins/cache/pilot/pilot/0.9.9`; daemon pid 5472's command line). That copy was written at
  2026-11-18 23:53 UTC, and never-stuck-2 merged into `pilot` at 2026-11-19 00:13 UTC. The version stayed 0.9.9,
  so nothing refreshed the copy. The cache's `deck/lanes.mjs` has no `successor`.
- **C3.** No owed or nag line covers an open crew-handoff (`deck/owed.mjs:15`). A session that reads one is told
  nothing about it.
- **Not recorded.** Why the successor was "made to hand back early", and what became of implementer `ae331a33`'s
  report after the 08:08 hand-off.

### 3.2 What exists

- `hooks/lib/wrapper-log.js:21` `log(text)`: timestamped text lines for the pilot's hand-off decisions
  (`lane: handed`, `mod: cleared`, `mod: submitted`). Rotation is at 512 KB. Crew steps are not logged.
  `~/.claude/pilot/deck.log` has no timestamps.
- `hooks/lib/guard-advice.js:59` `coPilotItem`: the co-pilot's crew-handoff. The ticket is only in its text.
  `hooks/context-size-guard.js:575` `announce` posts it with `deck.post`. The reply is prose (`hooks/lib/deck.js:226`).
- `deck/server-tools.mjs:440-477`: `deck_ticket` `co-pilot`/`release` through `setCoPilot`. `:384` is `deck_resolve`.
- `deck/owed.mjs:35` `owedThreadsOf` is served on `GET /api/record` and echoed by `hooks/session-handoff.js:434`
  `owedNotice` and by `pilot wait`.
- `deck/server-wait.mjs:523-546` arms the idle wake. `deck/store-tickets.mjs:387` `noteIdle` writes one deck line
  that wakes a parked wait (20 min, held tickets only).
- `hooks/post-tool.js:96` `MODULES`: one PostToolUse process, lanes as modules. `hooks/hooks.json` has no
  SubagentStop entry. `bin/pilot.mjs:493-499` shows the `pilot budget` and `pilot ready` CLI pattern.
- File caps: `deck/test/facades.test.mjs:19` caps deck files at 800 lines. `deck/items.mjs` and
  `deck/store-runs.mjs` are at 799 and `deck/store-items.mjs` at 798, so nothing is added to them. The
  crew-handoff's `ticket` is added inside the existing line 280.
- The deck already loads CommonJS through `createRequire` (`deck/daemon.mjs`, `deck/client.mjs`).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| **Trace** (`hooks/lib/wrapper-log.js`) | `log(text)`, `step(row)`, `traceFile(home?)` | the one rotation, the row's allowed fields (spec 7), the file's place (A1) | local-substitutable (home injected) |
| **Timeline** (`deck/trace.mjs`) | `timeline(rows, id, now) -> { rows, tail }`, `trace(argv)` | the step order per kind, missing-step age, stale-code line | in-process |
| **Crew hand-off** (`deck/crew-handoff.mjs`) | `openCrewHandoffsOf(items, ticketId)`, `successorOwedOf(items, repo, coPilot)`, `crewWaitOf(items, repo, coPilot, now)` | the item↔ticket join that today lives only in `pilot.md:130` prose and a title | in-process |
| **Owed threads** (`deck/owed.mjs`) | `owedThreadsOf(items, repo, coPilot?)`, `OWED_WHY` | adds `successor owed` | in-process |

Deletion test: `wrapper-log.js` survives, because its callers would each rebuild rotation. `owed.mjs` survives.
A separate `handoff-trace.js` failed the test: a second module with the same rotation, so `step` joins `log`.
No fold slice is needed.

## 4. Ubiquitous language

- **Trace row**: one JSON line, one step of one hand-off, carrying ids and times only.
- **Step**: one of the fixed names in spec 1.
- **Timeline**: a hand-off's or ticket's rows in time order, plus its tail.
- **Tail**: `waiting: <step>, <age>` or `done`.
- **Successor owed**: an open crew-handoff whose ticket has no live co-pilot.

## 5. Locked decisions

| ID | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Each step's row is written by the code that observes it: the deck for posted, granted, released, resolved, failed and started; hooks for stopped, spawned, handed, cleared and submitted. | Line 3's C1 is an agent skipping prose; a log that relies on agents has the same hole. | Agents logging steps with a tool call. |
| L3 | The deck closes a crew-handoff at the `co-pilot` grant of its ticket, not at the spawn. | The grant is a deck write the deck sees. A spawn that then fails leaves a live grant with no crew, which the 20-minute idle wake already catches (`server-wait.mjs:523`). | The spawn hook resolving it: a hook writing deck state from a prompt it parsed. |
| L4 | The ticket is read from the deck's co-pilot record (`GET /api/record?repo=`) for the hook rows, never parsed from a prompt. | Prompts are free text (07:30's was prose); spec 7 keeps them out of rows. | Regex on the Agent prompt. |
| L5 | The stale plugin cache (C2) is made visible (spec 9), not fixed. | Refreshing the installed plugin is the harness's marketplace update, outside hooks, the lane and the deck. | Copying `pilot` into the cache from the deck. |
| L6 | ADR NNNN "A hand-off is traced by what sees each step" records L1, L3 and §3.1. | The cause table is what a later reader would otherwise re-derive. | No ADR. |
| L7 | Spec 6, the wake, is in: the user's "Add line 6" on itm_c044bfef3e60. It is its own slice, S7. | Agreed by the user. | Leaving the open item to the SessionStart line alone. |

## 6. Assumed decisions

- **A1** The trace lives in `~/.claude/pilot/handoff-trace.jsonl`, beside `wrapper.log`, as one JSON row per line. Past 512 KB it is rotated to one `.old`, which keeps roughly the last 6,000 steps, weeks of runs. *Tradeoff:* Kept apart from the deck, so a hook row survives a deck that is down. The Archive page (itm_2fe34eca6f66) reads a file, not an API. *Rejected:* Rows on the deck item: lost on the guard's fail-open path, and they grow the 4.3 MB deck.json. Extending `wrapper.log` text: unstructured, clipped at 300 characters.
  Verdict: stands — no queued ticket claims a trace file; the Archive page ticket (itm_2fe34eca6f66) reads local records and can read this one
- **A2** Spec 7 and 8 bars as written. *Tradeoff:* They are the architect's bars, not the user's.
  Verdict: stands — the user saw both bars on itm_c044bfef3e60 and did not object
- **A3** The wake fires at 10 minutes, not the idle wake's 20. *Tradeoff:* A crew-handoff with no grant has nothing working on it, so waiting longer buys nothing. 10 minutes still lets a pilot mid-turn grant first. *Rejected:* 20: the 11-19 gap would have woken at 07:49 either way, but 10 halves the dead time.
  Verdict: stands — the user accepted "after 10 min" with line 6 on itm_c044bfef3e60
- **A4** (was L2) Fix and logging in one run: spec 4, 5 and 6 are built whatever else is found, the trace alongside. Line 3 found causes, so the ticket's "logging first if no cause" fork does not arise. *Tradeoff:* The run is 7 slices, not 4. The fix ships before the trace has caught a second failure. *Rejected:* Logging first, fixing after another failure: the user's preference puts hand-off fixes in the cycle.
  Verdict: stands — the user's recorded preference: hand-off fixes belong in the automatic cycle
- **A5** QA runs on a scratch deck (`pilot deck --scratch`, a free port, a temporary home) with hook payload replays, and spec 4's live leg is a paused co-pilot in a scratch pilot session. *Tradeoff:* Payload replays do not cover the harness delivering SubagentStop, which S3's probe covers once. *Rejected:* Driving a real co-pilot to 226k tokens.
  Verdict: stands — no hosted environment or migration; the spec's evidence names the scratch deck and a hook test
- **A6** Grilling depth: the user pressed "No grilling" on itm_3e146bf9a2f8. That is not locked, so A1 and A4 are stashed here and not posted. *Tradeoff:* Defaults stand unasked. *Rejected:* Posting A1 and A4 as forks.
  Verdict: stands — the user answered "No grilling" twice on itm_3e146bf9a2f8; overridden: the log home and fix scope are first seen at Gate 1

## 7. Out of scope

Refreshing the plugin cache (L5). The successor's early hand-back and the orphaned implementer's report (§3.1,
not recorded). `deck.log` timestamps. The pilot's off-rule "direct the ticket myself", which the owed line and
the lane now surface rather than forbid. A UI for the trace: that is the Archive ticket's (itm_2fe34eca6f66).

## 8. Slices

Width 3; longest stem 5

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 `pilot trace` prints a hand-off's posted row and what it waits on | 1, 2, 3, 7, 8, 10 | `hooks/lib/wrapper-log.js`, `deck/server-tools.mjs` (the posted row), `deck/trace.mjs` (new), `bin/pilot.mjs`, `hooks/test/trace-step.test.js` (new), `deck/test/trace.test.mjs` (new), `docs/adr/NNNN-crew-handoff-trace.md` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 The deck traces grant, release, resolve, the press and its own start | 1, 9 | `deck/server-tools.mjs`, `deck/server-routes.mjs`, `deck/daemon.mjs`, `deck/test/trace-deck.test.mjs` (new) | S1 (`deck/server-tools.mjs`, `step`) | typescript, security | [S2](slices/S2.md) |
| S3 Hooks trace a co-pilot's stop and its successor's spawn | 1 | `hooks/subagent-stop.js` (new), `hooks/hooks.json`, `hooks/spawn-trace.js` (new), `hooks/post-tool.js`, `hooks/test/spawn-trace.test.js` (new) | S1 (`step`) | typescript, security | [S3](slices/S3.md) |
| S4 The pilot's own hand-off steps are traced | 1 | `scripts/handoff.mjs`, `hooks/session-handoff.js`, `hooks/handoff-mod.mjs`, `hooks/test/handoff-trace.test.js` (new) | S1 (`step`) | typescript, security | [S4](slices/S4.md) |
| S5 A successor's grant closes its crew-handoff | 5 | `deck/items.mjs` (line 280 only), `hooks/lib/guard-advice.js`, `deck/crew-handoff.mjs` (new), `deck/server-tools.mjs`, `agents/pilot.md`, `deck/test/crew-handoff.test.mjs` (new) | S2 (`deck/server-tools.mjs`) | typescript, security | [S5](slices/S5.md) |
| S6 A fresh session is told a successor is owed | 4 | `deck/crew-handoff.mjs`, `deck/owed.mjs`, `hooks/session-handoff.js`, `hooks/test/successor-owed.test.js` (new) | S4 (`hooks/session-handoff.js`), S5 (`deck/crew-handoff.mjs`, the `ticket` field) | typescript, security | [S6](slices/S6.md) |
| S7 An unanswered crew-handoff wakes the pilot at 10 minutes | 6 | `deck/crew-handoff.mjs`, `deck/store-tickets.mjs`, `deck/server-wait.mjs`, `deck/test/crew-wait.test.mjs` (new) | S6 (`deck/crew-handoff.mjs`) | typescript | [S7](slices/S7.md) |

S1 is the walking skeleton. A real `deck_post` of a crew-handoff writes a real row to the real file, and
`pilot trace` prints that row and `waiting: stopped, <age>`. That proves the deck can reach the hooks' writer
through `createRequire`, and that the CLI reads with no deck running.

**Overlaps with other runs.** ci-gate S5 and recut-decision both edit `deck/server-tools.mjs`. ci-gate S7 and
recut-decision edit `agents/pilot.md`. ci-gate S2 edits `bin/pilot.mjs` (its usage block). recut-decision edits
`deck/store-tickets.mjs`. audit-f14 touches `scripts/` but none of these files. Whichever lands second rebases on
the first, and S5's `pilot.md` edit is one clause.

red team: from walking each slice's first behaviour against the files:

- `hooks/lib/deck.js:226` `post` returns prose, so a guard-written posted row could not learn the item id.
  The posted row moved to the deck's `deck_post` handler (S1), where the id is minted.
- The deck files at 799 lines leave no room for a trace call in `store-runs.mjs` or `store-items.mjs`, so every
  deck row is written in `server-tools.mjs` handlers (S1, S2, S5). S2's press row is written in
  `server-routes.mjs` (770 lines, about 30 free), with its own count in the slice.
- `deck/items.mjs` is at 799. S5 adds `TICKET_ID_FIELD` inside line 280's existing array: zero lines.
- S6's owed line first used the title to find the ticket, which would half-build the join S5 owns. It now waits
  on S5's `ticket` field.
- `OWED_WHY` is spelled twice (`deck/owed.mjs:15`, `hooks/session-handoff.js:425`), so S6 owns both.
- SubagentStop's payload fields (`agent_type`, `agent_id`) are unprobed here. S3 probes them first and stops to
  ask if `agent_type` is absent.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`, a free port, temporary home), never the deck on 4321:

1. Replay the guard with a `pilot:pilot-co-pilot` payload at 226k. `pilot trace <ticket>` prints the
   `deck started` line, then `posted`, then `waiting: stopped, 0m` (spec 1, 2, 9).
2. Stop the co-pilot (a SubagentStop payload replay), then release, grant and spawn (a real `Agent` call in a
   scratch pilot session). The timeline gains `stopped`, `released`, `granted`, `spawned`, `resolved` in order,
   and the crew-handoff card is closed as `successor granted` (spec 1, 5).
3. A second run stopped after the release: a fresh `claude` SessionStart in the scratch directory shows
   `<item> successor owed: <ticket>` (spec 4). After 10 minutes, `pilot wait` wakes with the deck line (spec 6).
4. `pilot trace` on the §3.1 fixture prints `waiting: granted, 1h05m` (spec 10). `grep` for the posted body's
   marker in the trace file finds nothing (spec 7).
5. Live, in the QA walkthrough: a paused co-pilot under a real pilot hand-off gets its successor with no press
   (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 7, 8, 10 |
| S2 | planned | | | | S1 | 1, 9 |
| S3 | planned | | | | S1 | 1 |
| S4 | planned | | | | S1 | 1 |
| S5 | planned | | | | S2 | 5 |
| S6 | planned | | | | S4, S5 | 4 |
| S7 | planned | | | | S6 | 6 |
| crew-handoff-trace | planned | feat/crew-handoff-trace | | | S1-S7 | 1-10 |
