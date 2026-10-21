# Deep modules: seam-first tests, judged for depth

Ticket `itm_f72eba6ffde0`; merge thread `itm_267225be8319` resolved `merged none`. Base
`feat/audit-fixes` 9d73120 (draft #320, on #319 and #318). Research and brainstorm on
`itm_6b3e165e91f0`.

## 1. Problem

"i want to integrate the philosophy of deep modules into the pilot deck … using for test
creation is probably the best place to go … we dont have much architecture aimed at test
creation … there should be more effort into planning in general, rather than leaving
decisions to mid-run questions." The tests are "the tests the crew writes for the user's
projects. per slice (TDD workflows on a per-slice basis). existing pins can be migrated."

Today a slice file's Tests field is "the test names to write, in order, each with what it
asserts" (`skills/vertical-slicing/SKILL.md:76`). Nothing ties a test to the seam it
crosses, so implementers reach into internals or pin prose, and seam choices surface
mid-run. Two jobs ride along from the chat (`itm_0bfcf27836de`): the architect's merge step
leans towards larger tickets, and its merge item reads "Merging tickets".

## 2. Spec

Lines 1–5 sharpen the ticket body; 6–7 are its comments. *Assumed* marks scope the user
has not confirmed (A-rows in §6).

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Every Tests line in a slice file reads `` `<name>`: `<Interface symbol>` → <observable result> ``, the symbol present in that slice's Interface block, and the file carries one `Rewrite check:` line: what stays true if the implementation behind the interface were replaced. Lands in the `vertical-slicing` anatomy and worked example and the architect's item 8. | `node scripts/check-slices.mjs` passes on the skill's worked example and on `docs/design/deep-modules/slices/`, and fails on fixtures with a symbol-less test, a symbol missing from the Interface block, no rewrite check, and 61 lines. |
| 2 | Before cutting slices, the architect runs a deepening pass over the modules the feature touches (deletion test, `DEEPENING.md`'s dependency categories), folds the shallow ones, and records a **Seams** table in §3: seam, interface, what was folded behind it, category. Every test targets a seam in it. A fold that changes code is its own slice, capped at 200 changed lines (*assumed*, A2). | A pin on the architect's section; live (A4): the architect on a fixture with two shallow modules records one seam. |
| 3 | The fundamentalist's one pass over the feature judges every test the diff adds or changes; three kinds are findings with their fix: a test reaching past the interface, a test whose rewrite check would fail, a prose pin standing in for a behaviour. Once, at the end; no per-slice pass. | A pin; live (A4): a fixture diff with one internals-reaching test and one source-text pin yields those two findings and no others. |
| 4 | This repository's pins migrate where a behaviour stands in (*assumed* scope, A3): (a) a pin on a code file's source text becomes a test of what the code does; (b) a prompt pin that only says a `pilot <subcommand>` or deck tool is named is replaced by one corpus check: each named subcommand dispatches, each named tool exists, an agent naming a deck tool is granted it. A wording pin stays. | The PR lists each migrated pin and what it now asserts; `npm test` green; the PR states the migration delta, both numbers: the pins migrated (removed or replaced, each listed) and the wording pins added (A5). |
| 5 | The implementer's red list is the Tests section in order, each test written through its named Interface symbol; a test that needs a symbol the block lacks goes to `main` as a seam change (ADR 0038), never past the interface. | A pin on `agents/pilot-implementer.md`. |
| 6 | Merge first leans towards the larger ticket: a same-surface green ticket starts from "Merge these", and the architect still judges and may recommend against with its reason; the prose gives the reason for the lean (two runs on one surface rebase on each other and cost two QA passes) and names a small cut, or one agreed in grilling, as not a reason on its own. | A pin on that sentence; on a scratch deck the question for a same-surface ticket does not give "grows the cut" as its reason against. |
| 7 | The merge item is titled "Merging tickets"; its body opens with the live ticket's name, then each candidate's id and name. Still a `question`. | A pin; a scratch deck shows the title. |

## 3. Findings

| Area | What exists | Path |
|---|---|---|
| Slice anatomy | Ten fields; Tests is "names … each with what it asserts"; Interface already admits "for a prompt file its headings and field names"; the skill is the package's own (`origin: hazzard`) | `skills/vertical-slicing/SKILL.md:66-129` |
| Shape pins | Anatomy pinned by regex on the worked example (ten fields, `^1\.\s+\``) | `scripts/test/slice-interface.test.mjs` |
| Architect | Item 8 names the slice fields; Merge first titles the item `Merge into <live title>?` (title unpinned) | `agents/pilot-architect.md:23-40,113-126` |
| Merge pins | Rule pinned by phrase; no lean, no title | `scripts/test/merge-first.test.mjs` |
| Implementer | "The slice file's Tests field names the red steps, in order" | `agents/pilot-implementer.md:41-43` |
| Fundamentalist | Subtraction pass already flags "a test that … asserts an implementation detail"; Modularity names deep modules; one pass at the end | `agents/pilot-fundamentalist.md:54-85,129-137` |
| Deepening | Vendored verbatim: categories, "replace, don't layer"; `improve-codebase-architecture` deliberately not vendored | `skills/codebase-design/DEEPENING.md`; `vendor/methodology.md:91` |
| Seam changes | A seam is stated once; a change goes through `main` | ADR 0038 |
| Corpus check | `checkReferences(root, paths)` → `{ok, failures, checked, references}`, over the shipped surface | `scripts/check-references.mjs:177-202` |
| CLI | Subcommands dispatched by `command ===` | `bin/pilot.mjs:85-157` |
| Deck tools | `export const TOOLS` | `deck/tools.mjs:136` |
| Source-text pins | `deck/tools.mjs` regexed; the guard notice reverse-built from source; `PICKUP_MARK` looked up in source | `scripts/test/pilot-agents.test.mjs:400`; `scripts/test/pilot-rules.test.mjs:294,368`; `scripts/test/audit-session-start.test.mjs:160` |
| Pins | `assert.match/doesNotMatch/.includes(` in `scripts/test` + `deck/test`: 2115; ~28 pin only a named command or deck tool | §9 command |
| Budgets | No token budget on the architect, implementer or fundamentalist; `vertical-slicing` is preloaded by the architect | `scripts/test/measure-prompt.test.mjs:100-124` |

**Shared with the base's planned slices.** audit-fixes S11 edits `agents/pilot-architect.md`
(Read before you design) and S7, S11 edit `scripts/test/pilot-rules.test.mjs`. Here only
S7 touches `pilot-rules.test.mjs` (lines 294, 368), and no slice touches the Read section.

### Seams

The deepening pass run on this feature itself (spec 2).

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `checkSlice` | slice-file text → problems; CLI `check-slices <path>…` | the per-field regexes on the worked example in `slice-interface.test.mjs` | in-process |
| `checkReferences` | unchanged signature; three more failure kinds | ~28 prompt pins naming a command or tool | local-substitutable (fs) |
| A prompt section | its heading and its rule sentence | — (the prose is the interface: wording pins) | — |
| `TOOLS`, a hook's stdin → stdout | existing | the source-text pins in §3 | in-process / local |

## 4. Ubiquitous language

- **Seam-first test**: a Tests line naming one Interface symbol and the observable result through it.
- **Rewrite check**: the slice's one line saying what stays true if the implementation behind its interface were replaced.
- **The design's seams**: the rows of the artefact's Seams table; every test targets one.
- **Fold**: merging shallow modules behind one interface, their old tests replaced by tests at it.
- **Wording pin**: an assertion on text whose wording is itself the product: a sentence a hook injects, a token budget, a prompt's rule sentence.
- **Prose pin standing in for a behaviour**: an assertion on text where something executable could be asserted instead: a code file's source, or a prompt merely naming a command or tool.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth: forks. Only decisions whose paths produce materially different deliverables reach the user as items (user, `itm_bfd4884a74e5`, 2026-10-05). | The user's choice. | Every. |
| L2 | The shape is checked by `scripts/check-slices.mjs`, an exported function plus CLI in `check-references`' pattern. | One deep module the tests, the architect, the fundamentalist and QA all cross; it can read a user's slice files. | More regexes in `slice-interface.test.mjs`: only reads this repo's skill. |
| L3 | `check-slices` checks only the paths it is given. | ~28 earlier features' slice files predate the shape. | Checking all of `docs/design`: retrofit outside the request. |
| L4 | One rewrite check per slice, not per test. | The ticket's wording; the 60-line cap. | Per test: doubles the Tests section. |
| L5 | Reference pins are replaced by extending `checkReferences`. | It already is the shipped-surface corpus check, run by `npm test`. | A second checker script. |
| L6 | Each slice's pins go in a test file of its own, except where the topic file exists (`merge-first`, `slice-interface`). | Parallel slices stay disjoint; keeps clear of audit-fixes' `pilot-rules.test.mjs`. | Adding to `pilot-agents.test.mjs` (1355 lines, shared). |
| L7 | The fundamentalist's test check is a subsection of its one pass, after the subtraction pass. | Spec 3: once, at the end. | A per-slice test review. |
| L8 | A test that needs a symbol the Interface block lacks is a seam change through `main`. | ADR 0038; the decision returns to planning. | Testing past the interface "for now". |
| L9 | ADR 0082 records: tests aim at the design's seams; a wording pin only where the wording is the product. | 0070–0081 are reserved by the base's plans. | No ADR. |
| L10 | The merge lean is prose that states its reason, not a list of allowed reasons; title "Merging tickets", no new kind. | The user's correction on `itm_0bfcf27836de`. | A fixed rule. |
| L11 | QA runs in a scratch clone: `npm test`, `check-slices`, and one live run each of the architect (fixture feature with two shallow modules) and the fundamentalist (fixture diff), outputs read. Never the user's real `~/.claude`, this repository's worktrees or the live deck (user, `itm_0b4c5d88cdbe`, 2026-10-05; was A4). | Specs 2 and 3 are model behaviour; only a run shows it. | Deterministic only: pins as the sole evidence. |
| L12 | Spec 4 migrates narrowly: (a) pins on a code file's source text become behaviour tests and (b) reference-only pins are replaced by the `checkReferences` corpus check; a prompt's rule-sentence pins, injected hook text and token budgets stay as its interface (user, `itm_9d6640026c25`, 2026-10-05; was A3). | A prompt has no executable behaviour to stand in for its wording. | Wide: rule-sentence pins replaced by live model runs, costing tokens on every run and determinism. |
| L13 | The deepening pass is architect prose leaning on the vendored `codebase-design/DEEPENING.md`; Pocock's `improve-codebase-architecture` is not ported (user, `itm_e87ae5bf8c96`, 2026-10-05; was A1). | Upstream is interactive (the user picks candidates) while the architect runs with the user away; `vendor/methodology.md` excludes it. | A port: a vendored file, ledger rows and about one more slice. |

## 6. Assumed decisions

| # | Question | Default taken | Tradeoff |
|---|---|---|---|
| A1 | Port Pocock's `improve-codebase-architecture`? | Answered by the user: locked as L13. | |
| A2 | Diff cap for a fold slice. | 200 changed lines; a bigger fold is not done in the run and goes to `main` as a candidate ticket. | A large shallow cluster stays shallow this run; the slice limit (400) keeps room for the feature's own tests. |
| A3 | How far spec 4 migrates. | Answered by the user: locked as L12. | |
| A4 | QA environment. | Answered by the user: locked as L11. | |
| A5 | Spec 4's evidence. | Spec 4's evidence is the migration delta, not a falling total — this feature's own wording pins (allowed by L12) raise the total; taken by the co-pilot. | A pin count alone no longer shows the migration; the PR's two numbers and its list do. |
| A6 | What a fold slice delivers. | A fold slice delivers the lines whose behaviour it keeps; its red step is the new seam's test; taken by the co-pilot. | A fold traces to no new spec line; its seam test is red only because the seam does not yet exist. |

## 7. Out of scope

Retrofitting earlier slice files; vendoring `improve-codebase-architecture`; editing the
vendored `tdd-workflow`; rewording prompt rule-sentence pins; a per-slice fundamentalist
pass; `agents/pilot.md`; the three unmerged tickets (`itm_4f3c3e333032`, `itm_b26f9ce833c9`,
`itm_db9d90dd1ba0`).

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A slice file's tests are checked for seam-first shape (walking skeleton) | 1 | `scripts/check-slices.mjs` (new), `scripts/test/check-slices.test.mjs` (new), `scripts/test/fixtures/slices/*.md` (new), `skills/vertical-slicing/SKILL.md`, `scripts/test/slice-interface.test.mjs` | – | [S1](slices/S1.md) |
| S2 | The architect deepens, then writes seam-first slices | 1, 2 | `agents/pilot-architect.md` (Decide; item 3, item 8), `scripts/test/deepening.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 | The implementer's red list is the seam-first Tests | 5 | `agents/pilot-implementer.md`, `scripts/test/red-list.test.mjs` (new) | S1 | [S3](slices/S3.md) |
| S4 | The fundamentalist judges tests for depth | 3 | `agents/pilot-fundamentalist.md`, `scripts/test/test-depth.test.mjs` (new), `docs/adr/0082-tests-aim-at-the-designs-seams.md` (new) | S1 | [S4](slices/S4.md) |
| S5 | Merging tickets leans towards the larger ticket | 6, 7 | `agents/pilot-architect.md` (Merge first), `scripts/test/merge-first.test.mjs` | S2 | [S5](slices/S5.md) |
| S6 | Named commands and deck tools are checked, not pinned | 4 | `scripts/check-references.mjs`, `scripts/test/references-hold.test.mjs` (new), the reference-only pins it deletes in `scripts/test/*.test.mjs` except `merge-first`, `slice-interface`, `pilot-rules` | S3, S4, S5 | [S6](slices/S6.md) |
| S7 | Source-text pins test what the code does | 4 | `scripts/test/pilot-agents.test.mjs` (:400), `scripts/test/pilot-rules.test.mjs` (:294, :368), `scripts/test/audit-session-start.test.mjs` (:160) | S6 | [S7](slices/S7.md) |

S2, S3 and S4 run in parallel after S1. S6 edits many test files, so it waits for every
slice that adds pins; S7 follows it on `pilot-agents.test.mjs`. 7 slices, one run.

## 9. Acceptance evidence

In a scratch clone of the feature branch (A4), in the order the user meets it:

1. `node scripts/check-slices.mjs docs/design/deep-modules/slices skills/vertical-slicing/SKILL.md` exits 0; on `scripts/test/fixtures/slices/` it names each bad fixture's rule (1).
2. Open `agents/pilot-architect.md`: the deepening step and item 8's seam-first Tests (1, 2); spawn the architect on the fixture feature: its §3 Seams table has one seam where there were two shallow modules, and its slice files pass `check-slices` (1, 2).
3. Open `agents/pilot-implementer.md`, The loop: the red list is the Tests section through its symbols (5).
4. Spawn the fundamentalist on the fixture diff: exactly two test-depth findings (3).
5. On a scratch deck, the architect's merge item for a same-surface ticket reads "Merging tickets", its body opening with the live ticket's name, recommending "Merge these" or giving a reason other than the cut's size (6, 7).
6. `npm test` green, and the PR states the migration delta: the pins migrated (removed or replaced, each listed) and the wording pins added, both numbers (4, A5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 1, 2 |
| S3 | planned | | | | S1 | 5 |
| S4 | planned | | | | S1 | 3 |
| S5 | planned | | | | S2 | 6, 7 |
| S6 | planned | | | | S3, S4, S5 | 4 |
| S7 | planned | | | | S6 | 4 |
| deep-modules | planned | feat/deep-modules | | | S1–S7 | 1–7 |
