# Telemetry fixture

A projects root written by hand, nothing copied from a real transcript: session `aaaa…`
under `C--fixture-alpha`, and session `bbbb…` under `C--fixture-beta` with one subagent.

Window W is `[2026-09-01T10:00:00Z, 2026-09-01T10:30:00Z)`.

| Message | Where | First entry | In W | input | cacheWrite5m | cacheWrite1h | cacheRead | output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `msg_a2` | alpha | 09:50 | no, before W | | | | | |
| `msg_a1` | alpha, two entries, outputs 5 and 20 | 10:02 | yes, once, at output 20 | 10 | 100 | 200 | 1000 | 20 |
| `msg_syn` | alpha, `<synthetic>` | 10:05 | never counted | | | | | |
| `msg_a3` | alpha, two entries, the second at 10:30:03 | 10:29:58 | yes, once, at output 9 | 3 | 0 | 0 | 50 | 9 |
| `msg_b1` | beta, no 5m/1h split | 10:15 | yes | 4 | 40 | 0 | 400 | 8 |
| `msg_b2` | beta's subagent | 10:20 | yes | 1 | 0 | 0 | 10 | 1 |
| `msg_b3` | beta | 10:45 | no, the next window | 2 | 0 | 0 | 0 | 3 |

**W's total**: input 18, cacheWrite5m 140, cacheWrite1h 200, cacheRead 1460, output 38.

**The next window** `[10:30, 11:00)`: `msg_b3` alone, input 2, output 3, the rest 0;
`msg_a3` is not counted again.

**W without alpha** (its mtime before W): input 5, cacheWrite5m 40, cacheWrite1h 0,
cacheRead 410, output 9.

Alpha holds one line that is not JSON, so any window that reads alpha skips one line.
