# unimported-exports: fifteen exports nothing imports stop posing as interface

Ticket `itm_f102a5755745` (audit F6). Grilling depth: none (L3, `itm_e5c00fd642b2`); every open decision is *assumed* (§6) and stands. Spec lines 1-3 agreed on `itm_40a13e24110f`. Merge thread `itm_39ab2671ed8b`: merged none.

## 1. Problem

Fifteen exports in `deck/` and `scripts/` are named in no other file, tests included. An agent reading a module's `export` lines to learn its interface reads fifteen functions and constants no caller uses, and cannot tell them from the real interface without a grep per name.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Each of the 15 names in §3 loses its `export` keyword; none is deleted (L1). | the export census (§4) prints 15 lines at `a5f260c2` and none after; `git grep -l -w -F <name>` still finds each in its defining file only |
| 2 | The suite stays green with the same test count. | the gate's `ℹ pass` equals the base's (3528 per the ticket) and `ℹ fail 0` |
| 3 | No behaviour changes: the diff deletes the `export ` prefix on 15 lines and touches nothing else. | `git diff --stat` shows 15 insertions and 15 deletions over the 11 files in §3; every `-` line starts `export ` and its `+` line is the same text without it |

The draft's line 3 allowed deleting dead bodies; none is dead (F1), so the line narrows to export keywords.

## 3. Findings

- **F1. All 15 are called inside their own module.** One `git grep -n -w -F` per name at `a5f260c2`, `vendor/` excluded:

| Name | Defined at | Used in its module at | Importer check (tests, `bin/`, `hooks/`, `.claude-plugin/`) | Decision |
|---|---|---|---|---|
| `progressReporterFor` | `deck/client.mjs:400` | :418 | none | unexport |
| `logToStore` | `deck/daemon.mjs:52` | :108 | none | unexport |
| `formatQueue` | `deck/tickets.mjs:85` | :131 | none | unexport |
| `buildRulesLedger` | `scripts/build-rules-ledger.mjs:62` | :104 | none (`install.test` imports only `filesUnder`) | unexport |
| `ledgerFragments` | `scripts/build-vendor-ledger.mjs:41` | :95, :220 | none (`install.test` imports `buildLedger, checkLedger, LEDGER_FILE`) | unexport |
| `ledgerSections` | `scripts/build-vendor-ledger.mjs:94` | :129 | none | unexport |
| `surfaceFiles` | `scripts/check-references.mjs:91` | :112, :238 | none | unexport |
| `vendoredFiles` | `scripts/check-upstream.mjs:120` | :311 | none (`install.test` imports `checkUpstream, upstreamCandidates`) | unexport |
| `lineDifference` | `scripts/check-upstream.mjs:157` | :343 | none | unexport |
| `RUN_PID` | `scripts/handoff.mjs:36` | :55 | none (tests import only `handoff`) | unexport |
| `RUN_REPO` | `scripts/handoff.mjs:37` | :137 | none | unexport |
| `packageRoot` | `scripts/install-command.mjs:57` | :213 | none (`install-command.test` imports `installCommand, modulesDir`) | unexport |
| `defaultCommandDir` | `scripts/install-command.mjs:62` | :214 | none | unexport |
| `SAMPLES` | `scripts/measure-rules.mjs:26` | :42 | none | unexport |
| `fetchBase` | `scripts/worktrees.mjs:112` | :131, :196 | none (`worktrees.test` imports `classify, isRunBranch, prune`) | unexport |

- **F2. Namespace imports reach none of them.** `deck/test/create`, `daemon:1168`, `owner`, `pass` and `register-again` import `client.mjs` whole; F1's grep finds `progressReporterFor` in `client.mjs` only, so no test reads it off the namespace. No `Object.keys`/`entries` over a module namespace exists in `deck/test`.
- **F3. No string reach.** `bin/pilot.mjs` and `bin/launcher.mjs` import by name; `hooks/hooks.json` and `.claude-plugin/plugin.json` name script paths, not exports. F1's whole-repo grep covers all three.
- **F4. `RUN_PID`/`RUN_REPO` keep their values.** Their comment (`handoff.mjs:35`) says `deck/run.mjs` sets the env vars; it does so with its own literals, not by importing these constants, so unexporting changes nothing there.
- **F5. Overlap with queued runs.** three-lanes owns `deck/lanes.mjs`, `deck/chain.mjs`, `deck/render-rail.mjs` and agent prose; git-light-tests owns `*/test/**` and `gate.mjs`'s `SPAWN_CEILING`; gate-script owns `gate.mjs`'s entry block and `test-timeout.test.mjs`. None of this run's 11 files is among them, so there is no rebase with those runs. The queued co-pilot/tickets rename (`itm_8b75a1e6b83d`) will likely rename `deck/tickets.mjs`; whichever lands second carries a one-line rebase.

