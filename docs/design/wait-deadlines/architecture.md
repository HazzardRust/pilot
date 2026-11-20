# wait-deadlines: no agent outlives a wait that can never end

Ticket `itm_b760c7076c51`. Base `pilot` (via `feat/human-steps` b98a125c). Grilling depth: forks (`itm_eb046c6dfa80`).

## 1. Problem

The user found three agents in the agents list that would not die, each parked on a shell running
`until grep -q <marker> <file>; do sleep N; done` with no deadline, for up to 14 hours, on markers that never came.
They found them by looking; nothing told them. A fourth (QA, 2026-11-20) burned 30 minutes on a loop that could never
match. The ask: find why, make every crew wait end by itself and say so, and have a wait already stuck seen and ended
without the user hunting for it.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | The cause of each recorded stalled wait is stated from evidence, or "no record". | §3 cause table and the ADR: 4 rows, each with marker, why it never came, source; 0 blank cells. |
| 2 | A pilot-lane `Bash` call holding an `until`/`while` loop that sleeps, with no `timeout <n>` bound on it, is refused before it runs, the reason naming `pilot wait-for`. | Hook test: ≥6 unbounded shapes denied, `pilot wait-for`, `timeout 600 bash -c '…'` and `for i in $(seq 60)` allowed; a lint over `agents/ skills/ rules/ scripts/` finds 0 unbounded loops. |
| 3 | `pilot wait-for --file F --match RE --timeout M` ends by itself: exit 0 printing the first matching line, or exit 2 printing `timed out waiting for <RE> in <F> after <M> min`. | CLI test: marker written after 50 ms → exit 0 and the line; never written, `--timeout 0.02` → exit 2 and that line in at most two seconds; no `--timeout`, or one over 120 → exit 1. |
| 4 | A wait that times out is reported: the agent's report carries a `timed out waiting for <marker>` row, then it carries on or hands back. *assumed (A3)* | QA run on a scratch deck: an implementer brief whose marker never comes; its report holds exactly one such row. |
| 5 | A stalled wait is seen and ended without the user: a shell under a pilot session whose command is an unbounded wait loop, older than 120 min, is stopped by the deck itself, and the pilot gets one deck line `stopped stalled wait <pid> "<marker>" held by <agent\|unknown> for <age>`. *assumed (A1, A4, A6)* | Unit test over a fake process table: exactly one stop and one line; QA: a planted loop under a scratch session is gone after one scan tick and the line is on the deck. |
| 6 | Ended means the wait shell and nothing else: no agent, `claude`, `node`, `git` process or worktree is stopped; the agent resumes on its shell's exit with its work intact. *assumed (A2)* | Unit test: over a table holding every kind, the stop set holds zero rows but the loop shells; QA: the planted loop's parent session still answers. |
| 7 | An agent stops each background wait it started (`TaskStop` by id) before its final hand-back. | Read: the rule in `rules/orchestration.md`, one bullet; line 5 is the backstop. |
| 8 | practitioner: incident replay — the recorded loop commands (A, B verbatim from their transcripts; C as the ticket records it) are each refused by the hook, and A and B's live process rows are recognised by the scan. | Hook test: three of three denied; scan test: two of two rows recognised. |
| 9 | practitioner: SRE (a watchdog trusts the process table, not a self-report) — the scan's proof is read from the OS process table and the deck's own registered runs, never from anything the shell or agent says. | Unit test: a loop shell whose `claude` ancestor is not the parent of a live registered run's pid gets zero stops. |

Draft line 5 (fix the classifier path) is dropped: none of the four causes involves the classifier or a deck thread (§3).

## 3. Findings

