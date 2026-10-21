---
status: accepted
date: 2026-09-29
tags: [threads, hooks]
supersedes: [0041]
superseded_by: []
paths: []
---
# Every path that hands the pilot replies runs the owner fallback

This amends ADR 0041. That ADR already gave thread ownership a fallback (L6, L7): the pilot takes a QA thread, and is handed the reply, once the reply has sat unclaimed for `OWNER_PICK_UP_MS` (30 s) or sat picked up and unanswered for `OWNER_ANSWER_MS` (5 min), and QA has been quiet for `LIVE_WINDOW_MS` (90 s). But only a pilot-kind `deck_wait` naming its repository ran it: the MCP `deck_wait`, and the inbox hook on each of the pilot's tool calls. On 2026-09-29 the user replied "4390 is not up" on the walkthrough of a QA agent that had ended with the previous session. The pilot was idle on `pilot wait`, which polls `deck_read` with no repository and skips `owner === 'qa'`, so nothing ran the fallback. The reply stayed undelivered until the pilot took the thread by hand. So we decided that every path that hands the pilot replies runs the same fallback, with the same numbers.

- **`pilot wait` and the Stop hook ask for the fallback on every poll.** Each makes one `deck_wait` naming its repository, with `since` past every reply (`FALLBACK_ONLY`, `Number.MAX_SAFE_INTEGER`) and a 1 ms timeout. That call returns only the replies the fallback has just handed to the pilot, never the cursor's, so neither path marks an ordinary reply delivered before a turn reads it. The `pilot wait` poll, every 2 s, is what wakes an idle pilot: no store write is needed to wake it.
- **The pilot's `deck_read` of its run claims the fallback first**, so the thread is shown as the pilot's and its reply is handed over with the read.
- **A reply handed over this way says so.** The daemon puts a `fallback` sentence on it (on the item, for `deck_read`) naming the owner kind that did not pick it up. That sentence tells the pilot to answer the reply or pass the thread back with `deck_reply` and `to`. Every path prints it as given, so the wording lives in one place.
- **Nothing else moves.** The windows, the roster's quiet rule, `fallBack`'s one write and `deliveredTo` are ADR 0041's. No tool's schema or description changes. The pilot's own threads never fall back.

Rejected:
- Reclaiming orphaned threads only at session start. The pilot definition is getting that separately, but it does nothing for a pilot that is already running when the owner ends.
- Handing every QA reply to both kinds. That is two answers to one reply, which is the problem ADR 0041 exists to prevent.
- A new five-minute window, or an environment override of the windows. The user set 30 s and 5 min at Gate 2 (L6, L7), and `items.mjs` says there is no override.
- A daemon-wide timer sweeping for orphans. It would hand a reply to "the pilot" while no pilot is listening, and the next pilot's cursor would already be past it.

**Consequences**:
- `pilot wait` now names its repository on one call per poll, and that call holds the pilot kind active for its 1 ms, as any pilot wait does.
- A reply that falls back while no pilot path is polling waits for the next poll, tool call or turn end. That is the same exposure as any other reply.
