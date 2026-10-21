# gate-no-stall: a signed gate never stalls on a permission prompt

Ticket `itm_0ade3839d64b` · thread `itm_382611c39dc4` · cut from `origin/pilot` at 81888160 (main@ee5c1ec)

## 1. Problem

After a signed Gate 2 on 2026-10-12 the pilot ran `gh pr ready 576`. Auto mode's classifier denied
it as an "unrequested commit in a connected app", three denials in a row put a terminal prompt up
that the deck cannot show, and the run froze for 3 minutes until the user found it by hand. The
user: "this never happens ... how do we systematically stop the freeze up from happening again?"
They want it stopped by mechanism, not a retry: the landing does the ready press, the pilot's
lane never meets the classifier on a landing call, and a call the classifier does block shows on
the deck as a blocking item. The same day two feature PRs (#576 and an earlier one) reached
Gate 2 with two merge bases against `main`: a feature PR is checked mergeable before its gate2.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | After a signed `gate2`, the landing (`pilot land`, which the deck runs on Sign off) marks the feature PR ready and its line says which: `ready: #576`, `ready: none (...)` or `pr ready failed: ...`; a failed ready becomes a `blocking` question on the ticket naming the PR, and `agents/pilot.md` step 9 never tells the pilot to run `gh pr ready`. | `land` test with an injected `gh` prints each line; a landing test whose land prints `pr ready failed` posts the blocking item; a wording pin: step 9 holds no `gh pr ready`. |
| 2 | The install allowlists `Bash(pilot landing *)` beside `pilot sync`, `pilot integrate` and `pilot land` in `scripts/install-settings.mjs`. | The install-allow test names the rule; a user deny or ask on it leaves it out, as for the others. |
| 3 | A call by a pilot lane (the pilot session, or any `pilot:` crew agent) that auto mode denies, in a directory with a live run, becomes one `blocking` question on the live ticket within that hook turn, naming the command and the denial reason; the same command denied again posts no second item. | A hook test with a fake `PermissionDenied` payload and a fake deck: one post, title and body naming the command and `reason`; a second identical payload posts nothing. |
| 4 | While a run is live, a permission prompt in the pilot's own session (including auto mode's fallback after 3 blocks in a row) is refused by the hook with the blocked-step message and posted as in 3, so it never waits in the terminal. | A hook test: pilot payload + live run → deny + one post; no live run, or a non-pilot session → no output. A scratch run with a planted denial ends its turn with the item posted and no prompt in the transcript. |
| 5 | A `gate2` is refused while its `sha` does not hold `origin/<default>`'s tip, the refusal naming `pilot integrate --default`; that command merges the default branch into `feat/<slug>`, resolves a prompt-pin conflict in `scripts/test/measure-prompt.test.mjs` by measuring, runs the gate, pushes, and prints `mergeable: MERGEABLE at <sha>` from `gh pr view --json mergeable`, the sha the gate2 then names. | A deck test refusing a gate2 on a sha behind a scratch `main` and accepting it after; an integrate test on a scratch repo whose `main` changed the pin: the merge commit exists, the pin reads the measured value, an injected `gh` answers MERGEABLE. |
| 6 (added) | A blocked item says why the call was not run: auto mode denied it, or the pilot's hook refused its permission prompt; and the deck's gate checks (`holdsDefault`, `holds`, `pilotLineage`) never run a `git` planted in the repository directory. | Hook tests: a refused prompt's item does not say auto mode denied it, a denial's item does; a Windows test with a planted `git.exe` where the gate check still answers. |
| 7 (added) | On Windows, no `git` the deck daemon or the `pilot` CLI spawns resolves to one planted in the repository directory: each entry sets `NoDefaultCurrentDirectoryInExePath=1` and keeps only PATH's absolute entries. | Pins that spawn `bin/pilot.mjs` and `deck/daemon.mjs` from a parent with the flag unset and `.` on PATH, in a repo with a planted `git.exe`/`git.com`, and still get the real git's answer; a unit test of the PATH filter. |

Agreed by the user on 2026-10-13 (itm_d702e5d33f60, Yes). Spec 5 moved from `pilot landing` to
before the gate2 (A2); A3 and A5 stand as assumed in §6. Spec 6 and 7 were added during the run
(S7, S8), from the reviews of S1, S2 and S5.

## 3. Findings

- **The ready press already exists, unreleased.** `scripts/land.mjs:283` `ready()` readies the
  open draft PR head `feat/<slug>` → default branch (clean-landing S9, f5e8d50b, on `main` since
  ee5c1ec). The installed plugin is 0.8.3, which lacks it: its `agents/pilot.md:485` told the
  pilot to run `gh pr ready <pr>` itself on `landed`. That is the incident's cause. The repo's
  `agents/pilot.md:489` still keeps `gh pr ready` as the retry for a `pr ready failed` line.
