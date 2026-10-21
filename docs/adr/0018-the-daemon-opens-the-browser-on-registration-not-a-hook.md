---
status: accepted
date: 2026-09-18
tags: [deck]
supersedes: []
superseded_by: []
paths: []
---
# The daemon opens the browser when a run registers and nobody is watching, not a session hook

The user asked for "a hook that opens up the browser tab for the deck if it isn't already open". A `SessionStart` hook is the obvious shape and the wrong one: it fires for every Claude Code session on the machine, piloted or not, so it would open a deck on sessions that have nothing to do with it, and a hook cannot know whether a deck page is already open. We decided the daemon does it, on `POST /api/runs`, which is the one request only a plugin-enabled session makes, and only when its count of connected browsers is zero; `PILOT_DECK_NO_OPEN=1` turns it off, and tests and QA copies always set it. That required splitting `watcherCount()`, which counted parked `deck_wait` calls alongside browsers and so would have read "someone is watching" when only an agent was waiting. Rejected: opening only when the deck also has an item waiting on the user, which is quieter but misses the case of wanting to watch a run that has asked nothing yet; and opening from any route other than registration.

**Consequences**: a second session in the same repository gets no tab while the first one's is open, which is the intended reading of "if it isn't already open"; the daemon shells out to the platform's opener with a constant URL and nothing else; and the browser/waiter distinction is now a pinned property of the server rather than an accident of one counter.
