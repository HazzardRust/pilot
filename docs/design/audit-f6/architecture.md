# audit-f6: the gate checks syntax before the suite

Ticket itm_50652e3e4f6f · audit 2026-10-20T21-42-00-000Z F6 · base `origin/pilot` d7569a49 · merge: none (itm_c328f05ff155)

## 1. Problem

A syntax error is found only by the test that imports the file, after the full suite (460-762 s). A file that no
test imports, such as the browser modules under `deck/ui/js/`, is never checked.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A syntax error in a `.mjs` or `.js` file makes `npm test` exit 1 before the ledgers and before any test runs, in a full run and in a `--since` run. Stderr prints `syntax: <path>:<line> <message>`. | A gate test with a planted fault; a CLI run in a scratch clone (§9). | Exit 1; the path and line named; 0 tests run; 0 ledger rebuilds. |
| 2 | *assumed (A2), pending itm_aa6fcd1df4cc*: every failing file is named, not only the first. practitioner: tsc/eslint, which report every fault in a pass. | A temp repo with two broken files. | 2 faults give 2 lines. |
| 3 | *assumed (A3), pending itm_d77ac7d026ec*: the files checked are the tracked ones plus untracked files git does not ignore, including files no test imports. A clean tree prints `syntax ok <n> files in <ms> ms`. | The ok line beside `git ls-files -co --exclude-standard -- '*.mjs' '*.js' \| wc -l`. | n equals that count (666 on d7569a49); an ignored broken file is not named. |
| 4 | The check's verdict matches `node --check`: a `.mjs` file is parsed as ESM only, and a `.js` file as ESM or else CJS, the way Node detects it. practitioner: Node itself, as the outside reader. | A corpus test that runs both over the same planted files. | 0 disagreements over at least 6 cases. |
| 5 | The check takes under 10 s on this repository. | The ms in the ok line; the test asserts it. | < 10 000 ms (0.4 s measured for 666 files). |
| 6 | A clean gate is otherwise unchanged: one added stdout line, the same spawn count, and a failing check stops the gate (it never passes silently). | The existing gate tests, unchanged and green; a test where the child cannot start. | Spawn line within today's ceiling; a check that cannot run exits 1. |

## 3. Findings

- `scripts/gate.mjs:206` `runGate(args, { ledgers = () => [], … })`: each step is injected with a no-op default, and
  the entry block (:276) passes the real one (`rebuildLedgers`). Seven test files call `runGate` with `cwd: 'C:/scratch'`
  or a fixture, so a real check that runs by default would break them. The new step follows the ledgers pattern.
- `runGate` order today: `--since` scope line, then `ledgersCurrent`, then an empty selection returns 0, then the slot, census and suite.
- The spawn counter (`count-spawns.mjs`) is preloaded only into the suite's children (`gateEnv`). A child the gate
  itself starts with `spawnSync` is not counted, so the check leaves the spawn line unchanged.
- Measured on d7569a49 (Windows, Node 26.1, 12 cores), 666 files: running `node --check` once per file with `xargs -P 8` took
  **21.9 s**. One process parsing each file with `vm.SourceTextModule`, falling back to `vm.Script` with the CJS
  wrapper, took **0.4 s** with 0 false reds. `vm.SourceTextModule` is undefined without `--experimental-vm-modules`.
