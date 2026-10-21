---
status: proposed
date: 2026-10-12
tags: [deck, processes, gates]
supersedes: []
superseded_by: []
paths: [deck/leash.mjs, deck/daemon.mjs, deck/scratch.mjs, deck/wait.mjs, deck/procs.mjs, scripts/gate.mjs, scripts/gate-slots.mjs, docs/design/process-gc/architecture.md]
---
# Every process pilot starts holds a leash, except the user's deck

Every process pilot starts, apart from the user's deck, holds a leash and exits on its own within 10 s once that leash is gone. A leash is a pid plus paths, written on the process's command line as `--leash <pid> [--leash-dir <path>]`. A daemon on any port other than 4321 is leashed to whoever started it. A scratch deck and `pilot wait` are leashed to the session, `CLAUDE_PID`. `pilot ps` and `pilot gc` read the same command lines to find and stop what an older version left behind. Gates take one of two per-user slots, and pilot's own gate runs with a concurrency cap and a heap cap per child.

We chose this because on 2026-10-12 the machine had 13, and later 33, detached daemons that tests and QA runs had started and never stopped. Teardown that lives in each test cannot run when a test file is killed. A leash held by the process itself needs nothing else to be running.

**Consequences**: The user's deck on 4321 is never leashed and never stopped by gc; it exits only by the idle rule of ADR 0136. A reused pid can keep a leashed process alive longer than it should, and `pilot gc` at the next landing is the backstop. Rejected: a supervisor process; Windows Job Objects (no Node API); age-based reaping.
