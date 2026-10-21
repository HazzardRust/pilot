---
status: accepted
date: 2026-10-18
tags: [deck, daemon, lifecycle, upgrade]
supersedes: []
superseded_by: []
paths: [deck/exit-route.mjs, deck/client.mjs, deck/server-routes.mjs, deck/daemon.mjs, deck/test/daemon-replace.test.mjs, docs/design/daemon-lifecycle/architecture.md]
---
# A session replaces an older deck through the deck's own exit route

We decided that a session which finds a deck older than its own plugin asks that deck to exit through `POST /api/exit { version }`, and the deck decides; a deck from before that route is stopped by pid only once the process table shows that pid running `deck/daemon.mjs`; a deck on the same or a newer version is left serving.

## Context

One deck daemon serves every session on the machine, and it outlives the plugin update that installed it: after an update, every new session joined the old deck and ran the new client against the old routes until the deck idled out. The deck now reports its version on `/api/health` (daemon-lifecycle spec 3), so a joining session can tell an older deck from its own. Two things make a plain kill wrong: a deck may be running a landing, whose `land` child dies with it, and sessions opened before an update keep the old client, so a rule of "replace a deck whose version differs" has an old session and a new one stop each other's deck in turn.

## Decision

- `ensureDaemon` reads the port through `probeDeck`. A deck reporting an older version, or none, goes to `replaceOlder`; a deck on the same or a newer version is used as it is (L11).
- A versioned deck gets one `POST /api/exit` carrying the session's plugin version. The deck answers 202 and runs the same shutdown a signal runs only when the caller's version is above its own, and 409 when it is not or while `landingsRunning()` is above zero (L3). The route sits behind `isTrustedOrigin` like every write, and a version that is not x.y.z is a 400.
- A 409, or any other answer, is one stderr line in the session, which then uses the old deck; its next join asks again.
- A deck that reports no version (every 0.9.1 daemon) has no exit route. It is stopped with `process.kill(pid)` only after the process table shows that pid as node whose script is an absolute `deck/daemon.mjs` in a pilot checkout (`bin/pilot.mjs` beside it; `isDeckDaemon` in `deck/procs.mjs`); anything else on the port, or a table that cannot be read, is left alone (L4).
- After either, the session waits for the port to free, then starts its own deck as before.

## Rejected

- *The client kills the deck's pid whatever its version*: it drops a running landing and the deck cannot refuse it.
- *No fallback for an unversioned deck*: the first update after this one would keep serving the 0.9.1 deck until it idled out.
- *Replace a deck whose version differs* (the ticket's wording): an old session and a new one would stop each other's deck in turn (A2).
- *A signal the daemon traps instead of a route*: Windows has no signal a process can trap from another, and a signal carries no version for the deck to decide on.

## Consequences

- A newer deck is never stopped by an older session; an old session keeps talking to a newer deck until it is closed.
- A deck with a landing running survives an update until the landing ends and a later join asks again.
- The exit route is a write that stops the daemon; a local process on the machine can stop the deck with it, but only by naming a newer version, which the next session's join then reverses by starting its own.
- Accepted residual risk: the unversioned kill takes its pid from the health answer, so a hostile local process holding the port could name another pilot daemon's pid; `isDeckDaemon` proves only that the pid is a pilot daemon, not that it holds the port.
- Expiry: the unversioned kill path (`replaceOlder`'s pid branch in `deck/client.mjs`) is deleted once the oldest supported deck is 0.9.3.
