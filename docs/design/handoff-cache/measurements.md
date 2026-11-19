# Measurements: the first turn after a hand-off, beside a cold start's

Spec line 1 (S1, re-run by S12), read from the transcripts already on disk (A3): the newest 38 top-level transcripts
of this repository, all there were under the default limit of 40.

- Command: `node scripts/audit-session-start.mjs C:/Users/Hazzard/Projects/pilot --first-turn`
- Date: 2026-11-19, Claude Code 2.1.328, on `slice/handoff-cache-s12`.

| kind | n | input | cacheRead | cacheWrite5m | cacheWrite1h | cachedShare | medianGapMs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| after-handoff | 29 | 2 | 24419 | 0 | 15865 | 0.61 | 5085 |
| cold | 7 | 2 | 0 | 0 | 36363 | 0 | 95034 |

unreadable: 0 of 38 transcripts

Each count is the median first turn of its kind; `cachedShare` is the median of each turn's cache read over its
whole input. `after-handoff` is a fresh context opened by a clear that picked up a hand-off; `cold` is a file's first
context, neither cleared nor picked up.

**Did `/clear` start a new file?** Yes, every time in this sample: no file held a clear after its first turn, so each
hand-off opens its own file. The gap is therefore measured across files (S12): from the last entry of the newest other
transcript of this project directory that ended by the first turn, to that turn. The median hand-off's first turn
came 5.1 s after the session before it ended, well inside the 5-minute cache lifetime.
A cold start's gap is the idle time since the last session ended. Segments with no first turn yet are not counted.

The S1 run (2026-11-19T05:09Z, 36 transcripts) read 27 after-handoff and 7 cold turns, 15,869 written at 1h and a
share of 0.6, with `medianGapMs` empty because the gap was then measured within a file only.
