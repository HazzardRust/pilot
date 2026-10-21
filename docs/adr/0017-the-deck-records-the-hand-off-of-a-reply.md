---
status: accepted
date: 2026-09-18
tags: [deck, threads]
supersedes: []
superseded_by: []
paths: []
---
# The deck records the moment a reply is handed to the session, and derives a thread's state from that

The user could not tell, from the home page, whether a reply they had typed had reached the pilot, was being acted on, or had been answered, and they asked for a status they can read at a glance that is "hardcoded, not some call to the agent to update it". We decided that the tool layer writes a `deliveredAt` on a reply at the moment `deck_wait` returns it or `deck_read` returns the item carrying it, because those two paths are where the deck actually hands text to a session and so are the only fact about the pilot's attention the deck can honestly know; the write is skipped when every reply handed over is already marked, so a polling `deck_read` does not touch the store, and it announces a change so the bar moves live. A thread's state is then derived, never declared: posted, answered and not yet picked up, the pilot has it, the pilot replied, resolved. Rejected: deriving the state from message order alone, which needs no stored field but cannot tell "not picked up" from "picked up and thinking", which is exactly the distinction the user named; and a tool for the agent to set a status, which is the thing the user ruled out.

**Consequences**: a reply carries one more field and the store is written from two read paths that were pure before; "the pilot has it" means the reply reached the session, not that the model read it, so a session that fetched a reply and died shows "has it" until the thread is resolved.
