---
status: amended
date: 2026-09-30
tags: [deck, runs]
supersedes: [0039]
superseded_by: [0084]
paths: [deck/session.mjs, deck/test/no-open.mjs]
---
# A deck starts a visible pilot run when pressed

This supersedes ADR 0039 in part. ADR 0039 said the daemon starts no session, after ADR 0035's headless launcher was ruled out. The user has since asked for "a way to start a session in a deck whose session has ended... a button on the right side, with a confirm step. it should just do 'pilot run' in the respective directory" (start-end-session spec 1, 2). So we decided the daemon may start one kind of session, from one route: a visible `pilot run` in a new terminal window, in a directory that is already a tab, when the user presses Start on that tab and confirms. Everything else in ADR 0039 stands: Create only opens a thread, nothing is bound to a thread, and there is still no headless session anywhere.

- **One fixed command.** `deck/session.mjs` runs `cmd.exe /d /c start "pilot run" "<node>" "<bin/pilot.mjs>" run`, with no shell and the arguments passed verbatim. The directory reaches the child as its working directory only, never on the command line, so nothing in a path can be parsed by `cmd`. A node or package path containing `"` or `%` is refused.
- **Guards on the route.** `POST /start-session` takes only the deck's own page (Origin present and equal to Host), looks the posted directory up among the stored tabs and uses the tab's own spelling, and refuses a tab with a live session (409) or a directory that is no tab (404).
- **A scrubbed environment.** The markers that describe the session which started the daemon (`PARENT_MARKERS` in `deck/session.mjs`: `CLAUDECODE`, `CLAUDE_PROJECT_DIR`, and the `CLAUDE_CODE_*` names for its entrypoint, SSE port, child-session, agent, session id, messaging peer and exec path) are dropped; other `CLAUDE_CODE_*` configuration and `PILOT_DECK_PORT`/`PILOT_DECK_DIR` are kept, so a scratch deck starts sessions that talk to itself.
- **Never under test.** `PILOT_DECK_NO_START`, set by `deck/test/no-open.mjs`, makes `startSession` refuse, and unit tests inject `spawn`.

Rejected:
- Putting the directory in `start /D`, where `cmd` would parse it.
- A headless pty, which is what ADR 0039 removed and the user ruled out.
- A CSRF token held by the page: a cross-site page cannot forge Origin, and a local process can already run anything.

**Consequences**:
- The daemon now starts two kinds of process: the browser opener and, on Start, a terminal window. It still kills none.
- Start is drawn and taken on Windows only.
- A deck on its own port or store starts sessions too, unlike the browser opener, so QA can press Start on a scratch deck.
