---
status: amended
date: 2026-09-27
tags: [threads]
supersedes: [0020]
superseded_by: [0045, 0046, 0053]
paths: [docs/design/thread-ownership/architecture.md]
---
# A thread has one owner kind

This amends ADR 0020, whose consequence "the pilot stays every thread's only reader and closer" no longer holds, and builds on ADR 0027 (the stamped author) and ADR 0039 (every run on a repository hears every thread of it). Since 0039 every wait of a session heard every reply of its repository, so one user reply on QA's walkthrough woke QA and the pilot both, and two answers appeared. So we decided that every item has one **owner**, an agent kind, and a user reply is handed to its thread's owner and to no other agent (`docs/design/thread-ownership/architecture.md`, spec 1 and 2).

- **Owners are kinds, never agent ids (A1).** `OWNER_KINDS = ['pilot', 'qa']`, the two kinds that hold `deck_wait`. `postItem` stores `owner` from the stamped author: QA's own post is QA's, anyone else's the pilot's. A chat and a created thread are always the pilot's.
- **An old item's owner is derived on read (A2).** `ownerOf(item)` is `owner`, else the item's author kind if that is an owner kind, else `pilot`. Nothing is migrated and `STORE_VERSION` stays 1.
- **The daemon decides who hears.** `deck-author.js` now stamps `deck_read` and `deck_wait` as well, and `runTool` composes `ownerFilter(kind)` beside the repository join, re-reading the deck per reply. A parked wait settles only on a reply it hears; its seq still counts the whole deck.
- **A wait with no author is the pilot's (A8).** The inbox and Stop hooks call over HTTP unstamped and only run for the pilot. A stamped kind that owns no thread is refused a wait, never quietly made the pilot.
- **One cursor per kind.** The stdio client serves every agent of a session in one process (ADR 0027), so `cursor` and `handed` are keyed by owner kind; a QA wait moving past a pilot reply would otherwise carry the pilot's wait past it.
- **A pass is `deck_reply` with `to` (A3)**, and **agents only pass (L3)**: there is no reassign control on the deck. The pilot may take any thread back (A4).
- **A reply waits for its owner, and a busy owner keeps its thread (L6, L7; L4 superseded).** The pilot takes the thread, and is handed the reply, when it has sat unclaimed for `OWNER_PICK_UP_MS` (30 s), or when the owner picked it up and has not answered on the thread in `OWNER_ANSWER_MS` (5 min) since; either way only once the owner kind has made no tool call and held no wait for the roster's `LIVE_WINDOW_MS` (90 s). The mechanism is A7's per-kind `lastActive`, the waits each kind holds, and a timer in the pilot's parked wait.
- **A reply is handed to at most one kind (A9)**, recorded as `deliveredTo`; the two exceptions are the walkthrough's Sign off, handed to the pilot too as Gate 2 (L2), and a reply its owner picked up and left unanswered (L7), each recorded as both kinds.

Rejected:
- Agent ids as owners: an id dies with its agent and would orphan the thread on every hand-off.
- A filter in the client alone: the daemon is what hands a reply over and records it, so it is where the choice is made.
- A migration pass writing `owner` onto every stored item: the read already gives the value.
- A reassign control on the thread page (L3).

**Consequences**:
- ADR 0020 is amended: the pilot is no longer every thread's only reader; QA reads and answers its own walkthrough, and the teacher still writes on the pilot's threads as a helper.
- Two QAs in one session would share the `qa` cursor; at most one live QA per session is stated as an invariant (A10), not engineered around.
- Two pilot sessions on one repository still both hear its pilot-owned threads, as under ADR 0039.
