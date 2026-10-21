---
status: amended
date: 2026-09-19
tags: [threads, crew]
supersedes: []
superseded_by: [0032, 0041]
paths: []
---
# A decision thread teaches on demand, by hand-off to a teacher agent

The user asked to be forced to understand the architecture, not only to pick from options, and asked for a "Teach me" button on each thread that employs a skill in the spirit of Matt Pocock's `/teach` — so that a question's own prose can stay short and the detail is there for whoever wants it. We decided that the button is a one-click reply of the fixed string `Teach me` through the existing choices mechanism (the path "Walkthrough complete" took), on question and signoff threads only; that the pilot, on receiving it, hands off to a `pilot-teacher` agent briefed with the thread's text and the artefact section and ADR behind the decision, which replies in-thread once through `deck_reply` and never waits, reads or resolves; that a follow-up the user types on that thread reaches the pilot as any reply does and the pilot resumes the same teacher by name; and that the lesson comes from a purpose-built `teaching-a-decision` skill of one bounded reply that borrows `/teach`'s principles by name with attribution, because `/teach` itself is a multi-session workspace built for retention over weeks and a thread wants one answer now. Rejected: a `teach` field written up front on every item (a lesson per question nobody may open, and a wider schema); a dedicated teach tool and thread (double the surfaces for one more message); the pilot writing the lesson (its context is the run's scarcest resource); a teacher that holds the thread (`deck_wait` has no per-thread filter, so a second waiter would swallow other threads' answers and, under ADR 0017, mark them handed over); vendoring `/teach` verbatim with a per-thread workspace (files in the repo per press, the lesson outside the thread).

**Consequences**: a sixth crew agent and its entry in the pilot's Agent list; each press costs one Sonnet spawn; the pilot stays every thread's only reader and closer; and a per-item filter on `deck_wait`/`deck_read` is recorded as a future feature, not built here.
