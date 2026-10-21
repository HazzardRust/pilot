# audit-f1: the audit and a session start read the run's pilot, not a stale HEAD

Ticket `itm_f997a8938bd4`, audit row F1 (`~/.claude/pilot/audits/c_users_hazzard_projects_pilot-01e1a5f943/2026-10-20T21-42-00-000Z.json`).
Base `origin/pilot` at 9dab4167. No ADR: no structural decision outlives this run (§5).

## 1. Problem

The shared checkout sits on `fix/claude-workflow-tools` at 8c90d170, 2259 commits behind `origin/pilot`. The
housekeeping audit cuts its scratch worktree from that HEAD, so it measured stale code (17 dead-export rows already
fixed on pilot), and any session started there acts on old code without being told.

## 2. Spec

1. The auditor's scratch worktree is cut from the run's pilot ref when it resolves locally, else HEAD. Evidence:
   `pilotTip` over a fixture whose `origin/pilot` is 3 commits ahead of HEAD answers origin/pilot's sha; the CLI
   prints `origin/pilot <sha>`; with no pilot ref it prints `HEAD <sha>`; the auditor prompt's cut uses the CLI's sha.
   Bar: 3 fixture cases, 3 exact outputs.
2. A session start in a checkout whose HEAD is more than 100 commits behind the run's pilot ref prints one warning
   line naming the count and the ref, to the user (`systemMessage`) and the agent (`additionalContext`). Evidence: hook
   test: 101 behind prints the line, 100 and 99 print nothing, no pilot ref prints nothing. Bar: 4 cases, exactly one line.
3. *assumed* (A1; practitioner: an auditor states the revision audited) The audit report carries
   `base: "<ref> <sha>"`, and the deck's audit item shows it on its "measured in" line. Evidence: an audit-body test
   renders `at origin/pilot <sha>`; a report without `base` renders as today. Bar: 2 cases.
4. The hook never fetches and needs no deck: it counts against the local remote-tracking ref, and a deck that is down
   changes nothing. Evidence: the hook test runs with no deck and no network remote; the source has no `fetch`. Bar:
   0 network calls, under the hook's 5 s timeout.
5. A bad `pilot.remote`, a directory that is not a repository, or a git failure is silent in the hook and falls back
   to `HEAD` in the CLI; the hook exits 0 every time. Evidence: hook and CLI tests over those three fixtures. Bar: 3
   cases, exit 0 each.
