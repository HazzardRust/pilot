# handoff-mod: the hand-off runs from a mod, not a typed terminal

Ticket itm_97c9e8fdf1d2 · base `feat/handoff-mod` from `origin/pilot` (b38de846 at the L11 re-cut; first cut at c863b15a) · ADR NNNN.

## 1. Problem

> alright the terminal wrapper we have at the moment has become redundant because of the recently added claude
> mods. i think they are in beta but can you look into them and see what can get replaced?

`pilot run` wraps Claude Code in a pseudo-terminal (`node-pty`, an optional native dependency) so it can type
`/clear` and the fresh session's first prompt when the pilot hands off. It learns a turn ended by polling a stamp
the Stop gate writes, and that the prompt was taken by polling a stamp PostToolUse writes. Claude Code 2.1.325,
installed here, runs mods ("hooks modules"): code a plugin ships that runs inside the session, hears its events,
and can run a command and submit a prompt itself. A mod that clears and then submits with nobody at the keyboard
makes the typing, the pty and both stamp polls redundant. The user chose (L11) that it does so in every pilot
session, so the automatic cycle no longer needs `pilot run`.

## 2. Spec

Bars are counts a user can check. The spec stands at A5's default (Agree); lines 2, 4, 7 and 8 were re-cut for
L11 and accepted by main as following from it; line 4's chain clause is A7, line 2's 0-clears bar rests on A6, line 8's minimum is A2.

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | Spike first: a mod shipped in the plugin clears the session's context and then submits the first prompt, with nobody at the keyboard and no pty; if it cannot, the run stops here and the wrapper stays. The submit follows the clear in the same `turn.complete` handler: no event after `/clear` is needed (`session.start` does not refire after it). | An interactive `claude --agent pilot:pilot` started plainly (no pty) with `--debug-file`: the log holds `$.command.run (pilot)` then `$.prompt.submit (pilot): "Pick up the hand-off on the deck."`, and the transcript shows the fresh context's first turn; 3 of 3 runs. `claude plugin validate` passes on the plugin root. *practitioner: Claude Code plugin author* |
| 2 | In every main pilot session, started plainly or by `pilot run`, the mod, not typed keystrokes, clears and submits "Pick up the hand-off on the deck." with the optional lander line at a hand-off. Only the session that posted the hand-off is cleared (A6). | 5 of 5 live hand-offs start the fresh session's first turn, at least 2 in a plain `claude --agent pilot:pilot` and 2 under `pilot run`; no paste, Enter retype or 60 s tool check runs; each has `mod: cleared <id>` and `mod: submitted <id>` in `~/.claude/pilot/wrapper.log`. A second, non-pilot `claude` open in the same repository meanwhile is cleared 0 times. *practitioner: the session's debug log as the raw record* |
| 3 | The mod knows the turn ended from `turn.complete` of the main session, not the Stop gate's stamp file. | No `turn-ended` or `tool-ran` stamp is written or read in `hooks/` or `deck/` (grep: 0 hits); a test drives the clear from a fake `turn.complete`. |
| 4 | The deck watch runs from the mod in every pilot session: the newest open hand-off picked, the clear held while a co-pilot is live, re-armed by a press, forced at 20 min; chain at start only in a session `pilot run` started (A7). A held hand-off is looked at again while the session is idle (at its bound, and every 30 s while held), never mid-turn. | 5 tests against a stub deck, one each: chain at start under `pilot run` and none without it, hold and re-arm, bound, newest picked, no look while a turn runs. |
| 5 | A hand-off is cleared once: the claim, the 5-minute cooldown and the forged-hand-off bound survive the move, re-proved against the look's claim. | Tests against the look: a second look and a forged hand-off inside the cooldown clear nothing (0 clears). |
| 6 | A hand-off that did not start is said aloud: a reply on the handoff item (or the chat) and a line in `wrapper.log`, once per hand-off id. Not started is: no lane marker after the clear, a submit Claude Code refused (after the user's Stop it refuses until the user types), or no `turn.start` within 60 s of the submit. The reply names which. | One test per cause ends with one deck reply and one log line naming it. |
| 7 | `pilot run`, now optional, is a thin launcher: it sets `--agent`, `--settings`, the added dir and the env, starts `claude` with inherited stdio, and holds no pty; `node-pty` leaves the dependencies. End on the deck still ends a session `pilot run` started (the launcher keeps its `/events?wrapper=` stream and kills its child on `end`); for a plain session End still answers 409 "no pilot run is live" (`deck/session.mjs:191`, unchanged). | `package.json` has no `node-pty` (`npm ls node-pty` finds 0); `deck/run-prompt.mjs` and the pty path are deleted; End kills the plain child exactly once. |
| 8 | A session where the mod cannot run is told so at the hand-off, never a silent hand-off that does not start: `pilot handoff`'s one line says the mod has not reported in for this session, with the cause when known (Claude Code older than the minimum), and tells the pilot to have the user type `/clear`. One check covers every cause (`--safe-mode`, `--bare`, `disableAllHooks`, an untrusted workspace, the rollout flag off), because `pilot handoff` is a Bash call the pilot makes with hooks and mods off. | Tests: a session with no reported-in stamp, and one on an old version, each get that line; a reported-in session gets the mod's line; `pilot doctor` has a `mods` row. Minimum 2.1.325 (A2). |

Cannot mean here: a pty fallback when mods are off (the session starts plainly, the hand-off line says so, the
user types `/clear`); a clear in a session that did not post the hand-off (A6); End from inside a plain session (L5).

## 3. Findings

**The spike (2026-11-16, Claude Code 2.1.325; the mods docs page 404s, so the evidence is the binary's own strings
and five headless `claude -p --plugin-dir` probes with a scratch plugin and `--debug-file`):**

| Claim | Result |
| --- | --- |
| How a plugin ships a mod | `hooks/hooks.json` `"modules": ["./<file>.mjs"]`, one per plugin; the module exports `register(on)`; handlers are `($, e, next)`. `claude plugin validate` passed the probe. `hooks/hooks.json` has no `modules` key today. |
| Clear from a mod | On `turn.complete`, `$.command.run({ command: 'clear' })` produced `conversation_reset: clear`; every `SessionStart:clear` hook, `hooks/session-handoff.js` among them, ran before the call resolved (2.2 s). |
| Submit after the clear | `$.prompt.submit({ text })` in the same handler started the fresh context's turn. Text starting with `/` is refused. |
| The mod across `/clear` | Same instance, module state kept; its `session.start` does not fire again. |
| What a mod may import and call | Relative imports and `claude-code` only (`node:fs` refused at load). `$.http.fetch` reached the deck; `$.env.get` read the env; `$.fs.write(path, text)` has no exclusive create; `$.process.run(['node', ...])` returned `{ exitCode, stdout, stderr }`, and a `wx` claim through it answered 0 then 1. |
| When mods do not load | `--safe-mode`, `--bare`, managed `disableAllHooks` or managed-hooks-only, an untrusted workspace, the rollout flag `tengu_plugin_hooks_modules` off (on here). |
| The Stop hold | After the user stops the session (Esc), Claude Code refuses a mod's `command.run` and `prompt.submit` ("the session was stopped and nobody has sent input since") until the user types. |
| Not proven by the probes | An interactive TTY session; whether `process.run` raises a permission prompt there; whether `turn.complete` fires on a turn the Stop gate blocks; whether the look, run by `process.run`, sees `CLAUDE_PID` (else `process.ppid`) equal to the Bash tool's `CLAUDE_PID`; whether `import.meta.url` is set in a mod. S1's live check proves all five. |

**The code the design leans on (re-anchored on b38de846):**

- `deck/run.mjs` (771 lines): `clearOnce` (292-383) is the look: `pickup` (235), the claim, the stamp wait,
  `holdFor` (256), `coPilotAt` (389), `sayHeld` (400), the marker wait, `firstPrompt` (92), `handPrompt` (imported
  72 from `deck/run-prompt.mjs:39`, called 378), `sayAloud` (428), `chainAtStart` (481). `watch` (536) is the change
  stream, chain at start, cooldown and End. `loadPty` (602) and `startUnderPty` (644) are the pty; 656 sets
  `PILOT_RUN_PID` and `PILOT_RUN_REPO`, the only setter.
- `deck/run-claim.mjs`: `laneMarked` (79, the lane's `handoff-<id>` claim), the `wx` claim `clear-typed-<id>`, and
  the stamp reads `stampAt` (85-91), `lastTurnEnded` (94), `lastToolRan` (97).
- `deck/run-prompt.mjs`: paste, settle, Enter, the 60 s tool check (ADR 0177).
- Stamp writers: `hooks/stop-gate.js:379`, `hooks/post-tool.js:111-116` (`stampToolRan`), `hooks/lib/deck.js`
  `markTurnEnded` (706), `markToolRan` (715), `stampRun` (720-726).
- `scripts/handoff.mjs`: `wrapperAlive` (57) reads `PILOT_RUN_PID`; 142-143 pick the repository as
  `typed && PILOT_RUN_REPO ? PILOT_RUN_REPO : cwd`, so a plain session today posts for a drifted worktree; 179-181
  is the line that says who types `/clear`. Tests: `scripts/test/handoff.test.mjs` (106, 192 set the wrapper env).
- The repository a session means: `listeningRepo(cwd)` (`deck/wait.mjs:136`, ADR 0091, the main checkout from
  `--git-common-dir`) behind `sessionRepo(env)` (`deck/wait.mjs:153`, `PILOT_RUN_REPO`, ADR 0104). The session's
  pid: `CLAUDE_PID` (`deck/leash.mjs:54`, process-gc L3), set in a Bash tool's env.
- Which session is the pilot: hooks learn it from `agent_type` (`hooks/post-tool.js:57`, `plainPickup` 67); the
  mod's events are not proven to carry it, hence A6.
- The deck side is unchanged: `/api/chain`, `/api/hold`, `/api/record`, `/api/runs`, `/events?wrapper=`
  (`deck/server-wait.mjs:596-602`, routed at `deck/server-routes.mjs:233`), `endSession` (`deck/session.mjs:189`).
- Tests: `deck/test/run.test.mjs` (88 tests, 1849 lines; pty start 1037-1230), `deck/test/run-prompt.test.mjs`,
  `hooks/test/tool-ran.test.js`; `deck/test/facades.test.mjs:40` pins `run.mjs`'s exports. The gate's `TEST_GLOB`
  (`scripts/select-tests.mjs:25`) picks up `hooks/test/*.test.mjs`. ADR 0180: no test pins prose; a test that
  greps code for an absence is a structural lint and carries `// lint: <rule>`.

**Files this plan shares with deck-writes-github (itm_5f1725c876a7)**, for main's ordering at the verdict pass:

| File | Here | There |
| --- | --- | --- |
| `deck/doctor.mjs` | S7: a `mods` row | S5: a `pilot allow rules` row in `checkAll` (326); separate hunks |
| `docs/adr/README.md` | S1: the index row for ADR NNNN | its ADR's index row; both number NNNN |

Read, not edited: `scripts/integrate.mjs` (`commitRecords`, imported by `scripts/handoff.mjs`), `deck/tools.mjs`
(`deckUrl`), `agents/pilot.md:593` (L10).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The look, `deck/run-look.mjs` | `look(op, args, deps)`; CLI `node deck/run-look.mjs <op> [--repo <dir>] [...]` printing one JSON `Outcome` | the decision half of `clearOnce`, `pickup`, `holdFor`, the claim, the cooldown, `firstPrompt`, `sayHeld`, `sayAloud`, chain at start, the session pid, the repository, the posted and reported-in stamps | local-substitutable (stub deck on a free port, scratch home) |
| The mod, `hooks/handoff-mod.mjs` | `register(on)`; reads no env; finds the look from `import.meta.url` | event wiring, busy and idle, hold timers, `$.command.run`, `$.prompt.submit`, the started check | true external (Claude Code host): a fake `on` and `$` in tests |
| The hand-off call, `scripts/handoff.mjs` | `handoff({ cwd, env, trailers })` -> `{ ok, line }` | the repository, the posted stamp, the reported-in check and its line | local-substitutable (stub deck, scratch worktree) |
| The launcher, `deck/run.mjs` | `run({ plain, say, cwd })`, `claudeArgs`, `runEnv` | the plain spawn, the End stream | local-substitutable |
| The doctor row, `deck/doctor.mjs` | `modsRow({ version, settings, env })` | the version and settings checks | in-process |

Deletion test: `run-prompt.mjs` and the pty path vanish with nothing reappearing (typing pass-throughs); the stamps
vanish because `turn.complete` is the event they approximated; the look survives (deleted, its logic would reappear
in the mod, untested), so it moves behind a CLI rather than going. `PILOT_PLUGIN_ROOT` is not added: only
`pilot run` could set it, and L11 needs the mod to find the look without `pilot run`.

## 4. Ubiquitous language

- **Hand-off**: an open `handoff` item for this repository; the newest one is the only candidate.
- **Look**: one decision over the deck for one repository, answering an `Outcome`; it never waits.
- **Outcome**: `{ act: 'none' | 'held' | 'clear' | 'submit' | 'said', id?, prompt?, until?, why? }`.
- **Session pid**: the Claude Code process a look or `pilot handoff` runs under: `CLAUDE_PID`, else the look's
  `process.ppid`.
- **Posted**: `claims/posted-<session pid>.stamp`, the hand-off id `pilot handoff` posted from that session; the
  only session a look clears (A6).
- **Clear**: the mod's `$.command.run({ command: 'clear' })` for one hand-off, under its claim.
- **Reported in**: `claims/mod-<session pid>.stamp`, written by the look's `start` op; `pilot handoff` reads it.

## 5. Locked decisions

- **L1 The mod is a thin adapter; the look stays in Node** behind a CLI the mod runs with `$.process.run`. The
  look's tests keep their stub deck and scratch home, and the mod holds no deck, claim or file code. Rejected: the
  look rewritten against `$.http.fetch` and `$.fs` inside the mod (no exclusive create; every test rewritten
  against a fake host).
- **L2 The claim stays the `wx` file** `clear-typed-<id>`, taken by the look in `node`, so the pty wrapper and the
  mod can never both clear while both exist mid-run. Rejected: a deck-side claim route (a new write on a port
  that trusts any loopback caller).
- **L3 The submit follows the clear in one `turn.complete` handler**, after a `cleared` look confirms the lane's
  marker (proven: the lane runs before `command.run` resolves). Rejected: waiting for an event after `/clear`.
- **L4 The mod acts on the main session only** (no `agentId`) and never mid-turn: `turn.start` marks it busy,
  `turn.complete` idle; a timer look while busy waits for the next `turn.complete`.
- **L5 The launcher keeps the End stream** and kills its plain child on `end`; `/events?wrapper=`, `tab.wrapped`
  and the co-pilot release at start are unchanged. Rejected: End in the mod (no host call found that ends a session).
- **L6 The cooldown lives in the look** as a stamp per repository written on a clear, so a restarted session
  keeps it. Rejected: mod memory only (lost on restart).
- **L7 No pty fallback.** Mods off is a plain start and the hand-off line of spec 8.
- **L8 Grilling depth "forks"** (itm_f6ffe52105fa): only decisions whose paths produce materially different
  deliverables go to the user; the rest stand assumed with their defaults.
- **L9 One place knows a hand-off was taken**: the look's `cleared` op, which logs `mod: cleared <id>` once under
  the claim. itm_b561a9d42212's per-repository count and its friction step attach there; this run builds neither.
- **L10 Wording that names the typing stays** in `agents/pilot.md:593` and `hooks/context-size-guard.js:591`
  ("types `/clear`"): true in effect, and the prompt pins have no headroom. `scripts/handoff.mjs:179-181` is
  reworded by S7 through L11, because a plain session's line would be false. Rejected: rewording the prompt files
  the queued tickets also edit.
- **L11** (A1 overturned, itm_092acdb3e41f) The mod acts in every main session of the pilot agent while the plugin
  is enabled; `pilot run` is optional for hand-offs. Disabling the plugin, `--safe-mode` or disabled hooks is how
  the user gets a plain session. Both the look and `pilot handoff` name the repository as
  `sessionRepo(env) ?? listeningRepo(cwd)`, the existing pattern (ADR 0091, 0104). Rejected: only under `pilot run`.

## 6. Assumed decisions

- **A1 The mod acts only under `pilot run`** (`PILOT_RUN_REPO` set). Posted itm_092acdb3e41f.
  Verdict: overturned: the user chose every pilot session (itm_092acdb3e41f, 2026-11-16): "i prefer the every pilot session"; the plugin is the switch, disabling it gives a plain session.
  overridden: with every pilot session, a pilot session the user started by hand and is watching clears and restarts itself when the pilot runs its hand-off; `pilot run` no longer marks the sessions that may be cleared.
  Replaced by L11. Re-cut done (b38de846): S1's gate is A6's posted stamp, spec 2, 4, 7, 8 reworded, the
  repository from L11's resolver, S7 moved from the launcher to `pilot handoff`.
- **A2 The minimum Claude Code is 2.1.325**, the version proven, not the draft's 2.1.287. Tradeoff: users on
  2.1.287-2.1.324 get the line and type `/clear`. Rejected path: 2.1.287, unproven. Sent to `main` (moves spec 8).
  Verdict: stands
- **A3 One deletion slice over the 400-line limit** (S5, about 1300 lines removed): no added lines outside import
  fix-ups, every deleted test file named with the behaviour that no longer exists. Tradeoff: one long diff.
  Rejected path: four deletion slices that buy no review. Main's to rule.
  Verdict: stands
- **A4 Security defaults** (not posted at depth forks; `pilot:security-reviewer` on S1-S4, S6, S7): (a)
  `$.process.run` gets a fixed argv built from the mod's own `import.meta.url`, never text from a deck item; ids
  pass the `itm_[0-9a-f]+` shape check before they reach an argv; (b) the submitted prompt is the fixed literal plus
  the lander line, its id shape-checked as today; (c) the mod makes no `$.http.fetch` at all: every deck call is the
  look's, to `deckUrl()` on 127.0.0.1 with the bearer; (d) spec 5's forged-hand-off bound is re-proved by tests
  against the look's claim and cooldown, not carried over. Tradeoff: one node process per main turn end in every
  pilot session. Rejected path: deck calls from the mod's own fetch.
  Verdict: stands
- **A5 The spec and the QA environment** stand at main's defaults (Agree; this machine, 2.1.325, interactive
  `pilot run` against a scratch deck, 5 live hand-offs, plus the local gate) until the user answers.
  Verdict: stands
  QA environment answered by the user on itm_8b0364a9084f, 2026-11-16: "This machine, scratch deck, 5 live hand-offs". Locked as posted.
- **A6 Only the session that posted the hand-off is cleared.** `pilot handoff` writes
  `claims/posted-<session pid>.stamp` with the id it posted; a look clears only when its own session pid holds that
  stamp and the id is still the newest open hand-off; `cleared` deletes it. Only the pilot calls `pilot handoff`,
  so this is how "the pilot agent's main session" is known without the host naming the agent. Tradeoff: a
  hand-off whose poster died (crash, closed terminal) is cleared by nobody; the next session started picks it up
  at SessionStart as today, so nothing is lost but the clear, which a fresh session does not need. Rejected path:
  every main session whose mod event names agent `pilot:pilot` clears on any open hand-off (unproven payload, and a
  second pilot session in the repository would clear too).
- **A7 Chain at start only under `pilot run`** (`PILOT_RUN_REPO` set): the look's `start` op always writes the
  reported-in stamp and asks `/api/chain` only in a session `pilot run` started. Tradeoff: a plain pilot session
  does not start the head ticket by itself; the user asks it to. Rejected path: every pilot session chains at start
  (starts a ticket the user did not ask for in a session they opened by hand; chaining was asked of `pilot run`,
  run-chaining A5).

## 7. Out of scope

- The books at the hand-off (itm_b561a9d42212): the friction step, the hand-off count, the audit cadence.
- Splitting `hooks/context-size-guard.js` (itm_df2038a49471).
- A deck-side claim, End from inside the session, any change to the deck's routes.
- Rewording the prompts and guard messages that say "types" (L10).
- `deck/wait.mjs`: its resolvers are reused as they are.

## 8. Slices

Width 2; longest stem 5 (S1 → S2 → S4 → S5 → S6).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a mod clears and submits for a hand-off | 1 | `hooks/handoff-mod.mjs` (new), `hooks/hooks.json`, `hooks/test/handoff-mod.test.mjs` (new), `deck/run-look.mjs` (new), `deck/test/run-look.test.mjs` (new), `deck/run.mjs`, `deck/test/facades.test.mjs`, `scripts/handoff.mjs`, `scripts/test/handoff.test.mjs`, `docs/adr/NNNN-handoff-mod.md` (new), `docs/adr/README.md` | – | ts, security | [S1](slices/S1.md) |
| S2 | The look carries the whole watch | 4, 5, 6 | `deck/run-look.mjs`, `deck/test/run-look.test.mjs`, `deck/run.mjs`, `deck/test/facades.test.mjs` | S1 (`deck/run-look.mjs`) | ts, security | [S2](slices/S2.md) |
| S3 | The mod hears the session | 3, 4, 6 | `hooks/handoff-mod.mjs`, `hooks/test/handoff-mod.test.mjs` | S1 (`hooks/handoff-mod.mjs`) | ts, security | [S3](slices/S3.md) |
| S4 | `pilot run` starts claude plainly | 2, 7 | `deck/run.mjs`, `deck/test/run.test.mjs`, `deck/test/facades.test.mjs`, `package.json`, `package-lock.json`, `deck/README.md` | S2 (`deck/run.mjs`), S3 (the whole mod) | ts, security | [S4](slices/S4.md) |
| S5 | The typing code is deleted | 7 | `deck/run.mjs`, `deck/run-prompt.mjs` (deleted), `deck/test/run-prompt.test.mjs` (deleted), `deck/test/run.test.mjs`, `deck/test/facades.test.mjs` | S4 (`deck/run.mjs`) | ts | [S5](slices/S5.md) |
| S6 | The turn stamps are gone | 3 | `hooks/stop-gate.js`, `hooks/post-tool.js`, `hooks/lib/deck.js`, `deck/run-claim.mjs`, `hooks/test/tool-ran.test.js` (deleted), `hooks/test/inbox.test.js` | S5 (`deck/run-claim.mjs` readers) | ts, security | [S6](slices/S6.md) |
| S7 | A session where the mod cannot run is told at the hand-off | 8 | `scripts/handoff.mjs`, `scripts/test/handoff.test.mjs`, `deck/doctor.mjs`, `deck/test/doctor-mods.test.mjs` (new) | S1 (`scripts/handoff.mjs`), S2 (the reported-in stamp) | ts, security | [S7](slices/S7.md) |

Red team (assumed the cut failed, walked each first red step against the files):

- red team: S1's look needs `pickup`, which `deck/run.mjs` does not export (235) → S1 owns `deck/run.mjs` and
  `facades.test.mjs` for that export; S2 comes after it on both.
- red team: S2 and S3 each half-build "not started" (S3 detects, S2 says it aloud) → the `unstarted` op and its
  `Outcome` are fixed in S1's Interface, so the two run side by side on a written contract.
- red team: under L11 the mod cannot find `deck/run-look.mjs` through `PILOT_PLUGIN_ROOT` (only `pilot run` would
  set it) → the mod resolves the look from `import.meta.url`; S1 drops `deck/run-env.mjs`, and its live check
  proves `import.meta.url` is set or stops the run.
- red team: S1's first red step in a plain session finds no hand-off it may clear, because only `pilot handoff`
  writes the posted stamp (A6) → S1 owns `scripts/handoff.mjs` for the stamp and the repository; S7 comes after S1
  on that file.
- red team: the look's session pid and `pilot handoff`'s could differ (`CLAUDE_PID` unproven in a `process.run`
  child) → the look falls back to `process.ppid`; S1's live check records both against the Bash tool's
  `CLAUDE_PID`, and a mismatch stops the run at S1.
- red team: the pilot's shell drifted into a worktree when it calls `pilot handoff`, so the posted item names the
  worktree while the look names the checkout → both use L11's resolver; S1 tests a hand-off from a worktree.
- red team: S4 removing the pty before S3's timers exist would leave held hand-offs with nobody looking → S4
  after S3.
- red team: S6 deleting `lastTurnEnded` while `clearOnce` still reads it → S6 after S5.
- red team: S7's line reads a stamp S2's `start` writes → S7 after S2, the stamp name in S1's Interface.

## 9. Acceptance evidence

Surface: a CLI and an interactive Claude Code session in a terminal. Every command step runs in Git Bash on this
machine, in the repository's main checkout unless it names another directory.

1. `claude plugin validate .` in the plugin root passes, listing the module (spec 1).
2. A plain `claude --agent pilot:pilot`, with a hand-off posted on a scratch deck, clears and starts its fresh
   turn with nobody typing; the debug log shows the two calls (spec 1).
3. Five hand-offs, at least two plain and two under `pilot run`: each `mod: cleared` and `mod: submitted` in
   `wrapper.log`, each fresh session at work; a second plain `claude` in the repository is never cleared (spec 2, 3).
4. A held hand-off under a live co-pilot stays held, clears on release, and clears at 20 min (spec 4).
5. A second hand-off inside 5 minutes clears nothing (spec 5).
6. Esc pressed before a hand-off: the reply on the hand-off names the Stop hold (spec 6).
7. End on the deck ends a `pilot run` session; `npm ls node-pty` finds nothing (spec 7).
8. `claude --safe-mode --agent pilot:pilot`, then a hand-off: `pilot handoff`'s line says the mod has not reported
   in and to type `/clear`; `pilot doctor` shows the `mods` row (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 4, 5, 6 |
| S3 | planned | | | | S1 | 3, 4, 6 |
| S4 | planned | | | | S2, S3 | 2, 7 |
| S5 | planned | | | | S4 | 7 |
| S6 | planned | | | | S5 | 3 |
| S7 | planned | | | | S1, S2 | 8 |
| handoff-mod | planned | `feat/handoff-mod` | | | S1-S7 | 1-8 |
