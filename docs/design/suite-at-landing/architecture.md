# The suite runs once per landing

Ticket itm_82f39930287e · slug `suite-at-landing` · base `origin/pilot` 54d11846 · ADR 0166

## 1. Problem

The full suite (about 4,190 tests, 2.5 to 4 minutes on Windows, two gate slots per machine) runs at every step of a
run: the slice's phase gate, `pilot integrate` (base, then slice), the fix round, QA, `pilot integrate --default`,
`pilot sync` and `pilot land`. A one-slice feature ran it at least 8 times in a day, and every landing queued behind
someone else's suite. The user wants one systematic change: every step before the landing runs only the tests the
diff touches, and the full suite runs once, at `pilot land`.

## 2. Spec

Lines 1-8 agreed with the user (itm_5853855c87bd, itm_ee52845c8255, itm_b13fece7869c).

1. `npm run test:changed -- --since=<ref>` runs only the test files the diff touches, from merge-base(ref, HEAD) to
   the working tree (staged, unstaged and untracked): the changed test files, the tests that import a changed module,
   directly or through other modules, the tests that name a changed file's basename (md pins, spawned scripts), and
   the whole-tree tests. It prints `selected <n> of <m> test files since <sha7>`. *Evidence: a selector test over a
   fixture repository's diff; bar: 0 files missing and 0 extra.*
2. It falls back to the full suite and prints `full suite: <reason>` when the diff touches package.json, the
   lockfile, the gate, the gate slots, the spawn counter or the selector, or a changed `.mjs`/`.js` that no test
   reaches (naming the file), or when the selection's argv would pass 24000 characters. Changed prose that no test
   names runs only the whole-tree tests. *Evidence: one selector test per trigger, 6 in all, each naming its reason.*
3. The full suite runs nowhere before the landing: the slice gate, `pilot integrate` (slice, base, `--default`, a
   resumed merge), `pilot sync` (on its own and inside land), the fix round, QA and the lander's resolution all run
   the selection. Land's merge of the feature into pilot runs `npm test` in full, once. *Evidence: integrate's and
   sync's tests see `--since=<start>` in the command; land's test sees the plain `npm test` on the feature merge;
   bar: a one-slice feature runs the full suite exactly 1 time from take to landed.*
4. Only a full run, a fallback included, takes a gate slot; a selected run never prints `gate: waiting for a slot`.
   *Evidence: a gate test with both of the 2 slots held starts a selected run at once.*
5. A repository with no `test:changed` script, or one tested by `git config pilot.test`, runs its own full test
   command at every step as today. *Evidence: an integrate test over a package.json with only `test` runs `npm test`
   in a slot, 1 slot taken.*
6. The crew and the docs say the same: the implementer, co-pilot, QA and lander prompts, `docs/OPERATING.md` and
   the `pilot integrate`, `sync` and `land` help name the selection and that the full suite is the landing's.
   *Evidence: wording pins; `check-references` exits 0; measure-prompt within each agent's headroom.*
7. Land's comment on the feature PR reads `landed on pilot at <sha>; full suite <p> pass, <f> fail`. *Evidence: a
   pin on the land comment; bar: 1 comment per open PR, as today.*
8. practitioner: an affected-tests maintainer (Jest `--findRelatedTests`, Nx affected) measures the selector on real
   history before trusting it: `node scripts/select-tests.mjs --replay 20` prints each of the last 20 slice merges on
   pilot with its selection size and the median. *Evidence: its output in the S10 PR; bar: median at most 46% of the
   test files, measured over trigger-free merges (was 60% (proxy); a proxy measured 56% for the transitive rule, A4).*
9. (added by S11, which the pilot numbered 7; 7 stays the land comment) A module under a `test/lib/` directory is a
   helper, never a test: the census and every selection skip it. *Evidence: a pin that the census total holds no
   `/lib/` path; the full-suite count drops by the helper count (451 to 444).*
10. (added at step 7, S12) When the spawn count is over the ceiling, the gate names the three test files that spent
   the most spawns. *Evidence: a gate pin over a low ceiling prints `spawns over <c>; most: <file> <n>, ...`.*

## 3. Findings

- `scripts/gate.mjs` is `npm test`: ledgers rebuild, a gate slot (`takeSlot`), a process census, `node --test` over
  `gateArgv(args)` (no file arguments = `TEST_GLOB`, the whole tree), and the spawn ceiling. 262 lines.