- No overlap: `feat/handoff-mod`, `design/never-stuck` and `feat/never-stuck` change neither `scripts/gate.mjs` nor `package.json`.
- CI (`.github/workflows/gate.yml`) runs `npm test` on Node 26, so it gets the check without a workflow edit.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/check-syntax.mjs` (new) | `syntaxErrors(cwd, { spawn })` → `{ files, ms, errors }` | The file list (git), the flagged child, ESM/CJS detection, fault parsing | local-substitutable (`spawn` injected) |
| `scripts/gate.mjs` `runGate` | gains `syntax` dependency, no-op default | the order: syntax, then ledgers, then the suite | in-process |

Deletion test: removing `check-syntax.mjs` would push the file list, the flagged child and the detection rules into
`runGate`, which already holds five concerns, so the module earns its place. No fold of existing code is needed.

## 4. Ubiquitous language

- **syntax check**: the gate step that parses every checked file and runs nothing.
- **fault**: one file that fails to parse, as `{ file, line, message }`.
- **checked files**: `git ls-files -co --exclude-standard -- '*.mjs' '*.js'` under the checkout, minus paths deleted from disk.
- **detection**: `.mjs` is ESM; `.js` is ESM if it parses as ESM, otherwise CJS.

## 5. Locked decisions

- **L1** The check runs first in `runGate`, before the ledgers. It is the cheapest step and fails fastest. Rejected: running it after the ledgers, which would
  spend a rebuild on a tree that cannot run.
- **L2** It runs in every mode: full, `--since` and coverage. The whole tree is always checked, because 0.4 s is cheaper than working out a selection. Rejected:
  checking only the `--since` selection.
- **L3** It follows the ledgers pattern: an injected `syntax` with a no-op default, and the real `syntaxErrors` passed only at the entry block.
  Existing `runGate` tests stay unchanged. Rejected: a default real check, which breaks seven test files.
- **L4** It fails closed. A child that cannot start or that prints no result exits 1 with `syntax: could not check (<reason>)`.
  Rejected: skipping with a warning.
- **L5** No new dependency and no linter. The audit's fix says "no new dependency", and a linter is out of scope (§7).

## 6. Assumed decisions

- **A1** *assumed*, question itm_d5b0659bc203: how files are parsed. Default: one child `node --experimental-vm-modules --disable-warning=ExperimentalWarning
  scripts/check-syntax.mjs`, which parses with V8 in process (0.4 s). Trade: it depends on an experimental Node API. Spec 4's
  corpus test is the guard if the API's behaviour drifts, and L4 makes the gate red if the API is removed. Rejected: `node --check` once
  per file, as the ticket words it (21.9 s at width 8, which misses spec 5).
  Verdict: stands - the ticket's own 10 s line rules out the per-file path; the user's press on itm_d5b0659bc203 decides
  Answer (user, itm_d5b0659bc203): In-process (default). Locked as written.
- **A2** *assumed*, asked by main as itm_aa6fcd1df4cc: name every fault. Default: all of them, at no extra cost in process. Trade: a long list when a tree is badly broken.
  Rejected: stopping at the first fault, as drafted.
  Verdict: stands - no queued ticket depends on first-fault-only; the user's press on itm_aa6fcd1df4cc decides
- **A3** *assumed*, asked by main as itm_d77ac7d026ec: include untracked files git does not ignore. Default: yes, because an implementer's uncommitted new file is the likeliest
  one to be broken. Trade: a scratch file someone left lying around can make the gate red. Rejected: tracked files only, as drafted.
  Verdict: stands - crews gate uncommitted work in their worktrees, where a new file is the likeliest broken one; the user's press on itm_d77ac7d026ec decides
- **A4** *assumed*: QA environment. Default: a CLI run of the gate in a scratch clone (§9).
  Verdict: stands - a 1-slice plan takes the short path, which has no QA agent; the implementer's live check is this CLI run and the pilot posts the walkthrough from it
- red team: the spawn count was first written as "+1". The counter preload only reaches the suite's children, so spec 6 now says "the same".
- red team: a `.js` file that is valid only as sloppy CJS would fail an ESM-only parse. Detection (§4) keeps the CJS fallback for `.js`
  and never for `.mjs`, and spec 4's corpus covers both.
- red team: `gate-install.test.mjs` test 4 runs a copy of the gate with no `.git`. It exits at the `node_modules` refusal before `runGate`, so
  the check never reaches git there. Attacked and not broken.

## 7. Out of scope

A linter or type check (eslint, tsc); `.cjs`, `.ts` and `.json` files; a syntax error in a file `gate.mjs` imports
statically (Node names it at load before the check could run); an allowlist for intentionally broken fixtures (none
exist: all 666 pass `node --check` today).

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The gate refuses a syntax error before the suite, naming the file | 1-6 | `scripts/check-syntax.mjs` (new), `scripts/test/check-syntax.test.mjs` (new), `scripts/gate.mjs`, `scripts/test/gate-syntax.test.mjs` (new), `docs/adr/NNNN-audit-f6.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |

S1 is the walking skeleton and the whole feature: one new module, one step in `runGate`, about 200 lines. It
starts a process, which is the security trigger, so `pilot:security-reviewer` reviews it.

## 9. Acceptance evidence

In a scratch clone of `feat/audit-f6` after `npm ci`:

1. `npm test` on the clean tree prints `syntax ok <n> files in <ms> ms` first, with n matching the count in spec 3 and ms under 10 000, and then runs the suite as today.
2. With `export const a = ;` planted in `deck/ui/js/navigate.mjs` and an untracked `scripts/tmp-broken.mjs`, `npm test -- --since=HEAD` exits 1 within
   seconds with two `syntax:` lines, and prints no `ledgers` line and no test output.
3. With the plants removed, `npm test -- --since=HEAD` prints the ok line again.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/audit-f6-s1` | – | – | – | 1-6 |
| audit-f6 | planned | `feat/audit-f6` | – | – | S1 | 1-6 |