- **A silent ready.** `ready()` answers `[]` when no PR matches and `main()` prints nothing for
  it (`scripts/land.mjs:318-326`); a ready that did nothing reads the same as one that worked.
- **Gate2 timeline, #576.** Landing settled 09:19:57Z (`landed ... merge first: none`); GitHub's
  `ready_for_review` event is 09:25:44Z by the pilot's own `gh`, after the denials.
- **Hooks.** `hooks/permission-refuse.js` answers `PermissionRequest` with deny for crew agents
  only (`agent_id` + `pilot:` type); the main session's prompts are left to the user. No hook
  handles `PermissionDenied`. Hooks reach the deck over HTTP only, `hooks/lib/deck.js:23-204`
  (1.5 s per request, fail silent); `deck.post` is `POST /api/tool deck_post`; live runs are
  `deck.runs()` + `isOnDeck` (`hooks/lib/deck.js:370`); the live ticket is `GET /api/tickets?repo=`
  `.live` (`deck/server-routes.mjs:620`), with no hook helper yet.
- **Claude Code.** `PermissionDenied` fires on every auto-mode denial with `tool_name`,
  `tool_input`, `tool_use_id`, `reason`; its only output is `retry`. Auto mode falls back to
  prompting after 3 blocks in a row or 20 in a session, not configurable
  (code.claude.com/docs/en/permission-modes, "Repeated-block thresholds"). `PermissionRequest`
  runs "when Claude Code is about to ask you"; whether it runs for that fallback prompt is not
  stated, so S2's scratch run is the probe.
- **Blocking items.** A `question` with `blocking: true` needs `ticket` and `recommended`
  (`deck/store-core.mjs:427-447`) and holds the ticket's gate2 (`refuseOverOpenQuestions`,
  `deck/store-core.mjs:469`). The deck has no process call in its post path; `deck/tickets.mjs:113`
  and `deck/wait.mjs:113` run `git` through `execFileSync` with an injected runner.
- **Merge bases.** A feature that landed on pilot before its gate2 takes no base in
  `pilot integrate` (`scripts/integrate.mjs:12`), so `feat/<slug>` never takes `main` after its
  cut; `merge-generated.mjs` resolves only the ADR index and `run.json`. The pilot pin's comment
  block (`scripts/test/measure-prompt.test.mjs:104-150`) is edited by every feature that touches
  `agents/pilot.md`, so two features always conflict there.
- **Collisions.** `feat/pilot-fork` rewrites `scripts/land.mjs` `main()`/`land()` (+91),
  `scripts/integrate.mjs` (+80), `agents/pilot.md` (+8), `bin/pilot.mjs`. `feat/process-gc` S4 adds
  gc lines to `scripts/land.mjs`, S5 renames `PILOT_MERGE_ALLOW` to `PILOT_ALLOW` in
  `scripts/install-settings.mjs`, S12 edits `deck/landing.mjs`. `itm_c310da07c9c6` spec 5-6 holds
  the crew lane's blocked-step rule and the same allow list.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `hooks/lib/blocked.js` (new) | `postBlocked({ repo, command, reason, agent, session }, { deck, claims })` → `Promise<string \| null>` | finding the live run and live ticket, the claim against a repeat, the item's shape, the post | Remote but owned: the deck behind `hooks/lib/deck.js`, a fake deck in tests |
| `hooks/permission-denied.js` (new) | `onDenied(payload, deps)` → `Promise<null>` | who is a pilot lane, the command's text from `tool_input` | In-process, over S1's `postBlocked` |
| `hooks/permission-refuse.js` | `decide(payload, deps)` → `Promise<HookOutput \| null>` (was sync `refuse`) | crew refusal as today, the pilot session's refusal in a live run | In-process, over `postBlocked` |
| `scripts/land.mjs` | `ready({ gh, head, base })` → `number[]`; `readyLine(readied, readyFailed)` → `string` | the PR filter, the line | True external: `gh` injected |
| `deck/landing.mjs` | `startLanding(gate2Id, deps)` (unchanged); settles a `pr ready failed` line into a blocking question | the post | In-process: the store |
| `deck/gate2-base.mjs` (new) | `holdsDefault(repo, sha, { git })` → `{ ok: true } \| { ok: false, tip, branch }` | default-branch name, ancestor test | Local-substitutable: a scratch git repo |
| `scripts/integrate.mjs` | `integrate({ ..., base: 'default' })` → `{ tip, mergeable }` | fetch, merge, generated and pin resolution, gate, push, mergeable poll | True external: `gh`; git on a scratch repo |
| `scripts/merge-generated.mjs` | `mergeResolved(dir, ref, message, { side, measurePins })` | the pin rule beside the ADR index and `run.json` | Local-substitutable |
| `scripts/install-settings.mjs` | `PILOT_MERGE_ALLOW` (a list) | – | In-process |

