---
status: proposed
date: 2026-11-25
tags: [deck, power, process, platform]
supersedes: []
superseded_by: []
paths: [deck/awake.mjs, deck/agents.mjs, deck/daemon.mjs, deck/health.mjs]
---
# The deck holds a keep-awake request while work is in flight

We decided that the user's deck asks the OS for one keep-awake request while work is in flight, held by a child process, and never changes a power setting.

## Context

On 2026-11-22 the user's laptop went to standby with agents running; three runs froze for 16 hours and the deck defaulted six questions meanwhile. Nothing in pilot asked the OS to stay awake. The user wants the machine not to sleep while any agent runs, without pilot changing their power settings, and to be told what would still stop the work.

**The limit.** No keep-awake request survives a lid close, a power-button press or Start > Sleep. Microsoft's PowerSetRequest page: "power requests are terminated upon user-initiated system sleep entry (power button, lid close or selecting Sleep from the Start menu)"; on Modern Standby on battery they also end "5 minutes after the system sleep timeout has expired". macOS `caffeinate -i` covers idle sleep only. So this stops *idle* sleep while work is in flight. The field case, a lid close, is stopped only by the user setting "When I close the lid" to *Do nothing* themselves.

## Decision

- **L1** The holder is a child process per OS, spawned by absolute path with an argv array and watching the deck's pid: on Windows PowerShell calling PowerCreateRequest and PowerSetRequest(SystemRequired) with the reason `pilot: work in flight`, on macOS `caffeinate -i -w <pid>`, on Linux `systemd-inhibit --what=sleep:idle`. A request lives as long as the process that made it, so the holder's death, or its deck's, releases it.
- **L2** Only the user's (unleashed) deck holds, started beside its idle rule in `main()`. A leashed deck and `startDaemon`, which the suite calls, never start a holder.
- **L3** Work in flight is what the deck already observes, never declared: a roster agent heard within `LINGER_MS` (15 minutes, so a background gate with no tool calls still counts), a landing running, or an armed question default.
- **L4** Pilot reads power state and never writes it; every risk it reports names the setting the user changes.
- **L5** One unref'd 60-second tick. A holder is spawned on a false-to-true change and killed on true-to-false, nothing in between. A holder that fails is logged once and tried again on a later tick.

`/api/health` carries `awake: { held, since }`, `held` true only once the holder has said `held`.

## Rejected

- *A native or ffi addon*: the package ships none, and an in-process request outlives nothing the deck does not.
- *A PowerShell call per tick*: no request lives between calls.
- *A per-session hook holding*: one request per session, and ghosts when a session is killed.
- *A PreToolUse "in a call" mark*: misses `run_in_background` gates and costs every tool call.
- *A `--fix` that sets the lid action*: the user asked that pilot change no power setting.
