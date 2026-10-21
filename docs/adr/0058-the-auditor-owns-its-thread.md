---
status: accepted
date: 2026-10-01
tags: [crew, threads]
supersedes: []
superseded_by: []
paths: [docs/design/thread-kinds/architecture.md]
---
# The auditor owns its audit thread and posts the picked tickets

This extends ADR 0053's teacher precedent (an owner kind owns the threads it posts itself) and relies on ADR 0045's owner fallback. The audit item was posted by the session running the skill, not by the auditor, which had no deck tools and was gone the moment the item posted, so a reply typed on it had nobody to answer it (thread-kinds spec 4-6, F3). The user asked for the auditor to stay alive and hold the thread as QA holds one. So we decided `auditor` is an owner kind.

- **`auditor` joins `OWNER_KINDS` and `AUTHOR_KINDS` (L3).** By the A1 rule an owner kind's own post is its own, so the auditor posts the audit item itself and owns it; the daemon hands a reply on it to the auditor's `deck_wait` alone. `PASS_KINDS` is unchanged, so the `to` enum of `deck_reply` gains no value for one item; the pilot takes a thread back with `to: "pilot"`. The fallback note names the owner kind, not QA, and offers the pilot a pass back only to a kind in `PASS_KINDS`: an auditor's thread that fell back stays the pilot's.
- **The auditor posts the picked tickets and resolves the item (L14, spec 6).** The tickets carry the auditor as author, and the item resolves listing their ids.
- **The auditor stays parked on `deck_wait` until its item resolves or its parent session ends (L16).** Then the owner fallback of ADR 0045 hands the thread to the pilot after its windows (spec 5).
- **The skill keeps both git snapshots.** The auditor messages the skill's session when it has measured, and posts once the session has handed it the diff lines: the snapshot proves the auditor left the repository as found, so the auditor cannot take it. The skill also keeps `audit save`, and hands the auditor `{ deck, report, differs }`: the `.deck.md` path, the JSON path and the lines that differ, which the auditor puts at the top of the item. The report's `tokens` stays null, because the auditor is still at work when it is saved; `minutes` is the wall time to the auditor's `measured:` message.

Rejected:
- A pass to `auditor` (a new `to` value for one item): the schema grows for a thread only the auditor posts.
- The pilot posting the picked tickets: it needs a pilot session still waiting on the thread.
- An idle timeout that frees the auditor's slot sooner: the user chose to keep it parked and let the fallback cover its absence.
- The auditor taking the git snapshots itself: it would be proving its own cleanliness.

**Consequences**:
- The auditor definition gains `deck_post`, `deck_wait`, `deck_reply` and `deck_resolve`, and still no `deck_read`; and `Write`, for the pick's text, which reaches `audit pick` through a scratchpad file and never a shell line.
- An auditor kept parked holds a slot while the user reads the item; it returns its report once the item resolves.
- A ticket the auditor posts is authored by it and owned by the pilot, as every ticket is: the chain takes a ticket and `deck_resolve` closes one as the pilot, so an auditor-owned ticket could be neither taken nor closed.
- Two live auditors in one session would share the `auditor` cursor, as two QAs share `qa` (ADR 0053 A10).

Recorded in `docs/design/thread-kinds/architecture.md` (§5 L3, L14, L16); deck threads itm_2939b20603c7, itm_bb888fca7c61.
