---
status: proposed
date: 2026-11-16
tags: [handoff, mods, hooks, deck]
supersedes: []
superseded_by: []
paths: [hooks/handoff-mod.mjs, hooks/hooks.json, deck/run-look.mjs, scripts/handoff.mjs, docs/design/handoff-mod/architecture.md]
---
# The hand-off runs from a mod, and `pilot run` is gone

We decided that a mod shipped in the plugin clears a pilot session at its hand-off and submits the fresh context's first prompt, with nobody typing and no pty. A session starts plain and needs no launcher. The decision over the deck stays in Node, behind a CLI the mod runs.

## Context

A hand-off needed `/clear` and a prompt typed into the session. Only `pilot run` could do that: it held a pty, and it watched stamp files to tell when a turn had ended. Claude Code 2.1.325 loads mods, hooks modules a plugin lists under `"modules"`. The spike (architecture §3) showed that a mod's `turn.complete` handler can run `$.command.run({ command: 'clear' })` and then `$.prompt.submit`. It also showed that no host call ends a session.

## Decision

- **L1 The mod is a thin adapter; the look stays in Node.** `hooks/handoff-mod.mjs` runs `node <root>/deck/run-look.mjs <op>` through `$.process.run`, takes the path from its own `import.meta.url`, and reads one JSON `Outcome` line.
- **L2 The claim stays the `wx` file** `clear-typed-<id>`, taken in Node.
- **L3 The submit follows the clear in one `turn.complete` handler**, once the look's `cleared` has confirmed the lane's marker.
- **L4 The mod acts on the main session only** (no `agentId`), never mid-turn.
- **L6 The cooldown lives in the look** as a stamp per repository.
- **L7 No pty fallback.**
- **L8** Grilling went only as deep as decisions with materially different deliverables.
- **L9 One place knows a hand-off was taken**: the look's `cleared`, which logs `mod: cleared <id>`.
- **L10**, superseded by L12: lines naming `pilot run` are reworded within the prompt pins.
- **L11 The mod acts in every main pilot session.** The look and `pilot handoff` both name the repository `listeningRepo(cwd)`, the main checkout (ADR 0091).
- **L12 `pilot run` is removed, not thinned.** A session chains nothing at start. From its first hand-off on, the mod carries it.
- **L13 The co-pilot release moves to the look's `start`**, through `POST /api/started`.
- **L14 A chain hand-off is posted for the session that finished**: the deck client writes its posted stamp.
- **A6 Only the session that posted the hand-off is cleared.** `pilot handoff` writes `claims/posted-<session pid>.stamp`, where the session pid is `CLAUDE_PID`, else the parent. `cleared` deletes it.
- **A8 End leaves the deck**: the spike found no host call that ends a session (L16).
- **A9 Start opens `claude` directly with no first prompt.**
- **A10, overturned by L15**: `pilot start` is a small verb. It opens a pilot window and exits.

## Rejected

- The look rewritten against `$.http.fetch` and `$.fs`. `$.fs` has no exclusive create, and every test would run against a fake host.
- A deck-side claim route.
- A thin launcher in place of `pilot run`.
- Clearing any session whose agent is `pilot:pilot`. That would clear sessions that never asked for the hand-off.
- Ending the session from the mod. `$.command.run({ command: 'exit' })` is refused, and `$` has no end call.

## Consequences

- With mods off (`--safe-mode`, `--bare`, `disableAllHooks`, an untrusted workspace), a session is plain, and the user types `/clear` (spec 8).
- A hand-off whose poster died is cleared by nobody. The next session picks it up at SessionStart.
