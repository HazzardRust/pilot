---
status: accepted
date: 2026-10-07
tags: [threads]
supersedes: []
superseded_by: []
paths: [hooks/lib/deck.js, docs/design/user-thread-listener/architecture.md]
---
# An unanswered thread is said until it is answered

The inbox lane quoted a reply once and told the pilot "you will not be shown it again". A pilot deep in a slice read past that notice, or compacted it away, and kept making tool calls with the user's answer sitting on the deck. The Stop gate caught it only at the end of the turn, which could be an hour of work built on the question the user had already answered. So we decided that every tool use carries one short line naming each unanswered thread, until the pilot answers it with `deck_reply` or closes it with `deck_resolve`. This supersedes the inbox lane's "delivered once" (slice 5).

- **One rule, in `hooks/lib/deck.js`.** `unanswered(items, posted, baseline, repo)` is the Stop gate's old `answered` filter, moved: open, the pilot's (no owner reads as the pilot's, ADR 0041), the user spoke last after the session's baseline, and a thread the session posted skips the baseline. The gate and the inbox lane both call it, so the repeat lasts exactly as long as the gate would hold.
- **The words are said once (A1).** The first tool use after a reply quotes it in full, as before. Each repeat is `SYSTEM NOTICE: still unanswered on the deck: <id> "<title>"[, …]` and one instruction, about 25 tokens a thread. A thread quoted in full by the same call, or by a parallel copy of the hook, is not also repeated.
- **The repeat reads `deck_read {open: true, limit: 20}` without `repo` (L5).** A read naming a repository marks its replies delivered, which is the wait's job.
- **A failed read says nothing more.** The full notice, if there is one, still goes; the repeat is dropped for that call.

Rejected:
- Repeating the full reply text: up to 16k characters on every tool use.
- A second filter in the inbox lane: it would drift from the gate's, and the repeat would stop while the gate still held, or the reverse.
- A claim file per repeat: the deck's own state (the pilot's reply, the close) is what ends it.

**Consequences**:
- Every tool use of a pilot session on the deck makes one more loopback read.
- A thread the user answered and the pilot is deliberately leaving open is named on every tool use until it replies on it.

Recorded in `docs/design/user-thread-listener/architecture.md` (§2 spec 4; §5 L4, L5, L7 as 0072; A1).