6. Run remote honoured (practitioner: pilot-fork's run remote): `pilot.remote=<name>` reads `<name>/pilot`,
   `pilot.remote=none` reads local `pilot`. Evidence: `pilotTip` over both fixtures names that ref. Bar: 2 cases.
7. *assumed* (A2, main) The auditor's cut fetches first: `pilot-tip.mjs --fetch` runs `git fetch <remote> pilot`
   when the tracking ref already exists (never in local mode), then answers the fetched tip; a failed fetch (offline)
   answers the local tracking ref. Evidence: fixture whose bare remote's `pilot` is 2 ahead of the tracking ref
   prints the remote's sha; an unreachable remote prints the old tracking sha, exit 0. Bar: 2 cases.

## 3. Findings

- `agents/pilot-auditor.md:19` cuts `git worktree add --detach <scratchpad>/audit-<stamp> HEAD`; its Never (:31-38)
  forbids a branch or push, so `pilot base` (which can create and push `pilot`, `scripts/pilot-branch.mjs`
  `ensurePilotBranch`) cannot be the cut. Report shape at `:170`.
- `scripts/test/audit-agent.test.mjs:43` pins the literal `HEAD` cut: S1 changes that pin.
- `scripts/remotes.mjs:19` `runRemote(git)` is the only reader of `pilot.remote` (origin / name / null for `none`,
  throws on a bad value); `runRef(runs, branch)` and `shortRef(ref)` give the ref.
- `hooks/hooks.json` SessionStart has 4 entries; `start:any:statusline-repair` already runs a `scripts/*.mjs`
  directly, the precedent for a script as a hook. No test counts SessionStart entries.
- `hooks/session-handoff.js` `run()` returns null when the deck read fails (:470-475), so a warning inside it would
  vanish with no deck; it is also the busiest hook file.
- `hooks/context-usage-alert.js:190-203` is the payload shape: `systemMessage` plus
  `hookSpecificOutput { hookEventName: 'SessionStart', additionalContext }`.
- `deck/audit.mjs:89` `validateReport` ignores unknown keys; `:195` renders "measured in the scratch worktree …".
- Real git fixtures with a bare remote: `deck/test/gate1-lineage.test.mjs`.
- Open PRs #906 #954 #981 #951 #955 #982: none touches `hooks/hooks.json`, `agents/pilot-auditor.md`,
  `scripts/test/audit-agent.test.mjs`, `scripts/remotes.mjs` or `deck/audit.mjs`. No `pilot` subcommand is added, so
  `operating-commands.test.mjs` NON_MOVING is untouched.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/pilot-tip.mjs` (new) | `pilotTip({ cwd })`, `staleNotice(tip)`, `BEHIND_BAR`, CLI `[--session-start]` | resolving the run's pilot ref (via `runRemote`, `runRef`), its sha, `rev-list --count HEAD..ref`, every failure as null | local-substitutable (real git in a temp repo) |
| `scripts/remotes.mjs` | `runRemote`, `runRef`, `shortRef` (unchanged) | `pilot.remote` parsing | in-process, kept as is |
| `deck/audit.mjs` `renderReport` | renders `report.base` when present | the "measured in" line | in-process |

Deletion test: deleting `pilot-tip.mjs` puts ref resolution and the behind count into a prompt and a hook twice;
it earns its keep. `remotes.mjs` survives as is. No fold slice: nothing shallow exists today on this path.

## 4. Ubiquitous language

- **pilot tip**: the run's pilot ref as it resolves locally (`<remote>/pilot`, or `pilot` in local mode) and its sha.
- **behind**: `git rev-list --count HEAD..<pilot tip>`, commits on the pilot tip HEAD lacks.
- **stale checkout**: behind more than `BEHIND_BAR` (100).
- **base** (of an audit): `"<ref> <sha>"` the scratch worktree was cut at; `HEAD <sha>` on fallback.

## 5. Locked decisions

- L1 One seam, `scripts/pilot-tip.mjs`, serves the auditor's CLI and the hook. Rejected: a shell one-liner in the
  prompt plus a CJS copy in the hook (two readers of `pilot.remote`, against `remotes.mjs:14`'s "only reader").
- L2 A standalone SessionStart entry `start:any:stale-checkout` running `node "${CLAUDE_PLUGIN_ROOT}/scripts/pilot-tip.mjs" --session-start`.
  Rejected: a clause in `session-handoff.js` (silent without a deck; the file is shared with open runs).
- L3 No fetch at session start. Tradeoff: an old remote-tracking ref undercounts. Rejected: fetching on every
  start (network, the 5 s timeout, offline sessions).
- L4 `BEHIND_BAR = 100`, strictly greater, a constant. Rejected: a config key (no ask for one).
- L5 Every SessionStart source (startup, resume, clear, compact) gets the check; it is cheap and the checkout does not
  move between them. Rejected: startup only (a `/clear` in a stale checkout is the same hazard).
- L6 The CLI never creates a branch or pushes; it fetches only under `--fetch` (spec 7), which only the auditor
  passes. The auditor's Never gains one allowed `.git` write, the fetched `pilot` tracking ref. Rejected: `pilot base`
  (it can create and push `pilot`).

## 6. Assumed decisions

- A1 Spec 3: the report records `base` and the deck item shows it. Default: in, in S1 (+3 lines). Tradeoff: a field
  and a render line beyond the ticket's two lines. Rejected: leave the base unrecorded, so a stale audit is again
  invisible in its own report. Posted on the ticket as itm_6e5127455ca5; answer recorded here.
- A2 Spec 7 (from `main`, 2026-10-21): the audit cut fetches the pilot ref first, falling back to the tracking ref
  offline. Default: in, in S1. Tradeoff: one network call per audit and one more `.git` write. Rejected: cut from
  the tracking ref as is, which can itself be stale. Fetch only when the tracking ref already exists, so the audit
  skill's `git branch -a` before/after snapshot (skills/audit/SKILL.md:17) stays identical.

## 7. Out of scope

- Fetching, switching or moving the shared checkout; any auto-fix of a stale checkout.
- The installed plugin version versus branch code (friction row listener-worktree): a different surface.
- Warning on being ahead of, or diverged from, pilot.

## 8. Slices

Width 1; longest stem 2 (S1 → S2).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the audit cuts from the pilot tip and records it | 1, 3, 5, 6, 7 | `scripts/pilot-tip.mjs` (new), `scripts/test/pilot-tip.test.mjs` (new), `agents/pilot-auditor.md`, `scripts/test/audit-agent.test.mjs`, `deck/audit.mjs`, `deck/test/audit-body.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | A session start in a stale checkout warns once | 2, 4, 5 | `scripts/pilot-tip.mjs`, `hooks/hooks.json`, `hooks/test/stale-checkout.test.js` (new) | S1 (scripts/pilot-tip.mjs) | ts, security | [S2](slices/S2.md) |

Red team: (1) S1's prompt edit breaks `audit-agent.test.mjs:43`'s literal `HEAD` pin: the file is in S1's owned
list and its first red step rewrites the pin. (2) `runRemote` throws on a bad `pilot.remote`: a hook crash at session
start; spec 5 and S1 test 3 make `pilotTip` answer null. (3) S2 and S1 both write `pilot-tip.mjs`; running them side by
side would half-build the seam, hence `after: S1`. (4) A hook test spawning `node` on Windows needs the plugin root
path, not `${CLAUDE_PLUGIN_ROOT}`: S2 spawns the script by absolute path and pins the hooks.json command separately.
(6) A fetch that creates a tracking ref adds a `git branch -a` line and fails the audit skill's
before/after comparison: `--fetch` fetches only an existing tracking ref (A2). (5) Local mode (`none`) with HEAD on `pilot` itself: behind 0, silent; covered by spec 6's fixture.

## 9. Acceptance evidence

1. In this stale checkout (8c90d170), start a Claude Code session: one line, `This checkout is 2259 commits behind
   origin/pilot …` (the count `git rev-list --count HEAD..origin/pilot` prints), in the transcript and the agent's context.
2. In a worktree cut from `origin/pilot`, start a session: no line.
3. `node scripts/pilot-tip.mjs --fetch` in this checkout prints `origin/pilot <sha>` matching `git rev-parse origin/pilot`.
4. One real audit scratch cut with the new prompt's command: `git -C <scratch> rev-parse HEAD` equals origin/pilot's sha;
   the posted audit item reads `measured in the scratch worktree … at origin/pilot <sha>`.
5. `npm test` once on Windows; `node scripts/gate.mjs` five times green on a fresh WSL clone at the feature tip.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 3, 5, 6, 7 |
| S2 | planned | | | | S1 | 2, 4, 5 |
| audit-f1 | planned | feat/audit-f1 | | | S1, S2 | 1-7 |
