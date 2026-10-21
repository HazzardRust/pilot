---
status: accepted
date: 2026-10-10
tags: [deck, gates]
supersedes: []
superseded_by: []
paths: [deck/items.mjs, deck/store-items.mjs, docs/design/gate-stays-signed/architecture.md]
---
# A gate reads its newest press, and typed text never withdraws one

On gate2 `itm_0a0c97923957` the user pressed Sign off, the deck landed the feature on `pilot`, and four minutes later they typed "added the rule" into the same thread; `chosenOf` read the newest user message, found no option in it, and the gate was unsigned again, so the pilot could neither re-press (the landing refused it) nor `deck_resolve` it. We decided that on a gate (gate1, gate2) `chosenOf` reads the newest user message *that is a press* of one of its options, so a typed reply after Sign off leaves the gate signed and is a comment for the pilot; the newest press still wins, so a Not yet pressed after Sign off withdraws it while the gate has not started landing; and every press on a gate2 whose own landing is `running` or `landed` is refused with that landing's line, since a Not yet there would un-sign a feature already on `pilot`. We rejected a stored `signedAt` field, a second source of truth beside the reply with a migration story, when the press is already a stored reply and reading it back fixes all twelve callers at once; hiding the reply box after the press, which takes away the one channel the user has to tell the pilot something on the thread; "first Sign off is final", which leaves a mis-press only Dismiss and a fresh gate as a way back; and widening the change to every `GATED_KINDS` kind, because on a question a typed answer after a press really is a new answer and the tests pin it.

**Consequences**: a question, lesson, signoff, handoff or audit thread keeps today's reading, where typed text after a press chooses nothing; and a gate is only ever read back from its replies, never from a field.

Recorded in `docs/design/gate-stays-signed/architecture.md` (§2 spec 1-3, 5; §5 L1-L5).
