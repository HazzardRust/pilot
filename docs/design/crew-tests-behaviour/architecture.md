# The crew tests behaviour, not wording

Ticket `itm_3a521d90b85f` · thread `itm_4b5c8c150f94` · base `pilot` at `1125a1ea` · slug `crew-tests-behaviour`

## 1. Problem

The user has seen silly tests land: tests that pin the wording of a runbook, `pilot help`, an ADR's
frontmatter or an agent prompt (#891, #892, #899), and tests that mirror the implementation's shape or feed
a parser input hand-written in its own writer's format (#900). The repository already carries Matt Pocock's
`tdd` and `diagnosing-bugs` skills (forked at mattpocock-skills 1.2.3), but no crew agent loads either: the
implementer preloads only `tdd-workflow` (ECC lineage), which puts refactoring inside the loop where `tdd`
puts it outside, and names none of the anti-patterns those tests trip. The user wants Pocock's methodology
wired into the crew and our copies changed, adding and cutting.

## 2. Spec

Agreed with the user on itm_3a5d4cb26143 (Yes), spec 5 widened by L6.

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | Pocock's `tdd` is renamed `test-design` (its job: what a test is, seams, anti-patterns; L2) and the implementer preloads it beside `tdd-workflow`, and the two give one refactor rule (out of the loop): `tdd-workflow` loses Step 5, its `refactor:` checkpoint, "then refactor" in its description and "The four ways this goes wrong"; that list's dependent-tests and happy-path-only items move into `test-design`'s anti-patterns. `test-design` says that under a piloted slice the slice file's Interface and Tests are the agreed seams, so no deck question is asked. | `agents/pilot-implementer.md` `skills:`; `measure-prompt`'s Preloaded skills column; `check-references`, `check-provenance skills/`, `build-vendor-ledger --check` | `grep -c refactor skills/tdd-workflow/SKILL.md` = 0; implementer's Preloaded skills column rises by test-design's bytes/4 (±5); the three checks exit 0 |
| 2 | `test-design`'s anti-patterns name the **prose pin** (a test that requires a phrase in a doc, prompt, ADR or help text; a test that forbids a command in a prompt is a lint and allowed) and the **hand-written fixture** (a parser's fixture is the real producer's output, never typed in the writer's own format). | the skill text; the QA fixture run (L7) | 2 new named anti-patterns, each with its tell in one sentence |
| 3 | Each slice file carries one `Misses:` line beside `Rewrite check:` naming what its Tests cannot catch; `check-slices` refuses a slice file without one; `vertical-slicing`'s worked example carries one; `test-design`'s off-pilot seam question names, per seam, what its test catches and misses. | `scripts/test/check-slices.test.mjs` red then green; `check-slices skills/vertical-slicing/SKILL.md` exit 0 | 1 new rule id `misses`; architect own share ≤ its pin 9287.5 |
| 4 | `diagnosing-bugs` reaches the implementer (loaded with the Skill tool when a red is still red after one fix) and the lander (when its gate stays red after it fixed its own hunk); QA keeps its on-demand load (A2). The skill says: an agent without `deck_post` sends Phase 3's ranked list to its addressee and keeps testing the top hypothesis; after two failed fixes it sends that list and makes no third. | `grep -n diagnosing-bugs agents/pilot-implementer.md agents/pilot-lander.md`; `measure-prompt`; `check-references` | 2 new load lines; QA's own share unchanged; checks exit 0 |
| 5 | Every test that requires a phrase in prose (an agent, skill, rule, README, OPERATING.md, ADR or help text) is cut across `scripts/test`, `deck/test` and `hooks/test`: about 400 test blocks in 70 files (§3). A mixed test keeps its lint or behaviour half. A rule worth keeping returns as a structural lint in code (a heading, step or field exists; a command is absent), never a phrase, with `// lint: <rule>` beside it. | each sweep PR's per-file table (file, tests cut, asserts cut, lints kept, rule each keeps); `npm run test:changed` per slice; the suite at landing | a re-classification of the three test trees finds 0 PIN and 0 MIXED blocks; table rows = owned files; the suite and every `check-*` script green after each slice |
| 6 | Every reviewer the implementer spawns names the `test-design` anti-pattern each new test trips (A3), and the fundamentalist's test pass does the same in one line. | `agents/pilot-implementer.md` review paragraph; `agents/pilot-fundamentalist.md` test pass; the QA fixture run (L7) | 1 clause in the implementer, 1 bullet in the fundamentalist |
| 7 | practitioner: a test-design reviewer (Beck's "test the behaviour you'd miss") — the gap a slice's tests leave is written before code, so the reviewer and the fundamentalist read the miss, not guess it. Delivered by spec 3's `Misses:` line. | spec 3's evidence | every slice file of the next run carries exactly one `Misses:` line |
| 8 | practitioner: a maintainer re-syncing a fork — every adaptation is in its provenance `adapted:` line and its ledger row, so a re-sync against upstream finds each one. | `check-provenance skills/`; `build-vendor-ledger --check` | both exit 0; each edited skill's `adapted:` names the change |

## 3. Findings

What exists:

- `skills/tdd/SKILL.md` (45 lines; Pocock fork; renamed `skills/test-design/` by S1; mentioned at `agents/pilot.md:102`, `scripts/test/methodology-skills.test.mjs:24, 140`, `vendor/methodology.md:77-79`, `VENDOR.md:42-44`; pilot.md is at pin headroom 0) — seams agreed as a deck `question` (l.24-28); anti-patterns implementation-coupled, tautological, horizontal (l.34-38); refactor out of the loop (l.45). `tests.md`, `mocking.md` verbatim.
- `skills/tdd-workflow/SKILL.md` (129 lines; ECC trim) — Step 5 refactor (l.100-103), `refactor:` checkpoint (l.112), "four ways" (l.120-129). Ledger: `vendor/toolbox.md` l.39-50, 78.
- `skills/diagnosing-bugs/SKILL.md` (145 lines) — Phase 3 posts the ranked list to the deck (l.105); the implementer has no `deck_post`. Its `deck_wait` is pinned by `scripts/test/pilot-agents.test.mjs:306-335` and `crew-waits.test.mjs:105`.
- `agents/pilot-implementer.md:6` `skills: [tdd-workflow, verification-loop]`; The loop l.42; review paragraph l.93-107. Unpinned (own share 5223.5).
- `agents/pilot-qa.md:183` already loads `pilot:diagnosing-bugs` on demand; `pilot-agents.test.mjs:1285` pins on-demand (independence L8). QA pin headroom 1.5.
- `agents/pilot-lander.md` Resolve step 6 (l.36-38): red on its own hunk → fix, gate once more.
- `agents/pilot-fundamentalist.md` test pass l.86-105; edited too by queued `itm_ff08c3e59cfa`.
- `scripts/check-slices.mjs:102-106` enforces one `Rewrite check:`; checks a SKILL.md's worked example; fixtures `scripts/test/fixtures/slices/`.
- Architect own share 9287.5 = pin (headroom 0); `vertical-slicing` is preloaded into it.
- `vendor/methodology.md` rows l.75, 77; `VENDOR.md` generated from the fragments, `--check` in the suite.
- Census of prose pins (four read-only sweeps, at base `42b6ba56`): about 397 PIN or MIXED blocks, about 3,700 deleted lines, in about 70 files; heaviest `pilot-agents.test.mjs` (70 blocks, ~900 lines), `pilot-rules` (~225), `install` (23, ~195), `ticket-making` (~180), `principles-sweep` (~130), `yellow-co-pilot` (~115). Per-file block ranges are in each sweep slice file. Not pins and kept: `measure-prompt.test.mjs` `own <= n` pins (they feed code), CSS/JS source checks in `deck/test/live`, `tabs`, `resize`, and config-structure checks (`hooks.json`, `.mcp.json`, settings, the CI workflow).
- The behaviour the first three files shadow is tested at real seams: `integrate-select`, `land-suite`, `select-tests`, `select-fallback`, `adr-index` tests.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `test-design` skill | headings `Seams: where tests go`, `Anti-patterns`, `Rules of the loop`; the anti-pattern names | `tdd-workflow`'s "four ways" (deleted; items 3, 4 moved here) | in-process (text the harness preloads) |
| `tdd-workflow` skill | `Step 0`-`Step 4`, `Checkpoints` | none; Step 5 deleted (deletion test: nothing reappears) | in-process |
| `diagnosing-bugs` skill | `Phase 3: Hypothesise` hand-off; the two-failed-fixes rule | the escalation that spec 4 would otherwise put in three prompts | in-process |
| `checkSlice(text)` | `checkSlice(text) -> { line, rule, message }[]`; CLI `check-slices.mjs <path>...` | the `misses` rule beside `rewrite-check` | in-process (pure function) |
| implementer prompt | frontmatter `skills:`; `## The loop` | the reviewer clause (A3) instead of 8 reviewer files | in-process |

Deletion test: `tdd-workflow` survives (its runner table, RED validity and checkpoints appear nowhere else); its "four ways" and Step 5 do not. No fold changes code, so there is no fold slice.

## 4. Ubiquitous language

This run's glossary (domain-modeling's place for it is the artefact; ADR 0168 carries the repository-wide decision).

