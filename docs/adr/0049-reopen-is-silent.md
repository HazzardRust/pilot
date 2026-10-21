---
status: accepted
date: 2026-09-30
tags: [deck]
supersedes: []
superseded_by: []
paths: [deck/store.mjs, deck/chain.mjs]
---
# Reopen is silent

Pressing Reopen on a closed thread used to store an ordinary user message, "Reopened.", with a fresh sequence number, so that the state bar, the stop gate and a session parked in `deck_wait` would all read it as the user speaking. On 2026-09-28 that is exactly what happened, and it was wrong: a Reopen reached the pilot as the reply "Reopened.", and the pilot read it as a withdrawn decision. Pressing Reopen is the user making room to say something, not saying it (deck-polish spec 11). So we decided that `reopenItem` in `deck/store.mjs` only reopens: it clears `resolution`, `resolvedAt` and `resolvedBy`, keeps the pilot's closing words as the no-seq "Closed with: …" history line it already wrote, adds no user message and leaves `deck.seq` where it was. The pilot hears about a reopened thread when the user types into it: `addReply` on a closed thread reopens it first, and the reply's own sequence number is what wakes a waiting session.

Rejected:
- Keeping "Reopened." but storing it without a sequence number. It would still read in the thread as something the user said, and as the last user message it would still steer `threadState`.
- An empty-text user message in its place. It carries a seq, so it wakes the pilot exactly as before, with less to read.
- Deleting the `REOPENED` constant. Stores written before this decision hold "Reopened." lines, and `deck/chain.mjs` still filters them out of a ticket's comments.

**Consequences**:
- A reopened thread that nobody has typed into reads "the pilot replied" (its closing words are the last thing said), not "not picked up yet", and is on the queue and in Yours because it is open.
- A reopened thread closed by the user's own Close keeps that "Closed." as its last message; the reopening adds nothing after it. That "Closed." carries the seq it was given at the Close, which woke the pilot then, so a wait whose baseline is past it is not woken again. A stop gate whose baseline predates the Close still reads the thread as the user's, as it did before this decision.
