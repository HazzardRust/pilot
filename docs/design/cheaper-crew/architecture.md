# cheaper-crew: Haiku 5.5 pre-steps and Sonnet 5.5 on precise slices

Ticket itm_55f675c9714d · base `pilot` 671567e4 · merge: none (itm_6e3d2d50b711)

## 1. Problem

Anthropic released Sonnet 5.5 (2026-09-28) and Haiku 5.5 (2026-10-07). The user wants each model placed in the crew where it fits, so that work an Opus does today runs on a Sonnet where that is safe, and work an older Sonnet did runs on a Haiku. They also want a new pre-step that saves the existing agents time and attention. The explorer's recommendation on itm_e9cd9b1e6465 was accepted: "alright, i like the recommendation from the research, lets make a ticket out of it".

## 2. Spec

Agreed by the user on itm_bd0fb49b204f.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A new `pilot-fact-sheet` agent (`model: haiku`; tools Read, Grep, Glob, with no Bash and no web) takes one slice file. It returns one table of symbol · kind (signature / call site / test) · `path:line` · the quoted line, and lists any path it cannot find as `not found`. On a slice brief (not a fix brief), the implementer spawns it before its own first Read. The implementer treats the sheet as a lead and reads a `path:line` itself before editing on it. | `agents/pilot-fact-sheet.md` with `model: haiku` and its tools; a wording pin on `agents/pilot-implementer.md`; a scratch slice's implementer transcript shows the spawn before the first Read (L4). |
| 2 | A new `pilot-evidence-runner` agent (`model: haiku`; Bash, PowerShell, Read, Glob, with no Write, Edit or network) runs the six evidence checks on the changed lines, in the fundamentalist's worktree. Each check has one command, named in its definition with its cwd and env, and it runs nothing else (L3). It returns each check's command, exit code, runtime and raw output, and names the checks that have no tool on this stack. The fundamentalist spawns it first and runs its subtraction and test passes meanwhile. It then reads the output and runs none of those commands itself. | A wording pin on `agents/pilot-fundamentalist.md`; a scratch fundamentalist transcript shows the runner's output read and no coverage, mutation, jscpd, knip or madge command of its own (L4). |
| 3 | The mutation-safety rule now lives in the runner, the agent that mutates. The rule: never mutate `deck/store.mjs`, `client.mjs`, `daemon.mjs` or `server.mjs`, and point HOME and USERPROFILE at a scratch directory. The fundamentalist keeps one line that points at it. | The pin at `pilot-agents.test.mjs:557` is retargeted to `agents/pilot-evidence-runner.md` and is green. |
| 4 | Child budgets follow the helpers. The fundamentalist gains the `Agent` tool and exactly one child, the runner (`rules/orchestration.md:74` says "a fundamentalist none" today). The fact sheet counts within the implementer's five children. "Children are Sonnet" names the Haiku exception. | Pins on `rules/orchestration.md` and on the fundamentalist's `tools:`. |
| 5 | Both helpers can be reached. They are listed in the pilot's `Agent(...)` and in the co-pilot's, because the co-pilot's list already names the implementer's reviewers and so binds grandchildren on yellow. Each parent's prose names its helper as a permitted child. | A roster test over both lists; `TOOLBOX` gains both. |
| 6 | An implementer slice runs on Sonnet 5.5 when it is **precise**, and on Opus otherwise. The slice file decides this with a `Model:` header line, which the architect writes and `check-slices` requires (L2). The pilot's Models table, the co-pilot, `rules/orchestration.md` "Pick the model per ticket" and the implementer's description all say so. Every implementer brief carries the slice's `Model:` line and its reason. | Wording pins; `check-slices` refuses a slice with no `Model:` line; a scratch yellow brief names the model and its reason (L4). |
| 7 | The Models table keeps Opus on the architect, the co-pilot, the fundamentalist and QA, and Fable on the pilot, with one line of reason each. It gains the two Haiku helper rows. | A table pin names the five kept rows and the two helpers. |
| 8 | ADR 0150 records the policy, with Anthropic's pages fetched and dated 2026-10-14. It is cited from the Models section, the implementer, the fundamentalist and both helpers. | The ADR exists; `npm run adr-index` lists it; `check-references` passes. |
| 9 | Of the agents this run touches, only the pilot has an own-share pin (`measure-prompt.test.mjs:157`, 10632.75). Every slice that touches `agents/pilot.md` moves that pin by the measured cost, with a dated comment line, and its PR names the number. | The pin diff shows the new number and nothing else. |
| 10 | *(added, S5)* A scratch deck starts though a stale `pilot-scratch-<pid>.json` from a dead deck holds its new daemon's pid. | A test pre-creating the stale file; `npm test` green. |