- **Prose pin** — a test that passes only while an agent prompt, skill, rule, README, runbook, ADR or help text contains a phrase. It is not a "wording test", a "doc test" or a "lint".
- **Lint** — a structural check in code: a heading, step or field exists, or a pattern (a command, a word) is absent, marked `// lint: <rule>`. It is not a prose pin, because it requires no phrase.
- **Hand-written fixture** — parser input typed by the author of the format it parses, rather than captured from the real producer. It is not a "fixture" in general.
- **Misses line** — the slice file's one `Misses:` line: what its Tests cannot catch. It is not the `Rewrite check:` line, which says what survives a rewrite.
- **test-design** — the skill (Pocock's `tdd`, renamed) that says what a test is, where seams go and which anti-patterns to refuse. It is not `tdd-workflow`, the red-green mechanics, and not "the TDD skill".
- **Agreed seams** — in a piloted run, the slice file's Interface and Tests as signed at Gate 1. It is not a deck seam question.
- **Stuck red** — a red step still red after one fix attempt. It is not a flaky test (a known flake is rerun, not diagnosed).

## 5. Locked decisions

- **L1 Forks** (user, itm_f81e68d0022e): we change our forks of `test-design` and `diagnosing-bugs` in place, recording each change in the provenance `adapted:` line and its ledger row; no re-vendor from upstream, no new skill, no standalone agent. Rejected: a standalone diagnoser agent (a spawn and re-brief per stuck red, against "helpers do not spawn").
- **L2 Two skills, each named for its job** (user, itm_31b1fa83797a: "why dont we re-name the second one to just test design if they have 2 different jobs"): Pocock's `tdd` becomes `test-design` (what a test is, seams, anti-patterns), with its upstream path unchanged in provenance; `tdd-workflow` keeps the mechanics (runner, RED validity, checkpoints). Rejected: folding into one skill (a bigger diff against two ledgers for the same reach).
- **L3 The escalation rule lives in `diagnosing-bugs`**, not in each agent: one sentence reaches all three loaders. Rejected: a rule per prompt (three copies, and QA has no headroom).
- **L4 Prompt evidence is `check-references`, `measure-prompt`, `check-provenance` and `build-vendor-ledger --check`**, never a new prose pin (the ticket forbids what it would be). The one new test is `check-slices`', which is code.
- **L5 Pin rule for spec 5**: a PIN block goes; a MIXED block loses its phrase assertions; a LINT or BEHAVIOUR block stays; a kept prose read carries `// lint: <rule>`. A phrase pin is never rewritten as another phrase or moved into a script. Rejected: a codemod deleting by line range (the ranges are estimates and a mixed block needs a reader).
- **L6 Scope: every prose pin goes** (user, itm_0bb988b08a10: "get rid of the prose tests honestly - they suck when i see them. you can re-write what tests you want, but the bulk of them suck - prose isnt really something you should be deterministically testing against"; "All 72 in this run"). overridden: 3 here + follow-up ticket; the sweep grows the run ~+5 slices and removes the prompt-edit guard. A rule worth keeping returns as a structural lint in code (a step or heading exists, a command is absent), never a phrase.
- **L7 QA environment** (user, itm_4f1902831208): this machine, with a fixture run — QA spawns one implementer on a fixture slice in a scratch worktree with the new skills loaded and reads the tests it writes, takes a reviewer's verdict on a fixture diff holding a prose pin, and runs `measure-prompt`, `check-references` and the suite. Rejected: static checks only (they show the text landed, not that an agent behaves differently).

## 6. Assumed decisions

- **A1** (thread itm_3a5d4cb26143, change 2; was itm_c1ed4e4aff23) `Misses:` line in slice files, enforced by `check-slices`. Default taken. Trades: one line per slice; architect at headroom 0 cuts what S2 adds. Rejected: only `test-design`'s off-pilot question (no crew run would show it). If rejected: S2 is dropped and spec 3 is S1's question format only. Verdict: stands
  Verdict: stands
- **A2** (thread itm_3a5d4cb26143, change 1; was itm_7a60ebeef429) QA keeps on-demand `diagnosing-bugs`. Default taken. Trades: QA reads it only when it judges a bug needs it. Rejected: preload (reverses independence L8; needs ~2.2k tokens cut from `pilot-qa.md`, a fold slice of its own). Verdict: stands
  Verdict: stands
- **A3** (thread itm_3a5d4cb26143, change 3; was itm_c5b37e964906) Reviewers reach `test-design`'s anti-patterns through the implementer's review clause. Default taken. Trades: a reviewer QA spawns gets no clause. Rejected: editing 8 vendored reviewer files. Verdict: stands (S4's fundamentalist bullet held to one line: itm_ff08c3e59cfa, queued yellow, rewrites pilot-fundamentalist.md).
  Verdict: stands
- **A4** (itm_77e060f454b1) The 150-line cap counts lines added or edited; deleted test blocks are bounded at about 700 per sweep slice and listed per file in the PR table. Default taken. Trades: a sweep PR's red diff exceeds the usual cap. Rejected: counting deletions (about 25 sweep slices, a 29-slice run, for deletions that need no design review). Verdict: stands
  Verdict: stands
- red team: S2 changes every `check-slices` fixture that expects `[]`, and `vertical-slicing`'s worked example, or `check-slices.test.mjs:22, 111, 145` go red; written into S2's Files owned.
- red team: the rename touches `agents/pilot.md:102` at pin headroom 0 (`tdd` → `test-design` is +8 bytes): S1 cuts at least 8 bytes in the same file; and S1 updates `methodology-skills.test.mjs:24, 140` or its sibling read goes red.
- red team: `methodology-skills.test.mjs:140` reads sibling mentions as `pilot:<name>`; S1 and S3 name siblings `pilot:test-design`, `pilot:diagnosing-bugs`.
- red team: `implementer-steps.test.mjs:57-61` pins "worktree" and "installs nothing" in the review paragraph S1 edits; S1 keeps both words even though S11 cuts the pin, since they run side by side.
- red team: `lander-wording.test.mjs` pins `## Never mid-merge`, `## Clean tail`, `clean at <sha>`; S3 adds a sentence inside step 6 only.
- red team: S3 and S1 both touch `vendor/methodology.md` rows two lines apart and `VENDOR.md`; S3 runs after S1 rather than trusting a clean merge.
- red team: S1 renames inside `methodology-skills.test.mjs`, which the sweep also cuts; S12 owns that file's cut and runs after S1.
- red team: `check-slices.test.mjs:144-157` pins `vertical-slicing`'s text, the file S2 edits; S2 owns that cut rather than a sweep slice.
- red team: `pilot-agents.test.mjs` is 1,749 lines with 70 pin blocks; split S5 (blocks up to line 612) and S6 (858 on), S6 after S5 on the same file and finding its blocks by test name, since S5 shifts the lines.
- red team: `crew-waits.test.mjs:105` and `pilot-agents.test.mjs:302-337` pin `diagnosing-bugs`'s `deck_wait`; S3 keeps `deck_wait` whether or not those pins survive, so S3 and S5/S11 share no file and no seam.
- red team: deleting pins can leave helpers in `scripts/test/lib/area-file.mjs` unused; no sweep slice owns `lib/`, and the fundamentalist's dead-code pass judges it once.

## 7. Out of scope

- Editing the 8 vendored language reviewers (A3).
- A lint that refuses new prose pins repo-wide (the reviewers and the fundamentalist hold the line, spec 6).
- `scripts/test/lib/` helpers left unused by the sweep (the fundamentalist's dead-code pass).
- QA's prompt (A2); the fundamentalist beyond one line (itm_ff08c3e59cfa owns its rewrite).
- The content of `tests.md`, `mocking.md` (verbatim; moved to `skills/test-design/` unchanged).

## 8. Slices

Width 10; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the implementer writes its tests under `test-design` | 1, 2, 3 (question), 6 (clause), 8 | `skills/tdd/*` → `skills/test-design/*` (3 files), `skills/tdd-workflow/SKILL.md`, `agents/pilot-implementer.md`, `agents/pilot.md`, `scripts/test/methodology-skills.test.mjs`, `vendor/methodology.md`, `vendor/toolbox.md`, `VENDOR.md` | – | `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A slice file names what its tests miss | 3, 5, 7 | `scripts/check-slices.mjs`, `scripts/test/check-slices.test.mjs` (incl. its pins at 144-157), `scripts/test/fixtures/slices/*.md`, `skills/vertical-slicing/SKILL.md`, `agents/pilot-architect.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | A stuck red becomes a ranked hypothesis list | 4, 8 | `skills/diagnosing-bugs/SKILL.md`, `agents/pilot-lander.md`, `agents/pilot-implementer.md`, `vendor/methodology.md`, `VENDOR.md` | S1 (`agents/pilot-implementer.md`, `vendor/methodology.md`, `VENDOR.md`) | `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The fundamentalist names the anti-pattern a test trips | 6 | `agents/pilot-fundamentalist.md` | S1 (`test-design`'s anti-pattern names) | `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | Sweep: `pilot-agents` pins, first half | 5 | `scripts/test/pilot-agents.test.mjs` (blocks to l.612) | – | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | Sweep: `pilot-agents` pins, second half | 5 | `scripts/test/pilot-agents.test.mjs` (blocks from l.858) | S5 (`scripts/test/pilot-agents.test.mjs`) | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | Sweep: docs, README, install, rules and ADR pins | 5 | `install`, `pilot-rules`, `rules-dedup`, `readme-flow`, `readme-pitch`, `run-remote-readme`, `deck-readme`, `operating-*` (3), `suite-at-landing-docs`, `adr-co-pilot-tickets`, `adr-index-stop`, `deck/test/skeleton` tests | – | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | Sweep: lane and ticket pins | 5 | `ticket-making`, `ticket-states`, `yellow-co-pilot`, `yellow-lane-wording`, `three-lanes-wording`, `red-list`, `pilot-need`, `deck/test/ticket-live-scope`, `yellow-shown`, `parallel` tests | – | `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 | Sweep: audit and deck report pins | 5 | `audit-*` (9 in scripts/test), `deck/test/audit-kind`, `audit-offer`, `audit-pick`, `auditor-owner`, `doctor`, `question-shape`, `record-report`, `report-record` tests | – | `pilot:typescript-reviewer` | [S9](slices/S9.md) |
| S10 | Sweep: architect, slicing and verdict pins | 5 | `architect-deeper`, `deepening`, `slice-graph`, `slice-interface`, `seam-change`, `security-trigger`, `verdict-pass-architect`, `verdict-pass-pilot`, `bigger-jobs-*` (3), `test-depth`, `trivial-work`, `base` tests | – | `pilot:typescript-reviewer` | [S10](slices/S10.md) |
| S11 | Sweep: crew prompt pins, voice and gates | 5 | `crew-voice`, `crew-waits`, `grilling-voice`, `handoff-wording`, `implementer-steps`, `suite-at-landing-wording`, `lander-wording`, `fundamentalist-case`, `cd-shape-wording`, `co-pilot-friction-wording` tests | – | `pilot:typescript-reviewer` | [S11](slices/S11.md) |
| S12 | Sweep: crew prompt pins, QA, research and skills | 5 | `principles-sweep`, `qa-preview`, `qa-taste`, `read-window-wording`, `report-record-wording`, `report-format`, `research-first-crew`, `research-first`, `general-purpose`, `methodology-skills`, `run-remote-prose`, `state-words`, `toolbox` tests | S1 (`scripts/test/methodology-skills.test.mjs`) | `pilot:typescript-reviewer` | [S12](slices/S12.md) |

All sweep files are under `scripts/test/` as `<name>.test.mjs` unless `deck/test/` is named. Models: S1-S4 opus (each hits the agent-configuration trigger); S5-S12 sonnet (precise: the census decides each block, only test files change). Width 10: once S1 and S5 are green, S2-S4 and S6-S12 have no unmet blocker.

## 9. Acceptance evidence

In the order the user meets it:

1. S1's PR: `skills:` line with `test-design`; `measure-prompt` before/after rows for pilot-implementer; `grep -c refactor skills/tdd-workflow/SKILL.md` → 0; `test-design`'s two new anti-patterns and the agreed-seams paragraph; `check-references`, `check-provenance skills/`, `build-vendor-ledger --check` → 0.
2. S2's PR: `check-slices` on a slice file without `Misses:` → exit 1 naming `misses`; on `vertical-slicing` → 0; `measure-prompt` architect ≤ 9287.5.
3. S3's PR: the two load lines; `diagnosing-bugs` Phase 3 hand-off and two-fix rule; QA's own share unchanged.
4. S4's PR: one bullet; fundamentalist share +≤40 tokens.
5. S5-S12's PRs: each a per-file table (tests cut, asserts cut, lints kept and the rule each keeps); one kept lint shown turning red on a scratch copy; `npm run test:changed` green.
6. After S12: a re-classification of `scripts/test`, `deck/test`, `hooks/test` finds 0 PIN and 0 MIXED blocks.
7. The fixture run (L7): an implementer on a fixture slice whose easy test is a prose pin writes a behaviour test or none, and a reviewer given a fixture diff holding a prose pin names "prose pin".
8. The full suite at `pilot land`.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3, 6, 8 |
| S2 | planned | | | | – | 3, 5, 7 |
| S3 | planned | | | | S1 | 4, 8 |
| S4 | planned | | | | S1 | 6 |
| S5 | planned | | | | – | 5 |
| S6 | planned | | | | S5 | 5 |
| S7 | planned | | | | – | 5 |
| S8 | planned | | | | – | 5 |
| S9 | planned | | | | – | 5 |
| S10 | planned | | | | – | 5 |
| S11 | planned | | | | – | 5 |
| S12 | planned | | | | S1 | 5 |
| crew-tests-behaviour | planned | feat/crew-tests-behaviour | | | S1-S12 | 1-8 |
