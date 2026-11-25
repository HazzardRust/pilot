# lineage-slow-git: gate1 lineage tests survive a slow git

Ticket `itm_ad02d595d1c2` · agreement `itm_8b53cda5a554` · base `feat/pr-overview` at `0e2e464` · ADR NNNN (`docs/adr/NNNN-lineage-slow-git.md`)

## 1. Problem

Three signed landings in a row (gate2 threads `itm_1d819d4586dc`, `itm_c0593fe105eb`, `itm_589b847f8e5c`) stopped red on tests their features did not touch, each with `git did not answer on a gate1's branch design/x within 5 s`. The gate1 lineage tests run real git under the deck's live 5 s deadline, inside a suite that spawns about 12,500 git processes. The tests should not fail because git is slow; the deck's live deadline should stay as it is.

## 2. Spec

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | A gate1 lineage or verdict test that is not about the deadline passes however slowly git answers, up to 120 s. | Every test call of `assertOnPilotTip`, `assertVerdicts` and gate1 `callTool('deck_post')` against a git repo passes `GIT_SLOW_MS` (120 000), the deadline tests excepted: a grep of unarmed sites in `deck/test` and `scripts/test` finds 0. practitioner: test-reliability engineer (a test's deadline is the test's, not production's). |
| 2 | The 5 s refusal stays proved, through the deck's own post path too. *Assumed (A1).* | `gate1-lineage.test.mjs:139` and `gate1-verdicts.test.mjs:140` (`timeout: 0`) pass unedited; a new test: `callTool('deck_post', gate1, { lineageTimeout: 0 })` is refused with `within 5 s` and stores 0 gate1s. |
| 3 | The deck's live deadline is unchanged. | `deck/lineage.mjs` diff is empty (`LINEAGE_MS = 5000`); the one non-test change, `deck/server-tools.mjs:315-316`, passes `deps.lineageTimeout`, undefined in production. |

## 3. Findings

- `deck/lineage.mjs:17` `LINEAGE_MS = 5000`; `assertOnPilotTip(repo, branch, { timeout, base })` (:29) and `assertVerdicts(repo, gate, { record, timeout })` (:65) each take `timeout`, default 5000.
- `deck/server-tools.mjs:299` `callTool(name, args, deps = {})`: `deps` is already the tests' seam (`prWrite`, landing seams, :296-297). :315-316 call both asserts with **no** timeout, so a `callTool` test cannot arm a deadline today.
- **Cause, as the code shows it**: `scripts/pilot-branch.mjs:179` `gitUnder` gives every call one shared deadline; `pilotLineage` (:213-241) runs up to ~11 sequential `git` spawns (remote config, `rev-parse` ×2, `merge-base`, `rev-list` ×3, `diff-tree`/`patch-id` ×4). On Windows under a parallel suite, 11 process starts share 5 s. The land logs fail at `lineage-base:58`, `handoff-lineage-remote:152`, `gate1-lineage:74`, `gate1-verdicts:95`, all on the branch check, none on `assertVerdicts`' single `cat-file`. Load on a shared budget is consistent with that; a too-tight limit is not measured. Unproved either way.
- `spawnSync('git', …)` (`pilot-branch.mjs:184`) with no shell: on Windows libuv resolves only `git.com`/`git.exe`, so a PATH script stub cannot stand in for a slow git there (A1).
- Test sites against real git (grep): `deck/test/gate1-lineage.test.mjs` (`postGate1` :61, direct :139), `gate1-verdicts.test.mjs` (:74, :118, direct :129-158), `lineage-base.test.mjs` (:57-79, :91), `verdict-record.test.mjs` (:69-84), `scripts/test/handoff-lineage-remote.test.mjs` (:152-166). `posters.test.mjs:64` is refused by poster before git runs; `landing-recut`, `replan`, `plan-drift` call `deck_ticket`, which runs no lineage.
- All five test files already import `scripts/test/lib/git-fixture.mjs` (101 lines, `gitFixture` :75); `handoff-lineage-remote` does not import `deck/testUtils.mjs`, whose suite HOME and `delete PILOT_DECK_DIR` (:26-30) it must not take. `server-tools.mjs` is 677 lines, under the 800 bar of `deck/test/facades.test.mjs:19`.

**Seams** (deepening pass: `assertOnPilotTip`/`assertVerdicts` survive the deletion test, the deck post and five test files call them; `callTool`'s `deps` survives as the one test seam of the post path. Nothing to fold: the deadline joins `deps`, no new module.)

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `callTool` (`deck/server-tools.mjs`) | `callTool(name, args, deps?: { lineageTimeout?: number, prWrite?, ...landing }) -> result` | the gate1 lineage and verdict deadline | in-process |
| `assertOnPilotTip` / `assertVerdicts` (`deck/lineage.mjs`) | unchanged: `{ timeout?: number }`, default `LINEAGE_MS` | – | local-substitutable (real git in a temp repo) |

## 4. Ubiquitous language

- **live deadline**: `LINEAGE_MS`, 5000 ms, the deck's budget for every git call of one gate1 check.
- **test deadline**: `GIT_SLOW_MS`, 120 000 ms, what a test not about the deadline arms.
- **deadline test**: a test whose subject is the refusal; it arms `timeout: 0`, a deadline already spent.
- **unarmed site**: a test call reaching a gate1 git check with no deadline of its own, so the live one applies.

## 5. Locked decisions

- **L1** The post path's deadline is injected as `callTool`'s `deps.lineageTimeout`, passed to both asserts. Rationale: `deps` is the codebase's existing test seam for `callTool`. Rejected: an env var (`PILOT_DECK_LINEAGE_MS`), a knob a live deck could read; a module-level setter, shared state across tests.
- **L2** One test constant `GIT_SLOW_MS = 120_000`, exported from `scripts/test/lib/git-fixture.mjs`, which all five files import. Rationale: one place to read the test deadline, beside the real-git fixture it serves. Rejected: `deck/testUtils.mjs`, whose import side effects (suite HOME) would change `handoff-lineage-remote`. Rejected: `timeout: Infinity` per site, which lets a hung git hang the file instead of failing it.
- **L3** `LINEAGE_MS` and the refusal text stay as they are (spec 3). Rejected: raising the live deadline, which the user did not ask for.
- **L4** Grilling depth: forks, the user's press on `itm_c5745803b7f4`.

## 6. Assumed decisions

- **A1** (thread `itm_a79189682a51`) How spec 2 proves the 5 s refusal. Default taken: a deadline already spent (`timeout: 0`, the two existing tests) plus one new `callTool` test that `lineageTimeout` reaches the check. Trade: no test runs against a git that is itself slow; the slowness is the clock's, not the process's. Rejected: a PATH `git` script that sleeps >5 s: runs on ubuntu CI only (Windows finds only `git.exe`, `pilot-branch.mjs:184`) and adds ≥5 s per test.
  User's answer: "Default: deadline 0 + seam test", the default as written.
- red team: walked S1's first behaviour against `gate1-lineage.test.mjs`: arming only direct calls would leave `postGate1` (:61) on the live deadline, the failure at :74; hence L1 and the seam test. Walked `lineage-base.test.mjs:91`: it already passes `deps` (`{ prWrite }`), so the arm merges into that object, not a second argument. Walked `handoff-lineage-remote.test.mjs`: the first cut put `GIT_SLOW_MS` in `deck/testUtils.mjs`, whose import redirects HOME and drops `PILOT_DECK_DIR` (:26-30), which that file does not take today; moved to `git-fixture.mjs` (L2).

## 7. Out of scope

- Raising or measuring the live deadline; per-call rather than shared deadlines in `gitUnder`.
- Cutting the suite's git spawn count.
- Other timing flakes (the brief's known flaky list).

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Gate1 lineage tests arm their own deadline | 1, 2, 3 | `deck/server-tools.mjs` (2 lines), `scripts/test/lib/git-fixture.mjs`, `deck/test/gate1-lineage.test.mjs`, `deck/test/gate1-verdicts.test.mjs`, `deck/test/lineage-base.test.mjs`, `deck/test/verdict-record.test.mjs`, `scripts/test/handoff-lineage-remote.test.mjs`, `docs/adr/NNNN-lineage-slow-git.md` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |

S1 is the walking skeleton and the whole feature: the seam, the constant, every site armed, ~50 changed lines.

## 9. Acceptance evidence

1. `git diff feat/pr-overview -- deck/lineage.mjs` is empty (spec 3).
2. The unarmed-site grep in S1's verification prints nothing (spec 1).
3. `node --test` on the five test files is green, including the new `lineageTimeout: 0` test and the two existing `timeout: 0` tests (spec 2).
4. `npm test` green on Windows and in CI.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1, 2, 3 |
| lineage-slow-git | planned | `feat/lineage-slow-git` | – | – | S1 | 1–3 |
