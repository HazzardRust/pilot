# stay-awake: the machine stays awake while any agent runs

Ticket itm_498e739e2bcb · source thread itm_d90854dab98a · base `origin/pilot` 86957ec · ADR NNNN

## 1. Problem

The user's laptop went to standby while agents were running, and nothing in pilot asked the OS to stay awake.
Field case, 2026-11-22, HazzardLaptop: lid closed at 00:42, standby until 16:42 (Kernel-Power 506, reason "Lid",
a Modern Standby machine); three runs froze for 16 hours and the deck defaulted six questions meanwhile. The user
wants the machine not to sleep while any agent is running, without pilot changing their power settings, and wants
to be told what would still stop the work.

**The limit, plainly.** No keep-awake request survives a lid close, a power-button press or Start > Sleep on
Windows or macOS. Microsoft's PowerSetRequest page: "power requests are terminated upon user-initiated system sleep
entry (power button, lid close or selecting Sleep from the Start menu)"; on Modern Standby on battery they also end
"5 minutes after the system sleep timeout has expired". `caffeinate` covers idle sleep only. So this feature stops
*idle* sleep while work is in flight; the field case, a lid close, is stopped only by the user setting
"When I close the lid" to *Do nothing* themselves, which the doctor row names (spec 4). The lid-close scope is the
user's question itm_1b57cd063b34 (A6).

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | The user's deck holds one OS keep-awake request while work is in flight and releases it when none is; the screen may still turn off. Work in flight: a roster agent heard within `LINGER_MS` (15 min, A1), a landing running, or an armed question default (spec 5). | `deck/test/awake.test.mjs` on a fake clock and fake spawn: a heartbeat at t holds by t+60 s, still held at t+14 min, released by t+16 min with nothing else in flight; 1 spawn and 1 stop. |
| 2 | Each OS holds by its own means, as a child process: Windows PowerCreateRequest + PowerSetRequest(SystemRequired) with reason `pilot: work in flight`, macOS `caffeinate -i -w <deck pid>`, Linux `systemd-inhibit --what=sleep:idle`. practitioner: a Windows power engineer trusts the OS request list, not the app's flag. | Per OS in CI (`ci.yml` windows-latest; `gate.yml` macos-latest, ubuntu-latest): the OS's own list shows 1 pilot entry while held and 0 within 5 s of stop (`powercfg /requests` when elevated, `pmset -g assertions`, `systemd-inhibit --list`); where the list is unreadable, the holder's `held` line and its exit within 5 s. |
| 3 | The limit is stated, never worked around: lid close, power button and Start > Sleep still sleep the machine on every OS (A4 for Linux), and on Modern Standby on battery the request ends 5 min after the sleep timeout. | §1 above, the doctor row's text (spec 4) and ADR NNNN each state it: 3 places, read at Gate 1 and in the PR. |
| 4 | `pilot doctor` has a `Power` row: whether the deck holds the request now, the power source, the lid-close action on battery and plugged in, the power-button action, and Modern Standby; each risk names the exact setting the user changes (Windows: Control Panel > Power Options > "Choose what closing the lid does"; Linux: `HandleLidSwitch` in `/etc/systemd/logind.conf`; macOS: lid close always sleeps unless clamshell on power). `fail` when on battery or the lid action on the current source is not *Do nothing* (A3); `cannot tell` when unreadable. | `deck/test/doctor-power.test.mjs` with faked reads: 7 states (plugged+do nothing pass, plugged+sleep fail, battery fail, Modern Standby battery note, unreadable cannot tell, deck down "not held", macOS) each print the expected row. practitioner: a support engineer reads `powercfg /q` and `pmset -g`, which the row parses. |
| 5 | An armed question default counts as work in flight: an open, non-blocking question with a recommended option holds the machine until the deck takes the default (at most `DEFAULT_MS`, 20 min) (A2). | `awake.test.mjs`: a seeded defaultable question with no agent holds; a blocking question or a gate holds nothing; 2 cases. |
| 6 | A holder that fails to start or dies is written once to `deck.log` and the deck keeps serving; the next tick may try again, at most once a minute. | A test with a spawn that exits 1: 1 log line, `/api/health` still answers, `awake.held` false. |
| 7 | Only the user's deck holds: a leashed or test deck never starts a holder. | The suite's census (`scripts/gate.mjs`) counts 0 holder processes left; `startDaemon` in tests spawns none. |
| 8 | The holder dies with the deck: killed or crashed, the deck leaves no request behind. | Per-OS real test: the holder exits within 5 s of its watched pid exiting. |
| 9 | Nothing writes the user's power settings. | `deck/test/power-writes.test.mjs` scans `deck/awake.mjs` and `deck/power.mjs`: 0 matches of a write (`powercfg` with `/change`, `/set*`, `/hibernate`, `-x`; `pmset` without `-g`; `SetSuspendState`; a write to `logind.conf`). |

## 3. Findings

