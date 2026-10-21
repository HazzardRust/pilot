---
# Its switch decision is superseded by ADR 0095, which makes `pilot logging on|off|status` the one switch for every log the deck keeps; the usage log itself stands.
status: amended
date: 2026-09-28
tags: [deck, logging]
supersedes: []
superseded_by: [0095]
paths: [docs/design/usage-telemetry/architecture.md, deck/client.mjs, docs/INSTALL.md]
---
# The daemon keeps a usage log that one command turns off

Usage was visible only as a live status-line reading, so the housekeeping audit stated every saving against nothing measured. The user asked for "not an interface, just something logging it", then for everyone who installs the package to have it, on by default with an off switch. So we decided the deck daemon appends one line to `<storeDir>/usage.jsonl` at every half-hour boundary, and that `pilot usage off` stops it (`docs/design/usage-telemetry/architecture.md`, L1 to L7, L13, L14).

- **A timer in the daemon**, started in `main()` and `unref`'d, never in `startDaemon()`, which the tests call.
- **One JSONL file, append-only, never rotated.** A line carries its window, the status line's snapshot and tokens in total, by model and by repository.
- **Windows sit on half-hour boundaries and are contiguous across restarts**, reaching back seven days at most.
- **Tokens come from the one transcript reader** (ADR 0042), through a new `readWindow`.
- **The switch is a file of its own**, `<storeDir>/usage-log.json`, written by `pilot usage on|off` and read at every tick. Time spent off is never recorded afterwards.
- **Nothing renders the log**: no tab, section, tool or route.

Rejected:
- A scheduled ticket outside the daemon: a second installer and a second process to keep alive.
- An environment variable as the switch: the daemon is spawned detached with the environment of whichever session started it (`deck/client.mjs`), so a variable set later never reaches it.
- A key in `deck.json` as the switch: the command would race the daemon's own writes to that file.
- Off until turned on: most installs would stay unmeasured, which is what the log exists to fix.

**Consequences**:
- The log names repository paths. It stays on the machine and is sent nowhere; `docs/INSTALL.md` says it exists and how to stop it.
- The log has a gap wherever it was off, and a reader of it must not assume contiguity across one.
- The file grows by about 35 MB a year and nothing prunes it.