- Every pre-landing suite goes through one function, `scripts/integrate.mjs` `runTests(cwd, test, {label})`:
  integrate's slice and base (l.339), `--default` (l.480), its resume (l.560), and `scripts/sync.mjs`
  `mergeIntoPilot` (l.109), which `sync` and `land` both call. `runTests` takes the slot itself and sets
  `PILOT_GATE_SLOT`, so the gate under it takes none.
- `repoTestCommand(cwd)` (integrate.mjs l.151) is `npm test` or `git config pilot.test`, never an argument (ADR 0110,
  pinned by `scripts/test/test-command.test.mjs`). Integrate also runs on other repositories.
- Land = `sync` (a suite only when main moved: `mergeIntoPilot` returns early when pilot holds it) + `mergeIntoPilot`
  of the feature (a suite). The comment is `comment({gh, head, sha})` (land.mjs l.269).
- Prose: `agents/pilot-implementer.md:53` already runs a slice's own files in red/green, the full suite "at the phase
  gate"; `agents/pilot-qa.md:90` "full suite"; `agents/pilot-lander.md:33` `npm test` once on the resolution;
  `docs/OPERATING.md` has no gate section; help in `bin/pilot.mjs:75-90`.
- 430 test files; 148 read a `.md`, 91 spawn a script by path, 195 use `import()` with a literal path, and about 18
  walk the whole tree (`ls-files`, `readdirSync(ROOT)`): an import graph alone misses most prose pins.
- Replay proxy over the last 25 slice merges: direct importers plus basename mentions select a median of 67 of 430
  files; with transitive importers, 241 (server.mjs imports most of the deck).
