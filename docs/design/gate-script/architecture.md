# gate-script: the gate names a missing install, and the hang test stops costing a minute

Ticket `itm_9ccd6158c4aa` (audit F4, F5). Grilling depth: none (L5, `itm_d302bb92e7af`); every open decision is *assumed* (§6) and stands. Spec lines 1-4 agreed on `itm_176a2d5499a6`.

## 1. Problem

A fresh worktree's first gate fails on a missing install with no hint: `node scripts/gate.mjs` runs the files and fails with `ERR_MODULE_NOT_FOUND`, and nothing in its output says `npm ci`. `scripts/integrate.mjs:177` installs for itself, but an implementer's or reviewer's fresh worktree does not, and walkthrough-taste and clear-waits-co-pilot each lost a suite run to it. Separately, one test, `a hung fake fails by name` (`scripts/test/test-timeout.test.mjs:58`), ties up a worker for 68 s. It is the suite's slowest test by 4x.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | With `node_modules` absent, or any `dependencies` package missing from it, `node scripts/gate.mjs` exits 1 in under 2 s. It prints `node_modules missing: run npm ci`, takes no gate slot and runs no test. `npm test`, `test:quiet` and `coverage` get the same result, because all three run gate.mjs. | `scripts/test/gate-install.test.mjs` runs the gate in a temp copy with no `node_modules` and reads the line, the exit code, the time and the absence of `ℹ tests` |
| 2 | With `node_modules` present, the gate behaves exactly as now. | `gate.test`, `gate-census`, `gate-spawns` and `deck/test/startup` pass unchanged |
| 3 | `a hung fake fails by name` finishes in under 20 s and still asserts that the hung test is named as failing. | its own `the hang copy exited 1 in <t> s` line, with t under 20 (probed: 5 s) |
| 4 | The hang test is red at 20 s or more, so a slide back toward 68 s fails the test instead of only slowing it. *assumed* (A4) | the assertion `seconds < 20` in the diff |

Lines 1-3 are the draft the pilot posted, and they are not yet confirmed. Line 4 follows from line 3.

## 3. Findings

- **F1. The gate's import tree needs no package.** `scripts/gate.mjs` imports node builtins and ten local files (`scripts/gate-slots`, `count-spawns`, `deck/gc`, `procs`, `runs`, `items`, `items-bounds`, `tools`, `walkthrough-shape`, `status`), none of which imports a package. So the gate loads without `node_modules`, and the failure only appears inside the test children (`@modelcontextprotocol/sdk`, the only entry in `package.json` `dependencies`; `node-pty` is optional).
- **F2. runGate's tests have no node_modules.** `gate.test.mjs:64,80` and `gate-census.test.mjs:51,90` call `runGate` with `cwd: 'C:/scratch'` or a fixture directory. A check inside `runGate` would turn them red, so the check goes in the entry block (`gate.mjs:218-224`), before `runGate` and before the slot is taken.
- **F3. Why 68 s. No leak, and the 10 s timeout never fires.** `hangCopy` copies all of `deck/test/run.test.mjs` (73 tests) and breaks `/api/chain` in the shared fake `deckWatching` (:540). So all 12 watch tests fail, one after another, on that file's own `eventually` budget (`SETTLE_BUDGET_MS = 5000`, :600). Each fails at 5.01-5.02 s, never at the 10 s `--test-timeout`. Probe: `node --test --test-timeout=10000` on the copy took 69 s, exit 1, 14 fail.
- **F4. Two failures in the copy are accidental.** `pilot run --sub is refused by name` and `pilot --help names no --sub` fail in about 75 ms because they look for `bin/pilot.mjs` relative to the temp directory. They are noise, not what the test proves.
- **F5. One test runs in 5 s.** Adding `--test-name-pattern=^pilot run asks the deck to chain once at start$` to the copy's argv gives `tests 1, fail 1` in 5.3 s, exit 1, with `✖ pilot run asks the deck to chain once at start` (probed).
- **F6. The file's header claims more than happens.** `test-timeout.test.mjs:7-9` says `--test-timeout` bounds a test that hangs. In the copy, the 5 s poll budget fails the test first. The header changes to say what the test actually proves.
- **F7. Overlap with queued runs.** git-light-tests S6 owns `gate.mjs:28-34` (`SPAWN_CEILING` and its comment), and no file of this run's lies on those lines. Its other slices own `*/test/**` files, none of them `test-timeout` or a `gate-*` test. three-lanes owns no file here. Its S4 edits `deck/chain.mjs`, which `run.test.mjs` imports, and the copy depends only on the `/api/chain` line in `deck/test/run.test.mjs:567`, which neither run edits. One more node spawn per suite (S1's test) sits far inside the 10% margin of `SPAWN_CEILING`.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| gate entry (`scripts/gate.mjs`) | `missingInstall(root): string \| undefined`, then the entry block's exit 1 with one stderr line | the package.json read and the per-dependency lookup | Local-substitutable (a temp dir stands in for the checkout) |
| hang copy (`scripts/test/test-timeout.test.mjs`) | `hangCopy(t): string`; the copy's argv from `gateArgv` plus a name pattern | nothing new; the argv gains one flag | In-process |

Deletion test: removing `missingInstall` sends the complexity back into every agent's first failed run, so it earns its keep. `hangCopy` earns its keep too, because it is the only reproduction of the audit's F3. No fold is needed, so there is no fold slice.

## 4. Ubiquitous language

