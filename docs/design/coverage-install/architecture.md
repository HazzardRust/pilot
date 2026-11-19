# coverage-install: coverage is never unmeasured for a missing node_modules

Ticket `itm_8afc7fbf2501` · base `pilot` · branch `feat/coverage-install`

## 1. Problem

Gate 2 has said diff coverage was "unmeasured" because the evidence runner's worktree had no
`node_modules`. The user wants that cause closed: the install runs first, and a failed install is
reported as a failed install.

## 2. Spec

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | Whoever spawns the evidence runner, a worktree with a `package-lock.json` and no `node_modules` gets `npm ci --ignore-scripts` before the first check | the runner on a fresh detached worktree: an `install` row, exit 0, then a `Diff coverage:` row | 1 run, a percentage printed |
| 2 | A failed install is reported as that: the `install` row carries its exit code, and the Node coverage and mutation rows read `not run: install failed (exit <n>)` and are not run | a scratch repo whose lockfile disagrees with `package.json` | 1 install row with exit ≠ 0, 2 rows naming it |
| 3 | The fundamentalist reports a failed install as `install failed (exit <n>)`, never as plain unmeasured, and is no longer a second installer | a prose test of both definitions | 3 tests red before, green after |
| 4 | (practitioner: CI engineer; accepted on `itm_f652048fc632`) an install never runs over an existing `node_modules`, since agents junction it and `npm ci` deletes through the junction | the condition in the runner's prose, pinned by spec 3's test | 0 `npm ci` runs when `node_modules` exists |

The draft's line 2 (Gate 2 wording) is carried by spec 3: Gate 2's gaps line is the pilot's and QA's,
copied from the fundamentalist's report, so the cause reaches it once the report names it.

## 3. Findings

Why the existing order did not hold, from the fundamentalist and runner transcripts since 0.9.9 was
installed (2026-11-19 09:53 +10, the first installed plugin with the step):

| Run | Install ran | Coverage cause |
|---|---|---|
| never-stuck-2 | no | ran on 0.9.8, which had no step (`0.9.8/agents/pilot-fundamentalist.md`: 0 hits) |
| yellow-never-idle | yes, on the re-run | runner output lost across a context reset |
| crew-refusals | yes, 06:47Z | runner did not return; auto mode refused the old c8 cell |
| handoff-cache | **no** | the co-pilot respawned the runner in its own worktree `pilot-evidence-handoff-cache` (runner transcript `agent-aebce435…`, 10:10Z: `node_modules missing: run npm ci`) |
| human-steps | **no** | an evidence runner re-spawned by a co-pilot declined `npm ci`; diff coverage and mutation unmeasured (reported by `main`, 2026-11-20) |
| recut-decision | yes, 14:46Z | auto mode refused the old c8 cell, "Undermining Oversight" (ticket `itm_5807aa39f833`); coverage-cell (`ebe5233c`) replaces that cell, effective after `pilot update` |

The prose held every time the fundamentalist spawned the runner. The gap is that the install lives in
the spawner, and the co-pilot (`agents/pilot-co-pilot.md:6` grants `pilot:pilot-evidence-runner`) is a
second spawner without it; human-steps is a second case of the handoff-cache shape. recut-decision's
gap is not this cause.

What the design leans on:

- `agents/pilot-fundamentalist.md:51-56`: the install paragraph, scratch `HOME` and `USERPROFILE`, `--ignore-scripts`.
- `agents/pilot-evidence-runner.md:17-47` "Before the first run" sets `$W`, `$S`; `:57-60` forbids any install; `:93-106` the return table.
- `scripts/gate.mjs:351-361`: `missingInstall` and `node_modules missing: run npm ci`, the message a missing install prints through `$TEST`.
- `scripts/test/pilot-agents.test.mjs:1100-1122`: the table has exactly six check rows, no cell overrides `HOME`; so the install goes in the section before the table.
- `.gitignore:1` ignores `node_modules/`, so the install writes no tracked file.
- `scripts/measure-prompt.mjs` `pinsOf`: no pin for the runner, fundamentalist or co-pilot; no prompt budget binds.

