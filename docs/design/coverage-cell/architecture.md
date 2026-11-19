# coverage-cell: the evidence runner's coverage cell is not refused by auto mode

Ticket `itm_e3120951f457` · base `pilot` (ffeb7306) · design branch `design/coverage-cell`

## 1. Problem

The fundamentalist's evidence runner measures diff coverage with one Node cell,
`npx --yes c8 ... $TEST && uvx diff-cover ...`. Under auto mode the classifier refuses that call often enough to
matter: 3 of 3 times before crew-refusals (11-16, 11-18, 11-19, "Undermining Oversight"), once more in
crew-refusals' first QA run ("Unauthorized Access"), 0 times in its second. The same cell also failed today in a
worktree with no `node_modules`. Either way Gate 2 goes up with coverage unmeasured.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | The Node diff-coverage cell runs under auto mode in a real session without a refusal. | QA's 3 runner tables from the branch's definitions (A3), each coverage row with an exit code; `<deckDir()>/classifier.log` read for runner lines where crew-refusals' hook is installed (corroboration: it records denials only); practitioner: a reliability engineer, who reads 0 of 3 against the old base rate (below). | refused 0 of 3; 0 runner lines in the log. |
| 2 | The change is a real change of tool: the Node cell fetches nothing at run time and no permission, allowlist or hook is touched (crew-refusals L1). | The old and new cell quoted beside L1 in §5 L2; `git diff` of the feature. | 0 `npx`/`uvx` in the Node coverage cell; 0 changed lines under `settings*.json`, `hooks/`. |
| 3 | Diff coverage is reported as a number for the feature under review. | The coverage row's last line `Diff coverage: <n>% (<covered> of <total> changed lines)`, uncovered changed lines listed by file. | a percentage on 3 of 3 QA runs; a fixture with 3 of 4 changed lines run prints `75%`. |
| 4 | *Assumed*, practitioner: a coverage-tool maintainer (diff-cover's counting rule). A changed line counts as uncovered only when no test process ran it; blank and comment-only lines are not counted; a changed `.ts` file is listed as not measured. | `diffCoverage` tests on a fixture repo. | uncovered set equals the fixture's never-called function lines exactly. |

**What 0 of 3 shows (line 1).** That the new cell, as written, ran under auto mode three times in a real session.
It does not show a rate, nor anything about a later classifier. At the observed old rate (refused in 4 of the last 5
runs) 0 of 3 by chance is under 1%; at a 50% rate it is 12.5%. The bar is evidence the risky action is gone, read
together with line 2, which is the structural claim.

Cannot mean here: a reworded, split or prefixed cell; an allow rule; the six non-Node columns, which keep
`uvx diff-cover` (§7).

## 3. Findings

| What | Where |
| --- | --- |
| The cell, Node column | `agents/pilot-evidence-runner.md:64`; cwd · command shape, env-less since crew-refusals (ffeb730), `$TEST` vetted at `:29-31` |
| Pin on the table's shape | `scripts/test/pilot-agents.test.mjs:1100-1116`: every cell matches `` ^`$W` · `<cmd>`$ `` and carries no `HOME=`, `USERPROFILE=` or `PILOT_DECK_DIR=` |
| c8 is Node's own V8 coverage plus a converter | c8 README: "uses native V8 coverage", `NODE_V8_COVERAGE` as its temp dir |
| The suite keeps the env down to every node child | `scripts/gate.mjs:75-90` (`gateEnv` spreads `env`), `:302-304` |
| The fundamentalist already installs `node_modules` | `agents/pilot-fundamentalist.md:49-54`; the gate says so when it is missing, `scripts/gate.mjs:356` |
| Plugin scripts are called by absolute plugin path | `agents/pilot-auditor.md:21`, `agents/pilot-architect.md:225` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/…"`) |
| crew-refusals L1, L9 | `origin/feat/crew-refusals:docs/design/crew-refusals/architecture.md:121-141` |
| Classifier log | crew-refusals §4: `<deckDir()>/classifier.log`, one JSON line per denial, a record, never a permission |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/diff-coverage.mjs` (new) | `diffCoverage({ cwd, v8Dir, base })`, `formatDiffCoverage(result)`, CLI `node scripts/diff-coverage.mjs <v8-dir> <base>` | reading raw V8 coverage, the `git diff -U0` hunk parse, line-to-range mapping, file-URL normalising | Local-substitutable (a temp git repo and a node child stand in) |
| The runner's Node coverage cell | the cell text | `npx --yes c8` and `uvx diff-cover` replaced | Prose contract, pinned by `pilot-agents.test.mjs` |

Deletion test: removing `diff-coverage.mjs` puts the c8/diff-cover pair back, so it earns its keep; no existing
module is shallow enough to fold. No fold slice.

## 4. Ubiquitous language

- **Coverage cell**: the Node column's `Diff coverage` cell in the runner's command table.
- **Raw V8 coverage**: the JSON files Node writes into `NODE_V8_COVERAGE`, one per process.
- **Changed line**: a line added or modified in `git diff -U0 <base>...HEAD`, in a `.js .mjs .cjs` file.
- **Diff coverage**: covered changed lines over counted changed lines, as a percentage.
- **Refusal**: auto mode denying the cell's Bash call with a verdict.

## 5. Locked decisions

- **L1 Grilling depth: forks** (the user, `itm_c0594055fc0d`). Only questions whose paths fork are posted; the rest
  are taken as assumed.
- **L2 crew-refusals L1 holds.** Its text: "No slice edits a permission setting, an allowlist, an auto-approving hook
  or `CLAUDE.md` to let a refused command through; no slice obfuscates, splits or rewords a command so the same
  action passes unjudged. Each fix removes the risky action." The risky action removed is two run-time fetches of
  third-party code run against the suite. Old cell:
  `npx --yes c8 --reporter=lcovonly --report-dir "$S/cov" $TEST && uvx diff-cover "$S/cov/lcov.info" --compare-branch "$BASE"`.
  New cell: `NODE_V8_COVERAGE="$S/v8" $TEST && node "${CLAUDE_PLUGIN_ROOT}/scripts/diff-coverage.mjs" "$S/v8" "$BASE"`.
  Rejected: an allow rule; keeping c8 and dropping only `--yes`, which rewords the same fetch.
- **L3 Nothing reads `classifier.log` to decide anything** (crew-refusals L9); QA reads it as evidence only.
- **L4 ADR NNNN** (`docs/adr/NNNN-coverage-cell.md`, S2) records L2 and A1.
- **L5 Small-diff limit 150 changed lines per slice**; past it the implementer stops and asks `main`.

## 6. Assumed decisions

- **A1 Tool** (`itm_aa6e5e340524`). Default: Node's built-in `NODE_V8_COVERAGE` plus the zero-dependency plugin
  script. Tradeoff: line-level only, no source maps (TS) or branch coverage. Rejected: c8 as a plugin dependency
  plus diff-cover via pip, two toolchains and Python required.
  Answer (the user, `itm_aa6e5e340524`): "Built-in V8 + plugin script", the default as written.
  Verdict: stands — the user took the default (itm_aa6e5e340524)
- **A2 Missing `node_modules`** (`itm_38ebd5de8dcd`). Default: a follow-up ticket; the fundamentalist's existing
  `npm ci` step is where it fails, not the cell. Tradeoff: Gate 2 can still go up unmeasured for that cause.
  Rejected: a third slice on `pilot-fundamentalist.md`.
  Answer (the user, `itm_38ebd5de8dcd`): "Follow-up ticket", the default as written.
  Verdict: stands — the user took the default (itm_38ebd5de8dcd); pilot files the follow-up ticket
- **A3 QA environment** (`itm_38791313a2f4`). Default: this machine, auto mode on, the runner from the branch's
  definitions (`--plugin-dir` at the feature worktree) 3 times against a detached scratch worktree of this repo
  with `npm ci` done, a scratch deck, no database.
  Answer (the user, `itm_38791313a2f4`): "Real auto-mode session, scratch worktree", the default as written.
  Verdict: stands — the user took the default (itm_38791313a2f4)
- **A4 Node column only** (not posted, L1). The six other columns keep `uvx diff-cover`; no refusal of them is on
  record. Tradeoff: the same fetch shape stays for Python and the rest.
  Verdict: stands — no queued ticket or recorded refusal covers the six other columns
- **A5 crew-refusals ordering** (not posted, L1). It edits the same table line. If it is on `pilot` when S2 starts,
  S2 writes the cell in its env-less shape and its pin; otherwise the landing that comes second resolves one hunk.
  Verdict: stands — crew-refusals gate2 is signed and landing now, so S2 most likely writes the env-less shape
- **A6 Spec line 4** (not posted, L1): the counting rule, an added line, chosen to match diff-cover's on plain JS.
  Verdict: stands — an added spec line that moves no locked decision

## 7. Out of scope

- The Python, Go, Rust, JVM, .NET and PHP coverage cells (A4); every other check row.
- The missing-`node_modules` failure (A2, follow-up).
- Source maps, TS, branch coverage; any permission, allowlist or hook (L2).

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | One command prints a feature's diff coverage from Node's own coverage | 3, 4 | `scripts/diff-coverage.mjs` (new), `scripts/test/diff-coverage.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 | The runner's coverage cell fetches nothing and prints the number | 1, 2, 3 | `agents/pilot-evidence-runner.md`, `scripts/test/pilot-agents.test.mjs`, `docs/adr/NNNN-coverage-cell.md` (new) | S1 (`scripts/diff-coverage.mjs` CLI) | typescript, security | [S2](slices/S2.md) |

Walking skeleton: S1, a real suite's raw V8 coverage in, one percentage out.

Red team: attacked S1 b1 against `gate.mjs` (does the env reach the test children: yes, `gateEnv` spreads it), the
pin at `pilot-agents.test.mjs:1112-1113` (one command segment, no env override list hit; `NODE_V8_COVERAGE` sits inside the command), and
`${CLAUDE_PLUGIN_ROOT}` expansion in agent prose (expanded at load, seen in this run's own definition). Finds:
- red team: A1's number on this repo reads hundreds of per-process JSON files (about 900 node processes per suite,
  `gate.mjs:38`); S2 gets a run behaviour bounding the script's runtime at 60 s.
- red team: QA running the installed plugin would test the old cell; A3 names `--plugin-dir` at the feature
  worktree.
- red team: Windows file URLs (`file:///C:/…`) against `git` paths (`c:/…`, `/`): S1 b3 pins the case-folded match.

## 9. Acceptance evidence

1. `node scripts/diff-coverage.mjs <v8-dir> origin/pilot` in the feature worktree prints a
   `Diff coverage: <n>%` line (spec 3).
2. The fixture tests: 75% on 3 of 4, the never-called lines named, a `.ts` file listed as not measured (spec 3, 4).
3. The Node coverage cell in `agents/pilot-evidence-runner.md` beside §5 L2: no `npx`, no `uvx` (spec 2).
4. QA's 3 runner tables in an auto-mode session: coverage row with exit 0 and a percentage, refused 0 of 3;
   `classifier.log` with 0 runner lines (spec 1, 3).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 One command prints a feature's diff coverage from Node's own coverage | planned | `slice/coverage-cell-s1` | – | – | – | 3, 4 |
| S2 The runner's coverage cell fetches nothing and prints the number | planned | `slice/coverage-cell-s2` | – | – | S1 | 1, 2, 3 |
| The evidence runner's coverage cell is not refused by auto mode | planned | `feat/coverage-cell` | – | – | S1, S2 | 1-4 |