**Cause table** (spec 1; evidence from transcripts read 2026-11-20 and the agents' own reports).

| Wait | Agent | Marker and file | Why it never came | Why it outlived the agent | Source |
| --- | --- | --- | --- | --- | --- |
| A, 19/11 21:53 | implementer, audit-f14 S2 fix | `Verdict:` in a subagent's `tasks/<id>.output` | A subagent reports by message; its output file stayed 0 bytes | Tool backgrounded it at 180 s, so its `timeout: 300000` stopped applying; the agent pushed and finished, never stopped it | `…/6aa1c273…/subagents/agent-ae0452278ade1b306.jsonl` l.73-80 |
| B, 20/11 08:40 | rust-reviewer, rune-deck-ui S12 | `NODE-DONE` or `^# fail` in its own task output | The command never echoes `NODE-DONE`; node prints `ℹ fail 0`, not `# fail` | Backgrounded at 180 s; `pkill -f "grep -q NODE-DONE"` killed a transient grep, not the loop | `…/4f2e1278…/subagents/agent-a74c7de1fde395ad7.jsonl` l.35-44 |
| C, 20/11 08:55 | implementer, S8 (no Monitor) | `^exit` in `/tmp/s8-npm.log` | The log never prints a line starting `exit` | Ended by the pilot by hand; the agent then resumed and finished | implementer friction row (ticket comment); shell no longer alive, no transcript read |
| D, 20/11 | QA, human-steps (has Monitor) | CI state, Monitor loop | Loop condition could never be true | Bounded only by Monitor's 30-min timeout; agent listed as waiting after its hand-back | QA hand-back for gate2 `itm_7a192fe141af` |

Common cause: an improvised poll on a string nobody checked would ever appear, plus a deadline held by the tool call
rather than the command (lost at the 180 s auto-background), plus an agent ending with its shells live. No classifier
log exists (`deckDir()/classifier.log` absent); no deck thread at those times.

**What exists**

- `hooks/shell-write-guard.js` (265 lines): PreToolUse on `^Bash$` (`hooks/hooks.json:75-86`), its own shell tokeniser
  (`tokens` :48, `commands` :113, `program` :127; `while`/`until` only in `KEYWORDS` :28), `isPilotLane` from
  `hooks/permission-denied.js:44`, denies with `permissionDecision: 'deny'`, fails open (:226-247). No loop rule.
- `deck/procs.mjs` `processTable` (pid, ppid, name, command, ageS; one CIM query on win32) and `pilotProcesses`
  (node rows only); `deck/gc.mjs` `gc(owned, {kill})` stops rows carrying an `orphan` reason, one line each.
  A bash loop is invisible to both today. On win32 a Claude Code shell is a `bash.exe` pair (Git `bin\bash.exe`
  parent, `usr\bin` child) under the session's `claude` process.
- `deck/store-runs.mjs:321` `listLiveRuns()`: each registered run's `repo` and `pid`, the pid of the session's
  stdio deck client, a child of its `claude` process (`deck/runs.mjs:1-18`). (`posted-<pid>` stamps in
  `deck/run-claim.mjs` exist only after a chained hand-off, so they are no proof of a session.)
- `deck/store-items.mjs:468` `noteDeck(id, text)`: a `from: 'deck'` line that wakes a parked `pilot wait`
  (ADR 0193 L7).
- `deck/transcripts.mjs`: the one transcript reader (ADR 0042); returns needle matches, never tool text (L5).
- `deck/wait.mjs`: `pilot wait` already has a deadline (50 min default, `NO REPLY after N minutes`).
- `agents/pilot-implementer.md:5` has no `Monitor`; it and QA have `TaskStop` (ADR 0196 A3: stops by id only;
  the classifier refused pattern kills).
- No crew prose tells an agent to `until grep`; every loop was improvised.
- `deck/server-wait.mjs` is at 796 of `facades.test`'s 800-line cap: nothing new goes there.

**Seams** (deepening pass)

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Shell guard (`hooks/shell-write-guard.js`) | `decide(payload, deps)`, `writeTargets(command, cwd)`, `unboundedWaits(command)` | both rules on one tokeniser; the loop rule's shape recognition, shared by the scan and the lint | in-process, pure |
| Bounded wait (`deck/wait-for.mjs`) | `waitFor({ file, match, timeoutMin, read, now, sleep })`, `main(argv)` | polling, the deadline, the exit codes and the timeout line | local-substitutable (fs, clock) |
| Stalled-wait scan (`deck/stalled-waits.mjs`) | `stalledWaits(table, { runs, now, holder })`, `reapStalled({ read, runs, kill, note })` | shell-row recognition, the R1 proof, the age bar, routing the line by run; stops through `gc` | true external (process table, kill) behind injected adapters |
| Holder (`deck/transcripts.mjs`) | `holderOfCommand(needle, { projectsRoot })` | which subagent transcript ran a command | local-substitutable (a fixture dir) |

Deletion test: `stalledWaits` stays separate from `pilotProcesses` (different rows, different proof) but its rows
take `gc`'s shape so `gc` does the stop and the line, not a second kill path. `waitFor` is not folded into `wait.mjs`:
that one long-polls the deck, this one reads a file.

## 4. Ubiquitous language

- **Wait**: a shell command whose only job is to block until a marker appears.
- **Marker**: the string or pattern a wait looks for.
- **Bound**: a deadline carried by the command itself (`pilot wait-for --timeout`, `timeout <n>`), not by the tool call.
- **Unbounded wait**: an `until`/`while` loop that sleeps with no bound.
- **Stalled wait**: an unbounded wait shell older than the stall age (120 min).
- **Holder**: the agent whose tool call started a wait.

## 5. Locked decisions

- **L1 Depth forks** (`itm_eb046c6dfa80`): questions only where paths give different deliverables; no Gate 1 walk.
- **L2 The bound lives in the command, never the tool call.** Evidence A and B: the tool backgrounds at 180 s and
  drops its `timeout`. Rejected: trusting `tool_input.timeout` or Monitor's timeout as a bound.
- **L3 One guard, two rules.** The loop rule joins `shell-write-guard.js`'s `decide`, reusing its tokeniser and
  `isPilotLane`. Rejected: a second hook file with a second tokeniser (two parsers drift).
- **L4 Deny the recognised shape only, fail open** (R4, ADR 0010's caution): a parse error or an unknown shape runs.
  The reason names the replacement for the case: `pilot wait-for` for a file, the completion notification for a
  subagent (its `.output` file is not its report), `run_in_background` and end the turn for a test run.
- **L5 The scan reuses `gc`.** Rows take `gc`'s shape with `orphan: 'stalled <n> min'`; no second kill path.
  A shell row is stopped with `killTree` (the loop and its `sleep`/`grep` children).
- **L6 Proof before a stop (R1, R2, spec 9).** All of: the row is `bash`/`sh`; its command's `-c` script parses as an
  unbounded wait by `unboundedWaits`; its nearest `claude` ancestor is the parent of a live registered run's pid
  (`listLiveRuns`); `ageS` ≥ the stall age.
  Anything unsure is not stopped. The kill follows the read in the same tick; no re-read (pid reuse within
  milliseconds of a 2 h process is accepted).
- **L7 The line routes by run.** The deck line goes through `noteDeck` on the proving run's repository's live ticket,
  else its chat item (ADR 0031); no run, no stop.
- **L8 Untrusted text stays data (R5, R6).** The hook and the scan tokenise; nothing is evaluated or spawned from a
  command. `wait-for` opens the file read-only, matches line by line, caps `--match` at 200 characters; a bad regex
  is exit 1.
- **L9 Bash only.** PowerShell waits are out of scope (§7); the crew's waits in evidence were all bash.
- **L10 The rule for agents lives in `rules/orchestration.md`**, which every crew agent loads, reviewers included
  (wait B was a reviewer). Not in each agent file: project-glossary is editing those, and one place cannot drift.
- **L11 The run's ADR** is `docs/adr/NNNN-wait-deadlines.md` (S5), carrying the cause table.

## 6. Assumed decisions

- **A1 The deck stops a stalled wait itself** (`itm_a80063da6998`). Default: the daemon's scan stops it on L6's proof
  and notes the pilot. Tradeoff: shipped code stops a process with no classifier or human in the loop. Rejected: the
  deck notices and the pilot runs `pilot gc`, which the classifier has refused as a pattern kill before.
- **A2 Stop the wait shell only** (`itm_85390435bb33`). Default: the shell; the holder resumes on its exit, unpushed
  work intact. Tradeoff: a holder that is itself stuck stays; the co-pilot's 90-min child rule covers it. Rejected:
  stopping the agent too, which loses unpushed work.
- **A3 Hook refusal plus `pilot wait-for`** (`itm_e481d11f4790`). Default as spec 2-4. Tradeoff: a refusal can
  misfire (L4 limits it). Rejected: instructions only, which four improvisations already ignored and no test can hold
  (ADR 0180).
- **A4 120 min** for `--timeout`'s maximum and the stall age (`itm_c71984dbc9b7`). Tradeoff: a stuck wait lives up to
  2 h. Rejected: 30, which is under a slow full suite plus queueing.
- **A5 QA on a scratch deck with planted processes** (`itm_b788644fdd9c`). Rejected: also report-only on the live deck.
- **A6 The holder is named from transcripts.** Default: `holderOfCommand` finds the subagent transcript whose Bash
  call holds the loop's marker and file, returning its agent type and id; `unknown` when none or several match.
  Tradeoff: reads the undocumented transcript format (as `transcripts.mjs` already does). Rejected: a ledger the
  hook writes per Bash call (a write on every call, the hottest path); no name at all (spec 5 asks for it).

## 7. Out of scope

- PowerShell and Monitor-tool loops (L9; Monitor carries its own timeout); `pilot wait` (already bounded).
- Stopping an agent; any process outside a stamped pilot session.
- The 180 s auto-background itself (the harness's).
- Adding `Monitor` to the implementer's tools.

## 8. Slices

Width 3; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A wait on a file ends by itself and says so | 3 | `deck/wait-for.mjs` (new), `deck/test/wait-for.test.mjs` (new), `bin/pilot.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 | An unbounded wait loop is refused before it runs | 2, 8 | `hooks/shell-write-guard.js`, `hooks/test/wait-guard.test.js` (new), `scripts/test/wait-deadline-lint.test.mjs` (new) | – | typescript, security | [S2](slices/S2.md) |
| S3 | The deck stops a stalled wait and tells the pilot | 5, 6, 8, 9 | `deck/stalled-waits.mjs` (new), `deck/daemon.mjs`, `deck/test/stalled-waits.test.mjs` (new) | S2 (`unboundedWaits`) | typescript, security | [S3](slices/S3.md) |
| S4 | The stalled-wait line names the agent that started it | 5 | `deck/transcripts.mjs`, `deck/stalled-waits.mjs`, `deck/test/wait-holder.test.mjs` (new) | S3 (`deck/stalled-waits.mjs`) | typescript, security | [S4](slices/S4.md) |
| S5 | Every crew agent is told how to wait and what a timeout means | 1, 4, 7 | `rules/orchestration.md`, `docs/adr/NNNN-wait-deadlines.md` (new) | – | security | [S5](slices/S5.md) |

Walking skeleton: S1, the bounded wait every other slice points agents to.

red team: (1) S3's first behaviour against the real row: the win32 `CommandLine` of a Claude Code shell wraps the
loop in an `eval '…'` inside a `-c` string; a parser fed the whole line misreads it. S3 now owns extracting the `-c`
script and its first test uses the two live rows of waits A and B as captured (§3), not a hand-written line.
(2) S2 and S3 each half-building recognition: moved all shape recognition into S2's `unboundedWaits`; S3 only calls
it. (3) S3's proof: the first cut took `posted-<pid>` stamps as proof of a pilot session; `deck/client.mjs:505-520`
writes them only after a chained hand-off, so most sessions have none. L6/L7 now prove and route by a registered
run's pid (`listLiveRuns`). (4) S5 editing agent files would collide with project-glossary; moved to `rules/` (L10).
(5) `server-wait.mjs` at its 800-line cap: S3 wires its timer in `daemon.mjs`.

## 9. Acceptance evidence

1. The cause table (§3, ADR): 4 rows, no classifier.
2. In a scratch session, an implementer-lane `until grep -q x f; do sleep 5; done` is refused naming `pilot wait-for`.
3. `pilot wait-for --file f --match x --timeout 0.05` prints `timed out waiting for x in f after 0.05 min`, exit 2.
4. A scripted agent whose marker never comes reports the `timed out waiting for` row.
5. A planted loop under a scratch session is gone after one scan, the deck line names it, the session still answers.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/wait-deadlines-s1` | – | – | – | 3 |
| S2 | planned | `slice/wait-deadlines-s2` | – | – | – | 2, 8 |
| S3 | planned | `slice/wait-deadlines-s3` | – | – | S2 | 5, 6, 8, 9 |
| S4 | planned | `slice/wait-deadlines-s4` | – | – | S3 | 5 |
| S5 | planned | `slice/wait-deadlines-s5` | – | – | – | 1, 4, 7 |
| wait-deadlines | planned | `feat/wait-deadlines` | – | – | S1-S5 | 1-9 |
