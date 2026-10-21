# Landing keeps a live agent's worktree, and the crew never chains past a failed cd

Ticket `itm_28b7f8187c85` · feature `landing-keeps-worktrees` · base `pilot` e78b1e85 · rebases on
`feat/gate2-frees-lane` (#748) once it lands · ADR 0163 (S3; 0156, 0160, 0161 and 0162 were taken)

## 1. Problem

`pilot land` removed the QA agent's worktree while that agent was still live under it. The agent's next
`cd X; …` chain then ran on in the user's shared checkout and moved their branch `fix/claude-workflow-tools`.
The user asked for a systematic fix, and asked whether an agent should be able to close Blocked threads. The
answer is no: only the pilot closes one, as `Moot: <why>`.

## 2. Spec

These are the ticket's three lines, sharpened against `origin/feat/gate2-frees-lane`. Line 3 is *added*: without
it, the kept worktrees are never removed, which would regress clean-landing L5. The user agreed all five
lines as written (itm_fb3e1f3e77df, "Spec stands").

| # | Ticket | Behaviour a user can watch | Evidence |
| --- | --- | --- | --- |
| 1 | 1 | `pilot land` never removes its own run's `qa/<slug>` or `feat/<slug>` worktree, even when merged-clean. It prints `kept concluding <path>` for each, and the deck's closing report lists both under "Worktrees kept". | land-clear test: a merged-clean qa worktree and the feat worktree both survive and are named; a closing-report test reads the `kept concluding` line under "Worktrees kept" |
| 2 | 1 | `prune` keeps any worktree that a live pilot process names, whether land's clear calls it or `pilot worktrees prune` does. A process names a worktree through a deck's `--leash-dir`, a daemon run from that worktree, or `pilot --dir <wt> wait`. The worktree is printed as `kept live <pid> <path>`. A process the table cannot settle counts as live; an orphaned one does not. | prune tests on a git fixture with an injected process table: a live leash keeps the tree, an orphaned leash lets it go, an unsure daemon keeps it |
| 3 | – (*added*) | When QA's final report arrives after the press, the pilot runs `pilot worktrees prune --run <slug>` from the main checkout, at the same point as the `report due` teardown, so the kept worktrees go once nobody stands in them. | wording pin on `agents/pilot.md` |
| 4 | 2 | Every crew agent with a shell names the shape for a command on another worktree: `git -C <dir> …` or `cd <dir> && { … }`. It never uses `cd <dir>; …` or a `cd` on its own line. The ten agents are pilot, co-pilot, implementer, QA, fundamentalist, evidence runner, architect, explorer, auditor and teacher. | one pin per file in `scripts/test/cd-shape-wording.test.mjs`; the pilot and explorer pins in `measure-prompt.test.mjs` move by exactly the measured cost |
| 5 | 3 | The pilot's Moot paragraph says a `Blocked:` item is closed only by the pilot, as `Moot: <why>`, and never by the refused agent. The deck already refuses any other writer (`isMoot`). | wording pin on `agents/pilot.md`; `deck/test/moot.test.mjs` unchanged and green |

## 3. Findings

- **Clear**: `clear()` (`scripts/land.mjs:152-170` on gate2-frees-lane) chdirs to the main checkout and calls
  `prune(checkout, <remote>/pilot, { run, merged })`. Every run worktree (`isRunBranch`: feat, design, fix, qa,
  slice) that is merged-clean is removed with `git worktree remove` (never `--force`). Because the QA worktree is
  merged-clean the moment its commits sit on feat, the incident follows.
- **Prune** (`scripts/worktrees.mjs:70-161`): its states are `main`, `locked`, `open`, `merged-dirty` and
  `merged-clean`. Only `merged-clean` goes, and every other state is reported as `kept <state> <path>`.
- **Report**: `closingReportOf` (`deck/closing-report.mjs:49-66`) copies every landing line that starts with
  `kept` into "Worktrees kept". The new states reach the report with no change to the report.
- **Processes**: `pilotProcesses(table, { userDeckPid, exists })` (`deck/procs.mjs:118-166`) answers rows of
  `{ pid, kind, owner, worktree, orphan }`. An unsure row reads `orphan: null`. `processTable()`
  (`procs.mjs:56`) is a PowerShell or `ps` call. Land's CLI already reads it for `landSweep` (`deck/gc.mjs:76`),
  which runs after clear.
- **Subagents** share the session's `claude` pid, so no pid identifies a live agent. A process names a worktree
  only through a path. What saves QA's worktree is line 1's concluding rule: at the press, QA is live by design
  (it tears down on the press, gate2-frees-lane S9).
- **Moot**: `isMoot` (`deck/blocked-shape.mjs:27-32`) needs a pilot author, and `moot.test.mjs:73` pins a QA
  writer as refused. The pilot's prose at `agents/pilot.md:164` already names the Moot close but not who may never
  make it.
- **Wording today**: only `pilot.md:307` and `:395` (`cd <path> && …`) and `pilot-evidence-runner.md:25`
  (`git -C`) show the shape, and no agent forbids `;`.
- **Prompt pins**: `scripts/test/measure-prompt.test.mjs:173` (pilot, `own <= 11441.5`) and `:185` (explorer,
  `<= 2466.5`), each with a history comment.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/worktrees.mjs` | `prune(repo, base, { dryRun, run, merged, keep, holder })`, `classify`, `main` | the concluding and live states beside the existing five, one place deciding what goes | Local-substitutable (git fixture, injected `holder`) |
| `deck/procs.mjs` | `holderOf(owned) -> (dir) => pid \| 'unsure' \| null` | mapping process rows to a worktree path (realpath, case-folded on win32) | In-process (pure over a table) |
| `scripts/land.mjs` | `land({ …, holder })`, `main` | which branches are concluding (`feat/<slug>`, `qa/<slug>`), and one table read shared by clear and the sweep | True external (gh, git injected) |
| agent prose | the pinned phrases in §8 S3 | the cd shape, the prune-on-QA-done step and the Moot clause | In-process (file read) |

Deletion test: if `prune`'s new options were deleted, land and the CLI would each re-test "who stands here", so
they stay. If `holderOf` were deleted, `worktrees.mjs` would reach into procs' row shape, so it stays. `clear()` is
a thin translator to lines, but it is the one place that knows the run's branches, so it stays. No module is shallow
enough to fold, and so there is no fold slice.

## 4. Ubiquitous language

- **Concluding worktree**: the landing run's `feat/<slug>` or `qa/<slug>` worktree. At the press, someone may
  still stand in it.
- **Holder**: a live pilot process whose leash, file or `--dir` lies in a worktree.
- **Kept line**: `kept <state> <path>`, where `<state>` is a prune state, `concluding` or `live <pid>`. It is the
  one form the report reads.
- **The cd shape**: `git -C <dir> …` or `cd <dir> && { … }`.
- **Moot close**: the pilot's `deck_resolve` of a `Blocked:` item with `Moot: <why>`.

## 5. Locked decisions

- **L1 Concluding is a branch rule, not a deck lookup.** Land runs only at the press, when QA is live by design.
  Rejected: reading the ticket's state from the deck, which is a second source and adds a store read to land.
- **L2 Liveness comes from the process table, not from `git worktree lock`.** Rejected: agents locking their own
  worktree, because a dead agent's lock outlives it forever and the lock depends on every agent's prose.
- **L3 Unsure counts as live.** A worktree is removed only when nothing may stand in it. The cost is an occasional
  kept tree, which the user sees named.
- **L4 Land reads the process table once** and hands it to both `holder` and `landSweep`. Rejected: a second
  PowerShell read of about 1 s.
- **L5 The wording goes in each agent, not in `rules/orchestration.md`.** A friend without the installed rules
  would get nothing. Vendored reviewers are left as they are (`check-provenance`).
- **L6 The pilot prunes on QA's final report**, not at `report due`, because QA may still be tearing down at
  report due. Rejected: leaving the worktrees as a human step.
- **L7 The Moot rule is prose only.** The deck already enforces it, and no code changes.

## 6. Assumed decisions

- **A1 Enforce the cd shape with a hook?** (itm_700c367a594e, answered "Prose only (default)": settled, no S4). Default: prose only. Tradeoff: a model that
  ignores its prose can still chain past a failed cd. Rejected path: a PreToolUse Bash hook refusing `cd <dir>;`
  from a crew agent, which costs a node start on every Bash call of every session plus one slice with a security
  review. If the answer is "Add the hook", S4 is added (`hooks/cd-guard.js`, `hooks/hooks.json`, its test), with
  no `after`.
  Verdict: stands — the queue has no hook work; the user chose prose only on itm_700c367a594e.

## 7. Out of scope

- Deleting the remote `qa/<slug>` branch at land (`deleteRunBranches`). A QA push recreates it, which is harmless.
- Vendored reviewer agents' wording.
- `git worktree lock` handling, which is unchanged.
- Any change to the deck's Moot enforcement.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Land keeps its concluding worktrees and names them | 1 | `scripts/worktrees.mjs`, `scripts/land.mjs`, `scripts/test/land-clear.test.mjs`, `deck/test/closing-report.test.mjs` | – | typescript | [S1](slices/S1.md) |
| S2 | Prune keeps a worktree a live process holds | 2 | `deck/procs.mjs`, `scripts/worktrees.mjs`, `scripts/land.mjs`, `scripts/test/worktrees-holder.test.mjs` (new) | S1 (`scripts/worktrees.mjs` `prune`, `scripts/land.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | The crew names the cd shape, the pilot prunes on QA done and owns Moot | 3, 4, 5 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-evidence-runner.md`, `agents/pilot-architect.md`, `agents/pilot-explorer.md`, `agents/pilot-auditor.md`, `agents/pilot-teacher.md`, `scripts/test/cd-shape-wording.test.mjs` (new), `scripts/test/measure-prompt.test.mjs`, `docs/adr/0160-landing-keeps-live-worktrees.md` (new), `docs/adr/README.md` | – | typescript, security | [S3](slices/S3.md) |

S1 is the walking skeleton: it makes the incident impossible on its own.

## 9. Acceptance evidence

1. After a Sign off press, the gate2's landing line and the closing report's "Worktrees kept" list name the QA and
   feat worktrees as `kept concluding`, and both directories still exist.
2. With a scratch deck leashed into another run worktree, `pilot worktrees prune --run <slug>` prints
   `kept live <pid> <path>`. Once the deck is stopped, the same command removes the worktree.
3. Once QA reports done, the pilot runs `pilot worktrees prune --run <slug>` and the run's worktrees are gone.
4. `node --test scripts/test/cd-shape-wording.test.mjs scripts/test/measure-prompt.test.mjs` is green.
5. `deck/test/moot.test.mjs` is green, and the pilot's Moot paragraph reads "never by the refused agent".

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/landing-keeps-worktrees-s1` | – | – | – | 1 |
| S2 | planned | `slice/landing-keeps-worktrees-s2` | – | – | S1 | 2 |
| S3 | planned | `slice/landing-keeps-worktrees-s3` | – | – | – | 3, 4, 5 |
| landing-keeps-worktrees | planned | `feat/landing-keeps-worktrees` | – | – | S1, S2, S3 | 1–5 |
