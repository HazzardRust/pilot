---
status: amended
date: 2026-09-13
tags: [deck]
supersedes: []
superseded_by: [0136, 0164]
paths: []
---
# One deck process per machine, on a fixed loopback port

Several pilot sessions on several repositories are the normal state, so the deck is one long-lived process per machine at `127.0.0.1:4321`, serving stdio MCP to every session and one browser tab over one store, with the daemon as the only writer. One process per run would mean one URL per run and bring the pile-up back. The port was moved off 4317 because that is the OpenTelemetry collector's default.

**Consequences**: something must start it; the first session that needs it spawns it detached, which is the fiddliest part of the package on Windows. No authentication: anything on the machine can read the deck, so threads never carry credentials and the store refuses token-shaped values.