## 3. Findings

- `agents/pilot.md:505-519`, the Models table: one row per crew role, the first word the default. `pilot-agents.test.mjs:139` (`modelDefaults`, `MODEL_RANK` haiku < sonnet < opus < fable) refuses a declared `model:` above its row. Rows for non-crew agents are ignored, so helper rows break nothing.
- `agents/pilot.md:5`, the `Agent(...)` list: `spawnableTypes()` (`pilot-agents.test.mjs:108`) requires every `TOOLBOX` name to be listed and every listed name to ship.
- `agents/pilot-co-pilot.md:6`, the co-pilot's `Agent(...)`, lists the reviewers that the implementer spawns. `rules/orchestration.md:77` says a list is inherited downward.
- `agents/pilot-implementer.md:3` already reads "the pilot overrides to Sonnet when the slice is mechanical against a precise brief". Spec 6 turns this into a field the slice carries. `:91` reads "Children are Sonnet ... At most five".
- `agents/pilot-fundamentalist.md:5` grants no `Agent` tool, and `:277` says "You do not spawn agents". `:107-138` is the evidence pass, with the tools table, the 15-minute mutation budget and the mutation-safety rule.
- `rules/orchestration.md:74` holds the child budgets. `:83-87` holds "Pick the model per ticket".
- `scripts/check-slices.mjs:74` defines `checkSlice(text)`, which checks the header (`AFTER_FIELD`, `:24`). It checks only the paths it is given, so older features are untouched. The worked example in `skills/vertical-slicing/SKILL.md` is checked as well.
- `agents/docs-lookup.md` is the existing Haiku agent, and is the shape a helper file copies.
- Own-share pins exist for the pilot (10632.75), the explorer and QA. The implementer, fundamentalist and co-pilot have none.
- ADRs 0143 to 0147 are held by yellow-lane, so this run takes **0148**.
- Anthropic (fetched 2026-10-14 by `pilot:docs-lookup`): `claude-sonnet-5-5` costs $2/$10 per MTok, `claude-haiku-5-5` from $0.10/$0.50, `claude-opus-5-5` $4/$20, and `claude-fable-5-1` $10/$50 (platform.claude.com/docs/en/about-claude/models/overview). On the Anthropic API the aliases `haiku`, `sonnet` and `opus` resolve to the 5.5 models; on Amazon Bedrock and Google Cloud `opus` resolves to Opus 5.5 and `sonnet` and `haiku` to 4.5, and on Microsoft Foundry all three resolve to 4.x (code.claude.com/docs/en/model-config, as quoted in ADR 0150).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `pilot-fact-sheet` (agent) | in: the slice file path and the worktree; out: rows of `symbol · kind · path:line · quoted line`, plus `not found` rows | the implementer's first-read sweep | in-process (prose agent, read-only) |
| `pilot-evidence-runner` (agent) | in: the worktree, `origin/<base>`, the changed files, the test and coverage commands; out: one row per check, `check · command · exit · runtime · raw output` | the fundamentalist's six tool runs and the mutation-safety rule | local-substitutable (the project's own tools, run with a scratch HOME) |
| `checkSlice(text)` (`scripts/check-slices.mjs`) | returns problems; gains the kind `model-line` | the header-shape checks | in-process |
| Crew rosters (`pilot-agents.test.mjs`) | `spawnableTypes()`, `TOOLBOX`, `modelDefaults()` | — | in-process (tests over prose) |

Deletion test:
- Delete the runner and six tool runs return to an Opus context, so it earns its place.
- Delete the fact sheet and its sweep returns to Opus on every slice. Its saving is what L4 measures.
- Neither helper is a pass-through, nothing shallow is folded, and so there is no fold slice.

## 4. Ubiquitous language

- **Fact sheet**: the `pilot-fact-sheet` table for one slice. It is a lead, never the truth.
- **Evidence runner**: the Haiku agent that runs the fundamentalist's tools and hands back their raw output.
- **Precise slice**: one whose Interface, Tests and Files owned leave no choice open, whose estimated diff is within the small-diff limit, none of whose delivered spec lines is *assumed*, and which does not hit the security trigger (A2).
- **Model line**: a slice header's `Model: sonnet|opus — <reason>`.
- **Helper**: an agent that does not spawn; here, the two Haiku agents.

## 5. Locked decisions

