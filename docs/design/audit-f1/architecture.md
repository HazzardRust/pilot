# audit-f1: the audit and a session start read the run's pilot, not a stale HEAD

Ticket `itm_f997a8938bd4`, audit row F1 (`~/.claude/pilot/audits/c_users_hazzard_projects_pilot-01e1a5f943/2026-10-20T21-42-00-000Z.json`).
Base `origin/pilot` at 6ea49cac. No ADR: no structural decision outlives this run (§5).

## 1. Problem

The audit and any session started in a stale checkout read old code: the audit cut its scratch worktree from the
checkout's HEAD, so its dead-export rows were stale, and an agent started there acts on old code without being told.
The ticket's "2259 behind" predates the fresh public repository; today the shared checkout sits on `main` at 18a5d2f0,
97 behind `origin/pilot` (6ea49cac), and `origin/pilot` holds 98 commits in all.

## 2. Spec

1. (agreed, itm_1a700931ecce) The auditor's scratch worktree is cut from `origin/pilot` when it exists, else HEAD.
   Evidence: a test over a fixture whose `origin/pilot` is 3 ahead of HEAD shows the cut at origin/pilot's tip; with
   no pilot ref, a bad `pilot.remote` or a git failure, the cut is HEAD and nothing throws; this repo's next audit
   worktree is at pilot's tip. Bar: 3 fixture cases, 3 exact `<ref> <sha>` lines; 1 real cut.
2. (agreed, itm_1a700931ecce) A session start in a checkout whose HEAD is more than 100 commits behind `origin/pilot`
   prints one warning line naming the count, to the user (`systemMessage`) and the agent (`additionalContext`).
   Evidence: hook test: 101 behind prints the line; 100 and 99 print nothing; no `origin/pilot`, not a repository and
   a bad `pilot.remote` print nothing; every case exits 0, makes no network call and needs no deck. Bar: 6 cases,
   exactly one line in one of them, each under the hook's 5 s timeout.
3. (locked, A1 answered "In", itm_6e5127455ca5; practitioner: an auditor states the revision audited) The audit report carries `base: "<ref> <sha>"`, and the deck audit
   item's "measured in" line ends `at origin/pilot <sha>`. Evidence: an audit-body test renders it; a report without
   `base` renders as today. Bar: 2 cases.
4. *assumed* (A2; practitioner: an auditor measures the latest published revision) The auditor's cut fetches first: `pilot-tip.mjs --fetch` runs `git fetch <remote> pilot` when the
   tracking ref already exists (never in local mode), then answers the fetched tip; a failed fetch answers the local
   tracking ref. Evidence: a fixture whose bare remote's `pilot` is 2 ahead of the tracking ref prints the remote's
   sha; an unreachable remote prints the old tracking sha, exit 0. Bar: 2 cases.

## 3. Findings

Anchors re-checked on 6ea49cac.

- `agents/pilot-auditor.md:19` cuts `git worktree add --detach <scratchpad>/audit-<stamp> HEAD`; its Never (:31-38)
  forbids a branch or push, so `pilot base` (which can create and push `pilot`, `scripts/pilot-branch.mjs:122`
  `ensurePilotBranch`) cannot be the cut. Report shape at `:170`.
- `scripts/test/audit-agent.test.mjs:43` pins the literal `HEAD` cut: S1 changes that pin.
- `scripts/remotes.mjs:19` `runRemote(git)` is "the only reader of `pilot.remote`" (:15): origin, a name, or null for
  `none`, throwing on a bad value; `runRef` (:35) and `shortRef` (:37) give the ref.
- `hooks/hooks.json` SessionStart has 4 entries: `context-usage-alert`, `statusline-repair`, `rules-repair`,
  `session-handoff`. `statusline-repair` runs `scripts/install-settings.mjs --repair` directly: the precedent for a
  script as a hook. No test counts SessionStart entries.
- `hooks/session-handoff.js` `run()` returns null when the deck read fails (:466-477), so a warning inside it would
  vanish with no deck.
- `hooks/context-usage-alert.js:192-203` is the payload shape: `systemMessage` plus
  `hookSpecificOutput { hookEventName: 'SessionStart', additionalContext }`.
- `deck/audit.mjs:89` `validateReport` checks named keys and ignores others; `renderReport` (:182) writes
  "measured in the scratch worktree …" at `:195`, and its `deckBody` is the posted item (:318).
