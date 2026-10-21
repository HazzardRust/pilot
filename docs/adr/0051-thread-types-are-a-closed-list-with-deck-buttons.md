---
# Superseded in part by ADR 0057: its L5 (a gate is a field, not a kind) is replaced by the kinds `gate1` and `gate2`, and the `gate` tag is retired.
status: amended
date: 2026-10-01
tags: [threads]
supersedes: []
superseded_by: [0053, 0057]
paths: [deck/items.mjs, deck/testUtils.mjs]
---
# Thread types are a closed list with deck buttons

This supersedes the open-kind half of A11 (pilot-package). A11 made an item's kind an open string so a hook could post a `handoff` before the deck knew one, and every later kind was storable without a change to the vocabulary. The deck now knows every kind an agent posts, and the user asked for one list of thread types, each with its own controls, rather than an unknown kind rendering as "close or reply" (thread-types-phase spec 1-3). So we decided the kind is the thread type, the types are a closed list at post, and a type's fixed buttons are written by the deck.

- **The kind is the type (L1).** `POSTABLE_KINDS` in `deck/items.mjs` is question, walkthrough, signoff, spec, report, ticket, audit, handoff and crew-handoff. `postItem` refuses any other kind with `kind must be one of <the nine>, not "<kind>"`, after its own `chat` and `user` refusals and after `KIND_SHAPE`, so a refusal never echoes a paragraph. `deck_post`'s `kind` is `enum: POSTABLE_KINDS`.
- **Deck buttons are `options`, stored at post inside `postItem` (L2).** Reply, `chosenOf`, `pilot wait` and the Stop hook read `options` already, and the chain's handoff, which bypasses `deck_post`, gets its button by the same path.
- **A posting rule, not a storage rule (L3).** An item already stored under any kind still reads, renders generically and dismisses, as A11 said. Nothing migrates or deletes one. Tests seed such an item through the store file (`postStored` in `deck/testUtils.mjs`), never through `postItem`.
- **Handoffs are known but never decidable (L4).** `handoff` and `crew-handoff` are in `SPECS` and `POSTABLE_KINDS` and stay out of `KINDS`, which full auto reads, so full auto never closes a handoff before the fresh session's `pickup` sees it.
- **A gate is a field, not a kind (L5).** `signoff` takes `gate: "1" | "2"` and `walkthrough` takes `gate: "2"`, validated like `size`. A wizard's closing sign-off carries none.

Rejected:
- A `type` field beside `kind`: two words for one idea across every reader of an item.
- Rendering buttons from the type table at read time: reply validation and `chosenOf` would need a second source.
- Migrating or deleting stored unknown-kind items.
- Adding the handoffs to `KINDS`: full auto would close one at post.
- `gate-1` / `gate-2` kinds: they would rewrite `GATED_KINDS`, full auto, the Stop hook and every existing sign-off.

**Consequences**:
- A new kind of thread is a change to `POSTABLE_KINDS` and `SPECS`, and its tests; a hook or agent can no longer invent one at post.
- An agent that posts a kind outside the list is told the nine at once, by the refusal and by `deck_post`'s schema.
- Dismiss survives only for unknown kinds already stored, which no new post can create.