- **L1 Grilling depth: forks** (itm_8ad39aa1d02b).
- **L2 The slice file carries the model** (user, itm_ff51f68e4c4d; it was A1). The architect writes `Model: sonnet|opus — <why>` under each slice header. `check-slices` refuses a slice without it, on the paths given only. The pilot and the co-pilot copy it into the brief. Rationale: the choice is seen at Gate 1 and is not re-derived per brief (ADR 0141). Rejected: the pilot or co-pilot judging each brief.
- **L3 The runner's command surface is pinned** (user, itm_99141ea67410; amended on itm_16a6e9ba75e4). Its definition names six checks as a table with one command per stack row (the stacks the fundamentalist's table covers today: Node, Python, Go, Rust, JVM, .NET, PHP), each with its cwd and env: a scratch HOME and USERPROFILE, and the mutation exclusions. The runner picks the row by the repository's stack, runs nothing outside the table, and reports "no tool for this stack" where a cell is empty; a test pins the table. It has no Write, no Edit and no network, and the fact sheet stays on Read, Grep and Glob. Rejected: free Bash with the rule left in prose; and a Node-only six, which would drop every other stack's deterministic evidence.
- **L4 QA environment** (user, itm_2861f949c163; it was A3). One scratch deck and one scratch repository, with one precise slice run through the Sonnet implementer and its fact sheet, then the fundamentalist and its runner. QA reads the transcripts for spawn order and commands, and records tokens per agent by model in its PR comment. Rejected: an A/B run on the old crew, which doubles QA's cost for a number the usage log already gives.
- **L5 The implementer spawns the fact sheet, not the pilot or the co-pilot.** The sheet lands in the context that uses it. Rejected: a sheet in the brief, which spends the orchestrator's context and goes stale on rebase.
- **L6 One runner runs all six checks, in the fundamentalist's worktree.** Mutation's 15 minutes overlap the subtraction pass, and there is one install. Rejected: a helper per check, which would be six spawns on one diff. Also rejected: a second worktree, which means a second install with no isolation gained, since the fundamentalist never writes.
- **L7 The mutation-safety rule moves to the runner, and its pin moves with it.** Rejected: keeping it in both files, which pays twice and lets the copies drift.
- **L8 The helpers go in `TOOLBOX`, not `CREW`.** Their table rows are informational. Rejected: CREW, which would make them roles the pilot spawns.
- **L9 The fact sheet runs on slice briefs only.** A fix brief already names each finding at `path:line`. Rejected: running it on fix briefs too.
- **L10 The fact sheet's tools are minimal**: no Bash and no web (the runner's are in L3). Rejected: copying the implementer's tools, because WebFetch beside a machine read is the docs-lookup carry risk.
- **L11 ADR 0150** records the model policy.

## 6. Assumed decisions

- **A2 A security-trigger slice stays on Opus even when it is precise.** Tradeoff: fewer Sonnet slices, since in this repository every `agents/` or `hooks/` slice hits the trigger. In return, a weaker model never authors the diffs that the second reviewer exists for. Rejected: letting precision alone decide. Verdict: stands — the user's recorded preference is safety over cost on auth, user input and SQL (the second-reviewer rule), and the Sonnet saving on those slices is the smallest in the run.
- **A4 A failed runner is reported, not replaced.** The fundamentalist starts the runner before its subtraction pass and reads its output after the test pass. If the runner fails, the evidence pass says "not run" and quotes the runner's error. The fundamentalist does not run the tools itself. Rejected: falling back to its own runs, which keeps the Opus cost on the failure path and hides the failure. Verdict: stands — the same rule the deck applies to blocked steps (ADR 0137: a step not run is reported, never routed around), and a silent fallback would hide exactly the cost this run is meant to remove.

## 7. Out of scope

- QA, the architect, the auditor and the co-pilot keep their models. There is no Haiku reviewer.
- The explorer's and the teacher's models stay as they are, and there is no cost dashboard.
- Older features' slice files are not backfilled with `Model:` lines.

## 8. Slices

Width 2; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | An implementer reads a fact sheet before its first Read | 1, 4, 5, 9 | `agents/pilot-fact-sheet.md` (new), `agents/pilot-implementer.md`, `agents/pilot.md`, `agents/pilot-co-pilot.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S3 | A slice file states its model, and check-slices refuses one that does not | 6 | `scripts/check-slices.mjs`, `scripts/test/check-slices.test.mjs`, `skills/vertical-slicing/SKILL.md`, `agents/pilot-architect.md` | – | typescript, security | [S3](slices/S3.md) |
| S2 | The fundamentalist reads the evidence runner's output | 2, 3, 4, 5, 9 | `agents/pilot-evidence-runner.md` (new), `agents/pilot-fundamentalist.md`, `agents/pilot.md`, `agents/pilot-co-pilot.md`, `rules/orchestration.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs` | S1 (`agents/pilot.md` Agent list, `pilot-agents.test.mjs` TOOLBOX, the pilot pin) | typescript, security | [S2](slices/S2.md) |
| S4 | Every implementer brief names Sonnet or Opus and why, under ADR 0150 | 6, 7, 8, 9 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `rules/orchestration.md`, `agents/pilot-implementer.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-fact-sheet.md`, `agents/pilot-evidence-runner.md`, `docs/adr/0150-the-crews-model-is-chosen-per-role-and-per-slice.md` (new), `docs/adr/README.md`, `scripts/test/model-policy.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S2 (`agents/pilot.md`, `rules/orchestration.md`, the pilot pin), S3 (the Model line) | typescript, security | [S4](slices/S4.md) |

