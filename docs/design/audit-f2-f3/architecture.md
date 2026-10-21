# audit-f2-f3: the rerun-alone gate step and `pilot gh-stub`

Ticket `itm_a796b37c2d10` · base `pilot` at 33a5ead7 · ADR 0173 (`docs/adr/0173-a-gh-stub-is-node-linked-as-gh.md`; the landing numbers it, ADR 0167) · audit rows F2, F3.

## 1. Problem

Every run re-derives two habits. When a test goes red in the gate, the implementer reruns that file alone to tell a flake from a regression. Five run records show this, and no definition says it. On Windows, a probe of a PR command needs a stub `gh.exe` first on PATH so that it never reaches real GitHub. That stub was rebuilt by hand four times in runs-build-on-each-other, and one first probe did reach GitHub read-only. Neither habit is written in a definition or shipped as a helper.

## 2. Spec

| # | Behaviour a user could watch | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | An implementer whose phase-gate test run shows a red reruns the file holding each failing name (the names the run prints, `failingNames`, `scripts/integrate.mjs:203`) alone once with `node --test <file>`, before it changes code. Its report's gate line gives both results and calls each red `flake` (green alone) or `regression` (red alone). | `agents/pilot-implementer.md` step 3 and the Report gate line; `check-references` exit 0 | 1 sentence and 1 clause; exit 0 |
| 2 | QA's read-only pass does the same, and its PR comment carries the call. | `agents/pilot-qa.md` `## The read-only pass`; `check-references` exit 0 | 1 sentence; exit 0 |
| 3 | `pilot gh-stub` creates a stub dir and prints the shell lines that put it first on PATH. Under those lines, `gh pr view 12`, run through `execFileSync('gh', …)` (how `scripts/integrate.mjs:55` calls it), prints the dir's `reply.txt` and exits 0. `pilot help` lists the command. | `scripts/test/gh-stub.test.mjs` tests 1, 4, 5; `operating-commands.test.mjs` green with `gh-stub` in `NON_MOVING` | the reply matches byte for byte; exit 0; 1 help entry |
| 4 | The implementer (phase gate step 5) and QA (the read-only pass) each name `pilot gh-stub` in one line, for any live probe of a PR command. | the two lines; `check-references` exit 0 | 1 line each |
| 5 | *assumed* (A3) practitioner: a hermetic-test engineer. The stub records every call in `<dir>/calls.jsonl`, so the probe proves which gh commands ran and that no real gh answered. A node process under the same env is untouched. | tests 2, 3 | exactly 1 line per call; 0 lines from a plain `node` run |
| 6 | *assumed* (A3) practitioner: a Windows release engineer. The printed lines work in both shells agents use: sh `export` lines by default (with the dir in `/c/...` form under Git Bash, where the Windows form loses to the real gh), and `$env:` lines with `--powershell`. | the S1 PR shows both scratch shells running `gh pr view 12` | 2 of 2 shells show the reply |
| 7 | (F9) `pilot help`'s environment block lists `PILOT_STOP_HOLD_MS`, which `hooks/stop-gate.js:80` reads, with one line, and says "Four environment variables". | test 6 in `gh-stub.test.mjs` reads `pilot help` | 1 line |
| 8 | *added* (F5, L10) The implementer's definition says in one line that a new ADR a slice names is written as `docs/adr/NNNN-<slug>.md` and cited `ADR NNNN`, that the landing numbers it (ADR 0167), and that a numbered new ADR file is a refused state its reviewer flags. | the line in `agents/pilot-implementer.md`; `check-references` exit 0; the Gate 1 read | 1 line; exit 0 |

Lines 1-4 are the draft, agreed unchanged on the deck. Line 7 is F9's, merged in. F5 becomes line 8, one implementer line (L10; A4 overturned); its `pilot adr next` stays out (§7). Lines 1, 2, 4 and 8 are evidenced by `check-references` and the Gate 1 read, not by a phrase pin (A1).

## 3. Findings