Deletion test: `permission-refuse.js` and `permission-denied.js` each stay thin, and the
complexity (live run, live ticket, repeat claim, item shape) would reappear in both, so it goes
behind one new `postBlocked`. Nothing existing is shallow enough to fold: no fold slice.

## 4. Ubiquitous language

- **Pilot lane**: the pilot session (no `agent_id`, `agent_type` `pilot:pilot` or `pilot`) or a
  crew agent (`agent_id`, `agent_type` starting `pilot:`).
- **Blocked step**: a call that was not run because auto mode denied it or the hook refused its
  prompt; it is posted, never retried, never routed around.
- **Blocked item**: the `blocking` question a blocked step becomes, on the live ticket.
- **Live run**: a run record for the project directory whose pid is alive (`deck.runs()`).
- **The ready press**: `gh pr ready` on the feature's draft PR against the default branch, done
  only by `pilot land`.
- **Holds the default branch**: `origin/<default>`'s tip is an ancestor of the gate2's `sha`.

## 5. Locked decisions

- **L1 One `PermissionDenied` hook posts the blocked item.** It is the only signal Claude Code
  gives within the hook turn. Rejected: the Stop hook scanning the transcript (a turn late).
- **L2 The post lives in `hooks/lib/blocked.js`.** Two hooks post the same item. Rejected: a
  copy in each hook.
- **L3 A repeat is claimed by a file** under `os.tmpdir()/pilot-blocked/`, keyed by a hash of
  session id and command, as `context-usage-alert.js` claims its alerts. Rejected: asking the
  deck for open items first (a second 1.5 s request inside a 5 s hook).
- **L4 The item.** `question`, `blocking: true`, `ticket` the live ticket, options `I ran it` /
  `Skip it`, recommended `Skip it`, title `Blocked: <command, first 80 chars>`, body the command
  (at most 600 chars), the reason, the agent. No live ticket: posted without `ticket` and not
  blocking. No live run, or a deck that does not answer: nothing posted, the hook silent, as
  every deck hook fails open.
- **L5 The pilot's refusal goes through `permission-refuse.js`**, which becomes async to ask
  for live runs. Rejected: counting denials to refuse only the fallback prompt (the payload does
  not say a prompt is a fallback).
- **L6 `pilot land` stays the only ready press.** It prints a `ready:` line every landing; a
  `pr ready failed` landing posts a blocked item from `deck/landing.mjs` on settle. Rejected: the
  pilot retrying `gh pr ready` (the incident).
- **L7 The gate2 check is local git in the tool layer.** `deck/server-tools.mjs` calls
  `holdsDefault` before a gate2 `postItem`; no `gh`, no network in the daemon's post path.
- **L8 `pilot integrate --default` is the fixer**, beside the base-taking it already does, so the
  existing allow rule covers it and no new command is learnt. Rejected: doing it in
  `pilot landing` (it runs after the Sign off, so the user would have signed another sha).
- **L9 Crew denials post too.** The same hook covers every `pilot:` lane (the pilot session, a
  co-pilot, an implementer), which delivers part of `itm_c310da07c9c6` spec 5 by mechanism.
  Rejected: the pilot session only, leaving crews to that ticket. Locked 2026-10-13
  (itm_20d641f5649b, Crew too).
- **L10 Every prompt in the pilot session is refused while a run is live**, the user's own `ask`
  rules included; each reaches the deck as a blocked item. Cost: an `ask` rule cannot be answered
  in the terminal mid-run. Rejected: refusing only after a recorded denial in the session (state
  across hooks). Locked 2026-10-13 (itm_893d097a258c, Every prompt).
- **L11 Grilling depth: forks.** Only decisions whose paths produce materially different
  deliverables were asked (L9, L10); the rest stand as assumed; no Gate 1 walk. Locked 2026-10-13
  (itm_42f3b846a301, forks).

## 6. Assumed decisions

- **A1** locked as L10 (itm_893d097a258c).
- **A2 Spec 5's merge runs before the gate2, not in `pilot landing`**, so the gate2 names the sha
  the user signs. Cost: one more command at step 9.
- **A3 A pin conflict resolves to the measured value**, even when it rises, with a dated comment
  line naming the merge; the gate still runs. Alternative: stop and hand it to the pilot.