- Roster: `deck/agents.mjs` — `LIVE_WINDOW_MS` 90 s, `noteAgent` from `hooks/agent-roster.js`, a PostToolUse lane, one heartbeat per 30 s, main sessions skipped (no `agent_id`). A long or `run_in_background` gate makes no tool call, so the roster drops its agent after 90 s: hence `LINGER_MS`.
- Landings: `landingsRunning()` in `deck/landing.mjs`, already read by the idle rule.
- Defaults: `defaultsDue(items, Infinity)` in `deck/store-defaults.mjs` lists every armed default (the timer's own call); `DEFAULT_MS` 20 min.
- User's deck only: `deck/daemon.mjs` main(), the `else` branch beside `holdUsersDeckIdle` (line 299); "a test daemon must never tick (L1)".
- Health: `deck/health.mjs` `healthOf()` served at `/api/health`; `deck/probe.mjs` `probeDeck` copies named fields only.
- Doctor: `deck/doctor.mjs` `checkAll` rows, the `defenderRow` pattern (injected `platform`, `run`; System32 absolute paths, argv arrays). 582 lines; `deck/test/facades.test.mjs` caps deck files at 800.
- Platform: `hooks/lib/platform.js` `hostPlatform()` is the only reader of `process.platform` (`scripts/test/platform-reads.test.mjs`).
- Process reads: `deck/procs.mjs` already spawns PowerShell by absolute path for the process table.
- OS facts (research, 8 sources): Windows request APIs and lid termination (learn.microsoft.com PowerSetRequest, SetThreadExecutionState); `LIDACTION` 0 nothing, 1 sleep, 2 hibernate, 3 shut down; caffeinate `-i`/`-w`; logind `HandleLidSwitch`, `handle-lid-switch` lock privileged. Release on holder death on Windows is unconfirmed by docs; spec 8's test confirms it.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| **Awake** (`deck/awake.mjs`, new) | `inFlight(facts, now)`, `holderFor(platform, pid)`, `holdAwake(deps) -> { stop, state }`, `awakeState()` | the in-flight rule, the per-OS holder commands (3 adapters), the tick, the start/stop transitions, failure logging | in-process (rule); true external (OS holder, faked by `spawn`) |
| **Roster** (`deck/agents.mjs`) | adds `lastHeardAt()` | the last heartbeat across all agents, surviving the 90 s sweep | in-process |
| **Power** (`deck/power.mjs`, new) | `readPower({ platform, run })`, `powerRow({ power, awake, platform })` | per-OS read commands and their parsing, the setting each risk names | true external (OS reads, faked by `run`) |

Deletion test: `idle.mjs`'s `holdIdle` stays separate — it exits on *nothing*, Awake holds on *something*; they share only `landingsRunning`, passed in. `doctor.mjs` stays the aggregator; the row's logic lives in Power so `doctor.mjs` grows by 3 lines.

## 4. Ubiquitous language

- **Work in flight**: a roster agent heard within the linger, a landing running, or an armed default.
- **Holder**: the child process that owns the OS keep-awake request; it lives exactly as long as the hold.
- **Linger** (`LINGER_MS`): how long after the last heartbeat work still counts as in flight.
- **Armed default**: an open question the deck will answer with its recommended option.
- **Power row**: `pilot doctor`'s line naming what would still stop the work.

## 5. Locked decisions

| ID | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The holder is a child process per OS (PowerShell P/Invoke, `caffeinate`, `systemd-inhibit`), spawned by absolute path with an argv array, watching the deck's pid. | No native addon in the package; a child's death releases the request with it. | An ffi/native addon; a PowerShell call per tick (no request lives between calls). |
| L2 | Only the user's (unleashed) deck holds, wired beside `holdUsersDeckIdle`. | One deck per machine (ADR 0005); test decks must never tick. | A per-session hook holding: one request per session, ghosts when killed. |
| L3 | The rule reads what the deck already observes (roster, landings, defaults); agents declare nothing. | ADR 0024: observed, not declared. | A PreToolUse "in a call" mark: misses `run_in_background` gates, costs every tool call. |
| L4 | Reads only; every risk names the user's setting, pilot changes none; a structural test pins it. | The user's words: "without pilot changing their power settings". | Offering a `--fix` that runs `powercfg /setacvalueindex`. |
| L5 | One unref'd 60 s tick; a holder is spawned on a false→true transition and killed on true→false, nothing in between. | Bounded process starts; release within a minute of the linger. | Event-driven holds on each heartbeat (noisy spawn/kill on a flickering roster). |
| L6 | `/api/health` carries `awake: { held, since }`, and `probeDeck` copies it, so the doctor row says whether the deck holds now. | One place the truth lives; doctor reads it, never infers. | Doctor listing OS requests itself (needs elevation on Windows). |
| L7 | ADR NNNN "The deck holds a keep-awake request while work is in flight" records L1-L5 and the lid limit. | A later reader would otherwise re-derive the OS facts. | No ADR. |
| L8 | Grilling depth: forks, *assumed*: the deck took the default after 20 min with no answer (itm_5529a1376790), not the user's press. | ADR 0021: depth is the user's, once per run; the default stands until they say otherwise. | A deeper round nobody asked for. |

## 6. Assumed decisions

- **A1** `LINGER_MS` = 15 min (the pilot's itm_b1f7f8428d17). *Tradeoff:* awake up to ~16 min after the last agent; covers a background gate. *Rejected:* within a minute (sleeps mid-gate), 5 min (misses long gates).
  Answer: 15 min, the deck's default after 20 min (itm_b1f7f8428d17); assumed, not the user's press.
- **A2** An armed default holds (itm_568ac6a6c4d6). *Tradeoff:* up to 20 min awake per unanswered question. *Rejected:* agents only — the field case's six defaults would still have waited for wake.
  Answer: Yes, the deck's default (itm_568ac6a6c4d6); assumed.
- **A3** The Power row fails (doctor exits 1) on battery or a sleeping lid action on the current source (itm_e235cc4bb810). *Tradeoff:* doctor is red on most laptops at defaults; nothing gates on its exit. *Rejected:* an always-pass note.
  Answer: fail, the deck's default (itm_e235cc4bb810); assumed.
- **A4** Linux takes `sleep:idle`, not `handle-lid-switch` (itm_99e30795cf94). *Tradeoff:* a Linux lid close still suspends. *Rejected:* the lid lock: privileged on some distros, unlike the other two OSes.
  Answer: "Lid close stays the user's" (itm_99e30795cf94), the deck's default after 20 min; assumed.
- **A5** A main session alone holds nothing (itm_b5d68c974470). *Tradeoff:* a lone session without subagents can sleep. *Rejected:* a main-session heartbeat on every tool call.
  Answer: No (crew agents only), the deck's default (itm_b5d68c974470); assumed.
- **A6** Build as scoped despite the lid limit (itm_1b57cd063b34). *Tradeoff:* the holder fixes idle sleep only. *Rejected:* doctor row only; dropping the ticket.
- **A7** QA runs on this laptop and CI (itm_b4722d322eba). *Tradeoff:* macOS and Linux are proved by CI only.
  Answer: this laptop + CI, the deck's default (itm_b4722d322eba); assumed.

## 7. Out of scope

Changing any power setting or offering to; blocking lid close, the power button or Start > Sleep; waking a sleeping
machine; a deck UI indicator for the hold (doctor and `/api/health` carry it); main-session heartbeats (A5);
keep-awake for a non-pilot `claude` session.

## 8. Slices

Width 2; longest stem 2

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 The user's deck holds a Windows keep-awake request while an agent runs | 1, 5, 6, 7, 8 | `deck/awake.mjs` (new), `deck/agents.mjs` (`lastHeardAt`), `deck/daemon.mjs` (wiring), `deck/health.mjs` (`awake`), `deck/test/awake.test.mjs` (new), `deck/test/awake-holder.test.mjs` (new), `docs/adr/NNNN-stay-awake.md` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 macOS and Linux hold by their own means | 2, 3 | `deck/awake.mjs` (`holderFor` darwin, linux rows), `deck/test/awake-holder.test.mjs` (darwin, linux cases) | S1 (`deck/awake.mjs` `holderFor`) | typescript, security | [S2](slices/S2.md) |
| S3 pilot doctor names what would still stop the work | 3, 4, 9 | `deck/power.mjs` (new), `deck/doctor.mjs` (one row), `deck/probe.mjs` (`awake`), `bin/pilot.mjs` (usage line), `deck/test/doctor-power.test.mjs` (new), `deck/test/power-writes.test.mjs` (new) | S1 (`/api/health` `awake`) | typescript, security | [S3](slices/S3.md) |

S2 and S3 share no file and run side by side once S1 is integrated. red team: walked S1's first behaviour against
`deck/daemon.mjs:299`: the hold must sit in the same `else` branch as the idle rule or a leashed test deck spawns a
holder (spec 7) — written into S1's Prohibited. Walked S3 against `deck/probe.mjs:29`: probe drops unknown fields,
so S3 must own the `awake` copy or the row always says "not held" — moved `probe.mjs` into S3. Seam half-built by
two slices: `holderFor` (S1 win32, S2 darwin/linux) — kept one owner per row, S2 after S1. Attacked: Linux holder
leaving an orphan `tail` under the gate's census (S2 kills the process group); `awake.test.mjs` timing on CI
(fake clock only).

## 9. Acceptance evidence

1. On this laptop, plugged in, with a slice running: `powercfg /requests` (elevated) lists `pilot: work in flight` under SYSTEM; `pilot doctor` prints `Power: held …`.
2. 16 min after the last agent stops: the entry is gone and the row says not held.
3. Left idle past the sleep timeout while held: the System log shows no Kernel-Power sleep entry for the held window (practitioner: a field engineer reads Kernel-Power 42/506, the field case's own instrument).
4. `pilot doctor` on battery with the lid action at Sleep: `fail  Power: …` naming "Choose what closing the lid does".
5. CI: the holder tests green on windows-latest, macos-latest and ubuntu-latest.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 5, 6, 7, 8 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S1 | 3, 4, 9 |
| stay-awake | planned | feat/stay-awake | | | S1, S2, S3 | 1-9 |
