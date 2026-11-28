# tested-once: a slice is tested once, not at every step

Ticket `itm_7c9012a1a71a` · slug `tested-once` · base `main` at `ffc8384` · ADR NNNN (`docs/adr/NNNN-tested-once.md`)

## 1. Problem

Implementing ("yellow") feels very slow, and the user suspects the test suites run too often. Measured on
`itm_be05fa2fbce4`: the full suite already runs once, at land (ADR 0166). What repeats is the selected run,
3.6-7 min each, roughly 18-22 local runs for a five-slice feature (estimated): the implementer's phase gate,
again after review fixes, in `pilot integrate`, again in QA; and the selection often falls back to the whole
suite or pulls in cargo (ADR 0166 L3; cheap-suite `run.json`: "S7: node 148 s + cargo 51.6 s, all for rune
test files outside the slice"). Nothing records how many runs a feature made, so the number is an estimate.

## 2. Spec

Agreed with the user through `main` (2026-11-24), except where marked *assumed*.

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | `pilot integrate <slice>` starts no test process when a green, complete run is recorded for the exact tree the merge produces, selected since the same feat tip; it prints `tests reused: <where> <sha7>`. A moved base, a different tree, or a run that deferred anything: it runs. | scratch-repo test of `integrate` | 0 test spawns reused, 1 otherwise |
| 2 | QA's gate step (`pilot test --as qa`) on the feat tip reuses a CI proof of that tree (`provenTree`, ≥3 green `gate (<os>)` jobs) or a recorded complete green since pilot for that tree, and starts no test process; with neither it runs (since the proved tree when there is one). An integrate run alone is not reusable for QA: its selection covers one slice's diff. | test of `pilot test` with a stubbed host | 0 spawns vs 1 |
| 3 | At slice scope (the implementer's phase gate, `--scope slice`), the selection's whole-tree fallbacks (a file reaching no test, a trigger file, argv overflow) and the cargo step are deferred and printed `deferred: <reason>`; a fix round selects since the pre-fix sha. Integrate, sync, land stay wide. | selection test | lonely file: 0 selected at slice scope, full at default |
| 4 | Every test run through `pilot test`, `integrate`, `sync` or `land` appends one ledger row: where, branch, sha, tree, since, scope, exit, minutes. The run record (`run.json`) lists the feature's rows; the closing report has one total line. | scratch run's `run.json` | rows == runs made |
| 5 | A five-slice feature makes at most 12 local test runs (today est. 18-22). *assumed (A4)* | spec 4's totals on the first run after this lands | ≤ 12 |

Implied: a slice whose gate deferred gets its wide run at integrate (3 feeds 1). The tree tests (`TREE_TESTS`)
still run at slice scope. Cannot mean here: CI's minutes in the ledger (local runs only); the co-pilot's
`pilot checks --wait` block (not asked).

practitioner: a build-cache engineer (Bazel, Nx) keys a test result by the content hash of its inputs, never
by branch or by who says it passed: spec 1-2 key reuse by git tree. Their raw material is the run log with
timings: spec 4. Their outside check is the next real feature's totals: spec 5.

## 3. Findings

- `scripts/integrate.mjs:161` `runTests(cwd, test, opts)`: the one function every CLI test run goes through;
  integrate (`:486` via `runChosen` `:234`), sync and land (`scripts/sync.mjs:113-124`, `mergeIntoPilot`).
  It holds `status` from `spawnSync` (`:180`) and reads the scope line (`scopeOf`).
- `integrate()` `:359`: takes the base (`:451`), merges the slice uncommitted (`:467`), runs once since
  `start`, the feat tip before the call (`:486`). One test run per call; a base-only call runs too.
- `scripts/select-tests.mjs:129` `selectTests`: fallbacks at `:166` (trigger), `:189` (lonely), `:192` (argv);
  `TREE_TESTS` `:57` always selected. `scopeLine` `:268`, `SCOPE` regex `:108`.
- `scripts/gate.mjs:289` `cargoStep(env, which, platform, selection)`: cargo on Windows when `deck/` changed.
- `scripts/checks.mjs:86` `provenTree({host, git, sha, base})`: the tree ≥3 green `gate (<os>)` jobs tested
  (ADR 0212). CI's Windows job runs cargo: Gate run 45347582367 logs `rune deck: cargo test --manifest-path
  deck/rune/Cargo.toml`. The repo is public, so PR CI runs 3 OS (`.github/workflows/gate.yml:31`).
- Agents run tests directly, so nothing records them: `agents/pilot-implementer.md:88`,
  `agents/pilot-qa.md:88`, `agents/pilot-lander.md:41`.
- The run record is stored by the deck (`deck/store-runs.mjs:660` `upsertRecord`) and mirrored byte for byte
  to `run.json` (`deck/server-tools.mjs:199` `mirrorRecord`); `deck/closing-report.mjs:181` builds the
  closing report from it.
- Overlap: PR #152 (prune-worktrees, yellow) plans edits to `scripts/integrate.mjs` (`pruneSlice`),
  `deck/closing-report.mjs` (`stepsOf`), `agents/pilot-implementer.md`, `pilot-qa.md`, `pilot-lander.md`.
  Our edits there are surgical: other functions, other lines.

### Seams

Deepening pass: `runTests` survives the deletion test (three callers would each re-grow slot, log and status
handling) and becomes the only ledger writer. A separate "record" call beside it fails the test: every caller
would have to remember it. `testCommand` is a pass-through for agents, folded behind `pilot test`.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Test ledger (`scripts/test-ledger.mjs`) | `worktreeTree(cwd)`, `recordRun(row, {home})`, `reusableRun({tree, since, home, scope, command})`, `testRunsFor({slug, home})` | the jsonl file, its lock-free append, tree hashing with a temp index | local-substitutable (a scratch `home`) |
| Runner (`runTests` in `scripts/integrate.mjs`) | `runTests(cwd, test, {label, where, branch, since, home, slots, slot})` | the spawn, the log, the slot, the exit status, one ledger row | local-substitutable |
| Agent test command (`scripts/test-cli.mjs`) | `pilot test [--as <role>] [--scope slice] [--since <ref>]`; `testCli(argv, {cwd, host, home})` | ledger reuse, CI proof reuse, `testCommand`, `PILOT_TEST_SCOPE` | remote-but-owned (the host, stubbed) |
| Selection scope (`selectTests`, `cargoStep`) | `selectTests({cwd, since, scope})`, `scopeLine(selection)`, env `PILOT_TEST_SCOPE=slice` | which fallbacks run where | in-process |
| Record's test rows (`upsertRecord`) | `record.tests` on every record write; `closingReportOf` total line | ledger read by slug | in-process |

## 4. Ubiquitous language

- **Ledger row**: one line `runTests` appends after a test process exits; its `exit` is that process's status.
- **Tree**: the git tree of a worktree's contents, untracked files included, `docs/design/*/run.json` taken
  from HEAD; the key of every reuse.
- **Complete**: a row whose scope line says nothing `deferred`.
- **Reuse**: starting no test process because a green complete row, or a CI proof, matches the exact tree.
- **Slice scope**: `PILOT_TEST_SCOPE=slice`; fallbacks deferred to integrate, cargo to CI and land (L4).
- **Wide**: today's selection, fallbacks and cargo included.

## 5. Locked decisions

- **L1** Grilling depth: forks (the user, `itm_cdafcdb550ce`).
- **L2** QA runs in a scratch repo and scratch home on this machine, never the live deck or a run in flight
  (the user, `itm_6d6306b93c24`).
- **L3** A row is written only by `runTests`, after `spawnSync` returns, its `exit` the test process's own
  status; nothing parses output for pass/fail, and no CLI argument, trailer or agent report writes or sets
  one. A run that did not exit 0 is written with its exit and is never reused (`reusableRun` requires
  `exit === 0`). A run that threw before exit writes no row. Rejected: the implementer's trailer claim (a
  slice was pushed twice on a wrapper's exit code while red).
- **L4** Reuse matches the exact tree, never a branch name or sha alone; plus since (or a full row),
  complete for integrate and QA (nothing deferred), while a slice-scope run may reuse a slice-scope row
  that deferred something (amended by itm_ce0954d114aa, so `deferred: cargo` on Windows does not void
  A6), the same `command` (S2's F2), same `process.platform` and node major. A row whose `cargo` is `skipped`
  is complete only to a slice-scope run or to integrate, which runs no cargo: cargo runs at CI's gate and at
  land's full suite (S6) (assumed, F1 of the principles review: itm_8edab381da91 closed on its recommended
  default, not the user's press; it replaces integrate's own `npm run test:cargo`). A stale row is still a proof of identical content
  (`package-lock.json` is in the tree); a copied row needs the same tree, platform and node. The ledger is
  `~/.claude/pilot/tests/ledger.jsonl`, mode 0600; any process of the user can append to it, as to the
  deck store, so agents are told never to write it; land's full run and CI remain the backstop.
- **L5** Agents run tests only through `pilot test`, so every run is recorded; rejected: a ledger write in
  `gate.mjs`, which other repositories do not have.
- **L6** QA's CI reuse is `provenTree` (ADR 0212's seam, ≥3 green `gate (<os>)` jobs, so the Windows job's
  cargo step ran); a QA tree differing from the proved tree runs the selection since it. A switch
  `CI_REUSE` in `test-cli.mjs` turns it off without a re-cut (A3).
- **L7** The deck copies the feature's ledger rows into `record.tests` on each record write, so the
  `run.json` mirror stays a byte copy; rejected: a second committed file.
- **L8** Nested gates (env `PILOT_GATE_HOME_STORE` set, i.e. inside the suite) write no row unless a test
  passes `home`.

## 6. Assumed decisions

- **A1** Proof of a pass is a local ledger keyed by tree (default, `main`'s verdict requested). Trades: one
  machine only. Rejected: git notes (pushed, shared trust), implementer trailer (L3).
  Verdict: stands — a pass is proved only by a row the test tool wrote from the process's own exit code; a slice was pushed red twice today on an agent's claim
- **A2** The slice-scope switch is env `PILOT_TEST_SCOPE`, set by `pilot test --scope slice`. Trades: a
  hidden input. Rejected: a flag to `test:changed`, which breaks other repositories' scripts.
  Verdict: stands — an env switch leaves other repos' test:changed scripts untouched
- **A3** QA reuses CI (open as `itm_d6739b04e059`, default Reuse CI). Trades: QA trusts CI's three runners
  over a local run. Rejected: always run locally at QA.
  Verdict: stands — the user chose Reuse CI on itm_d6739b04e059; reuse needs all three OS gate jobs green
- **A4** Spec 5's bar is ≤ 12 local runs. Trades: a guess until the first run measures it.
  Verdict: stands — 12 is a bar measured on the first run after landing, not a gate
- **A5** Slice scope also defers `FULL_TRIGGERS` changes (package.json, gate.mjs…) to integrate. Trades:
  a slice editing the runner gets its full run one step later.
  Verdict: stands — integrate runs wide, so a trigger-file change is still tested before it reaches feat
- **A6** `pilot test` reuses a matching row for any role, so an implementer re-gating an unchanged tree
  runs nothing. Trades: a flaky green is reused once more; `--fresh` is not added.
  Verdict: stands — an unchanged tree re-gated is the redundant run the user asked to remove

## 7. Out of scope

The co-pilot's `pilot checks --wait`; CI's minutes; the full suite at land (ADR 0166/0212); git spawn counts
(`itm_7a100ab43411`); selection precision beyond scope; a ledger shared across machines.

## 8. Slices

Width 4; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot test` runs and records every test run | 4 | `scripts/test-ledger.mjs` (new), `scripts/test-cli.mjs` (new), `bin/pilot.mjs`, `scripts/integrate.mjs` (`runTests`, `runChosen`), `scripts/sync.mjs` (`:124` passes `where`), `agents/pilot-implementer.md`, `scripts/test/test-ledger.test.mjs` (new), `docs/adr/NNNN-tested-once.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Integrate reuses the phase gate's run | 1 | `scripts/integrate.mjs` (`integrate`), `scripts/test/integrate-reuse.test.mjs` (new) | S1 (`scripts/integrate.mjs`, `reusableRun`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The phase gate defers the fallbacks and cargo | 3 | `scripts/select-tests.mjs`, `scripts/gate.mjs`, `docs/OPERATING.md`, `scripts/test/select-scope.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | QA reuses CI's proof | 2 | `scripts/test-cli.mjs`, `agents/pilot-qa.md`, `agents/pilot-lander.md`, `scripts/test/test-cli-reuse.test.mjs` (new) | S1 (`scripts/test-cli.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The run record and closing report count the runs | 4, 5 | `deck/store-runs.mjs` (`upsertRecord`), `deck/closing-report.mjs` (`closingReportOf`), `deck/test/record-tests.test.mjs` (new) | S1 (`testRunsFor`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |

S1 is the walking skeleton: an agent's `pilot test` → `runTests` → a ledger row, and integrate's run too.
red team: S3 reads `PILOT_TEST_SCOPE` that S1's `pilot test` sets; with S1 alone the variable is ignored and
runs stay wide, with S3 alone it is reachable by env — neither half breaks, so no `after` (checked:
`gate.mjs:374` reads argv only today). red team: S2's tree after `--no-commit` merge includes the deck's
modified `run.json` in the feat worktree; `worktreeTree` takes `docs/design/*/run.json` from HEAD (L4), as
`integrate`'s reset already excludes it (`integrate.mjs:425`). red team: S2 reads `deferred` that only S3
prints; before S3 nothing defers, so every row is complete and the rule holds. red team: S3's own gate is
wide (it edits `FULL_TRIGGERS` files) — expected. red team: integrate tests run inside the gate and would
write the live ledger; L8. red team: S4 and S1 share `test-cli.mjs`, so S4 waits on S1, not S3.

## 9. Acceptance evidence

1. A slice's phase gate prints `selected n of m … ; deferred: <reason>` where a fallback applied (spec 3).
2. `pilot integrate` of an unmoved slice prints `tests reused: implementer <sha7>`; after a base move, counts (spec 1).
3. QA's `pilot test --as qa` prints `tests reused: ci proved <tree7> on 3 jobs` (spec 2).
4. The feature's `run.json` lists `tests` rows; the closing report reads `test runs: <n> local, <m> min` (spec 4).
5. On the next five-slice feature, that total is ≤ 12 (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/tested-once-s1 | – | – | – | 4 |
| S2 | planned | slice/tested-once-s2 | – | – | S1 | 1 |
| S3 | planned | slice/tested-once-s3 | – | – | – | 3 |
| S4 | planned | slice/tested-once-s4 | – | – | S1 | 2 |
| S5 | planned | slice/tested-once-s5 | – | – | S1 | 4, 5 |
| feature | planned | feat/tested-once | – | – | S1-S5 | 1-5 |