Walking skeleton: S1, one helper end to end (agent file, spawn clause, both rosters, pin). S1 and S3 run side by side.

## 9. Acceptance evidence

1. `agents/pilot-fact-sheet.md` and `agents/pilot-evidence-runner.md` exist, each with `model: haiku` and minimal tools (spec 1, 2).
2. On the scratch deck, the Sonnet implementer's brief carries `Model: sonnet — <reason>`, and its transcript shows the `pilot:pilot-fact-sheet` spawn before its first Read (spec 1, 6).
3. The fundamentalist's transcript shows the `pilot:pilot-evidence-runner` spawn, its output read, and no tool command of its own (spec 2, 4).
4. `check-slices` refuses a slice that has no `Model:` line and passes this run's slices (spec 6).
5. The Models table shows Fable, Opus four times with reasons, and the two Haiku helpers. ADR 0150 is in the index, and `check-references` and `npm test` are green (spec 3, 5, 7, 8, 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | integrated | slice/cheaper-crew-s1 | #660 | | – | 1, 4, 5, 9 |
| S3 | integrated | slice/cheaper-crew-s3 | #659 | | – | 6 |
| S2 | integrated | slice/cheaper-crew-s2 | #662 | | S1 | 2, 3, 4, 5, 9 |
| S4 | integrated | slice/cheaper-crew-s4 | #663 | | S2, S3 | 6, 7, 8, 9 |
| S5 (added) | integrated | slice/cheaper-crew-s5 | #661 | | – | 10 |
| cheaper-crew | integrated | feat/cheaper-crew | | | S4 | 1-9 |

### Principles verdicts

Kept, fixed on `fix/cheaper-crew-principles`:

| Id | Finding | Fix |
| --- | --- | --- |
| K1 | The runner fed every changed file to each column; Stryker aborted with `No parser registered for .md!` | Each column's files are filtered to its stack's extensions; `$MUTATE` never holds `.md` or `.json` |
| K2 | The CLI rejects `--commandRunner.command` | The Node mutation cell writes `$S/stryker.json` (command runner, `node --test` on the changed tests) and runs Stryker with it |
| K3 | The mutation cell's `timeout 900` is past the Bash tool's 600000 ms foreground cap | It runs with `run_in_background`, its output read on completion; no polling, no `pgrep` |
| K4 | Stryker's reports landed in the worktree | Every report goes under `$S` |
| K5 | The safe-name pattern let a leading `-` through | `^[A-Za-z0-9._/@][A-Za-z0-9._/@-]*$` |
| K6 | `deck/scratch.mjs` retried the registry write in an inner try | `fs.rmSync(file, { force: true })`, then one `wx`/0o600 write |
| K7 | The registry tests pinned `writeFileSync`'s call count and options | Deleted; the stale-file and planted-file tests stay |
| K8 | Redundant asserts in `pilot-agents`, `check-slices` and `model-policy` tests | Deleted; `spawnableTypes(name)` replaces `coPilotSpawnable` |
| K9 | The fundamentalist started the runner twice in prose and passed it a file list it discards; this artefact cited ADR 0148 | Paragraph and input deleted; ADR 0150, the alias sentence and §10 corrected |
| K10 | A2 (security-reviewed slices run on Opus) was not machine-checked | `checkSlice` refuses `model-security` |

Dropped:

| Finding | Why |
| --- | --- |
| env -i on fetched tool cells | no regression; breaks node on Windows without SYSTEMROOT/TEMP; scratch HOME stays the containment |
| never-mutate grep excluding deck/scratch.mjs | by design |
| re-opening L3 | K1-K2 fix it within L3; a locked decision is the user's |
| deleting the fact sheet pending L4 | QA measured $0.003 a slice; the user reads it at the walkthrough |
| fact-sheet not-found row for a new symbol | a lead by design |
| check-slices without a Reviewers line | pre-existing |
