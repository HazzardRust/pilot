---
area: open
owner: auditor
spec: [15]
---

# Open: what no named area covers

Read last, after every other area file (`agents/pilot-auditor.md` orders it that way): whatever else the auditor
met in this repository that makes an agent slow, expensive or error-prone, and that no named area's rows already
cover. A finding that belongs to setup, loops, preview, navigability, context, tooling or rederived goes there instead of
here, never duplicated in this one.

## Measure

Anything met while measuring the named areas, or noticed along the way, that fits the bound above: slow,
expensive or error-prone for an agent working in this repository, and not already a row in a named area. Never the
system in general — product, architecture or security improvements are out of scope here, offered as their own
run instead — and never the pilot's own prompts, which `measure-prompt` and `context-budget` already cover. Each
candidate is reproduced by a command in the scratch worktree, under a timeout, before it is reported; a candidate
that cannot be reproduced this way goes to `unmeasured`, never a row.

## Rows

One row per finding, in S1's Row shape, `area` always `'open'`. `validateReport` refuses an eleventh open row past
the ten `MAX_OPEN_ROWS` allows, so the auditor keeps only the ten with the highest L6 score — `(minutes +
tokens/1000) per run ÷ effort weight` — and drops the rest itself, the auditor choosing which ten.
