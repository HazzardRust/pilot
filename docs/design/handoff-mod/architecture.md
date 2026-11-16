# handoff-mod: the hand-off runs from a mod, and `pilot run` is gone

Ticket itm_97c9e8fdf1d2 · base `feat/handoff-mod` from `origin/pilot` (bc75cc5b at the L15-L16 re-cut) · ADR NNNN.

## 1. Problem

> alright the terminal wrapper we have at the moment has become redundant because of the recently added claude
> mods. i think they are in beta but can you look into them and see what can get replaced?

> i dont want pilot run to even be a thing anymore. maybe we can just have the start of the session be normal, but
> as soon as it hits the handoff, it turns into auto. [...] just whatever gets it the basic autonomy of running
> endlessly without me needing to intervene. (itm_6cb636583c2c)

`pilot run` wraps Claude Code in a pseudo-terminal (`node-pty`) so it can type `/clear` and the fresh session's
first prompt at a hand-off, and polls stamps the Stop gate and PostToolUse write. Claude Code 2.1.325 runs mods:
plugin code inside the session that hears its events and can run a command and submit a prompt. A mod that clears
and submits makes the typing, the pty, the stamps and, by L12, the launcher itself redundant. A pilot session starts
plain; from its first hand-off on it runs itself, ticket after ticket, with nobody at the keyboard.

## 2. Spec

