---
# Supersedes the switch decision of ADR 0043; the usage log it describes stands.
status: accepted
date: 2026-10-07
tags: [deck, logging]
supersedes: [0043]
superseded_by: []
paths: [docs/design/user-thread-listener/architecture.md, deck/usage-switch.mjs]
---
# One logging switch governs every log the deck keeps

The usage log had its own switch, `pilot usage on|off|status`, and the deck is about to keep a second log (its processes' memory). A switch per log would leave the user with two commands for one wish, and ignoring the switch for the new log would make "off" a lie. The user asked for "general logging that does all the stuff", defaulting to on. So we decided `pilot logging on|off|status` is the one switch and every log the deck keeps reads it (`docs/design/user-thread-listener/architecture.md`, L12, L14 to L16).

- **`pilot logging on|off|status`** replaces `pilot usage`. `status` prints `logging on|off, <store dir>`; a bad word prints `usage: pilot logging on|off|status` and exits 2.
- **`pilot usage`, with any words, only points the way**: `pilot usage is now pilot logging on|off|status` on stderr, exit 2, no state change. No alias, at the user's choice.
- **The daemon's first line** is `[deck] logging on, <store dir>` or `[deck] logging off (pilot logging on)`.
- **The switch file keeps its name.** `usage-log.json`, `deck/usage-switch.mjs` and its exports are unchanged, so an `off` set before the rename is still off, with no migration and no precedence rule. Only what the user sees is renamed.

Rejected:
- An alias that keeps `pilot usage` working: the user chose a clean rename, and the pointer says where it went.
- A new `logging.json` that falls back to the old file: two files and a precedence rule forever.
- Renaming the module and its exports: about six files of churn with no behaviour change.

**Consequences:**
- Anyone who had switched usage off stays off for every log, including ones that did not exist when they did.
- A script that ran `pilot usage off` now gets exit 2 and the pointer, loudly, instead of silently doing nothing.
