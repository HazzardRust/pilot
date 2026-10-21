---
status: accepted
date: 2026-10-12
tags: [deck, read, context]
supersedes: []
superseded_by: []
paths: [deck/read.mjs, deck/tools.mjs, deck/server-tools.mjs, agents/pilot.md, agents/pilot-qa.md, skills/grilling/SKILL.md, docs/design/session-row/architecture.md]
---
# A thread read is windowed

We decided that `deck_read` takes `messages`, a window over each thread it returns (`N` the last N, `-N` the first N, `"all"` the whole), defaulting to the whole thread under 5 messages and the last 5 otherwise, and that every place an agent is told to read a thread names the window it wants.

## Context

A `deck_read` of the chat came back at 1,334 lines and overflowed Claude Code's tool-result cap. The user asked for agents to call only the messages they need, with the whole thread as the default under 5 messages and the last 5 otherwise.

## Decision

- The post is message 1, then the replies (L3). A windowed item carries `window: { shown, total, left }` and drops `body` when the post is outside it; title, kind, state and owner always stay (L4).
- The window applies to every full read, not only a read by id; a `brief` read is unchanged. `messages` is validated in the daemon: a nonzero integer or `"all"` (L9).
- Only the messages a read shows are handed over; a reply windowed out stays untaken, so `pilot wait` still delivers it (L5).
- The deck's own code readers (the hooks, `pilot` status) pass `messages: "all"` explicitly, so the default protects agents' context and never hides a gate reply from code (L6). The rule lives once, in `deck/read.mjs`.
- The pilot's first-turn and step 6 reads, QA's walkthrough read and the grilling skill's answer read each name `messages: <n>`.

## Rejected

- *Replies only*: the user's word was messages, and a 1-message window must not be empty on a fresh question.
- *Hand off every message of a returned item*: the page would say the pilot has a reply no agent read.
- *A whole-thread default on HTTP with the window applied in the MCP client*: two defaults for one tool.
- *A byte cap on reads*: out of scope; the window is what the user asked for.
