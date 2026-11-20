# Pilot's CI is green again

Ticket `itm_a0d1cc86d06d` · slug `ci-green` · base `origin/pilot` 35868866 · express, depth "No grilling" (itm_71aebce2652f)

## 1. Problem

The Gate workflow on `pilot` has been red since 7919a824 (07:40 UTC 2026-11-19; last green d2358d9, 04:12), one test
per job, and every open PR inherits it. Two PRs landed on the red base because the landing runs only the local suite,
which passes on this Windows machine.

## 2. Spec

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | The Gate workflow passes on ubuntu, macos and windows. | The feature PR's Gate run, then the run on the landed sha. | 3 of 3 jobs `success` |
| 2 | `deck/test/idle-wake.test.mjs` "a parked wait wakes" passes everywhere, at any wall-clock time; the test was wrong (§3). | The three job logs; locally the file run whole after 10:20 UTC. | `fail 0` in 3 jobs; a pin red before the fix on this machine |
| 3 | "sed -i on a tracked file is refused" passes on CI's windows; the guard was wrong (§3). | The windows job log; a `writeTargets` pin on a `RUNNER~1` path. | windows job `fail 0`; 1 pin red before, green after, on all 3 OS |
| 4 | Why local passed and CI failed is stated per test. | §3's table. | 2 rows, each with its probe |
| 5 | Every open feature branch takes the green pilot by merge. | Each open PR's next Gate run (#126, #125, #124, #122, #119, #83). | each run free of these two tests |

