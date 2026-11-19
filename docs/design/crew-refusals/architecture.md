# Crew commands auto mode refuses

Ticket `itm_64084fb89990` · slug `crew-refusals` · base `feat/crew-refusals` off `pilot` (fa28b73b) · grilling depth *forks* (itm_a25a186d412e) · merged: none (merge thread `itm_26e863f3267c`)

## 1. Problem

In one evening the user was handed three blocked steps from one implementing run (yellow-never-idle), each a crew
agent's command that auto mode refused, each costing a press: "we are getting so many blocking steps from the
classifier, is there anything we should do?" The agreed answer: change the crew's habits, not the classifier or any
permission setting. Each fix removes the risky action itself. On the first gate1 the user added: "there should be
logging for the classifier and how many times it fired and what for, so that the audit agent is able to pick up on
the stuff we did and make changes to the codebase being worked on such as the ones we have just planned" (spec 6, 7).

| Thread | Agent | Command (shape) | Reason |
| --- | --- | --- | --- |
| itm_e558b897c6e5 | pilot-evidence-runner | `export HOME=$S USERPROFILE=$S PILOT_DECK_DIR=$S/deck; npx c8 … npm test && uvx diff-cover …` | Undermining Oversight |
| itm_5ba0526f7455 | typescript-reviewer | `git show HEAD:deck/agents.mjs > deck/agents.mjs; node --test …; git checkout -q -- deck/agents.mjs` in the fix worktree | Destructive or Unwanted Actions |
| itm_2a1383d712e2 | pilot-implementer | `pkill -f "npm test" ; pkill -f "node --test" ; sleep 1; cd … && grep …` | Destructive or Unwanted Actions |

