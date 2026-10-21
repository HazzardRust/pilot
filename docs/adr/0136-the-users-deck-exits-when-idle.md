---
status: proposed
date: 2026-10-12
tags: [deck, processes]
supersedes: [0005]
superseded_by: []
paths: [deck/idle.mjs, deck/daemon.mjs, deck/landing.mjs, docs/design/process-gc/architecture.md]
---
# The user's deck exits after 10 idle minutes

This supersedes the "long-lived" clause of ADR 0005. It keeps the rest: one deck per machine, on 4321, started by the first session that needs it.

We decided that the user's deck exits on its own once 10 minutes pass with all three of these holding:

- no `claude` process in the process table,
- no landing running in the daemon,
- no HTTP request, from a browser or a session.

While any one of them is live, it stays. The next session starts it again. Every other daemon holds a leash instead (ADR 0135).

The user locked this on itm_3eaa4a08b811 (2026-10-12), reasoning that "it starts up like instantly". The recommended default was never to stop it, and it was overridden: a shared process has no single parent, and an idle rule with the three conditions keeps landings and tab reads safe.

**Consequences**: the deck reads the process table only when the other two conditions already hold, so an active deck spawns no reader. A tab left open keeps the deck up through its polling. A deck that was closed loses only its in-memory roster (ADR 0024), which sessions rebuild. Rejected: leashing it to one session, which would kill it under the others.
