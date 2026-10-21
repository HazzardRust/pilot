---
status: accepted
date: 2026-10-09
tags: [deck, threads]
supersedes: []
superseded_by: []
paths: [deck/store.mjs, deck/tools.mjs, docs/design/user-threads-open/architecture.md]
---
# A user thread is closed only by the user

We decided an agent's `deck_resolve` on a thread the user opened is refused, and the user's Close is the only close.

## Context

A thread of kind `user` is one the user opened, with Create or a ticket's `Add`. The pilot closed such
threads with `deck_resolve` once it judged them answered, and the user lost threads they had not
finished with (itm_042ab542360d). The chat already refuses a close; a user thread did not.

## Decision

`resolveItem` refuses kind `user` beside the chat's refusal, for every writer kind and an unstamped
call alike, with one `DeckRefusal`: "item X is a thread the user opened: the user closes it from its
page; answer it with deck_reply". The thread stays open and queued. The user's Close (`closeItem`) is
unchanged and is the only way one closes; Reopen and the user's own Remove of a deck tab stay.
The `deck_resolve` tool description says the same.

## Rejected

- *A prompt-only rule*: the incident was the pilot following its prompt.
- *A silent keep-open*: it would report a close that did not happen (itm_36b3537b21b0).
- *A new error class or code*: nothing branches on it.

## Consequences

An agent that still tries spends one refused call and is told the next move. A user thread an agent
has answered stays in the queue until the user presses Close.