### Seams

| Seam | Interface after the slice | Folded behind it | Category |
|---|---|---|---|
| each of the 11 modules in F1 | its `export` lines minus the F1 names; every other export unchanged | the 15 names become module-private helpers | In-process |

Deletion test: no module is deleted; each name survives as a private helper its module calls (F1). Nothing is shallow enough to fold, so there is no fold slice.

## 4. Ubiquitous language

- **Unimported export**: an `export` whose name `git grep -w -F` finds in its defining file only, `vendor/` excluded.
- **Unexport**: delete the `export ` prefix and nothing else.
- **Interface**: a module's remaining `export` lines.
- **Export census**: `git grep -n -E "^export (async )?(function|const) (progressReporterFor|logToStore|formatQueue|buildRulesLedger|ledgerFragments|ledgerSections|surfaceFiles|lineDifference|vendoredFiles|RUN_PID|RUN_REPO|defaultCommandDir|packageRoot|SAMPLES|fetchBase)\b" -- deck scripts` (15 lines at `a5f260c2`, probed).

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | All 15 are unexported; none is deleted. | Each is called inside its module (F1), so deleting one breaks that module. | Deleting any, which the audit's fix allows only for a binding its own file does not use. |
| L2 | The diff touches only the 15 `export` lines. | Spec 3; the minimal change that meets spec 1. | Tidying the helpers' comments or order while there. |
| L3 | Grilling depth: none. | The user, `itm_e5c00fd642b2`. | Every and forks. |

## 6. Assumed decisions

- **A1 Spec 1's evidence is the export census.** Agreed with spec 1 on `itm_40a13e24110f`; kept here as the record. Default: the census (§4), 15 lines before and none after, beside the draft's per-name `git grep -l`. The draft's grep alone already passes at `a5f260c2` (F1), so it cannot show the change. Trades away: nothing the draft showed. Rejected: the draft's evidence alone.
  Verdict: stands
- **A2 No test is added.** Default: the red step is the census printing 15 lines; the suite's existing tests prove the callers still work. Trades away: a machine pin that keeps the names private. Rejected: a test naming the 15, which puts each name in a second file and breaks spec 1's `git grep -l` evidence; a repo-wide unimported-export checker, a new tool the ticket did not ask for.
  Verdict: stands — a checker for unimported exports is the audit's job, run per audit, not a pin
- **A3 The QA environment.** Default: this Windows machine, CLI only. On the integration branch, run the census (no output), `git diff --stat a5f260c2 -- deck scripts` (15+/15-), and the full gate. Rejected: CI only, which runs the suite but not the census.
  Verdict: stands

## 7. Out of scope

- `deck/run.mjs`'s own `PILOT_RUN_PID`/`PILOT_RUN_REPO` literals duplicating `handoff.mjs`'s constants (F4).
- `comparable` and `failingNames`, which dropped out of the audit's list before `a5f260c2`.
- Any other unimported export the audit did not list, and the audit's F7 and F9 (separate tickets).

## 8. Slices

Width 1; longest stem 1.

| Slice | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | The 15 unimported exports become module-private (walking skeleton) | 1, 2, 3 | `deck/client.mjs`, `deck/daemon.mjs`, `deck/tickets.mjs`, `scripts/build-rules-ledger.mjs`, `scripts/build-vendor-ledger.mjs`, `scripts/check-references.mjs`, `scripts/check-upstream.mjs`, `scripts/handoff.mjs`, `scripts/install-command.mjs`, `scripts/measure-rules.mjs`, `scripts/worktrees.mjs` (the F1 `export` lines only) | – | `pilot:typescript-reviewer` | sonnet | [S1](slices/S1.md) |

Estimated diff: 30 changed lines (15 lines, each one deletion and one insertion).

## 9. Acceptance evidence

On this machine (A3), in the order a user meets it:

1. The export census on the integration branch prints nothing; on `a5f260c2` it prints the 15 lines (spec 1).
2. `git diff --stat a5f260c2 -- deck scripts` shows the 11 files with 15 insertions and 15 deletions, each `-` line starting `export ` (spec 3).
3. The full gate passes with the base's pass count and `ℹ fail 0` (spec 2).

Gate: `npm ci && npm test && node scripts/check-references.mjs && node scripts/check-provenance.mjs agents/ skills/ rules/`. Known flake: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" under a concurrent gate.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3 |
| unimported-exports | planned | | | | S1 | 1-3 |
