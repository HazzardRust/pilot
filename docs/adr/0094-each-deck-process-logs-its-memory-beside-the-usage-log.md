---
status: accepted
date: 2026-10-07
tags: [deck, logging]
supersedes: []
superseded_by: []
paths: [docs/design/user-thread-listener/architecture.md, deck/memory.mjs, deck/store.mjs]
---
# Each deck process logs its memory beside the usage log

The listener (`pilot wait`), the deck daemon and the deck's tool client run for hours, and nothing recorded how much memory they held or how much the machine had left. A process cannot read another's memory without a native call, so each one has to measure itself. We decided each of the three logs its own reading to `<store>/memory.jsonl`, and `pilot analytics <slug>` prints the peak per process inside the run's span (`docs/design/user-thread-listener/architecture.md`, L10 to L12, A5, A6).

- **One module, `deck/memory.mjs`.** `startMemoryLog(name)` writes a `start` line, a `tick` every 10 minutes on an unref'd timer, and one `exit` on a normal exit, Ctrl-C or SIGTERM. A line is `{at, process, pid, event, rss, free}`, in bytes.
- **Called from each `main` only**, never from `wait()` or `startDaemon()`, the same seam as the usage log, so no test process writes a reading.
- **Its own file, not `usage.jsonl`**: the usage log's resume takes any last line without `window.to` as torn, and `audit-spend` reads that file.
- **Under the one logging switch** (ADR 0095), re-read before every reading, so `pilot logging off` reaches a running process at its next reading.
- **Analytics counts every reading on the machine** inside the run's span (`readRun` gains `span`): the daemon has no repository, and free memory is a machine figure.
- **The client still never loads the item store**: the store directory is read from a module of its own, so the stdio client's module graph stays free of `deck/store.mjs` (L3).

Rejected:
- A sampler in the daemon that polls the others: it cannot see another process's memory.
- Readings in `usage.jsonl`: they would break its resume.
- A 1-minute tick for `pilot wait`: about ten times the lines, for a staleness bound only a hard kill needs.

**Consequences:**
- A hard-killed process (the harness's background stop on Windows) has its last `tick`, at most 10 minutes old, as its last line.
- `memory.jsonl` grows without rotation, about six lines an hour per long-running process.