- **Install check**: the entry block's test that every `dependencies` package is present under the gate's checkout (A1).
- **Hang copy**: the temp copy of `run.test.mjs` with `/api/chain` left unanswered.
- **Hung test**: `pilot run asks the deck to chain once at start`, the `HUNG` constant.
- **Poll budget**: `SETTLE_BUDGET_MS` in `run.test.mjs`, the 5 s after which `eventually` fails a test by name.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | The install check runs in gate.mjs's entry block, before `runGate`. | It takes no slot and runs no test, and `runGate`'s fixtures with no `node_modules` stay green (F2). | Inside `runGate`, which breaks four existing tests. |
| L2 | The line `node_modules missing: run npm ci` goes to stderr, alone, with exit 1. | It matches the gate's other refusals (`gate: argv[1] ...`, :220). | Stdout, or a line naming the package (the spec fixes the text). |
| L3 | S1's end-to-end test copies `scripts/` and `deck/` without their `test/` directories, plus `package.json`, into a temp dir. | gate.mjs fixes its root from `import.meta.url`, so only a copy has no `node_modules`. A whole-directory copy (125 files, 1.5 MB) survives the gate gaining an import. | Renaming the real `node_modules`, which breaks concurrent tests; a listed-file copy, which breaks on a new import; a root env var, which adds a seam only tests use. |
| L4 | gate.mjs changes leave lines 23-38 alone. | git-light-tests S6 owns `SPAWN_CEILING` (F7). | Any edit to the constants block. |
| L5 | Grilling depth: none. | The user, `itm_d302bb92e7af`. | Every and forks. |

## 6. Assumed decisions

- **A1 What counts as installed.** Default: every name in `package.json` `dependencies` has `node_modules/<name>/package.json` under the gate's checkout. `optionalDependencies` (`node-pty`) are skipped. This catches a partial install. It trades away Node's parent-directory lookup: a `node_modules` above the checkout does not count. Rejected: checking only that `node_modules` exists, which passes a partial install; hard-coding `@modelcontextprotocol/sdk` (the audit's fix text), which goes stale when a dependency is added; `require.resolve`, which an `exports` map can refuse for `package.json`.
  Verdict: stands
- **A2 The gate never installs.** Default: it names `npm ci` and stops. This trades away one command the agent then has to run. Rejected: running `npm ci` itself the way `integrate.mjs:177` does, which puts network access and a minute of install inside a check that agents expect to be read-only and fast.
  Verdict: stands — integrate.mjs installs because it owns a worktree it made; a gate is run in worktrees it does not own
- **A3 The hang copy runs only the hung test.** Default: `--test-name-pattern=^<HUNG>$` added to the copy's argv. This gives up checking that every watch test in the copy fails by name (F3), but the 12 identical failures added only time. Rejected: extracting the one test's source into the copy, which breaks on any edit to its helpers; lowering the copy's poll budget, which still runs 12 tests serially.
  Verdict: stands
- **A4 The hang test's limits tighten.** Default: assert `seconds < 20`, the kill guard at 25 s and the test timeout at 30 s (from 90 / 80 / 90). This trades away headroom on a loaded machine (5 s measured, so 4x margin). Rejected: keeping the old limits, under which a regression back to 68 s stays green.
  Verdict: stands
- **A5 The QA environment.** Default: this Windows machine, CLI only. A fresh `git worktree add` without `npm ci`, then `node scripts/gate.mjs` timed. Then `npm ci` there and `node --test scripts/test/test-timeout.test.mjs` for its diagnostic line. Rejected: CI, where `npm ci` always runs first and the missing install never happens.
  Verdict: stands

## 7. Out of scope

- The 12-way fail in `run.test.mjs` itself and its `--sub` tests' relative `bin/` path (F4). Both are correct in the tree; only the copy breaks them.
- `SPAWN_CEILING` and anything else in gate.mjs:23-38 (git-light-tests S6).
- `integrate.mjs:177`'s own install, and the audit's F6, F7 and F9 (separate tickets; merge thread `itm_4adf16c56585`).

## 8. Slices

Width 2; longest stem 1.

| Slice | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | A fresh worktree's gate says `run npm ci` (walking skeleton) | 1, 2 | `scripts/gate.mjs` (entry block and one new export, never :23-38), `scripts/test/gate-install.test.mjs` (new) | – | `pilot:typescript-reviewer` | opus | [S1](slices/S1.md) |
| S2 | The hang test runs only the hung test | 3, 4 | `scripts/test/test-timeout.test.mjs` | – | `pilot:typescript-reviewer` | sonnet | [S2](slices/S2.md) |

The two slices share no file and no seam, so there is no `after` between them. Each is estimated at under 80 changed lines.

## 9. Acceptance evidence

On this machine (A5), in the order a user meets it:

1. In a fresh worktree with no `npm ci`, `node scripts/gate.mjs` prints `node_modules missing: run npm ci` and exits 1 in under 2 s, with no `ℹ tests` line (spec 1).
2. After `npm ci` in that worktree, the full gate passes with the base's counts plus S1's new tests, and reads `left running: none` (spec 2).
3. `node --test scripts/test/test-timeout.test.mjs` prints `the hang copy exited 1 in <t> s` with t under 20, and passes (spec 3, 4).

Gate: `npm ci && npm test && node scripts/check-references.mjs && node scripts/check-provenance.mjs agents/ skills/ rules/`. Known flake: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" under a concurrent gate.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | – | 3, 4 |
| gate-script | planned | | | | S1, S2 | 1-4 |