Bars are counts a user can check. The spec stands at A5's default (Agree); 2, 4, 7 were re-cut for L11 and again
for L12, 9-12 added for L12, 13 for L15 (main accepts re-cuts that follow from a lock); 11 rests on A9, 12 on A8
after L16's spike.

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | Spike first: a mod shipped in the plugin clears the session's context and then submits the first prompt, with nobody at the keyboard and no pty; if it cannot, the run stops here. The submit follows the clear in the same `turn.complete` handler (`session.start` does not refire after `/clear`). | A plain interactive `claude --agent pilot:pilot` with `--debug-file`: the log holds `$.command.run (pilot)` then `$.prompt.submit (pilot): "Pick up the hand-off on the deck."`, and the fresh context's first turn runs; 3 of 3. `claude plugin validate` passes. *practitioner: Claude Code plugin author* |
| 2 | In every main pilot session the mod, not typed keystrokes, clears and submits the prompt with the optional lander line at a hand-off. Only the session that posted the hand-off is cleared (A6). | 5 of 5 live hand-offs start the fresh turn in sessions started plainly, 2 of them by the deck's Start; each has `mod: cleared <id>` and `mod: submitted <id>` in `~/.claude/pilot/wrapper.log`. A second, non-pilot `claude` in the repository meanwhile is cleared 0 times. *practitioner: the debug log as the raw record* |
| 3 | The mod knows the turn ended from `turn.complete` of the main session, not a stamp file. | `turn-ended` and `tool-ran` stamps: 0 hits in `hooks/` and `deck/`; a test drives the clear from a fake `turn.complete`. |
| 4 | The mod watches the deck in every pilot session: the newest open hand-off, the clear held while a co-pilot is live, re-armed by a press, forced at 20 min. A held hand-off is looked at by the mod's own timer every 30 s and at its bound, only while idle. Nothing chains at start (L12). | 4 tests against a stub deck: hold and re-arm, bound, newest picked, no look mid-turn. |
| 5 | A hand-off is cleared once: the claim, the 5-minute cooldown and the forged-hand-off bound survive the move. | A second look and a forged hand-off inside the cooldown clear nothing (0 clears). |
| 6 | A hand-off that did not start is said aloud once per id: a reply on the handoff item (or the chat) and a `wrapper.log` line naming the cause: no lane marker, a refused submit (the Stop hold), or no `turn.start` within 60 s. | One test per cause: one deck reply, one log line. |
| 7 | `pilot run` is gone: no verb, no `deck/run.mjs`, no `deck/run-prompt.mjs`, no `node-pty`, and no user-facing text tells anyone to run it. | `pilot run` answers the unknown-command usage; `npm ls node-pty` finds 0; `grep -rw "pilot run"` outside `docs/` and `CHANGELOG*` finds 0 (the pattern does not match `pilot start`, which L15 keeps). |
| 8 | A session where the mod cannot run is told so at the hand-off: `pilot handoff`'s line says the mod has not reported in, with the cause when known, and to have the user type `/clear`. One check covers `--safe-mode`, `--bare`, `disableAllHooks`, an untrusted workspace and the rollout flag. | Tests: no reported-in stamp, and an old version, each get that line; a reported-in session gets the mod's; `pilot doctor` has a `mods` row. Minimum 2.1.325 (A2). |
| 9 | The run never stops for a person between tickets: a clean finish's chain hand-off is cleared by the mod of the session that finished, and the fresh context takes the next ticket. | Live: 3 tickets on a scratch deck run back to back from one plain start, 0 keystrokes after the first prompt; 3 `mod: cleared` lines naming chain hand-offs. *practitioner: an on-call engineer measuring hands-off time* |
| 10 | A pilot session's start chains nothing and releases this repository's co-pilot left by a dead session, once per session, never after a `/clear` (L13). | Tests: `/api/started` posts 0 hand-offs and releases the co-pilot; a held hand-off whose co-pilot was released at start clears at the next look, not at 20 min. |
| 11 | The deck's Start opens `claude --agent pilot:pilot` directly in a window, with the reach's plugin and rules arguments and no first prompt (A9). | `start-session.test.mjs`: the command line is the absolute `claude`, `--settings <file>`, `--add-dir <rules root>`, `--agent pilot:pilot`, 0 prompts and 0 `run` words; live: 1 press opens 1 pilot window, idle until the user types. |
| 12 | End is gone from the deck (A8, held after L16's spike): no End control, no `/end-session`, no `/events?wrapper=`; a tab no longer reads `wrapped`. | Tests: 2 routes answer 404; a live tab renders 0 End forms. |
| 13 | `pilot start` opens a pilot session in a new window, with the plugin on at any reach level, and exits: it holds no child, watches nothing, submits nothing, and no hand-off path reads anything it wrote (L15). | Tests: 1 detached spawn, exit 0 with the window's process not awaited; 0 reads of `start-settings.json` outside `deck/run-env.mjs` (lint). Live: `pilot start` in Git Bash returns in under 2 s and 1 pilot window opens. |

Cannot mean here: a pty fallback (L7); a clear in a session that did not post the hand-off (A6); End from inside a
session (A8, L16); a launcher process that stays up (L12; `pilot start` exits, L15).

## 3. Findings

**The spike (2026-11-16, Claude Code 2.1.325; the mods docs page 404s, so the evidence is the binary's own strings
and five headless `claude -p --plugin-dir` probes with a scratch plugin and `--debug-file`):**

| Claim | Result |
| --- | --- |
| How a plugin ships a mod | `hooks/hooks.json` `"modules": ["./<file>.mjs"]`; the module exports `register(on)`; handlers `($, e, next)`. `claude plugin validate` passed. |
| Clear from a mod | On `turn.complete`, `$.command.run({ command: 'clear' })` reset the conversation; every `SessionStart:clear` hook ran before it resolved (2.2 s). |
| Submit after the clear | `$.prompt.submit({ text })` in the same handler started the fresh turn. Text starting with `/` is refused. |
| The mod across `/clear` | Same instance, state kept; `session.start` does not fire again. |
| What a mod may import and call | Relative imports and `claude-code` only. `$.process.run(['node', ...])` returned `{ exitCode, stdout, stderr }`; a `wx` claim through it answered 0 then 1. `$.fs.write` has no exclusive create. |
| When mods do not load | `--safe-mode`, `--bare`, managed `disableAllHooks`, an untrusted workspace, the rollout flag off (on here). |
| The Stop hold | After Esc, `command.run` and `prompt.submit` are refused until the user types. |
| `--settings` | `claude --help`: "Path to a settings JSON file or a JSON string" (one probe, for A9). |
| End from a mod (L16, 2026-11-16, 2.1.325) | Headless, a stream-json session held open 60 s, scratch plugin `exitprobe`: on `turn.complete`, `$.command.run({ command: 'exit' })` rejected `exitprobe: $.command.run: no command named /exit in this session`; the session lived to its 60 s stdin close (elapsed 61 s). `$.command.list()` lists skills and plugin commands, not `/exit`. |
| The host's `$` surface | Strings in `claude.exe`: `$.command.{list,register,run}`, `$.process.{run,spawn}`, `$.session.{append,authorize,compact,identity,messages,send,start,surface,surfaces,turns,usage}`; no `end`, `exit` or `close`. `command.run` looks the name up in the session's command set and queues `/<name>` as a prompt, the way a typed command is. |
| End, interactive | Not run: a `cmd start` window in the scratch directory stopped at the trust dialog (`hooks modules not loaded until workspace trust is accepted`), and accepting it would write the user's trust settings. Whether an interactive session lists `/exit` for `command.run` is unproven. |
| Not proven | An interactive TTY session; a permission prompt on `process.run`; `turn.complete` on a Stop-gate-blocked turn; `CLAUDE_PID` (else `ppid`) in the look and in the deck client equal to the Bash tool's; `import.meta.url` in a mod; a mod timer firing while idle. S1's live check proves the first six, S3's the timer, S5's the client pid. |

**Each `pilot run` duty and where it goes (L12):**

| Duty | Today | Goes to |
| --- | --- | --- |
| Type `/clear` and the prompt | `deck/run.mjs` `clearOnce` 292-383, `deck/run-prompt.mjs` | the mod and the look (S1-S3) |
| Turn-end and tool stamps | `hooks/lib/deck.js:706-726`, `deck/run-claim.mjs:85-97` | dropped; `turn.complete` (S8) |
| Hold timer and change stream | `deck/run.mjs` `watch` 536, `/events?wrapper=` | the mod's timer, 30 s and the bound (S3) |
| Chain at start | `chainAtStart` 481 → `POST /api/chain` (`deck/server-routes.mjs:717`, `chainNext` atStart `deck/chain.mjs:77`) | dropped (L12); chain at a clean finish is unchanged (`deck/server-tools.mjs:383`) |
| Co-pilot release at start | `deck/chain.mjs:85` → `releaseCoPilot` (`deck/store-runs.mjs:390`) | the look's `start` op → `POST /api/started` (S4, L13) |
| End | `endSession` `deck/session.mjs:189`, wrapper streams 162-181, `deck/server-wait.mjs:590-612`, `/end-session` `deck/server-routes.mjs:386` | dropped (A8, S10): the L16 spike found no host call that ends a session |
| `tab.wrapped` | `listWrapped` → `deck/tabs.mjs:139` → End form `deck/ui/render-strip.mjs:393` | dropped with End (S10) |
| Status lines | `say('pilot run: ...')` `deck/run.mjs:591, 621, 717-768` | spawn failures: the daemon's stderr (`deck/session.mjs:149`); the rest: `wrapper.log` and spec 6's reply |
| Plugin, rules, env for the session | `claudeArgs`, `runEnv` `deck/run-env.mjs:61-76`; `PILOT_RUN_PID`/`REPO` `deck/run.mjs:656` | Start and `pilot start` pass them (S9, S12, A9, L15); the two env names go (S8) |
| Start's window | `startSession` runs `pilot run` (`deck/session.mjs:129`) | runs `claude` directly (S9); `pilot start` opens the same window and exits (S12) |

**Other findings:**

- Reach below `everything` turns the plugin off in user settings; only `pilot run`'s `--settings` turned it on
  (`scripts/reach.mjs:14-26`, `scripts/apply-reach.mjs:80`). Without it the deck's Start or `pilot start` is the
  way in (L15).
- A chain hand-off is posted by the daemon inside `deck_record` (`deck/server-tools.mjs:383`), not by `pilot
  handoff`, so A6's posted stamp never names it: the loop of spec 9 would stop at the first finish. → L14, S5.
- `scripts/install-command.mjs:174` proves an install by `/pilot run/` in `pilot help`: S7 moves it.
- Prompt text naming `pilot run`: `agents/pilot.md:3, 112, 310, 592-593` (own-share pin 11871,
  `scripts/test/measure-prompt.test.mjs`), `agents/pilot-auditor.md:164`; 91 hits in 33 files in all.
- Tests: `deck/test/run.test.mjs`, `run-prompt.test.mjs`, `end-session.test.mjs`, `wrapper-stream.test.mjs`,
  `start-session.test.mjs`, `chain.test.mjs`, `tabs.test.mjs`, `facades.test.mjs`, `hooks/test/tool-ran.test.js`.
  ADR 0180: no test pins prose; a test that greps code for an absence carries `// lint: <rule>`.
- deck-writes-github (itm_5f1725c876a7) landed at bc75cc5b, merged here: `deck/doctor.mjs` now has its `pilot allow
  rules` row (234) and `checkAll` at 353; `docs/adr/README.md` ends at 0182, so ADR NNNN is 0183 or later;
  `deck/server-tools.mjs`'s chain moved to 383; `bin/pilot.mjs`'s `run` verb is at 40, 85, 88, 300-303.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The look, `deck/run-look.mjs` | `look(op, args, deps)`; CLI printing one JSON `Outcome` | `pickup`, `firstPrompt`, `holdFor`, `coPilotAt`, `sayHeld`, `sayAloud` moved from `deck/run.mjs`; claim, cooldown, session pid, repository, stamps, the start release | local-substitutable |
| The mod, `hooks/handoff-mod.mjs` | `register(on)` | events, busy and idle, timers, `$.command.run`, `$.prompt.submit`, the started check | true external (fake `on` and `$`) |
| The hand-off call, `scripts/handoff.mjs` | `handoff({ cwd, env, trailers })` | repository, posted stamp, reported-in line | local-substitutable |
| The deck client, `deck/client.mjs` | `notePosted(answer, { env, ppid, home })` | the chain hand-off's posted stamp | local-substitutable |
| Session start, `deck/session.mjs` | `openPilot(repo, deps)` behind `startSession` and `pilot start` | the `claude` path, the reach's args, the settings file, the window | local-substitutable (fake spawn) |
| The doctor row, `deck/doctor.mjs` | `modsRow({ version, settings, env })` | version and settings checks | in-process |

Deletion test: `deck/run.mjs`, `run-prompt.mjs`, the stamps and the wrapper streams vanish with nothing
reappearing; the look survives (deleted, its logic would reappear untested in the mod).

## 4. Ubiquitous language

- **Hand-off**: an open `handoff` item for this repository, by `pilot handoff` or a chain; the newest only.
- **Look**: one decision over the deck for one repository, answering an `Outcome`; it never waits.
- **Outcome**: `{ act: 'none' | 'held' | 'clear' | 'submit' | 'said', id?, prompt?, until?, why? }`.
- **Session pid**: the Claude Code process: `CLAUDE_PID`, else the caller's `process.ppid`.
- **Posted**: `claims/posted-<session pid>.stamp`, the hand-off id that session posted; the only session cleared.
- **Reported in**: `claims/mod-<session pid>.stamp`, written by the look's `start`; `pilot handoff` reads it.
- **Plain start**: a pilot session opened with no first prompt and no launcher; it chains nothing.

## 5. Locked decisions

- **L1 The mod is a thin adapter; the look stays in Node** behind a CLI run by `$.process.run`. Rejected: the look
  rewritten against `$.http.fetch` and `$.fs` (no exclusive create; every test against a fake host).
- **L2 The claim stays the `wx` file** `clear-typed-<id>`, taken in `node`. Rejected: a deck-side claim route.
- **L3 The submit follows the clear in one `turn.complete` handler**, after `cleared` confirms the lane's marker.
- **L4 The mod acts on the main session only and never mid-turn**: `turn.start` busy, `turn.complete` idle.
- **L5** Superseded by L12 and A8: there is no launcher to keep End.
- **L6 The cooldown lives in the look** as a stamp per repository, so a restarted session keeps it.
- **L7 No pty fallback.** Mods off is a plain session and spec 8's line.
- **L8 Grilling depth "forks"** (itm_f6ffe52105fa): only decisions with materially different deliverables go out.
- **L9 One place knows a hand-off was taken**: the look's `cleared`, logging `mod: cleared <id>` once.
  itm_b561a9d42212's count and friction step attach there; this run builds neither.
- **L10** Superseded by L12: every prompt and guard line that names `pilot run` is reworded (S11) within the pins;
  lines that say "types `/clear`" without naming it stay, true in effect.
- **L11** (A1 overturned, itm_092acdb3e41f) The mod acts in every main pilot session while the plugin is enabled.
  The look and `pilot handoff` name the repository `listeningRepo(cwd)` (ADR 0091); `sessionRepo`'s
  `PILOT_RUN_REPO` has no setter after S7 and goes in S8.
- **L12** (A7 overturned, itm_6cb636583c2c) `pilot run` is removed, not thinned. A pilot session starts plain and
  chains nothing at start; from its first hand-off on it is automatic: the mod clears, submits, and the fresh
  context continues and takes the next ticket, with no launcher process. Rejected: a thin launcher.
  Confirmed by the user (itm_6cb636583c2c, 2026-11-16): "i dont want to have to crank start it every session. like if i say "continue with the work" it should work like we have it today"; one typed line at a session's start, none after ("alrighty").
- **L13 The co-pilot release moves to the look's `start`**, which runs once per session (`session.start` does not
  refire after `/clear`), through `POST /api/started { repo }`, which replaces `/api/chain`; `chainNext` loses
  `atStart`. Tradeoff: a second pilot session opened in the repository releases the first's co-pilot, as a second
  `pilot run` did. Rejected: no release (a dead session's co-pilot holds every hand-off 20 min); the SessionStart
  hook (refires after each `/clear`, releasing the live co-pilot of the run that just handed off).
- **L14 A chain hand-off is posted for the session that finished**: `deck_record`'s answer names the chained id
  and the deck client, a child of that session, writes its posted stamp. Rejected: the daemon writes it (it knows
  no session pid); the look clears any chain hand-off (breaks A6's bound).
- **L15** (A10 overturned, itm_773b73fb25f3) `pilot start` is a small verb, used once at the start: it opens a pilot
  window through S9's `openPilot` (the reach's `--settings` file and `--add-dir`, no prompt) and exits. It holds no
  child, watches nothing, submits nothing; nothing on the hand-off path reads what it wrote. Off Windows it prints
  the `claude` command line to run and exits 0. overridden: a launcher again, the thing L12 removes.
  Rejected: a verb that spawns `claude` in the same terminal and waits (a launcher, L12).
- **L16** (A8 overturned, itm_173ab999f99f: "yes lets spike") Spike End from the mod before deciding. Result (§3):
  `$.command.run({ command: 'exit' })` refused in the probe session, no session-ending call in the host's `$`,
  interactive not provable without accepting a trust dialog. It did not work, so A8's default holds: End leaves the
  deck (S10). overridden: unproven, idle only, a new deck route and store field.

## 6. Assumed decisions

- **A1 The mod acts only under `pilot run`.**
  Verdict: overturned: "i prefer the every pilot session" (itm_092acdb3e41f). Replaced by L11.
- **A2 The minimum Claude Code is 2.1.325**, the version proven. Tradeoff: 2.1.287-2.1.324 type `/clear`.
  Verdict: stands
- **A3 One deletion slice over the 400-line limit** (S7, about 2400 lines removed: `deck/run.mjs`, `run-prompt.mjs`,
  their tests): no added lines outside import fix-ups. Tradeoff: one long diff.
  Verdict: stands
- **A4 Security defaults** (`pilot:security-reviewer` on every slice but S11): a fixed argv from the mod's own
  `import.meta.url`, ids shape-checked `itm_[0-9a-f]+` before any argv or stamp; the submitted prompt a fixed
  literal plus the lander line; no `$.http.fetch` in the mod; spec 5's bound re-proved; Start's command line takes
  no deck text and refuses `"` and `%` as today.
  Verdict: stands
- **A5 The spec and the QA environment.** QA environment answered on itm_8b0364a9084f: "This machine, scratch
  deck, 5 live hand-offs".
  Verdict: stands
- **A6 Only the session that posted the hand-off is cleared**, by `claims/posted-<session pid>.stamp`; `cleared`
  deletes it. Tradeoff: a hand-off whose poster died is cleared by nobody; the next session picks it up at
  SessionStart. Rejected: any session whose event names `pilot:pilot`.
  Verdict: stands
  Why: it bounds L11's cost to the session that asked for the hand-off; no queued ticket touches `claims/`.
  red team: chain hand-offs carry no stamp; L14 adds it.
- **A7 Chain at start only under `pilot run`.**
  Verdict: overturned: "that is true, but i dont want pilot run to even be a thing anymore. maybe we can just have the start of the session be normal, but as soon as it hits the handoff, it turns into auto. fyi the handoff is what injects the prompt, and the handoff doesnt just start the session anew. we can reconfigure how the whole system works i dont care, just whatever gets it the basic autonomy of running endlessly without me needing to intervene." (itm_6cb636583c2c, 2026-11-16). Replaced by L12.
- **A8 End leaves the deck.** No host call ends a session (spike), and with no launcher nothing holds a child to
  kill. Tradeoff: the user closes the window to stop a session; a mid-turn End from the page is lost. Rejected:
  the mod runs `$.command.run({ command: 'exit' })` on an end flag the look reads (unproven, idle only, and a new
  deck route and store field).
  Verdict: overturned: "yes lets spike" (itm_173ab999f99f), L16. The spike failed (§3: `no command named /exit in
  this session`; no end call on `$`), so the default holds: End leaves the deck.
- **A9 Start opens `claude` directly with no first prompt.** `cmd /d /c start "pilot" "<claude>" --add-dir <rules
  root> --agent pilot:pilot --settings <~/.claude/pilot/start-settings.json>`, the settings written at the press
  because a JSON string holds `"`. Tradeoff: Start and Resume open an idle pilot; the user types the first message.
  Rejected: `RESUME_PROMPT` on the line (a chain at start, which L12 removes); dropping Start.
  Verdict: stands
  Why: the user accepted one typed line at a session's start (itm_6cb636583c2c), which is this tradeoff; not posted again.
- **A10 Below reach `everything`, the deck's Start is the way to a pilot session**; `pilot reach` and the README
  say so. Tradeoff: at `nothing` or `rules`, a hand-typed `claude --agent pilot:pilot` has no plugin, so no pilot
  and no mod. Rejected: a `pilot start` verb that spawns `claude` and waits (a launcher, L12).
  Verdict: overturned: the user chose the command (itm_773b73fb25f3, 2026-11-16): "we can have a small command, but let it be a minor little thing, not part of the internal mechanics. its just used once at the start"
  overridden: a `pilot start` verb is a launcher again, the thing L12 removes.
  Replaced by L15 (re-cut done: S12): `pilot start` opens a pilot session with the plugin on and exits; it holds no child, watches nothing, submits nothing, and no hand-off path reads anything it wrote.

## 7. Out of scope

- The books at the hand-off (itm_b561a9d42212); splitting `hooks/context-size-guard.js` (itm_df2038a49471).
- A deck-side claim; End from inside the session (A8, L16).
- Wording that says "types `/clear`" without naming `pilot run` (L10).
- Reach levels themselves: what each level installs is unchanged (L15 changes only how a session is started).

## 8. Slices

Width 5; longest stem 6 (S1 → S2 → S4 → S7 → S10 → S11).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: a mod clears and submits for a hand-off | 1 | `hooks/handoff-mod.mjs` (new), `hooks/hooks.json`, `hooks/test/handoff-mod.test.mjs` (new), `deck/run-look.mjs` (new), `deck/test/run-look.test.mjs` (new), `deck/run.mjs`, `deck/test/facades.test.mjs`, `scripts/handoff.mjs`, `scripts/test/handoff.test.mjs`, `docs/adr/NNNN-handoff-mod.md` (new), `docs/adr/README.md` | – | ts, security | [S1](slices/S1.md) |
| S2 | The look carries the whole watch | 4, 5, 6 | `deck/run-look.mjs`, `deck/test/run-look.test.mjs`, `deck/run.mjs`, `deck/test/facades.test.mjs` | S1 (`deck/run-look.mjs`) | ts, security | [S2](slices/S2.md) |
| S3 | The mod hears every pilot session | 2, 3, 4, 6 | `hooks/handoff-mod.mjs`, `hooks/test/handoff-mod.test.mjs` | S1 (`hooks/handoff-mod.mjs`) | ts, security | [S3](slices/S3.md) |
| S4 | A pilot session's start releases a dead co-pilot and chains nothing | 10 | `deck/server-routes.mjs`, `deck/chain.mjs`, `deck/test/chain.test.mjs`, `deck/test/started-route.test.mjs` (new), `deck/run-look.mjs`, `deck/test/run-look.test.mjs` | S2 (`deck/run-look.mjs`) | ts, security | [S4](slices/S4.md) |
| S5 | A finished run's chain hand-off is cleared too | 9 | `deck/server-tools.mjs`, `deck/client.mjs`, `deck/test/record.test.mjs`, `deck/test/client-posted.test.mjs` (new) | S1 (the posted stamp) | ts, security | [S5](slices/S5.md) |
| S6 | A session where the mod cannot run is told at the hand-off | 8 | `scripts/handoff.mjs`, `scripts/test/handoff.test.mjs`, `deck/doctor.mjs`, `deck/test/doctor-mods.test.mjs` (new) | S1 (`scripts/handoff.mjs`), S2 (the reported-in stamp) | ts, security | [S6](slices/S6.md) |
| S7 | `pilot run` is gone | 7 | `bin/pilot.mjs`, `deck/run.mjs` (deleted), `deck/run-prompt.mjs` (deleted), `deck/test/run.test.mjs` (deleted), `deck/test/run-prompt.test.mjs` (deleted), `deck/test/facades.test.mjs`, `package.json`, `package-lock.json`, `scripts/install-command.mjs` | S2 (`deck/run.mjs`), S3 (the whole mod), S4 (the start release) | ts, security | [S7](slices/S7.md) |
| S8 | The turn stamps and the run env are gone | 3, 7 | `hooks/stop-gate.js`, `hooks/post-tool.js`, `hooks/lib/deck.js`, `deck/run-claim.mjs`, `deck/wait.mjs`, `hooks/test/tool-ran.test.js` (deleted), `hooks/test/inbox.test.js`, `deck/test/wait-session.test.mjs` | S7 (`deck/run-claim.mjs` readers), S6 (`PILOT_RUN_PID` in `scripts/handoff.mjs`) | ts, security | [S8](slices/S8.md) |
| S9 | The deck's Start opens the pilot directly | 11 | `deck/session.mjs`, `deck/run-env.mjs`, `deck/test/start-session.test.mjs` | – | ts, security | [S9](slices/S9.md) |
| S10 | End and the wrapper streams leave the deck | 12 | `deck/session.mjs`, `deck/server-wait.mjs`, `deck/server-routes.mjs`, `deck/tabs.mjs`, `deck/ui/render-strip.mjs`, `deck/ui/render-pages.mjs`, `deck/test/end-session.test.mjs` (deleted), `deck/test/wrapper-stream.test.mjs` (deleted), `deck/test/tabs.test.mjs` | S4 (`deck/server-routes.mjs`), S7 (no wrapper left), S9 (`deck/session.mjs`) | ts, security | [S10](slices/S10.md) |
| S11 | No text tells anyone to run `pilot run` | 7 | `agents/pilot.md`, `agents/pilot-auditor.md`, `README.md`, `deck/README.md`, `CONTEXT.md`, `CLAUDE.excerpt.md`, `rules/orchestration.md`, `scripts/apply-reach.mjs`, `scripts/install-settings.mjs`, `scripts/reach.mjs`, `scripts/test/measure-prompt.test.mjs` | S6 (the hand-off line), S7 (the verb), S10 (End), S12 (`pilot start`) | ts | [S11](slices/S11.md) |
| S12 | `pilot start` opens a pilot window and exits | 13 | `bin/pilot.mjs`, `deck/test/pilot-start.test.mjs` (new) | S7 (`bin/pilot.mjs`), S9 (`openPilot`) | ts, security | [S12](slices/S12.md) |

Red team (assumed the cut failed, walked each first red step against the files):

- red team: S1's look needs `pickup`, unexported (`deck/run.mjs:235`), and S7 deletes `run.mjs` → S1 and S2 move
  the look's helpers into `run-look.mjs` and `run.mjs` imports them back; S7 deletes nothing the look uses.
- red team: S2 and S3 each half-build "not started" → the `unstarted` op is fixed in S1's Interface.
- red team: the mod cannot find the look through `PILOT_PLUGIN_ROOT` (no launcher sets it) → `import.meta.url`,
  proven in S1's live check or the run stops.
- red team: under L12 the endless loop stops at the first clean finish: the chain hand-off has no posted stamp
  (`deck/server-tools.mjs:383`) → L14, S5; spec 9 is its evidence.
- red team: `pilot start` and Start each building the window would drift → one `openPilot` in S9, which S12
  calls; S12 owns `bin/pilot.mjs` after S7 removes `run` from it.
- red team: S11 needs Start's and `pilot start`'s final wording → S11 after S12 (and S9 through it).
- red team: with `/api/chain` gone, a dead session's co-pilot holds every hand-off 20 min → S4 before S7.
- red team: Start would run `pilot run` after S7 deletes it → S9 needs nothing and may run first.
- red team: `pilot help` loses `pilot run`, and the install check greps for it → S7 owns `install-command.mjs`.
- red team: S8 deleting `lastTurnEnded` while `clearOnce` reads it → S8 after S7.
- red team: S11 rewording `agents/pilot.md:592` before the line it describes exists → S11 after S6; the pin
  (11871) has no room to spare, so S11 owns `measure-prompt.test.mjs` and may not raise it.
- red team (L16): End from the mod was attacked by a probe, not argued: refused (§3); S10 stands as cut.

## 9. Acceptance evidence

Surface: a CLI, the deck page, and an interactive Claude Code session in a terminal. Every command runs in Git
Bash on this machine in the repository's main checkout unless it names another directory; the deck is a scratch
deck (`pilot deck --scratch`).

1. `claude plugin validate .` in the plugin root passes, listing the module (spec 1).
2. A plain `claude --agent pilot:pilot` with a hand-off posted clears and starts its fresh turn, nobody typing (1).
3. The deck page: Start on a tab opens a pilot window, idle; no End appears on the live tab (11, 12).
4. Five hand-offs, two from Start-opened sessions: each `mod: cleared` and `mod: submitted` in `wrapper.log`; a
   second plain `claude` in the repository is never cleared (2, 3).
5. A held hand-off under a live co-pilot stays held, clears on release, and clears at 20 min (4).
6. A second hand-off inside 5 minutes clears nothing (5).
7. Esc before a hand-off: the reply on the hand-off names the Stop hold (6).
8. Three queued tickets run back to back from one start with no keystroke after the first prompt (9, 10).
9. `pilot run` prints the usage; `npm ls node-pty` finds nothing (7).
10. `claude --safe-mode --agent pilot:pilot`, then a hand-off: the line says to type `/clear`; `pilot doctor` shows
    the `mods` row (8).
11. `pilot start` in Git Bash in a scratch checkout returns at once and opens a pilot window, idle (13).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 4, 5, 6 |
| S3 | planned | | | | S1 | 2, 3, 4, 6 |
| S4 | planned | | | | S2 | 10 |
| S5 | planned | | | | S1 | 9 |
| S6 | planned | | | | S1, S2 | 8 |
| S7 | planned | | | | S2, S3, S4 | 7 |
| S8 | planned | | | | S7, S6 | 3, 7 |
| S9 | planned | | | | – | 11 |
| S10 | planned | | | | S4, S7, S9 | 12 |
| S11 | planned | | | | S6, S7, S10, S12 | 7 |
| S12 | planned | | | | S7, S9 | 13 |
| handoff-mod | planned | `feat/handoff-mod` | | | S1-S12 | 1-13 |
