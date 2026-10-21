---
status: superseded
date: 2026-10-05
tags: [gates, runs]
supersedes: [0050]
superseded_by: [0088]
paths: [deck/session.mjs]
---
# A gate1 Sign off starts the sub-deck

This amends ADR 0050. ADR 0050 let the daemon start one kind of session from one press: a visible `pilot run` when the user presses Start on an ended tab. The pilot branch adds a sub-deck that implements the yellow queue (pilot-branch spec 11, L9), and the user asked for it to start on its own when they sign a plan: "A visible window, started on Sign off" (itm_ff64f4002ed1, 2026-10-05). So we decided the daemon may start one more session, on one more event, with one more argument. Everything else in ADR 0050 stands.

- **One more event.** When the pilot resolves a gate1 the user signed, and its ticket is now yellow, the daemon starts the sub-deck in the ticket's directory, the main deck's checkout. The user's Sign off press alone starts nothing: that is a reply, and the ticket turns yellow only when the pilot closes the gate on it (ticket-states L3).
- **One more argument.** `deck/session.mjs` runs `cmd.exe /d /c start "pilot sub-deck" "<node>" "<bin/pilot.mjs>" run --sub`. Every ADR 0050 guard holds: Windows only, `PILOT_DECK_NO_START`, no `"` or `%` in the two paths on the line, the directory as `cwd` only, and the parent session's markers dropped.
- **No flag of its own.** The permission mode and allowlist are `pilot run --sub`'s (ADR 0086), never this command line's.
- **One at a time.** A start is refused while the main deck has a live sub-deck run (S6's 409) or a sub start for it is still within ADR 0050's sixty-second latch, kept apart from Start's.
- **A refusal never fails the sign-off.** The gate is closed and the ticket yellow in the store's write before the start is tried. A refusal is one line on the daemon's stderr and one sentence in the pilot's `deck_resolve` answer.

Rejected:
- Starting on the press itself: the ticket is still green then, so the sub-deck would find no yellow work and exit.
- A headless pty: ADR 0039, the user's own word.

**Consequences**:
- The daemon now starts a session on an event that is not Start. It still kills none.
- A yellow ticket signed while a sub-deck is live waits for that sub-deck to take it, and on any platform but Windows it waits for a sub-deck started by hand.
- A scratch deck starts sub-decks too, so QA signs a gate1 on one to see the window open.