They are habits, not accidents. Of the deck's 178 `Blocked:` items, the coverage cell was refused 3 of 3 times
(11-16, 11-18, 11-19), a reviewer mutating a writer's worktree 4 times (11-17 twice, 11-18, 11-19), a pattern or
bundled kill 3 times.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | The evidence runner's table runs with no `HOME`, `USERPROFILE` or `PILOT_DECK_DIR` in any cell, and none of its six Node checks is refused by auto mode. | `grep -c 'HOME=' agents/pilot-evidence-runner.md`; QA's run of the table in the scratch repo (L7). | 0 lines; 0 blocked steps of 6 checks. |
| 2 | Inside a `node --test` run, the deck store refuses to resolve the user's real store (`<os.userInfo().homedir>/.claude/pilot`, which no env var moves) and throws, naming it; a test's own store still resolves. *assumed (A1)* *practitioner: a test engineer makes tests hermetic by construction and fail-closed, not by the caller's environment.* | `hooks/test/deck-dir-guard.test.js` on `deckDir`. | 1 throw on the real path; 0 on a temp `PILOT_DECK_DIR` or a redirected home. |
| 3 | No crew agent writes, checks out, stashes, resets or restores a tracked file in a worktree it did not create; a red-then-green proof runs in a detached throwaway worktree the agent creates and removes. *assumed (A2)* | `missingShellRules(agents/)` → `[]`; the implementer's reviewer brief says it; QA's reviewer proof leaves the writer's `git status --short` unchanged. | 22 of 22 shell agents; 0 changed status lines. |
| 4 | No crew agent kills by name or pattern (`pkill -f`, `taskkill /IM`) or bundles a stop with another command; it stops only what it started, by its id (a background run's id with `TaskStop`, or the PID it started), in a call of its own. *assumed (A3)* | `missingShellRules(agents/)` → `[]`; `pilot.md:159` and `pilot-co-pilot.md:100` carry the rule, not a second wording; QA's implementer test stop. | 22 of 22; 0 blocked steps for the stop. |
| 5 | The closing report counts the ticket's blocked steps by agent and reason, so a new habit shows up; it reads them from the classifier log (spec 6). | `deck/test/closing-report.test.mjs`: two log entries for the ticket from two agents → `Blocked steps: 2` and two rows; none → `Blocked steps: none`. | 2 rows; 1 line at 0. |
| 6 | "there should be logging for the classifier and how many times it fired and what for" (the user, on gate1 `itm_7d7acc69e969`): every auto-mode denial is appended durably to the classifier log with when, repo, ticket, agent, reason, tool and command, in any session on this machine; a no-verdict is tagged; a command holding a credential is withheld. *assumed (A4, A5)* | `deck/test/classifier-log.test.mjs` on `appendRefusal`/`readRefusals`; `hooks/test/permission-denied.test.js`: a main-session denial outside a run → 1 log line, 0 posts. | 1 line per denial; 0 credential values on disk. |
| 7 | "so that the audit agent is able to pick up on the stuff we did and make changes to the codebase": the audit counts the repo's refusals by agent and reason, groups recurring command shapes, and reports each recurring habit as a row with the command that measured it and a ticket-ready spec, so the user can pick it as a ticket. *assumed (A5)* *practitioner: an SRE turns a recurring alert into a ranked toil ticket, from the raw log.* | `scripts/test/audit-refusals.test.mjs` on `refusalRows`: the 3 refused shapes of §1 seeded 3 times each → 3 rows; `skills/audit/areas/refusals.md` names the command. | ≥3 of one shape = 1 row; 2 = none. |

Draft line 3 (kill rule) is split from line 2 (worktree rule) as spec 3 and 4; the draft's line 1 gains spec 2,
the guard that makes dropping the exports safe. Spec 6 and 7 came from the user on the first gate1 (re-cut). The log
records refusals only: nothing in it approves, retries or pre-clears a command (L1), and the auditor still changes
nothing in the repository. Cannot mean here: a pin-free prose change (L5).

## 3. Findings

**Evidence runner.** `agents/pilot-evidence-runner.md:60-65`: every one of 42 cells sets the three vars; `:74-85` the
mutation-safety rule, which the real guard is: state modules (`deck/store-dir.mjs`, `hooks/lib/deck-secret.js`,
any file matching `homedir|USERPROFILE|process\.env\.HOME|PILOT_DECK_`) are never mutated.
- `deck/testUtils.mjs:23-30` already redirects `HOME`/`USERPROFILE` to a suite home per test file and **deletes
  `PILOT_DECK_DIR`**, so in any file importing it the runner's exports change nothing. `tempDeck` (`:68`) asserts the
  store resolves under its own dir (the 2026-09-14 incident).
- `hooks/lib/deck-secret.js:30` `deckDir()`: `PILOT_DECK_DIR || ~/.claude/pilot`; `deck/store-dir.mjs:20` `storeDir()`
  delegates to it; `deck/doctor.mjs:32` imports it. `defaultStoreDir()` (`store-dir.mjs:12`) is the display default, not
  the path the store writes.
- Other `~/.claude/pilot` paths (`hooks/context-usage-alert.js:56`, `-statusline.js:46`, `hooks/lib/wrapper-log.js:23`,
  `scripts/{reach,live-root,integrate,install-command,apply-reach,uninstall}.mjs`) are not the deck store; each matches
  the state-module grep, so the mutation rule keeps them unmutated (A1 tradeoff).
- `node --test` sets `NODE_TEST_CONTEXT` in every test-file child; c8 → `npm test` → `scripts/gate.mjs` → `node --test`
  and Stryker's `node --test $TESTS` both reach it. `gate.mjs` itself (the parent) reads the real deck's pid on purpose.

**Reviewer proof.** No reviewer definition asks for one; the reviewer chose it. `agents/pilot-implementer.md:123-125`
gives each reviewer "your worktree's path … it runs tests there and installs nothing". The 4 refusals all mutate a
writer's worktree (`git show … > file`, `git checkout -- deck`, `git stash`, `checkout --detach`).

**Kills.** `agents/pilot-implementer.md:101-105` and `agents/pilot-qa.md:113-116` ban image-wide kills for a browser
only; `agents/pilot.md:159` and `agents/pilot-co-pilot.md:100` ban "a kill bundled with a read". The implementer has no
`TaskStop`; the co-pilot does (`:120`). `TaskStop` reaches only the caller's own background runs, refusing another's as "… is owned by …; agent …
cannot stop it" (`docs/design/architect-deeper/run.json:121-122`, `blocked-steps/run.json:265-266`); a detached
process's background run exits at once (`co-pilot-tickets-history/run.json:141`), so it is stopped by its PID.
`deck/test/ticket-live-scope.test.mjs:84` pins the pilot's and co-pilot's tool lines.

**Closing report.** `deck/closing-report.mjs:81` `closingReportOf(record, gate, left, closes)`; body lines `:89-110`;
items picked by `ticket` and repo (`:34-35`), no time window. Nothing counts `Blocked:` items or parses `Agent:` /
`Reason:` (written by `hooks/lib/blocked.js:107-113`). Tests: `deck/test/closing-report.test.mjs` (`aSignedGate2` `:51`).

**Refusal capture (re-cut).** `hooks/permission-denied.js:55` `onDenied` returns at once unless `isPilotLane`; file
tools are skipped (`:57`); `postBlocked` (`hooks/lib/blocked.js:142`) posts only with a live run in the repo and keeps
nothing when the deck does not answer (`:11`), and a first no-verdict posts nothing (blocked-steps L1). Its header
(`:18-19`) rejected a log line as "a second copy that no check reads": the log now has readers and runs the deck's
credential check, `findCredential` (`deck/store-core.mjs:106`, ESM; the CJS hook reaches it by dynamic `import()`).
Precedent for a log beside the store read by the audit: the daemon's usage log and `scripts/audit-spend.mjs` (ADR 0043).
The audit reads every `skills/audit/areas/*.md` in name order (`agents/pilot-auditor.md:63-70`); an area file is
frontmatter (`area`, `owner`, `spec`), `## Measure`, `## Rows`; a row carries its command and output. The deck has
178 `Blocked:` items today (the backfill source is out of scope, §7).

**Shell agents.** 22 of 25 definitions have `Bash` or `PowerShell` (all but `code-explorer`, `docs-lookup`,
`pilot-fact-sheet`), 9 of them vendored reviewers/resolvers with provenance headers. Prompt pins:
`scripts/test/measure-prompt.test.mjs` (pilot 11871, ~21 tokens headroom; architect; explorer; QA).

**Overlap.** Signed and queued ahead: audit-f14 (`agents/pilot.md`, `agents/pilot-lander.md`, `deck/closing-report.mjs`,
`deck/store-items.mjs`), handoff-cache (`agents/pilot.md` in its S6, `bin/pilot.mjs`); yellow-never-idle near landing.
S2 rebases on `pilot` for `agents/pilot.md` and `agents/pilot-lander.md`; S3 rebases on `pilot` after audit-f14 lands
`deck/closing-report.mjs` (if S3 integrates first, audit-f14 takes the rebase).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deckDir` (`hooks/lib/deck-secret.js`) | `deckDir(): string`, throws `Error` naming the path when `NODE_TEST_CONTEXT` is set and the result is the user's real store | the test-run guard; the real-home lookup via `os.userInfo()` | in-process (env read at call time) |
| `shell-rules` (`scripts/shell-rules.mjs`, new) | `SHELL_RULES: readonly string[]`; `missingShellRules(dir): { agent, rule }[]` | which definitions have a shell (their `tools:` line) and the one wording both rules have | local-substitutable (an agents dir) |
| `classifier-log` (`deck/classifier-log.mjs`, new) | `appendRefusal(entry, { dir?, now? }): void`; `readRefusals({ dir?, ticket? }): Refusal[]`; `WITHHELD`; `Refusal = { when, repo, ticket, agent, reason, tool, command, verdict: 'refused' \| 'no-verdict' }` | file path under `deckDir()`, JSON lines, the credential withhold, the 300-char clip, the 10,000-line cap, torn-line skip | local-substitutable (`dir`) |
| `blockedStepLines` (`deck/closing-report.mjs`) | `blockedStepLines(refusals): string[]`; `closingReportOf` body gains them | grouping by agent and reason, order | in-process |
| `refusalRows` (`scripts/audit-refusals.mjs`, new) | `commandShape(command): string`; `refusalRows(refusals, { min? }): AuditRow[]`; CLI `node scripts/audit-refusals.mjs <repo> [--log <file>]` → JSON | counts, shape grouping, the recurrence bar, row text | in-process |

Deepening: deleting `deckDir`'s guard leaves each test file to isolate itself, which is today's gap; it stays in the one
function every store path reaches. Deleting `shell-rules` puts the shell-agent list and the wording into the test and
any future check: kept as one small module. Deleting `classifier-log` puts the path, format, redaction and cap into
the hook, the report and the audit script, three copies: it earns its keep (two readers, one writer). `blockedStepLines`
is a function of the report module: one caller. No fold changes code beyond these; no fold slice.

## 4. Ubiquitous language

- **Refusal**: auto mode denies a call with a verdict (`[Undermining Oversight]` …); a blocked step for the user.
- **Real store**: `<os.userInfo().homedir>/.claude/pilot`, the user's own deck, which a test run (a process under
  `node --test`, `NODE_TEST_CONTEXT` set) may not resolve.
- **Writer's worktree**: a worktree an agent other than you writes in (the implementer's, the fix worktree, QA's).
- **Throwaway worktree**: a detached worktree you create for one proof and remove after it.
- **Shell rules**: the two sentences in `SHELL_RULES`, carried by every shell agent.
- **Classifier log**: `<deckDir()>/classifier.log`, one JSON line per auto-mode denial; a record, never a permission.
- **Command shape**: a command reduced to each part's program and first word or flag (`export HOME`, `pkill -f`).

## 5. Locked decisions

- **L1 Habits change, permissions do not.** No slice edits a permission setting, an allowlist, an auto-approving hook
  or `CLAUDE.md` to let a refused command through; no slice obfuscates, splits or rewords a command so the same action
  passes unjudged. Each fix removes the risky action: the store isolation without redirecting the shell's home, the
  proof without mutating a written worktree, the stop without a pattern kill. Rejected: allow rules (blocked-steps L4's
  list), which would hand the classifier's job to a list.
- **L2 The `deckDir` guard is a refusal inside the code, not a way past the classifier.** It removes the reason a
  shell ever redirected its home; QA's count of 0 blocked steps is evidence the habit changed, not the goal.
  Rejected: a `PILOT_DECK_DIR=…` prefix per command, which `testUtils.mjs:30` deletes, so it would only reword.
- **L3 A refused command stays the user's decision.** The blocked-step path (`hooks/lib/blocked.js`, the co-pilot's
  hand-back) is unchanged.
- **L4 One wording, in every shell agent.** `SHELL_RULES` is the text; each definition carries it verbatim, so a grep
  and one test prove it. Rejected: a rules file loaded by every session (`rules/`), which costs every main session too
  and lands in the user's own rules; phrase variants per agent.
- **L5 Pins are raised, dated, by at most the rule's own tokens** per agent; no other prose is trimmed to make room.
- **L6 ADR NNNN** (`docs/adr/NNNN-crew-refusals.md`, S1) records L1, L2, A1-A3.
- **L7 QA environment** (the user, `itm_a50c39613430`): this machine with auto mode on, a scratch repo and a scratch
  deck. QA runs the evidence runner's table, one reviewer proof and one implementer test stop there and counts blocked
  steps; the real deck store and live worktrees are not touched.
- **L8 Small-diff limit 300 changed lines per slice**; past it the implementer stops and asks `main`.
- **L9 The classifier log is a record, not a permission.** Nothing reads it to approve, retry, pre-clear or reword a
  command; the hook's return stays null and the blocked-step post is unchanged (L3). The auditor reads it and still
  changes nothing in the repository; a habit it finds becomes a ticket only when the user picks the row. Rejected: a
  log the hooks consult to suppress repeats, which would hand a refusal's judgement to a counter.

## 6. Assumed decisions

- **A1 Store isolation by a guard in `deckDir`** (`itm_6da59f1daeb7`). Default: inside a test run `deckDir()` throws on
  the real store; the runner drops all three exports in every column. Tradeoff: a test-only branch in a state module
  (never mutated); other `~/.claude/pilot` files rest on the mutation rule and `testUtils`' suite home, as today.
  Rejected: `gate.mjs` sets a scratch home in its spawn env (misses Stryker's direct `node --test`, moves every gate's
  home); a `PILOT_DECK_DIR` prefix (L2); a throwaway worktree (isolates the repo, not the store).
  Answer: the user pressed "Guard in the store, drop exports" on `itm_6da59f1daeb7` (the default).
  Verdict: stands — the user took the default on itm_6da59f1daeb7: the guard in the store, the exports dropped
- **A2 A reviewer proves red in a throwaway worktree** (`itm_cdddd4d75a58`). Default: `git worktree add --detach <tmp>`,
  the old source written there, the test run there, the worktree removed; a Node proof links the writer's
  `node_modules` read-only into it. Tradeoff: about a minute per proof. Rejected: the reviewer cites the implementer's
  red row and runs nothing (no independent red).
  Answer: the user pressed "Throwaway worktree" on `itm_cdddd4d75a58` (the default).
  Verdict: stands — the user took the default on itm_cdddd4d75a58: the proof in a throwaway worktree
- **A3 Implementer and QA gain `TaskStop`** (`itm_d649b66f4053`). Default: both tool lines add it; it reaches only the
  agent's own background runs (§3). Tradeoff: two agents' tools widen. Rejected: no tool, every background run under its own
  `timeout`, and spec 4 reads "never kills; waits or times out" (a hung run holds the agent up to 10 min).
  Answer: the user pressed "Add TaskStop" on `itm_d649b66f4053` (the default).
  Verdict: stands — the user chose "Add TaskStop" on itm_d649b66f4053, own background runs only
- **A4 The classifier log is a file of its own, written for every denial in every session** (`itm_a1c2fae51b9f`).
  Default: `onDenied` appends before its lane check, so a main session or a run-less session is caught, file tools
  and no-verdicts included (tagged); `ticket` is the lane's filed ticket when a run is live, else null. The closing
  report and the audit read it through `readRefusals`. Tradeoff: commands from non-pilot sessions sit in a local file
  (credential withheld, 300 chars). Rejected: the deck's `Blocked:` items through a parser (pilot lanes with a live
  run only; misses the main session and first no-verdicts).
  Answer: the user pressed "Own log, every session" on `itm_a1c2fae51b9f` (the default).
  Verdict: stands — the user chose "Own log, every session" on itm_a1c2fae51b9f
- **A5 Retention and recurrence** (not posted, within the forks depth). Default: newest 10,000 lines kept, trimmed on
  append; a shape is a recurring habit at 3 or more refusals in the repo; no-verdicts are counted but never a habit
  row (they are the classifier's outage, blocked-steps). Tradeoff: an older habit ages out after ~10,000 denials.
  Rejected: unbounded file; a time window (the audit runs weekly and would lose a slow habit).
  Verdict: stands — bounds only: 10,000 lines kept, a habit at 3 refusals, no-verdicts counted but never a habit; no queued ticket claims them

## 7. Out of scope

- The classifier, permission settings, allow rules, hooks that approve (L1).
- The blocked-step path and its threads (L3); no-verdicts (blocked-steps).
- Other refusal shapes on the deck (`[Merge Without Review]`, `[Unauthorized Access]` …): spec 5 makes them visible.
- Isolating the hooks' and scripts' other `~/.claude/pilot` files in a test run (A1 tradeoff).
- Backfilling the log from the deck's 178 `Blocked:` items; the log starts empty when S4 lands.
- A `PermissionRequest` the pilot's own hook refuses (`hooks/permission-refuse.js`): not the classifier.
- The auditor posting or building a ticket unasked; the user picks rows as today.

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: the runner's table has no home redirect, and a test run cannot reach the real deck | 1, 2 | `hooks/lib/deck-secret.js`, `hooks/test/deck-dir-guard.test.js` (new), `agents/pilot-evidence-runner.md`, `docs/adr/NNNN-crew-refusals.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Every shell agent stops only what it started and never edits a writer's worktree | 3, 4 | `scripts/shell-rules.mjs` (new), `scripts/test/shell-rules.test.mjs` (new), `scripts/test/measure-prompt.test.mjs`, the 22 shell agents in `agents/`: `pilot`, `pilot-co-pilot`, `pilot-implementer` (+`TaskStop`), `pilot-qa` (+`TaskStop`), `pilot-architect`, `pilot-auditor`, `pilot-explorer`, `pilot-fundamentalist`, `pilot-lander`, `pilot-teacher`, `pilot-evidence-runner`, the 9 reviewers (`typescript`, `react`, `python`, `go`, `rust`, `cpp`, `database`, `security`, `silent-failure-hunter`), `build-error-resolver`, `react-build-resolver` | S1 (`agents/pilot-evidence-runner.md`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The closing report counts blocked steps by agent and reason | 5 | `deck/closing-report.mjs`, `deck/test/closing-report.test.mjs` | S4 (`classifier-log`'s `readRefusals`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | Every classifier denial lands in the classifier log | 6 | `deck/classifier-log.mjs` (new), `deck/test/classifier-log.test.mjs` (new), `hooks/permission-denied.js`, `hooks/lib/blocked.js`, `hooks/test/permission-denied.test.js` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The audit reports each recurring refusal habit as a row | 7 | `scripts/audit-refusals.mjs` (new), `scripts/test/audit-refusals.test.mjs` (new), `skills/audit/areas/refusals.md` (new) | S4 (`classifier-log`'s `readRefusals`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |

S1 first by risk: if the guard breaks tests that resolve the store without `tempDeck`, A1 is wrong and spec 1 needs
another isolation. S1 and S4 start at once; S2 after S1 adds the shell rules to `pilot-evidence-runner.md` itself; S3
and S5 after S4, both reading its log.

- red team: S1's guard keyed on `os.homedir()` would be moved by `testUtils`' own redirect and never fire; keyed on
  `os.userInfo().homedir`, which env does not move. S1 behaviour 1 proves it on this machine (Windows) by setting
  `HOME`/`USERPROFILE` to that path and expecting the throw.
- red team: a test file that does not import `testUtils` and reaches the store with no `PILOT_DECK_DIR` writes the
  real store today; after S1 it throws. That is the intent; S1's gate names each such file and fixes it with
  `tempDeck`, inside the 300-line limit or it stops (L8).
- red team: S2 and S1 both edit `pilot-evidence-runner.md`: the `after` above. S2's 22 files touch `pilot.md` and
  `pilot-lander.md`, which audit-f14 and handoff-cache also edit: S2 rebases on `pilot` before its gate; one sentence
  per file keeps the conflict to a line.
- red team: S2's pin raises: `pilot.md` has ~21 tokens; S2 replaces `:159`'s "a kill bundled with a read in one
  command" clause with the rule, so the net raise is the rule less that clause (L5).
- red team: A3 answered "No new tool" changes S2 only (spec 4 wording, two tool lines not added); no seam moves.
- red team: `ticket-live-scope.test.mjs:84` pins tool lines; S2 adds `TaskStop` to two other agents and that test
  stays green; a test pinning the implementer's tool list is checked in S2's gate.
- red team: seams half-built by two slices: none; each seam is built whole in one slice. S3 first drafted its own
  `Blocked:` body parser beside S5's: two parsers of one fact; moved behind `readRefusals` (S4), S3 now after S4.
- red team: S4 appending inside `postBlocked` would miss every denial outside a pilot lane (A4); the append sits in
  `onDenied` before `isPilotLane`. A log write that throws must not stop the post: the append fails open.
- red team: S4 under S1's guard: the hook's tests resolve the log through `deckDir()`, so a test without `tempDeck`
  throws instead of writing the real log; S4 tests pass `dir`.
- red team: the hook is CJS and `findCredential` ESM; a `require` fails. S4 uses `await import()` inside the async
  `onDenied`; a redaction that cannot load withholds the command (fail closed), never writes it raw.
- red team: S5's area file is read by the auditor in name order; `refusals.md` sorts before `setup.md`, no ordering
  dependency. S5 changes no auditor prose, so no pin moves.

## 9. Acceptance evidence

1. In the scratch repo with auto mode on, the evidence runner runs its six Node checks; QA counts 0 blocked steps and
   the real `~/.claude/pilot/deck.json` modified time is unchanged (spec 1, 2).
2. `node --test hooks/test/deck-dir-guard.test.js`: the throw on the real path (spec 2).
3. A reviewer's red-then-green proof on a planted fix in the scratch repo: proof shown, writer's `git status --short`
   identical before and after, 0 blocked steps (spec 3).
4. An implementer starts a background test run in the scratch repo and stops it by id: 0 blocked steps, no other
   `node` process ended (spec 4).
5. `node --test scripts/test/shell-rules.test.mjs`: 0 missing; `node scripts/measure-prompt.mjs` within every pin.
6. A refused call in the scratch session (QA's own, from the steps above) adds one line to the scratch deck's
   `classifier.log` with its agent and reason; a planted credential in a refused command shows withheld (spec 6).
7. The closing report of the scratch deck's ticket shows `Blocked steps:` with its rows from that log (spec 5).
8. `node scripts/audit-refusals.mjs <scratch repo> --log <seeded log>` with each §1 shape 3 times: 3 habit rows, each
   with its command and a ticket-ready spec (spec 7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/crew-refusals-s1 | – | – | – | 1, 2 |
| S2 | planned | slice/crew-refusals-s2 | – | – | S1 | 3, 4 |
| S3 | planned | slice/crew-refusals-s3 | – | – | S4 | 5 |
| S4 | planned | slice/crew-refusals-s4 | – | – | – | 6 |
| S5 | planned | slice/crew-refusals-s5 | – | – | S4 | 7 |
| feature | planned | feat/crew-refusals | – | – | S1-S5 | 1-7 |