- Ticket itm_d1054e1ebb14 (one integration line) removes the sync from land next; it uses `mergeIntoPilot`'s
  `since` option as is.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/select-tests.mjs` (new) | `selectTests`, `scopeLine`, `scopeOf`, `TREE_TESTS`, `FULL_TRIGGERS`, `replay` | the diff, the import graph, the mention scan, the fallback rules | local-substitutable (a git fixture, fs) |
| `scripts/gate.mjs` | `runGate(args, { select, slot })`, `gateArgv` | the `--since` branch and the slot-for-full rule | in-process (injected) |
| `scripts/integrate.mjs` | `testCommand(cwd, { since })`, `runTests(cwd, test, { label, slot })` | `repoTestCommand`'s choice, the slot decision, the scope parse | local-substitutable |
| `scripts/sync.mjs` | `mergeIntoPilot({ ..., since })` → `{ sha, merged, line, counts }` | which merge tests a selection | local-substitutable |
| `scripts/land.mjs` | `comment({ gh, head, sha, counts })` | the PR comment text | true external (`gh`, injected) |

Deletion test: `repoTestCommand` is folded into `testCommand` (its callers need the command and whether it selects);
the five `runTests` call sites stay, each now passing its `since`.

## 4. Ubiquitous language

- **Selection**: the test files `selectTests` answers for a diff; a run over it is a **selected run**.
- **Full run**: `npm test`, every test file; a fallback is a full run with a reason.
- **Since**: the ref the diff is taken from, as merge-base(since, HEAD).
- **Whole-tree test**: a test that reads every tracked file of a kind; in every selection (`TREE_TESTS`).
- **Scope line**: `selected <n> of <m> test files since <sha7>` or `full suite: <reason>`.

## 5. Locked decisions

- **L1** Depth: forks only (itm_8d04acffdf18, user). Questions go up only where paths fork.
- **L2** A separate `npm run test:changed -- --since=<ref>`; `npm test` stays full, so CI, the Linux referee and other
  repositories are untouched (itm_5853855c87bd, user). Rejected: `npm test` selecting by default.
- **L3** A changed source file no test reaches falls back to full, naming the file (itm_ee52845c8255, user).
  Rejected: whole-tree tests and a warning.
- **L4** Nothing before the landing runs full, QA and the lander included (itm_b13fece7869c, user). Rejected: QA full.
- **L5** One module, `select-tests.mjs`, owns the policy and the scope line; the gate executes it; integrate only
  chooses the command. Rejected: selection inside integrate (other repos, and agents' phase gates, would not reach it).
- **L6** The diff is merge-base(since, HEAD) to the working tree plus untracked files, because integrate's slice merge
  is `--no-commit` when the tests run. Rejected: `since...HEAD`, which misses the merge in hand.
- **L7** An empty selection runs no `node --test`: `gateArgv` with no files would glob the whole tree.
- **L8** `mergeIntoPilot` is full unless given `since`; only `sync` passes it, so land's feature merge is the one
  full run with no change in land. Rejected: a `full` flag on land's call (two places to keep in step).
- **L9** The gate takes a slot only for a full run; `runTests` takes none and sets no `PILOT_GATE_SLOT` for a
  selecting command, so a fallback inside the gate takes its own. Rejected: every run in a slot (spec 4).
- **L10** `--since` takes a ref, resolved by `git rev-parse --verify` to a sha before use, argv only; integrate and sync
  pass a full sha, so the composed command carries hex only (ADR 0110 holds).

## 6. Assumed decisions

- **A1** The mapping is transitive importers (static and literal `import()`) plus basename mentions plus `TREE_TESTS`.
  Tradeoff: a median 241 of 430 files against 67 for direct importers, for no miss through an import chain; the full
  run at land is the backstop either way. Rejected: direct importers only; a hand-kept map file.
    Verdict: stands — the agreed spec 1 says "directly or through other modules"; S10's replay measures what it costs.
- **A2** `TREE_TESTS` is a list in `select-tests.mjs`, kept honest by a pin that fails when a test file walking the
  tree (`ls-files`, `readdirSync` of the root) is missing from it. Rejected: detecting tree tests at run time (a
  regex over test source, silent when it drifts).
    Verdict: stands — a named list is reviewable, the pin catches drift.
- **A3** Spec 7 drops the draft's "which tests each step ran" from the PR body: no record carries per-step runs; each
  integrate and sync line carries its scope line instead. Rejected: a new run-record field.
    Verdict: stands — the integrate lines already reach the co-pilot's reports.
- **A4** Spec 8's bar is a median of at most 46% of files, the replay's figure (was 60% (proxy), from a proxy at 56%); seconds are not measured because the
  slow tests are concentrated, and the S10 replay states the real number. Rejected: a seconds bar from one timing run.
    Verdict: stands — the bar is checkable by a command; the replay prints the real figure.
- **A5** Other repositories opt in by a `test:changed` script that accepts `--since=<sha>`; `git config pilot.test`
  repositories stay full. Rejected: a second git config key.
    Verdict: stands — no other repository needs it today.
- **A6** The argv bound: a selection whose joined absolute paths pass 24000 characters runs full (Windows' 32767
  limit). Rejected: relative paths (the census names a checkout by its absolute path).
    Verdict: stands — bounded by measurement; no queued run grows the test tree past it.
- red team: walking S1's first red step against `gateArgv` found that zero selected files would run the whole tree
  (`files.length === 0` pushes `TEST_GLOB`): L7, and S1 test 3.
- red team: S1 (gate prints the scope line) and S5 (integrate reads it) would each half-build the line's format.
  Change: S1 exports `scopeLine` and `scopeOf` from `select-tests.mjs`; S5 comes after S1 for them.
- red team: S5's slot-free `runTests` would still set `PILOT_GATE_SLOT`, so a fallback inside the gate would run full
  with no slot: L9, and S5 test 2.
- red team: the replay (S10) and the rules (S2, S3) share `select-tests.mjs`; S10 waits on S3 rather than stubbing the
  rules.

## 7. Out of scope

- The Linux referee loop and CI: they run `node scripts/gate.mjs`, full, unchanged.
- Removing the sync from land, and the feat→main merge before Gate 2: itm_d1054e1ebb14.
- Trivial work's one PR to the default branch: no landing, so its full gate stays (`agents/pilot.md:192`).
- Test-seconds weighting, caching results across runs, and a selector for Jest or Vitest repositories.

## 8. Slices

Width 5; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `npm run test:changed -- --since=<ref>` runs the changed tests and their importers | 1 | `scripts/select-tests.mjs` (new), `scripts/gate.mjs`, `package.json`, `scripts/test/select-tests.test.mjs` (new), `scripts/test/gate-select.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 | The selection follows import chains, prose pins and whole-tree tests | 1 | `scripts/select-tests.mjs`, `scripts/test/select-tests.test.mjs` | S1 (`select-tests.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | The selection falls back to full and says why | 2 | `scripts/select-tests.mjs`, `scripts/test/select-fallback.test.mjs` (new) | S2 (`select-tests.mjs`) | typescript | [S3](slices/S3.md) |
| S4 | A selected run takes no gate slot | 4 | `scripts/gate.mjs`, `scripts/test/gate-slot-scope.test.mjs` (new) | S1 (`gate.mjs`'s `--since` branch) | typescript | [S4](slices/S4.md) |
| S5 | `testCommand` picks the repository's selected or full command | 5 | `scripts/integrate.mjs`, `scripts/sync.mjs`, `scripts/test/test-command.test.mjs` | S1 (`scopeOf`, the `test:changed` contract) | typescript, security | [S5](slices/S5.md) |
| S6 | Integrate and sync run the selection | 3 | `scripts/integrate.mjs`, `scripts/sync.mjs`, `scripts/test/integrate-select.test.mjs` (new) | S5 (`testCommand`, `runTests`) | typescript | [S6](slices/S6.md) |
| S7 | The landing runs the full suite once and says so on the PR | 3, 7 | `scripts/land.mjs`, `scripts/test/land-suite.test.mjs` (new) | S6 (`mergeIntoPilot`'s `counts`) | typescript | [S7](slices/S7.md) |
| S8 | The crew's gate steps run the selection | 6 | `agents/pilot-implementer.md`, `agents/pilot-co-pilot.md`, `agents/pilot-qa.md`, `agents/pilot-lander.md`, `scripts/test/suite-at-landing-wording.test.mjs` (new) | S1 (the `test:changed` command) | typescript, security | [S8](slices/S8.md) |
| S9 | The docs, the help and ADR 0166 | 6 | `docs/OPERATING.md`, `bin/pilot.mjs`, `docs/adr/0166-the-full-suite-runs-at-the-landing.md` (new), `docs/adr/README.md`, `scripts/test/suite-at-landing-docs.test.mjs` (new) | S1 (the `test:changed` command) | typescript | [S9](slices/S9.md) |
| S10 | The selector replays the last slice merges | 8 | `scripts/select-tests.mjs`, `scripts/test/select-replay.test.mjs` (new) | S3 (`select-tests.mjs`) | typescript | [S10](slices/S10.md) |
| S11 | Helper modules under test/lib are not tests | 9 | `scripts/select-tests.mjs`, `scripts/test/select-tests.test.mjs` | S2 (`select-tests.mjs`) | typescript | [S11](slices/S11.md) |
| S12 | The spawn ceiling names the tests that spent it (added) | 10 | `scripts/count-spawns.mjs`, `scripts/gate.mjs`, `scripts/test/gate-spawns.test.mjs` | the step 7 fix round (`gate.mjs`) | typescript | [S12](slices/S12.md) |

S1 is the walking skeleton: a human runs `npm run test:changed -- --since=origin/pilot` in a worktree and sees a
scope line and only those files run. Stems: S1→S2→S3→S10 and S1→S5→S6→S7, 4 each; S4, S8, S9 run beside them.

## 9. Acceptance evidence

0. Timed: QA runs `npm run test:changed -- --since=origin/pilot` on one real slice branch and `npm test` once, and records both wall times beside the replay's file figure (A4).

1. In a feature worktree, `npm run test:changed -- --since=origin/pilot` prints `selected <n> of <m> test files`
   and runs those files only (spec 1); touching package.json prints `full suite: package.json` (spec 2).
2. With two full gates running elsewhere, a selected run starts without `gate: waiting for a slot` (spec 4).
3. `pilot integrate <slice>` on a one-file slice prints its scope line in the integrated line (spec 3); in a
   repository with only `npm test` it runs that, as today (spec 5).
4. `pilot land` runs `npm test` once on the feature merge, and the feature PR shows
   `landed on pilot at <sha>; full suite <p> pass, <f> fail` (spec 3, 7).
5. The implementer, QA and lander prompts, OPERATING.md and `pilot help` name `test:changed` and the landing's
   full run; `node scripts/check-references.mjs` exits 0 (spec 6).
6. `node scripts/select-tests.mjs --replay 20` prints 20 merges and a median at most 46% (was 60% (proxy)) (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/suite-at-landing-s1` | – | – | – | 1 |
| S2 | planned | `slice/suite-at-landing-s2` | – | – | S1 | 1 |
| S3 | planned | `slice/suite-at-landing-s3` | – | – | S2 | 2 |
| S4 | planned | `slice/suite-at-landing-s4` | – | – | S1 | 4 |
| S5 | planned | `slice/suite-at-landing-s5` | – | – | S1 | 5 |
| S6 | planned | `slice/suite-at-landing-s6` | – | – | S5 | 3 |
| S7 | planned | `slice/suite-at-landing-s7` | – | – | S6 | 3, 7 |
| S8 | planned | `slice/suite-at-landing-s8` | – | – | S1 | 6 |
| S9 | planned | `slice/suite-at-landing-s9` | – | – | S1 | 6 |
| S10 | planned | `slice/suite-at-landing-s10` | – | – | S3 | 8 |
| S11 | planned | `slice/suite-at-landing-s11` | – | – | S2 | 9 |
| suite-at-landing | planned | `feat/suite-at-landing` | – | – | S1–S11 | 1–9 |
