---
status: superseded
date: 2026-09-25
tags: [deck, runs]
supersedes: []
superseded_by: [0039]
paths: [docs/design/independence/architecture.md, deck/test/no-open.mjs]
---
# The daemon may start headless sessions, only from Create and `deck_launch`

Until independence, the deck never started a session: a pilot was always a terminal the user opened (ADR 0005 made the daemon one long-lived process per machine; ADR 0009 made this machine the one that runs the package). Create (spec 3) asked for a thread the user types into and a pilot that answers, with nobody at a terminal. We decided the daemon may start a pilot, under three limits (L1, L2, L15 of `docs/design/independence/architecture.md`).

- **Only headless, only from two paths.** `deck/launch.mjs` is the one module that starts a session. `/create` calls it when the repository has no *unbound* live run (a run registered without `PILOT_THREAD`), and S7's `deck_launch` tool will be the second caller. Nothing else in the daemon spawns a `claude`.
- **The spawn shape is fixed.** `claude --agent pilot:pilot --permission-mode auto "<first prompt>"` under `node-pty`, in the repository, with `PILOT_THREAD=<thread id>`. It is a file and an argument list, never a shell string. The first prompt carries the thread id and nothing else; the thread's name never reaches the pty. A ConPTY child of the detached, windowless daemon has no window. Without `node-pty` the thread says "cannot start a session here: node-pty is not installed" and nothing is spawned.
- **Every session ends visibly.** The daemon keeps each session's pty handle. The pty's exit is the one writer of `Session ended (exit N)` to the thread, as a message from the deck, whether Stop caused it or the session left on its own; a session that fails also leaves the last 4 KB of its output, stripped to plain text, unless it looks like a credential. Stop (`POST /thread/<id>/stop`, Origin required and matching the Host) kills only a session this daemon holds: `taskkill /T /F /PID` first, while the root can still name its children, then `pty.kill()`. A pid on a thread is never enough to kill anything, because after a restart it may belong to another process. At startup the daemon writes `Session ended (exit unknown: the deck restarted)` to every thread whose pid is gone.

Rejected:
- `bypassPermissions`: a session nobody watches is the last one to let past the classifier.
- `claude -p`: one turn cannot hold a thread.
- The Agent SDK: metered, against the subscription-only rule.
- A visible terminal window (`wt.exe`): replaced by the user's choice of headless.
- A watchdog process outside the daemon: a second long-lived process, against ADR 0005.
- Stop killing by the thread's stored pid: a reused pid after a restart would kill somebody else's process.

**Consequences**:
- A thread item carries `pid` while its session is believed live; it draws Stop and is what the sweep checks. The notice removes it.
- A run carries `thread` when `PILOT_THREAD` names a created thread. Such a run is not the repository's live pilot for Create. Routing a bound run only its own thread's replies is S7's (ADR 0033).
- The suite sets `PILOT_DECK_NO_LAUNCH` beside `PILOT_DECK_NO_OPEN` (`deck/test/no-open.mjs`), so no test can start a real `claude`.
- `deck.json` gains two optional fields and stays `STORE_VERSION 1`.
