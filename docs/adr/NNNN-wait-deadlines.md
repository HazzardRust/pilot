---
status: proposed
date: 2026-11-20
tags: [agents, hooks, deck, processes]
supersedes: []
superseded_by: []
paths: [hooks/shell-write-guard.js, deck/wait-for.mjs, deck/stalled-waits.mjs, deck/transcripts.mjs, rules/orchestration.md, docs/design/wait-deadlines/architecture.md]
---
# No agent outlives a wait that can never end

We decided that a crew wait carries its deadline in the command, never in the tool call: a file wait is
`pilot wait-for --timeout`, at most 50 minutes, whose timeout is a wake-up call the agent reports; an unbounded
loop wait is refused by the shell guard before it runs; and a stalled one that got past is stopped by the deck itself,
the wait shell only, on proof read from the process table and the deck's own registered runs.

## Context

Three agents sat in the user's agents list for up to 14 hours, each parked on a shell polling a file for a marker
that never came, with no deadline; a fourth burned 30 minutes the same way. Nothing told the user; they found them by
looking. The causes, from the transcripts read on 2026-11-20 and the agents' own reports:

| Wait | Agent | Marker and file | Why it never came | Why it outlived the agent | Source |
| --- | --- | --- | --- | --- | --- |
| A, 19/11 21:53 | implementer, audit-f14 S2 fix | `Verdict:` in a subagent's `tasks/<id>.output` | A subagent reports by message; its output file stayed 0 bytes | The tool backgrounded the call at 180 s, so its `timeout: 300000` stopped applying; the agent pushed and finished without stopping it | subagent transcript `agent-ae0452278ade1b306.jsonl` l.73-80; stopped by `TaskStop` `baambqlmv` (`itm_de18acba764b`), the holder woke with `slice/audit-f14-s2` 17788995 intact |
| B, 20/11 08:40 | rust-reviewer, rune-deck-ui S12 | `NODE-DONE` or `^# fail` in its own task output | The command never echoes `NODE-DONE`; node prints `ℹ fail 0`, not `# fail` | Backgrounded at 180 s; a pattern kill hit a transient `grep`, not the loop | subagent transcript `agent-a74c7de1fde395ad7.jsonl` l.35-44; stopped by `TaskStop` `be7fnv83z` (`itm_de18acba764b`), the holder woke and delivered its verdict about 5 h late |
| C, 20/11 08:55 | implementer, S8 (no Monitor) | `^exit` in `/tmp/s8-npm.log` | The log never prints a line starting `exit` | Ended by the pilot by hand; the agent then resumed and finished | the implementer's friction row on the ticket; the shell was gone, no transcript read |
| D, 20/11 | QA, human-steps (has Monitor) | CI state, in a Monitor loop | The loop's condition could never be true | Bounded only by Monitor's 30-minute timeout; the agent was listed as waiting after its hand-back | QA hand-back for gate2 `itm_7a192fe141af` |

The common cause is an improvised poll on a string nobody checked would ever appear, a deadline held by the tool
call rather than the command and lost at the 180-second auto-background, and an agent ending with its shells live.
No classifier was involved: no classifier log exists (`deckDir()/classifier.log` is absent) and no deck thread was
open at those times. No crew prose told an agent to poll this way; every loop was improvised. Stopping the shell
alone woke holders A and B within a minute with their work intact.

## Decision

- **L1 Depth forks** (`itm_eb046c6dfa80`): questions only where paths give different deliverables; no Gate 1 walk.
- **L2 The bound lives in the command, never the tool call.** Waits A and B show the tool backgrounds at 180 s and
  drops its `timeout`, so neither `tool_input.timeout` nor Monitor's timeout counts as a bound.
- **L3 One guard, two rules.** The loop rule joins `hooks/shell-write-guard.js`'s `decide`, reusing its tokeniser and
  `isPilotLane`.
- **L4 Deny the recognised shape only, fail open.** A parse error or an unknown shape runs. The reason names the
  replacement for the case: `pilot wait-for` for a file, the completion notification for a subagent (its `.output`
  file is not its report), `run_in_background` and end the turn for a test run.
- **L5 The scan reuses `gc`.** Rows take `gc`'s shape with `orphan: 'stalled <n> min'`; there is no second kill path.
  A shell row is stopped with `killTree`, the loop and its children.
- **L6 Proof before a stop.** All of: the row is `bash` or `sh`; its `-c` script parses as an unbounded wait by
  `unboundedWaits`; its nearest `claude` ancestor is the parent of a live registered run's pid (`listLiveRuns`); its
  age is at least the stall age. Anything unsure is not stopped. The kill follows the read in the same tick.
- **L7 The line routes by run.** The deck line goes through `noteDeck` on the proving run's repository's live ticket,
  else its chat item; no run, no stop.
- **L8 Untrusted text stays data.** The hook and the scan tokenise; nothing is evaluated or spawned from a command.
  `wait-for` opens the file read-only, matches line by line and caps `--match` at 200 characters; a bad regex is
  exit 1.
- **L9 Bash only.** PowerShell waits are out of scope; every wait in evidence was bash.
- **L10 The rule for agents lives in `rules/orchestration.md`** ("Waits end by themselves"), which every crew agent
  loads, reviewers included (wait B was a reviewer's), so one place cannot drift and no agent file is edited.
- **L11 This ADR** carries the cause table.
- **A1 The deck stops a stalled wait itself**, on L6's proof, and notes the pilot (`itm_a80063da6998`).
- **A2 The wait shell only**: the holder resumes on its exit with its work intact (`itm_85390435bb33`).
- **A3 Hook refusal plus `pilot wait-for`** (`itm_e481d11f4790`); a timeout is a wake-up call, after which the agent
  waits again, carries on or hands back, and each wait is a numbered report row.
- **A4 50 minutes** (`itm_c71984dbc9b7`) for `--timeout`'s maximum and the stall age, one constant per module
  (`MAX_WAIT_MINUTES`, `STALL_AGE_S`): the agent wakes inside the one-hour prompt cache, as `pilot wait` already does,
  and a long real wait is a reported chain of 50-minute waits. A `timeout <n>` over 3000 s is no bound.
- **A6 The holder is named from transcripts** by `holderOfCommand`, `unknown` when none or several match.

## Rejected

- *Instructions only*: four improvisations already ignored the absence of a rule, and no test can hold prose
  (ADR 0180).
- *A second hook file with its own tokeniser*: two shell parsers drift.
- *The pilot runs `pilot gc` on a stalled wait*: the classifier has refused that as a pattern kill before.
- *Stopping the holding agent too*: it loses unpushed work.
- *A ledger the hook writes per Bash call to name the holder*: a write on the hottest path.
- *120 minutes*: the agent wakes after the cache is cold. *30 minutes*: under a slow full suite plus queueing.
- *Fixing the classifier path*: none of the four causes involves the classifier or a deck thread.

## Consequences

- An agent that needs a wait longer than 50 minutes wakes once per 50 and says so in its report.
- A refusal can misfire on a loop that is in fact bounded some other way; L4 keeps that to recognised shapes.
- A stalled wait is gone within 55 minutes of starting (the 50-minute stall age plus the 5-minute scan), with one
  deck line naming its pid, marker, holder and age.
- The scan reads the undocumented transcript format to name a holder, as `deck/transcripts.mjs` already does.
- PowerShell and Monitor loops stay unguarded; Monitor carries its own timeout.