- `skills/audit/SKILL.md:19` snapshots `git branch -a` before and after: why A2 fetches only an existing tracking ref.
- Real git fixtures with a bare remote: `deck/test/gate1-lineage.test.mjs`.
- Open PRs #3-#8, #28, #36, #37: none touches an owned file. No `pilot` subcommand is added.
- **History depth**: `git rev-list --count origin/pilot` is 98. No checkout of this repository can be over 100
  behind today, so the live check of spec 2 runs in a fixture repository (§9), and the shared checkout (97 behind)
  correctly stays silent.
- **Queue overlap, itm_97c9e8fdf1d2** (hand-off into a mod): it rewrites `hooks/session-handoff.js`, `deck/run*.mjs`
  and likely drops `start:any:session-handoff` from `hooks/hooks.json`. Spec 2 lands in the new `scripts/pilot-tip.mjs`
  and one new `hooks.json` entry, placed second (after `context-usage-alert`), not next to the entry that ticket
  removes. Shared file: `hooks/hooks.json` only; no file it rewrites. Not merged.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/pilot-tip.mjs` (new) | `pilotTip({ cwd, fetch })`, `staleNotice(tip)`, `BEHIND_BAR`, CLI `[--fetch \| --session-start]` | resolving the run's pilot ref (via `runRemote`, `runRef`, `shortRef`), its sha, `rev-list --count HEAD..ref`, every failure as null | local-substitutable (real git in a temp repo) |
| `scripts/remotes.mjs` | `runRemote`, `runRef`, `shortRef` (unchanged) | `pilot.remote` parsing | in-process, kept as is |
| `deck/audit.mjs` | `renderReport(report)` renders `report.base` when present | the "measured in" line | in-process |

Deletion test: deleting `pilot-tip.mjs` puts ref resolution and the behind count into a prompt and a hook twice;
it earns its keep. `remotes.mjs` survives as is. No fold slice: nothing shallow exists today on this path.

## 4. Ubiquitous language

- **pilot tip**: the run's pilot ref as it resolves locally (`<remote>/pilot`, or `pilot` in local mode) and its sha.
- **behind**: `git rev-list --count HEAD..<pilot tip>`, commits on the pilot tip HEAD lacks.
- **stale checkout**: behind more than `BEHIND_BAR` (100).
- **base** (of an audit): `"<ref> <sha>"` the scratch worktree was cut at; `HEAD <sha>` on fallback.

## 5. Locked decisions

- L1 One seam, `scripts/pilot-tip.mjs`, serves the auditor's CLI and the hook. Rejected: a shell one-liner in the
  prompt plus a CJS copy in the hook (two readers of `pilot.remote`, against `remotes.mjs:15`).
- L2 A standalone SessionStart entry `start:any:stale-checkout`, second in the list, running
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/pilot-tip.mjs" --session-start`, timeout 5. Rejected: a clause in
  `session-handoff.js` (silent without a deck; itm_97c9e8fdf1d2 rewrites it).
- L3 No fetch at session start. Tradeoff: an old remote-tracking ref undercounts. Rejected: fetching on every start
  (network, the 5 s timeout, offline sessions).
- L4 `BEHIND_BAR = 100`, strictly greater, a constant. Rejected: a config key (no ask for one).
- L5 Every SessionStart source (startup, resume, clear, compact) gets the check. Rejected: startup only (a `/clear`
  in a stale checkout is the same hazard).
- L6 The CLI never creates a branch or pushes; it fetches only under `--fetch`, which only the auditor passes.
  Rejected: `pilot base` (it can create and push `pilot`).