- **A4** locked as L9 (itm_20d641f5649b).
- **A5 The gate2 check reads `origin/<default>` as fetched**; `pilot integrate --default` and
  `pilot sync` fetch. Cost: a stale ref passes. Alternative: fetch in the post path (network in
  the daemon).

## 7. Out of scope

- Shipping a release so the installed plugin carries clean-landing S9 (`bump.mjs`, the user's).
- `pilot sync`'s own pin conflicts merging `main` into `pilot`.
- The yellow lane idling, scratch-deck allow rules, blocking walkthroughs (`itm_c310da07c9c6`).
- Any `retry: true` from `PermissionDenied`: a denied call stays denied.

## 8. Slices

Width 4; longest stem 2

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 A denied pilot call becomes a blocked item | 3 | `hooks/lib/blocked.js` (new), `hooks/permission-denied.js` (new), `hooks/hooks.json`, `hooks/lib/deck.js`, `hooks/test/permission-denied.test.js` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 The pilot's prompt in a live run goes to the deck | 4 | `hooks/permission-refuse.js`, `hooks/test/permission-refuse.test.js` | S1 (`postBlocked`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 The landing says what it readied | 1 | `scripts/land.mjs` (`readyLine`), `deck/landing.mjs`, `agents/pilot.md` (step 9), `scripts/test/measure-prompt.test.mjs` (pilot pin), `scripts/test/land-ready.test.mjs` (new), `deck/test/landing-ready.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 The install allows `pilot landing` | 2 | `scripts/install-settings.mjs`, `scripts/test/install-allow-landing.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 A gate2 behind the default branch is refused | 5 | `deck/gate2-base.mjs` (new), `deck/server-tools.mjs`, `deck/test/gate2-base.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 `pilot integrate --default` takes the default branch | 5 | `scripts/integrate.mjs`, `scripts/merge-generated.mjs`, `bin/pilot.mjs` (usage), `agents/pilot.md` (step 9), `scripts/test/measure-prompt.test.mjs` (pilot pin), `scripts/test/integrate-default.test.mjs` (new) | S3 (`agents/pilot.md`, the pilot pin), S5 (the refusal names the command) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 A blocked item says why, and the gate checks run the real git (added) | 6 | `hooks/lib/blocked.js`, `hooks/permission-denied.js`, `hooks/permission-refuse.js`, `hooks/hooks.json`, `scripts/pilot-branch.mjs`, `deck/gate2-base.mjs`, their tests | S2, S5 | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S7](slices/S7.md) |
| S8 No pilot process runs a git from the repository directory (added) | 7 | `bin/pilot.mjs`, `deck/daemon.mjs`, `scripts/pilot-branch.mjs`, `deck/gate2-base.mjs`, `deck/test/gate2-base.test.mjs` | S6, S7 | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |

The walking skeleton is S1: one real `PermissionDenied` payload through a real hook process to a
scratch deck, ending as a blocking item on its live ticket. Width 4 is {S2, S3, S4, S5}.
Outside this run: S3 and S6 rebase on `feat/pilot-fork` (`scripts/land.mjs`,
`scripts/integrate.mjs`, `agents/pilot.md`) and S4 on `feat/process-gc` S5
(`PILOT_MERGE_ALLOW`), whichever lands first; S6 is cut after pilot-fork lands on `pilot`.

## 9. Acceptance evidence

1. On a scratch deck with a live run, a planted `PermissionDenied` for `gh pr ready 1` posts one
   blocking item on the live ticket naming the command and the reason (spec 3).
2. A scratch pilot session with a planted denial ends its turn with that item up and no prompt
   in its transcript (spec 4).
3. A scratch `pilot land` prints `ready: #<n>`; one whose `gh` refuses prints `pr ready failed`
   and the deck shows a blocked item on the ticket (spec 1). `agents/pilot.md` has no `gh pr ready`.
4. A fresh install's settings carry `Bash(pilot landing *)` (spec 2).
5. A gate2 on a sha behind scratch `main` is refused naming `pilot integrate --default`; after
   the command prints `mergeable: MERGEABLE at <sha>`, the gate2 on that sha posts (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3 |
| S2 | planned | | | | S1 | 4 |
| S3 | planned | | | | – | 1 |
| S4 | planned | | | | – | 2 |
| S5 | planned | | | | – | 5 |
| S6 | planned | | | | S3, S5 | 5 |
| S7 (added) | integrated at f00d5eb2 | `slice/gate-no-stall-s7` | #626 | | S2, S5 | 6 |
| S8 (added) | integrated at 62c48e51 | `slice/gate-no-stall-s8` | #628 | | S6, S7 | 7 |
| gate-no-stall | planned | `feat/gate-no-stall` | | | S1-S8 | 1-7 |