- `bin/pilot.mjs` (467 lines) is the CLI. It holds one `usage()` template (lines 64-215), with `if (command === …)` dispatch from line 217 and one `import { main as … }` per subcommand (lines 23-56). The pattern a new subcommand follows is `scripts/base.mjs` with `main`.
- `scripts/test/operating-commands.test.mjs:14` `NON_MOVING`: every subcommand `pilot help` lists that is not in this list must be named in `docs/OPERATING.md`. A new non-moving subcommand that is missing from it turns the gate red (red team, §8).
- `scripts/test/lib/help-subcommands.mjs` parses `^  pilot <sub>` out of `pilot help`. It is the seam the help test reads.
- The real gh is spawned without a shell: `scripts/integrate.mjs:55`, `scripts/branches.mjs:149` and `deck/tickets.mjs:24` all use `execFileSync('gh', …)`. On Windows that resolves only `gh.exe`, never `gh.cmd`, which is why a stub must be an `.exe` (PR #312's "For QA", the gate-no-stall row).
- The recipe that worked (PR #312; gate2-frees-lane run.json:359): copy `node.exe` to `<dir>/gh.exe` and set `NODE_OPTIONS=--require <stub.cjs>`, with the stub acting only when the running exe is gh. Under Git Bash, PATH needs the `/c/...` form.
- The existing tests fake gh in-process (`scripts/test/lib/land-repos.mjs:92`, `deck/test/tickets-open.test.mjs:27`). They are left alone: the stub is for live probes, not for unit tests.
- `failingNames` (`scripts/integrate.mjs:203`) prints test names, not files, so the agent finds the file by the name.
- The phase gate runs the selection (`npm run test:changed`) and the full suite runs only at `pilot land` (`agents/pilot-implementer.md:53`, `agents/pilot-qa.md:89-91`). Spec 1 therefore reads "a red in the gate's test run", not "in the full suite".
- Open #906 (crew-tests-behaviour) proposes ADR 0168, "prose is not a test target": no test asserts a phrase in prose. The draft spec's "wording pin" evidence would be cut when #906 lands (A1).
- Of the five overlaps the brief named, #981 (blocking-close) alone edits `bin/pilot.mjs`, and none edits `agents/pilot-implementer.md`, `agents/pilot-qa.md` or `operating-commands.test.mjs`. ADR numbers are not chosen by a run: a run writes `docs/adr/NNNN-<slug>.md` and the landing allocates the number (`scripts/adr-allocate.mjs`, ADR 0167).
- There is no prompt-size pin on the implementer or QA in `scripts/test/measure-prompt.test.mjs`. Only the pilot, explorer and architect are pinned.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/gh-stub.mjs` | `ghStub({ dir? }) -> { dir, gh, env }`; `main(argv) -> code` | the exe link or copy, the `stub.cjs` preload and its guard, the calls log, the reply file, the shell-specific PATH form | local-substitutable (fs and child_process in a temp dir) |
| `bin/pilot.mjs` help and dispatch | `pilot help` stdout, `pilot gh-stub` | one dispatch line and one help entry; nothing folded | in-process |
| crew definitions | `agents/pilot-implementer.md` step 3 and step 5, `agents/pilot-qa.md` read-only pass | the two habits, as prose read by a model | n/a (prose; `check-references`) |

Deletion test: delete `ghStub` and the recipe comes back in every implementer and QA run, the four rebuilds. It is deep: one call hides the platform split, the exe resolution trap and the preload guard. The dispatch is a pass-through, as every subcommand's is, and is kept to the codebase's pattern. No fold changes code.

## 4. Ubiquitous language

- **Stub dir**: the directory `ghStub` makes. It holds `gh(.exe)`, `stub.cjs`, `reply.txt` and `calls.jsonl`.
- **Reply**: the bytes of `reply.txt`, which the stub prints for every call (empty when the file is absent).
- **Calls log**: `calls.jsonl`, one JSON argv array per gh call.
- **Rerun alone**: `node --test <file>` on the one file that holds a failing name, run once.
- **Flake / regression**: green alone / red alone, for a test that was red in the gate's run.

## 5. Locked decisions

- **L1 The stub is node itself, hard-linked as `gh(.exe)`, with a `--require` preload.** This is the recipe that worked in #312: a real exe that `execFileSync` resolves on every OS, with no compiler. It falls back to a copy across volumes. Rejected: a `gh.cmd` or shell script, which `execFileSync` never finds on Windows; a Node SEA build, which needs postject and a signing step.
- **L2 The preload is a no-op unless the running exe's base name is `gh` or `gh.exe`.** `NODE_OPTIONS` reaches every node under that env, `pilot` itself included. Rejected: unsetting `NODE_OPTIONS` per call, which the caller would have to remember.
- **L3 One reply for every call, and a calls log.** The agent writes `reply.txt` for the probe in hand and reads `calls.jsonl` afterwards. Rejected: a per-subcommand reply table, which is speculative because no run asked for one (A3).
- **L4 The output is shell lines: sh by default, `--powershell` on request; a fresh `mkdtemp` dir unless `--dir`.** The agent uses them as `eval "$(pilot gh-stub)" && <probe>` in one Bash call, since shell state does not persist between calls. A fresh dir keeps parallel agents' replies apart. Rejected: printing only a PATH value, which loses the `NODE_OPTIONS` half and the `/c/` form.
- **L5 The rerun-alone sentence**, the same in both files: "A test red in that run is rerun alone once, `node --test <file>` on the file holding each name it printed, before you change code; report both results and call each `flake` (green alone) or `regression` (red alone)." Rejected: an automatic retry in `scripts/gate.mjs`, which would hide flakes the run records rely on and is out of scope (§7).
- **L6 ADR 0173** records L1-L4. `pilot gh-stub` is a shipped helper and its mechanism is not obvious.
- **L7 F9's line sits in `pilot help`'s environment block**, beside `PILOT_DECK_DIR`, and goes in S1 because S1 already owns `bin/pilot.mjs`. Rejected: its own slice on the same file, which would add an after for one line.
- **L8 Grilling depth: forks** (deck). Only decisions whose paths fork are posted; the rest stand assumed.
- **L9 QA environment** (deck): the local gate (Windows `npm test` once; WSL `node scripts/gate.mjs` five times on a fresh clone) and `pilot gh-stub` probed for real in a scratch shell with `gh` under its PATH. No deck, no migrations, no seeded-red replay.
- **L10 ADR numbering stays the landing's; the implementer is told so** (deck, itm_d32bcc13196f). One line in `agents/pilot-implementer.md`: a new ADR a slice names is `docs/adr/NNNN-<slug>.md`, cited `ADR NNNN`, numbered by the landing (ADR 0167); a numbered new file is a refused state. Built in S2 as spec 8. Rejected: `pilot adr next`, a second numbering path that two branches cut in the same hour would still share; dropping F5 outright, since lander-tail's crew hard-numbered 0170 and its landing went red (37ff3411).

## 6. Assumed decisions

- **A1 Prompt lines are evidenced without phrase pins.** Default: spec 1, 2 and 4 rest on `check-references`, `measure-prompt` and the Gate 1 read, following ADR 0168 (proposed in #906). Tradeoff: a reword that drops the rule still passes the suite. Rejected: the draft's wording pins, which #906 cuts when it lands.
  Verdict: stands
- **A2 S1 is about 90 lines, past the 40-line limit.** The estimate is `gh-stub.mjs` about 40, the test about 35, and bin, help, `NON_MOVING` and the agent lines about 10. Default: keep it as one slice. Splitting the module from its CLI wiring gives a third slice and a horizontal cut. Tradeoff: one longer review. Rejected: S1a module and S1b CLI. Settled by the pilot: one slice. The 40-line figure is the implementer's limit for asking before the diff grows, not a bound on a slice.
  Verdict: stands
- **A3 Spec 5 and 6 are added lines.** The calls log and the two shell forms were implied by the draft but never stated. Default: in scope. Tradeoff: about 10 more lines in S1. Rejected: PATH-only output.
  Verdict: stands
- **A4 F5 is dropped as already delivered.** ADR 0167 and `scripts/adr-allocate.mjs` already number a run's `NNNN-<slug>` ADR at the landing, and `agents/pilot-architect.md:207` already tells the architect to write the placeholder. The audit's evidence, 0170 on design/blocking-close and feat/lander-tail, is `NNNN-plain-session-reach` renumbered at its landing, not a collision. Default: no `pilot adr next`, and F5's two lines go to §7. Tradeoff: the lander-tail landing went red on this (37ff3411). Its crew wrote `docs/adr/0170-…` directly, which clashed with plain-session's 0170, and the lander renumbered it to 0171, so crews still hard-number. Alternative before the user: one implementer line (a new ADR on a slice is `NNNN-<slug>`, and a numbered new file is refused), evidenced by `check-references`, which would add an S2 line. Open: the pilot is asking the user; §7 waits on the answer. Rejected: `pilot adr next`, a second numbering path beside the landing's.
  Verdict: overturned: the landing that went red on a hard-numbered ADR (37ff3411) is in the queue's own history; the user chose the one-line reinforcement, locked as L10 and built in S2 as spec 8.

## 7. Out of scope

- An automatic flake retry in `scripts/gate.mjs` or `pilot integrate`.
- Moving the existing in-process gh fakes onto the stub.
- Per-subcommand replies, exit codes other than 0, or scripting the stub.
- A phrase-pin test for any prompt line (A1).
- F5's `pilot adr next` and its architect line (L10): the placeholder is the one numbering path.
- Tickets F1, F4 and F6-F8 (merge thread `itm_7423f0c51fd0`: not the same surface).

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: `pilot gh-stub` answers a PR probe without reaching GitHub | 3, 4, 5, 6, 7 | `scripts/gh-stub.mjs` (new), `scripts/test/gh-stub.test.mjs` (new), `docs/adr/0173-a-gh-stub-is-node-linked-as-gh.md` (new), `bin/pilot.mjs`, `scripts/test/operating-commands.test.mjs`, `agents/pilot-implementer.md`, `agents/pilot-qa.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A red at the gate is rerun alone once and called flake or regression | 1, 2, 8 | `agents/pilot-implementer.md`, `agents/pilot-qa.md` | S1 (`agents/pilot-implementer.md`, `agents/pilot-qa.md`) | `pilot:security-reviewer` | [S2](slices/S2.md) |

S1 goes first by risk: the exe resolution and the preload guard can fail on a platform, and the prose cannot.

Red team (I assumed the cut had failed and looked for why):
- red team: `gh-stub` is missing from `NON_MOVING`, so `operating-commands.test.mjs` would go red at S1's gate. S1 now owns that file.
- red team: test 3 attacks L2: without the guard, every node process under the env (the test runner itself) would act as gh.
- red team: spec 6, the Windows-form PATH under Git Bash loses to the real gh (#312), so S1's evidence requires both scratch shells.
- red team: seams half-built by two slices: none, since S1 alone builds `ghStub` and S2 builds no seam.
- red team: parallel width: S1 and S2 share the two agent files, so they run one after the other. Moving spec 4 into S2 would not widen the cut, because S2 would then name a command that S1 had not yet landed.

## 9. Acceptance evidence

1. `pilot help` shows `pilot gh-stub` and `PILOT_STOP_HOLD_MS` (spec 3, 7).
2. In a Git Bash, `eval "$(pilot gh-stub)"`, `echo hi > <dir>/reply.txt`, `gh pr view 12` prints `hi`, and `<dir>/calls.jsonl` holds `["pr","view","12"]` (spec 3, 5, 6). Repeat with `--powershell` in PowerShell.
3. `node -e "console.log(1)"` under the same env prints `1` and adds no line to the calls log (spec 5).
4. `agents/pilot-implementer.md` step 3 and step 5, and `agents/pilot-qa.md`'s read-only pass, read as L5 and name `pilot gh-stub` (spec 1, 2, 4).
5. `npm test` once on Windows, and `node scripts/gate.mjs` five times green on a fresh WSL clone at the feature's tip.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/audit-f2-f3-s1 | – | – | – | 3, 4, 5, 6, 7 |
| S2 | planned | slice/audit-f2-f3-s2 | – | – | S1 | 1, 2, 8 |
| feature | planned | feat/audit-f2-f3 | – | – | S1, S2 | 1-8 |
