---
# Superseded in part by deck-polish L10: the status line no longer shows `deck <n>`.
status: amended
date: 2026-09-24
tags: [deck, threads]
supersedes: []
superseded_by: [0033]
paths: [docs/design/deferred-ledger/architecture.md, deck/items.mjs, hooks/lib/deck.js]
---
# The chat is an item, created at registration, and never waiting

The user wanted to talk to the pilot of a repository without a question to answer (spec 4–7 of `docs/design/deferred-ledger/architecture.md`). We decided that a repository's chat is an ordinary deck item of kind `chat` (`KIND_CHAT` in `deck/items.mjs`), one per `repoKey`. The daemon creates it inside `registerRun`'s one write when that repository has none, so a repository gets its chat at its next registration (L5). `isKnownKind` answers true for `chat`, so no Dismiss is drawn or accepted for it. It is deliberately not in `KINDS`, which is what `deck_post` advertises, and `postItem` refuses `kind: chat` with "the deck makes a repository's chat itself" (L4). "Waiting" gets one spelling on the daemon side, `isQueued(item) = isOpen(item) && kind !== chat`. `queueOf` uses it, and so does `registerRun`'s kept-record rule. `isOpen` is unchanged, because the chat *is* open and `deck_read {open:true}` returns it (L6). `resolveItem` and `dismissItem` refuse a chat with "a chat is never closed; answer it with deck_reply" (L7). The Chat bookmark is in the rail under Notifications (first until the user moved Notifications above it at Gate 2) and drawn open. Its panel is a live region holding the thread and a `/reply` form whose Send is a submit named `choice` with no value, so the page's existing reply-in-place sends it with no reload (L9).

Rejected:
- An `isChat` flag on a question: every kind check would have to learn it.
- Adding `chat` to `KINDS`: a pilot could post a second chat.
- Creating the chat on the first message: that needs a new route and a form with no item behind it.
- Creating it on a GET: that is a write on a read.
- Changing `isOpen`: every tab with a chat would stay alive for ever, and every repository would count one waiting item.

**Consequences**:
- The reply path is unchanged, and so are the route, `deck.js`, the MCP tools and their schemas. A chat message wakes a parked `deck_wait` for its own repository and no other, because `deck_wait` already filters by `repo`.
- The queue, a tab's count and Notifications never count the chat, and a chat never keeps an ended run's record alive.
- A repository that has not registered since this change has no chat until it does.
- The hooks side needs its own skip: `isWaiting` and `openThreads` go through one `isChat` in `hooks/lib/deck.js` (S3). Until S3 lands, the status line's count and the hand-off's open-thread ids include the chat.
- On a page that names no deck, the panel is empty and `deck.css` hides the bookmark with `:has(> .panel:empty)`. That also covers an in-place move to the overview.
- A browser whose session already stored `deck.openTabs` before this change keeps its stored list, so Chat starts shut there until it is opened once.
- The store's shape does not change, so `deck.json` stays `STORE_VERSION 1`.