Spec 5 is the pilot's standing step after a landing, delivered by no slice (A1). `practitioner: test-reliability
engineer` — a real-clock test must not read a clock another test mocked; spec 2's pin asserts the wake came from the
test's own note, not the deck's. `practitioner: shell-parser author` — bash expands `~` only at a word's start;
spec 3's pin is a mid-word `~`.

## 3. Findings

### Diagnosis

| Test | OS | First bad | Cause | Test or code | Confidence |
|---|---|---|---|---|---|
| idle-wake.test.mjs:118 "a parked wait wakes" (`waiterCount() 0 !== 1` at :128) | ubuntu, macos; windows on CI sometimes (#122's second fail; run 44507390851) | no commit: the wall clock. Green until 10:15 UTC, red from 10:37 with no code change (crew-refusals 37df7442 green 09:33 → 5fef2abe red 11:58, a `run.json`-only diff; handoff-cache 3f869d9f green 10:15 → 73e4f818 red 10:37) | `quietDeck` (:41) calls `forgetAgents()` with `Date` mocked, so `deck/agents.mjs:356` sets `startedAt` to START (2026-11-19T10:00Z). Test 5 runs on the real clock but never resets it, so `crewSeenAt` (:217) reads START. Past START + 20 min the held ticket is idle at once: the deck's own `armIdle` notes it within ~50 ms of the park and the wait returns before the 5 ms poll (:127) sees `waiterCount() === 1` | test | high |
| shell-write-guard.test.js:37 "sed -i on a tracked file is refused" (`null !== 'deny'`, the `sed --in-place <abs>` form) | windows CI only | dd086ba2 / bef208d2 (audit-f12 S1), on pilot at 7919a824 | the runner's `os.tmpdir()` is the 8.3 path `C:/Users/RUNNER~1/…`. `tokens()` (`hooks/shell-write-guard.js:102`) marks any word holding `~` non-literal, so `writeTargets` drops the target and the guard fails open. Bash expands `~` only at a word's start | code: a fail-open on every 8.3 path | high |

### Why local passed (spec 4)

| Test | Local | CI | Cause | Probe |
|---|---|---|---|---|
| a parked wait wakes | pass (174-264 ms) | fail (2.0-2.6 s, the poll exhausted) | a race: here the poll sees the park before the deck's idle note lands; on CI the note wins | file run whole with `said` printed: "yellow lane idle" and the deck's own `Idle` REPLY 53 ms after the park; run alone (`startedAt` real) neither |
| sed -i on a tracked file is refused | pass | fail | this machine's TEMP holds no `~`; the runner's does | `writeTargets("sed -i 's/a/b/' C:/Users/RUNNER~1/x/f.md")` → `[]`; the same path without `~` → 1 target |

### What the fix leans on

- `deck/test/idle-wake.test.mjs`: `forgetAgents` is imported (:16); tests 1-4 reset it under mocked timers (:41-46).
- `deck/agents.mjs:197` `startedAt`, `:217` `crewSeenAt`, `:350-359` `forgetAgents` (test-only, resets `startedAt = Date.now()`).
- `hooks/shell-write-guard.js:48-110` `tokens`, `:185` `writeTargets` (exported, `:261`); a non-literal target is skipped (`:197`), the fail-open direction.
- Gate on a PR to `pilot` runs all three OS, drafts included (`.github/workflows/gate.yml`, `github.base_ref == 'pilot'`).

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `writeTargets` | `writeTargets(command, cwd): {path, form}[]` | `tokens`' literal rule; nothing new folded | in-process |
| `wait` + `waiterCount` | `wait({...}): Promise<number>`, `waiterCount(): number` | unchanged; the test's agent roster is reset at its start | local-substitutable (in-process deck on a free port) |

Deletion test: neither module is shallow; no fold is cut.

## 4. Ubiquitous language

- **Leaked clock**: a module-level moment stamped while `Date` was mocked and read by a later real-clock test.
- **Auto-note**: the deck's own `noteIdle`, fired by `armIdle`, as opposed to the test's call at :130.
- **8.3 path**: a Windows short name such as `RUNNER~1`, literal to bash.
- **Fail open**: the guard returns null (allows) when it cannot judge.

## 5. Locked decisions

- **L1** Fix idle-wake in the test, not `agents.mjs`: test 5 calls `forgetAgents()` on the real clock at its start, with
  `t.after(forgetAgents)`, and asserts its output holds no "yellow lane idle" line before its own note. The daemon is
  right: an unseen crew 20 min past start is idle. Rejected: START relative to now (hides the leak, keeps the race);
  `forgetAgents` taking a clock (code change for a test-only path).
- **L2** Fix the guard, not the test: `~` makes a word non-literal only as its first character. Rejected: realpath the
  test repo (green CI, guard still fails open on every short-name path); treating `~` after `=`/`:` as expansion too
  (no writer target takes that form; non-literal is the fail-open side, so narrower is safer).
- **L3** No ADR: two local corrections, neither hard to reverse.
- **L4** One slice (A2), one Gate run on the feature PR as evidence for both fixes.

## 6. Assumed decisions

- **A1** Spec 5 is the pilot's step after landing, not slice code. Default: pilot merges `pilot` into each open branch.
  Tradeoff: no slice proves it; the open PRs' runs do. Rejected: a slice that merges others' branches.
  Verdict: stands — taking pilot by merge into each open branch is already the pilot's standing step after a landing
- **A2** One slice, not two. Tradeoff: one reviewer pass spans a deck test and a hook. Rejected: two parallel slices
  (two branches, the same single CI proof).
  Verdict: stands — about 15 lines on two unrelated files; one slice and one Gate run is the express path the user asked for
- **A3** QA environment is the Gate workflow on the feature PR, three OS jobs. Rejected: local only (cannot show linux/macos).
  Verdict: stands — the Gate workflow on the feature PR is the only place the Linux and macOS jobs run

red team: S1's first behaviour walked against `idle-wake.test.mjs`: the pin "no idle refusal before the note" is red
today only after 10:20 UTC; before that the leak is invisible, so the pin also asserts `crewSeenAt(REPO)` is within
the test's own run, which is red at any hour (S1 behaviour 1). The guard pin walked against `tokens`: a word built from a
quoted prefix (`''~/x`) is `''` not null, so it stays literal, matching bash. No seam is half-built by two slices.

## 7. Out of scope

- Landing refusing on red checks, and `pilot base` naming a red base: ticket itm_e5e0bc09827d, queued after this one.
- Other mocked-clock leaks in the suite; the 400 × 5 ms poll in test 5.

## 8. Slices

Width 1; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the Gate is green on all three OS | 1, 2, 3, 4 | `deck/test/idle-wake.test.mjs`, `hooks/shell-write-guard.js`, `hooks/test/shell-write-guard.test.js` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |

Spec 5: the pilot, after landing (A1).

## 9. Acceptance evidence

1. The feature PR's Gate run: ubuntu, macos, windows each `success`, `fail 0` (spec 1, 2, 3).
2. Locally, after 10:20 UTC: `node --test deck/test/idle-wake.test.mjs` passes, and the S1 pin failed before the fix (spec 2).
3. `node --test hooks/test/shell-write-guard.test.js` passes with the `RUNNER~1` pin, red before (spec 3).
4. §3's two tables read against the run (spec 4).
5. After landing, each open PR's next Gate run is free of both tests (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | slice/ci-green-s1 | – | – | – | 1, 2, 3, 4 |
| feature | planned | feat/ci-green | – | – | S1 | 1-5 |