- L7 (A1, answered "In") the report's `base` and the item's `at <base>`, in S1.
- L8 (depth "forks", itm_083d5a8044c2; practitioner: pilot-fork's run remote) the pilot tip is the run's pilot ref
  through the existing `runRemote` seam: `pilot.remote=<name>` reads `<name>/pilot`, `none` reads local `pilot`, unset
  reads `origin/pilot`. A design consequence of `remotes.mjs:15`, not a deliverable of its own; S1 test 2 pins it.
  Rejected: hard-coding `origin/pilot` (a second reader of the remote, wrong on a fork).
- L9 (QA environment, itm_717295b1c9c4; see A3) the local gate plus one real session start in a stale checkout and one real
  `pilot audit` scratch cut read for its base. No deck, no migrations.

## 6. Assumed decisions

- A2 Spec 4 (from `main`, 2026-10-21): the audit cut fetches the pilot ref first, falling back to the tracking ref
  offline; spec 2's hook stays no-fetch (L3). Default: in, in S1. Tradeoff: one network call per audit and one more
  `.git` write (the tracking ref), which the auditor's Never gains as allowed. Rejected: no fetch, cutting from the
  tracking ref as is: an audit of a stale tracking ref is the bug this ticket fixes.
  Fetch only when the tracking ref already exists, so `skills/audit/SKILL.md:19`'s `git branch -a` snapshot holds.
  Deck down: sent to `main` to post.
  Verdict: stands
- A3 (alters the QA environment picked on itm_717295b1c9c4) The live session start runs in a fixture repo 101 behind
  with the plugin loaded, since no checkout of this repo can be more than 100 behind today (98 commits on pilot).
  The warning will therefore never fire in this repository until pilot grows past 100 commits ahead of a checkout.
  Default: the fixture (§9 item 3), the rest of L9 unchanged. Tradeoff: the live line is seen on a synthetic history,
  not this repo's. Rejected: lowering the bar to fire here (moves agreed spec 2). Deck down: sent to `main` to post.
  Verdict: stands

## 7. Out of scope

- Fetching, switching or moving the shared checkout; any auto-fix of a stale checkout.
- The installed plugin version versus branch code (friction row listener-worktree): a different surface.
- Warning on being ahead of, or diverged from, pilot.
- The hand-off hook and its move to a mod (itm_97c9e8fdf1d2).

## 8. Slices

Width 1; longest stem 2 (S1 → S2).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the audit cuts from the pilot tip and records it | 1, 3, 4 | `scripts/pilot-tip.mjs` (new), `scripts/test/pilot-tip.test.mjs` (new), `agents/pilot-auditor.md`, `scripts/test/audit-agent.test.mjs`, `deck/audit.mjs`, `deck/test/audit-body.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | A session start in a stale checkout warns once | 2 | `scripts/pilot-tip.mjs`, `hooks/hooks.json`, `hooks/test/stale-checkout.test.js` (new) | S1 (scripts/pilot-tip.mjs) | ts, security | [S2](slices/S2.md) |

Red team, walked against 6ea49cac: (1) S1's prompt edit breaks `audit-agent.test.mjs:43`'s literal `HEAD` pin: the
file is S1's and its red step rewrites the pin. (2) `runRemote` throws on a bad `pilot.remote`: a hook crash at
session start; spec 2's bad-remote case and S1 test 3 make `pilotTip` answer null. (3) S2 and S1 both write
`pilot-tip.mjs`; side by side they half-build the seam, hence `after: S1`. (4) A hook test cannot expand
`${CLAUDE_PLUGIN_ROOT}`: S2 spawns the script by absolute path and pins the hooks.json command separately. (5) A
fetch that creates a tracking ref adds a `git branch -a` line and fails the audit's before/after check: `--fetch`
fetches only an existing ref (A2). (6) red team: the old §9 live check ("this stale checkout, 2259 behind") cannot
happen on today's 98-commit history; §9 now uses a fixture repo 101 behind (A3). (7) `hooks.json` conflict with
itm_97c9e8fdf1d2: the entry goes second, away from `session-handoff`.

## 9. Acceptance evidence

1. `node scripts/pilot-tip.mjs --fetch` in the shared checkout prints `origin/pilot <sha>` equal to
   `git rev-parse origin/pilot`.
2. One real audit scratch cut with the new prompt's command: `git -C <scratch> rev-parse HEAD` equals origin/pilot's
   sha; the audit item reads `measured in the scratch worktree … at origin/pilot <sha>`.
3. (A3) A fixture repository whose `origin/pilot` is 101 ahead of HEAD (a bare remote, 101 empty commits), plugin loaded:
   start a Claude Code session there: one line, `This checkout is 101 commits behind origin/pilot …`, in the
   transcript and the agent's context.
4. A session start in the shared checkout (97 behind) and in a worktree at `origin/pilot`: no line.
5. `npm test` once on Windows; `node scripts/gate.mjs` five times green on a fresh WSL clone at the feature tip.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 3, 4 |
| S2 | planned | | | | S1 | 2 |
| audit-f1 | planned | feat/audit-f1 | | | S1, S2 | 1-4 |