**Seams**

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Evidence runner | "Before the first run" (install step), the command table, "What you return" (`install` row, `not run: install failed (exit <n>)`) | the fundamentalist's install paragraph, and the co-pilot's missing one | local-substitutable (a scratch worktree) |
| Fundamentalist evidence pass | spawn the runner; quote its rows | nothing new; it loses its install step | in-process |

Deletion test: delete the fundamentalist's install paragraph and the complexity reappears in every
spawner (two today); behind the runner it is written once.

## 4. Ubiquitous language

- **Install step**: `npm ci --ignore-scripts` under a scratch home, run once by the runner.
- **Failed install**: an install step with a non-zero exit; never retried.
- **Spawner**: any agent that starts the runner (the fundamentalist, the co-pilot).
- **Unmeasured**: a coverage row with no number and no named cause, which this run removes for this cause.

## 5. Locked decisions

- **L1 One installer, the runner.** Rationale: the runner is what needs `node_modules`, whoever spawns it. Rejected: an install step in each spawner, which handoff-cache shows is skipped by the second one.
- **L2 Only when no `node_modules`.** Rationale: `npm ci` deletes `node_modules` first, and agents junction it to a shared checkout. Rejected: always `npm ci`, the CI default, which costs ~40 s and risks a shared install.
- **L3 Outside the table, before it.** Rationale: the six-check table and its no-`HOME` override test stay as they are; the scratch home stops a user `.npmrc` being read. Rejected: a seventh `Install` row.
- **L4 ADR NNNN** (`docs/adr/NNNN-coverage-install.md`, S1) records L1 and A1.
- **L5 Grilling depth: forks.** The user pressed "forks" on `itm_5106329c1e05`: the user is asked the design forks only, the rest defaulted here. Rejected: a full grilling of every branch.

## 6. Assumed decisions

- **A1 Install in the runner, not in each spawner.** Default: the runner installs (L1). Tradeoff: the runner becomes a writer of the ignored `node_modules` and reaches the npm registry, beyond its table's `npx`/`uvx` fetches; its description and the security review must say so. Rejected path: keep the fundamentalist's step and add the same to `agents/pilot-co-pilot.md`, two copies of one step and a file ci-gate S7 owns. Put to the user with the spec on `itm_f652048fc632`.
  Assumed bars (security probe), each pinned by S1's tests: `--ignore-scripts` always; a scratch `HOME`
  and `USERPROFILE`; never `npm ci` when `node_modules` exists (spec 4, junctions); the runner's added
  network use is the npm registry only.
  Verdict: stands — the user pressed "Accept the reworked spec" on itm_f652048fc632

## 7. Out of scope

- The auto-mode refusal of the old c8 cell (coverage-cell, landed; needs `pilot update`).
- A runner output lost across a context reset, or not returned (yellow-never-idle, crew-refusals).
- Mutation's 900 s cap and Stryker on this suite.
- Gate 2's wording in `agents/pilot.md` and `agents/pilot-qa.md`.
- Python, Go and other stacks' installs.

## 8. Slices

Width 1; longest stem 1

| Slice | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 The runner installs before its first check and names a failed install | 1, 2, 3, 4 | `agents/pilot-evidence-runner.md`, `agents/pilot-fundamentalist.md`, `scripts/test/pilot-agents.test.mjs`, `docs/adr/NNNN-coverage-install.md` (new) | – | typescript, security | [S1](slices/S1.md) |

S1 is the walking skeleton and the whole feature: estimated +25 / −8 lines.

red team: attacked S1's first behaviour against the real files. The six-row table test
(`pilot-agents.test.mjs:1106`) and the no-`HOME` cell test (`:1113`) would break on an install row, so
L3 puts it before the table. The runner's `:57-60` "no install into the project" contradicts the step,
so S1 owns its rewording. The description's "only network use" line would become false, so S1 owns it.
No seam is half-built by two slices (one slice).

## 9. Acceptance evidence

1. The runner on a fresh detached worktree with no `node_modules`: an `install` row, exit 0, then `Diff coverage: <n>%`.
2. The runner on a scratch repo with a mismatched lockfile: `install` with its non-zero exit, and two `not run: install failed (exit <n>)` rows.
3. `node --test scripts/test/pilot-agents.test.mjs`: the three new pins green; `npm test` green.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 1, 2, 3, 4 |
| coverage-install | planned | `feat/coverage-install` | – | – | S1 | 1-4 |
