# spec-first: the crew builds from the spec, and its prompts leave room for judgement

Ticket itm_6de487e1f2c4. Base `pilot` at a3b7d463. Runs after handoff-books, blocked-steps and
never-stuck on the deck queue (all edit `agents/pilot*.md`).

## 1. Problem

Tests-first makes the crew invent tests for things that are not logic. The user asked for a more
concise README; the implementer wrote tests such as "no sentence over 1 line" and the prose came out
badly. A slice should be built to a spec, with evidence the implementer chooses, and a test only where
the behaviour is deterministic logic. `tdd-workflow` stays, as a tool for that logic. The crew's
prompts carry 221 never/always/must (`agents/pilot*.md` at a3b7d463); absolutes crowd out judgement and
should stay only on gates, safety, destructive actions and secrets, each with its reason.

## 2. Spec

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | A slice is built to its spec: the implementer shows each behaviour with evidence it picks (a run, a look, a read, a test) and is not told to write a failing test first. | In the spec-7 run, the prose slice integrates with 0 tests of its wording and exactly one `Evidence:` trailer per behaviour; the logic slice integrates with at least one new test per `test` behaviour. |
| 2 | The phase gate asks for evidence per behaviour, not "a test that failed before and passes after"; a test stays required where the behaviour is deterministic logic. `pilot integrate` refuses a slice missing evidence. | `rules/vertical-execution.md` §3 and the implementer's loop say so; `integrate-slice-commit` tests: a new-shape slice with n behaviours integrates with n `Evidence: B<k>` trailers and is refused, nothing merged, with n−1: 0 slices integrate with a behaviour unevidenced. |
| 3 | A slice file lists its behaviours, each with the kind of evidence it takes (`test`, `run`, `look`, `read`), and no list of red steps. | `check-slices` passes the new worked example in `vertical-slicing` and refuses 2 fixtures: a behaviour naming no kind, and a `test` behaviour naming no Interface symbol. |
| 4 | A reviewer judges the diff against the slice's behaviours and reports a missing test only for a `test` behaviour, or for a behaviour marked otherwise that is deterministic logic (practitioner: Kent Beck, test the logic you would fear to break, not the prose). | The implementer's reviewer brief says so; the spec-7 run's prose slice review carries 0 missing-test findings. |
| 5 | `tdd-workflow` stays, loaded by the implementer only for a slice with a `test` behaviour. | The implementer's `skills:` preloads it 0 times and names the load; the skill still ships (toolbox test green); in the spec-7 run the logic slice shows red then green and the prose slice loads no `tdd-workflow`. |
| 6 | The crew's definitions give a rule's reason and leave the how to the agent; never/always/must stay only on gates, safety, destructive actions and secrets, each with its reason in the same or the next sentence (practitioner: Anthropic's Claude prompting guide, "add context", dial back emphatic language). | A count per `agents/pilot*.md` before (221) and after, and a kept list with 0 unlisted absolutes, each tagged gate, safety, destructive or secret; `measure-prompt` own share and total no larger for any of the 12 agents. |
| 7 | One real ticket is run end to end on the new definitions before the feature lands. | QA runs it from the feat worktree with `claude --plugin-dir`, at least 1 prose and 1 logic slice; the walkthrough links that run's PR and the user judges the prose. |
| 8 | A run planned on the old shape (never-stuck Run 2, signed) still checks and integrates unchanged. | `check-slices` still passes the old `good.md` fixture; an old-shape slice integrates with 0 `Evidence:` trailers. |
| 9 | Each pinned agent (pilot, architect, explorer, qa) has at least 100 tokens of headroom at landing, by cutting text, no pin raised (audit F3). | `measure-prompt` headroom, today 27.5, 51, 0 and 29.5; the pins' values unchanged in the diff. |
| 10 | A definition growing past its pin still fails the pin test (audit F3). | The pin tests untouched; adding 1 line past a pin turns its test red. |
| 11 | The fundamentalist installs from the lockfile (`npm ci`) in its worktree before it spawns the evidence runner, so coverage and mutation run (audit F5). | The spec-7 run's evidence-runner table: the Node coverage row carries an exit code and a measured result, 0 rows reading "node_modules missing". |
| 12 | The co-pilot checks the base is an ancestor of `feat/<slug>` before it spawns the fundamentalist or QA and before it hands back, prints the result, and on a miss takes the base with `pilot integrate` and no branch first (audit F7). | The co-pilot's text; the spec-7 run's co-pilot log shows the check line at least 2 times. |

Spec 8 is implied, not stated: a signed run's slice files predate the shape (found, build-now rule).
Spec 9-12 arrive with audit ticket itm_a7ac7dac678c, merged in on the user's "Merge these".

## 3. Findings

- **The loop.** `agents/pilot-implementer.md:6` preloads `tdd-workflow`; `:44-56` runs it and writes the
  slice's Tests "red steps, in order"; `:106-109` briefs the reviewer on test anti-patterns;
  `:193-208` reports Tests "red then green". `skills/tdd-workflow/SKILL.md:3` says "Use when writing a
  feature or fixing a bug … the RED gate is mandatory".
- **The gate text.** `rules/vertical-execution.md:34-41` (the loop) and `:47` ("failed before the
  change and passes after"); `rules/orchestration.md:36` ("tests first"); `CLAUDE.excerpt.md:60`;
  `README.md:129`; `CONTEXT.md:97` (term **Red steps**); `docs/architecture.md:33`.
- **The slice shape.** `scripts/check-slices.mjs:82-139` `checkSlice` requires `## Tests` lines
  `` `<name>`: `<symbol>` → <result> ``, one `Rewrite check:`, one `Misses:`; the anatomy is
  `skills/vertical-slicing/SKILL.md:77` and its worked example, pinned by
  `scripts/test/slice-interface.test.mjs` (`ANATOMY_FIELDS` lists Tests) and `check-slices.test.mjs:156`.
  The architect writes it (`agents/pilot-architect.md:107-115`, `:220-222`); the fact sheet reads it
  (`agents/pilot-fact-sheet.md`); the fundamentalist runs it to name a broken Rewrite check
  (`agents/pilot-fundamentalist.md:117-121`).
- **The integrate refusal to copy.** `scripts/integrate.mjs:89-99` `assertSecurityVerdict` reads the
  slice file from the run record and refuses without a `Reviewed-by:` trailer; trailers are one
  `Key: value` line each (`TRAILER`, `:55`). The evidence check is the same shape.
- **Mutation and coverage already skip prose.** The evidence runner's columns take only source
  extensions (`agents/pilot-evidence-runner.md:32-34`); the fundamentalist counts "an uncovered changed
  line of logic", never a percentage (`agents/pilot-fundamentalist.md:144`). Nothing to change.
- **The user's rules follow the plugin's.** `~/.claude/rules/vertical-execution.md` is byte-identical
  to the plugin's; `orchestration.md` differs by one earlier shipped line. Both match the append-only
  ledger, so the session-start repair (ADR 0079, `scripts/install-rules.mjs`) replaces them.
- **Absolutes at a3b7d463** (`git grep -ciwE 'never|always|must' agents/pilot*.md`): pilot 43,
  qa 31, co-pilot 28, architect 20, implementer 18, fundamentalist 15, evidence-runner 14, lander 14,
  auditor 13, explorer 11, teacher 11, fact-sheet 3; total 221.
- **Prompt pins** (`node scripts/measure-prompt.mjs`): headroom pilot 27.5, architect 51, explorer 0,
  qa 29.5. The architect preloads `vertical-slicing`, so the new anatomy counts against its pin.
- **Overlap.** handoff-books edits `agents/pilot.md`; never-stuck plans `pilot`, `architect`,
  `co-pilot`, `implementer`, `lander`, `teacher`; blocked-steps `pilot`, `qa`, `co-pilot`, `lander`,
  `implementer`. This run's sweep slices are one or two definitions each, so a rebase hits one slice.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Slice shape | `checkSlice(text)`, `behavioursOf(text)` in `scripts/check-slices.mjs` | the `## Behaviours` grammar, the old `## Tests` grammar as legacy | in-process |
| Slice evidence gate | `integrate(branch, { trailers })` refusing on `assertEvidence` | the slice-file lookup `assertSecurityVerdict` already does, shared as `sliceFileOf` | local-substitutable (git, fs) |
| Crew prompt | each `agents/pilot*.md`, measured by `measure-prompt` | — | prose, no fold |

Deletion test: `behavioursOf` earns its place (two callers, check-slices and integrate); a separate
`check-evidence` script would be a pass-through over it and is not built.

## 4. Ubiquitous language

- **Behaviour**: one numbered line of a slice file's `## Behaviours`, a thing a user can watch happen.
- **Evidence kind**: `test`, `run`, `look` or `read`; the slice names it, the implementer picks the
  instance.
- **Deterministic logic**: code whose result for a given input a program can decide (a parse, a
  computed value, a state change, an exit code, a refusal). Prose, prompt wording, layout and taste
  are not.
- **Evidence row**: the implementer's report line for one behaviour, `B<k> <kind>: <what was seen>`,
  carried into the merge as an `Evidence:` trailer.
- **Kept absolute**: a never/always/must left in a definition, on a gate, safety, a destructive action
  or a secret, with its reason.

## 5. Locked decisions (ADR 0185, `docs/adr/0185-spec-first.md`)

- **L1** The slice file's `## Tests` becomes `## Behaviours`; each line is
  `` <k>. `<name>` (<kind>): <evidence> ``, and a `test` line keeps `` `<symbol>` → <result> `` with the
  symbol in the Interface block. `Rewrite check:` is required only when a `test` line exists; `Misses:`
  stays on every slice. *Rejected*: a separate Evidence section beside Tests (two lists to keep in step).
- **L2** The architect marks the kind; the implementer may raise any behaviour to `test` and may swap
  one non-test kind for another, saying why in the row; lowering a `test` is a seam change to its
  addressee. *Rejected*: the implementer marks alone (Gate 1 would not see where tests go).
- **L3** `pilot integrate` refuses a new-shape slice unless each behaviour has one `Evidence: B<k> …`
  trailer, the co-pilot (or pilot) copying them from the report. *Rejected*: the co-pilot reads the
  report alone (no record on the commit, and a gate in prose is the absolute this run removes).
- **L4** The implementer drops `tdd-workflow` from `skills:` and loads it with the Skill tool when the
  slice has a `test` behaviour or the brief is a bug in logic. *Rejected*: keep the preload and tell it
  to skip (pays ~1.1k tokens per slice for an unread skill, as ADR 0180 L3 did for `diagnosing-bugs`).
- **L5** The old `## Tests` shape stays valid in `check-slices` and needs no `Evidence:` trailer, so a
  signed run's slices still pass (spec 8). *Rejected*: migrate never-stuck Run 2's slice files.
- **L6** The fundamentalist's coverage and mutation checks stay as they are: they already run on source
  files only and judge uncovered logic, not a percentage. Its Rewrite-check finding applies to `test`
  behaviours. *Rejected*: dropping them (they are the check on the `test` lines).
- **L7** Only the plugin's `rules/` copies change; the session-start repair carries them to
  `~/.claude/rules/` (ADR 0079). *Rejected*: editing the user's home copies in a slice (outside the repo).
- **L8** The sweep keeps every gate, safety, destructive and secret absolute, rewrites the rest as a
  reason plus the default, and cuts restatements; each slice owns one or two definitions.
  *Rejected*: one sweep slice over all twelve (one diff past 400 lines, conflicts with four runs).
- **L9** Grilling depth is `forks` (the user, itm_4d1af58610b7): only a question whose paths give
  materially different deliverables goes to the deck (A1, A2); the rest stand as A‹n› for the pilot's
  verdict pass. *Rejected*: every stash on the deck.
- **L10** Headroom (spec 9) comes from the sweep's cuts in S6, S7, S9 and S10, never from a raised pin;
  a pinned slice's bar is its own share at least 100 under its pin. *Rejected*: raising the pins (F3's
  easy fix, but spec 6 says no larger).
- **L11** F5's install is the fundamentalist's (`npm ci` from the lockfile, which adds no dependency);
  the evidence runner still installs nothing. F7's check is prose in the co-pilot over the base merge
  `pilot integrate` already does with no branch. *Rejected*: a new `pilot` verb for the ancestry check
  (integrate already merges the base before every slice).

## 6. Assumed decisions

- **A1** (deck itm_7896680426aa) What counts as deterministic: the definition in §4, marked per
  behaviour by the architect (L2). Trade: prose with a mechanical rule (a token budget, a heading a
  script parses) is `run` or `read` evidence, not a test. Rejected: the slice as a whole marked
  deterministic; the implementer deciding alone.
  User's answer: "Per behaviour, architect marks" (the default).
  Verdict: stands — the user took the default on itm_7896680426aa
- **A2** (deck itm_8d9195c330ce) The integrate refusal (L3) rather than the co-pilot's read alone.
  Trade: about 60 lines in `integrate.mjs` and a trailer per behaviour on every slice merge; presence,
  not truth. Rejected: the co-pilot's read (S2 drops, S5 and S6 lose their `after`).
  User's answer: "Integrate refuses" (the default).
  Verdict: stands — the user took the default on itm_8d9195c330ce
- **A3** The spec-7 ticket: the user's own case, a README concision ticket on a scratch clone of this
  repository plus one logic slice (audit F6, select-tests' tree guard), run by QA with
  `claude --plugin-dir`. Trade: QA time of one small run. Rejected: waiting for the next real ticket
  after landing (spec 7 says before).
  Verdict: stands — a scratch-clone run moves nothing in the queue; the queued Audit F6 tickets stay queued
- **A4** (the pilot's) Every slice that edits an agent definition, a skill or `pilot integrate`'s
  refusal names `pilot:security-reviewer`, and spec 6's kept-absolutes list for its files is that
  reviewer's input, so a safety, destructive-action or secret rule cannot leave in a sweep unseen.
  Trade: a second reviewer on 10 of 10 slices. Rejected: the language reviewer alone on prose slices.
  Verdict: stands — the pilot's own, keeps safety rules in a reviewer's sight through the sweep
- **A5** The QA environment (deck itm_d6f91e614d0d, the pilot's): `claude --plugin-dir <feat worktree>`
  on a scratch clone and a scratch deck, no database.
  User's answer: `claude --plugin-dir <feat worktree>` on a scratch clone of this repository with a
  scratch deck; the live deck and the installed plugin stay untouched; no database.
  Verdict: stands — the user's answer on itm_d6f91e614d0d
- red team: S1 changes `vertical-slicing`, which the architect preloads under a 51-token headroom; S1's
  bar is the architect's own share no larger. S1 also owns `slice-interface.test.mjs`, which pins
  "Tests" as an anatomy field and would go red under S1 alone otherwise. S7 and S3 both describe the
  Behaviours shape in prose; both name S1's grammar by reference instead of restating it. The sweep
  slices on `pilot.md`, `co-pilot`, `qa`, `lander`, `implementer` and `architect` rebase over the four
  runs ahead; each is one or two files so a conflict costs one slice.

## 7. Out of scope

- Rewriting the user's `~/.claude/rules` by hand; skills the crew does not preload; the language
  reviewers' own definitions (their text names no missing-test rule); absolutes outside never, always
  and must (15 "do not" stay unless a sweep slice cuts one as a restatement); migrating old slice files.

## 8. Slices

Width 7; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A slice file lists behaviours with an evidence kind | 3, 8 | `scripts/check-slices.mjs`, `scripts/test/check-slices.test.mjs`, `scripts/test/fixtures/slices/*`, `scripts/test/slice-interface.test.mjs`, `skills/vertical-slicing/SKILL.md` | – | typescript, security | [S1](slices/S1.md) |
| S2 | Integrate refuses a slice missing evidence | 2, 8 | `scripts/integrate.mjs`, `scripts/test/integrate-slice-commit.test.mjs` | S1 (`behavioursOf`) | typescript, security | [S2](slices/S2.md) |
| S3 | The implementer builds to the behaviours | 1, 4, 5, 6 | `agents/pilot-implementer.md`, `skills/tdd-workflow/SKILL.md`, `vendor/toolbox.md` | S1 (Behaviours grammar) | security | [S3](slices/S3.md) |
| S4 | The gate text asks for evidence | 2, 6 | `rules/vertical-execution.md`, `rules/orchestration.md`, `scripts/shipped-rules.json`, `CLAUDE.excerpt.md`, `CONTEXT.md`, `README.md`, `docs/architecture.md`, `docs/adr/0185-spec-first.md` | – | security | [S4](slices/S4.md) |
| S5 | The co-pilot carries evidence into the merge and checks its base | 2, 6, 12 | `agents/pilot-co-pilot.md` | S2 (`Evidence:` trailer) | security | [S5](slices/S5.md) |
| S6 | The pilot carries evidence into the merge | 2, 6, 9, 10 | `agents/pilot.md` | S2 (`Evidence:` trailer) | security | [S6](slices/S6.md) |
| S7 | The architect cuts behaviours, not red steps | 3, 6, 9 | `agents/pilot-architect.md` | S1 (Behaviours grammar) | security | [S7](slices/S7.md) |
| S8 | The fundamentalist judges tests on test behaviours and installs first | 4, 6, 11 | `agents/pilot-fundamentalist.md`, `agents/pilot-evidence-runner.md` | S1 (Behaviours grammar) | security | [S8](slices/S8.md) |
| S9 | QA and the lander keep only reasoned absolutes; QA runs spec 7 | 6, 7, 9 | `agents/pilot-qa.md`, `agents/pilot-lander.md` | – | security | [S9](slices/S9.md) |
| S10 | The helpers keep only reasoned absolutes | 6, 9 | `agents/pilot-fact-sheet.md`, `agents/pilot-explorer.md`, `agents/pilot-teacher.md`, `agents/pilot-auditor.md` | S1 (Behaviours grammar) | security | [S10](slices/S10.md) |
| S11 | Every absolute left in the builders' definitions is listed with its reason (added, step 7) | 6 | `agents/pilot-co-pilot.md`, `pilot-implementer.md`, `pilot-architect.md`, `pilot-fundamentalist.md`, `pilot-evidence-runner.md`, `pilot-fact-sheet.md`, `docs/design/spec-first/absolutes.md` | S6 (`agents/pilot.md` kept list) | security | [S11](slices/S11.md) |
| S12 | Every absolute left in QA, the lander and the helpers is listed with its reason (added, step 7) | 6 | `agents/pilot-qa.md`, `pilot-lander.md`, `pilot-explorer.md`, `pilot-teacher.md`, `pilot-auditor.md`, `docs/design/spec-first/absolutes.md` | S11 (`absolutes.md`) | security | [S12](slices/S12.md) |

Walking skeleton: S1, the shape every other slice and the architect write to, checked by code.
Headroom moves under us (handoff-books S3 left `pilot` at 28.25; blocked-steps and never-stuck add to
`pilot.md`): each sweep slice reads its agent's pin and headroom off `measure-prompt` on its own
rebased base, not off this table, and S6, the `pilot.md` slice, is spawned last of the sweep and
re-measures after `git rebase` onto the `pilot` that carries those runs; QA re-measures all four
pinned agents on the feat tip at Gate 2 (spec 9's bar is that measurement).
Ready at once after S1: S2, S3, S7, S8, S10, with S4 and S9 from the start (width 7). Longest stem
S1 → S2 → S5 (3).

## 9. Acceptance evidence

1. `node scripts/check-slices.mjs skills/vertical-slicing/SKILL.md` passes; the two refusal fixtures fail (spec 3).
2. An integrate of a fixture slice with one trailer missing prints `NOT integrated … B<k>` (spec 2).
3. The implementer's frontmatter preloads no `tdd-workflow` (spec 5).
4. The before/after absolutes table and the kept list, in the feature PR (spec 6), with `measure-prompt` before and after.
5. The spec-7 run: the README slice's diff and its Evidence trailers, the logic slice's red then green, the PR link; the user reads the README (spec 1, 4, 5, 7).
6. never-stuck Run 2's slice files pass `check-slices` on the feat branch (spec 8).
7. `measure-prompt` on the feat tip: pilot, architect, explorer and qa each at least 100 under an unchanged pin (spec 9, 10).
8. The spec-7 run's fundamentalist table has a measured Node coverage row, and its co-pilot log prints the base check (spec 11, 12).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3, 8 |
| S2 | planned | | | | S1 | 2, 8 |
| S3 | planned | | | | S1 | 1, 4, 5, 6 |
| S4 | planned | | | | – | 2, 6 |
| S5 | planned | | | | S2 | 2, 6, 12 |
| S6 | planned | | | | S2 | 2, 6, 9, 10 |
| S7 | planned | | | | S1 | 3, 6, 9 |
| S8 | planned | | | | S1 | 4, 6, 11 |
| S9 | planned | | | | – | 6, 7, 9 |
| S10 | planned | | | | S1 | 6, 9 |
| spec-first | planned | feat/spec-first | | | S1–S10 | 1–12 |
