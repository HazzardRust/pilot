# Clean landing: a landing never stops blind, and clears up after itself

Ticket itm_09983af566aa (merged itm_3a8246c8466e) · slug `clean-landing` · base `pilot` 64906d40 · branch `design/clean-landing`

## 1. Problem

Landings stop blind on things that are not the feature's. The generated ADR index
(`docs/adr/README.md`) conflicts whenever two runs each add an ADR (three stops in two
days); `docs/design/*/run.json` the same. Tests that pass under `npm test` in the worktree
fail under the daemon-spawned landing (#496, three refusals), and a red run names neither
its tests nor a log (handoff-failed-confirm: four refusals on a fixed port 4399 a QA deck
held). A crew member's push to `origin/feat/<slug>` fails the Gate 2 press, because the
landing pushes from a worktree behind it (itm_56cc748559bb: a second gate2). A refused
landing is not visible where the user looks, and a ticket closes with its PR still a
draft (#492). Worktrees of landed runs are never removed, so `git worktree list` is
49-70 lines. The user wants a systematic fix in the git protocol, not another retry.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Two branches that each add one ADR (and its index row) merge without a conflict, in any `git merge` of this repository. | A scratch-repo test with this repo's `.gitattributes`: two branches each adding an ADR merge with exit 0, both rows kept. |
| 2 | After a landing's merge the index is the generated one, so `node scripts/adr-index.mjs --check` is green on pilot's tip; after any other merge it is green or names the reorder. | The land test of 4 runs `--check` on pilot's tip; the spec-1 test with rows out of order sees `--check` name the difference. |
| 3 | A test pins the `.gitattributes` line and the land-time regeneration. | `scripts/test/merge-generated.test.mjs` fails when either is removed. |
| 4 | A landing's merge (feature into pilot in `land`, default branch into pilot in `sync`) never stops on a generated file: the index is regenerated, `docs/design/<slug>/run.json` takes the writer side, and the merge goes on to the tests. Any other conflict exits 3 naming only the conflicting source files. | A land test with two features each adding an ADR lands both, index lists both; a planted `run.json` conflict lands with the feature's record; a source conflict beside an index conflict names only the source file. |
| 5 | A landing first brings the feature worktree to `origin/feat/<slug>`, fast-forward only; a diverged worktree, or one with tracked changes, is refused by name with nothing pushed. | A land test from a worktree one commit behind origin lands with origin's commit; diverged and dirty variants refuse naming both SHAs or the files. |
| 6 | A landing runs the tests as `pilot land` in a shell does: a tree green under `npm test` in the worktree is green under `pilot landing` from the deck. | test 4 of `deck/test/landing-parity.test.mjs` (the spawn shape) plus the full suite green under the daemon at landing. |
| 7 | After a landing, the run's worktrees whose HEAD is on `origin/pilot` and whose tree is clean are removed with their local branches, the feature worktree included; remote branches stay. (L10) | A land test with planted feat, design and slice worktrees of the slug: none listed after, `origin/feat/<slug>` present. |
| 8 | A dirty, unmerged, locked or in-use worktree of the run is kept and named in the landing's output; another run's worktrees are never touched. | The same test with a dirty slice worktree and another slug's merged-clean one: both kept, the first printed `kept merged-dirty <path>`. |
| 9 | After this feature's own landing, `git worktree list` shows none of `clean-landing`'s worktrees. | The list in the closing report. |
| 10 | No test names a fixed port: `deck/testUtils.mjs` exports `freePort()` (bind 0, close, use), and every literal 4399 in a test uses it. | `git grep -n 4399 -- '*.mjs' '*.js'` finds no test use (45 today); with a listener on 4399, `deck/test/run.test.mjs`, `deck/test/wait.test.mjs`, `scripts/test/handoff.test.mjs` pass. |
| 11 | Test output is legible: `npm run test:quiet` ends with one line of tests, pass and fail counts equal to `npm test`'s, under 10 KB on green; a red `pilot sync`, `pilot integrate` or `pilot land` names its failing tests in its line and keeps the run's full log under `~/.claude/pilot/logs/`, naming the path; neither `pilot sync` nor `pilot land` takes a `--test` flag (L12). | Today 3236 bytes of dots and no count; a sync test with one planted red test prints its name and the log path. |
| 12 | A refused landing is visible: the gate2 thread carries the refusal line with its failing tests, and the ticket's feature row in its status table carries it, so a red ticket shows why it waits. | A landing test with a stubbed `land` sees the line on the gate2 and on the record's feature row; a scratch-deck run shows the row. |
| 13 | A ticket closes only once its feature PR is ready for review: the landing runs `gh pr ready` on the feature's open PR; a refusal leaves the ticket red with the row naming it, and the pilot retries before the closing report; only the user's word lets the report go up with a draft PR. | A land test where `gh pr ready` fails prints `pr ready failed: <why>` and the row carries it; a wording pin on `agents/pilot.md` step 9 and the closing-report clause. |
| 14 | `hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" passes under `npm run test:quiet` on a loaded machine: its `fetch failed` / `ECONNRESET` is diagnosed and fixed at the cause. | The test run 10 times under `test:quiet` with the full suite passes every time; the diagnosis is one paragraph in the PR. |

It cannot mean: resolving conflicts in source files (they still stop, exit 3, worktree kept, red-lands-on-pilot L5); a GitHub merge of a feature PR into `main` (no land code runs there, §7); a per-call test command (`--test`) on `pilot sync` or `pilot land` (L12).

## 3. Findings

- **The landing merge.** `scripts/sync.mjs:42` `mergeIntoPilot` is the seam `sync` and `land` share (red-lands-on-pilot L2): a temp worktree at `origin/pilot`, `git merge --no-ff`; on a stop it reads `diff --diff-filter=U` and throws exit 3 with `paths` (`:68-74`). No resolution step: a generated path is a conflict like any other. `land.mjs:118` `resume` re-merges a kept resolution by the same rule.
- **The index.** `scripts/adr-index.mjs` renders from `docs/adr/*.md`; `render` is internal, `indexLines`/`checkIndex` exported (`:86`, `:128`). `.gitattributes` holds only `* text=auto eol=lf`. Git's builtin `merge=union` keeps both sides of a conflicting hunk, ours first: no conflict, maybe out of order, which `checkIndex` names (`:148`).
- **run.json.** Written by the deck into the feature worktree (`deck/server-tools.mjs:149-159`) and committed by `pilot handoff`; the feature is its writer, and pilot holds what the last landing carried.
- **The pushed feature.** `land.mjs:59` pushes `head` without reading `origin/feat/<slug>` first; `sync` fetches (`sync.mjs:128`) but never touches the caller's checkout.
- **Worktree removal.** `scripts/worktrees.mjs` (ADR 0081) classifies `main/locked/open/merged-dirty/merged-clean` and prunes merged-clean ones with `git worktree remove` (never `--force`) and `git branch -d`. No run filter; its base defaults to `origin/<default>`, which a landed feature reaches only when the user merges its PR. `agents/pilot.md:600` runs it then, which never happens inside a run. `deck/landing.mjs:139` spawns `land` with `cwd` the feature worktree.
- **Tests under the daemon.** The daemon is detached with `stdio: 'ignore'`; `deck/landing.mjs:139` spawns `land` `windowsHide`, stdin ignored, `sessionEnv` (drops only parent markers, `deck/session.mjs:32`); `runTests` (`scripts/integrate.mjs:84`) pipes the suite through `spawnSync`. A researcher found no env variable the two #496 tests read (in-process `clearOnce`, scratch home and port, 5000 ms `eventually`, `run.test.mjs:598`). itm_3a8246c8466e recorded the decisive probe: the same sync passed 3003/0 with `npm test > <log> 2>&1` after four 3/3000 reds piped. So the output channel is the lead: a grandchild holding the inherited pipe, or the pipe itself; S5 reproduces before it fixes.
- **Legibility.** `runTests` returns `counts` from the summary and `failingNames` exists (`integrate.mjs:106`) but no red line uses it; `OUTPUT_BYTES` is 64 MB held in memory; `test:quiet` is the dot reporter (`package.json:20`). No log is kept.
- **Refusal visibility.** `settleLanding` (`deck/store-items.mjs:371`) already writes land's line on the gate2 thread; nothing reaches the run record's feature row, which `setSlices` (`deck/store-runs.mjs:534`) owns.
- **Overlaps.** `deck/test/wait.test.mjs` and `scripts/test/handoff.test.mjs` (spec 10) sit beside idle-main-lane's `deck/wait.mjs` and `scripts/handoff.mjs`: S6 is cut after idle-main-lane lands. `agents/pilot.md` (spec 13's pin, and line 600's prune sentence) is bigger-jobs': S10 is cut after bigger-jobs lands. `deck/store-runs.mjs` is also itm_723a6a8120d1's surface (`registerRun`); S8 adds a function beside it, rebase on whichever lands second. No other file owned below is held by a live run.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Generated-file resolution | `resolveGenerated(dir, paths, { side })`, `refreshIndex(dir)` in `scripts/merge-generated.mjs` (new) | the index regeneration and run.json rule, out of `mergeIntoPilot`'s conflict branch | local-substitutable |
| Landing merge | `mergeIntoPilot({ ..., side })` in `scripts/sync.mjs` | calls the resolver; its red line from `redLine` | local-substitutable |
| ADR index | `renderIndex(dir)` in `scripts/adr-index.mjs` | – | in-process |
| Feature catch-up | `catchUp({ cwd, git, head })` in `scripts/land.mjs` | fetch, dirty check, `merge --ff-only` | local-substitutable |
| Run worktree clearing | `prune(repo, base, { run })`, `runOf(branch, slugs)` in `scripts/worktrees.mjs` | the slug filter beside the state rules | local-substitutable |
| Test run | `runTests(cwd, test, { label })` → `{ status, counts, failing, log }`, `redLine(label, run)` in `scripts/integrate.mjs` | the log file, the names, the line all three commands print | true external (OS processes) |
| Landing spawn | `landingSpawnOptions(cwd, env)` in `deck/landing.mjs` | the shape the parity test reuses | true external |
| Landing on the row | `noteLanding(repo, ticket, { ok, line })` in `deck/store-runs.mjs` | the feature row's state and note | in-process |
| Test port | `freePort()` in `deck/testUtils.mjs` | 45 literals | in-process |

Deletion test: `worktrees.mjs` earns its place, so `land` calls `prune` rather than a
second remover; `mergeIntoPilot`'s conflict branch would grow a per-path switch, so the
resolver is folded out in S1 (under 200 lines); three red lines built three ways fold
behind `redLine` in S5. No fold goes to `main`.

## 4. Ubiquitous language

- **Generated file**: a tracked file a script writes from other tracked files: `docs/adr/README.md`, `docs/design/<slug>/run.json`. Its conflict is resolved, never reported.
- **Landing merge**: a merge made by `mergeIntoPilot`, from `land` or `sync`.
- **Writer side**: the side of a landing merge whose generated file is current: the feature in `land`, pilot in `sync`.
- **The run's worktrees**: those on `feat/<slug>`, `design/<slug>`, `fix/<slug>`, or a branch starting `slice/<slug>-` or `fix/<slug>-`.
- **Catch-up**: the fast-forward of the record's worktree to `origin/feat/<slug>` before a landing.
- **Red line**: the one line a red `sync`, `integrate` or `land` prints: counts, failing names, log path.

## 5. Locked decisions

- **L0 Grilling depth is forks** (the user, itm_e929e13e505d): no walk before the gate1; only questions whose paths give materially different deliverables are stashed, the rest assumed and listed in §6.
- **L1 Union in `.gitattributes`, regeneration in the landing merge.** `merge=union` stops every git merge of two appended rows conflicting (spec 1); `mergeIntoPilot` regenerates whenever the merged index differs (spec 2). Rejected: a custom driver (per-clone `git config`; a fresh worktree lacks it); untracking the index (read on GitHub and by agents).
- **L2 The plugin's own renderer.** The resolver uses the installed `renderIndex`, only where the file carries the generated header, so no merged-tree code runs before its tests and a hand-written README conflicts by name. Rejected: `npm run adr-index` in the merge worktree.
- **L3 run.json takes the writer side.** Rejected: regenerating it from the deck (no daemon in a shell landing).
- **L4 Catch-up is fast-forward only, before `sync`.** Never a rebase or merge commit nobody reviewed; untracked files are not dirty, tracked changes are.
- **L5 The landing clears its run's worktrees, after it lands.** `land` `chdir`s to the main checkout and calls `prune(repo, 'origin/pilot', { run })`; its lines reach the gate2 thread with land's. Rejected: the daemon pruning after `close` (a fourth process start, ADR 0050/0111); the pilot's close (the rule at `pilot.md:600` never fires).
- **L6 Removal stays refusal-safe** (ADR 0081 L5, L6): never `--force`, `-D` or a remote branch; a removal failure never fails a landing.
- **L7 Causes before timeouts.** S5 and S11 start with a reproduction; no timeout raised, test skipped or retry added until the cause is named.
- **L8 The suite writes to a log file, not a pipe.** `runTests` redirects to `~/.claude/pilot/logs/<stamp>-<label>.log` and reads the file back, which is both spec 11's log and the probe that passed in itm_3a8246c8466e; S5 keeps it only if its reproduction shows it is the cause or harmless to it.
- **L9 The landing readies the PR.** `land` runs `gh pr ready` beside its existing `landed on pilot` comment, after Gate 2 is signed, so the close needs no step a closing report can drop. Rejected: the pilot's step 9 alone (#492 showed it dropped).
- **L10 The feature worktree goes at landing, not when the PR merges** (the user, itm_f79b094bdd4a; was A1). Removed with the rest; a fix after landing is cut fresh from `origin/feat/<slug>`; a session standing in it gets "kept (in use)". Reverses `pilot.md:600`'s "`feat/<slug>` stays while its PR is open" (S10 edits it). Rejected: keeping it until the PR merges, one worktree per open PR.
- **L12 No `--test` flag on `pilot sync` or `pilot land`** (the user, itm_a2910ea1e477; was A3). ADR 0110 L11 allows `Bash(pilot land *)` only while no merge command takes a shell command, so `--test` would let an auto-mode agent run any shell in one unprompted call; the landing uses the repository's own test command and the two pins (`scripts/test/test-command.test.mjs:49`, `scripts/test/cli-wiring.test.mjs:41`) stay. Rejected: keeping `--test` and superseding ADR 0110 L11 with a narrower allow rule, for a flag the deck's press never passes.
- **L11 One run of 11 slices** (the user, itm_386cf82779fe; was A2). One feature PR, one QA pass, one Gate 2; S6 waits for idle-main-lane to land and S10 for bigger-jobs, the co-pilot holding each. Rejected: splitting S6 and S10 into a later run, a second grilling, QA pass and Gate 2 for two slices.

## 6. Assumed decisions

- **A3** decided by the user as L12: no `--test` flag anywhere.

## 7. Out of scope

- A feature PR into `main` conflicting on the index on GitHub, which runs no merge driver: the user's merge.
- Source-file conflicts: they stop, as today.
- A sweep of other runs' worktrees: `pilot worktrees prune` stays for that.
- Deck-side refusal of `finished` with a draft PR (`deck/server-tools.mjs`, idle-main-lane's): spec 13 rests on land and the wording pin.

## 8. Slices

Width 4; longest stem 5

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 Two features each adding an ADR land without a stop | 1, 2, 3, 4 | `.gitattributes`, `scripts/merge-generated.mjs` (new), `scripts/sync.mjs`, `scripts/adr-index.mjs`, `scripts/test/merge-generated.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 A conflicting run record lands; a source conflict is named alone | 4 | `scripts/land.mjs` (`resume`), `scripts/test/land-generated.test.mjs` (new) | S1 (`resolveGenerated`), S3 (`scripts/land.mjs`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 A press lands a feature whose worktree is behind origin | 5, 11 | `scripts/land.mjs` (`catchUp`), `scripts/test/land-catchup.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 A landing removes its run's merged worktrees and names the rest | 7, 8, 9 | `scripts/worktrees.mjs`, `scripts/land.mjs` (last step), `scripts/test/worktrees.test.mjs`, `scripts/test/land-clear.test.mjs` (new) | S3 (`scripts/land.mjs`), S2 (`scripts/land.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 The landing's tests pass under the deck, and a red run names its tests and log | 6, 11 | `scripts/integrate.mjs` (`runTests`, `redLine`), `scripts/sync.mjs` (red line), `deck/landing.mjs`, `deck/test/landing-parity.test.mjs` (new), `scripts/test/red-line.test.mjs` (new), `deck/test/run.test.mjs` | S1 (`scripts/sync.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 No test names a fixed port | 10 | `deck/testUtils.mjs`, the ten `deck/test/*` files holding 4399 (listed in S6), `scripts/test/handoff.test.mjs` | S5 (`deck/test/run.test.mjs`) | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 `test:quiet` ends with one count line | 11 | `package.json`, `scripts/quiet-reporter.mjs` (new), `scripts/test/quiet-reporter.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 A refused landing shows on the ticket's row | 12 | `deck/store-runs.mjs` (`noteLanding`), `deck/landing.mjs` (settle), `deck/test/landing-row.test.mjs` (new) | S5 (`deck/landing.mjs`) | `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 The landing readies the feature PR | 13 | `scripts/land.mjs` (`ready`), `scripts/test/land-ready.test.mjs` (new) | S4 (`scripts/land.mjs`), S8 (`noteLanding`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S9](slices/S9.md) |
| S10 The pilot's close waits for a ready PR | 7, 13 | `agents/pilot.md` (step 9, close, line 600), `scripts/test/pilot-agents.test.mjs` | S9 (`pr ready failed` line) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S10](slices/S10.md) |
| S11 The inbox test survives a loaded machine | 14 | `hooks/test/inbox.test.js`, the module the cause is in (named in the PR) | – | `pilot:typescript-reviewer` | [S11](slices/S11.md) |

`scripts/land.mjs` is edited by S3, S2, S4, S9 in that order; `deck/landing.mjs` by S5 then
S8. S6 also waits for idle-main-lane to land (`wait.test.mjs`, `handoff.test.mjs`), S10 for
bigger-jobs (`agents/pilot.md`); a co-pilot holds them until then. Walking skeleton: S1, the
index conflict through the real `mergeIntoPilot` in a scratch repository. The ADRs 0129
(L1-L4) and 0130 (L5, L6) are written on `design/clean-landing` with this artefact.

## 9. Acceptance evidence

1. The land of this feature from the deck's Sign off press prints `landed` with no stop, though idle-main-lane (0123) and bigger-jobs (0124-0127) added ADRs to pilot meanwhile; `--check` on pilot's tip is green (spec 1-4).
2. QA pushes its last fix from its own worktree before the press; the press lands it without a second gate2 (spec 5).
3. The landing's counts on the gate2 thread equal `npm test`'s in the worktree (spec 6); `npm run test:quiet` ends with one count line (spec 11).
4. A planted red test on a scratch deck: the gate2 thread and the ticket's feature row carry its name and the log path (spec 11, 12).
5. The landing's last lines: the PR readied and `removed <path>` for this run's worktrees; `git worktree list` shows none (spec 7, 9, 13); any kept one named with its state (spec 8).
6. `git grep 4399` finds no test use; the inbox test 10 of 10 under load (spec 10, 14).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3, 4 |
| S2 | planned | | | | S1, S3 | 4 |
| S3 | planned | | | | – | 5, 11 |
| S4 | planned | | | | S3, S2 | 7, 8, 9 |
| S5 | planned | | | | S1 | 6, 11 |
| S6 | planned | | | | S5 | 10 |
| S7 | planned | | | | – | 11 |
| S8 | planned | | | | S5 | 12 |
| S9 | planned | | | | S4, S8 | 13 |
| S10 | planned | | | | S9 | 7, 13 |
| S11 | planned | | | | – | 14 |
| clean-landing | planned | feat/clean-landing | | | S1-S11 | 1-14 |
