# Measurements: the first turn after a hand-off, beside a cold start's

Spec line 1 (S1), read from the transcripts already on disk (A3): the newest 36 top-level transcripts of this
repository, all there were under the default limit of 40.

- Command: `node scripts/audit-session-start.mjs C:/Users/Hazzard/Projects/pilot --first-turn`
- Date: 2026-11-19T05:09Z, Claude Code 2.1.328, on `slice/handoff-cache-s1`.

| kind | n | input | cacheRead | cacheWrite5m | cacheWrite1h | cachedShare | medianGapMs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| after-handoff | 27 | 2 | 24419 | 0 | 15869 | 0.6 | - |
| cold | 7 | 2 | 0 | 0 | 36363 | 0 | - |

Each count is the median first turn of its kind; `cachedShare` is the median of each turn's cache read over its
whole input. `after-handoff` is a fresh context opened by a clear that picked up a hand-off; `cold` is a file's first
context, neither cleared nor picked up.

**Did `/clear` start a new file?** Yes, every time in this sample: of 36 files none held a clear after its first turn,
so each holds one segment, and every one of the 27 hand-offs opens its own file. That is why `medianGapMs` is empty:
the gap is measured within a file, and no hand-off has the context before it in the same file. Two segments had no
first turn yet and are not counted.
